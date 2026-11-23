"""Backpack: an inventory of things that run out (pens, pills, coffee, razor blades...) and when to buy more.

An item has a stock that was counted on some day (`quantity` on `counted_at`) and, if you use it regularly, a rate: `use_qty` units every
`use_every` days/weeks/months/years. The stock now, the day it runs out and the day to buy more (when it falls to `reorder_at` units) are worked
out from those, so nothing has to be ticked off daily. Buying more or recounting what is left starts a new count.

Days are plain local dates (YYYY-MM-DD) sent by the client.
"""
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

router = APIRouter(prefix="/v1/backpack", tags=["backpack"])

PERIOD_DAYS = {"day": 1.0, "week": 7.0, "month": 30.4375, "year": 365.25}
PERIOD_PATTERN = "^(day|week|month|year)$"
COLS = "id, name, grp, unit, quantity, counted_at, use_qty, use_every, use_period, reorder_at, note, last_bought_at, created_at, updated_at"


def init_tables() -> None:
    with db.connect() as conn:
        conn.execute(
            """CREATE TABLE IF NOT EXISTS backpack_items (
                   id TEXT PRIMARY KEY, name TEXT NOT NULL, grp TEXT NOT NULL DEFAULT '', unit TEXT NOT NULL DEFAULT '',
                   quantity REAL NOT NULL DEFAULT 0, counted_at TEXT NOT NULL,
                   use_qty REAL NOT NULL DEFAULT 0, use_every INTEGER NOT NULL DEFAULT 1, use_period TEXT NOT NULL DEFAULT 'week',
                   reorder_at REAL NOT NULL DEFAULT 1, note TEXT NOT NULL DEFAULT '', last_bought_at TEXT,
                   created_at TEXT NOT NULL, updated_at TEXT NOT NULL)"""
        )
        # the categories an item can be filed under; they are created and removed in the manager, items only pick one
        conn.execute("CREATE TABLE IF NOT EXISTS backpack_categories (key TEXT PRIMARY KEY, label TEXT NOT NULL, sort INTEGER NOT NULL DEFAULT 0)")
        _sync_categories(conn)


def _slug(label: str) -> str:
    t = unicodedata.normalize("NFKD", label).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "-", t).strip("-")[:40]


def _sync_categories(conn) -> None:
    """An item's group used to be free text. Any group that is not a category key yet becomes a category (and the item points at its key)."""
    keys = {r["key"] for r in conn.execute("SELECT key FROM backpack_categories")}
    nxt = conn.execute("SELECT COALESCE(MAX(sort), 0) FROM backpack_categories").fetchone()[0]
    for r in conn.execute("SELECT DISTINCT grp FROM backpack_items WHERE grp != ''").fetchall():
        label = r["grp"]
        if label in keys:
            continue
        key = _slug(label) or "outros"
        if key not in keys:
            nxt += 1
            conn.execute("INSERT INTO backpack_categories (key, label, sort) VALUES (?, ?, ?)", (key, label.strip()[:40], nxt))
            keys.add(key)
        conn.execute("UPDATE backpack_items SET grp = ? WHERE grp = ?", (key, label))


class CategoryIn(BaseModel):
    label: str = Field(min_length=1, max_length=40)


def _categories(conn) -> list:
    _sync_categories(conn)
    return [dict(r) for r in conn.execute(
        "SELECT c.key, c.label, (SELECT COUNT(*) FROM backpack_items i WHERE i.grp = c.key) AS count FROM backpack_categories c ORDER BY c.sort, c.label")]


class ItemIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    group: str = Field("", max_length=40)
    unit: str = Field("", max_length=30)
    quantity: float = Field(0, ge=0, le=1_000_000)
    day: str = Field(max_length=10)                       # the day the stock was counted
    use_qty: float = Field(0, ge=0, le=1_000_000)          # 0 = no regular use
    use_every: int = Field(1, ge=1, le=365)
    use_period: str = Field("week", pattern=PERIOD_PATTERN)
    reorder_at: float = Field(1, ge=0, le=1_000_000)
    note: str = Field("", max_length=1000)


class ItemPatch(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=120)
    group: Optional[str] = Field(None, max_length=40)
    unit: Optional[str] = Field(None, max_length=30)
    use_qty: Optional[float] = Field(None, ge=0, le=1_000_000)
    use_every: Optional[int] = Field(None, ge=1, le=365)
    use_period: Optional[str] = Field(None, pattern=PERIOD_PATTERN)
    reorder_at: Optional[float] = Field(None, ge=0, le=1_000_000)
    note: Optional[str] = Field(None, max_length=1000)
    day: Optional[str] = Field(None, max_length=10)       # needed when the rate changes: the stock so far is settled on this day first


class BuyIn(BaseModel):
    amount: float = Field(gt=0, le=1_000_000)
    day: str = Field(max_length=10)


class CountIn(BaseModel):
    quantity: float = Field(ge=0, le=1_000_000)
    day: str = Field(max_length=10)


def _day(value: str) -> date:
    try:
        return date.fromisoformat(value)
    except ValueError:
        raise HTTPException(422, "day must be YYYY-MM-DD")


def _rate(row) -> float:
    """units used per day"""
    return row["use_qty"] / (row["use_every"] * PERIOD_DAYS[row["use_period"]]) if row["use_qty"] > 0 else 0.0


def _left(row, today: date) -> float:
    gone = max(0, (today - date.fromisoformat(row["counted_at"])).days) * _rate(row)
    return max(0.0, row["quantity"] - gone)


def _get(conn, item_id: str):
    row = conn.execute(f"SELECT {COLS} FROM backpack_items WHERE id = ?", (item_id,)).fetchone()
    if not row:
        raise HTTPException(404, "not found")
    return row


def _shape(row) -> dict:
    out = dict(row)
    out["group"] = out.pop("grp")
    return out


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
        if conn.execute("SELECT 1 FROM backpack_categories WHERE key = ? OR lower(label) = lower(?)", (key, label)).fetchone():
            raise HTTPException(409, "that category already exists")
        nxt = conn.execute("SELECT COALESCE(MAX(sort), 0) + 1 FROM backpack_categories").fetchone()[0]
        conn.execute("INSERT INTO backpack_categories (key, label, sort) VALUES (?, ?, ?)", (key, label, nxt))
        return {"categories": _categories(conn)}


@router.delete("/categories/{key}")
def delete_category(key: str, _: str = Depends(caller)) -> dict:
    """Items in the category are left without a category; the category goes away."""
    with db.connect() as conn:
        _sync_categories(conn)
        if conn.execute("DELETE FROM backpack_categories WHERE key = ?", (key,)).rowcount == 0:
            raise HTTPException(404, "not found")
        moved = conn.execute("UPDATE backpack_items SET grp = '', updated_at = ? WHERE grp = ?", (db.now_utc(), key)).rowcount
        return {"moved": moved, "categories": _categories(conn)}


@router.get("")
def list_items(_: str = Depends(caller)) -> dict:
    with db.connect() as conn:
        return {"items": [_shape(r) for r in conn.execute(f"SELECT {COLS} FROM backpack_items ORDER BY lower(name)")]}


@router.post("", status_code=201)
def add_item(body: ItemIn, _: str = Depends(caller)) -> dict:
    _day(body.day)
    now = db.now_utc()
    iid = uuid.uuid4().hex
    with db.connect() as conn:
        conn.execute(
            "INSERT INTO backpack_items (id, name, grp, unit, quantity, counted_at, use_qty, use_every, use_period, reorder_at, note, created_at, updated_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (iid, body.name.strip(), body.group.strip(), body.unit.strip(), body.quantity, body.day, body.use_qty, body.use_every, body.use_period,
             body.reorder_at, body.note.strip(), now, now))
        _sync_categories(conn)
        return _shape(_get(conn, iid))


@router.patch("/{item_id}")
def patch_item(item_id: str, body: ItemPatch, _: str = Depends(caller)) -> dict:
    data = body.model_dump(exclude_unset=True)
    day = data.pop("day", None)
    with db.connect() as conn:
        row = _get(conn, item_id)
        fields: dict = {}
        for k in ("name", "unit", "note"):
            if data.get(k) is not None:
                fields[k] = data[k].strip()
        if fields.get("name") == "":
            raise HTTPException(422, "name cannot be empty")
        if data.get("group") is not None:
            fields["grp"] = data["group"].strip()
        for k in ("use_qty", "use_every", "use_period", "reorder_at"):
            if data.get(k) is not None:
                fields[k] = data[k]
        if any(k in fields for k in ("use_qty", "use_every", "use_period")):
            # settle what was used so far at the old rate, so the new rate only applies from today on
            today = _day(day) if day else date.today()
            fields["quantity"] = round(_left(row, today), 6)
            fields["counted_at"] = today.isoformat()
        if fields:
            fields["updated_at"] = db.now_utc()
            conn.execute(f"UPDATE backpack_items SET {', '.join(k + ' = ?' for k in fields)} WHERE id = ?", (*fields.values(), item_id))
            _sync_categories(conn)
        return _shape(_get(conn, item_id))


@router.post("/{item_id}/buy")
def buy(item_id: str, body: BuyIn, _: str = Depends(caller)) -> dict:
    """You bought more: what is left today plus what you bought becomes the new stock, counted today."""
    today = _day(body.day)
    with db.connect() as conn:
        row = _get(conn, item_id)
        conn.execute("UPDATE backpack_items SET quantity = ?, counted_at = ?, last_bought_at = ?, updated_at = ? WHERE id = ?",
                     (round(_left(row, today) + body.amount, 6), today.isoformat(), today.isoformat(), db.now_utc(), item_id))
        return _shape(_get(conn, item_id))


@router.post("/{item_id}/count")
def count(item_id: str, body: CountIn, _: str = Depends(caller)) -> dict:
    """You counted what is really left: that becomes the stock as of today."""
    today = _day(body.day)
    with db.connect() as conn:
        _get(conn, item_id)
        conn.execute("UPDATE backpack_items SET quantity = ?, counted_at = ?, updated_at = ? WHERE id = ?", (body.quantity, today.isoformat(), db.now_utc(), item_id))
        return _shape(_get(conn, item_id))


@router.delete("/{item_id}", status_code=204)
def delete_item(item_id: str, _: str = Depends(caller)) -> Response:
    with db.connect() as conn:
        if conn.execute("DELETE FROM backpack_items WHERE id = ?", (item_id,)).rowcount == 0:
            raise HTTPException(404, "not found")
    return Response(status_code=204)
