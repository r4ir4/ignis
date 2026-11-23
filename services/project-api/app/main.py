import logging
from collections import Counter
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
import json
import math
from typing import Optional

from fastapi import Depends, FastAPI, HTTPException, Query
from pydantic import BaseModel, Field, field_validator

from . import backpack, battery, books, bills, brain, cleaning, checkin_forms, checkins, db, food, goals, habits, lists, lithium, meds, metrics, money, notes, routine, settings, subscriptions, todos, trips, wishlist, workouts
from .auth import caller


@asynccontextmanager
async def lifespan(_: FastAPI):
    db.init()
    lithium.init_tables()
    goals.init_tables()
    lists.init_tables()
    subscriptions.init_tables()
    wishlist.init_tables()
    backpack.init_tables()
    brain.init_tables()
    notes.init_tables()
    checkins.init_tables()
    checkin_forms.init_tables()
    routine.init_tables()
    trips.init_tables()
    money.init_tables()
    todos.init_tables()
    bills.init_tables()
    cleaning.init_tables()
    habits.init_tables()
    food.init_tables()
    books.init_tables()
    metrics.init_tables()
    settings.init_tables()
    workouts.init_tables()
    yield


app = FastAPI(title="ignis-api", docs_url=None, redoc_url=None, openapi_url=None, lifespan=lifespan)
app.include_router(lithium.router)
app.include_router(habits.router)
app.include_router(food.router)
app.include_router(books.router)
app.include_router(goals.router)
app.include_router(lists.router)
app.include_router(subscriptions.router)
app.include_router(wishlist.router)
app.include_router(backpack.router)
app.include_router(brain.router)
app.include_router(notes.router)
app.include_router(checkins.router)
app.include_router(checkin_forms.folders)
app.include_router(checkin_forms.forms)
app.include_router(routine.router)
app.include_router(trips.router)
app.include_router(money.router)
app.include_router(todos.router)
app.include_router(bills.router)
app.include_router(cleaning.router)
app.include_router(metrics.router)
app.include_router(settings.router)
app.include_router(workouts.router)


class ScanIn(BaseModel):
    text: str = Field(max_length=100_000)
    # When the photo was taken, if the client knows. Defaults to now.
    taken_at: Optional[datetime] = None


class Scan(BaseModel):
    id: str
    text: str
    device: str
    created_at: str


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/v1/me")
def me(who: str = Depends(caller)) -> dict[str, str]:
    return {"device": who}


@app.post("/v1/scans", response_model=Scan, status_code=201)
def create_scan(body: ScanIn, who: str = Depends(caller)) -> dict:
    text = body.text.strip()
    if not text:
        raise HTTPException(422, "text is empty")
    created_at = db.to_utc(body.taken_at) if body.taken_at else db.now_utc()
    return db.add_scan(text, who, created_at)


@app.get("/v1/scans", response_model=list[Scan])
def list_scans(
    limit: int = Query(50, ge=1, le=200),
    before: Optional[str] = Query(None, max_length=40, description="created_at of the last item seen"),
    q: Optional[str] = Query(None, max_length=200, description="search text"),
    _: str = Depends(caller),
) -> list[dict]:
    return db.list_scans(limit, before, q.strip() if q else None)


@app.get("/v1/scans/{scan_id}", response_model=Scan)
def read_scan(scan_id: str, _: str = Depends(caller)) -> dict:
    scan = db.get_scan(scan_id)
    if scan is None:
        raise HTTPException(404, "not found")
    return scan


@app.delete("/v1/scans/{scan_id}", status_code=204)
def delete_scan(scan_id: str, _: str = Depends(caller)) -> None:
    if not db.delete_scan(scan_id):
        raise HTTPException(404, "not found")


# ---- diary entries ----

ENTRY_MAX = 2000


class EntryIn(BaseModel):
    text: str = Field(max_length=ENTRY_MAX)
    # Backdate an entry ("this happened on Tuesday"). Defaults to now; the future is not allowed.
    created_at: Optional[datetime] = None


class EntryEdit(BaseModel):
    text: str = Field(max_length=ENTRY_MAX)


class Entry(BaseModel):
    id: str
    text: str
    source: str
    created_at: str
    edited_at: Optional[str] = None


class TagCount(BaseModel):
    tag: str
    count: int


class EntryStats(BaseModel):
    total: int
    streak: int
    days: dict[str, int]


def _cursor(value: Optional[str]) -> Optional[tuple]:
    """'<created_at>_<id>' of the last entry seen; a bare timestamp means strictly older."""
    if not value:
        return None
    stamp, _, entry_id = value.partition("_")
    try:
        return db.to_utc(datetime.fromisoformat(stamp.replace("Z", "+00:00"))), entry_id
    except ValueError:
        raise HTTPException(422, "bad cursor")


def _clean_text(text: str) -> str:
    text = text.strip()
    if not text:
        raise HTTPException(422, "text is empty")
    return text


def _research(entry: dict) -> None:
    """Entries tagged #pesquisar also land on the research list. A failure here must never lose the diary entry."""
    try:
        lists.sync_research(entry["id"], entry["text"])
    except Exception:  # the entry is already saved; the list link is a convenience
        logging.getLogger("ignis.lists").exception("could not sync the research list")


@app.post("/v1/entries", response_model=Entry, status_code=201)
def create_entry(body: EntryIn, who: str = Depends(caller)) -> dict:
    text = _clean_text(body.text)
    created_at = db.now_utc()
    if body.created_at:
        created_at = db.to_utc(body.created_at)
        if created_at > db.to_utc(datetime.now(timezone.utc) + timedelta(minutes=5)):
            raise HTTPException(422, "created_at is in the future")
    entry = db.add_entry(text, who, created_at)
    _research(entry)
    return entry


@app.get("/v1/entries", response_model=list[Entry])
def list_entries(
    limit: int = Query(20, ge=1, le=100),
    before: Optional[str] = Query(None, max_length=80, description="'<created_at>_<id>' of the last entry seen"),
    q: Optional[str] = Query(None, max_length=200, description="search text"),
    tag: Optional[str] = Query(None, max_length=40, description="only entries with this #tag"),
    start: Optional[datetime] = Query(None, description="entries at or after this moment"),
    end: Optional[datetime] = Query(None, description="entries before this moment"),
    _: str = Depends(caller),
) -> list[dict]:
    return db.list_entries(
        limit,
        _cursor(before),
        q.strip() if q else None,
        tag.lstrip("#") if tag else None,
        db.to_utc(start) if start else None,
        db.to_utc(end) if end else None,
    )


@app.get("/v1/entries/stats", response_model=EntryStats)
def entry_stats(
    tz: int = Query(0, ge=-840, le=840, description="your offset from UTC in minutes, e.g. -180"),
    _: str = Depends(caller),
) -> dict:
    """Entries per local day (for the calendar) and the current writing streak."""
    shift = timedelta(minutes=tz)
    days: Counter = Counter()
    times = db.entry_times()
    for stamp in times:
        local = datetime.strptime(stamp, db.TIME_FORMAT) + shift
        days[local.date().isoformat()] += 1

    today = (datetime.now(timezone.utc) + shift).date()
    day = today if today.isoformat() in days else today - timedelta(days=1)
    streak = 0
    while day.isoformat() in days:
        streak += 1
        day -= timedelta(days=1)
    return {"total": len(times), "streak": streak, "days": dict(days)}


@app.get("/v1/entries/tags", response_model=list[TagCount])
def entry_tags(limit: int = Query(20, ge=1, le=100), _: str = Depends(caller)) -> list[dict]:
    return db.tag_counts(limit)


@app.get("/v1/entries/{entry_id}", response_model=Entry)
def read_entry(entry_id: str, _: str = Depends(caller)) -> dict:
    entry = db.get_entry(entry_id)
    if entry is None:
        raise HTTPException(404, "not found")
    return entry


@app.patch("/v1/entries/{entry_id}", response_model=Entry)
def edit_entry(entry_id: str, body: EntryEdit, _: str = Depends(caller)) -> dict:
    entry = db.update_entry(entry_id, _clean_text(body.text))
    if entry is None:
        raise HTTPException(404, "not found")
    _research(entry)
    return entry


@app.delete("/v1/entries/{entry_id}", status_code=204)
def delete_entry(entry_id: str, _: str = Depends(caller)) -> None:
    if not db.delete_entry(entry_id):
        raise HTTPException(404, "not found")


# ---- health (Whoop and other wearables) ----

SOURCE_PATTERN = r"^[a-z0-9_-]{1,32}$"
METRIC_PATTERN = r"^[a-z0-9_]{1,40}$"


class MeasurementIn(BaseModel):
    metric: str = Field(pattern=METRIC_PATTERN)
    measured_at: datetime
    value: float
    unit: str = Field("", max_length=20)
    # Stable id from the source; re-sending the same id replaces the reading.
    external_id: Optional[str] = Field(None, max_length=120)

    @field_validator("value")
    @classmethod
    def _finite(cls, value: float) -> float:
        if not math.isfinite(value):
            raise ValueError("value must be a finite number")
        return value


class MeasurementsIn(BaseModel):
    source: str = Field(pattern=SOURCE_PATTERN)
    measurements: list[MeasurementIn] = Field(max_length=1000)


class WorkoutIn(BaseModel):
    external_id: str = Field(min_length=1, max_length=120)
    sport_name: str = Field("Activity", max_length=60)
    started_at: datetime
    ended_at: datetime
    timezone_offset: Optional[str] = Field(None, max_length=12)
    strain: Optional[float] = None
    average_heart_rate: Optional[float] = None
    max_heart_rate: Optional[float] = None
    kilojoule: Optional[float] = None
    percent_recorded: Optional[float] = None
    distance_meter: Optional[float] = None
    altitude_gain_meter: Optional[float] = None
    altitude_change_meter: Optional[float] = None
    zone_durations: dict[str, Optional[float]] = Field(default_factory=dict, max_length=12)


class WorkoutsIn(BaseModel):
    source: str = Field(pattern=SOURCE_PATTERN)
    workouts: list[WorkoutIn] = Field(max_length=500)


class Stored(BaseModel):
    stored: int


@app.post("/v1/health/measurements", response_model=Stored)
def ingest_measurements(body: MeasurementsIn, _: str = Depends(caller)) -> dict:
    rows = []
    for item in body.measurements:
        measured_at = db.to_utc(item.measured_at)
        rows.append({
            "external_id": item.external_id or f"{item.metric}:{measured_at}",
            "metric": item.metric,
            "measured_at": measured_at,
            "value": item.value,
            "unit": item.unit,
        })
    return {"stored": db.upsert_measurements(body.source, rows)}


@app.post("/v1/health/workouts", response_model=Stored)
def ingest_workouts(body: WorkoutsIn, _: str = Depends(caller)) -> dict:
    rows = []
    for item in body.workouts:
        row = item.model_dump(exclude={"zone_durations", "started_at", "ended_at"})
        row["started_at"] = db.to_utc(item.started_at)
        row["ended_at"] = db.to_utc(item.ended_at)
        row["zone_durations"] = json.dumps(item.zone_durations)
        rows.append(row)
    return {"stored": db.upsert_workouts(body.source, rows)}


@app.get("/v1/health/overview")
def health_overview(days: int = Query(30, ge=1, le=365), _: str = Depends(caller)) -> dict:
    """Latest reading per metric plus the last `days` of readings, oldest first, for charts."""
    since = db.to_utc(datetime.now(timezone.utc) - timedelta(days=days))
    return db.health_overview(since)


@app.get("/v1/health/workouts")
def health_workouts(limit: int = Query(10, ge=1, le=100), _: str = Depends(caller)) -> list[dict]:
    return db.list_workouts(limit)


@app.get("/v1/health/battery")
def health_battery(days: int = Query(30, ge=1, le=120), _: str = Depends(caller)) -> dict:
    """Body battery estimated from Whoop recovery, sleep and strain (see app/battery.py)."""
    return battery.battery_days(days)


# ---- medications (Vyvanse first) ----


class DoseIn(BaseModel):
    taken_at: Optional[datetime] = None
    dose_mg: float = Field(gt=0, le=5000)
    food_state: Optional[str] = Field(None, pattern="^(fasted|fed|high_fat)$")
    formulation: Optional[str] = Field(None, pattern="^(capsule|chewable|immediate_release|extended_release)$")
    notes: Optional[str] = Field(None, max_length=500)


class EventIn(BaseModel):
    event_type: str = Field(pattern="^(onset|strongest|wearing_off)$")
    occurred_at: Optional[datetime] = None


class CheckinIn(BaseModel):
    task_initiation: Optional[int] = Field(None, ge=1, le=5)
    motivation: Optional[int] = Field(None, ge=1, le=5)
    focus: Optional[int] = Field(None, ge=1, le=5)
    task_switching: Optional[int] = Field(None, ge=1, le=5)
    was_enough: Optional[str] = Field(None, pattern="^[a-z_]{1,40}$")
    note: Optional[str] = Field(None, max_length=1000)
    reported_at: Optional[datetime] = None


def _med(slug: str) -> dict:
    cfg = meds.config(slug)
    if cfg is None:
        raise HTTPException(404, "unknown medication")
    return cfg


def _not_future(moment: datetime) -> str:
    stamp = db.to_utc(moment)
    if stamp > db.to_utc(datetime.now(timezone.utc) + timedelta(minutes=5)):
        raise HTTPException(422, "that time is in the future")
    return stamp


@app.get("/v1/meds")
def list_meds(_: str = Depends(caller)) -> list[dict]:
    return list(meds.CONFIG.values())


@app.get("/v1/meds/{slug}/overview")
def med_overview(slug: str, tz: int = Query(0, ge=-840, le=840), _: str = Depends(caller)) -> dict:
    _med(slug)
    return meds.overview(slug, tz)


@app.get("/v1/meds/{slug}/doses")
def med_doses(
    slug: str,
    limit: int = Query(30, ge=1, le=200),
    before: Optional[str] = Query(None, max_length=40, description="taken_at of the last dose seen"),
    _: str = Depends(caller),
) -> list[dict]:
    _med(slug)
    return meds.list_doses(slug, limit, before)


@app.post("/v1/meds/{slug}/doses", status_code=201)
def log_dose(slug: str, body: DoseIn, who: str = Depends(caller)) -> dict:
    _med(slug)
    taken = _not_future(body.taken_at) if body.taken_at else db.now_utc()
    return meds.add_dose(slug, taken, body.dose_mg, body.food_state, body.formulation,
                         body.notes.strip() if body.notes else None, who)


@app.get("/v1/meds/{slug}/curve")
def med_curve(
    slug: str,
    start: Optional[datetime] = Query(None, alias="from"),
    end: Optional[datetime] = Query(None, alias="to"),
    step: int = Query(10, ge=1, le=60, description="minutes between points"),
    _: str = Depends(caller),
) -> dict:
    if "reference_cmax" not in _med(slug):
        raise HTTPException(404, "no level model for this medication")
    now = datetime.now(timezone.utc)
    start = start or now - timedelta(hours=18)
    end = end or now + timedelta(hours=14)
    if start.tzinfo is None:
        start = start.replace(tzinfo=timezone.utc)
    if end.tzinfo is None:
        end = end.replace(tzinfo=timezone.utc)
    if end <= start or end - start > timedelta(days=31):
        raise HTTPException(422, "pick a window between a minute and 31 days")
    return meds.curve(slug, start, end, step)


@app.post("/v1/meds/{slug}/fit")
def fit_med(slug: str, _: str = Depends(caller)) -> dict:
    """Fit the level curve to your own logged onset / strongest / wearing-off times (run again as you log more)."""
    _med(slug)
    try:
        return meds.fit_personal(slug)
    except ValueError as e:
        raise HTTPException(422, str(e))


@app.delete("/v1/meds/doses/{dose_id}", status_code=204)
def remove_dose(dose_id: str, _: str = Depends(caller)) -> None:
    if not meds.delete_dose(dose_id):
        raise HTTPException(404, "not found")


@app.post("/v1/meds/doses/{dose_id}/events", status_code=201)
def log_event(dose_id: str, body: EventIn, who: str = Depends(caller)) -> dict:
    dose = meds.get_dose(dose_id)
    if dose is None:
        raise HTTPException(404, "not found")
    at = _not_future(body.occurred_at) if body.occurred_at else db.now_utc()
    if at < dose["taken_at"]:
        raise HTTPException(422, "that is before the dose")
    return meds.add_event(dose, body.event_type, at, who)


@app.post("/v1/meds/doses/{dose_id}/checkin", status_code=201)
def log_checkin(dose_id: str, body: CheckinIn, who: str = Depends(caller)) -> dict:
    dose = meds.get_dose(dose_id)
    if dose is None:
        raise HTTPException(404, "not found")
    data = body.model_dump(exclude={"reported_at"})
    if not any(v is not None for v in data.values()):
        raise HTTPException(422, "nothing to record")
    reported = _not_future(body.reported_at) if body.reported_at else db.now_utc()
    return meds.add_checkin(dose, data, reported, who)
