"""Personal goals: a title with a category, an optional deadline and one of three ways to measure progress.

`number` goals count toward a target (4 of 20 books), `steps` goals are a checklist, `simple` goals are done or not.
Days are plain local dates (YYYY-MM-DD) sent by the client, so nothing here needs to know a time zone.
"""
import uuid
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from pydantic import BaseModel, Field

from . import db
from .auth import caller

router = APIRouter(prefix="/v1/goals", tags=["goals"])

CATEGORY = "^(body|mind|skills|life|money)$"
KIND = "^(number|steps|simple)$"


def init_tables() -> None:
    with db.connect() as conn:
        conn.execute(
            """CREATE TABLE IF NOT EXISTS goals (
                   id TEXT PRIMARY KEY, title TEXT NOT NULL, note TEXT, category TEXT NOT NULL DEFAULT 'life',
                   kind TEXT NOT NULL DEFAULT 'simple', unit TEXT, target REAL, current REAL NOT NULL DEFAULT 0,
                   start REAL NOT NULL DEFAULT 0, due TEXT, status TEXT NOT NULL DEFAULT 'active',
                   sort INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, completed_at TEXT)"""
        )
        conn.execute(
            """CREATE TABLE IF NOT EXISTS goal_steps (
                   id TEXT PRIMARY KEY, goal_id TEXT NOT NULL REFERENCES goals (id) ON DELETE CASCADE,
                   text TEXT NOT NULL, done INTEGER NOT NULL DEFAULT 0, sort INTEGER NOT NULL DEFAULT 0)"""
        )


class StepIn(BaseModel):
    text: str = Field(min_length=1, max_length=120)
    done: bool = False


class GoalIn(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    note: Optional[str] = Field(None, max_length=1000)
    category: str = Field("life", pattern=CATEGORY)
    kind: str = Field("simple", pattern=KIND)
    unit: Optional[str] = Field(None, max_length=20)
    target: Optional[float] = Field(None, ge=0, le=1e9)
    current: float = Field(0, ge=0, le=1e9)
    due: Optional[str] = Field(None, max_length=10)
    steps: list[StepIn] = Field(default_factory=list, max_length=40)


class GoalPatch(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=120)
    note: Optional[str] = Field(None, max_length=1000)
    category: Optional[str] = Field(None, pattern=CATEGORY)
    kind: Optional[str] = Field(None, pattern=KIND)
    unit: Optional[str] = Field(None, max_length=20)
    target: Optional[float] = Field(None, ge=0, le=1e9)
    current: Optional[float] = Field(None, ge=0, le=1e9)
    due: Optional[str] = Field(None, max_length=10)  # empty string clears it
    status: Optional[str] = Field(None, pattern="^(active|done)$")
    steps: Optional[list[StepIn]] = Field(None, max_length=40)
    today: Optional[str] = Field(None, max_length=10)


def _day(value: str) -> date:
    try:
        return date.fromisoformat(value)
    except ValueError:
        raise HTTPException(422, "day must be YYYY-MM-DD")


def _shape(conn, row, today: Optional[date]) -> dict:
    g = dict(row)
    g["steps"] = [dict(r) | {"done": bool(r["done"])} for r in conn.execute("SELECT id, text, done FROM goal_steps WHERE goal_id = ? ORDER BY sort", (g["id"],))]
    if g["kind"] == "steps":
        total = len(g["steps"])
        pct = (sum(1 for s in g["steps"] if s["done"]) / total * 100) if total else 0
    elif g["kind"] == "number" and g["target"] is not None and g["target"] != g["start"]:
        pct = (g["current"] - g["start"]) / (g["target"] - g["start"]) * 100
    else:
        pct = 100 if g["status"] == "done" else 0
    g["pct"] = round(max(0, min(100, pct)), 1)
    g["days_left"] = (date.fromisoformat(g["due"]) - today).days if g["due"] and today else None
    return g


def _write_steps(conn, goal_id: str, steps: list[StepIn]) -> None:
    conn.execute("DELETE FROM goal_steps WHERE goal_id = ?", (goal_id,))
    for i, s in enumerate(steps):
        conn.execute("INSERT INTO goal_steps (id, goal_id, text, done, sort) VALUES (?, ?, ?, ?, ?)", (uuid.uuid4().hex, goal_id, s.text.strip(), int(s.done), i))


def _check_due(due: Optional[str]) -> Optional[str]:
    if not due:
        return None
    _day(due)
    return due


@router.get("/overview")
def overview(day: str = Query(..., max_length=10), _: str = Depends(caller)) -> dict:
    today = _day(day)
    with db.connect() as conn:
        goals = [_shape(conn, r, today) for r in conn.execute("SELECT * FROM goals ORDER BY sort, created_at")]
    active = [g for g in goals if g["status"] == "active"]
    done = [g for g in goals if g["status"] == "done"]
    return {
        "day": day, "goals": goals, "active": len(active), "done": len(done),
        "done_year": sum(1 for g in done if (g["completed_at"] or "")[:4] == day[:4]),
        "due_soon": sum(1 for g in active if g["days_left"] is not None and 0 <= g["days_left"] <= 14),
        "overdue": sum(1 for g in active if g["days_left"] is not None and g["days_left"] < 0),
        "avg_pct": round(sum(g["pct"] for g in active) / len(active), 1) if active else 0,
    }


@router.post("", status_code=201)
def create_goal(body: GoalIn, _: str = Depends(caller)) -> dict:
    if body.kind == "number" and not body.target:
        raise HTTPException(422, "a number goal needs a target")
    gid = uuid.uuid4().hex
    with db.connect() as conn:
        order = conn.execute("SELECT COALESCE(MAX(sort), 0) + 1 FROM goals").fetchone()[0]
        conn.execute(
            "INSERT INTO goals (id, title, note, category, kind, unit, target, current, start, due, sort, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (gid, body.title.strip(), (body.note or "").strip() or None, body.category, body.kind, (body.unit or "").strip() or None,
             body.target if body.kind == "number" else None, body.current if body.kind == "number" else 0, 0, _check_due(body.due), order, db.now_utc()))
        if body.kind == "steps":
            _write_steps(conn, gid, body.steps)
        return _shape(conn, conn.execute("SELECT * FROM goals WHERE id = ?", (gid,)).fetchone(), None)


@router.patch("/{goal_id}")
def patch_goal(goal_id: str, body: GoalPatch, _: str = Depends(caller)) -> dict:
    data = body.model_dump(exclude_unset=True)
    steps = data.pop("steps", None)
    data.pop("today", None)
    with db.connect() as conn:
        row = conn.execute("SELECT * FROM goals WHERE id = ?", (goal_id,)).fetchone()
        if not row:
            raise HTTPException(404, "not found")
        fields: dict = {}
        for k in ("title", "note", "category", "kind", "unit", "target", "current"):
            if k in data and data[k] is not None:
                fields[k] = data[k].strip() if isinstance(data[k], str) else data[k]
        for k in ("note", "unit"):
            if k in fields:
                fields[k] = fields[k] or None
        if "due" in data:
            fields["due"] = _check_due(data["due"])
        if data.get("status") == "done":
            fields.update(status="done", completed_at=db.now_utc())
        elif data.get("status") == "active":
            fields.update(status="active", completed_at=None)
        if fields:
            conn.execute(f"UPDATE goals SET {', '.join(k + ' = ?' for k in fields)} WHERE id = ?", (*fields.values(), goal_id))
        if steps is not None:
            _write_steps(conn, goal_id, [StepIn(**s) for s in steps])
        today = _day(body.today) if body.today else None
        return _shape(conn, conn.execute("SELECT * FROM goals WHERE id = ?", (goal_id,)).fetchone(), today)


@router.delete("/{goal_id}", status_code=204)
def delete_goal(goal_id: str, _: str = Depends(caller)) -> Response:
    with db.connect() as conn:
        if conn.execute("DELETE FROM goals WHERE id = ?", (goal_id,)).rowcount == 0:
            raise HTTPException(404, "not found")
    return Response(status_code=204)
