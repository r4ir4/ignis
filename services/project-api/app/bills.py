"""Bills: what you pay every month, each with a due day of the month, and which of them are paid in a given month.

A bill is a recurring item (name, due day, an optional usual amount). Each month you tick it as paid, and may record what it
really cost that month (a card statement changes every month). Amounts are integer cents, like Money.
"""
import re
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from pydantic import BaseModel, Field

from . import db
from .auth import caller

router = APIRouter(prefix="/v1/bills", tags=["bills"])

MONTH_PATTERN = r"^\d{4}-(0[1-9]|1[0-2])$"
MAX_CENTS = 100_000_000_000


def init_tables() -> None:
    with db.connect() as conn:
        conn.execute(
            """CREATE TABLE IF NOT EXISTS bills (
                   id TEXT PRIMARY KEY, name TEXT NOT NULL, due_day INTEGER NOT NULL, amount_cents INTEGER,
                   note TEXT NOT NULL DEFAULT '', active INTEGER NOT NULL DEFAULT 1, sort INTEGER NOT NULL DEFAULT 0,
                   created_at TEXT NOT NULL, updated_at TEXT NOT NULL)"""
        )
        conn.execute(
            """CREATE TABLE IF NOT EXISTS bill_months (
                   bill_id TEXT NOT NULL, month TEXT NOT NULL, paid INTEGER NOT NULL DEFAULT 0, paid_at TEXT, amount_cents INTEGER,
                   PRIMARY KEY (bill_id, month))"""
        )


class BillIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    due_day: int = Field(ge=1, le=31)
    amount_cents: Optional[int] = Field(None, ge=0, le=MAX_CENTS)
    note: str = Field("", max_length=300)


class BillPatch(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=120)
    due_day: Optional[int] = Field(None, ge=1, le=31)
    amount_cents: Optional[int] = Field(None, ge=0, le=MAX_CENTS)  # send null to clear the usual amount
    note: Optional[str] = Field(None, max_length=300)


class MonthIn(BaseModel):
    paid: Optional[bool] = None
    amount_cents: Optional[int] = Field(None, ge=0, le=MAX_CENTS)  # what it cost this month; null clears it


def _bill(conn, bill_id: str) -> dict:
    row = conn.execute(
        "SELECT id, name, due_day, amount_cents, note, sort, created_at, updated_at FROM bills WHERE id = ? AND active = 1", (bill_id,)
    ).fetchone()
    if not row:
        raise HTTPException(404, "not found")
    return dict(row)


def _month_row(conn, bill_id: str, month: str) -> dict:
    row = conn.execute("SELECT paid, paid_at, amount_cents FROM bill_months WHERE bill_id = ? AND month = ?", (bill_id, month)).fetchone()
    return {"paid": bool(row["paid"]), "paid_at": row["paid_at"], "month_amount_cents": row["amount_cents"]} if row else {"paid": False, "paid_at": None, "month_amount_cents": None}


@router.get("/overview")
def overview(month: str = Query(..., pattern=MONTH_PATTERN), _: str = Depends(caller)) -> dict:
    with db.connect() as conn:
        rows = conn.execute(
            """SELECT b.id, b.name, b.due_day, b.amount_cents, b.note, b.sort, m.paid, m.paid_at, m.amount_cents AS month_amount_cents
               FROM bills b LEFT JOIN bill_months m ON m.bill_id = b.id AND m.month = ?
               WHERE b.active = 1 ORDER BY b.due_day, b.sort, b.name""",
            (month,),
        ).fetchall()
    bills = [{**dict(r), "paid": bool(r["paid"])} for r in rows]
    return {"month": month, "bills": bills}


@router.post("", status_code=201)
def add_bill(body: BillIn, _: str = Depends(caller)) -> dict:
    now = db.now_utc()
    row = {"id": uuid.uuid4().hex, "name": body.name.strip(), "due_day": body.due_day, "amount_cents": body.amount_cents,
           "note": body.note.strip(), "created_at": now, "updated_at": now}
    if not row["name"]:
        raise HTTPException(422, "name cannot be empty")
    with db.connect() as conn:
        row["sort"] = conn.execute("SELECT COALESCE(MAX(sort), 0) + 1 FROM bills").fetchone()[0]
        conn.execute(f"INSERT INTO bills ({', '.join(row)}) VALUES ({', '.join('?' * len(row))})", tuple(row.values()))
        return _bill(conn, row["id"])


@router.patch("/{bill_id}")
def patch_bill(bill_id: str, body: BillPatch, _: str = Depends(caller)) -> dict:
    data = body.model_dump(exclude_unset=True)
    for k in ("name", "note"):
        if data.get(k) is not None:
            data[k] = data[k].strip()
    for k in ("name", "due_day", "note"):
        if k in data and data[k] is None:
            data.pop(k)  # these cannot be cleared; leaving them out keeps the old value
    if data.get("name") == "":
        raise HTTPException(422, "name cannot be empty")
    with db.connect() as conn:
        _bill(conn, bill_id)
        if data:
            data["updated_at"] = db.now_utc()
            conn.execute(f"UPDATE bills SET {', '.join(k + ' = ?' for k in data)} WHERE id = ?", (*data.values(), bill_id))
        return _bill(conn, bill_id)


@router.delete("/{bill_id}", status_code=204)
def delete_bill(bill_id: str, _: str = Depends(caller)) -> Response:
    with db.connect() as conn:
        if conn.execute("DELETE FROM bills WHERE id = ?", (bill_id,)).rowcount == 0:
            raise HTTPException(404, "not found")
        conn.execute("DELETE FROM bill_months WHERE bill_id = ?", (bill_id,))
    return Response(status_code=204)


@router.put("/{bill_id}/months/{month}")
def set_month(bill_id: str, month: str, body: MonthIn, _: str = Depends(caller)) -> dict:
    if not re.match(MONTH_PATTERN, month):
        raise HTTPException(422, "month must be YYYY-MM")
    data = body.model_dump(exclude_unset=True)
    with db.connect() as conn:
        _bill(conn, bill_id)
        cur = _month_row(conn, bill_id, month)
        paid = data["paid"] if data.get("paid") is not None else cur["paid"]
        amount = data["amount_cents"] if "amount_cents" in data else cur["month_amount_cents"]
        paid_at = (cur["paid_at"] or db.now_utc()) if paid else None
        conn.execute(
            """INSERT INTO bill_months (bill_id, month, paid, paid_at, amount_cents) VALUES (?, ?, ?, ?, ?)
               ON CONFLICT (bill_id, month) DO UPDATE SET paid = excluded.paid, paid_at = excluded.paid_at, amount_cents = excluded.amount_cents""",
            (bill_id, month, int(paid), paid_at, amount),
        )
        return {"bill_id": bill_id, "month": month, **_month_row(conn, bill_id, month)}
