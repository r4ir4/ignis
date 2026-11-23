"""Books: a shelf (reading, to read, finished, dropped), a log of the pages read each day and an optional cover picture per book.

Days are plain local dates (YYYY-MM-DD) sent by the client, so nothing here needs to know a time zone.
"""
import base64
import re
import uuid
from datetime import date, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from pydantic import BaseModel, Field

from . import db
from .auth import caller

router = APIRouter(prefix="/v1/books", tags=["books"])

STATUS_PATTERN = "^(reading|to_read|finished|dropped)$"
# every column except the picture itself, plus a flag: lists never carry the image bytes
COLS = ("id, title, author, pages, status, current_page, rating, started_on, finished_on, favorite, notes, created_at, updated_at, "
        "(cover IS NOT NULL) AS has_cover")
MAX_COVER = 400_000  # bytes after decoding; the page sends a ~240px JPEG, normally 15-40 KB
_DATA_URL = re.compile(r"^data:(image/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=\s]+)$")


def init_tables() -> None:
    with db.connect() as conn:
        conn.execute(
            """CREATE TABLE IF NOT EXISTS books (
                   id TEXT PRIMARY KEY, title TEXT NOT NULL, author TEXT, pages INTEGER,
                   status TEXT NOT NULL DEFAULT 'to_read', current_page INTEGER NOT NULL DEFAULT 0,
                   rating INTEGER, started_on TEXT, finished_on TEXT, favorite INTEGER NOT NULL DEFAULT 0,
                   notes TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)"""
        )
        conn.execute(
            """CREATE TABLE IF NOT EXISTS book_logs (
                   id TEXT PRIMARY KEY, book_id TEXT NOT NULL REFERENCES books (id) ON DELETE CASCADE,
                   day TEXT NOT NULL, pages INTEGER NOT NULL, created_at TEXT NOT NULL)"""
        )
        conn.execute("CREATE INDEX IF NOT EXISTS book_logs_day ON book_logs (day)")
        have = {r[1] for r in conn.execute("PRAGMA table_info(books)")}
        if "cover" not in have:
            conn.execute("ALTER TABLE books ADD COLUMN cover BLOB")
        if "cover_type" not in have:
            conn.execute("ALTER TABLE books ADD COLUMN cover_type TEXT")


class BookIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    author: Optional[str] = Field(None, max_length=120)
    pages: Optional[int] = Field(None, ge=1, le=20000)
    status: str = Field("to_read", pattern=STATUS_PATTERN)
    current_page: int = Field(0, ge=0, le=20000)
    rating: Optional[int] = Field(None, ge=1, le=5)
    notes: Optional[str] = Field(None, max_length=1000)
    favorite: bool = False


class BookPatch(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=200)
    author: Optional[str] = Field(None, max_length=120)
    pages: Optional[int] = Field(None, ge=1, le=20000)
    status: Optional[str] = Field(None, pattern=STATUS_PATTERN)
    current_page: Optional[int] = Field(None, ge=0, le=20000)
    rating: Optional[int] = Field(None, ge=0, le=5)  # 0 clears the rating
    notes: Optional[str] = Field(None, max_length=1000)
    favorite: Optional[bool] = None
    today: Optional[str] = Field(None, max_length=10)  # the client's local date, stamped on status changes


class CoverIn(BaseModel):
    image: str = Field(max_length=700_000)  # a data URL: data:image/jpeg;base64,...


class LogIn(BaseModel):
    day: str = Field(max_length=10)
    pages: int = Field(ge=1, le=5000)


def _day(value: str) -> date:
    try:
        return date.fromisoformat(value)
    except ValueError:
        raise HTTPException(422, "day must be YYYY-MM-DD")


def _book(conn, book_id: str) -> dict:
    row = conn.execute(f"SELECT {COLS} FROM books WHERE id = ?", (book_id,)).fetchone()
    if not row:
        raise HTTPException(404, "not found")
    return dict(row)


@router.get("/overview")
def overview(day: str = Query(..., max_length=10), window: int = Query(30, ge=7, le=120), _: str = Depends(caller)) -> dict:
    d = _day(day)
    start = (d - timedelta(days=window - 1)).isoformat()
    with db.connect() as conn:
        books = [dict(r) for r in conn.execute(f"SELECT {COLS} FROM books ORDER BY created_at DESC")]
        rows = conn.execute("SELECT day, SUM(pages) AS pages FROM book_logs WHERE day >= ? AND day <= ? GROUP BY day", (start, day)).fetchall()
        all_days = {r["day"] for r in conn.execute("SELECT DISTINCT day FROM book_logs WHERE day <= ?", (day,))}
    days = {r["day"]: r["pages"] for r in rows}
    streak = 0
    cursor = d if day in all_days else d - timedelta(days=1)
    while cursor.isoformat() in all_days:
        streak += 1
        cursor -= timedelta(days=1)
    month_prefix = day[:7]
    year_prefix = day[:4]
    return {
        "day": day, "books": books, "days": days, "streak": streak,
        "today_pages": days.get(day, 0),
        "month_pages": sum(p for k, p in days.items() if k.startswith(month_prefix)),
        "finished_year": sum(1 for b in books if b["status"] == "finished" and (b["finished_on"] or "").startswith(year_prefix)),
        "week_pages": sum(p for k, p in days.items() if k >= (d - timedelta(days=6)).isoformat()),
    }


@router.post("", status_code=201)
def add_book(body: BookIn, _: str = Depends(caller)) -> dict:
    now = db.now_utc()
    row = {
        "id": uuid.uuid4().hex, "title": body.title.strip(), "author": (body.author or "").strip() or None, "pages": body.pages,
        "status": body.status, "current_page": body.current_page, "rating": body.rating, "started_on": None, "finished_on": None,
        "favorite": 1 if body.favorite else 0, "notes": (body.notes or "").strip() or None, "created_at": now, "updated_at": now,
    }
    with db.connect() as conn:
        conn.execute(f"INSERT INTO books ({', '.join(row)}) VALUES ({', '.join('?' * len(row))})", tuple(row.values()))
    return {**row, "has_cover": 0}


@router.patch("/{book_id}")
def patch_book(book_id: str, body: BookPatch, _: str = Depends(caller)) -> dict:
    data = body.model_dump(exclude_unset=True)
    today = data.pop("today", None) or date.today().isoformat()
    fields = {k: v for k, v in data.items() if v is not None}
    for k in ("title", "author", "notes"):
        if k in fields:
            fields[k] = fields[k].strip() or (None if k != "title" else "Untitled")
    if "rating" in fields and fields["rating"] == 0:
        fields["rating"] = None
    if "favorite" in fields:
        fields["favorite"] = 1 if fields["favorite"] else 0
    with db.connect() as conn:
        book = _book(conn, book_id)
        status = fields.get("status")
        if status and status != book["status"]:
            if status == "reading" and not book["started_on"]:
                fields["started_on"] = today
            if status == "finished":
                fields["finished_on"] = today
                fields.setdefault("started_on", book["started_on"] or today)
                pages = fields.get("pages") or book["pages"]
                if pages:
                    fields["current_page"] = pages
            elif book["status"] == "finished":
                fields["finished_on"] = None
        fields["updated_at"] = db.now_utc()
        conn.execute(f"UPDATE books SET {', '.join(k + ' = ?' for k in fields)} WHERE id = ?", (*fields.values(), book_id))
        return _book(conn, book_id)


@router.delete("/{book_id}", status_code=204)
def delete_book(book_id: str, _: str = Depends(caller)) -> Response:
    with db.connect() as conn:
        if conn.execute("DELETE FROM books WHERE id = ?", (book_id,)).rowcount == 0:
            raise HTTPException(404, "not found")
    return Response(status_code=204)


@router.post("/{book_id}/log")
def log_pages(book_id: str, body: LogIn, _: str = Depends(caller)) -> dict:
    """Add pages read on a day: moves the bookmark forward, starts the book if needed and finishes it on the last page."""
    _day(body.day)
    with db.connect() as conn:
        book = _book(conn, book_id)
        conn.execute("INSERT INTO book_logs (id, book_id, day, pages, created_at) VALUES (?, ?, ?, ?, ?)", (uuid.uuid4().hex, book_id, body.day, body.pages, db.now_utc()))
        current = book["current_page"] + body.pages
        fields: dict = {}
        if book["pages"]:
            current = min(current, book["pages"])
        fields["current_page"] = current
        if book["status"] in ("to_read", "dropped"):
            fields["status"] = "reading"
        if not book["started_on"]:
            fields["started_on"] = body.day
        if book["pages"] and current >= book["pages"]:
            fields["status"] = "finished"
            fields["finished_on"] = body.day
        fields["updated_at"] = db.now_utc()
        conn.execute(f"UPDATE books SET {', '.join(k + ' = ?' for k in fields)} WHERE id = ?", (*fields.values(), book_id))
        return _book(conn, book_id)


@router.put("/{book_id}/cover")
def set_cover(book_id: str, body: CoverIn, _: str = Depends(caller)) -> dict:
    """Store (or replace) the cover picture. The client resizes it first; this only checks type and size."""
    m = _DATA_URL.match(body.image.strip())
    if not m:
        raise HTTPException(422, "send the cover as a JPEG, PNG or WebP data URL")
    try:
        data = base64.b64decode(re.sub(r"\s+", "", m.group(2)), validate=True)
    except ValueError:
        raise HTTPException(422, "the cover could not be decoded")
    if not data or len(data) > MAX_COVER:
        raise HTTPException(413, "the cover is too large")
    with db.connect() as conn:
        _book(conn, book_id)
        conn.execute("UPDATE books SET cover = ?, cover_type = ?, updated_at = ? WHERE id = ?", (data, m.group(1), db.now_utc(), book_id))
        return _book(conn, book_id)


@router.get("/{book_id}/cover")
def get_cover(book_id: str, _: str = Depends(caller)) -> Response:
    with db.connect() as conn:
        row = conn.execute("SELECT cover, cover_type FROM books WHERE id = ?", (book_id,)).fetchone()
    if not row or row["cover"] is None:
        raise HTTPException(404, "no cover")
    # the page asks with ?v=<updated_at>, so a new picture is a new URL and the old one can be cached for good
    return Response(content=row["cover"], media_type=row["cover_type"] or "image/jpeg", headers={"Cache-Control": "private, max-age=31536000, immutable"})


@router.delete("/{book_id}/cover")
def remove_cover(book_id: str, _: str = Depends(caller)) -> dict:
    with db.connect() as conn:
        _book(conn, book_id)
        conn.execute("UPDATE books SET cover = NULL, cover_type = NULL, updated_at = ? WHERE id = ?", (db.now_utc(), book_id))
        return _book(conn, book_id)
