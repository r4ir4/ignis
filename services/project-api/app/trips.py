"""Trips: a trip with dates (or still just being planned, with no dates) and a destination, a checklist of to-dos, day-by-day plan items, places to see and photos.

Reference copy of /opt/ignis/api/app/trips.py. Same conventions as goals.py: SQLite through `db.connect()`,
`caller` for auth, plain local dates (YYYY-MM-DD). Photos are JPEG files in <data dir>/trip-photos, next to the
database, so they sit on the same persistent volume and in the same backups; the database only stores their ids.
"""
import os
import uuid
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel, Field

from . import db
from .auth import caller

router = APIRouter(prefix="/v1/trips", tags=["trips"])

PHOTO_DIR = os.path.join(os.path.dirname(db.DB_PATH), "trip-photos")
MAX_PHOTO_BYTES = 2_000_000
TIME = "^([01][0-9]|2[0-3]):[0-5][0-9]$"


def init_tables() -> None:
    os.makedirs(PHOTO_DIR, exist_ok=True)
    with db.connect() as conn:
        conn.execute(
            """CREATE TABLE IF NOT EXISTS trips (
                   id TEXT PRIMARY KEY, name TEXT NOT NULL, destination TEXT, start_date TEXT NOT NULL, end_date TEXT NOT NULL,
                   note TEXT, cover TEXT, created_at TEXT NOT NULL)"""
        )
        conn.execute(
            """CREATE TABLE IF NOT EXISTS trip_items (
                   id TEXT PRIMARY KEY, trip_id TEXT NOT NULL REFERENCES trips (id) ON DELETE CASCADE,
                   day TEXT NOT NULL, time TEXT, text TEXT NOT NULL, address TEXT, created_at TEXT NOT NULL)"""
        )
        conn.execute(
            """CREATE TABLE IF NOT EXISTS trip_places (
                   id TEXT PRIMARY KEY, trip_id TEXT NOT NULL REFERENCES trips (id) ON DELETE CASCADE,
                   name TEXT NOT NULL, address TEXT, note TEXT, done INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL)"""
        )
        conn.execute(
            """CREATE TABLE IF NOT EXISTS trip_photos (
                   id TEXT PRIMARY KEY, trip_id TEXT NOT NULL REFERENCES trips (id) ON DELETE CASCADE, created_at TEXT NOT NULL)"""
        )
        # the checklist of things to sort out before going (buy tickets, buy a coat...)
        conn.execute(
            """CREATE TABLE IF NOT EXISTS trip_todos (
                   id TEXT PRIMARY KEY, trip_id TEXT NOT NULL REFERENCES trips (id) ON DELETE CASCADE,
                   text TEXT NOT NULL, done INTEGER NOT NULL DEFAULT 0, sort INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL)"""
        )
        # Later additions, added in place so existing rows and files are untouched.
        for table, col in (("trips", "drive_url"), ("trip_photos", "day"), ("trip_photos", "topic"), ("trip_photos", "caption"), ("trip_photos", "drive_url")):
            if col not in {r["name"] for r in conn.execute(f"PRAGMA table_info({table})")}:
                conn.execute(f"ALTER TABLE {table} ADD COLUMN {col} TEXT")


class TripIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    destination: Optional[str] = Field(None, max_length=200)
    start_date: str = Field("", max_length=10)   # both dates empty = the trip is only being planned
    end_date: str = Field("", max_length=10)
    note: Optional[str] = Field(None, max_length=2000)


class TripPatch(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=120)
    destination: Optional[str] = Field(None, max_length=200)
    start_date: Optional[str] = Field(None, max_length=10)
    end_date: Optional[str] = Field(None, max_length=10)
    note: Optional[str] = Field(None, max_length=2000)
    cover: Optional[str] = Field(None, max_length=40)  # a photo id; empty string clears it
    drive_url: Optional[str] = Field(None, max_length=500)


class PhotoPatch(BaseModel):
    day: Optional[str] = Field(None, max_length=10)  # YYYY-MM-DD; empty string clears it
    topic: Optional[str] = Field(None, max_length=60)
    caption: Optional[str] = Field(None, max_length=300)
    drive_url: Optional[str] = Field(None, max_length=500)


class ItemIn(BaseModel):
    day: str = Field(max_length=10)
    time: Optional[str] = Field(None, pattern=TIME)
    text: str = Field(min_length=1, max_length=200)
    address: Optional[str] = Field(None, max_length=200)


class TodosIn(BaseModel):
    texts: list[str] = Field(min_length=1, max_length=100)


class TodoPatch(BaseModel):
    text: Optional[str] = Field(None, min_length=1, max_length=300)
    done: Optional[bool] = None


class PlaceIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    address: Optional[str] = Field(None, max_length=200)
    note: Optional[str] = Field(None, max_length=500)


class PlacePatch(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=120)
    address: Optional[str] = Field(None, max_length=200)
    note: Optional[str] = Field(None, max_length=500)
    done: Optional[bool] = None


def _day(value: str) -> str:
    try:
        date.fromisoformat(value)
    except ValueError:
        raise HTTPException(422, "dates must be YYYY-MM-DD")
    return value


def _check_dates(start: str, end: str) -> None:
    """Both empty (only planning) or both real dates in order."""
    if not start and not end:
        return
    if not start or not end:
        raise HTTPException(422, "give both dates, or none while the trip is only being planned")
    if _day(end) < _day(start):
        raise HTTPException(422, "end_date is before start_date")


def _clean(value: Optional[str]) -> Optional[str]:
    return (value or "").strip() or None


def _trip(conn, trip_id: str) -> dict:
    row = conn.execute("SELECT * FROM trips WHERE id = ?", (trip_id,)).fetchone()
    if not row:
        raise HTTPException(404, "not found")
    t = dict(row)
    t["items"] = [dict(r) for r in conn.execute("SELECT id, day, time, text, address FROM trip_items WHERE trip_id = ? ORDER BY day, COALESCE(time, '99:99'), created_at", (trip_id,))]
    t["places"] = [dict(r) | {"done": bool(r["done"])} for r in conn.execute("SELECT id, name, address, note, done FROM trip_places WHERE trip_id = ? ORDER BY created_at, id", (trip_id,))]
    t["todos"] = [dict(r) | {"done": bool(r["done"])} for r in conn.execute("SELECT id, text, done FROM trip_todos WHERE trip_id = ? ORDER BY sort, created_at, id", (trip_id,))]
    t["photos"] = [r["id"] for r in conn.execute("SELECT id FROM trip_photos WHERE trip_id = ? ORDER BY created_at, id", (trip_id,))]
    t["photo_meta"] = [dict(r) for r in conn.execute("SELECT id, day, topic, caption, drive_url FROM trip_photos WHERE trip_id = ? ORDER BY created_at, id", (trip_id,))]
    return t


def _photo_path(photo_id: str) -> str:
    if not photo_id.isalnum():
        raise HTTPException(404, "not found")
    return os.path.join(PHOTO_DIR, photo_id + ".jpg")


def _remove_files(photo_ids: list[str]) -> None:
    for pid in photo_ids:
        try:
            os.remove(_photo_path(pid))
        except (OSError, HTTPException):
            pass


@router.get("")
def list_trips(_: str = Depends(caller)) -> dict:
    with db.connect() as conn:
        ids = [r["id"] for r in conn.execute("SELECT id FROM trips ORDER BY start_date, created_at")]
        return {"trips": [_trip(conn, i) for i in ids]}


@router.post("", status_code=201)
def create_trip(body: TripIn, _: str = Depends(caller)) -> dict:
    _check_dates(body.start_date.strip(), body.end_date.strip())
    tid = uuid.uuid4().hex
    with db.connect() as conn:
        conn.execute(
            "INSERT INTO trips (id, name, destination, start_date, end_date, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (tid, body.name.strip(), _clean(body.destination), body.start_date.strip(), body.end_date.strip(), _clean(body.note), db.now_utc()))
        return _trip(conn, tid)


@router.patch("/{trip_id}")
def patch_trip(trip_id: str, body: TripPatch, _: str = Depends(caller)) -> dict:
    data = body.model_dump(exclude_unset=True)
    with db.connect() as conn:
        cur = _trip(conn, trip_id)
        fields: dict = {}
        for k in ("name", "start_date", "end_date"):
            if data.get(k) is not None:
                fields[k] = data[k].strip()
        for k in ("destination", "note", "drive_url"):
            if k in data:
                fields[k] = _clean(data[k])
        if "cover" in data:
            cover = data["cover"] or None
            if cover and cover not in cur["photos"]:
                raise HTTPException(422, "cover must be one of this trip's photos")
            fields["cover"] = cover
        _check_dates(fields.get("start_date", cur["start_date"]), fields.get("end_date", cur["end_date"]))
        if fields:
            conn.execute(f"UPDATE trips SET {', '.join(k + ' = ?' for k in fields)} WHERE id = ?", (*fields.values(), trip_id))
        return _trip(conn, trip_id)


@router.delete("/{trip_id}", status_code=204)
def delete_trip(trip_id: str, _: str = Depends(caller)) -> Response:
    with db.connect() as conn:
        photos = [r["id"] for r in conn.execute("SELECT id FROM trip_photos WHERE trip_id = ?", (trip_id,))]
        if conn.execute("DELETE FROM trips WHERE id = ?", (trip_id,)).rowcount == 0:
            raise HTTPException(404, "not found")
    _remove_files(photos)
    return Response(status_code=204)


@router.post("/{trip_id}/items", status_code=201)
def add_item(trip_id: str, body: ItemIn, _: str = Depends(caller)) -> dict:
    with db.connect() as conn:
        _trip(conn, trip_id)
        iid = uuid.uuid4().hex
        conn.execute("INSERT INTO trip_items (id, trip_id, day, time, text, address, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                     (iid, trip_id, _day(body.day), body.time or None, body.text.strip(), _clean(body.address), db.now_utc()))
        return dict(conn.execute("SELECT id, day, time, text, address FROM trip_items WHERE id = ?", (iid,)).fetchone())


@router.delete("/items/{item_id}", status_code=204)
def delete_item(item_id: str, _: str = Depends(caller)) -> Response:
    with db.connect() as conn:
        if conn.execute("DELETE FROM trip_items WHERE id = ?", (item_id,)).rowcount == 0:
            raise HTTPException(404, "not found")
    return Response(status_code=204)


@router.post("/{trip_id}/places", status_code=201)
def add_place(trip_id: str, body: PlaceIn, _: str = Depends(caller)) -> dict:
    with db.connect() as conn:
        _trip(conn, trip_id)
        pid = uuid.uuid4().hex
        conn.execute("INSERT INTO trip_places (id, trip_id, name, address, note, created_at) VALUES (?, ?, ?, ?, ?, ?)",
                     (pid, trip_id, body.name.strip(), _clean(body.address), _clean(body.note), db.now_utc()))
        return dict(conn.execute("SELECT id, name, address, note, done FROM trip_places WHERE id = ?", (pid,)).fetchone()) | {"done": False}


@router.patch("/places/{place_id}")
def patch_place(place_id: str, body: PlacePatch, _: str = Depends(caller)) -> dict:
    data = body.model_dump(exclude_unset=True)
    with db.connect() as conn:
        if not conn.execute("SELECT 1 FROM trip_places WHERE id = ?", (place_id,)).fetchone():
            raise HTTPException(404, "not found")
        fields: dict = {}
        if data.get("name") is not None:
            fields["name"] = data["name"].strip()
        for k in ("address", "note"):
            if k in data:
                fields[k] = _clean(data[k])
        if data.get("done") is not None:
            fields["done"] = int(data["done"])
        if fields:
            conn.execute(f"UPDATE trip_places SET {', '.join(k + ' = ?' for k in fields)} WHERE id = ?", (*fields.values(), place_id))
        row = dict(conn.execute("SELECT id, name, address, note, done FROM trip_places WHERE id = ?", (place_id,)).fetchone())
        return row | {"done": bool(row["done"])}


@router.delete("/places/{place_id}", status_code=204)
def delete_place(place_id: str, _: str = Depends(caller)) -> Response:
    with db.connect() as conn:
        if conn.execute("DELETE FROM trip_places WHERE id = ?", (place_id,)).rowcount == 0:
            raise HTTPException(404, "not found")
    return Response(status_code=204)


@router.post("/{trip_id}/photos", status_code=201)
async def add_photo(trip_id: str, request: Request, _: str = Depends(caller)) -> dict:
    """Body is the raw JPEG (the page resizes before uploading). Written to disk first, then recorded."""
    data = await request.body()
    if not data or len(data) > MAX_PHOTO_BYTES:
        raise HTTPException(413 if data else 422, "photo must be a JPEG under 2 MB")
    if data[:3] != b"\xff\xd8\xff":
        raise HTTPException(415, "photo must be a JPEG")
    with db.connect() as conn:
        _trip(conn, trip_id)
    pid = uuid.uuid4().hex
    path = _photo_path(pid)
    with open(path + ".part", "wb") as f:
        f.write(data)
        f.flush()
        os.fsync(f.fileno())
    os.replace(path + ".part", path)
    try:
        with db.connect() as conn:
            conn.execute("INSERT INTO trip_photos (id, trip_id, created_at) VALUES (?, ?, ?)", (pid, trip_id, db.now_utc()))
    except Exception:
        _remove_files([pid])
        raise
    return {"id": pid}


@router.get("/photos/{photo_id}")
def get_photo(photo_id: str, _: str = Depends(caller)) -> FileResponse:
    path = _photo_path(photo_id)
    if not os.path.isfile(path):
        raise HTTPException(404, "not found")
    return FileResponse(path, media_type="image/jpeg", headers={"Cache-Control": "private, max-age=31536000, immutable"})


@router.patch("/photos/{photo_id}")
def patch_photo(photo_id: str, body: PhotoPatch, _: str = Depends(caller)) -> dict:
    data = body.model_dump(exclude_unset=True)
    fields = {k: _clean(v) for k, v in data.items()}
    if fields.get("day"):
        _day(fields["day"])
    with db.connect() as conn:
        if fields:
            if conn.execute(f"UPDATE trip_photos SET {', '.join(k + ' = ?' for k in fields)} WHERE id = ?", (*fields.values(), photo_id)).rowcount == 0:
                raise HTTPException(404, "not found")
        row = conn.execute("SELECT id, day, topic, caption, drive_url FROM trip_photos WHERE id = ?", (photo_id,)).fetchone()
        if not row:
            raise HTTPException(404, "not found")
        return dict(row)


@router.delete("/photos/{photo_id}", status_code=204)
def delete_photo(photo_id: str, _: str = Depends(caller)) -> Response:
    with db.connect() as conn:
        conn.execute("UPDATE trips SET cover = NULL WHERE cover = ?", (photo_id,))
        if conn.execute("DELETE FROM trip_photos WHERE id = ?", (photo_id,)).rowcount == 0:
            raise HTTPException(404, "not found")
    _remove_files([photo_id])
    return Response(status_code=204)


@router.post("/{trip_id}/todos", status_code=201)
def add_todos(trip_id: str, body: TodosIn, _: str = Depends(caller)) -> dict:
    texts = [t.strip()[:300] for t in body.texts if t and t.strip()]
    if not texts:
        raise HTTPException(422, "add at least one to-do")
    with db.connect() as conn:
        _trip(conn, trip_id)
        start = conn.execute("SELECT COALESCE(MAX(sort), 0) FROM trip_todos WHERE trip_id = ?", (trip_id,)).fetchone()[0]
        for i, text in enumerate(texts, 1):
            conn.execute("INSERT INTO trip_todos (id, trip_id, text, done, sort, created_at) VALUES (?, ?, ?, 0, ?, ?)", (uuid.uuid4().hex, trip_id, text, start + i, db.now_utc()))
        return _trip(conn, trip_id)


@router.patch("/todos/{todo_id}")
def patch_todo(todo_id: str, body: TodoPatch, _: str = Depends(caller)) -> dict:
    data = body.model_dump(exclude_unset=True)
    fields: dict = {}
    if data.get("text") is not None:
        fields["text"] = data["text"].strip()
        if not fields["text"]:
            raise HTTPException(422, "text is empty")
    if data.get("done") is not None:
        fields["done"] = int(data["done"])
    with db.connect() as conn:
        if not conn.execute("SELECT 1 FROM trip_todos WHERE id = ?", (todo_id,)).fetchone():
            raise HTTPException(404, "not found")
        if fields:
            conn.execute(f"UPDATE trip_todos SET {', '.join(k + ' = ?' for k in fields)} WHERE id = ?", (*fields.values(), todo_id))
        r = conn.execute("SELECT id, text, done FROM trip_todos WHERE id = ?", (todo_id,)).fetchone()
        return dict(r) | {"done": bool(r["done"])}


@router.delete("/todos/{todo_id}", status_code=204)
def delete_todo(todo_id: str, _: str = Depends(caller)) -> Response:
    with db.connect() as conn:
        if conn.execute("DELETE FROM trip_todos WHERE id = ?", (todo_id,)).rowcount == 0:
            raise HTTPException(404, "not found")
    return Response(status_code=204)
