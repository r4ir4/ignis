"""Body battery: an energy estimate from Whoop's numbers.

Garmin builds its Body Battery from heart-rate stress all day. Whoop gives no continuous
heart rate, only last night's recovery and sleep and the day's strain so far, so this is an
estimate from those, not Garmin's number:

  charge (at waking) = 55% recovery + 30% sleep length (8 h = full) + 15% sleep efficiency
  drain (so far)     = 70 points x strain / 21   (a maxed-out day empties 70 of the 100)
  battery now        = charge - drain, never below 5
"""
from datetime import datetime, timedelta
from typing import Optional

from . import db

DRAIN_AT_MAX_STRAIN = 70.0
FULL_NIGHT_MINUTES = 480.0


def _clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def charge(recovery: float, sleep_minutes: float, efficiency: Optional[float]) -> float:
    sleep_score = min(1.0, sleep_minutes / FULL_NIGHT_MINUTES) * 100
    eff_score = sleep_score if efficiency is None else _clamp((efficiency - 75) / 20, 0, 1) * 100
    return _clamp(0.55 * recovery + 0.30 * sleep_score + 0.15 * eff_score, 5, 100)


def drain(strain: float) -> float:
    return DRAIN_AT_MAX_STRAIN * _clamp(strain, 0, 21) / 21


def _t(stamp: str) -> datetime:
    return datetime.strptime(stamp, db.TIME_FORMAT)


def _nearest(points: list, moment: datetime, within: timedelta) -> Optional[float]:
    best, gap = None, within
    for stamp, value in points:
        diff = abs(_t(stamp) - moment)
        if diff <= gap:
            best, gap = value, diff
    return best


def battery_days(days: int) -> dict:
    since = db.to_utc(datetime.utcnow() - timedelta(days=days + 2))
    series = db.health_overview(since)["series"]
    sleep, eff, strain = series["sleep_minutes"], series["sleep_efficiency"], series["strain"]

    out = []
    for stamp, recovery in series["recovery_score"]:
        night = _t(stamp)
        minutes = _nearest(sleep, night, timedelta(hours=2))
        if minutes is None:
            continue
        wake = charge(recovery, minutes, _nearest(eff, night, timedelta(hours=2)))
        # A Whoop day (cycle) starts at sleep onset, so a night's own cycle starts when the night does
        # and covers the day that follows it.
        spent = _nearest(strain, night, timedelta(hours=3))
        out.append({
            "night": stamp,
            "recovery": round(recovery),
            "sleep_minutes": round(minutes),
            "strain": None if spent is None else round(spent, 1),
            "charged": round(wake),
            "drained": None if spent is None else round(drain(spent)),
            "now": None if spent is None else round(_clamp(wake - drain(spent), 5, 100)),
        })
    out = out[-days:]
    return {"days": out, "latest": out[-1] if out else None, "garmin": _garmin(series)}


def _garmin(series: dict) -> dict:
    """Garmin's own Body Battery, one entry per day it has data for (oldest first)."""
    by_day: dict[str, dict] = {}
    keys = {
        "body_battery": "now", "body_battery_high": "high", "body_battery_low": "low",
        "body_battery_charged": "charged", "body_battery_drained": "drained",
    }
    for metric, key in keys.items():
        for stamp, value in series.get(metric, []):
            by_day.setdefault(stamp, {"day": stamp})[key] = round(value)
    days = [by_day[stamp] for stamp in sorted(by_day) if "now" in by_day[stamp]]
    return {"days": days, "latest": days[-1] if days else None}
