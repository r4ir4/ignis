"""Rotina: a weekly timetable in 30-minute blocks (05:30 to 22:30) with one line of text per block and weekday, ticked off as you go.

A cell belongs to a weekday and a slot. The usual text repeats every week (week_start = ''); a cell can also be changed for one week only (an override
stored under that week's Monday; an empty override hides the repeating text for that week). Ticks are per real date and slot.

Reference copy for /opt/ignis/api/app/routine.py. Register it in app/main.py: `from . import routine`, `routine.init_tables()` in lifespan and
`app.include_router(routine.router)`.
"""
from datetime import date, datetime, timedelta, timezone
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from . import db
from .auth import caller

router = APIRouter(prefix="/v1/routine", tags=["routine"])


def _slots() -> list[str]:
    out, minutes = [], 5 * 60 + 30
    while minutes <= 22 * 60 + 30:
        out.append("%02d:%02d" % divmod(minutes, 60))
        minutes += 30
    return out


SLOTS = _slots()


def init_tables() -> None:
    with db.connect() as conn:
        conn.execute(
            """CREATE TABLE IF NOT EXISTS routine_cells (
                   week_start TEXT NOT NULL DEFAULT '', weekday INTEGER NOT NULL, slot TEXT NOT NULL, text TEXT NOT NULL,
                   PRIMARY KEY (week_start, weekday, slot))"""
        )
        conn.execute(
            """CREATE TABLE IF NOT EXISTS routine_done (
                   day TEXT NOT NULL, slot TEXT NOT NULL, done_at TEXT NOT NULL, PRIMARY KEY (day, slot))"""
        )


def _monday(value: str) -> date:
    try:
        d = date.fromisoformat(value)
    except ValueError:
        raise HTTPException(422, "week must be YYYY-MM-DD")
    if d.weekday() != 0:
        raise HTTPException(422, "week must start on a Monday")
    return d


def _week(conn, start: date) -> dict:
    key = start.isoformat()
    cells: dict[tuple[int, str], dict] = {}
    for r in conn.execute("SELECT weekday, slot, text FROM routine_cells WHERE week_start = ''"):
        cells[(r["weekday"], r["slot"])] = {"weekday": r["weekday"], "slot": r["slot"], "text": r["text"], "scope": "every"}
    for r in conn.execute("SELECT weekday, slot, text FROM routine_cells WHERE week_start = ?", (key,)):
        if r["text"]:
            cells[(r["weekday"], r["slot"])] = {"weekday": r["weekday"], "slot": r["slot"], "text": r["text"], "scope": "week"}
        else:
            cells.pop((r["weekday"], r["slot"]), None)
    days = [(start + timedelta(days=i)).isoformat() for i in range(7)]
    done = [{"day": r["day"], "slot": r["slot"]} for r in conn.execute(
        "SELECT day, slot FROM routine_done WHERE day >= ? AND day <= ?", (days[0], days[-1]))]
    return {"start": key, "slots": SLOTS, "cells": sorted(cells.values(), key=lambda c: (c["weekday"], c["slot"])), "done": done}


@router.get("/week/{start}")
def get_week(start: str, _: str = Depends(caller)) -> dict:
    d = _monday(start)
    with db.connect() as conn:
        return _week(conn, d)


class CellEdit(BaseModel):
    weekdays: list[int] = Field(min_length=1, max_length=7)
    slot: str
    to_slot: Optional[str] = None
    text: str = Field("", max_length=80)
    scope: Literal["every", "week"] = "every"
    week_start: str = ""


@router.put("/cell")
def edit_cell(body: CellEdit, _: str = Depends(caller)) -> dict:
    """Set (or clear, with empty text) the text of one slot, or of every slot from `slot` to `to_slot`, on the chosen weekdays."""
    if body.slot not in SLOTS or (body.to_slot is not None and body.to_slot not in SLOTS):
        raise HTTPException(422, "unknown time slot")
    first, last = SLOTS.index(body.slot), SLOTS.index(body.to_slot or body.slot)
    if last < first:
        raise HTTPException(422, "the end of the block is before its start")
    if any(not 0 <= w <= 6 for w in body.weekdays):
        raise HTTPException(422, "weekday must be 0 (Monday) to 6 (Sunday)")
    text = body.text.strip()
    week = _monday(body.week_start) if body.scope == "week" or body.week_start else None
    with db.connect() as conn:
        for weekday in sorted(set(body.weekdays)):
            for slot in SLOTS[first:last + 1]:
                if body.scope == "every":
                    if text:
                        conn.execute("INSERT INTO routine_cells (week_start, weekday, slot, text) VALUES ('', ?, ?, ?) "
                                     "ON CONFLICT(week_start, weekday, slot) DO UPDATE SET text = excluded.text", (weekday, slot, text))
                    else:
                        conn.execute("DELETE FROM routine_cells WHERE week_start = '' AND weekday = ? AND slot = ?", (weekday, slot))
                    if week:  # the week being looked at shows the new text right away
                        conn.execute("DELETE FROM routine_cells WHERE week_start = ? AND weekday = ? AND slot = ?", (week.isoformat(), weekday, slot))
                else:
                    row = conn.execute("SELECT text FROM routine_cells WHERE week_start = '' AND weekday = ? AND slot = ?", (weekday, slot)).fetchone()
                    usual = row["text"] if row else ""
                    if text == usual:
                        conn.execute("DELETE FROM routine_cells WHERE week_start = ? AND weekday = ? AND slot = ?", (week.isoformat(), weekday, slot))
                    else:
                        conn.execute("INSERT INTO routine_cells (week_start, weekday, slot, text) VALUES (?, ?, ?, ?) "
                                     "ON CONFLICT(week_start, weekday, slot) DO UPDATE SET text = excluded.text", (week.isoformat(), weekday, slot, text))
        return _week(conn, week or _monday((date.today() - timedelta(days=date.today().weekday())).isoformat()))


class Tick(BaseModel):
    day: str = Field(max_length=10)
    slot: str
    done: bool


@router.put("/tick")
def tick(body: Tick, _: str = Depends(caller)) -> dict:
    """Mark one block done (or not done) on a date. Only blocks that have text on that date can be ticked."""
    try:
        d = date.fromisoformat(body.day)
    except ValueError:
        raise HTTPException(422, "day must be YYYY-MM-DD")
    if body.slot not in SLOTS:
        raise HTTPException(422, "unknown time slot")
    with db.connect() as conn:
        week = _week(conn, d - timedelta(days=d.weekday()))
        if not any(c["weekday"] == d.weekday() and c["slot"] == body.slot for c in week["cells"]):
            raise HTTPException(404, "nothing is planned in that block")
        if body.done:
            conn.execute("INSERT OR IGNORE INTO routine_done (day, slot, done_at) VALUES (?, ?, ?)", (body.day, body.slot, db.now_utc()))
        else:
            conn.execute("DELETE FROM routine_done WHERE day = ? AND slot = ?", (body.day, body.slot))
    return {"day": body.day, "slot": body.slot, "done": body.done}
