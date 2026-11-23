"""Cleaning: a schedule of cleaning and organising routines. Each routine repeats on its own rhythm and shows up on the Todo list.

A routine is one of:
  daily    every day
  weekly   on chosen weekdays (one weekday = once a week, two = twice a week, ...), 0 = Monday ... 6 = Sunday
  monthly  on chosen days of the month (1 and 15 = twice a month); a day past the end of a short month falls on its last day
  once     on one date

The Todo list is the place you tick things off, so each occurrence becomes a real todo (category "cleaning") on the day it is
due. (The Todo page shows every open task under Today, so todos are made for today only, never ahead of time.) `cleaning_runs`
remembers which day of which routine already has its todo, so nothing is created twice and a todo you delete from the list is
not brought back. If an earlier occurrence is still not done, the new day shares that todo instead of piling up another one.
Completing it on either page completes it on both.

Register it in app/main.py: `from . import cleaning`, `cleaning.init_tables()` in lifespan and `app.include_router(cleaning.router)`.
`todos.list_todos` calls `cleaning.sync_today()` so the list is always filled in, wherever it is read from.
"""
import json
import os
import uuid
from calendar import monthrange
from datetime import date, datetime, timedelta, timezone
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from pydantic import BaseModel, Field

from . import db
from .auth import caller

router = APIRouter(prefix="/v1/cleaning", tags=["cleaning"])

CATEGORY = "cleaning"
HORIZON = 1  # days (counting today) that get a todo; the Todo page lists every open task under Today, so never create them ahead
TZ = timezone(timedelta(hours=float(os.environ.get("IGNIS_TZ_OFFSET_HOURS", "-3"))))  # Brazil: UTC-3, no daylight saving


def today_local() -> date:
    return datetime.now(TZ).date()


def init_tables() -> None:
    with db.connect() as conn:
        conn.execute(
            """CREATE TABLE IF NOT EXISTS cleaning_tasks (
                   id TEXT PRIMARY KEY, name TEXT NOT NULL, area TEXT NOT NULL DEFAULT '', kind TEXT NOT NULL,
                   weekdays TEXT NOT NULL DEFAULT '[]', month_days TEXT NOT NULL DEFAULT '[]', on_date TEXT,
                   note TEXT NOT NULL DEFAULT '', active INTEGER NOT NULL DEFAULT 1, sort INTEGER NOT NULL DEFAULT 0,
                   created_at TEXT NOT NULL, updated_at TEXT NOT NULL)"""
        )
        conn.execute(
            """CREATE TABLE IF NOT EXISTS cleaning_runs (
                   task_id TEXT NOT NULL, day TEXT NOT NULL, todo_id TEXT NOT NULL, PRIMARY KEY (task_id, day))"""
        )


class TaskIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    area: str = Field("", max_length=60)
    kind: Literal["daily", "weekly", "monthly", "once"]
    weekdays: list[int] = Field(default_factory=list, max_length=7)
    month_days: list[int] = Field(default_factory=list, max_length=31)
    on_date: Optional[str] = Field(None, max_length=10)
    note: str = Field("", max_length=300)


class TaskPatch(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=120)
    area: Optional[str] = Field(None, max_length=60)
    kind: Optional[Literal["daily", "weekly", "monthly", "once"]] = None
    weekdays: Optional[list[int]] = Field(None, max_length=7)
    month_days: Optional[list[int]] = Field(None, max_length=31)
    on_date: Optional[str] = Field(None, max_length=10)
    note: Optional[str] = Field(None, max_length=300)


class DayIn(BaseModel):
    done: bool
    done_day: Optional[str] = Field(None, max_length=10)  # the viewer's local date; defaults to the day itself


def _iso(value: str) -> date:
    try:
        return date.fromisoformat(value)
    except ValueError:
        raise HTTPException(422, "dates must be YYYY-MM-DD")


def _clean(kind: str, weekdays, month_days, on_date) -> tuple[list[int], list[int], Optional[str]]:
    wd = sorted({int(w) for w in weekdays or []})
    md = sorted({int(m) for m in month_days or []})
    if any(w < 0 or w > 6 for w in wd) or any(m < 1 or m > 31 for m in md):
        raise HTTPException(422, "weekdays are 0-6 and month days 1-31")
    if kind == "weekly" and not wd:
        raise HTTPException(422, "choose at least one weekday")
    if kind == "monthly" and not md:
        raise HTTPException(422, "choose at least one day of the month")
    if kind == "once":
        if not on_date:
            raise HTTPException(422, "choose the date")
        _iso(on_date)
    return (wd if kind == "weekly" else []), (md if kind == "monthly" else []), (on_date if kind == "once" else None)


def _task(row) -> dict:
    return {
        "id": row["id"], "name": row["name"], "area": row["area"], "kind": row["kind"],
        "weekdays": json.loads(row["weekdays"] or "[]"), "month_days": json.loads(row["month_days"] or "[]"),
        "on_date": row["on_date"], "note": row["note"], "created_at": row["created_at"],
    }


def occurs(task: dict, d: date) -> bool:
    kind = task["kind"]
    if kind == "daily":
        return True
    if kind == "weekly":
        return d.weekday() in task["weekdays"]
    if kind == "monthly":
        last = monthrange(d.year, d.month)[1]
        return any(min(m, last) == d.day for m in task["month_days"])
    return task["on_date"] == d.isoformat()


def _title(task: dict) -> str:
    return f"{task['area']}: {task['name']}" if task["area"] else task["name"]


def _tasks(conn) -> list[dict]:
    return [_task(r) for r in conn.execute("SELECT * FROM cleaning_tasks WHERE active = 1 ORDER BY sort, created_at, id")]


def _make_todo(conn, task: dict, day: date) -> str:
    todo_id = uuid.uuid4().hex
    conn.execute("INSERT INTO todos (id, title, category, day, created_at) VALUES (?, ?, ?, ?, ?)", (todo_id, _title(task), CATEGORY, day.isoformat(), db.now_utc()))
    conn.execute("INSERT INTO cleaning_runs (task_id, day, todo_id) VALUES (?, ?, ?)", (task["id"], day.isoformat(), todo_id))
    return todo_id


def sync(conn, today: date) -> int:
    """Make the todos that are due from today (HORIZON days). Returns how many new todos were created."""
    made = 0
    for task in _tasks(conn):
        for i in range(HORIZON):
            d = today + timedelta(days=i)
            key = d.isoformat()
            if not occurs(task, d) or conn.execute("SELECT 1 FROM cleaning_runs WHERE task_id = ? AND day = ?", (task["id"], key)).fetchone():
                continue
            carry = conn.execute(
                """SELECT r.todo_id FROM cleaning_runs r JOIN todos t ON t.id = r.todo_id
                   WHERE r.task_id = ? AND r.day < ? AND t.done_day IS NULL ORDER BY r.day DESC LIMIT 1""", (task["id"], key)).fetchone()
            if carry:  # the last one is still open: today's occurrence is that same todo
                conn.execute("INSERT INTO cleaning_runs (task_id, day, todo_id) VALUES (?, ?, ?)", (task["id"], key, carry["todo_id"]))
            else:
                _make_todo(conn, task, d)
                made += 1
    return made


def sync_today() -> int:
    with db.connect() as conn:
        return sync(conn, today_local())


def _drop_open_future(conn, task_id: str, today: date) -> None:
    """Forget the not-yet-done todos of a routine from today on (used when its schedule changes or it is removed)."""
    rows = conn.execute("SELECT r.todo_id, r.day FROM cleaning_runs r WHERE r.task_id = ? AND r.day >= ?", (task_id, today.isoformat())).fetchall()
    for r in rows:
        open_todo = conn.execute("SELECT 1 FROM todos WHERE id = ? AND done_day IS NULL", (r["todo_id"],)).fetchone()
        if open_todo:
            conn.execute("DELETE FROM todos WHERE id = ?", (r["todo_id"],))
            conn.execute("DELETE FROM cleaning_runs WHERE task_id = ? AND day = ?", (task_id, r["day"]))


@router.get("/overview")
def overview(start: str = Query(..., max_length=10), days: int = Query(7, ge=1, le=42), _: str = Depends(caller)) -> dict:
    """The routines, and for each day in the range what is scheduled and whether it is done."""
    first = _iso(start)
    with db.connect() as conn:
        sync(conn, today_local())
        tasks = _tasks(conn)
        runs = {(r["task_id"], r["day"]): (r["todo_id"], r["done_day"]) for r in conn.execute(
            """SELECT r.task_id, r.day, r.todo_id, t.done_day FROM cleaning_runs r LEFT JOIN todos t ON t.id = r.todo_id
               WHERE r.day >= ? AND r.day < ?""", (first.isoformat(), (first + timedelta(days=days)).isoformat()))}
    out = []
    for i in range(days):
        d = first + timedelta(days=i)
        key = d.isoformat()
        items = []
        for task in tasks:
            run = runs.get((task["id"], key))
            if occurs(task, d) and (run or task["created_at"][:10] <= key or d >= today_local()):
                items.append({"task_id": task["id"], "name": task["name"], "area": task["area"], "kind": task["kind"],
                              "todo_id": run[0] if run else None, "done": bool(run and run[1])})
        out.append({"day": key, "items": items})
    return {"tasks": tasks, "days": out, "today": today_local().isoformat()}


@router.post("/tasks", status_code=201)
def add_task(body: TaskIn, _: str = Depends(caller)) -> dict:
    wd, md, on = _clean(body.kind, body.weekdays, body.month_days, body.on_date)
    now = db.now_utc()
    tid = uuid.uuid4().hex
    with db.connect() as conn:
        order = conn.execute("SELECT COALESCE(MAX(sort), 0) + 1 FROM cleaning_tasks").fetchone()[0]
        conn.execute(
            "INSERT INTO cleaning_tasks (id, name, area, kind, weekdays, month_days, on_date, note, active, sort, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)",
            (tid, body.name.strip(), body.area.strip(), body.kind, json.dumps(wd), json.dumps(md), on, body.note.strip(), order, now, now),
        )
        sync(conn, today_local())
        return _task(conn.execute("SELECT * FROM cleaning_tasks WHERE id = ?", (tid,)).fetchone())


@router.patch("/tasks/{task_id}")
def patch_task(task_id: str, body: TaskPatch, _: str = Depends(caller)) -> dict:
    data = body.model_dump(exclude_unset=True)
    with db.connect() as conn:
        row = conn.execute("SELECT * FROM cleaning_tasks WHERE id = ? AND active = 1", (task_id,)).fetchone()
        if not row:
            raise HTTPException(404, "not found")
        cur = _task(row)
        kind = data.get("kind") or cur["kind"]
        wd, md, on = _clean(kind, data.get("weekdays", cur["weekdays"]), data.get("month_days", cur["month_days"]), data.get("on_date", cur["on_date"]))
        name = (data.get("name") or cur["name"]).strip()
        if not name:
            raise HTTPException(422, "name cannot be empty")
        area = (data["area"] if data.get("area") is not None else cur["area"]).strip()
        note = (data["note"] if data.get("note") is not None else cur["note"]).strip()
        conn.execute(
            "UPDATE cleaning_tasks SET name = ?, area = ?, kind = ?, weekdays = ?, month_days = ?, on_date = ?, note = ?, updated_at = ? WHERE id = ?",
            (name, area, kind, json.dumps(wd), json.dumps(md), on, note, db.now_utc(), task_id),
        )
        _drop_open_future(conn, task_id, today_local())  # the list is rebuilt from the new schedule
        sync(conn, today_local())
        return _task(conn.execute("SELECT * FROM cleaning_tasks WHERE id = ?", (task_id,)).fetchone())


@router.delete("/tasks/{task_id}", status_code=204)
def delete_task(task_id: str, _: str = Depends(caller)) -> Response:
    with db.connect() as conn:
        if conn.execute("UPDATE cleaning_tasks SET active = 0, updated_at = ? WHERE id = ? AND active = 1", (db.now_utc(), task_id)).rowcount == 0:
            raise HTTPException(404, "not found")
        _drop_open_future(conn, task_id, today_local())
    return Response(status_code=204)


@router.put("/tasks/{task_id}/days/{day}")
def set_day(task_id: str, day: str, body: DayIn, _: str = Depends(caller)) -> dict:
    """Tick or untick one day of a routine; the matching todo follows."""
    d = _iso(day)
    with db.connect() as conn:
        row = conn.execute("SELECT * FROM cleaning_tasks WHERE id = ? AND active = 1", (task_id,)).fetchone()
        if not row:
            raise HTTPException(404, "not found")
        task = _task(row)
        run = conn.execute("SELECT todo_id FROM cleaning_runs WHERE task_id = ? AND day = ?", (task_id, day)).fetchone()
        todo_id = run["todo_id"] if run and conn.execute("SELECT 1 FROM todos WHERE id = ?", (run["todo_id"],)).fetchone() else None
        if todo_id is None:
            if not occurs(task, d):
                raise HTTPException(422, "that routine is not scheduled on that day")
            conn.execute("DELETE FROM cleaning_runs WHERE task_id = ? AND day = ?", (task_id, day))
            todo_id = _make_todo(conn, task, d)
        if body.done:
            conn.execute("UPDATE todos SET done_day = ?, done_at = ? WHERE id = ?", (_iso(body.done_day).isoformat() if body.done_day else day, db.now_utc(), todo_id))
        else:
            conn.execute("UPDATE todos SET done_day = NULL, done_at = NULL WHERE id = ?", (todo_id,))
        return {"task_id": task_id, "day": day, "todo_id": todo_id, "done": body.done}
