#!/usr/bin/env python3
"""Garmin Connect -> ignis-api connector.

Pulls daily summaries (resting HR, HRV, sleep and stages, steps, active calories, SpO2,
breathing, Body Battery, stress, training readiness, VO2 max, weight) and activities from
Garmin Connect, and POSTs them to `{IGNIS_API_BASE}/v1/health/measurements` and `/workouts`
as the source `garmin`.

Needs the third-party `garminconnect` package (`pip install garminconnect`).

UNOFFICIAL API. Garmin has no personal-use API; `garminconnect` signs in the way the app does
and calls private endpoints. It can break whenever Garmin changes its login or an endpoint;
upgrading the library is the usual fix.

Two modes:

    garmin_sync.py --login           interactive sign-in (email, password, MFA code) that saves a
                                     session. Run it on your own computer, not on the server:
                                     Garmin throttles sign-ins from datacenter addresses (HTTP 429).
                                     Then copy the session folder to the server.
    garmin_sync.py --sync [--days N] resume the saved session, pull and post (what cron runs)

Environment:
    GARMIN_TOKEN_STORE   session folder, default ~/.config/ignis/garmin
    IGNIS_API_BASE       optional, default https://api.ignis.farm
    IGNIS_API_TOKEN      device token for api.ignis.farm (the "garmin" device)
"""

from __future__ import annotations

import argparse
import getpass
import json
import os
import sys
import time
import urllib.error
import urllib.request
from datetime import date, datetime, timedelta, timezone

USER_AGENT = os.environ.get("CONNECTOR_USER_AGENT", "ignis-connector/1.0")
DEFAULT_TOKEN_STORE = "~/.config/ignis/garmin"
MAX_BATCH = 500


class ConfigError(Exception):
    """Anything the user can fix by setting an env var or signing in again."""


def require_env(name, hint):
    value = os.environ.get(name, "").strip()
    if not value:
        raise ConfigError(f"{name} is not set. {hint}")
    return value


def token_store_path():
    return os.path.expanduser(os.environ.get("GARMIN_TOKEN_STORE") or DEFAULT_TOKEN_STORE)


# --------------------------------------------------------------------------- #
# garmin client
# --------------------------------------------------------------------------- #


def _garmin_class():
    try:
        from garminconnect import Garmin
    except ImportError:
        raise ConfigError("The `garminconnect` package is not installed:  pip install garminconnect")
    return Garmin


def _token_file(store):
    return os.path.join(store, "garmin_tokens.json")


def resume_client():
    """Resume the saved session. Never signs in with a password (that is --login's job)."""
    Garmin = _garmin_class()
    store = token_store_path()
    if not os.path.exists(_token_file(store)):
        raise ConfigError(
            f"No saved Garmin session at {store}. Run `garmin_sync.py --login` on your own computer, "
            "then copy that folder here."
        )
    client = Garmin()
    try:
        client.login(store)
    except Exception as exc:
        raise ConfigError(
            f"The saved Garmin session no longer works ({exc}). Run `--login` again on your own "
            "computer and copy the folder over. If it keeps failing, try "
            "`pip install --upgrade garminconnect`: Garmin may have changed its sign-in."
        )
    return client


def login(_args):
    Garmin = _garmin_class()
    if not sys.stdin.isatty():
        raise ConfigError("--login is interactive; run it in a terminal.")
    email = input("Garmin email: ").strip()
    password = getpass.getpass("Garmin password: ")
    store = token_store_path()
    # An old session in the folder is tried first and, when it is dead, stops the library before it
    # ever uses the password ("Failed to retrieve social profile"). Start from an empty folder.
    stale = _token_file(store)
    if os.path.exists(stale):
        os.remove(stale)
    client = Garmin(email=email, password=password, return_on_mfa=True)
    try:
        result = client.login(store)
    except Exception as exc:
        raise ConfigError(
            f"Garmin sign-in failed: {exc}\n"
            "If this mentions 429 or too many attempts, Garmin is throttling this connection: wait "
            "a few minutes, or try from a home connection."
        )
    if isinstance(result, tuple) and result and result[0] == "needs_mfa":
        code = input("Garmin MFA code: ").strip()
        client.resume_login(result[1], code)
    client.client.dump(store)
    if not os.path.exists(_token_file(store)):
        raise ConfigError(f"Signed in, but no session file appeared at {_token_file(store)}.")
    print(f"Saved the Garmin session to {store}")
    print("Copy that folder to the server's ~/.config/ignis/garmin, then run --sync there.")
    return 0


def _safe(call, label):
    """Garmin endpoints 404 or return null for days with no data; skip those."""
    try:
        return call()
    except Exception as exc:
        print(f"  skipped {label}: {exc}", file=sys.stderr)
        return None


# --------------------------------------------------------------------------- #
# normalization
# --------------------------------------------------------------------------- #


def _number(value):
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _measurement(metric, measured_at, value, unit, external_id):
    return {
        "metric": metric,
        "measured_at": measured_at,
        "value": round(float(value), 4),
        "unit": unit,
        "external_id": external_id,
    }


def _day_timestamp(day):
    """Daily rollups have no instant; anchor them to local noon of that day."""
    return datetime(day.year, day.month, day.day, 12, 0, 0).astimezone().isoformat()


def normalize_day(client, day):
    iso_day = day.isoformat()
    stamp = _day_timestamp(day)
    out = []

    def add(metric, value, unit):
        number = _number(value)
        if number is not None:
            out.append(_measurement(metric, stamp, number, unit, f"garmin:{iso_day}:{metric}"))

    stats = _safe(lambda: client.get_stats(iso_day), f"stats {iso_day}") or {}
    add("resting_hr", stats.get("restingHeartRate"), "bpm")
    add("steps", stats.get("totalSteps"), "count")
    add("active_calories", stats.get("activeKilocalories"), "kcal")
    # Body Battery: the level at the last reading, the day's range, and what charged and drained it.
    add("body_battery", stats.get("bodyBatteryMostRecentValue"), "percent")
    add("body_battery_high", stats.get("bodyBatteryHighestValue"), "percent")
    add("body_battery_low", stats.get("bodyBatteryLowestValue"), "percent")
    add("body_battery_charged", stats.get("bodyBatteryChargedValue"), "percent")
    add("body_battery_drained", stats.get("bodyBatteryDrainedValue"), "percent")
    # Garmin reports -1 when it has no stress reading for the day.
    for metric, key in (("stress_avg", "averageStressLevel"), ("stress_max", "maxStressLevel")):
        level = _number(stats.get(key))
        if level is not None and level >= 0:
            add(metric, level, "score")

    sleep = normalize_sleep(client, day, stamp)
    out += sleep
    # Breathing and SpO2 from the sleep payload are better; the daily rollup only fills in gaps.
    from_sleep = {item["metric"] for item in sleep}
    if "respiratory_rate" not in from_sleep:
        add("respiratory_rate", stats.get("avgWakingRespirationValue"), "breaths_per_min")
    if "spo2" not in from_sleep:
        add("spo2", stats.get("averageSpo2"), "percent")

    out += normalize_hrv(client, day, stamp)
    out += normalize_readiness(client, day, stamp)
    out += normalize_vo2max(client, day, stamp)
    out += normalize_weight(client, day)
    return out


def normalize_sleep(client, day, stamp):
    iso_day = day.isoformat()
    payload = _safe(lambda: client.get_sleep_data(iso_day), f"sleep {iso_day}") or {}
    daily = payload.get("dailySleepDTO") or {}
    out = []

    def add(metric, value, unit):
        number = _number(value)
        if number is not None:
            out.append(_measurement(metric, stamp, number, unit, f"garmin:{iso_day}:{metric}"))

    def minutes(seconds):
        number = _number(seconds)
        return None if number is None else number / 60.0

    add("sleep_minutes", minutes(daily.get("sleepTimeSeconds")), "min")
    add("deep_sleep_minutes", minutes(daily.get("deepSleepSeconds")), "min")
    add("rem_sleep_minutes", minutes(daily.get("remSleepSeconds")), "min")

    scores = daily.get("sleepScores") or payload.get("sleepScores") or {}
    overall = scores.get("overall") if isinstance(scores, dict) else None
    score = overall.get("value") if isinstance(overall, dict) else overall
    add("sleep_score", score if score is not None else daily.get("sleepScore"), "score")

    asleep = _number(daily.get("sleepTimeSeconds"))
    awake = _number(daily.get("awakeSleepSeconds")) or 0.0
    if asleep and asleep + awake > 0:
        add("sleep_efficiency", 100.0 * asleep / (asleep + awake), "percent")

    add("respiratory_rate", daily.get("averageRespirationValue"), "breaths_per_min")
    add("spo2", daily.get("averageSpO2Value"), "percent")
    return out


def normalize_hrv(client, day, stamp):
    iso_day = day.isoformat()
    payload = _safe(lambda: client.get_hrv_data(iso_day), f"hrv {iso_day}") or {}
    value = _number(((payload or {}).get("hrvSummary") or {}).get("lastNightAvg"))
    if value is None:
        return []
    return [_measurement("hrv_ms", stamp, value, "ms", f"garmin:{iso_day}:hrv_ms")]


def normalize_readiness(client, day, stamp):
    """Garmin's 0-100 training readiness (only on watches that support it)."""
    iso_day = day.isoformat()
    payload = _safe(lambda: client.get_training_readiness(iso_day), f"readiness {iso_day}")
    entries = payload if isinstance(payload, list) else [payload] if payload else []
    for entry in entries:
        value = _number((entry or {}).get("score"))
        if value is not None:
            return [_measurement("training_readiness", stamp, value, "score", f"garmin:{iso_day}:training_readiness")]
    return []


def normalize_vo2max(client, day, stamp):
    iso_day = day.isoformat()
    payload = _safe(lambda: client.get_max_metrics(iso_day), f"vo2max {iso_day}")
    if not payload:
        return []
    entry = payload[0] if isinstance(payload, list) else payload
    generic = (entry or {}).get("generic") or {}
    value = _number(generic.get("vo2MaxPreciseValue") or generic.get("vo2MaxValue"))
    if value is None:
        return []
    return [_measurement("vo2max", stamp, value, "ml_kg_min", f"garmin:{iso_day}:vo2max")]


def normalize_weight(client, day):
    iso_day = day.isoformat()
    payload = _safe(lambda: client.get_body_composition(iso_day), f"weight {iso_day}") or {}
    out = []
    for entry in payload.get("dateWeightList") or []:
        grams = _number(entry.get("weight"))
        if grams is None:
            continue
        millis = _number(entry.get("date"))
        measured_at = (
            datetime.fromtimestamp(millis / 1000.0, tz=timezone.utc).isoformat() if millis else _day_timestamp(day)
        )
        sample_id = entry.get("samplePk") or entry.get("date") or iso_day
        out.append(_measurement("weight_kg", measured_at, grams / 1000.0, "kg", f"garmin:weight:{sample_id}"))
    return out


def normalize_activities(records):
    out = []
    for record in records or []:
        if not isinstance(record, dict):
            continue
        activity_id = record.get("activityId") or record.get("activityUUID")
        started_at = record.get("startTimeGMT") or record.get("startTimeLocal")
        duration = _number(record.get("duration"))
        if activity_id is None or not started_at or duration is None:
            continue
        try:
            start = datetime.strptime(str(started_at), "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc)
        except ValueError:
            try:
                start = datetime.fromisoformat(str(started_at).replace("Z", "+00:00"))
            except ValueError:
                continue
        if start.tzinfo is None:
            start = start.replace(tzinfo=timezone.utc)
        kind = (record.get("activityType") or {}).get("typeKey") or record.get("activityName") or "activity"
        calories = _number(record.get("calories"))
        out.append({
            "external_id": f"garmin:{activity_id}",
            "sport_name": str(kind).replace("_", " ").strip().lower(),
            "started_at": start.isoformat(),
            "ended_at": (start + timedelta(seconds=duration)).isoformat(),
            "average_heart_rate": _number(record.get("averageHR")),
            "max_heart_rate": _number(record.get("maxHR")),
            "kilojoule": calories * 4.184 if calories is not None else None,
            "distance_meter": _number(record.get("distance")),
            "altitude_gain_meter": _number(record.get("elevationGain")),
            "altitude_change_meter": _number(record.get("elevationLoss")),
        })
    return out


# --------------------------------------------------------------------------- #
# ignis-api ingest
# --------------------------------------------------------------------------- #


def request_with_retry(url, headers, body, attempts=5):
    delay = 2.0
    for attempt in range(1, attempts + 1):
        data = json.dumps(body).encode()
        request = urllib.request.Request(
            url, data=data, method="POST",
            headers={"User-Agent": USER_AGENT, "Accept": "application/json", "Content-Type": "application/json", **headers},
        )
        try:
            with urllib.request.urlopen(request, timeout=45) as response:
                return response.status, response.read().decode("utf-8", "replace")
        except urllib.error.HTTPError as exc:
            status, raw = exc.code, exc.read().decode("utf-8", "replace")
        if status in (429,) or 500 <= status < 600:
            if attempt < attempts:
                print(f"  {status} from {url}, retrying in {delay:.0f}s", file=sys.stderr)
                time.sleep(delay)
                delay = min(delay * 2, 120)
                continue
        return status, raw
    return status, raw


def ignis_target():
    base = (os.environ.get("IGNIS_API_BASE") or "https://api.ignis.farm").rstrip("/")
    token = require_env("IGNIS_API_TOKEN", "Create one with ignis-api/new-token.sh garmin.")
    return base, {"Authorization": f"Bearer {token}"}


def _chunks(items, size):
    for index in range(0, len(items), size):
        yield items[index : index + size]


def post(kind, items, dry_run):
    if not items:
        print(f"No {kind} to send.")
        return 0
    if dry_run:
        print(json.dumps({"source": "garmin", kind: items[:5]}, indent=2))
        print(f"\n[dry-run] {len(items)} {kind} not sent.", file=sys.stderr)
        return 0
    base, headers = ignis_target()
    sent = 0
    for chunk in _chunks(items, MAX_BATCH):
        status, raw = request_with_retry(f"{base}/v1/health/{kind}", headers, {"source": "garmin", kind: chunk})
        if status >= 400:
            raise ConfigError(f"{kind} ingest failed ({status}) after {sent} sent: {raw[:400]}")
        sent += len(chunk)
        print(f"Posted {len(chunk)} {kind} ({sent}/{len(items)}).")
    return 0


# --------------------------------------------------------------------------- #
# entry point
# --------------------------------------------------------------------------- #


def sync(args):
    client = resume_client()
    today = date.today()
    measurements = []
    for offset in range(args.days):
        day = today - timedelta(days=offset)
        print(f"Reading {day.isoformat()}")
        measurements += normalize_day(client, day)

    start_day = today - timedelta(days=args.days - 1)
    records = _safe(
        lambda: client.get_activities_by_date(start_day.isoformat(), today.isoformat()),
        f"activities {start_day.isoformat()} to {today.isoformat()}",
    ) or []
    workouts = normalize_activities(records)

    print(f"Normalized {len(measurements)} measurement(s) and {len(workouts)} activity(ies).")
    post("measurements", measurements, args.dry_run)
    return post("workouts", workouts, args.dry_run)


def main(argv=None):
    parser = argparse.ArgumentParser(description="Sync Garmin Connect into ignis-api.")
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--login", action="store_true", help="interactive sign-in; saves a session")
    mode.add_argument("--sync", action="store_true", help="resume the session, pull and post")
    parser.add_argument("--days", type=int, default=2, help="days back to read (default: 2)")
    parser.add_argument("--dry-run", action="store_true", help="print the payload instead of posting")
    args = parser.parse_args(argv)
    if args.days < 1:
        parser.error("--days must be at least 1")
    try:
        return login(args) if args.login else sync(args)
    except ConfigError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    except urllib.error.URLError as exc:
        print(f"error: network failure talking to ignis-api: {exc}", file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        return 130


if __name__ == "__main__":
    sys.exit(main())
