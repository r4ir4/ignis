"""Daily habits: a list of habits with a daily target, and an amount per habit per local day.

A habit has a kind. `check` is done N times a day; `count` reaches N of some unit (8 glasses); `time` reaches N
minutes (read for 60); `steps` reaches N steps and is read from the wearables' step counts (Whoop / Apple Watch)
instead of being logged by hand. The amount is always a plain integer in `habit_days.count`.

Days are plain local dates (YYYY-MM-DD) sent by the client, so nothing here needs to know a time zone.
"""
import re
import unicodedata
import uuid
from datetime import date, datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from pydantic import BaseModel, Field

from . import db
from .auth import caller

router = APIRouter(prefix="/v1/habits", tags=["habits"])


def init_tables() -> None:
    with db.connect() as conn:
        conn.execute(
            """CREATE TABLE IF NOT EXISTS habits (
                   id TEXT PRIMARY KEY, name TEXT NOT NULL, section TEXT, target_count INTEGER NOT NULL DEFAULT 1,
                   sort INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'active',
                   created_at TEXT NOT NULL, archived_at TEXT)"""
        )
        have = {r["name"] for r in conn.execute("PRAGMA table_info(habits)")}
        if "kind" not in have:
            conn.execute("ALTER TABLE habits ADD COLUMN kind TEXT NOT NULL DEFAULT 'check'")
        if "unit" not in have:
            conn.execute("ALTER TABLE habits ADD COLUMN unit TEXT")
        # the groups a habit can be filed under ("section" on a habit holds the group's label); created and removed in the manager
        conn.execute("CREATE TABLE IF NOT EXISTS habit_categories (key TEXT PRIMARY KEY, label TEXT NOT NULL, sort INTEGER NOT NULL DEFAULT 0)")
        _sync_categories(conn)
        conn.execute(
            """CREATE TABLE IF NOT EXISTS habit_days (
                   habit_id TEXT NOT NULL REFERENCES habits (id) ON DELETE CASCADE, day TEXT NOT NULL,
                   count INTEGER NOT NULL, updated_at TEXT NOT NULL, source TEXT NOT NULL DEFAULT 'web',
                   PRIMARY KEY (habit_id, day))"""
        )


def _slug(label: str) -> str:
    t = unicodedata.normalize("NFKD", label).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "-", t).strip("-")[:40]


def _sync_categories(conn) -> None:
    """Groups used to be free text on each habit: any group that is not a category yet becomes one."""
    have = {r["label"].lower() for r in conn.execute("SELECT label FROM habit_categories")}
    keys = {r["key"] for r in conn.execute("SELECT key FROM habit_categories")}
    nxt = conn.execute("SELECT COALESCE(MAX(sort), 0) FROM habit_categories").fetchone()[0]
    for r in conn.execute("SELECT section FROM habits WHERE section IS NOT NULL AND section != '' GROUP BY section ORDER BY MIN(sort)").fetchall():
        label = r["section"].strip()
        if not label or label.lower() in have:
            continue
        key = _slug(label) or "grupo"
        while key in keys:
            key += "-2"
        nxt += 1
        conn.execute("INSERT INTO habit_categories (key, label, sort) VALUES (?, ?, ?)", (key, label[:40], nxt))
        have.add(label.lower()); keys.add(key)


class CategoryIn(BaseModel):
    label: str = Field(min_length=1, max_length=40)


class CategoryOrder(BaseModel):
    keys: list[str] = Field(max_length=200)


def _categories(conn) -> list:
    _sync_categories(conn)
    return [dict(r) for r in conn.execute(
        "SELECT c.key, c.label, (SELECT COUNT(*) FROM habits h WHERE h.section = c.label AND h.status = 'active') AS count FROM habit_categories c ORDER BY c.sort, c.label")]


KINDS = "^(check|count|time|steps)$"
MAX_TARGET = 200_000


class HabitIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    section: Optional[str] = Field(None, max_length=40)
    kind: str = Field("check", pattern=KINDS)
    unit: Optional[str] = Field(None, max_length=20)
    target_count: int = Field(1, ge=1, le=MAX_TARGET)


class HabitPatch(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=80)
    section: Optional[str] = Field(None, max_length=40)
    kind: Optional[str] = Field(None, pattern=KINDS)
    unit: Optional[str] = Field(None, max_length=20)
    target_count: Optional[int] = Field(None, ge=1, le=MAX_TARGET)
    status: Optional[str] = Field(None, pattern="^(active|archived)$")


class DayIn(BaseModel):
    count: int = Field(ge=0, le=1_000_000)


def _day(value: str) -> date:
    try:
        return date.fromisoformat(value)
    except ValueError:
        raise HTTPException(422, "day must be YYYY-MM-DD")


def _streaks(days: dict[str, int], target: int, today: date) -> tuple[int, int]:
    """(current, best): runs of consecutive days that reached the target. The current run may end yesterday."""
    done = sorted(d for d, c in days.items() if c >= target)
    best = run = 0
    prev = None
    for d in done:
        cur = date.fromisoformat(d)
        run = run + 1 if prev and (cur - prev).days == 1 else 1
        best = max(best, run)
        prev = cur
    current = 0
    cursor = today if days.get(today.isoformat(), 0) >= target else today - timedelta(days=1)
    while days.get(cursor.isoformat(), 0) >= target:
        current += 1
        cursor -= timedelta(days=1)
    return current, best


def _steps_by_day(conn, since: str) -> dict[str, int]:
    """Steps per day from the wearables: for each day the best-ranked source's biggest reading (a day's total)."""
    rows = conn.execute(
        "SELECT source, substr(measured_at, 1, 10) AS day, MAX(value) AS steps FROM health_measurements "
        "WHERE metric = 'steps' AND measured_at >= ? GROUP BY source, day",
        (since,),
    ).fetchall()
    best: dict[str, tuple] = {}
    for r in rows:
        rank = db.SOURCE_RANK.get(r["source"], 99)
        if r["day"] not in best or rank < best[r["day"]][0]:
            best[r["day"]] = (rank, int(round(r["steps"])))
    return {day: pair[1] for day, pair in best.items()}


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
        if conn.execute("SELECT 1 FROM habit_categories WHERE key = ? OR lower(label) = lower(?)", (key, label)).fetchone():
            raise HTTPException(409, "that category already exists")
        nxt = conn.execute("SELECT COALESCE(MAX(sort), 0) + 1 FROM habit_categories").fetchone()[0]
        conn.execute("INSERT INTO habit_categories (key, label, sort) VALUES (?, ?, ?)", (key, label, nxt))
        return {"categories": _categories(conn)}


@router.patch("/categories/{key}")
def rename_category(key: str, body: CategoryIn, _: str = Depends(caller)) -> dict:
    """Rename a group: the habits in it follow the new name."""
    label = re.sub(r"\s+", " ", body.label).strip()
    if not label:
        raise HTTPException(422, "give the category a name")
    with db.connect() as conn:
        row = conn.execute("SELECT label FROM habit_categories WHERE key = ?", (key,)).fetchone()
        if not row:
            raise HTTPException(404, "not found")
        if conn.execute("SELECT 1 FROM habit_categories WHERE key != ? AND lower(label) = lower(?)", (key, label)).fetchone():
            raise HTTPException(409, "that category already exists")
        conn.execute("UPDATE habit_categories SET label = ? WHERE key = ?", (label, key))
        conn.execute("UPDATE habits SET section = ? WHERE section = ?", (label, row["label"]))
        return {"categories": _categories(conn)}


@router.put("/categories/order")
def order_categories(body: CategoryOrder, _: str = Depends(caller)) -> dict:
    """The groups in the order given; any not mentioned keep their relative order after them."""
    with db.connect() as conn:
        _sync_categories(conn)
        existing = [r["key"] for r in conn.execute("SELECT key FROM habit_categories ORDER BY sort, label")]
        seen: list[str] = []
        for k in body.keys + existing:
            if k in existing and k not in seen:
                seen.append(k)
        for i, k in enumerate(seen, 1):
            conn.execute("UPDATE habit_categories SET sort = ? WHERE key = ?", (i, k))
        return {"categories": _categories(conn)}


@router.delete("/categories/{key}")
def delete_category(key: str, _: str = Depends(caller)) -> dict:
    """Habits in the group are left without one; the group goes away."""
    with db.connect() as conn:
        row = conn.execute("SELECT label FROM habit_categories WHERE key = ?", (key,)).fetchone()
        if not row:
            raise HTTPException(404, "not found")
        conn.execute("DELETE FROM habit_categories WHERE key = ?", (key,))
        moved = conn.execute("UPDATE habits SET section = NULL WHERE section = ?", (row["label"],)).rowcount
        return {"moved": moved, "categories": _categories(conn)}


@router.get("/overview")
def overview(today: str = Query(..., max_length=10), window: int = Query(60, ge=7, le=400), _: str = Depends(caller)) -> dict:
    t = _day(today)
    start = (t - timedelta(days=window - 1)).isoformat()
    with db.connect() as conn:
        habits = [dict(r) for r in conn.execute("SELECT * FROM habits WHERE status = 'active' ORDER BY sort, created_at")]
        rows = conn.execute("SELECT habit_id, day, count FROM habit_days").fetchall()
        steps = _steps_by_day(conn, start) if any(h["kind"] == "steps" for h in habits) else {}
    by_habit: dict[str, dict[str, int]] = {}
    for r in rows:
        by_habit.setdefault(r["habit_id"], {})[r["day"]] = r["count"]
    out = []
    for h in habits:
        days = dict(steps) if h["kind"] == "steps" else by_habit.get(h["id"], {})
        current, best = _streaks(days, h["target_count"], t)
        recent = {d: c for d, c in days.items() if d >= start}
        last30 = [(t - timedelta(days=i)).isoformat() for i in range(30)]
        out.append({
            "id": h["id"], "name": h["name"], "section": h["section"], "target_count": h["target_count"],
            "kind": h["kind"], "unit": h["unit"],
            "created_at": h["created_at"], "streak": current, "best_streak": best,
            "count_today": days.get(today, 0), "done_today": days.get(today, 0) >= h["target_count"],
            "done_30": sum(1 for d in last30 if days.get(d, 0) >= h["target_count"]),
            "total_done": sum(1 for c in days.values() if c >= h["target_count"]),
            "days": recent,
        })
    return {"today": today, "window": window, "habits": out}


@router.post("", status_code=201)
def create_habit(body: HabitIn, _: str = Depends(caller)) -> dict:
    with db.connect() as conn:
        order = conn.execute("SELECT COALESCE(MAX(sort), 0) + 1 FROM habits").fetchone()[0]
        row = {
            "id": uuid.uuid4().hex, "name": body.name.strip(), "section": (body.section or "").strip() or None,
            "target_count": body.target_count, "kind": body.kind, "unit": (body.unit or "").strip() or None, "sort": order, "status": "active", "created_at": db.now_utc(),
        }
        conn.execute(f"INSERT INTO habits ({', '.join(row)}) VALUES ({', '.join('?' * len(row))})", tuple(row.values()))
    return row


@router.patch("/{habit_id}")
def patch_habit(habit_id: str, body: HabitPatch, _: str = Depends(caller)) -> dict:
    fields = {k: v for k, v in body.model_dump().items() if v is not None}
    if "section" in fields:
        fields["section"] = fields["section"].strip() or None
    if "unit" in fields:
        fields["unit"] = fields["unit"].strip() or None
    if fields.get("status") == "archived":
        fields["archived_at"] = db.now_utc()
    with db.connect() as conn:
        if not conn.execute("SELECT 1 FROM habits WHERE id = ?", (habit_id,)).fetchone():
            raise HTTPException(404, "not found")
        if fields:
            conn.execute(f"UPDATE habits SET {', '.join(k + ' = ?' for k in fields)} WHERE id = ?", (*fields.values(), habit_id))
        return dict(conn.execute("SELECT * FROM habits WHERE id = ?", (habit_id,)).fetchone())


@router.delete("/{habit_id}", status_code=204)
def delete_habit(habit_id: str, _: str = Depends(caller)) -> Response:
    with db.connect() as conn:
        if conn.execute("DELETE FROM habits WHERE id = ?", (habit_id,)).rowcount == 0:
            raise HTTPException(404, "not found")
    return Response(status_code=204)


@router.put("/{habit_id}/days/{day}")
def put_day(habit_id: str, day: str, body: DayIn, who: str = Depends(caller)) -> dict:
    d = _day(day)
    if d > datetime.now(timezone.utc).date() + timedelta(days=1):
        raise HTTPException(422, "that day is in the future")
    with db.connect() as conn:
        habit = conn.execute("SELECT kind FROM habits WHERE id = ?", (habit_id,)).fetchone()
        if not habit:
            raise HTTPException(404, "not found")
        if habit["kind"] == "steps":
            raise HTTPException(422, "steps come from your Health data and cannot be logged by hand")
        if body.count == 0:
            conn.execute("DELETE FROM habit_days WHERE habit_id = ? AND day = ?", (habit_id, day))
        else:
            conn.execute(
                "INSERT INTO habit_days (habit_id, day, count, updated_at, source) VALUES (?, ?, ?, ?, ?) "
                "ON CONFLICT(habit_id, day) DO UPDATE SET count = excluded.count, updated_at = excluded.updated_at",
                (habit_id, day, body.count, db.now_utc(), who),
            )
    return {"habit_id": habit_id, "day": day, "count": body.count}
