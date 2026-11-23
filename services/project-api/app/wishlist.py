"""Wishlist: things you want, how much you want them, what they cost and, once you have one, how it turned out.

An item is "wanted" until it has a got_at date. Prices are plain numbers with a currency code. The picture of an item is optional
and is stored resized by the page (or by the import script), never in the list: lists only carry a has_image flag.
"""
import base64
import re
import unicodedata
import uuid
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field

from . import db
from .auth import caller

router = APIRouter(prefix="/v1/wishlist", tags=["wishlist"])

COLS = ("id, title, url, price, currency, notes, longing, category, purpose, origin, got_at, purchase_price, purchase_currency, "
        "payment_source, verdict, created_at, updated_at, (image IS NOT NULL) AS has_image")
MAX_IMAGE = 400_000  # bytes after decoding; the page sends a ~520px JPEG, normally 30-70 KB
_DATA_URL = re.compile(r"^data:(image/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=\s]+)$")
VERDICT_PATTERN = "^(happy|regret)$"
CURRENCY_PATTERN = "^[A-Z]{3}$"


def init_tables() -> None:
    with db.connect() as conn:
        conn.execute(
            """CREATE TABLE IF NOT EXISTS wishlist_items (
                   id TEXT PRIMARY KEY, title TEXT NOT NULL, url TEXT NOT NULL DEFAULT '', price REAL, currency TEXT NOT NULL DEFAULT 'BRL',
                   notes TEXT NOT NULL DEFAULT '', longing INTEGER NOT NULL DEFAULT 5, category TEXT NOT NULL DEFAULT 'other',
                   purpose TEXT NOT NULL DEFAULT '', origin TEXT NOT NULL DEFAULT '', got_at TEXT, purchase_price REAL, purchase_currency TEXT,
                   payment_source TEXT NOT NULL DEFAULT '', verdict TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
                   image BLOB, image_type TEXT)"""
        )
        conn.execute("CREATE INDEX IF NOT EXISTS wishlist_items_got ON wishlist_items (got_at)")
        # more pictures of the same item: the first picture stays in wishlist_items.image (the cover); these follow it, in order
        conn.execute(
            """CREATE TABLE IF NOT EXISTS wishlist_pics (
                   id TEXT PRIMARY KEY, item_id TEXT NOT NULL REFERENCES wishlist_items (id) ON DELETE CASCADE,
                   position INTEGER NOT NULL DEFAULT 0, image BLOB NOT NULL, image_type TEXT, created_at TEXT NOT NULL)"""
        )
        conn.execute("CREATE INDEX IF NOT EXISTS wishlist_pics_item ON wishlist_pics (item_id, position)")
        # the categories an item can be filed under; the page only lists them, creating and removing happens in the manager
        conn.execute("CREATE TABLE IF NOT EXISTS wishlist_categories (key TEXT PRIMARY KEY, label TEXT NOT NULL, sort INTEGER NOT NULL DEFAULT 0)")
        _sync_categories(conn)


class WishIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    url: str = Field("", max_length=1000)
    price: Optional[float] = Field(None, ge=0, le=100_000_000)
    currency: str = Field("BRL", pattern=CURRENCY_PATTERN)
    notes: str = Field("", max_length=2000)
    longing: int = Field(5, ge=0, le=10)
    category: str = Field("other", min_length=1, max_length=40)
    purpose: str = Field("", max_length=200)


class WishPatch(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=200)
    url: Optional[str] = Field(None, max_length=1000)
    price: Optional[float] = Field(None, ge=0, le=100_000_000)  # send null to clear
    currency: Optional[str] = Field(None, pattern=CURRENCY_PATTERN)
    notes: Optional[str] = Field(None, max_length=2000)
    longing: Optional[int] = Field(None, ge=0, le=10)
    category: Optional[str] = Field(None, min_length=1, max_length=40)
    purpose: Optional[str] = Field(None, max_length=200)
    got_at: Optional[str] = Field(None, max_length=10)  # YYYY-MM-DD, or null to put it back on the wishlist
    purchase_price: Optional[float] = Field(None, ge=0, le=100_000_000)
    purchase_currency: Optional[str] = Field(None, pattern=CURRENCY_PATTERN)
    payment_source: Optional[str] = Field(None, max_length=60)
    verdict: Optional[str] = Field(None, pattern=VERDICT_PATTERN)  # send null to clear


class ImageIn(BaseModel):
    image: str = Field(max_length=700_000)  # a data URL: data:image/jpeg;base64,...


MAX_PICS = 12   # pictures per item, the cover included


def _extras(conn, item_ids=None) -> dict:
    """ids of the extra pictures per item, in order"""
    out: dict = {}
    for r in conn.execute("SELECT id, item_id FROM wishlist_pics ORDER BY item_id, position, created_at"):
        out.setdefault(r["item_id"], []).append(r["id"])
    return out


_LABELS = {"accesories": "Acessórios", "accessories": "Acessórios", "tech": "Tecnologia", "photography": "Fotografia", "shoes": "Calçados", "audio": "Áudio",
           "clothes": "Roupas", "home": "Casa", "other": "Outros", "books": "Livros", "games": "Jogos", "health": "Saúde", "sports": "Esportes"}


def _sync_categories(conn) -> None:
    """Make sure "other" exists and every category already used by an item is listed (older items carry free-text categories)."""
    have = {r["key"] for r in conn.execute("SELECT key FROM wishlist_categories")}
    used = [r["category"] for r in conn.execute("SELECT category, COUNT(*) AS n FROM wishlist_items GROUP BY category ORDER BY n DESC")]
    nxt = conn.execute("SELECT COALESCE(MAX(sort), 0) FROM wishlist_categories").fetchone()[0]
    for key in ["other", *used]:
        if key and key not in have:
            nxt += 1
            conn.execute("INSERT INTO wishlist_categories (key, label, sort) VALUES (?, ?, ?)", (key, _LABELS.get(key) or key[:1].upper() + key[1:], nxt))
            have.add(key)


def _slug(label: str) -> str:
    t = unicodedata.normalize("NFKD", label).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "-", t).strip("-")[:40]


class CategoryIn(BaseModel):
    label: str = Field(min_length=1, max_length=40)


def _categories(conn) -> list:
    _sync_categories(conn)
    return [dict(r) for r in conn.execute(
        "SELECT c.key, c.label, (SELECT COUNT(*) FROM wishlist_items i WHERE i.category = c.key) AS count FROM wishlist_categories c "
        "ORDER BY (c.key = 'other'), c.sort, c.label")]


@router.get("/categories")
def list_categories(_: str = Depends(caller)) -> dict:
    with db.connect() as conn:
        return {"categories": _categories(conn)}


@router.post("/categories", status_code=201)
def add_category(body: CategoryIn, _: str = Depends(caller)) -> dict:
    label = re.sub(r"\s+", " ", body.label).strip()
    key = _slug(label)
    if not label or not key:
        raise HTTPException(422, "give the category a name")
    with db.connect() as conn:
        if conn.execute("SELECT 1 FROM wishlist_categories WHERE key = ? OR lower(label) = lower(?)", (key, label)).fetchone():
            raise HTTPException(409, "that category already exists")
        nxt = conn.execute("SELECT COALESCE(MAX(sort), 0) + 1 FROM wishlist_categories").fetchone()[0]
        conn.execute("INSERT INTO wishlist_categories (key, label, sort) VALUES (?, ?, ?)", (key, label, nxt))
        return {"categories": _categories(conn)}


@router.delete("/categories/{key}")
def delete_category(key: str, _: str = Depends(caller)) -> dict:
    """Items in the category move to "other"; the category itself goes away. "other" cannot be removed."""
    if key == "other":
        raise HTTPException(422, "the Outros category cannot be removed")
    with db.connect() as conn:
        _sync_categories(conn)
        if conn.execute("DELETE FROM wishlist_categories WHERE key = ?", (key,)).rowcount == 0:
            raise HTTPException(404, "not found")
        moved = conn.execute("UPDATE wishlist_items SET category = 'other', updated_at = ? WHERE category = ?", (db.now_utc(), key)).rowcount
        return {"moved": moved, "categories": _categories(conn)}


def _item(conn, item_id: str) -> dict:
    row = conn.execute(f"SELECT {COLS} FROM wishlist_items WHERE id = ?", (item_id,)).fetchone()
    if not row:
        raise HTTPException(404, "not found")
    out = dict(row)
    out["pics"] = [r["id"] for r in conn.execute("SELECT id FROM wishlist_pics WHERE item_id = ? ORDER BY position, created_at", (item_id,))]
    return out


def _decode(image: str) -> tuple:
    m = _DATA_URL.match(image.strip())
    if not m:
        raise HTTPException(422, "send the picture as a JPEG, PNG or WebP data URL")
    try:
        data = base64.b64decode(re.sub(r"\s+", "", m.group(2)), validate=True)
    except ValueError:
        raise HTTPException(422, "the picture could not be decoded")
    if not data or len(data) > MAX_IMAGE:
        raise HTTPException(413, "the picture is too large")
    return data, m.group(1)


@router.get("")
def list_items(_: str = Depends(caller)) -> dict:
    with db.connect() as conn:
        rows = [dict(r) for r in conn.execute(f"SELECT {COLS} FROM wishlist_items ORDER BY created_at DESC, id")]
        extras = _extras(conn)
    for r in rows:
        r["pics"] = extras.get(r["id"], [])
    return {"items": rows}


@router.post("", status_code=201)
def add_item(body: WishIn, _: str = Depends(caller)) -> dict:
    now = db.now_utc()
    row = {
        "id": uuid.uuid4().hex, "title": body.title.strip(), "url": body.url.strip(), "price": body.price, "currency": body.currency,
        "notes": body.notes.strip(), "longing": body.longing, "category": body.category.strip().lower() or "other", "purpose": body.purpose.strip(),
        "origin": "ignis", "created_at": now, "updated_at": now,
    }
    with db.connect() as conn:
        conn.execute(f"INSERT INTO wishlist_items ({', '.join(row)}) VALUES ({', '.join('?' * len(row))})", tuple(row.values()))
        _sync_categories(conn)
        return _item(conn, row["id"])


@router.patch("/{item_id}")
def patch_item(item_id: str, body: WishPatch, _: str = Depends(caller)) -> dict:
    data = body.model_dump(exclude_unset=True)
    for k in ("title", "url", "notes", "purpose", "payment_source"):
        if data.get(k) is not None:
            data[k] = data[k].strip()
    if data.get("title") == "":
        raise HTTPException(422, "title cannot be empty")
    if data.get("category") is not None:
        data["category"] = data["category"].strip().lower() or "other"
    if data.get("got_at"):
        try:
            date.fromisoformat(data["got_at"])
        except ValueError:
            raise HTTPException(422, "got_at must be YYYY-MM-DD")
    for k in ("title", "currency", "longing", "category", "url", "notes", "purpose", "payment_source"):
        if k in data and data[k] is None:
            data.pop(k)  # these cannot be cleared to null; leaving them out keeps the old value
    if "got_at" in data and not data["got_at"]:
        # back on the wishlist: forget how the purchase went
        data.update(got_at=None, purchase_price=None, purchase_currency=None, payment_source="", verdict=None)
    with db.connect() as conn:
        _item(conn, item_id)
        if data:
            data["updated_at"] = db.now_utc()
            conn.execute(f"UPDATE wishlist_items SET {', '.join(k + ' = ?' for k in data)} WHERE id = ?", (*data.values(), item_id))
            _sync_categories(conn)
        return _item(conn, item_id)


@router.delete("/{item_id}", status_code=204)
def delete_item(item_id: str, _: str = Depends(caller)) -> Response:
    with db.connect() as conn:
        if conn.execute("DELETE FROM wishlist_items WHERE id = ?", (item_id,)).rowcount == 0:
            raise HTTPException(404, "not found")
    return Response(status_code=204)


@router.put("/{item_id}/image")
def set_image(item_id: str, body: ImageIn, _: str = Depends(caller)) -> dict:
    data, kind = _decode(body.image)
    with db.connect() as conn:
        _item(conn, item_id)
        conn.execute("UPDATE wishlist_items SET image = ?, image_type = ?, updated_at = ? WHERE id = ?", (data, kind, db.now_utc(), item_id))
        return _item(conn, item_id)


@router.get("/{item_id}/image")
def get_image(item_id: str, _: str = Depends(caller)) -> Response:
    with db.connect() as conn:
        row = conn.execute("SELECT image, image_type FROM wishlist_items WHERE id = ?", (item_id,)).fetchone()
    if not row or row["image"] is None:
        raise HTTPException(404, "no picture")
    # the page asks with ?v=<updated_at>, so a new picture is a new URL and the old one can be cached for good
    return Response(content=row["image"], media_type=row["image_type"] or "image/jpeg", headers={"Cache-Control": "private, max-age=31536000, immutable"})


@router.delete("/{item_id}/image")
def remove_image(item_id: str, _: str = Depends(caller)) -> dict:
    with db.connect() as conn:
        _item(conn, item_id)
        nxt = conn.execute("SELECT id, image, image_type FROM wishlist_pics WHERE item_id = ? ORDER BY position, created_at LIMIT 1", (item_id,)).fetchone()
        if nxt:   # the next picture becomes the cover
            conn.execute("UPDATE wishlist_items SET image = ?, image_type = ?, updated_at = ? WHERE id = ?", (nxt["image"], nxt["image_type"], db.now_utc(), item_id))
            conn.execute("DELETE FROM wishlist_pics WHERE id = ?", (nxt["id"],))
        else:
            conn.execute("UPDATE wishlist_items SET image = NULL, image_type = NULL, updated_at = ? WHERE id = ?", (db.now_utc(), item_id))
        return _item(conn, item_id)


@router.post("/{item_id}/pics", status_code=201)
def add_pic(item_id: str, body: ImageIn, _: str = Depends(caller)) -> dict:
    """One more picture after the others. If the item has no cover yet, this one becomes the cover."""
    data, kind = _decode(body.image)
    with db.connect() as conn:
        item = _item(conn, item_id)
        if not item["has_image"]:
            conn.execute("UPDATE wishlist_items SET image = ?, image_type = ?, updated_at = ? WHERE id = ?", (data, kind, db.now_utc(), item_id))
            return _item(conn, item_id)
        if len(item["pics"]) + 1 >= MAX_PICS:
            raise HTTPException(422, "an item can have up to %d pictures" % MAX_PICS)
        pos = conn.execute("SELECT COALESCE(MAX(position), 0) + 1 FROM wishlist_pics WHERE item_id = ?", (item_id,)).fetchone()[0]
        conn.execute("INSERT INTO wishlist_pics (id, item_id, position, image, image_type, created_at) VALUES (?, ?, ?, ?, ?, ?)", (uuid.uuid4().hex, item_id, pos, data, kind, db.now_utc()))
        conn.execute("UPDATE wishlist_items SET updated_at = ? WHERE id = ?", (db.now_utc(), item_id))
        return _item(conn, item_id)


@router.get("/{item_id}/pics/{pic_id}")
def get_pic(item_id: str, pic_id: str, _: str = Depends(caller)) -> Response:
    with db.connect() as conn:
        row = conn.execute("SELECT image, image_type FROM wishlist_pics WHERE id = ? AND item_id = ?", (pic_id, item_id)).fetchone()
    if not row:
        raise HTTPException(404, "no picture")
    return Response(content=row["image"], media_type=row["image_type"] or "image/jpeg", headers={"Cache-Control": "private, max-age=31536000, immutable"})


@router.delete("/{item_id}/pics/{pic_id}")
def remove_pic(item_id: str, pic_id: str, _: str = Depends(caller)) -> dict:
    with db.connect() as conn:
        _item(conn, item_id)
        if conn.execute("DELETE FROM wishlist_pics WHERE id = ? AND item_id = ?", (pic_id, item_id)).rowcount == 0:
            raise HTTPException(404, "no picture")
        conn.execute("UPDATE wishlist_items SET updated_at = ? WHERE id = ?", (db.now_utc(), item_id))
        return _item(conn, item_id)
