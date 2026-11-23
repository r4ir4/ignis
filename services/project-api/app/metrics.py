"""Body metrics: weight, body fat and tape measurements, one value per metric per local day, plus an optional goal per metric.

Days are plain local dates (YYYY-MM-DD) sent by the client, so nothing here needs to know a time zone. Weight is in kg,
body fat in percent and every tape measurement in cm.
"""
from datetime import date, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from pydantic import BaseModel, Field

from . import db
from .auth import caller

router = APIRouter(prefix="/v1/metrics", tags=["metrics"])

# key, label, unit, group, lowest and highest value accepted
METRICS = [
    ("weight", "Weight", "kg", "body", 20, 500),
    ("body_fat", "Body fat", "%", "body", 1, 80),
    ("neck", "Neck", "cm", "upper", 10, 100),
    ("shoulders", "Shoulders", "cm", "upper", 30, 200),
    ("chest", "Chest", "cm", "upper", 40, 250),
    ("arm", "Arm", "cm", "upper", 10, 100),
    ("waist", "Waist", "cm", "core", 30, 250),
    ("hips", "Hips", "cm", "core", 40, 250),
    ("thigh", "Thigh", "cm", "lower", 20, 150),
    ("calf", "Calf", "cm", "lower", 15, 100),
]
BY_KEY = {m[0]: m for m in METRICS}


def init_tables() -> None:
    with db.connect() as conn:
        conn.execute(
            """CREATE TABLE IF NOT EXISTS body_metrics (
                   day TEXT NOT NULL, metric TEXT NOT NULL, value REAL NOT NULL, updated_at TEXT NOT NULL,
                   PRIMARY KEY (day, metric))"""
        )
        conn.execute("CREATE INDEX IF NOT EXISTS body_metrics_metric ON body_metrics (metric, day)")
        conn.execute("CREATE TABLE IF NOT EXISTS body_goals (metric TEXT PRIMARY KEY, value REAL NOT NULL, updated_at TEXT NOT NULL)")


class EntryIn(BaseModel):
    # a metric set to null is removed from that day
    values: dict[str, Optional[float]] = Field(default_factory=dict)


class GoalIn(BaseModel):
    value: Optional[float] = None


def _day(value: str) -> date:
    try:
        return date.fromisoformat(value)
    except ValueError:
        raise HTTPException(422, "day must be YYYY-MM-DD")


def _check(metric: str, value: float) -> float:
    if metric not in BY_KEY:
        raise HTTPException(422, f"unknown metric {metric}")
    _, label, _, _, lo, hi = BY_KEY[metric]
    if not lo <= value <= hi:
        raise HTTPException(422, f"{label.lower()} must be between {lo} and {hi}")
    return round(value, 1)


@router.get("/overview")
def overview(day: str = Query(..., max_length=10), _: str = Depends(caller)) -> dict:
    today = _day(day)
    with db.connect() as conn:
        rows = conn.execute("SELECT day, metric, value FROM body_metrics ORDER BY day").fetchall()
        goals = {r["metric"]: r["value"] for r in conn.execute("SELECT metric, value FROM body_goals")}
    series: dict[str, list] = {}
    by_day: dict[str, dict] = {}
    for r in rows:
        series.setdefault(r["metric"], []).append({"day": r["day"], "value": r["value"]})
        by_day.setdefault(r["day"], {})[r["metric"]] = r["value"]
    month_ago = (today - timedelta(days=30)).isoformat()
    out = []
    for key, label, unit, group, _, _ in METRICS:
        pts = series.get(key, [])
        latest = pts[-1] if pts else None
        # change since the entry closest to 30 days ago (or the first entry when the history is shorter)
        base = next((p for p in pts if p["day"] >= month_ago), pts[0] if pts else None)
        out.append({
            "key": key, "label": label, "unit": unit, "group": group, "goal": goals.get(key),
            "latest": latest, "first": pts[0] if pts else None,
            "change_30": round(latest["value"] - base["value"], 1) if latest and base and base is not latest else None,
            "points": pts,
        })
    days = sorted(by_day, reverse=True)
    return {
        "day": day, "metrics": out, "days_logged": len(days),
        "entries": [{"day": d, "values": by_day[d]} for d in days[:30]],
    }


@router.put("/entries/{day}")
def put_entry(day: str, body: EntryIn, _: str = Depends(caller)) -> dict:
    d = _day(day)
    if d > date.today() + timedelta(days=1):
        raise HTTPException(422, "that day is in the future")
    clean = {k: (None if v is None else _check(k, v)) for k, v in body.values.items()}
    with db.connect() as conn:
        for metric, value in clean.items():
            if value is None:
                conn.execute("DELETE FROM body_metrics WHERE day = ? AND metric = ?", (day, metric))
            else:
                conn.execute(
                    "INSERT INTO body_metrics (day, metric, value, updated_at) VALUES (?, ?, ?, ?) "
                    "ON CONFLICT(day, metric) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
                    (day, metric, value, db.now_utc()))
    return {"day": day, "values": clean}


@router.delete("/entries/{day}", status_code=204)
def delete_entry(day: str, _: str = Depends(caller)) -> Response:
    _day(day)
    with db.connect() as conn:
        conn.execute("DELETE FROM body_metrics WHERE day = ?", (day,))
    return Response(status_code=204)


@router.put("/goals/{metric}")
def put_goal(metric: str, body: GoalIn, _: str = Depends(caller)) -> dict:
    if metric not in BY_KEY:
        raise HTTPException(404, "unknown metric")
    with db.connect() as conn:
        if body.value is None:
            conn.execute("DELETE FROM body_goals WHERE metric = ?", (metric,))
            return {"metric": metric, "value": None}
        value = _check(metric, body.value)
        conn.execute(
            "INSERT INTO body_goals (metric, value, updated_at) VALUES (?, ?, ?) "
            "ON CONFLICT(metric) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at", (metric, value, db.now_utc()))
    return {"metric": metric, "value": value}
