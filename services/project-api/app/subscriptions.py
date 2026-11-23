"""Recurring payments: a name, an amount, how often it repeats, the date of the next payment, a category and, optionally, the card that pays it.

Categories are your own list (six are created the first time); cards are just a name, the last four digits and a color: never a full number.

Reference copy of the module deployed as /opt/ignis/api/app/subscriptions.py (the project-site API runs on the
server and is not otherwise kept in this repository). It follows goals.py: SQLite through `db.connect()`, the
`caller` dependency for auth, and plain local dates (YYYY-MM-DD) sent by the client.

Register it in app/main.py: `from . import subscriptions`, `subscriptions.init_tables()` in lifespan and
`app.include_router(subscriptions.router)`.
"""
import uuid
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field

from . import db
from .auth import caller

router = APIRouter(prefix="/v1/subscriptions", tags=["subscriptions"])

CYCLE = "^(weekly|monthly|quarterly|yearly)$"
KEY = "^[a-z0-9_]{1,40}$"
COLOR = "^(rose|lavender|apricot|cream|violet|mint|sky|sand)$"
LAST4 = "^(|[0-9]{4})$"
DEFAULT_CATEGORIES = [("entertainment", "Entertainment", "rose"), ("software", "Software", "lavender"), ("health", "Health", "apricot"),
                      ("home", "Home", "cream"), ("money", "Money", "violet"), ("other", "Other", "sand")]
CURRENCY = "^[A-Z]{3}$"


def init_tables() -> None:
    with db.connect() as conn:
        conn.execute(
            """CREATE TABLE IF NOT EXISTS subscriptions (
                   id TEXT PRIMARY KEY, name TEXT NOT NULL, amount REAL NOT NULL, cycle TEXT NOT NULL DEFAULT 'monthly',
                   category TEXT NOT NULL DEFAULT 'other', next_date TEXT NOT NULL, note TEXT,
                   active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL)"""
        )
        conn.execute("CREATE TABLE IF NOT EXISTS subscription_settings (id INTEGER PRIMARY KEY CHECK (id = 1), currency TEXT NOT NULL)")
        conn.execute(
            """CREATE TABLE IF NOT EXISTS subscription_categories (
                   key TEXT PRIMARY KEY, label TEXT NOT NULL, color TEXT NOT NULL DEFAULT 'sand', position INTEGER NOT NULL DEFAULT 0)"""
        )
        conn.execute(
            """CREATE TABLE IF NOT EXISTS subscription_cards (
                   id TEXT PRIMARY KEY, name TEXT NOT NULL, last4 TEXT, color TEXT NOT NULL DEFAULT 'sand',
                   position INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL)"""
        )
        if "card_id" not in {r["name"] for r in conn.execute("PRAGMA table_info(subscriptions)")}:
            conn.execute("ALTER TABLE subscriptions ADD COLUMN card_id TEXT")
        if conn.execute("SELECT COUNT(*) FROM subscription_categories").fetchone()[0] == 0:
            for i, (key, label, color) in enumerate(DEFAULT_CATEGORIES):
                conn.execute("INSERT INTO subscription_categories (key, label, color, position) VALUES (?, ?, ?, ?)", (key, label, color, i))


class SubscriptionIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    amount: float = Field(ge=0, le=1e9)
    cycle: str = Field("monthly", pattern=CYCLE)
    category: str = Field("other", pattern=KEY)
    next_date: str = Field(max_length=10)
    note: Optional[str] = Field(None, max_length=200)
    active: bool = True
    card_id: Optional[str] = Field(None, max_length=40)


class SubscriptionPatch(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=80)
    amount: Optional[float] = Field(None, ge=0, le=1e9)
    cycle: Optional[str] = Field(None, pattern=CYCLE)
    category: Optional[str] = Field(None, pattern=KEY)
    next_date: Optional[str] = Field(None, max_length=10)
    note: Optional[str] = Field(None, max_length=200)
    active: Optional[bool] = None
    card_id: Optional[str] = Field(None, max_length=40)  # empty string takes the card off


class CategoryIn(BaseModel):
    label: str = Field(min_length=1, max_length=30)
    color: str = Field("sand", pattern=COLOR)


class CategoryPatch(BaseModel):
    label: Optional[str] = Field(None, min_length=1, max_length=30)
    color: Optional[str] = Field(None, pattern=COLOR)


class CardIn(BaseModel):
    name: str = Field(min_length=1, max_length=30)
    last4: str = Field("", pattern=LAST4)
    color: str = Field("sand", pattern=COLOR)


class CardPatch(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=30)
    last4: Optional[str] = Field(None, pattern=LAST4)
    color: Optional[str] = Field(None, pattern=COLOR)


class CurrencyIn(BaseModel):
    currency: str = Field(pattern=CURRENCY)


def _check_day(value: str) -> str:
    try:
        date.fromisoformat(value)
    except ValueError:
        raise HTTPException(422, "next_date must be YYYY-MM-DD")
    return value


def _shape(row) -> dict:
    s = dict(row)
    s["active"] = bool(s["active"])
    return s


def _currency(conn) -> str:
    row = conn.execute("SELECT currency FROM subscription_settings WHERE id = 1").fetchone()
    return row["currency"] if row else "USD"


def _need_category(conn, key: str) -> str:
    if not conn.execute("SELECT 1 FROM subscription_categories WHERE key = ?", (key,)).fetchone():
        raise HTTPException(422, "unknown category")
    return key


def _card_or_none(conn, card_id: Optional[str]) -> Optional[str]:
    card_id = (card_id or "").strip()
    if not card_id:
        return None
    if not conn.execute("SELECT 1 FROM subscription_cards WHERE id = ?", (card_id,)).fetchone():
        raise HTTPException(422, "unknown card")
    return card_id


def _renumber(conn, table: str, key_col: str) -> None:
    for i, r in enumerate(conn.execute(f"SELECT {key_col} FROM {table} ORDER BY position, rowid").fetchall()):
        conn.execute(f"UPDATE {table} SET position = ? WHERE {key_col} = ?", (i, r[0]))


def _categories(conn) -> list[dict]:
    return [dict(r) for r in conn.execute(
        "SELECT c.key, c.label, c.color, c.position, (SELECT COUNT(*) FROM subscriptions s WHERE s.category = c.key) AS uses "
        "FROM subscription_categories c ORDER BY c.position, c.rowid")]


def _cards(conn) -> list[dict]:
    return [dict(r) for r in conn.execute(
        "SELECT c.id, c.name, c.last4, c.color, c.position, (SELECT COUNT(*) FROM subscriptions s WHERE s.card_id = c.id) AS uses "
        "FROM subscription_cards c ORDER BY c.position, c.rowid")]


@router.get("")
def list_subscriptions(_: str = Depends(caller)) -> dict:
    with db.connect() as conn:
        items = [_shape(r) for r in conn.execute("SELECT * FROM subscriptions ORDER BY created_at, id")]
        return {"items": items, "currency": _currency(conn), "categories": _categories(conn), "cards": _cards(conn)}


@router.post("", status_code=201)
def create_subscription(body: SubscriptionIn, _: str = Depends(caller)) -> dict:
    sid = uuid.uuid4().hex
    with db.connect() as conn:
        conn.execute(
            "INSERT INTO subscriptions (id, name, amount, cycle, category, next_date, note, active, created_at, card_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (sid, body.name.strip(), body.amount, body.cycle, _need_category(conn, body.category), _check_day(body.next_date),
             (body.note or "").strip() or None, int(body.active), db.now_utc(), _card_or_none(conn, body.card_id)))
        return _shape(conn.execute("SELECT * FROM subscriptions WHERE id = ?", (sid,)).fetchone())


@router.patch("/{subscription_id}")
def patch_subscription(subscription_id: str, body: SubscriptionPatch, _: str = Depends(caller)) -> dict:
    data = body.model_dump(exclude_unset=True)
    with db.connect() as conn:
        if not conn.execute("SELECT 1 FROM subscriptions WHERE id = ?", (subscription_id,)).fetchone():
            raise HTTPException(404, "not found")
        fields: dict = {}
        for k in ("name", "amount", "cycle", "category"):
            if data.get(k) is not None:
                fields[k] = data[k].strip() if isinstance(data[k], str) else data[k]
        if "category" in fields:
            _need_category(conn, fields["category"])
        if "card_id" in data:
            fields["card_id"] = _card_or_none(conn, data["card_id"])
        if data.get("next_date") is not None:
            fields["next_date"] = _check_day(data["next_date"])
        if "note" in data:
            fields["note"] = (data["note"] or "").strip() or None
        if data.get("active") is not None:
            fields["active"] = int(data["active"])
        if fields:
            conn.execute(f"UPDATE subscriptions SET {', '.join(k + ' = ?' for k in fields)} WHERE id = ?", (*fields.values(), subscription_id))
        return _shape(conn.execute("SELECT * FROM subscriptions WHERE id = ?", (subscription_id,)).fetchone())


@router.delete("/{subscription_id}", status_code=204)
def delete_subscription(subscription_id: str, _: str = Depends(caller)) -> Response:
    with db.connect() as conn:
        if conn.execute("DELETE FROM subscriptions WHERE id = ?", (subscription_id,)).rowcount == 0:
            raise HTTPException(404, "not found")
    return Response(status_code=204)


@router.put("/currency")
def set_currency(body: CurrencyIn, _: str = Depends(caller)) -> dict:
    with db.connect() as conn:
        conn.execute("INSERT INTO subscription_settings (id, currency) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET currency = excluded.currency", (body.currency,))
    return {"currency": body.currency}


# ---- categories ----

@router.post("/categories", status_code=201)
def add_category(body: CategoryIn, _: str = Depends(caller)) -> dict:
    label = body.label.strip()
    if not label:
        raise HTTPException(422, "name is required")
    with db.connect() as conn:
        if conn.execute("SELECT 1 FROM subscription_categories WHERE lower(label) = lower(?)", (label,)).fetchone():
            raise HTTPException(409, "there is already a category with this name")
        key = "c_" + uuid.uuid4().hex[:10]
        pos = conn.execute("SELECT COALESCE(MAX(position), -1) + 1 FROM subscription_categories").fetchone()[0]
        conn.execute("INSERT INTO subscription_categories (key, label, color, position) VALUES (?, ?, ?, ?)", (key, label, body.color, pos))
        return next(c for c in _categories(conn) if c["key"] == key)


@router.patch("/categories/{key}")
def patch_category(key: str, body: CategoryPatch, _: str = Depends(caller)) -> dict:
    data = body.model_dump(exclude_unset=True)
    with db.connect() as conn:
        if not conn.execute("SELECT 1 FROM subscription_categories WHERE key = ?", (key,)).fetchone():
            raise HTTPException(404, "not found")
        if data.get("label") is not None:
            label = data["label"].strip()
            if not label:
                raise HTTPException(422, "name is required")
            if conn.execute("SELECT 1 FROM subscription_categories WHERE lower(label) = lower(?) AND key != ?", (label, key)).fetchone():
                raise HTTPException(409, "there is already a category with this name")
            conn.execute("UPDATE subscription_categories SET label = ? WHERE key = ?", (label, key))
        if data.get("color") is not None:
            conn.execute("UPDATE subscription_categories SET color = ? WHERE key = ?", (data["color"], key))
        return next(c for c in _categories(conn) if c["key"] == key)


@router.delete("/categories/{key}")
def delete_category(key: str, move_to: Optional[str] = None, _: str = Depends(caller)) -> dict:
    """Remove a category. Subscriptions in it go to `move_to` (required when it is in use). At least one category always stays."""
    with db.connect() as conn:
        if not conn.execute("SELECT 1 FROM subscription_categories WHERE key = ?", (key,)).fetchone():
            raise HTTPException(404, "not found")
        if conn.execute("SELECT COUNT(*) FROM subscription_categories").fetchone()[0] <= 1:
            raise HTTPException(409, "keep at least one category")
        uses = conn.execute("SELECT COUNT(*) FROM subscriptions WHERE category = ?", (key,)).fetchone()[0]
        moved = 0
        if uses:
            if not move_to or move_to == key:
                raise HTTPException(409, "choose the category these subscriptions move to")
            _need_category(conn, move_to)
            moved = conn.execute("UPDATE subscriptions SET category = ? WHERE category = ?", (move_to, key)).rowcount
        conn.execute("DELETE FROM subscription_categories WHERE key = ?", (key,))
        _renumber(conn, "subscription_categories", "key")
        return {"moved": moved}


# ---- cards ----

@router.post("/cards", status_code=201)
def add_card(body: CardIn, _: str = Depends(caller)) -> dict:
    name = body.name.strip()
    if not name:
        raise HTTPException(422, "name is required")
    with db.connect() as conn:
        if conn.execute("SELECT 1 FROM subscription_cards WHERE lower(name) = lower(?) AND COALESCE(last4, '') = ?", (name, body.last4)).fetchone():
            raise HTTPException(409, "this card is already in the list")
        cid = uuid.uuid4().hex
        pos = conn.execute("SELECT COALESCE(MAX(position), -1) + 1 FROM subscription_cards").fetchone()[0]
        conn.execute("INSERT INTO subscription_cards (id, name, last4, color, position, created_at) VALUES (?, ?, ?, ?, ?, ?)", (cid, name, body.last4 or None, body.color, pos, db.now_utc()))
        return next(c for c in _cards(conn) if c["id"] == cid)


@router.patch("/cards/{card_id}")
def patch_card(card_id: str, body: CardPatch, _: str = Depends(caller)) -> dict:
    data = body.model_dump(exclude_unset=True)
    with db.connect() as conn:
        if not conn.execute("SELECT 1 FROM subscription_cards WHERE id = ?", (card_id,)).fetchone():
            raise HTTPException(404, "not found")
        if data.get("name") is not None:
            name = data["name"].strip()
            if not name:
                raise HTTPException(422, "name is required")
            conn.execute("UPDATE subscription_cards SET name = ? WHERE id = ?", (name, card_id))
        if "last4" in data and data["last4"] is not None:
            conn.execute("UPDATE subscription_cards SET last4 = ? WHERE id = ?", (data["last4"] or None, card_id))
        if data.get("color") is not None:
            conn.execute("UPDATE subscription_cards SET color = ? WHERE id = ?", (data["color"], card_id))
        return next(c for c in _cards(conn) if c["id"] == card_id)


@router.delete("/cards/{card_id}")
def delete_card(card_id: str, _: str = Depends(caller)) -> dict:
    """Remove a card. Subscriptions that used it simply have no card afterwards."""
    with db.connect() as conn:
        if not conn.execute("SELECT 1 FROM subscription_cards WHERE id = ?", (card_id,)).fetchone():
            raise HTTPException(404, "not found")
        detached = conn.execute("UPDATE subscriptions SET card_id = NULL WHERE card_id = ?", (card_id,)).rowcount
        conn.execute("DELETE FROM subscription_cards WHERE id = ?", (card_id,))
        return {"detached": detached}
