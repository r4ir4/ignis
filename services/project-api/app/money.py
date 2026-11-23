"""Money: transactions imported from account statements (for example the Mercado Pago PDF statement).

Reference copy of the module deployed as /opt/ignis/api/app/money.py. Same pattern as subscriptions.py: SQLite through
`db.connect()`, the `caller` dependency for auth, plain local dates (YYYY-MM-DD). Amounts are integer cents, positive
for money in and negative for money out. Each row carries a `fingerprint` (a hash of the date, description, amount and
statement id the client computed), unique per account, so importing overlapping statements never duplicates rows.

Register it in app/main.py: `from . import money`, `money.init_tables()` in lifespan and `app.include_router(money.router)`.
"""
import uuid
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field

from . import db
from .auth import caller

router = APIRouter(prefix="/v1/money", tags=["money"])

MAX_IMPORT = 2000


def init_tables() -> None:
    with db.connect() as conn:
        conn.execute(
            """CREATE TABLE IF NOT EXISTS money_transactions (
                   id TEXT PRIMARY KEY, day TEXT NOT NULL, description TEXT NOT NULL, amount_cents INTEGER NOT NULL,
                   balance_cents INTEGER, category TEXT, source TEXT NOT NULL DEFAULT 'mercadopago',
                   ref TEXT, fingerprint TEXT NOT NULL, created_at TEXT NOT NULL)"""
        )
        conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS money_tx_fp ON money_transactions (source, fingerprint)")
        conn.execute("CREATE INDEX IF NOT EXISTS money_tx_day ON money_transactions (day)")
        conn.execute(
            """CREATE TABLE IF NOT EXISTS money_rules (
                   id TEXT PRIMARY KEY, match TEXT NOT NULL, category TEXT NOT NULL, recurring INTEGER NOT NULL DEFAULT 0,
                   created_at TEXT NOT NULL)"""
        )


class TxIn(BaseModel):
    day: str = Field(max_length=10)
    description: str = Field(min_length=1, max_length=300)
    amount_cents: int = Field(ge=-10**12, le=10**12)
    balance_cents: Optional[int] = Field(None, ge=-10**12, le=10**12)
    ref: Optional[str] = Field(None, max_length=60)
    fingerprint: str = Field(min_length=8, max_length=80, pattern="^[A-Za-z0-9_-]+$")


class ImportIn(BaseModel):
    source: str = Field("mercadopago", pattern="^[a-z0-9_]{1,30}$")
    items: list[TxIn] = Field(max_length=MAX_IMPORT)


class TxPatch(BaseModel):
    category: Optional[str] = Field(None, max_length=40)


class RuleIn(BaseModel):
    match: str = Field(min_length=2, max_length=120)  # text the description contains, case and accents ignored by the client
    category: str = Field(min_length=1, max_length=40)
    recurring: bool = False


class RulePatch(BaseModel):
    match: Optional[str] = Field(None, min_length=2, max_length=120)
    category: Optional[str] = Field(None, min_length=1, max_length=40)
    recurring: Optional[bool] = None


def _day(value: str) -> str:
    try:
        date.fromisoformat(value)
    except ValueError:
        raise HTTPException(422, "dates must be YYYY-MM-DD")
    return value


@router.get("")
def list_transactions(month: Optional[str] = None, limit: int = 1000, _: str = Depends(caller)) -> dict:
    limit = max(1, min(limit, 5000))
    sql, args = "SELECT id, day, description, amount_cents, balance_cents, category, source, ref FROM money_transactions", []
    if month:
        if len(month) != 7 or not (month[:4] + month[5:]).isdigit() or month[4] != "-":
            raise HTTPException(422, "month must be YYYY-MM")
        sql += " WHERE day >= ? AND day < ?"
        y, m = int(month[:4]), int(month[5:])
        args += [month + "-01", f"{y + (m == 12)}-{(m % 12) + 1:02d}-01"]
    sql += " ORDER BY day DESC, created_at DESC, id LIMIT ?"
    with db.connect() as conn:
        rows = [dict(r) for r in conn.execute(sql, (*args, limit))]
        months = [r["m"] for r in conn.execute("SELECT DISTINCT substr(day, 1, 7) AS m FROM money_transactions ORDER BY m DESC")]
    return {"transactions": rows, "months": months}


@router.post("/import")
def import_transactions(body: ImportIn, _: str = Depends(caller)) -> dict:
    for it in body.items:
        _day(it.day)
    added = skipped = 0
    now = db.now_utc()
    with db.connect() as conn:  # one transaction: a failure leaves nothing half-imported
        for it in body.items:
            cur = conn.execute(
                """INSERT OR IGNORE INTO money_transactions
                   (id, day, description, amount_cents, balance_cents, source, ref, fingerprint, created_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (uuid.uuid4().hex, it.day, it.description.strip(), it.amount_cents, it.balance_cents, body.source, (it.ref or "").strip() or None, it.fingerprint, now))
            if cur.rowcount:
                added += 1
            else:
                skipped += 1
    return {"added": added, "skipped": skipped}


def _rule(row) -> dict:
    return {"id": row["id"], "match": row["match"], "category": row["category"], "recurring": bool(row["recurring"])}


@router.get("/rules")
def list_rules(_: str = Depends(caller)) -> dict:
    with db.connect() as conn:
        return {"rules": [_rule(r) for r in conn.execute("SELECT * FROM money_rules ORDER BY created_at, id")]}


@router.post("/rules", status_code=201)
def create_rule(body: RuleIn, _: str = Depends(caller)) -> dict:
    match, category = body.match.strip(), body.category.strip()
    if len(match) < 2 or not category:
        raise HTTPException(422, "match and category are required")
    rid = uuid.uuid4().hex
    with db.connect() as conn:
        conn.execute("INSERT INTO money_rules (id, match, category, recurring, created_at) VALUES (?, ?, ?, ?, ?)", (rid, match, category, int(body.recurring), db.now_utc()))
        return _rule(conn.execute("SELECT * FROM money_rules WHERE id = ?", (rid,)).fetchone())


@router.patch("/rules/{rule_id}")
def patch_rule(rule_id: str, body: RulePatch, _: str = Depends(caller)) -> dict:
    data = body.model_dump(exclude_unset=True)
    fields: dict = {}
    for k in ("match", "category"):
        if data.get(k) is not None:
            if len(data[k].strip()) < (2 if k == "match" else 1):
                raise HTTPException(422, k + " is too short")
            fields[k] = data[k].strip()
    if data.get("recurring") is not None:
        fields["recurring"] = int(data["recurring"])
    with db.connect() as conn:
        if fields and conn.execute(f"UPDATE money_rules SET {', '.join(k + ' = ?' for k in fields)} WHERE id = ?", (*fields.values(), rule_id)).rowcount == 0:
            raise HTTPException(404, "not found")
        row = conn.execute("SELECT * FROM money_rules WHERE id = ?", (rule_id,)).fetchone()
        if not row:
            raise HTTPException(404, "not found")
        return _rule(row)


@router.delete("/rules/{rule_id}", status_code=204)
def delete_rule(rule_id: str, _: str = Depends(caller)) -> Response:
    with db.connect() as conn:
        if conn.execute("DELETE FROM money_rules WHERE id = ?", (rule_id,)).rowcount == 0:
            raise HTTPException(404, "not found")
    return Response(status_code=204)


@router.patch("/{tx_id}")
def patch_transaction(tx_id: str, body: TxPatch, _: str = Depends(caller)) -> dict:
    category = (body.category or "").strip() or None
    with db.connect() as conn:
        if conn.execute("UPDATE money_transactions SET category = ? WHERE id = ?", (category, tx_id)).rowcount == 0:
            raise HTTPException(404, "not found")
        return dict(conn.execute("SELECT id, day, description, amount_cents, balance_cents, category, source, ref FROM money_transactions WHERE id = ?", (tx_id,)).fetchone())


@router.delete("/{tx_id}", status_code=204)
def delete_transaction(tx_id: str, _: str = Depends(caller)) -> Response:
    with db.connect() as conn:
        if conn.execute("DELETE FROM money_transactions WHERE id = ?", (tx_id,)).rowcount == 0:
            raise HTTPException(404, "not found")
    return Response(status_code=204)
