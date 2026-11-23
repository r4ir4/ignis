"""Todos: a day-by-day task list.

Reference copy of the module deployed as /opt/ignis/api/app/todos.py. Same pattern as money.py: SQLite through
`db.connect()`, the `caller` dependency for auth, plain local dates (YYYY-MM-DD).

A task has a planned `day`. While it is open and its day has passed, the client shows it on today (it "rolls over"),
so nothing has to run at midnight. When it is completed the client sends `done_day` (the viewer's local date), and the
task stays on that day from then on. Unchecking clears `done_day`.

Register it in app/main.py: `from . import todos`, `todos.init_tables()` in lifespan and `app.include_router(todos.router)`.
"""
import re
import uuid
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field

from . import db
from .auth import caller

router = APIRouter(prefix="/v1/todos", tags=["todos"])

MAX_DONE = 5000
_CAT = re.compile(r"[^\w-]+", re.UNICODE)


def init_tables() -> None:
    with db.connect() as conn:
        conn.execute(
            """CREATE TABLE IF NOT EXISTS todos (
                   id TEXT PRIMARY KEY, title TEXT NOT NULL, category TEXT, day TEXT NOT NULL,
                   done_day TEXT, done_at TEXT, created_at TEXT NOT NULL)"""
        )
        conn.execute("CREATE INDEX IF NOT EXISTS todos_day ON todos (day)")
        conn.execute("CREATE INDEX IF NOT EXISTS todos_done_day ON todos (done_day)")


class TodoIn(BaseModel):
    title: str = Field(min_length=1, max_length=300)
    category: Optional[str] = Field(None, max_length=40)
    day: str = Field(max_length=10)


class TodoPatch(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=300)
    category: Optional[str] = Field(None, max_length=40)  # empty string clears it
    day: Optional[str] = Field(None, max_length=10)
    done: Optional[bool] = None
    done_day: Optional[str] = Field(None, max_length=10)  # required with done=true


def _day(value: str) -> str:
    try:
        date.fromisoformat(value)
    except ValueError:
        raise HTTPException(422, "dates must be YYYY-MM-DD")
    return value


def _category(value: Optional[str]) -> Optional[str]:
    """`#Work` -> `work`: lower case, no spaces or symbols, at most 30 characters."""
    cleaned = _CAT.sub("", (value or "").strip().lstrip("#").lower().replace(" ", "-"))[:30].strip("-_")
    return cleaned or None


def _todo(row) -> dict:
    return {"id": row["id"], "title": row["title"], "category": row["category"], "day": row["day"], "done_day": row["done_day"], "done": row["done_day"] is not None}


COLS = "id, title, category, day, done_day"


@router.get("")
def list_todos(since: Optional[str] = None, _: str = Depends(caller)) -> dict:
    """Every open task, plus the tasks completed on or after `since` (newest first, at most 5000)."""
    try:  # routines from the Cleaning page get their todos made here, so the list is complete wherever it is read
        from . import cleaning
        cleaning.sync_today()
    except Exception:  # the list must still load if cleaning is missing or broken
        pass
    done_sql, args = f"SELECT {COLS} FROM todos WHERE done_day IS NOT NULL", []
    if since:
        done_sql += " AND done_day >= ?"
        args.append(_day(since))
    done_sql += " ORDER BY done_day DESC, done_at DESC LIMIT ?"
    with db.connect() as conn:
        open_rows = conn.execute(f"SELECT {COLS} FROM todos WHERE done_day IS NULL ORDER BY day, created_at, id").fetchall()
        done_rows = conn.execute(done_sql, (*args, MAX_DONE)).fetchall()
        cats = [r[0] for r in conn.execute("SELECT category FROM todos WHERE category IS NOT NULL GROUP BY category ORDER BY MAX(created_at) DESC")]
    return {"todos": [_todo(r) for r in open_rows + done_rows], "categories": cats}


@router.post("", status_code=201)
def create_todo(body: TodoIn, _: str = Depends(caller)) -> dict:
    title = body.title.strip()
    if not title:
        raise HTTPException(422, "title is required")
    tid = uuid.uuid4().hex
    with db.connect() as conn:
        conn.execute("INSERT INTO todos (id, title, category, day, created_at) VALUES (?, ?, ?, ?, ?)", (tid, title, _category(body.category), _day(body.day), db.now_utc()))
        return _todo(conn.execute(f"SELECT {COLS} FROM todos WHERE id = ?", (tid,)).fetchone())


@router.patch("/{todo_id}")
def patch_todo(todo_id: str, body: TodoPatch, _: str = Depends(caller)) -> dict:
    data = body.model_dump(exclude_unset=True)
    fields: dict = {}
    if data.get("title") is not None:
        if not data["title"].strip():
            raise HTTPException(422, "title is required")
        fields["title"] = data["title"].strip()
    if "category" in data:
        fields["category"] = _category(data["category"])
    if data.get("day") is not None:
        fields["day"] = _day(data["day"])
    if data.get("done") is True:
        if not data.get("done_day"):
            raise HTTPException(422, "done_day is required when completing a task")
        fields["done_day"] = _day(data["done_day"])
        fields["done_at"] = db.now_utc()
    elif data.get("done") is False:
        fields["done_day"] = None
        fields["done_at"] = None
    with db.connect() as conn:
        if fields and conn.execute(f"UPDATE todos SET {', '.join(k + ' = ?' for k in fields)} WHERE id = ?", (*fields.values(), todo_id)).rowcount == 0:
            raise HTTPException(404, "not found")
        row = conn.execute(f"SELECT {COLS} FROM todos WHERE id = ?", (todo_id,)).fetchone()
        if not row:
            raise HTTPException(404, "not found")
        return _todo(row)


@router.delete("/categories/{name}")
def remove_category(name: str, _: str = Depends(caller)) -> dict:
    """Take a category off every task that has it. The tasks themselves stay."""
    cat = _category(name)
    if not cat:
        raise HTTPException(422, "category is required")
    with db.connect() as conn:
        removed = conn.execute("UPDATE todos SET category = NULL WHERE category = ?", (cat,)).rowcount
    return {"removed": removed}


@router.delete("/{todo_id}", status_code=204)
def delete_todo(todo_id: str, _: str = Depends(caller)) -> Response:
    with db.connect() as conn:
        if conn.execute("DELETE FROM todos WHERE id = ?", (todo_id,)).rowcount == 0:
            raise HTTPException(404, "not found")
    return Response(status_code=204)
