"""Lithium monitoring: regimens, laboratory results, daily symptom scores, events and a monitoring schedule.

Everything here is recorded data plus descriptive statistics. Nothing is interpreted as a diagnosis or a dosing
recommendation, correlations are observational, and any pharmacokinetic model lives in the client and is labelled as
theoretical. Rows are never overwritten silently: edits keep the original row id, deletes remove one row.
"""
import csv
import io
import json
import math
import statistics
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from pydantic import BaseModel, Field

from . import db
from .auth import caller

router = APIRouter(prefix="/v1/lithium", tags=["lithium"])

# ---- configuration (all of it editable through the settings endpoint, defaults only) ------------------------------

LAB_MARKERS = [
    {"key": "lithium", "label": "Serum lithium", "group": "Lithium", "scope": "lithium", "units": ["mmol/L"]},
    {"key": "creatinine", "label": "Creatinine", "group": "Kidney", "scope": "lithium", "units": ["umol/L", "mg/dL"]},
    {"key": "egfr", "label": "eGFR", "group": "Kidney", "scope": "lithium", "units": ["mL/min/1.73m2"]},
    {"key": "urea", "label": "Urea / BUN", "group": "Kidney", "scope": "lithium", "units": ["mmol/L", "mg/dL"]},
    {"key": "tsh", "label": "TSH", "group": "Thyroid", "scope": "lithium", "units": ["mIU/L"]},
    {"key": "ft4", "label": "Free T4", "group": "Thyroid", "scope": "lithium", "units": ["pmol/L", "ng/dL"]},
    {"key": "sodium", "label": "Sodium", "group": "Electrolytes", "scope": "lithium", "units": ["mmol/L"]},
    {"key": "potassium", "label": "Potassium", "group": "Electrolytes", "scope": "lithium", "units": ["mmol/L"]},
    {"key": "calcium", "label": "Calcium", "group": "Electrolytes", "scope": "lithium", "units": ["mmol/L", "mg/dL"]},
    # blood tests followed during isotretinoin (Roacutan) treatment: liver, blood fats, sugar and muscle enzyme
    {"key": "tgo", "label": "TGO (AST)", "group": "Liver", "scope": "roacutan", "units": ["U/L"]},
    {"key": "tgp", "label": "TGP (ALT)", "group": "Liver", "scope": "roacutan", "units": ["U/L"]},
    {"key": "triglycerides", "label": "Triglycerides", "group": "Blood fats", "scope": "roacutan", "units": ["mg/dL", "mmol/L"]},
    {"key": "cholesterol", "label": "Total cholesterol", "group": "Blood fats", "scope": "roacutan", "units": ["mg/dL", "mmol/L"]},
    {"key": "hdl", "label": "HDL cholesterol", "group": "Blood fats", "scope": "roacutan", "units": ["mg/dL", "mmol/L"]},
    {"key": "ldl", "label": "LDL cholesterol", "group": "Blood fats", "scope": "roacutan", "units": ["mg/dL", "mmol/L"]},
    {"key": "glucose", "label": "Glucose", "group": "Sugar", "scope": "roacutan", "units": ["mg/dL", "mmol/L"]},
    {"key": "cpk", "label": "CPK", "group": "Muscle", "scope": "roacutan", "units": ["U/L"]},
]
MARKER_KEYS = {m["key"] for m in LAB_MARKERS}

# 0-10 unless noted. higher_is_better only changes how a change is described, never what is recorded.
SYMPTOMS = [
    {"key": "emotional_reactivity", "label": "Emotional reactivity", "group": "Mood & emotions", "higher_is_better": False, "lo": "calm", "hi": "very reactive"},
    {"key": "emotional_stability", "label": "Emotional stability", "group": "Mood & emotions", "higher_is_better": True, "lo": "unstable", "hi": "steady"},
    {"key": "irritability", "label": "Irritability", "group": "Mood & emotions", "higher_is_better": False, "lo": "none", "hi": "severe"},
    {"key": "depressive", "label": "Depressive symptoms", "group": "Mood & emotions", "higher_is_better": False, "lo": "none", "hi": "severe"},
    {"key": "apathy", "label": "Apathy and lethargy", "group": "Mood & emotions", "higher_is_better": False, "lo": "energised", "hi": "flat, drained"},
    {"key": "rumination", "label": "Rumination and repetitive thoughts", "group": "Thoughts", "higher_is_better": False, "lo": "none", "hi": "constant"},
    {"key": "racing_thoughts", "label": "Racing thoughts", "group": "Thoughts", "higher_is_better": False, "lo": "none", "hi": "very fast"},
    {"key": "cognitive_clarity", "label": "Cognitive clarity", "group": "Thoughts", "higher_is_better": True, "lo": "foggy", "hi": "clear"},
    {"key": "impulsivity", "label": "Impulsivity", "group": "Behavior & impulses", "higher_is_better": False, "lo": "none", "hi": "acting on every urge"},
    {"key": "compulsions", "label": "Compulsive behaviors (shopping urges)", "group": "Behavior & impulses", "higher_is_better": False, "lo": "none", "hi": "strong"},
    {"key": "hair_pulling", "label": "Hair pulling", "group": "Behavior & impulses", "higher_is_better": False, "unit": "episodes or minutes", "max": 600, "lo": "none", "hi": "a lot"},
]
SYMPTOM_KEYS = {s["key"] for s in SYMPTOMS}

EVENT_CATEGORIES = [
    {"key": "medication", "label": "Medication change"},
    {"key": "hydration", "label": "Hydration and fluids"},
    {"key": "illness", "label": "Vomiting, diarrhea, fever"},
    {"key": "symptom", "label": "Symptoms to watch"},
    {"key": "interaction", "label": "Interacting medicines"},
    {"key": "monitoring", "label": "Monitoring"},
    {"key": "other", "label": "Other"},
]
CATEGORY_KEYS = {c["key"] for c in EVENT_CATEGORIES}

CONCURRENT_MEDS = ["lithium", "fluoxetine", "lisdexamfetamine", "methylphenidate", "tirzepatide", "roacutan", "nsaid", "other"]

DEFAULT_SETTINGS: dict[str, Any] = {
    # Target range for serum lithium. Clinician-defined, so it is only ever a default here.
    "therapeutic_range": {"low": 0.6, "high": 1.0, "unit": "mmol/L", "note": "Editable. Use the range your clinician gave you."},
    # Optional: the day lithium treatment started, used as the cut between baseline and treatment.
    "baseline": {"treatment_start": None},
    # Theoretical model defaults (client side): shown as assumptions and adjustable there.
    "pk": {"half_life_h": 20.0, "absorption_per_h": 2.0, "interval_h": 12.0, "steady_state_fraction": 0.97},
    # How far apart two serum values can be before the chart breaks the line instead of connecting them.
    "chart": {"gap_days": 21},
    # Days within which an event is matched to the next serum measurement.
    "association_window_days": 14,
    "min_pairs_for_correlation": 10,
    # Typical timing in days since starting, from clinical references (varies by person and by what is being measured).
    "onset": {"steady_state_days": 5, "first_effects_days": 14, "fuller_effect_from_days": 28, "fuller_effect_to_days": 42},
}

SAFETY_NOTES = [
    {"title": "Hydration and salt", "text": "Lithium is cleared by the kidneys together with sodium. Large changes in fluid or salt intake, heavy sweating, vomiting, diarrhea or fever can change how much lithium stays in the body."},
    {"title": "NSAIDs and other interactions", "text": "Some medicines (NSAIDs such as ibuprofen or naproxen, certain blood pressure medicines and diuretics) are known to raise lithium levels. Record them here and mention them when you have a blood test."},
    {"title": "Signs worth a call", "text": "Persistent vomiting or diarrhea, new coarse tremor, unsteadiness, slurred speech, marked confusion or drowsiness are reasons to contact your clinician or emergency services promptly rather than waiting for the next scheduled test."},
    {"title": "Timing of blood tests", "text": "Serum lithium is usually compared at a similar time after the last dose, so the hours-since-dose value is stored with each measurement. Ask your clinician which timing they want."},
    {"title": "This is a log, not advice", "text": "Nothing on this page recommends starting, stopping or changing a dose. Charts show what you recorded; models are theoretical."},
]


def init_tables() -> None:
    with db.connect() as conn:
        conn.execute(
            """CREATE TABLE IF NOT EXISTS mon_regimens (
                   id TEXT PRIMARY KEY, med TEXT NOT NULL, started_at TEXT NOT NULL, ended_at TEXT,
                   daily_mg REAL, doses_per_day INTEGER, formulation TEXT, times TEXT, notes TEXT,
                   source TEXT NOT NULL DEFAULT 'manual', created_at TEXT NOT NULL)"""
        )
        conn.execute("CREATE INDEX IF NOT EXISTS mon_regimens_med ON mon_regimens (med, started_at)")
        conn.execute(
            """CREATE TABLE IF NOT EXISTS mon_labs (
                   id TEXT PRIMARY KEY, marker TEXT NOT NULL, value REAL NOT NULL, unit TEXT NOT NULL,
                   collected_at TEXT NOT NULL, ref_low REAL, ref_high REAL, lab_name TEXT,
                   hours_since_dose REAL, is_baseline INTEGER NOT NULL DEFAULT 0, notes TEXT,
                   source TEXT NOT NULL DEFAULT 'manual', created_at TEXT NOT NULL)"""
        )
        conn.execute("CREATE INDEX IF NOT EXISTS mon_labs_marker ON mon_labs (marker, collected_at)")
        conn.execute(
            """CREATE TABLE IF NOT EXISTS mon_symptoms (
                   id TEXT PRIMARY KEY, day TEXT NOT NULL UNIQUE, scores TEXT NOT NULL, note TEXT,
                   source TEXT NOT NULL DEFAULT 'manual', created_at TEXT NOT NULL, updated_at TEXT NOT NULL)"""
        )
        conn.execute(
            """CREATE TABLE IF NOT EXISTS mon_events (
                   id TEXT PRIMARY KEY, occurred_at TEXT NOT NULL, ended_at TEXT, category TEXT NOT NULL, kind TEXT,
                   title TEXT NOT NULL, detail TEXT, severity INTEGER,
                   source TEXT NOT NULL DEFAULT 'manual', created_at TEXT NOT NULL)"""
        )
        conn.execute("CREATE INDEX IF NOT EXISTS mon_events_time ON mon_events (occurred_at)")
        conn.execute(
            """CREATE TABLE IF NOT EXISTS mon_schedule (
                   id TEXT PRIMARY KEY, title TEXT NOT NULL, kind TEXT NOT NULL, markers TEXT, due_at TEXT NOT NULL,
                   repeat_days INTEGER, clinician TEXT, done_at TEXT, notes TEXT, created_at TEXT NOT NULL)"""
        )
        conn.execute(
            """CREATE TABLE IF NOT EXISTS mon_settings (
                   key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL)"""
        )


# ---- helpers ------------------------------------------------------------------------------------------------------


def _id() -> str:
    return uuid.uuid4().hex


def _parse(stamp: str) -> datetime:
    return datetime.strptime(stamp, db.TIME_FORMAT).replace(tzinfo=timezone.utc)


def _utc(moment: Optional[datetime]) -> Optional[str]:
    return db.to_utc(moment) if moment else None


def _day(stamp: str, tz: int) -> str:
    return (_parse(stamp) + timedelta(minutes=tz)).date().isoformat()


def _range(start: Optional[datetime], end: Optional[datetime]) -> tuple[str, str]:
    return (_utc(start) or "0000", _utc(end) or "9999")


def _loads(text: Optional[str], default: Any) -> Any:
    try:
        return json.loads(text) if text else default
    except ValueError:
        return default


def _rows(conn, sql: str, params: tuple = ()) -> list[dict]:
    return [dict(r) for r in conn.execute(sql, params).fetchall()]


def get_settings() -> dict:
    with db.connect() as conn:
        stored = {r["key"]: _loads(r["value"], None) for r in conn.execute("SELECT key, value FROM mon_settings")}
    merged = json.loads(json.dumps(DEFAULT_SETTINGS))
    for key, value in stored.items():
        if isinstance(merged.get(key), dict) and isinstance(value, dict):
            merged[key].update(value)
        elif value is not None:
            merged[key] = value
    return merged


def _num_or_none(x: Any) -> Optional[float]:
    return float(x) if isinstance(x, (int, float)) and not isinstance(x, bool) and math.isfinite(x) else None


@router.get("/progress")
def progress(tz: int = Query(0, ge=-840, le=840), _: str = Depends(caller)) -> dict:
    """Days since lithium tracking started and how many doses were logged, against the typical onset milestones."""
    first = _first_lithium_day(tz)
    with db.connect() as conn:
        rows = _rows(conn, "SELECT taken_at, dose_mg FROM med_doses WHERE med = 'lithium' ORDER BY taken_at")
    days_with = {_day(r["taken_at"], tz) for r in rows}
    today = (datetime.now(timezone.utc) + timedelta(minutes=tz)).date()
    since = (today - datetime.fromisoformat(first).date()).days if first else None
    return {
        "start_day": first, "days_since": since, "doses_logged": len(rows), "days_with_dose": len(days_with),
        "last_dose": rows[-1]["taken_at"] if rows else None, "onset": get_settings()["onset"],
        "note": "Typical timing from clinical references: blood levels settle in about 4 to 5 days, early effects over 1 to 2 weeks, fuller effect over several weeks. It varies a lot between people.",
    }


# ---- config and settings ------------------------------------------------------------------------------------------


@router.get("/config")
def config(_: str = Depends(caller)) -> dict:
    return {
        "markers": LAB_MARKERS, "symptoms": SYMPTOMS, "event_categories": EVENT_CATEGORIES,
        "medications": CONCURRENT_MEDS, "settings": get_settings(), "safety_notes": SAFETY_NOTES,
        "formulations": ["immediate_release", "extended_release"],
        "disclaimer": "Recorded data and descriptive statistics only. No diagnosis, no dosing advice. Simulations are theoretical.",
    }


class SettingIn(BaseModel):
    value: Any


@router.put("/settings/{key}")
def put_setting(key: str, body: SettingIn, _: str = Depends(caller)) -> dict:
    if key not in DEFAULT_SETTINGS:
        raise HTTPException(404, "unknown setting")
    with db.connect() as conn:
        conn.execute(
            "INSERT INTO mon_settings (key, value, updated_at) VALUES (?, ?, ?) "
            "ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
            (key, json.dumps(body.value), db.now_utc()),
        )
    return get_settings()


# ---- regimens (lithium dose changes and the other medicines) -------------------------------------------------------


class RegimenIn(BaseModel):
    med: str = Field(pattern="^(lithium|fluoxetine|lisdexamfetamine|methylphenidate|tirzepatide|roacutan|nsaid|other)$")
    started_at: datetime
    ended_at: Optional[datetime] = None
    daily_mg: Optional[float] = Field(None, ge=0, le=20000)
    doses_per_day: Optional[int] = Field(None, ge=1, le=12)
    formulation: Optional[str] = Field(None, pattern="^(immediate_release|extended_release)$")
    times: Optional[list[str]] = Field(None, max_length=12)
    notes: Optional[str] = Field(None, max_length=1000)


class RegimenPatch(BaseModel):
    started_at: Optional[datetime] = None
    ended_at: Optional[datetime] = None
    daily_mg: Optional[float] = Field(None, ge=0, le=20000)
    doses_per_day: Optional[int] = Field(None, ge=1, le=12)
    formulation: Optional[str] = Field(None, pattern="^(immediate_release|extended_release)$")
    times: Optional[list[str]] = Field(None, max_length=12)
    notes: Optional[str] = Field(None, max_length=1000)


def _regimen_out(r: dict) -> dict:
    r["times"] = _loads(r.get("times"), [])
    return r


@router.get("/regimens")
def list_regimens(med: Optional[str] = None, _: str = Depends(caller)) -> list[dict]:
    with db.connect() as conn:
        rows = _rows(conn, "SELECT * FROM mon_regimens" + (" WHERE med = ?" if med else "") + " ORDER BY started_at", (med,) if med else ())
    return [_regimen_out(r) for r in rows]


@router.post("/regimens", status_code=201)
def add_regimen(body: RegimenIn, who: str = Depends(caller)) -> dict:
    row = {
        "id": _id(), "med": body.med, "started_at": _utc(body.started_at), "ended_at": _utc(body.ended_at),
        "daily_mg": body.daily_mg, "doses_per_day": body.doses_per_day, "formulation": body.formulation,
        "times": json.dumps(body.times) if body.times else None, "notes": body.notes, "source": who, "created_at": db.now_utc(),
    }
    with db.connect() as conn:
        conn.execute(f"INSERT INTO mon_regimens ({', '.join(row)}) VALUES ({', '.join('?' * len(row))})", tuple(row.values()))
    return _regimen_out(row)


def _patch(table: str, row_id: str, fields: dict) -> dict:
    fields = {k: v for k, v in fields.items() if v is not None}
    with db.connect() as conn:
        if not conn.execute(f"SELECT 1 FROM {table} WHERE id = ?", (row_id,)).fetchone():
            raise HTTPException(404, "not found")
        if fields:
            conn.execute(f"UPDATE {table} SET {', '.join(k + ' = ?' for k in fields)} WHERE id = ?", (*fields.values(), row_id))
        return dict(conn.execute(f"SELECT * FROM {table} WHERE id = ?", (row_id,)).fetchone())


@router.patch("/regimens/{row_id}")
def patch_regimen(row_id: str, body: RegimenPatch, _: str = Depends(caller)) -> dict:
    data = body.model_dump()
    for k in ("started_at", "ended_at"):
        data[k] = _utc(data[k])
    data["times"] = json.dumps(data["times"]) if data["times"] else None
    return _regimen_out(_patch("mon_regimens", row_id, data))


def _delete(table: str, row_id: str) -> Response:
    with db.connect() as conn:
        if conn.execute(f"DELETE FROM {table} WHERE id = ?", (row_id,)).rowcount == 0:
            raise HTTPException(404, "not found")
    return Response(status_code=204)


@router.delete("/regimens/{row_id}", status_code=204)
def delete_regimen(row_id: str, _: str = Depends(caller)) -> Response:
    return _delete("mon_regimens", row_id)


# ---- laboratory results ---------------------------------------------------------------------------------------------


class LabIn(BaseModel):
    marker: str
    value: float
    unit: str = Field(max_length=20)
    collected_at: datetime
    ref_low: Optional[float] = None
    ref_high: Optional[float] = None
    lab_name: Optional[str] = Field(None, max_length=100)
    hours_since_dose: Optional[float] = Field(None, ge=0, le=500)
    is_baseline: bool = False
    notes: Optional[str] = Field(None, max_length=1000)


class LabPatch(BaseModel):
    value: Optional[float] = None
    unit: Optional[str] = Field(None, max_length=20)
    collected_at: Optional[datetime] = None
    ref_low: Optional[float] = None
    ref_high: Optional[float] = None
    lab_name: Optional[str] = Field(None, max_length=100)
    hours_since_dose: Optional[float] = Field(None, ge=0, le=500)
    is_baseline: Optional[bool] = None
    notes: Optional[str] = Field(None, max_length=1000)


def _hours_since_last_dose(collected_at: str) -> Optional[float]:
    """Hours since the last logged lithium dose before this sample, if that dose was within three days."""
    with db.connect() as conn:
        row = conn.execute("SELECT taken_at FROM med_doses WHERE med = 'lithium' AND taken_at <= ? ORDER BY taken_at DESC LIMIT 1", (collected_at,)).fetchone()
    if not row:
        return None
    hours = (_parse(collected_at) - _parse(row["taken_at"])).total_seconds() / 3600
    return round(hours, 2) if hours <= 72 else None


def _lab_out(r: dict) -> dict:
    r["is_baseline"] = bool(r["is_baseline"])
    low, high, v = r.get("ref_low"), r.get("ref_high"), r["value"]
    r["flag"] = "low" if low is not None and v < low else "high" if high is not None and v > high else ("ok" if low is not None or high is not None else None)
    return r


@router.get("/labs")
def list_labs(
    marker: Optional[str] = None, start: Optional[datetime] = Query(None, alias="from"), end: Optional[datetime] = Query(None, alias="to"),
    _: str = Depends(caller),
) -> list[dict]:
    lo, hi = _range(start, end)
    sql = "SELECT * FROM mon_labs WHERE collected_at >= ? AND collected_at <= ?"
    params: list = [lo, hi]
    if marker:
        sql += " AND marker = ?"
        params.append(marker)
    with db.connect() as conn:
        rows = _rows(conn, sql + " ORDER BY collected_at", tuple(params))
    return [_lab_out(r) for r in rows]


@router.post("/labs", status_code=201)
def add_lab(body: LabIn, who: str = Depends(caller)) -> dict:
    if body.marker not in MARKER_KEYS:
        raise HTTPException(422, "unknown marker")
    collected = db.to_utc(body.collected_at)
    hours = body.hours_since_dose
    if hours is None and body.marker == "lithium":
        hours = _hours_since_last_dose(collected)
    row = {
        "id": _id(), "marker": body.marker, "value": body.value, "unit": body.unit, "collected_at": collected,
        "ref_low": body.ref_low, "ref_high": body.ref_high, "lab_name": body.lab_name, "hours_since_dose": hours,
        "is_baseline": int(body.is_baseline), "notes": body.notes, "source": who, "created_at": db.now_utc(),
    }
    with db.connect() as conn:
        conn.execute(f"INSERT INTO mon_labs ({', '.join(row)}) VALUES ({', '.join('?' * len(row))})", tuple(row.values()))
    return _lab_out(row)


@router.patch("/labs/{row_id}")
def patch_lab(row_id: str, body: LabPatch, _: str = Depends(caller)) -> dict:
    data = body.model_dump()
    data["collected_at"] = _utc(data["collected_at"])
    if data["is_baseline"] is not None:
        data["is_baseline"] = int(data["is_baseline"])
    return _lab_out(_patch("mon_labs", row_id, data))


@router.delete("/labs/{row_id}", status_code=204)
def delete_lab(row_id: str, _: str = Depends(caller)) -> Response:
    return _delete("mon_labs", row_id)


def _baseline_for(rows: list[dict], treatment_start: Optional[str]) -> Optional[dict]:
    """A result flagged as baseline, else the last one before treatment started, else none (never guessed)."""
    flagged = [r for r in rows if r["is_baseline"]]
    if flagged:
        return flagged[0]
    if treatment_start:
        before = [r for r in rows if r["collected_at"] < treatment_start]
        if before:
            return before[-1]
    return None


@router.get("/labs/summary")
def labs_summary(
    start: Optional[datetime] = Query(None, alias="from"), end: Optional[datetime] = Query(None, alias="to"),
    scope: str = Query("lithium", pattern="^(lithium|roacutan)$"), _: str = Depends(caller),
) -> dict:
    """Per marker: every real result in the window, the latest, the baseline and the change from it."""
    settings = get_settings()
    treatment_start = (settings["baseline"] or {}).get("treatment_start")
    ts = _utc(datetime.fromisoformat(treatment_start.replace("Z", "+00:00"))) if treatment_start else None
    if scope == "roacutan":
        # the baseline is a result flagged as such, else the last one before the first logged Roacutan dose
        with db.connect() as conn:
            first = conn.execute("SELECT MIN(taken_at) m FROM med_doses WHERE med = 'roacutan'").fetchone()["m"]
        ts = first
    lo, hi = _range(start, end)
    out = []
    with db.connect() as conn:
        for m in (x for x in LAB_MARKERS if x["scope"] == scope):
            allrows = [_lab_out(r) for r in _rows(conn, "SELECT * FROM mon_labs WHERE marker = ? ORDER BY collected_at", (m["key"],))]
            rows = [r for r in allrows if lo <= r["collected_at"] <= hi]
            baseline = _baseline_for(allrows, ts)
            latest = rows[-1] if rows else None
            change = None
            if latest and baseline and baseline["id"] != latest["id"] and baseline["unit"] == latest["unit"]:
                delta = latest["value"] - baseline["value"]
                change = {"abs": round(delta, 4), "pct": round(delta / baseline["value"] * 100, 2) if baseline["value"] else None, "unit": latest["unit"]}
            out.append({
                **m, "n": len(rows), "results": rows, "latest": latest, "baseline": baseline, "change": change,
                "out_of_range": sum(1 for r in rows if r["flag"] in ("low", "high")),
            })
    return {"markers": out, "note": "Reference ranges are the ones printed on each result. Single values outside a range are not a diagnosis."}


# ---- symptoms -------------------------------------------------------------------------------------------------------


class SymptomIn(BaseModel):
    scores: dict[str, float]
    note: Optional[str] = Field(None, max_length=2000)


def _symptom_out(r: dict) -> dict:
    r["scores"] = _loads(r["scores"], {})
    return r


@router.get("/symptoms")
def list_symptoms(start: Optional[str] = Query(None, alias="from", max_length=10), end: Optional[str] = Query(None, alias="to", max_length=10), _: str = Depends(caller)) -> list[dict]:
    with db.connect() as conn:
        rows = _rows(conn, "SELECT * FROM mon_symptoms WHERE day >= ? AND day <= ? ORDER BY day", (start or "0000", end or "9999"))
    return [_symptom_out(r) for r in rows]


@router.put("/symptoms/{day}")
def put_symptoms(day: str, body: SymptomIn, who: str = Depends(caller)) -> dict:
    try:
        datetime.strptime(day, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(422, "day must be YYYY-MM-DD")
    clean: dict[str, float] = {}
    spec = {s["key"]: s for s in SYMPTOMS}
    for key, value in body.scores.items():
        if key not in spec:
            raise HTTPException(422, f"unknown metric {key}")
        top = spec[key].get("max", 10)
        if not 0 <= value <= top:
            raise HTTPException(422, f"{key} must be between 0 and {top}")
        clean[key] = value
    now = db.now_utc()
    with db.connect() as conn:
        conn.execute(
            "INSERT INTO mon_symptoms (id, day, scores, note, source, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?) "
            "ON CONFLICT(day) DO UPDATE SET scores = excluded.scores, note = excluded.note, updated_at = excluded.updated_at",
            (_id(), day, json.dumps(clean), body.note, who, now, now),
        )
        return _symptom_out(dict(conn.execute("SELECT * FROM mon_symptoms WHERE day = ?", (day,)).fetchone()))


@router.delete("/symptoms/{day}", status_code=204)
def delete_symptoms(day: str, _: str = Depends(caller)) -> Response:
    with db.connect() as conn:
        if conn.execute("DELETE FROM mon_symptoms WHERE day = ?", (day,)).rowcount == 0:
            raise HTTPException(404, "not found")
    return Response(status_code=204)


def _moving(days: list[str], values: dict[str, float], window: int) -> list[Optional[float]]:
    """Mean of the recorded values inside the trailing window; a day with no entries in the window stays None."""
    out: list[Optional[float]] = []
    for i, d in enumerate(days):
        start = (datetime.fromisoformat(d) - timedelta(days=window - 1)).date().isoformat()
        got = [values[k] for k in values if start <= k <= d]
        out.append(round(sum(got) / len(got), 3) if got else None)
    return out


def _slope_per_week(points: list[tuple[str, float]]) -> Optional[float]:
    if len(points) < 6:
        return None
    base = datetime.fromisoformat(points[0][0])
    xs = [(datetime.fromisoformat(d) - base).days / 7 for d, _ in points]
    ys = [v for _, v in points]
    mx, my = statistics.fmean(xs), statistics.fmean(ys)
    den = sum((x - mx) ** 2 for x in xs)
    return round(sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / den, 4) if den else None


def _pearson(a: list[float], b: list[float]) -> Optional[float]:
    if len(a) < 3 or len(set(a)) < 2 or len(set(b)) < 2:
        return None
    ma, mb = statistics.fmean(a), statistics.fmean(b)
    num = sum((x - ma) * (y - mb) for x, y in zip(a, b))
    den = math.sqrt(sum((x - ma) ** 2 for x in a) * sum((y - mb) ** 2 for y in b))
    return round(num / den, 3) if den else None


def _period_stats(rows: list[dict], key: str) -> dict:
    vals = [r["scores"][key] for r in rows if key in r["scores"]]
    return {
        "n": len(vals), "mean": round(statistics.fmean(vals), 3) if vals else None,
        "sd": round(statistics.pstdev(vals), 3) if len(vals) > 1 else None,
        "min": min(vals) if vals else None, "max": max(vals) if vals else None,
    }


def _first_lithium_day(tz: int) -> Optional[str]:
    settings = get_settings()
    start = (settings["baseline"] or {}).get("treatment_start")
    if start:
        return start[:10]
    with db.connect() as conn:
        a = conn.execute("SELECT MIN(started_at) m FROM mon_regimens WHERE med = 'lithium'").fetchone()["m"]
        b = conn.execute("SELECT MIN(taken_at) m FROM med_doses WHERE med = 'lithium'").fetchone()["m"]
    firsts = [x for x in (a, b) if x]
    return _day(min(firsts), tz) if firsts else None


def _daily_lithium_mg(tz: int) -> dict[str, float]:
    out: dict[str, float] = {}
    with db.connect() as conn:
        for r in conn.execute("SELECT taken_at, dose_mg FROM med_doses WHERE med = 'lithium'"):
            d = _day(r["taken_at"], tz)
            out[d] = out.get(d, 0) + r["dose_mg"]
    return out


def _on_days(med: str, tz: int, days: list[str]) -> set[str]:
    with db.connect() as conn:
        rows = _rows(conn, "SELECT started_at, ended_at FROM mon_regimens WHERE med = ?", (med,))
    spans = [(_day(r["started_at"], tz), _day(r["ended_at"], tz) if r["ended_at"] else "9999") for r in rows]
    return {d for d in days if any(a <= d <= b for a, b in spans)}


@router.get("/symptoms/summary")
def symptoms_summary(
    start: Optional[str] = Query(None, alias="from", max_length=10), end: Optional[str] = Query(None, alias="to", max_length=10),
    compare_from: Optional[str] = Query(None, max_length=10), compare_to: Optional[str] = Query(None, max_length=10),
    tz: int = Query(0, ge=-840, le=840), _: str = Depends(caller),
) -> dict:
    settings = get_settings()
    with db.connect() as conn:
        allrows = [_symptom_out(r) for r in _rows(conn, "SELECT * FROM mon_symptoms ORDER BY day")]
    rows = [r for r in allrows if (start or "0000") <= r["day"] <= (end or "9999")]
    days = [r["day"] for r in rows]
    first = _first_lithium_day(tz)
    # the starting values are the check-ins entered up to and including the first day of treatment; later check-ins are compared with them
    baseline_rows = [r for r in allrows if first and r["day"] <= first]
    treatment_rows = [r for r in rows if not first or r["day"] > first]
    compare_rows = [r for r in allrows if compare_from and compare_to and compare_from <= r["day"] <= compare_to]
    daily_mg = _daily_lithium_mg(tz)
    other = {m: _on_days(m, tz, days) for m in ("fluoxetine", "lisdexamfetamine", "methylphenidate", "tirzepatide")}
    minpairs = settings["min_pairs_for_correlation"]
    metrics = []
    for s in SYMPTOMS:
        key = s["key"]
        series = {r["day"]: r["scores"][key] for r in rows if key in r["scores"]}
        recorded = sorted(series)
        entry = {
            **s,
            "n": len(recorded),
            "points": [{"day": d, "value": series[d]} for d in recorded],
            "ma7": [{"day": d, "value": v} for d, v in zip(recorded, _moving(recorded, series, 7))],
            "ma30": [{"day": d, "value": v} for d, v in zip(recorded, _moving(recorded, series, 30))],
            "period": _period_stats(rows, key),
            "baseline": _period_stats(baseline_rows, key),
            "treatment": _period_stats(treatment_rows, key),
            "compare": _period_stats(compare_rows, key) if compare_rows else None,
            "slope_per_week": _slope_per_week([(d, series[d]) for d in recorded]),
            "correlations": [],
        }
        pairs = [(series[d], daily_mg[d]) for d in recorded if d in daily_mg]
        entry["correlations"].append({
            "vs": "lithium_daily_mg", "n": len(pairs),
            "r": _pearson([a for a, _ in pairs], [b for _, b in pairs]) if len(pairs) >= minpairs else None,
        })
        for med, on in other.items():
            a = [series[d] for d in recorded]
            b = [1.0 if d in on else 0.0 for d in recorded]
            entry["correlations"].append({"vs": f"{med}_on", "n": len(a), "r": _pearson(a, b) if len(a) >= minpairs else None})
        metrics.append(entry)
    # descriptive weekly and monthly means (calendar weeks starting Monday)
    def bucket(label_of) -> list[dict]:
        groups: dict[str, list[dict]] = {}
        for r in rows:
            groups.setdefault(label_of(datetime.fromisoformat(r["day"])), []).append(r)
        return [{"start": k, "n": len(v), "means": {s["key"]: _period_stats(v, s["key"])["mean"] for s in SYMPTOMS}} for k, v in sorted(groups.items())]
    return {
        "from": start, "to": end, "entries": len(rows), "notes": [{"day": r["day"], "note": r["note"]} for r in rows if r["note"]],
        "treatment_start": first, "baseline_entries": len(baseline_rows), "metrics": metrics,
        "weekly": bucket(lambda d: (d - timedelta(days=d.weekday())).date().isoformat()),
        "monthly": bucket(lambda d: d.strftime("%Y-%m")),
        "caveat": "Correlations are observational. They describe how recorded values moved together, not what caused the change.",
    }


# ---- events and monitoring schedule ---------------------------------------------------------------------------------


class EventIn(BaseModel):
    occurred_at: datetime
    ended_at: Optional[datetime] = None
    category: str
    kind: Optional[str] = Field(None, max_length=60)
    title: str = Field(min_length=1, max_length=200)
    detail: Optional[str] = Field(None, max_length=2000)
    severity: Optional[int] = Field(None, ge=0, le=10)


class EventPatch(BaseModel):
    occurred_at: Optional[datetime] = None
    ended_at: Optional[datetime] = None
    category: Optional[str] = None
    kind: Optional[str] = Field(None, max_length=60)
    title: Optional[str] = Field(None, min_length=1, max_length=200)
    detail: Optional[str] = Field(None, max_length=2000)
    severity: Optional[int] = Field(None, ge=0, le=10)


@router.get("/events")
def list_events(
    category: Optional[str] = None, start: Optional[datetime] = Query(None, alias="from"), end: Optional[datetime] = Query(None, alias="to"),
    _: str = Depends(caller),
) -> list[dict]:
    lo, hi = _range(start, end)
    sql, params = "SELECT * FROM mon_events WHERE occurred_at >= ? AND occurred_at <= ?", [lo, hi]
    if category:
        sql += " AND category IN (" + ",".join("?" * len(category.split(","))) + ")"
        params += category.split(",")
    with db.connect() as conn:
        return _rows(conn, sql + " ORDER BY occurred_at", tuple(params))


@router.post("/events", status_code=201)
def add_event(body: EventIn, who: str = Depends(caller)) -> dict:
    if body.category not in CATEGORY_KEYS:
        raise HTTPException(422, "unknown category")
    row = {
        "id": _id(), "occurred_at": _utc(body.occurred_at), "ended_at": _utc(body.ended_at), "category": body.category,
        "kind": body.kind, "title": body.title, "detail": body.detail, "severity": body.severity, "source": who, "created_at": db.now_utc(),
    }
    with db.connect() as conn:
        conn.execute(f"INSERT INTO mon_events ({', '.join(row)}) VALUES ({', '.join('?' * len(row))})", tuple(row.values()))
    return row


@router.patch("/events/{row_id}")
def patch_event(row_id: str, body: EventPatch, _: str = Depends(caller)) -> dict:
    data = body.model_dump()
    for k in ("occurred_at", "ended_at"):
        data[k] = _utc(data[k])
    if data["category"] is not None and data["category"] not in CATEGORY_KEYS:
        raise HTTPException(422, "unknown category")
    return _patch("mon_events", row_id, data)


@router.delete("/events/{row_id}", status_code=204)
def delete_event(row_id: str, _: str = Depends(caller)) -> Response:
    return _delete("mon_events", row_id)


class ScheduleIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    kind: str = Field(pattern="^(lab|appointment|other)$")
    markers: Optional[list[str]] = Field(None, max_length=20)
    due_at: datetime
    repeat_days: Optional[int] = Field(None, ge=1, le=730)
    clinician: Optional[str] = Field(None, max_length=200)
    notes: Optional[str] = Field(None, max_length=1000)


class SchedulePatch(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=200)
    due_at: Optional[datetime] = None
    done_at: Optional[datetime] = None
    repeat_days: Optional[int] = Field(None, ge=1, le=730)
    clinician: Optional[str] = Field(None, max_length=200)
    notes: Optional[str] = Field(None, max_length=1000)


def _sched_out(r: dict) -> dict:
    r["markers"] = _loads(r.get("markers"), [])
    return r


@router.get("/schedule")
def list_schedule(_: str = Depends(caller)) -> list[dict]:
    with db.connect() as conn:
        return [_sched_out(r) for r in _rows(conn, "SELECT * FROM mon_schedule ORDER BY due_at")]


@router.post("/schedule", status_code=201)
def add_schedule(body: ScheduleIn, _: str = Depends(caller)) -> dict:
    row = {
        "id": _id(), "title": body.title, "kind": body.kind, "markers": json.dumps(body.markers) if body.markers else None,
        "due_at": _utc(body.due_at), "repeat_days": body.repeat_days, "clinician": body.clinician, "done_at": None,
        "notes": body.notes, "created_at": db.now_utc(),
    }
    with db.connect() as conn:
        conn.execute(f"INSERT INTO mon_schedule ({', '.join(row)}) VALUES ({', '.join('?' * len(row))})", tuple(row.values()))
    return _sched_out(row)


@router.patch("/schedule/{row_id}")
def patch_schedule(row_id: str, body: SchedulePatch, _: str = Depends(caller)) -> dict:
    data = body.model_dump()
    for k in ("due_at", "done_at"):
        data[k] = _utc(data[k])
    return _sched_out(_patch("mon_schedule", row_id, data))


@router.delete("/schedule/{row_id}", status_code=204)
def delete_schedule(row_id: str, _: str = Depends(caller)) -> Response:
    return _delete("mon_schedule", row_id)


# ---- unified timeline, medication lanes ---------------------------------------------------------------------------


@router.get("/lanes")
def lanes(start: Optional[datetime] = Query(None, alias="from"), end: Optional[datetime] = Query(None, alias="to"), _: str = Depends(caller)) -> dict:
    """One lane per medicine: every regimen interval overlapping the window, so dose changes and starts/stops line up."""
    lo, hi = _range(start, end)
    with db.connect() as conn:
        rows = _rows(conn, "SELECT * FROM mon_regimens WHERE started_at <= ? AND (ended_at IS NULL OR ended_at >= ?) ORDER BY started_at", (hi, lo))
    out: dict[str, list[dict]] = {m: [] for m in CONCURRENT_MEDS}
    for r in rows:
        out[r["med"]].append(_regimen_out(r))
    return {"lanes": out}


@router.get("/timeline")
def timeline(
    start: Optional[datetime] = Query(None, alias="from"), end: Optional[datetime] = Query(None, alias="to"),
    categories: Optional[str] = Query(None, max_length=200), tz: int = Query(0, ge=-840, le=840), _: str = Depends(caller),
) -> dict:
    """Everything recorded, newest first, tagged by type. Each event is matched to the next serum lithium result (observational)."""
    lo, hi = _range(start, end)
    wanted = set(categories.split(",")) if categories else None
    settings = get_settings()
    window = timedelta(days=settings["association_window_days"])
    items: list[dict] = []
    with db.connect() as conn:
        labs = [_lab_out(r) for r in _rows(conn, "SELECT * FROM mon_labs WHERE collected_at >= ? AND collected_at <= ? ORDER BY collected_at", (lo, hi))]
        serum = [r for r in _rows(conn, "SELECT * FROM mon_labs WHERE marker = 'lithium' ORDER BY collected_at")]
        for r in _rows(conn, "SELECT * FROM mon_events WHERE occurred_at >= ? AND occurred_at <= ?", (lo, hi)):
            nxt = next((s for s in serum if s["collected_at"] >= r["occurred_at"] and _parse(s["collected_at"]) - _parse(r["occurred_at"]) <= window), None)
            items.append({
                "type": "event", "at": r["occurred_at"], "category": r["category"], "title": r["title"], "detail": r["detail"],
                "severity": r["severity"], "id": r["id"], "source": r["source"],
                "followed_by": None if not nxt else {"value": nxt["value"], "unit": nxt["unit"], "at": nxt["collected_at"], "days": round((_parse(nxt["collected_at"]) - _parse(r["occurred_at"])).total_seconds() / 86400, 1)},
            })
        for r in _rows(conn, "SELECT * FROM mon_regimens WHERE started_at >= ? AND started_at <= ?", (lo, hi)):
            items.append({"type": "regimen", "at": r["started_at"], "category": "medication", "med": r["med"], "id": r["id"], "source": r["source"],
                          "title": f"{r['med']} {'' if r['daily_mg'] is None else str(round(r['daily_mg'])) + ' mg/day'}".strip(), "detail": r["notes"], "formulation": r["formulation"]})
        for r in _rows(conn, "SELECT * FROM mon_regimens WHERE ended_at IS NOT NULL AND ended_at >= ? AND ended_at <= ?", (lo, hi)):
            items.append({"type": "regimen_end", "at": r["ended_at"], "category": "medication", "med": r["med"], "id": r["id"], "title": f"{r['med']} stopped", "source": r["source"]})
        days: dict[str, dict] = {}
        for r in conn.execute("SELECT taken_at, dose_mg FROM med_doses WHERE med = 'lithium' AND taken_at >= ? AND taken_at <= ? ORDER BY taken_at", (lo, hi)):
            d = days.setdefault(_day(r["taken_at"], tz), {"at": r["taken_at"], "mg": 0, "n": 0})
            d["mg"] += r["dose_mg"]
            d["n"] += 1
        for day, v in days.items():
            items.append({"type": "doses", "at": v["at"], "category": "doses", "med": "lithium", "title": f"Lithium {round(v['mg'])} mg", "detail": f"{v['n']} dose{'s' if v['n'] != 1 else ''} logged", "day": day})
        for r in _rows(conn, "SELECT * FROM mon_symptoms ORDER BY day"):
            at = (datetime.fromisoformat(r["day"]) - timedelta(minutes=tz)).replace(tzinfo=timezone.utc)
            if lo <= db.to_utc(at) <= hi:
                scores = _loads(r["scores"], {})
                items.append({"type": "symptoms", "at": db.to_utc(at), "category": "checkin", "title": f"Daily check-in ({len(scores)} metrics)", "detail": r["note"], "day": r["day"], "scores": scores})
    for r in labs:
        items.append({"type": "lab", "at": r["collected_at"], "category": "monitoring", "title": f"{r['marker']} {r['value']:g} {r['unit']}", "marker": r["marker"], "flag": r["flag"], "id": r["id"], "source": r["source"], "detail": r["notes"]})
    with db.connect() as conn:
        sched = [_sched_out(r) for r in _rows(conn, "SELECT * FROM mon_schedule ORDER BY due_at")]
    if wanted:
        items = [i for i in items if i["category"] in wanted]
    items.sort(key=lambda i: i["at"], reverse=True)
    now = db.now_utc()
    upcoming = [dict(s, state="done" if s["done_at"] else "overdue" if s["due_at"] < now else "upcoming") for s in sched]
    return {"items": items, "schedule": upcoming, "association_window_days": settings["association_window_days"]}


# ---- export ---------------------------------------------------------------------------------------------------------


@router.get("/export")
def export(dataset: str = Query("all", pattern="^(all|regimens|labs|symptoms|events|schedule|doses)$"), format: str = Query("json", pattern="^(json|csv)$"), _: str = Depends(caller)) -> Response:
    with db.connect() as conn:
        data = {
            "regimens": _rows(conn, "SELECT * FROM mon_regimens ORDER BY started_at"),
            "labs": _rows(conn, "SELECT * FROM mon_labs ORDER BY collected_at"),
            "symptoms": _rows(conn, "SELECT * FROM mon_symptoms ORDER BY day"),
            "events": _rows(conn, "SELECT * FROM mon_events ORDER BY occurred_at"),
            "schedule": _rows(conn, "SELECT * FROM mon_schedule ORDER BY due_at"),
            "doses": _rows(conn, "SELECT taken_at, dose_mg, food_state, formulation, source FROM med_doses WHERE med = 'lithium' ORDER BY taken_at"),
        }
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d")
    if format == "json":
        payload = data if dataset == "all" else {dataset: data[dataset]}
        return Response(json.dumps(payload, indent=2), media_type="application/json", headers={"Content-Disposition": f'attachment; filename="lithium-{dataset}-{stamp}.json"'})
    if dataset == "all":
        raise HTTPException(422, "pick one dataset for csv")
    rows = data[dataset]
    buf = io.StringIO()
    if rows:
        writer = csv.DictWriter(buf, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)
    return Response(buf.getvalue(), media_type="text/csv", headers={"Content-Disposition": f'attachment; filename="lithium-{dataset}-{stamp}.csv"'})
