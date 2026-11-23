"""Food: a meal log (what was eaten, with calories and macros), the meal divisions it is grouped by, and one set of daily nutrition goals.

Meal divisions ("Café da manhã", "Almoço"…) live in `food_slots` and can be added, renamed, reordered and deleted. A meal or a saved
food points at one by its key. The six that existed before are seeded the first time, with their old keys, so nothing already logged moves.

The weekly plan (`food_plan`) is a template: for each weekday (0 = Monday ... 6 = Sunday) and meal division, what is planned (the
meal's name, and calories and macros if you know them). It repeats every week and is not a log; logging a planned meal just copies its text into the meal log.

Days are plain local dates (YYYY-MM-DD) sent by the client, so nothing here needs to know a time zone.
"""
import re
import json
import uuid
from pathlib import Path
from datetime import date, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from pydantic import BaseModel, Field

from . import db
from .auth import caller

router = APIRouter(prefix="/v1/food", tags=["food"])

DEFAULT_SLOTS = (   # key, label, usual time
    ("breakfast", "Café da manhã", "07:30"), ("am_snack", "Lanche da manhã", "10:00"), ("lunch", "Almoço", "12:30"),
    ("pm_snack", "Lanche da tarde", "15:30"), ("dinner", "Jantar", "19:30"), ("supper", "Ceia", "22:00"),
)
TIME_PATTERN = r"^(|([01]\d|2[0-3]):[0-5]\d)$"   # HH:MM on a 24-hour clock; empty clears it
SLOT_PATTERN = "^[a-z0-9_]{1,40}$"   # a division's key; it has to exist in food_slots
FEEL_PATTERN = "^(great|ok|heavy)$"
GOAL_FIELDS = ("calories", "protein_g", "carbs_g", "fat_g", "fiber_g")


def init_tables() -> None:
    with db.connect() as conn:
        conn.execute(
            """CREATE TABLE IF NOT EXISTS food_meals (
                   id TEXT PRIMARY KEY, day TEXT NOT NULL, slot TEXT NOT NULL, name TEXT NOT NULL,
                   calories INTEGER NOT NULL DEFAULT 0, protein_g REAL NOT NULL DEFAULT 0,
                   carbs_g REAL NOT NULL DEFAULT 0, fat_g REAL NOT NULL DEFAULT 0,
                   notes TEXT, feel TEXT, created_at TEXT NOT NULL, source TEXT NOT NULL DEFAULT 'web')"""
        )
        conn.execute("CREATE INDEX IF NOT EXISTS food_meals_day ON food_meals (day)")
        if "fiber_g" not in {r["name"] for r in conn.execute("PRAGMA table_info(food_meals)")}:
            conn.execute("ALTER TABLE food_meals ADD COLUMN fiber_g REAL NOT NULL DEFAULT 0")
        # how many grams were eaten (optional); the numbers on a meal are always the totals for that amount
        if "grams" not in {r["name"] for r in conn.execute("PRAGMA table_info(food_meals)")}:
            conn.execute("ALTER TABLE food_meals ADD COLUMN grams REAL")
        conn.execute(
            """CREATE TABLE IF NOT EXISTS food_presets (
                   id TEXT PRIMARY KEY, name TEXT NOT NULL, slot TEXT, calories INTEGER NOT NULL DEFAULT 0,
                   protein_g REAL NOT NULL DEFAULT 0, carbs_g REAL NOT NULL DEFAULT 0, fat_g REAL NOT NULL DEFAULT 0,
                   fiber_g REAL NOT NULL DEFAULT 0, created_at TEXT NOT NULL)"""
        )
        conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS food_presets_name ON food_presets (lower(name))")
        # the amount in grams that a saved food's numbers refer to (for example 100); empty = the numbers are for one portion
        if "base_g" not in {r["name"] for r in conn.execute("PRAGMA table_info(food_presets)")}:
            conn.execute("ALTER TABLE food_presets ADD COLUMN base_g REAL")
        # household measures of a food, as JSON: [{"name": "fatia", "grams": 25}] so "1 fatia" can be logged as 25 g
        if "units" not in {r["name"] for r in conn.execute("PRAGMA table_info(food_presets)")}:
            conn.execute("ALTER TABLE food_presets ADD COLUMN units TEXT")
        # which measure is shown first when this food is logged (a unit name); empty = grams
        if "default_unit" not in {r["name"] for r in conn.execute("PRAGMA table_info(food_presets)")}:
            conn.execute("ALTER TABLE food_presets ADD COLUMN default_unit TEXT")
        # six meals a day now: the old single "snack" slot becomes the afternoon snack
        conn.execute("UPDATE food_meals SET slot = 'pm_snack' WHERE slot = 'snack'")
        conn.execute("UPDATE food_presets SET slot = 'pm_snack' WHERE slot = 'snack'")
        conn.execute(
            """CREATE TABLE IF NOT EXISTS food_slots (
                   key TEXT PRIMARY KEY, label TEXT NOT NULL, position INTEGER NOT NULL, created_at TEXT NOT NULL)"""
        )
        added_time_column = "time" not in {r["name"] for r in conn.execute("PRAGMA table_info(food_slots)")}
        if added_time_column:
            conn.execute("ALTER TABLE food_slots ADD COLUMN time TEXT")
        if conn.execute("SELECT COUNT(*) FROM food_slots").fetchone()[0] == 0:
            now = db.now_utc()
            for i, (key, label, at) in enumerate(DEFAULT_SLOTS):
                conn.execute("INSERT INTO food_slots (key, label, position, time, created_at) VALUES (?, ?, ?, ?, ?)", (key, label, i, at, now))
        elif added_time_column:   # divisions that existed before times did: the original six get their usual time, once
            for key, _label, at in DEFAULT_SLOTS:
                conn.execute("UPDATE food_slots SET time = ? WHERE key = ? AND time IS NULL", (at, key))
        conn.execute(
            """CREATE TABLE IF NOT EXISTS food_plan (
                   weekday INTEGER NOT NULL, slot TEXT NOT NULL, text TEXT NOT NULL, calories INTEGER NOT NULL DEFAULT 0,
                   protein_g REAL NOT NULL DEFAULT 0, carbs_g REAL NOT NULL DEFAULT 0, fat_g REAL NOT NULL DEFAULT 0,
                   fiber_g REAL NOT NULL DEFAULT 0, updated_at TEXT NOT NULL, PRIMARY KEY (weekday, slot))"""
        )
        have = {r["name"] for r in conn.execute("PRAGMA table_info(food_plan)")}
        for col, kind in (("calories", "INTEGER"), ("protein_g", "REAL"), ("carbs_g", "REAL"), ("fat_g", "REAL"), ("fiber_g", "REAL")):
            if col not in have:
                conn.execute(f"ALTER TABLE food_plan ADD COLUMN {col} {kind} NOT NULL DEFAULT 0")
        conn.execute(
            """CREATE TABLE IF NOT EXISTS food_recipes (
                   id TEXT PRIMARY KEY, name TEXT NOT NULL, servings REAL NOT NULL DEFAULT 1, notes TEXT,
                   ingredients TEXT NOT NULL DEFAULT '[]', created_at TEXT NOT NULL, updated_at TEXT NOT NULL)"""
        )
        conn.execute(
            """CREATE TABLE IF NOT EXISTS food_goals (
                   id INTEGER PRIMARY KEY CHECK (id = 1), calories INTEGER, protein_g REAL, carbs_g REAL,
                   fat_g REAL, updated_at TEXT NOT NULL)"""
        )
        if "fiber_g" not in {r["name"] for r in conn.execute("PRAGMA table_info(food_goals)")}:
            conn.execute("ALTER TABLE food_goals ADD COLUMN fiber_g REAL")


class MealIn(BaseModel):
    day: str = Field(max_length=10)
    slot: str = Field(pattern=SLOT_PATTERN)
    name: str = Field(min_length=1, max_length=120)
    calories: int = Field(0, ge=0, le=20000)
    protein_g: float = Field(0, ge=0, le=2000)
    carbs_g: float = Field(0, ge=0, le=2000)
    fat_g: float = Field(0, ge=0, le=2000)
    fiber_g: float = Field(0, ge=0, le=500)
    grams: Optional[float] = Field(None, ge=0, le=100000)
    notes: Optional[str] = Field(None, max_length=500)
    feel: Optional[str] = Field(None, pattern=FEEL_PATTERN)


class MealPatch(BaseModel):
    day: Optional[str] = Field(None, max_length=10)
    slot: Optional[str] = Field(None, pattern=SLOT_PATTERN)
    name: Optional[str] = Field(None, min_length=1, max_length=120)
    calories: Optional[int] = Field(None, ge=0, le=20000)
    protein_g: Optional[float] = Field(None, ge=0, le=2000)
    carbs_g: Optional[float] = Field(None, ge=0, le=2000)
    fat_g: Optional[float] = Field(None, ge=0, le=2000)
    fiber_g: Optional[float] = Field(None, ge=0, le=500)
    grams: Optional[float] = Field(None, ge=0, le=100000)   # 0 clears it
    notes: Optional[str] = Field(None, max_length=500)
    feel: Optional[str] = Field(None, pattern=f"^(great|ok|heavy|)$")


class UnitIn(BaseModel):
    name: str = Field(min_length=1, max_length=30)
    grams: float = Field(gt=0, le=100000)


class PresetIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    slot: Optional[str] = Field(None, pattern=SLOT_PATTERN)
    calories: int = Field(0, ge=0, le=20000)
    protein_g: float = Field(0, ge=0, le=2000)
    carbs_g: float = Field(0, ge=0, le=2000)
    fat_g: float = Field(0, ge=0, le=2000)
    fiber_g: float = Field(0, ge=0, le=500)
    base_g: Optional[float] = Field(None, ge=0, le=100000)   # the grams these numbers are for; empty or 0 = per portion
    units: list[UnitIn] = Field(default_factory=list, max_length=8)
    default_unit: Optional[str] = Field(None, max_length=30)


class GoalsIn(BaseModel):
    calories: Optional[int] = Field(None, ge=0, le=20000)
    protein_g: Optional[float] = Field(None, ge=0, le=2000)
    carbs_g: Optional[float] = Field(None, ge=0, le=2000)
    fat_g: Optional[float] = Field(None, ge=0, le=2000)
    fiber_g: Optional[float] = Field(None, ge=0, le=500)


def _day(value: str) -> date:
    try:
        return date.fromisoformat(value)
    except ValueError:
        raise HTTPException(422, "day must be YYYY-MM-DD")


def _goals(conn) -> dict:
    row = conn.execute("SELECT calories, protein_g, carbs_g, fat_g, fiber_g FROM food_goals WHERE id = 1").fetchone()
    return dict(row) if row else {k: None for k in GOAL_FIELDS}


def _slots(conn) -> list[dict]:
    """The divisions in order, each with how many meals and saved foods use it."""
    rows = conn.execute(
        "SELECT s.key, s.label, s.position, s.time, "
        "(SELECT COUNT(*) FROM food_meals m WHERE m.slot = s.key) + (SELECT COUNT(*) FROM food_presets p WHERE p.slot = s.key) AS uses "
        "FROM food_slots s ORDER BY s.position, s.created_at"
    ).fetchall()
    return [dict(r) for r in rows]


def _renumber(conn, keys: list[str]) -> None:
    for i, key in enumerate(keys):
        conn.execute("UPDATE food_slots SET position = ? WHERE key = ?", (i, key))


def _need_slot(conn, key: Optional[str]) -> None:
    if key is not None and not conn.execute("SELECT 1 FROM food_slots WHERE key = ?", (key,)).fetchone():
        raise HTTPException(422, "unknown meal division")


@router.get("/overview")
def overview(day: str = Query(..., max_length=10), window: int = Query(30, ge=7, le=120), _: str = Depends(caller)) -> dict:
    d = _day(day)
    start = (d - timedelta(days=window - 1)).isoformat()
    with db.connect() as conn:
        goals = _goals(conn)
        slots = _slots(conn)
        meals = [dict(r) for r in conn.execute("SELECT * FROM food_meals WHERE day = ?", (day,))]
        rows = conn.execute(
            "SELECT day, COUNT(*) AS meals, SUM(calories) AS calories, SUM(protein_g) AS protein_g, "
            "SUM(carbs_g) AS carbs_g, SUM(fat_g) AS fat_g, SUM(fiber_g) AS fiber_g FROM food_meals WHERE day >= ? AND day <= ? GROUP BY day",
            (start, day),
        ).fetchall()
    order = {s["key"]: s["position"] for s in slots}
    meals.sort(key=lambda m: (order.get(m["slot"], 999), m["created_at"]))
    days = {r["day"]: {k: (round(r[k], 1) if isinstance(r[k], float) else r[k]) for k in ("meals", "calories", "protein_g", "carbs_g", "fat_g", "fiber_g")} for r in rows}
    # logging streak: consecutive days with at least one meal, ending today or yesterday
    streak = 0
    cursor = d if day in days else d - timedelta(days=1)
    while cursor.isoformat() in days:
        streak += 1
        cursor -= timedelta(days=1)
    week = [days[(d - timedelta(days=i)).isoformat()]["calories"] for i in range(7) if (d - timedelta(days=i)).isoformat() in days]
    return {
        "day": day, "goals": goals, "slots": slots, "meals": meals, "days": days, "logged_streak": streak,
        "week_avg_calories": round(sum(week) / len(week)) if week else None, "days_logged": len(days),
    }


@router.post("/meals", status_code=201)
def add_meal(body: MealIn, who: str = Depends(caller)) -> dict:
    _day(body.day)
    row = {
        "id": uuid.uuid4().hex, "day": body.day, "slot": body.slot, "name": body.name.strip(), "calories": body.calories,
        "protein_g": body.protein_g, "carbs_g": body.carbs_g, "fat_g": body.fat_g, "fiber_g": body.fiber_g,
        "grams": body.grams or None,
        "notes": (body.notes or "").strip() or None, "feel": body.feel, "created_at": db.now_utc(), "source": who,
    }
    with db.connect() as conn:
        _need_slot(conn, body.slot)
        conn.execute(f"INSERT INTO food_meals ({', '.join(row)}) VALUES ({', '.join('?' * len(row))})", tuple(row.values()))
    return row


@router.patch("/meals/{meal_id}")
def patch_meal(meal_id: str, body: MealPatch, _: str = Depends(caller)) -> dict:
    fields = {k: v for k, v in body.model_dump().items() if v is not None}
    if "day" in fields:
        _day(fields["day"])
    if "name" in fields:
        fields["name"] = fields["name"].strip()
    for k in ("notes", "feel"):
        if k in fields:
            fields[k] = fields[k].strip() or None
    if "grams" in fields:
        fields["grams"] = fields["grams"] or None
    with db.connect() as conn:
        if not conn.execute("SELECT 1 FROM food_meals WHERE id = ?", (meal_id,)).fetchone():
            raise HTTPException(404, "not found")
        _need_slot(conn, fields.get("slot"))
        if fields:
            conn.execute(f"UPDATE food_meals SET {', '.join(k + ' = ?' for k in fields)} WHERE id = ?", (*fields.values(), meal_id))
        return dict(conn.execute("SELECT * FROM food_meals WHERE id = ?", (meal_id,)).fetchone())


@router.delete("/meals/{meal_id}", status_code=204)
def delete_meal(meal_id: str, _: str = Depends(caller)) -> Response:
    with db.connect() as conn:
        if conn.execute("DELETE FROM food_meals WHERE id = ?", (meal_id,)).rowcount == 0:
            raise HTTPException(404, "not found")
    return Response(status_code=204)


class SlotIn(BaseModel):
    label: str = Field(min_length=1, max_length=40)
    time: Optional[str] = Field(None, pattern=TIME_PATTERN)


class SlotPatch(BaseModel):
    label: Optional[str] = Field(None, min_length=1, max_length=40)
    position: Optional[int] = Field(None, ge=0, le=999)   # the new place in the list, counting from 0
    time: Optional[str] = Field(None, pattern=TIME_PATTERN)   # "HH:MM"; an empty string clears it


def _clean_label(value: str) -> str:
    label = " ".join(value.split())
    if not label:
        raise HTTPException(422, "give the division a name")
    return label


def _label_taken(conn, label: str, except_key: Optional[str] = None) -> bool:
    row = conn.execute("SELECT key FROM food_slots WHERE lower(label) = lower(?)", (label,)).fetchone()
    return bool(row and row["key"] != except_key)


@router.get("/slots")
def list_slots(_: str = Depends(caller)) -> dict:
    with db.connect() as conn:
        return {"slots": _slots(conn)}


@router.post("/slots", status_code=201)
def add_slot(body: SlotIn, _: str = Depends(caller)) -> dict:
    label = _clean_label(body.label)
    with db.connect() as conn:
        if _label_taken(conn, label):
            raise HTTPException(409, "there is already a division with this name")
        key = "c_" + uuid.uuid4().hex[:10]
        pos = conn.execute("SELECT COALESCE(MAX(position), -1) + 1 FROM food_slots").fetchone()[0]
        conn.execute("INSERT INTO food_slots (key, label, position, time, created_at) VALUES (?, ?, ?, ?, ?)", (key, label, pos, body.time or None, db.now_utc()))
        return {"slots": _slots(conn), "key": key}


@router.patch("/slots/{key}")
def patch_slot(key: str, body: SlotPatch, _: str = Depends(caller)) -> dict:
    with db.connect() as conn:
        if not conn.execute("SELECT 1 FROM food_slots WHERE key = ?", (key,)).fetchone():
            raise HTTPException(404, "not found")
        if body.label is not None:
            label = _clean_label(body.label)
            if _label_taken(conn, label, key):
                raise HTTPException(409, "there is already a division with this name")
            conn.execute("UPDATE food_slots SET label = ? WHERE key = ?", (label, key))
        if body.time is not None:
            conn.execute("UPDATE food_slots SET time = ? WHERE key = ?", (body.time or None, key))
        if body.position is not None:
            keys = [r["key"] for r in conn.execute("SELECT key FROM food_slots ORDER BY position, created_at")]
            keys.remove(key)
            keys.insert(min(body.position, len(keys)), key)
            _renumber(conn, keys)
        return {"slots": _slots(conn)}


@router.delete("/slots/{key}")
def delete_slot(key: str, move_to: Optional[str] = Query(None, max_length=40), _: str = Depends(caller)) -> dict:
    """Delete a division. If meals or saved foods use it, `move_to` says which division takes them over."""
    with db.connect() as conn:
        if not conn.execute("SELECT 1 FROM food_slots WHERE key = ?", (key,)).fetchone():
            raise HTTPException(404, "not found")
        if conn.execute("SELECT COUNT(*) FROM food_slots").fetchone()[0] <= 1:
            raise HTTPException(409, "keep at least one meal division")
        uses = conn.execute("SELECT (SELECT COUNT(*) FROM food_meals WHERE slot = ?) + (SELECT COUNT(*) FROM food_presets WHERE slot = ?)", (key, key)).fetchone()[0]
        if uses:
            if not move_to:
                raise HTTPException(409, f"{uses} meals or saved foods use this division: choose where to move them")
            if move_to == key or not conn.execute("SELECT 1 FROM food_slots WHERE key = ?", (move_to,)).fetchone():
                raise HTTPException(422, "pick a different, existing division to move them to")
            conn.execute("UPDATE food_meals SET slot = ? WHERE slot = ?", (move_to, key))
            conn.execute("UPDATE food_presets SET slot = ? WHERE slot = ?", (move_to, key))
        conn.execute("DELETE FROM food_slots WHERE key = ?", (key,))
        _renumber(conn, [r["key"] for r in conn.execute("SELECT key FROM food_slots ORDER BY position, created_at")])
        return {"slots": _slots(conn), "moved": uses}


class PlanIn(BaseModel):
    text: str = Field(max_length=300)   # what is planned; empty clears the cell
    calories: int = Field(0, ge=0, le=20000)
    protein_g: float = Field(0, ge=0, le=2000)
    carbs_g: float = Field(0, ge=0, le=2000)
    fat_g: float = Field(0, ge=0, le=2000)
    fiber_g: float = Field(0, ge=0, le=500)


PLAN_COLS = "text, calories, protein_g, carbs_g, fat_g, fiber_g"


@router.get("/plan")
def get_plan(_: str = Depends(caller)) -> dict:
    """The weekly plan: {"plan": {"0": {"breakfast": {"text": "...", "calories": 0, ...}}, ...}}, weekday 0 = Monday."""
    plan: dict[str, dict[str, dict]] = {}
    with db.connect() as conn:
        for r in conn.execute(f"SELECT weekday, slot, {PLAN_COLS} FROM food_plan ORDER BY weekday"):
            plan.setdefault(str(r["weekday"]), {})[r["slot"]] = {k: r[k] for k in ("text", "calories", "protein_g", "carbs_g", "fat_g", "fiber_g")}
    return {"plan": plan}


@router.put("/plan/{weekday}/{slot}")
def put_plan(weekday: int, slot: str, body: PlanIn, _: str = Depends(caller)) -> dict:
    if weekday < 0 or weekday > 6:
        raise HTTPException(422, "weekday is 0 (Monday) to 6 (Sunday)")
    if not re.match(SLOT_PATTERN, slot):
        raise HTTPException(422, "bad meal division")
    text = " ".join(body.text.split())
    with db.connect() as conn:
        if not conn.execute("SELECT 1 FROM food_slots WHERE key = ?", (slot,)).fetchone():
            raise HTTPException(404, "that meal division does not exist")
        if text:
            conn.execute(
                "INSERT INTO food_plan (weekday, slot, text, calories, protein_g, carbs_g, fat_g, fiber_g, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) "
                "ON CONFLICT(weekday, slot) DO UPDATE SET text = excluded.text, calories = excluded.calories, protein_g = excluded.protein_g, "
                "carbs_g = excluded.carbs_g, fat_g = excluded.fat_g, fiber_g = excluded.fiber_g, updated_at = excluded.updated_at",
                (weekday, slot, text, body.calories, body.protein_g, body.carbs_g, body.fat_g, body.fiber_g, db.now_utc()),
            )
        else:
            conn.execute("DELETE FROM food_plan WHERE weekday = ? AND slot = ?", (weekday, slot))
    return {"weekday": weekday, "slot": slot, "text": text, "calories": body.calories, "protein_g": body.protein_g, "carbs_g": body.carbs_g, "fat_g": body.fat_g, "fiber_g": body.fiber_g}


@router.put("/goals")
def put_goals(body: GoalsIn, _: str = Depends(caller)) -> dict:
    with db.connect() as conn:
        conn.execute(
            "INSERT INTO food_goals (id, calories, protein_g, carbs_g, fat_g, fiber_g, updated_at) VALUES (1, ?, ?, ?, ?, ?, ?) "
            "ON CONFLICT(id) DO UPDATE SET calories = excluded.calories, protein_g = excluded.protein_g, "
            "carbs_g = excluded.carbs_g, fat_g = excluded.fat_g, fiber_g = excluded.fiber_g, updated_at = excluded.updated_at",
            (body.calories, body.protein_g, body.carbs_g, body.fat_g, body.fiber_g, db.now_utc()),
        )
        return _goals(conn)


def _preset(row) -> dict:
    out = dict(row)
    try:
        out["units"] = json.loads(out.get("units") or "[]")
    except ValueError:
        out["units"] = []
    return out


@router.get("/library")
def library(_: str = Depends(caller)) -> dict:
    """Foods saved to reuse, and the meals logged most recently (one per name) to pick from when adding a meal."""
    with db.connect() as conn:
        saved = [_preset(r) for r in conn.execute("SELECT * FROM food_presets ORDER BY lower(name)")]
        recent = [
            dict(r) for r in conn.execute(
                "SELECT name, slot, calories, protein_g, carbs_g, fat_g, fiber_g, MAX(created_at) AS last_at FROM food_meals "
                "GROUP BY lower(name) ORDER BY last_at DESC LIMIT 12"
            )
        ]
    return {"saved": saved, "recent": recent}


@router.post("/presets", status_code=201)
def save_preset(body: PresetIn, _: str = Depends(caller)) -> dict:
    """Save a food or meal to reuse; saving the same name again replaces its numbers."""
    row = {
        "id": uuid.uuid4().hex, "name": body.name.strip(), "slot": body.slot, "calories": body.calories,
        "protein_g": body.protein_g, "carbs_g": body.carbs_g, "fat_g": body.fat_g, "fiber_g": body.fiber_g,
        "base_g": body.base_g or None,
        "units": json.dumps([{"name": u.name.strip(), "grams": u.grams} for u in body.units if u.name.strip()], ensure_ascii=False) if body.units else None,
        "default_unit": (body.default_unit or "").strip() or None,
        "created_at": db.now_utc(),
    }
    with db.connect() as conn:
        _need_slot(conn, row["slot"])
        old = conn.execute("SELECT id, created_at FROM food_presets WHERE lower(name) = lower(?)", (row["name"],)).fetchone()
        if old:
            row["id"], row["created_at"] = old["id"], old["created_at"]
            conn.execute(
                "UPDATE food_presets SET name = ?, slot = ?, calories = ?, protein_g = ?, carbs_g = ?, fat_g = ?, fiber_g = ?, base_g = ?, units = ?, default_unit = ? WHERE id = ?",
                (row["name"], row["slot"], row["calories"], row["protein_g"], row["carbs_g"], row["fat_g"], row["fiber_g"], row["base_g"], row["units"], row["default_unit"], row["id"]),
            )
        else:
            conn.execute(f"INSERT INTO food_presets ({', '.join(row)}) VALUES ({', '.join('?' * len(row))})", tuple(row.values()))
    return _preset(row)


@router.delete("/presets/{preset_id}", status_code=204)
def delete_preset(preset_id: str, _: str = Depends(caller)) -> Response:
    with db.connect() as conn:
        if conn.execute("DELETE FROM food_presets WHERE id = ?", (preset_id,)).rowcount == 0:
            raise HTTPException(404, "not found")
    return Response(status_code=204)


# ---- TACO: the Brazilian food composition table, a read-only reference (never written to the database) -----------------------------
# Source: Tabela Brasileira de Composição de Alimentos (TACO), 4th edition, NEPA/UNICAMP, 2011. Values are per 100 g.
_TACO: list[dict] = []


def _taco() -> list[dict]:
    if not _TACO:
        try:
            raw = json.loads((Path(__file__).with_name("taco.json")).read_text(encoding="utf-8"))
        except (OSError, ValueError):
            raw = []
        for r in raw:
            _TACO.append({
                "id": r["id"], "name": r["name"], "category": r["cat"], "base_g": 100, "calories": r["kcal"],
                "protein_g": r["p"], "carbs_g": r["c"], "fat_g": r["f"], "fiber_g": r["fi"], "units": [], "source": "taco",
            })
    return _TACO


@router.get("/taco")
def taco(q: str = Query("", max_length=80), _: str = Depends(caller)) -> dict:
    """The TACO foods, optionally filtered by name or category (every word must match)."""
    words = [w for w in q.lower().split() if w]
    items = [f for f in _taco() if all(w in f["name"].lower() or w in f["category"].lower() for w in words)]
    return {"foods": items, "total": len(_taco())}


# ---- Recipes: a name, a number of servings and a list of ingredients taken from saved foods or TACO --------------------------------------------
# Each ingredient keeps its own numbers (`per` = for one gram, or for one portion when the food has no weight), so a recipe never changes when a
# saved food is edited later. The totals are computed by the client; logging a recipe as a meal copies the numbers into the meal log.
class IngredientIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    qty: float = Field(gt=0, le=100000)
    unit: str = Field("g", min_length=1, max_length=30)   # "g", "porção" or one of `units`
    per: dict[str, float]   # calories, protein_g, carbs_g, fat_g, fiber_g for one gram (or one portion)
    portion: bool = False   # True: `per` is for one portion and qty counts portions
    units: list[UnitIn] = Field(default_factory=list, max_length=8)


class RecipeIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    servings: float = Field(1, gt=0, le=1000)
    notes: Optional[str] = Field(None, max_length=1000)
    ingredients: list[IngredientIn] = Field(default_factory=list, max_length=60)


def _recipe(row) -> dict:
    out = dict(row)
    try:
        out["ingredients"] = json.loads(out.get("ingredients") or "[]")
    except ValueError:
        out["ingredients"] = []
    return out


def _ingredients_json(body: RecipeIn) -> str:
    keys = ("calories", "protein_g", "carbs_g", "fat_g", "fiber_g")
    items = []
    for i in body.ingredients:
        per = {k: max(0.0, float(i.per.get(k, 0))) for k in keys}
        items.append({"name": i.name.strip(), "qty": i.qty, "unit": i.unit.strip() or "g", "per": per, "portion": i.portion,
                      "units": [{"name": u.name.strip(), "grams": u.grams} for u in i.units if u.name.strip()]})
    return json.dumps(items, ensure_ascii=False)


@router.get("/recipes")
def list_recipes(_: str = Depends(caller)) -> dict:
    with db.connect() as conn:
        return {"recipes": [_recipe(r) for r in conn.execute("SELECT * FROM food_recipes ORDER BY lower(name)")]}


@router.post("/recipes", status_code=201)
def add_recipe(body: RecipeIn, _: str = Depends(caller)) -> dict:
    now = db.now_utc()
    row = {"id": uuid.uuid4().hex, "name": " ".join(body.name.split()), "servings": body.servings, "notes": (body.notes or "").strip() or None,
           "ingredients": _ingredients_json(body), "created_at": now, "updated_at": now}
    with db.connect() as conn:
        conn.execute(f"INSERT INTO food_recipes ({', '.join(row)}) VALUES ({', '.join('?' * len(row))})", tuple(row.values()))
    return _recipe(row)


@router.put("/recipes/{recipe_id}")
def put_recipe(recipe_id: str, body: RecipeIn, _: str = Depends(caller)) -> dict:
    with db.connect() as conn:
        if not conn.execute("SELECT 1 FROM food_recipes WHERE id = ?", (recipe_id,)).fetchone():
            raise HTTPException(404, "not found")
        conn.execute("UPDATE food_recipes SET name = ?, servings = ?, notes = ?, ingredients = ?, updated_at = ? WHERE id = ?",
                     (" ".join(body.name.split()), body.servings, (body.notes or "").strip() or None, _ingredients_json(body), db.now_utc(), recipe_id))
        return _recipe(conn.execute("SELECT * FROM food_recipes WHERE id = ?", (recipe_id,)).fetchone())


@router.delete("/recipes/{recipe_id}", status_code=204)
def delete_recipe(recipe_id: str, _: str = Depends(caller)) -> Response:
    with db.connect() as conn:
        if conn.execute("DELETE FROM food_recipes WHERE id = ?", (recipe_id,)).rowcount == 0:
            raise HTTPException(404, "not found")
    return Response(status_code=204)
