"""Workouts: an exercise library, routines (a named list of exercises with planned sets) and logged sessions with their sets.

Days are plain local dates (YYYY-MM-DD) sent by the client, so nothing here needs to know a time zone.
Weights are in kilograms; an exercise's `kind` says what a set records: `weight` (weight x reps), `reps` (bodyweight reps) or `time` (seconds).
"""
import uuid
from datetime import date, datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from pydantic import BaseModel, Field

from . import db
from .auth import caller

router = APIRouter(prefix="/v1/workouts", tags=["workouts"])

KIND_PATTERN = "^(weight|reps|time)$"
MUSCLE_PATTERN = "^(chest|back|legs|shoulders|arms|core|cardio|full)$"


def init_tables() -> None:
    with db.connect() as conn:
        conn.execute(
            """CREATE TABLE IF NOT EXISTS exercises (
                   id TEXT PRIMARY KEY, name TEXT NOT NULL, muscle TEXT NOT NULL DEFAULT 'full',
                   kind TEXT NOT NULL DEFAULT 'weight', created_at TEXT NOT NULL)"""
        )
        conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS exercises_name ON exercises (lower(name))")
        conn.execute(
            """CREATE TABLE IF NOT EXISTS routines (
                   id TEXT PRIMARY KEY, name TEXT NOT NULL, notes TEXT, sort INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL)"""
        )
        if "days" not in {r["name"] for r in conn.execute("PRAGMA table_info(routines)")}:
            conn.execute("ALTER TABLE routines ADD COLUMN days TEXT NOT NULL DEFAULT ''")
        conn.execute(
            """CREATE TABLE IF NOT EXISTS routine_items (
                   id TEXT PRIMARY KEY, routine_id TEXT NOT NULL REFERENCES routines (id) ON DELETE CASCADE,
                   exercise_id TEXT NOT NULL REFERENCES exercises (id), sort INTEGER NOT NULL DEFAULT 0,
                   sets INTEGER NOT NULL DEFAULT 3, reps INTEGER NOT NULL DEFAULT 10, weight REAL NOT NULL DEFAULT 0,
                   seconds INTEGER NOT NULL DEFAULT 0)"""
        )
        conn.execute(
            """CREATE TABLE IF NOT EXISTS sessions (
                   id TEXT PRIMARY KEY, day TEXT NOT NULL, routine_id TEXT, name TEXT NOT NULL, notes TEXT,
                   started_at TEXT NOT NULL, finished_at TEXT, created_at TEXT NOT NULL)"""
        )
        conn.execute("CREATE INDEX IF NOT EXISTS sessions_day ON sessions (day)")
        conn.execute(
            """CREATE TABLE IF NOT EXISTS session_sets (
                   id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions (id) ON DELETE CASCADE,
                   exercise_id TEXT NOT NULL REFERENCES exercises (id), sort INTEGER NOT NULL DEFAULT 0, set_no INTEGER NOT NULL DEFAULT 1,
                   reps INTEGER NOT NULL DEFAULT 0, weight REAL NOT NULL DEFAULT 0, seconds INTEGER NOT NULL DEFAULT 0,
                   done INTEGER NOT NULL DEFAULT 0)"""
        )
        conn.execute("CREATE INDEX IF NOT EXISTS session_sets_ex ON session_sets (exercise_id)")
        if "variant" not in {r["name"] for r in conn.execute("PRAGMA table_info(session_sets)")}:
            conn.execute("ALTER TABLE session_sets ADD COLUMN variant TEXT NOT NULL DEFAULT ''")
        # the training plan: per week (week_start = its Monday, '' = every week) a list of exercises with a scheme like "5x12" or "1x20; 3x15"
        conn.execute(
            """CREATE TABLE IF NOT EXISTS plan_items (
                   id TEXT PRIMARY KEY, week_start TEXT NOT NULL DEFAULT '', exercise_id TEXT NOT NULL REFERENCES exercises (id),
                   sort INTEGER NOT NULL DEFAULT 0, scheme TEXT NOT NULL, weight REAL NOT NULL DEFAULT 0, variant TEXT NOT NULL DEFAULT '',
                   days TEXT NOT NULL DEFAULT '0,1,2,3,4')"""
        )
        conn.execute("CREATE INDEX IF NOT EXISTS plan_items_week ON plan_items (week_start)")
        conn.execute(
            """CREATE TABLE IF NOT EXISTS workout_goals (
                   id TEXT PRIMARY KEY, text TEXT NOT NULL, sort INTEGER NOT NULL DEFAULT 0, done_on TEXT)"""
        )


class ExerciseIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    muscle: str = Field("full", pattern=MUSCLE_PATTERN)
    kind: str = Field("weight", pattern=KIND_PATTERN)


class ExercisePatch(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=80)
    muscle: Optional[str] = Field(None, pattern=MUSCLE_PATTERN)
    kind: Optional[str] = Field(None, pattern=KIND_PATTERN)


class ItemIn(BaseModel):
    exercise_id: str
    sets: int = Field(3, ge=1, le=20)
    reps: int = Field(10, ge=0, le=500)
    weight: float = Field(0, ge=0, le=2000)
    seconds: int = Field(0, ge=0, le=36000)


class RoutineIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    notes: Optional[str] = Field(None, max_length=500)
    days: list[int] = Field(default_factory=list, max_length=7)
    items: list[ItemIn] = Field(default_factory=list, max_length=40)


class SessionIn(BaseModel):
    day: str = Field(max_length=10)
    routine_id: Optional[str] = None
    name: Optional[str] = Field(None, max_length=80)


class SetIn(BaseModel):
    exercise_id: str
    reps: int = Field(0, ge=0, le=500)
    weight: float = Field(0, ge=0, le=2000)
    seconds: int = Field(0, ge=0, le=36000)
    done: bool = False
    variant: str = Field("", max_length=80)


class SetsIn(BaseModel):
    sets: list[SetIn] = Field(max_length=300)


class PlanCell(BaseModel):
    scheme: str = Field(max_length=60)
    weight: float = Field(0, ge=0, le=2000)
    variant: str = Field("", max_length=80)


class PlanEdit(BaseModel):
    """Change, add or remove one exercise of the plan on some weekdays. `orig` is the cell as it was (absent when adding)."""
    week_start: str = Field("", max_length=10)   # the Monday of the week being edited; '' edits the exercises that repeat every week
    days: list[int] = Field(min_length=1, max_length=7)
    exercise_id: str
    orig: Optional[PlanCell] = None
    scheme: str = Field("", max_length=60)
    weight: float = Field(0, ge=0, le=2000)
    variant: str = Field("", max_length=80)
    scope: str = Field("week", pattern="^(week|onwards)$")
    remove: bool = False


class TickIn(BaseModel):
    day: str = Field(max_length=10)
    exercise_id: str
    variant: str = Field("", max_length=80)
    done: bool


class GoalPatch(BaseModel):
    done_on: Optional[str] = Field(None, max_length=10)
    done: Optional[bool] = None


class SessionPatch(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=80)
    notes: Optional[str] = Field(None, max_length=1000)
    day: Optional[str] = Field(None, max_length=10)
    finish: Optional[bool] = None


def _day(value: str) -> date:
    try:
        return date.fromisoformat(value)
    except ValueError:
        raise HTTPException(422, "day must be YYYY-MM-DD")


def _volume(row) -> float:
    return row["weight"] * row["reps"] if row["done"] else 0.0


def _exercises(conn) -> list[dict]:
    return [dict(r) for r in conn.execute("SELECT * FROM exercises ORDER BY lower(name)")]


def _routine(conn, routine_id: str) -> dict:
    row = conn.execute("SELECT * FROM routines WHERE id = ?", (routine_id,)).fetchone()
    if not row:
        raise HTTPException(404, "not found")
    out = dict(row)
    out["days"] = [int(d) for d in (out.get("days") or "").split(",") if d.strip().isdigit()]
    out["items"] = [
        dict(r) for r in conn.execute(
            "SELECT i.*, e.name AS exercise_name, e.kind, e.muscle FROM routine_items i JOIN exercises e ON e.id = i.exercise_id "
            "WHERE i.routine_id = ? ORDER BY i.sort", (routine_id,))
    ]
    return out


def _last_sets(conn, exercise_id: str, before_session: Optional[str] = None) -> list[dict]:
    """The sets of the most recent session that did this exercise (done sets only), in order."""
    row = conn.execute(
        "SELECT s.id FROM sessions s JOIN session_sets t ON t.session_id = s.id WHERE t.exercise_id = ? AND t.done = 1 "
        + ("AND s.id != ? " if before_session else "") + "ORDER BY s.day DESC, s.started_at DESC LIMIT 1",
        (exercise_id, before_session) if before_session else (exercise_id,),
    ).fetchone()
    if not row:
        return []
    return [dict(r) for r in conn.execute("SELECT reps, weight, seconds FROM session_sets WHERE session_id = ? AND exercise_id = ? AND done = 1 ORDER BY set_no", (row["id"], exercise_id))]


def _session(conn, session_id: str) -> dict:
    row = conn.execute("SELECT * FROM sessions WHERE id = ?", (session_id,)).fetchone()
    if not row:
        raise HTTPException(404, "not found")
    out = dict(row)
    sets = [dict(r) for r in conn.execute(
        "SELECT t.*, e.name AS exercise_name, e.kind, e.muscle FROM session_sets t JOIN exercises e ON e.id = t.exercise_id "
        "WHERE t.session_id = ? ORDER BY t.sort, t.set_no", (session_id,))]
    groups: list[dict] = []
    for s in sets:
        if not groups or groups[-1]["exercise_id"] != s["exercise_id"] or groups[-1]["sort"] != s["sort"]:
            groups.append({"exercise_id": s["exercise_id"], "name": s["exercise_name"], "kind": s["kind"], "muscle": s["muscle"], "sort": s["sort"],
                           "variant": s["variant"] or "", "last": _last_sets(conn, s["exercise_id"], session_id), "sets": []})
        groups[-1]["sets"].append({"reps": s["reps"], "weight": s["weight"], "seconds": s["seconds"], "done": bool(s["done"])})
    out["groups"] = groups
    return out


@router.get("/overview")
def overview(day: str = Query(..., max_length=10), window: int = Query(30, ge=7, le=120), _: str = Depends(caller)) -> dict:
    d = _day(day)
    start = (d - timedelta(days=window - 1)).isoformat()
    week_start = (d - timedelta(days=6)).isoformat()
    with db.connect() as conn:
        exercises = _exercises(conn)
        routines = [_routine(conn, r["id"]) for r in conn.execute("SELECT id FROM routines ORDER BY sort, created_at")]
        last_done = {r["routine_id"]: r["day"] for r in conn.execute("SELECT routine_id, MAX(day) AS day FROM sessions WHERE routine_id IS NOT NULL AND finished_at IS NOT NULL GROUP BY routine_id")}
        for r in routines:
            r["last_day"] = last_done.get(r["id"])
        rows = conn.execute(
            "SELECT s.id, s.day, s.name, s.routine_id, s.started_at, s.finished_at, "
            "COUNT(t.id) AS sets, SUM(t.done) AS sets_done, "
            "SUM(CASE WHEN t.done = 1 THEN t.weight * t.reps ELSE 0 END) AS volume, COUNT(DISTINCT t.exercise_id) AS exercises "
            "FROM sessions s LEFT JOIN session_sets t ON t.session_id = s.id GROUP BY s.id ORDER BY s.day DESC, s.started_at DESC LIMIT 30").fetchall()
        recent = [dict(r) for r in rows]
        active = next((r["id"] for r in recent if not r["finished_at"]), None)
        days: dict[str, int] = {}
        for r in conn.execute("SELECT day, COUNT(*) AS n FROM sessions WHERE finished_at IS NOT NULL AND day >= ? AND day <= ? GROUP BY day", (start, day)):
            days[r["day"]] = r["n"]
        week = conn.execute(
            "SELECT COUNT(DISTINCT s.id) AS sessions, COALESCE(SUM(CASE WHEN t.done = 1 THEN t.weight * t.reps ELSE 0 END), 0) AS volume "
            "FROM sessions s LEFT JOIN session_sets t ON t.session_id = s.id WHERE s.finished_at IS NOT NULL AND s.day >= ? AND s.day <= ?", (week_start, day)).fetchone()
        # personal bests per exercise (heaviest done set; best reps / longest hold otherwise) and how many records were set in the window
        bests: dict[str, dict] = {}
        prs = 0
        for r in conn.execute(
            "SELECT t.exercise_id, t.weight, t.reps, t.seconds, s.day, e.name, e.kind FROM session_sets t JOIN sessions s ON s.id = t.session_id "
            "JOIN exercises e ON e.id = t.exercise_id WHERE t.done = 1 AND s.finished_at IS NOT NULL ORDER BY s.day, s.started_at"):
            score = r["weight"] if r["kind"] == "weight" else r["reps"] if r["kind"] == "reps" else r["seconds"]
            b = bests.get(r["exercise_id"])
            if b is None:
                bests[r["exercise_id"]] = {"exercise_id": r["exercise_id"], "name": r["name"], "kind": r["kind"], "score": score, "weight": r["weight"], "reps": r["reps"], "seconds": r["seconds"], "day": r["day"], "last_day": r["day"], "sessions": 1, "_seen": {r["day"]}}
            else:
                if score > b["score"]:
                    b.update(score=score, weight=r["weight"], reps=r["reps"], seconds=r["seconds"], day=r["day"])
                    if r["day"] >= start:
                        prs += 1
                b["last_day"] = r["day"]
                b["_seen"].add(r["day"])
                b["sessions"] = len(b["_seen"])
        best_list = []
        for b in bests.values():
            b.pop("_seen", None)
            best_list.append(b)
        best_list.sort(key=lambda b: b["last_day"], reverse=True)
    return {
        "day": day, "exercises": exercises, "routines": routines, "recent": recent, "active_session": active, "days": days,
        "week_sessions": week["sessions"], "week_volume": round(week["volume"]), "month_sessions": sum(n for k, n in days.items() if k >= (d - timedelta(days=29)).isoformat()),
        "prs": prs, "bests": best_list,
    }


@router.get("/day/{day}")
def sessions_on_day(day: str, _: str = Depends(caller)) -> dict:
    """Every workout logged on one day (finished or still running), with set counts and the names of the exercises."""
    _day(day)
    with db.connect() as conn:
        rows = conn.execute(
            "SELECT s.id, s.day, s.name, s.routine_id, s.started_at, s.finished_at, COUNT(t.id) AS sets, COALESCE(SUM(t.done), 0) AS sets_done, "
            "COALESCE(SUM(CASE WHEN t.done = 1 THEN t.weight * t.reps ELSE 0 END), 0) AS volume, COUNT(DISTINCT t.exercise_id) AS exercises, "
            "GROUP_CONCAT(DISTINCT e.name) AS names FROM sessions s LEFT JOIN session_sets t ON t.session_id = s.id "
            "LEFT JOIN exercises e ON e.id = t.exercise_id WHERE s.day = ? GROUP BY s.id ORDER BY s.started_at", (day,)).fetchall()
    return {"day": day, "sessions": [dict(r) for r in rows]}


# ---- exercises ----

@router.post("/exercises", status_code=201)
def add_exercise(body: ExerciseIn, _: str = Depends(caller)) -> dict:
    row = {"id": uuid.uuid4().hex, "name": body.name.strip(), "muscle": body.muscle, "kind": body.kind, "created_at": db.now_utc()}
    with db.connect() as conn:
        existing = conn.execute("SELECT * FROM exercises WHERE lower(name) = lower(?)", (row["name"],)).fetchone()
        if existing:
            return dict(existing)
        conn.execute(f"INSERT INTO exercises ({', '.join(row)}) VALUES ({', '.join('?' * len(row))})", tuple(row.values()))
    return row


@router.patch("/exercises/{exercise_id}")
def patch_exercise(exercise_id: str, body: ExercisePatch, _: str = Depends(caller)) -> dict:
    fields = {k: v for k, v in body.model_dump().items() if v is not None}
    if "name" in fields:
        fields["name"] = fields["name"].strip()
    with db.connect() as conn:
        if not conn.execute("SELECT 1 FROM exercises WHERE id = ?", (exercise_id,)).fetchone():
            raise HTTPException(404, "not found")
        if fields:
            try:
                conn.execute(f"UPDATE exercises SET {', '.join(k + ' = ?' for k in fields)} WHERE id = ?", (*fields.values(), exercise_id))
            except Exception:
                raise HTTPException(409, "an exercise with that name already exists")
        return dict(conn.execute("SELECT * FROM exercises WHERE id = ?", (exercise_id,)).fetchone())


@router.delete("/exercises/{exercise_id}", status_code=204)
def delete_exercise(exercise_id: str, _: str = Depends(caller)) -> Response:
    with db.connect() as conn:
        if conn.execute("SELECT 1 FROM routine_items WHERE exercise_id = ? UNION SELECT 1 FROM session_sets WHERE exercise_id = ? LIMIT 1", (exercise_id, exercise_id)).fetchone():
            raise HTTPException(409, "this exercise is used in a routine or a logged workout")
        if conn.execute("DELETE FROM exercises WHERE id = ?", (exercise_id,)).rowcount == 0:
            raise HTTPException(404, "not found")
    return Response(status_code=204)


# ---- routines ----

def _days(days: list[int]) -> str:
    """Planned weekdays as '0,2,4' (Monday = 0)."""
    return ",".join(str(d) for d in sorted({d for d in days if 0 <= d <= 6}))


def _write_items(conn, routine_id: str, items: list[ItemIn]) -> None:
    conn.execute("DELETE FROM routine_items WHERE routine_id = ?", (routine_id,))
    for i, it in enumerate(items):
        if not conn.execute("SELECT 1 FROM exercises WHERE id = ?", (it.exercise_id,)).fetchone():
            raise HTTPException(422, "unknown exercise")
        conn.execute("INSERT INTO routine_items (id, routine_id, exercise_id, sort, sets, reps, weight, seconds) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                     (uuid.uuid4().hex, routine_id, it.exercise_id, i, it.sets, it.reps, it.weight, it.seconds))


@router.post("/routines", status_code=201)
def add_routine(body: RoutineIn, _: str = Depends(caller)) -> dict:
    rid = uuid.uuid4().hex
    with db.connect() as conn:
        order = conn.execute("SELECT COALESCE(MAX(sort), 0) + 1 FROM routines").fetchone()[0]
        conn.execute("INSERT INTO routines (id, name, notes, days, sort, created_at) VALUES (?, ?, ?, ?, ?, ?)", (rid, body.name.strip(), (body.notes or "").strip() or None, _days(body.days), order, db.now_utc()))
        _write_items(conn, rid, body.items)
        return _routine(conn, rid)


@router.put("/routines/{routine_id}")
def put_routine(routine_id: str, body: RoutineIn, _: str = Depends(caller)) -> dict:
    with db.connect() as conn:
        if not conn.execute("SELECT 1 FROM routines WHERE id = ?", (routine_id,)).fetchone():
            raise HTTPException(404, "not found")
        conn.execute("UPDATE routines SET name = ?, notes = ?, days = ? WHERE id = ?", (body.name.strip(), (body.notes or "").strip() or None, _days(body.days), routine_id))
        _write_items(conn, routine_id, body.items)
        return _routine(conn, routine_id)


@router.delete("/routines/{routine_id}", status_code=204)
def delete_routine(routine_id: str, _: str = Depends(caller)) -> Response:
    with db.connect() as conn:
        conn.execute("UPDATE sessions SET routine_id = NULL WHERE routine_id = ?", (routine_id,))
        if conn.execute("DELETE FROM routines WHERE id = ?", (routine_id,)).rowcount == 0:
            raise HTTPException(404, "not found")
    return Response(status_code=204)


# ---- the training plan and goals ----

def _scheme_sets(scheme: str) -> list[dict]:
    """'1x20; 3x15' -> one dict per set; a trailing 's' on the second number means seconds ('3x40s')."""
    out: list[dict] = []
    for part in scheme.split(";"):
        part = part.strip().lower()
        if "x" not in part:
            continue
        n, v = part.split("x", 1)
        timed = v.endswith("s")
        try:
            count, value = int(n), int(v.rstrip("s"))
        except ValueError:
            continue
        out.extend({"reps": 0 if timed else value, "seconds": value if timed else 0} for _ in range(max(0, min(count, 20))))
    return out


@router.get("/plan")
def get_plan(_: str = Depends(caller)) -> dict:
    """Every plan week (its Monday) with its exercises, plus the exercises that repeat every week under key ''."""
    with db.connect() as conn:
        rows = conn.execute(
            "SELECT p.*, e.name, e.kind, e.muscle FROM plan_items p JOIN exercises e ON e.id = p.exercise_id ORDER BY p.week_start, p.sort, p.days").fetchall()
        goals = [dict(r) for r in conn.execute("SELECT id, text, done_on FROM workout_goals ORDER BY sort")]
    weeks: dict[str, list] = {}
    for r in rows:
        item = {"exercise_id": r["exercise_id"], "name": r["name"], "kind": r["kind"], "muscle": r["muscle"], "sort": r["sort"],
                "scheme": r["scheme"], "weight": r["weight"], "variant": r["variant"],
                "days": [int(d) for d in r["days"].split(",") if d.strip().isdigit()], "sets": _scheme_sets(r["scheme"])}
        weeks.setdefault(r["week_start"], []).append(item)
    return {"weeks": weeks, "goals": goals}


def _apply_plan(conn, week: str, body: PlanEdit, days: set, insert_missing: bool, scheme: str) -> None:
    covered: set = set()
    sort_hint = None
    if body.orig:
        for r in conn.execute("SELECT * FROM plan_items WHERE week_start = ? AND exercise_id = ?", (week, body.exercise_id)).fetchall():
            if r["variant"] != body.orig.variant or r["scheme"] != body.orig.scheme or abs(r["weight"] - body.orig.weight) > 1e-9:
                continue
            have = {int(d) for d in r["days"].split(",") if d.strip().isdigit()}
            hit = have & days
            if not hit:
                continue
            covered |= hit
            sort_hint = r["sort"]
            rest = have - hit
            if rest:
                conn.execute("UPDATE plan_items SET days = ? WHERE id = ?", (",".join(str(d) for d in sorted(rest)), r["id"]))
            else:
                conn.execute("DELETE FROM plan_items WHERE id = ?", (r["id"],))
    targets = days if insert_missing else covered
    if body.remove or not targets:
        return
    if sort_hint is None:
        sort_hint = conn.execute("SELECT COALESCE(MAX(sort), 1) + 1 FROM plan_items WHERE week_start = ?", (week,)).fetchone()[0]
    conn.execute("INSERT INTO plan_items (id, week_start, exercise_id, sort, scheme, weight, variant, days) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                 (uuid.uuid4().hex, week, body.exercise_id, sort_hint, scheme, body.weight, body.variant.strip(), ",".join(str(d) for d in sorted(targets))))


@router.post("/plan/edit")
def edit_plan(body: PlanEdit, _: str = Depends(caller)) -> dict:
    """Change one exercise of the plan on the chosen weekdays, for this week or for this and the following weeks (only where it still matches)."""
    days = set(body.days)
    if not days <= set(range(7)):
        raise HTTPException(422, "days must be 0 (Monday) to 6 (Sunday)")
    if body.week_start:
        if _day(body.week_start).weekday() != 0:
            raise HTTPException(422, "week_start must be a Monday")
    scheme = body.scheme.strip().lower()
    if not body.remove and not _scheme_sets(scheme):
        raise HTTPException(422, "type the sets like 5x12, 3x40s or 1x20; 3x15")
    if body.orig is None and body.remove:
        raise HTTPException(422, "nothing to remove")
    with db.connect() as conn:
        if not conn.execute("SELECT 1 FROM exercises WHERE id = ?", (body.exercise_id,)).fetchone():
            raise HTTPException(422, "unknown exercise")
        _apply_plan(conn, body.week_start, body, days, True, scheme)
        if body.scope == "onwards" and body.week_start:
            later = [r[0] for r in conn.execute("SELECT DISTINCT week_start FROM plan_items WHERE week_start > ? ORDER BY week_start", (body.week_start,))]
            for week in later:
                _apply_plan(conn, week, body, days, body.orig is None, scheme)
    return get_plan("")


def _monday(d: date) -> date:
    return d - timedelta(days=d.weekday())


def _plan_day_items(conn, day: date) -> list[dict]:
    """The plan's exercises for one date (this week's rows plus the ones that repeat every week), in order."""
    rows = conn.execute(
        "SELECT p.*, e.kind FROM plan_items p JOIN exercises e ON e.id = p.exercise_id WHERE p.week_start IN ('', ?) ORDER BY p.sort, p.rowid",
        (_monday(day).isoformat(),)).fetchall()
    out = []
    for r in rows:
        if str(day.weekday()) in r["days"].split(","):
            out.append({"exercise_id": r["exercise_id"], "variant": r["variant"], "kind": r["kind"], "weight": r["weight"], "sets": _scheme_sets(r["scheme"])})
    return out


def _plan_session(conn, day: str):
    return conn.execute("SELECT * FROM sessions WHERE day = ? AND name LIKE 'Plan · %' ORDER BY started_at LIMIT 1", (day,)).fetchone()


def _week_state(conn, monday: date) -> dict:
    days: dict[str, dict] = {}
    for i in range(7):
        key = (monday + timedelta(days=i)).isoformat()
        sess = _plan_session(conn, key)
        items = {}
        if sess:
            for r in conn.execute("SELECT exercise_id, variant, COUNT(*) AS total, COALESCE(SUM(done), 0) AS done FROM session_sets WHERE session_id = ? GROUP BY exercise_id, variant", (sess["id"],)):
                items[r["exercise_id"] + "|" + (r["variant"] or "")] = {"done": r["done"], "total": r["total"]}
        days[key] = {"id": sess["id"] if sess else None, "items": items}
    return {"week_start": monday.isoformat(), "days": days}


@router.get("/plan/week/{start}")
def plan_week(start: str, _: str = Depends(caller)) -> dict:
    """Which plan exercises are done on each day of the week starting on this Monday."""
    d = _day(start)
    if d.weekday() != 0:
        raise HTTPException(422, "start must be a Monday")
    with db.connect() as conn:
        return _week_state(conn, d)


@router.put("/plan/tick")
def plan_tick(body: TickIn, _: str = Depends(caller)) -> dict:
    """Mark one plan exercise done (every set) or not done on a day. The day's workout is created the first time."""
    d = _day(body.day)
    variant = body.variant.strip()
    with db.connect() as conn:
        items = _plan_day_items(conn, d)
        pick = next((i for i in items if i["exercise_id"] == body.exercise_id and i["variant"] == variant), None)
        if pick is None:
            raise HTTPException(404, "that exercise is not planned for this day")
        sess = _plan_session(conn, body.day)
        now = db.now_utc()
        if sess is None:
            sid = uuid.uuid4().hex
            monday = _monday(d)
            conn.execute("INSERT INTO sessions (id, day, routine_id, name, notes, started_at, finished_at, created_at) VALUES (?, ?, NULL, ?, NULL, ?, NULL, ?)",
                         (sid, body.day, f"Plan · week of {monday.day} {monday.strftime('%b')}", now, now))
        else:
            sid = sess["id"]
        have = conn.execute("SELECT 1 FROM session_sets WHERE session_id = ? AND exercise_id = ? AND variant = ?", (sid, pick["exercise_id"], variant)).fetchone()
        if not have:
            order = conn.execute("SELECT COALESCE(MAX(sort), -1) + 1 FROM session_sets WHERE session_id = ?", (sid,)).fetchone()[0]
            for n, st in enumerate(pick["sets"]):
                conn.execute("INSERT INTO session_sets (id, session_id, exercise_id, sort, set_no, reps, weight, seconds, done, variant) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)",
                             (uuid.uuid4().hex, sid, pick["exercise_id"], order, n + 1, st["reps"], pick["weight"], st["seconds"], variant))
        conn.execute("UPDATE session_sets SET done = ? WHERE session_id = ? AND exercise_id = ? AND variant = ?", (1 if body.done else 0, sid, pick["exercise_id"], variant))
        total, done = conn.execute("SELECT COUNT(*), COALESCE(SUM(done), 0) FROM session_sets WHERE session_id = ?", (sid,)).fetchone()
        planned = len(items)
        ticked = conn.execute("SELECT COUNT(*) FROM (SELECT exercise_id, variant FROM session_sets WHERE session_id = ? GROUP BY exercise_id, variant HAVING SUM(done) = COUNT(*))", (sid,)).fetchone()[0]
        conn.execute("UPDATE sessions SET finished_at = ? WHERE id = ?", (now if total and ticked >= planned else None, sid))
        return _week_state(conn, _monday(d))


@router.patch("/goals/{goal_id}")
def patch_goal(goal_id: str, body: GoalPatch, _: str = Depends(caller)) -> dict:
    """Tick a goal off (done = true, stamped with done_on or today's UTC date) or untick it."""
    if body.done is None:
        raise HTTPException(422, "done is required")
    on = None
    if body.done:
        on = body.done_on or datetime.now(timezone.utc).date().isoformat()
        _day(on)
    with db.connect() as conn:
        if conn.execute("UPDATE workout_goals SET done_on = ? WHERE id = ?", (on, goal_id)).rowcount == 0:
            raise HTTPException(404, "not found")
        return dict(conn.execute("SELECT id, text, done_on FROM workout_goals WHERE id = ?", (goal_id,)).fetchone())


# ---- sessions ----

@router.post("/sessions", status_code=201)
def start_session(body: SessionIn, _: str = Depends(caller)) -> dict:
    """Start a workout: empty, or from a routine with each set pre-filled from the last time you did that exercise."""
    _day(body.day)
    sid = uuid.uuid4().hex
    now = db.now_utc()
    with db.connect() as conn:
        name = (body.name or "").strip() or "Workout"
        items = []
        if body.routine_id:
            routine = _routine(conn, body.routine_id)
            name = (body.name or "").strip() or routine["name"]
            items = routine["items"]
        conn.execute("INSERT INTO sessions (id, day, routine_id, name, notes, started_at, finished_at, created_at) VALUES (?, ?, ?, ?, NULL, ?, NULL, ?)", (sid, body.day, body.routine_id, name, now, now))
        for i, it in enumerate(items):
            last = _last_sets(conn, it["exercise_id"])
            for n in range(it["sets"]):
                prev = last[n] if n < len(last) else (last[-1] if last else None)
                reps, weight, seconds = (prev["reps"], prev["weight"], prev["seconds"]) if prev else (it["reps"], it["weight"], it["seconds"])
                conn.execute("INSERT INTO session_sets (id, session_id, exercise_id, sort, set_no, reps, weight, seconds, done) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)",
                             (uuid.uuid4().hex, sid, it["exercise_id"], i, n + 1, reps, weight, seconds))
        return _session(conn, sid)


@router.get("/sessions/{session_id}")
def get_session(session_id: str, _: str = Depends(caller)) -> dict:
    with db.connect() as conn:
        return _session(conn, session_id)


@router.put("/sessions/{session_id}/sets")
def put_sets(session_id: str, body: SetsIn, _: str = Depends(caller)) -> dict:
    """Replace the session's sets. Sets are grouped by exercise in the order they first appear."""
    with db.connect() as conn:
        _session(conn, session_id)
        conn.execute("DELETE FROM session_sets WHERE session_id = ?", (session_id,))
        order: dict[str, int] = {}
        count: dict[str, int] = {}
        for s in body.sets:
            if not conn.execute("SELECT 1 FROM exercises WHERE id = ?", (s.exercise_id,)).fetchone():
                raise HTTPException(422, "unknown exercise")
            key = (s.exercise_id, s.variant)
            order.setdefault(key, len(order))
            count[key] = count.get(key, 0) + 1
            conn.execute("INSERT INTO session_sets (id, session_id, exercise_id, sort, set_no, reps, weight, seconds, done, variant) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                         (uuid.uuid4().hex, session_id, s.exercise_id, order[key], count[key], s.reps, s.weight, s.seconds, 1 if s.done else 0, s.variant.strip()))
        return _session(conn, session_id)


@router.patch("/sessions/{session_id}")
def patch_session(session_id: str, body: SessionPatch, _: str = Depends(caller)) -> dict:
    fields = {k: v for k, v in body.model_dump(exclude_unset=True).items() if k != "finish" and v is not None}
    if "day" in fields:
        _day(fields["day"])
    if "name" in fields:
        fields["name"] = fields["name"].strip()
    if "notes" in fields:
        fields["notes"] = fields["notes"].strip() or None
    if body.finish is True:
        fields["finished_at"] = db.now_utc()
    elif body.finish is False:
        fields["finished_at"] = None
    with db.connect() as conn:
        _session(conn, session_id)
        if fields:
            conn.execute(f"UPDATE sessions SET {', '.join(k + ' = ?' for k in fields)} WHERE id = ?", (*fields.values(), session_id))
        return _session(conn, session_id)


@router.delete("/sessions/{session_id}", status_code=204)
def delete_session(session_id: str, _: str = Depends(caller)) -> Response:
    with db.connect() as conn:
        if conn.execute("DELETE FROM sessions WHERE id = ?", (session_id,)).rowcount == 0:
            raise HTTPException(404, "not found")
    return Response(status_code=204)


@router.get("/exercises/{exercise_id}/history")
def exercise_history(exercise_id: str, _: str = Depends(caller)) -> dict:
    """Per finished session: the best set and the total volume, oldest first (for a progress chart)."""
    with db.connect() as conn:
        ex = conn.execute("SELECT * FROM exercises WHERE id = ?", (exercise_id,)).fetchone()
        if not ex:
            raise HTTPException(404, "not found")
        rows = conn.execute(
            "SELECT s.day, MAX(t.weight) AS weight, MAX(t.reps) AS reps, MAX(t.seconds) AS seconds, SUM(t.weight * t.reps) AS volume FROM session_sets t "
            "JOIN sessions s ON s.id = t.session_id WHERE t.exercise_id = ? AND t.done = 1 AND s.finished_at IS NOT NULL GROUP BY s.id ORDER BY s.day", (exercise_id,)).fetchall()
    return {"exercise": dict(ex), "history": [dict(r) for r in rows]}
