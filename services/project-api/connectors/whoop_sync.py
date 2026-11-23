#!/usr/bin/env python3
"""Whoop -> ignis-api connector.

Pulls recovery, sleep, cycle and workout records from the Whoop v2 API,
normalizes them to canonical metric names, and POSTs them to
`{IGNIS_API_BASE}/v1/health/measurements` and `/v1/health/workouts`.

Moved here from the cabecao dashboard's connector; the Whoop side is unchanged.

Standard library only. Two modes:

    whoop_sync.py --login            one-time browser OAuth, writes the token file
    whoop_sync.py --sync [--days N]  refresh + pull + post

Environment:
    WHOOP_CLIENT_ID       OAuth client id from developer-dashboard.whoop.com
    WHOOP_CLIENT_SECRET   OAuth client secret
    WHOOP_REDIRECT_URI    must match the app exactly, e.g. http://localhost:8477/callback
    WHOOP_TOKEN_FILE      optional, default ~/.config/ignis/whoop_tokens.json
    IGNIS_API_BASE        optional, default https://api.ignis.farm
    IGNIS_API_TOKEN       device token for api.ignis.farm (the "whoop" device)

See README.md for the refresh-token rotation caveat.
"""

from __future__ import annotations

import argparse
import http.server
import json
import os
import socket
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import webbrowser
from datetime import datetime, timedelta, timezone

WHOOP_API = "https://api.prod.whoop.com"
AUTH_URL = f"{WHOOP_API}/oauth/oauth2/auth"
TOKEN_URL = f"{WHOOP_API}/oauth/oauth2/token"

# `offline` is what makes Whoop issue a refresh token at all; without it --sync
# can never work unattended.
# Whoop sits behind Cloudflare, which blocks urllib's default
# "Python-urllib/3.x" User-Agent outright -- it answers the token exchange with
# HTTP 403 and Cloudflare error 1010 ("banned based on browser signature")
# before the request ever reaches Whoop. Any honest, non-default identifier
# gets through; override it if a future Cloudflare rule tightens further.
USER_AGENT = os.environ.get("CONNECTOR_USER_AGENT", "ignis-connector/1.0")
DEFAULT_HEADERS = {"User-Agent": USER_AGENT, "Accept": "application/json"}


SCOPES = [
    "read:recovery",
    "read:sleep",
    "read:cycles",
    "read:workout",
    "read:profile",
    "read:body_measurement",
    "offline",
]

DEFAULT_TOKEN_FILE = os.path.expanduser("~/.config/ignis/whoop_tokens.json")
MAX_BATCH = 500
# Whoop caps collection page size at 25 regardless of what you ask for.
PAGE_LIMIT = 25

REAUTH_HINT = (
    "Re-authorize with:  WHOOP_CLIENT_ID=... WHOOP_CLIENT_SECRET=... "
    "WHOOP_REDIRECT_URI=... python3 whoop_sync.py --login"
)


class ConfigError(Exception):
    """Raised for anything the user can fix by setting an env var or re-auth."""


# --------------------------------------------------------------------------- #
# config
# --------------------------------------------------------------------------- #


def require_env(name, hint):
    value = os.environ.get(name, "").strip()
    if not value:
        raise ConfigError(f"{name} is not set. {hint}")
    return value


def oauth_config():
    return {
        "client_id": require_env(
            "WHOOP_CLIENT_ID", "Create an app at https://developer-dashboard.whoop.com"
        ),
        "client_secret": require_env(
            "WHOOP_CLIENT_SECRET", "Found next to the client id in the Whoop app settings."
        ),
        "redirect_uri": require_env(
            "WHOOP_REDIRECT_URI",
            "Must match the redirect URI registered on the Whoop app byte for byte, "
            "e.g. http://localhost:8477/callback",
        ),
    }


def token_file_path():
    return os.path.expanduser(os.environ.get("WHOOP_TOKEN_FILE") or DEFAULT_TOKEN_FILE)


# --------------------------------------------------------------------------- #
# token storage
# --------------------------------------------------------------------------- #


def load_tokens(path):
    try:
        with open(path, "r", encoding="utf-8") as handle:
            return json.load(handle)
    except FileNotFoundError:
        raise ConfigError(f"No Whoop token file at {path}.\n{REAUTH_HINT}")
    except (OSError, ValueError) as exc:
        raise ConfigError(f"Whoop token file at {path} is unreadable ({exc}).\n{REAUTH_HINT}")


def save_tokens(path, tokens):
    """Write tokens durably.

    Whoop rotates refresh tokens: each refresh returns a new one and kills the
    old one server-side. If we lose the new token we lose the connection, so the
    write is temp-file + fsync + atomic rename, and the file is fsync'd before
    the rename is published.
    """
    directory = os.path.dirname(path) or "."
    os.makedirs(directory, mode=0o700, exist_ok=True)
    tmp = f"{path}.tmp.{os.getpid()}"
    with open(tmp, "w", encoding="utf-8") as handle:
        json.dump(tokens, handle, indent=2, sort_keys=True)
        handle.write("\n")
        handle.flush()
        os.fsync(handle.fileno())
    os.chmod(tmp, 0o600)
    os.replace(tmp, path)
    dir_fd = os.open(directory, os.O_RDONLY)
    try:
        os.fsync(dir_fd)
    finally:
        os.close(dir_fd)


# --------------------------------------------------------------------------- #
# http helpers
# --------------------------------------------------------------------------- #


def http_json(url, method="GET", headers=None, body=None, form=None, timeout=45):
    """Single request. Returns (status, parsed_json_or_None, raw_text)."""
    data = None
    headers = {**DEFAULT_HEADERS, **dict(headers or {})}
    if form is not None:
        data = urllib.parse.urlencode(form).encode()
        headers["Content-Type"] = "application/x-www-form-urlencoded"
    elif body is not None:
        data = json.dumps(body).encode()
        headers["Content-Type"] = "application/json"

    request = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            raw = response.read().decode("utf-8", "replace")
            return response.status, _maybe_json(raw), raw, dict(response.headers)
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8", "replace")
        return exc.code, _maybe_json(raw), raw, dict(exc.headers or {})


def _maybe_json(raw):
    try:
        return json.loads(raw)
    except ValueError:
        return None


def request_with_retry(url, method="GET", headers=None, body=None, form=None, attempts=5):
    """Retry 5xx with exponential backoff; honour Retry-After on 429."""
    delay = 2.0
    for attempt in range(1, attempts + 1):
        status, parsed, raw, response_headers = http_json(
            url, method=method, headers=headers, body=body, form=form
        )
        if status == 429:
            wait = _retry_after_seconds(response_headers, delay)
            if attempt == attempts:
                break
            print(f"  rate limited, sleeping {wait:.0f}s", file=sys.stderr)
            time.sleep(wait)
            delay = min(delay * 2, 120)
            continue
        if 500 <= status < 600:
            if attempt == attempts:
                break
            print(f"  {status} from {url}, retrying in {delay:.0f}s", file=sys.stderr)
            time.sleep(delay)
            delay = min(delay * 2, 120)
            continue
        return status, parsed, raw
    return status, parsed, raw


def _retry_after_seconds(headers, fallback):
    value = headers.get("Retry-After") or headers.get("retry-after")
    if not value:
        return fallback
    try:
        return max(1.0, float(value))
    except ValueError:
        # Retry-After may be an HTTP date.
        try:
            from email.utils import parsedate_to_datetime

            when = parsedate_to_datetime(value)
            if when.tzinfo is None:
                when = when.replace(tzinfo=timezone.utc)
            return max(1.0, (when - datetime.now(timezone.utc)).total_seconds())
        except Exception:
            return fallback


# --------------------------------------------------------------------------- #
# oauth
# --------------------------------------------------------------------------- #


def _callback_bits(redirect_uri):
    parts = urllib.parse.urlparse(redirect_uri)
    if parts.scheme not in ("http", "https") or not parts.hostname:
        raise ConfigError(f"WHOOP_REDIRECT_URI is not a usable URL: {redirect_uri}")
    return parts.hostname, parts.port or (443 if parts.scheme == "https" else 80), parts.path or "/"


def login(args):
    config = oauth_config()
    host, port, path = _callback_bits(config["redirect_uri"])
    # Whoop rejects auth requests whose state is shorter than 8 characters.
    state = os.urandom(16).hex()

    auth_url = AUTH_URL + "?" + urllib.parse.urlencode(
        {
            "client_id": config["client_id"],
            "redirect_uri": config["redirect_uri"],
            "response_type": "code",
            "scope": " ".join(SCOPES),
            "state": state,
        }
    )

    captured = {}

    class Handler(http.server.BaseHTTPRequestHandler):
        def do_GET(self):
            parsed = urllib.parse.urlparse(self.path)
            if parsed.path != path:
                self.send_response(404)
                self.end_headers()
                return
            query = urllib.parse.parse_qs(parsed.query)
            captured["code"] = (query.get("code") or [None])[0]
            captured["state"] = (query.get("state") or [None])[0]
            captured["error"] = (query.get("error_description") or query.get("error") or [None])[0]
            message = "Whoop authorization captured. You can close this tab."
            if captured["error"] or not captured["code"]:
                message = f"Authorization failed: {captured['error'] or 'no code returned'}"
            self.send_response(200)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.end_headers()
            self.wfile.write(message.encode())

        def log_message(self, *_args):
            pass

    bind_host = "" if host in ("0.0.0.0", "") else host
    try:
        server = http.server.HTTPServer((bind_host, port), Handler)
    except OSError as exc:
        raise ConfigError(
            f"Cannot listen on {host}:{port} for the OAuth callback ({exc}). "
            "Free the port or change WHOOP_REDIRECT_URI (and the Whoop app setting)."
        )
    server.timeout = args.timeout

    print("Open this URL to authorize (a browser may open automatically):\n")
    print(auth_url + "\n")
    try:
        webbrowser.open(auth_url)
    except Exception:
        pass

    deadline = time.monotonic() + args.timeout
    while "code" not in captured and time.monotonic() < deadline:
        server.handle_request()
    server.server_close()

    if captured.get("error"):
        raise ConfigError(f"Whoop returned an error: {captured['error']}")
    if not captured.get("code"):
        raise ConfigError(f"No authorization code received within {args.timeout}s. Try again.")
    if captured.get("state") != state:
        raise ConfigError("State mismatch on the OAuth callback; aborting.")

    status, parsed, raw = request_with_retry(
        TOKEN_URL,
        method="POST",
        form={
            "grant_type": "authorization_code",
            "code": captured["code"],
            "client_id": config["client_id"],
            "client_secret": config["client_secret"],
            "redirect_uri": config["redirect_uri"],
        },
    )
    if status != 200 or not parsed:
        raise ConfigError(f"Token exchange failed ({status}): {raw[:400]}")

    path_out = token_file_path()
    save_tokens(path_out, _token_record(parsed))
    print(f"Saved tokens to {path_out}")
    if not parsed.get("refresh_token"):
        print(
            "WARNING: no refresh_token returned. The 'offline' scope was probably "
            "not granted, so --sync will not work unattended.",
            file=sys.stderr,
        )
    return 0


def _token_record(payload, previous=None):
    expires_in = int(payload.get("expires_in") or 3600)
    record = dict(previous or {})
    record.update(
        {
            "access_token": payload["access_token"],
            "expires_at": int(time.time()) + expires_in - 60,
            "scope": payload.get("scope", " ".join(SCOPES)),
            "obtained_at": datetime.now(timezone.utc).isoformat(),
        }
    )
    if payload.get("refresh_token"):
        record["refresh_token"] = payload["refresh_token"]
    return record


def refresh_access_token(config, path):
    """Exchange the stored refresh token, persisting the rotated one immediately.

    Whoop invalidates the presented refresh token the moment it answers. If the
    process dies between here and save_tokens the stored token is already dead
    and only --login can recover, hence the save happens before anything else.
    """
    tokens = load_tokens(path)
    refresh_token = tokens.get("refresh_token")
    if not refresh_token:
        raise ConfigError(f"Token file {path} has no refresh_token.\n{REAUTH_HINT}")

    status, parsed, raw = request_with_retry(
        TOKEN_URL,
        method="POST",
        form={
            "grant_type": "refresh_token",
            "refresh_token": refresh_token,
            "client_id": config["client_id"],
            "client_secret": config["client_secret"],
            # Whoop requires the offline scope to be re-requested or the new
            # response comes back without a refresh token.
            "scope": "offline",
        },
    )
    if status in (400, 401):
        raise ConfigError(
            f"Whoop rejected the stored refresh token ({status}): {raw[:300]}\n"
            "This usually means a previous refresh succeeded but its rotated token was "
            "never saved (crash, killed process, full disk), so the stored token is dead.\n"
            f"{REAUTH_HINT}"
        )
    if status != 200 or not parsed or "access_token" not in parsed:
        raise ConfigError(f"Refresh failed ({status}): {raw[:400]}")

    record = _token_record(parsed, previous=tokens)
    try:
        save_tokens(path, record)
    except OSError as exc:
        raise ConfigError(
            f"Refresh succeeded but writing {path} failed ({exc}). The old refresh token "
            f"is now dead; fix the disk/permissions and re-run --login.\n{REAUTH_HINT}"
        )
    return record["access_token"]


# --------------------------------------------------------------------------- #
# whoop data
# --------------------------------------------------------------------------- #


def paged_get(access_token, endpoint, start, end):
    """Yield every record from a paginated Whoop v2 collection endpoint."""
    next_token = None
    while True:
        params = {
            "start": _iso(start),
            "end": _iso(end),
            "limit": PAGE_LIMIT,
        }
        if next_token:
            params["nextToken"] = next_token
        url = f"{WHOOP_API}{endpoint}?" + urllib.parse.urlencode(params)
        status, parsed, raw = request_with_retry(
            url, headers={"Authorization": f"Bearer {access_token}"}
        )
        if status == 401:
            raise ConfigError(f"Whoop returned 401 for {endpoint}.\n{REAUTH_HINT}")
        if status != 200 or parsed is None:
            raise ConfigError(f"Whoop {endpoint} failed ({status}): {raw[:300]}")
        for record in parsed.get("records", []):
            yield record
        next_token = parsed.get("next_token")
        if not next_token:
            return


def get_one(access_token, endpoint):
    status, parsed, raw = request_with_retry(
        f"{WHOOP_API}{endpoint}", headers={"Authorization": f"Bearer {access_token}"}
    )
    if status == 401:
        raise ConfigError(f"Whoop returned 401 for {endpoint}.\n{REAUTH_HINT}")
    if status != 200 or parsed is None:
        raise ConfigError(f"Whoop {endpoint} failed ({status}): {raw[:300]}")
    return parsed


def _iso(moment):
    return moment.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")


def _measurement(metric, measured_at, value, unit, external_id):
    return {
        "metric": metric,
        "measured_at": measured_at,
        "value": round(float(value), 4),
        "unit": unit,
        "external_id": external_id,
    }


def normalize_recovery(records, sleep_starts=None):
    # Whoop's skin_temp_celsius is an absolute skin temperature, not a deviation
    # from baseline, so it is deliberately not mapped to body_temperature_delta.
    #
    # `created_at` is when Whoop finished scoring, which is the morning after.
    # But a recovery score describes the night that produced it -- the HRV and
    # resting heart rate in it were measured while you slept -- so it is filed
    # under the night's own start, the same day the sleep goes to. Without
    # this, one night's HRV lands on the following day and is compared against
    # the Apple Watch's reading for a different night entirely.
    starts = sleep_starts or {}
    out = []
    for record in records:
        if record.get("score_state") != "SCORED":
            continue
        score = record.get("score") or {}
        cycle_id = record.get("cycle_id")
        measured_at = starts.get(record.get("sleep_id")) or record.get("created_at")
        if not measured_at or cycle_id is None:
            continue
        base = f"whoop:recovery:{cycle_id}"
        fields = [
            ("recovery_score", score.get("recovery_score"), "percent"),
            ("hrv_ms", _hrv_ms(score.get("hrv_rmssd_milli")), "ms"),
            ("resting_hr", score.get("resting_heart_rate"), "bpm"),
            ("spo2", score.get("spo2_percentage"), "percent"),
        ]
        for metric, value, unit in fields:
            if value is None:
                continue
            out.append(_measurement(metric, measured_at, value, unit, f"{base}:{metric}"))
    return out


def _hrv_ms(raw):
    # Whoop v2 names the field `hrv_rmssd_milli` but returns milliseconds
    # already (e.g. 31.0), so it is passed through unscaled.
    return raw


def sleep_starts(records):
    """Sleep id to the moment that night began, for anything filed alongside it."""
    return {
        record["id"]: record["start"]
        for record in records
        if record.get("id") and record.get("start") and not record.get("nap")
    }


def normalize_sleep(records):
    out = []
    for record in records:
        if record.get("score_state") != "SCORED" or record.get("nap"):
            continue
        score = record.get("score") or {}
        stages = score.get("stage_summary") or {}
        sleep_id = record.get("id")
        # Anchor to `start`, never `end` -- the same rule `normalize_cycles`
        # follows, and for a sharper reason here. A night belongs to the day it
        # began on: that is what `sleep_sessions` records, what the phone mints
        # its session id from, and what every other day-keyed thing in this
        # system assumes. Whoop reports a night at the moment you woke, so
        # anchoring to `end` filed Tuesday night under Wednesday -- which put
        # two different nights on the same day next to the Apple Watch's, and
        # let precedence pick between readings that were never comparable.
        measured_at = record.get("start")
        if not sleep_id or not measured_at:
            continue
        base = f"whoop:sleep:{sleep_id}"

        light = stages.get("total_light_sleep_time_milli")
        deep = stages.get("total_slow_wave_sleep_time_milli")
        rem = stages.get("total_rem_sleep_time_milli")
        asleep = [part for part in (light, deep, rem) if part is not None]

        fields = []
        if asleep:
            fields.append(("sleep_minutes", _milli_to_minutes(sum(asleep)), "min"))
        if deep is not None:
            fields.append(("deep_sleep_minutes", _milli_to_minutes(deep), "min"))
        if rem is not None:
            fields.append(("rem_sleep_minutes", _milli_to_minutes(rem), "min"))
        if score.get("sleep_efficiency_percentage") is not None:
            fields.append(
                ("sleep_efficiency", score["sleep_efficiency_percentage"], "percent")
            )
        if score.get("respiratory_rate") is not None:
            fields.append(("respiratory_rate", score["respiratory_rate"], "breaths_per_min"))

        for metric, value, unit in fields:
            out.append(_measurement(metric, measured_at, value, unit, f"{base}:{metric}"))
    return out


def _milli_to_minutes(milliseconds):
    return milliseconds / 60000.0


def normalize_cycles(records):
    out = []
    for record in records:
        if record.get("score_state") != "SCORED":
            continue
        score = record.get("score") or {}
        cycle_id = record.get("id")
        # Anchor to `start`, never `end`. Whoop cycles are contiguous, so one
        # cycle's end is exactly the next one's start -- and the in-progress
        # cycle has a null end that falls back to its own start. Using `end`
        # therefore gives two adjacent cycles the same instant, and since the
        # server dedupes on (source, metric, measured_at) the older strain is
        # silently overwritten. Strain accumulates across the cycle, so the
        # start of the period it describes is the honest anchor anyway.
        measured_at = record.get("start")
        if cycle_id is None or measured_at is None or score.get("strain") is None:
            continue
        out.append(
            _measurement(
                "strain",
                measured_at,
                score["strain"],
                "score",
                f"whoop:cycle:{cycle_id}:strain",
            )
        )
    return out


def normalize_workouts(records):
    out = []
    for record in records:
        if record.get("score_state") != "SCORED":
            continue
        score = record.get("score") or {}
        workout_id = record.get("id")
        started_at = record.get("start")
        ended_at = record.get("end")
        if not workout_id or not started_at or not ended_at:
            continue
        out.append({
            "external_id": str(workout_id),
            "sport_name": record.get("sport_name") or "Activity",
            "started_at": started_at,
            "ended_at": ended_at,
            "timezone_offset": record.get("timezone_offset"),
            "score_state": record.get("score_state"),
            "strain": score.get("strain"),
            "average_heart_rate": score.get("average_heart_rate"),
            "max_heart_rate": score.get("max_heart_rate"),
            "kilojoule": score.get("kilojoule"),
            "percent_recorded": score.get("percent_recorded"),
            "distance_meter": score.get("distance_meter"),
            "altitude_gain_meter": score.get("altitude_gain_meter"),
            "altitude_change_meter": score.get("altitude_change_meter"),
            "zone_durations": score.get("zone_durations") or {},
        })
    return out


def normalize_body_measurements(record, measured_at):
    fields = [
        ("weight_kg", record.get("weight_kilogram"), "kg"),
        ("height_m", record.get("height_meter"), "m"),
        ("max_hr", record.get("max_heart_rate"), "bpm"),
    ]
    return [
        _measurement(metric, measured_at, value, unit, f"whoop:body:{metric}")
        for metric, value, unit in fields
        if value is not None
    ]


# --------------------------------------------------------------------------- #
# ignis-api ingest
# --------------------------------------------------------------------------- #


def ignis_target():
    base = (os.environ.get("IGNIS_API_BASE") or "https://api.ignis.farm").rstrip("/")
    token = require_env("IGNIS_API_TOKEN", "Create one with ignis-api/new-token.sh whoop.")
    return base, {"Authorization": f"Bearer {token}"}


def post_measurements(measurements, dry_run):
    if not measurements:
        print("Nothing to send.")
        return 0

    if dry_run:
        for chunk in _chunks(measurements, MAX_BATCH):
            print(json.dumps({"source": "whoop", "measurements": chunk}, indent=2))
        print(f"\n[dry-run] {len(measurements)} measurement(s) not sent.", file=sys.stderr)
        return 0

    api_base, headers = ignis_target()
    url = f"{api_base}/v1/health/measurements"

    sent = 0
    for chunk in _chunks(measurements, MAX_BATCH):
        status, _parsed, raw = request_with_retry(
            url, method="POST", headers=headers, body={"source": "whoop", "measurements": chunk}
        )
        if status >= 400:
            raise ConfigError(f"Ingest failed ({status}) after {sent} sent: {raw[:400]}")
        sent += len(chunk)
        print(f"Posted {len(chunk)} measurement(s) ({sent}/{len(measurements)}).")
    return 0


def post_workouts(workouts, dry_run):
    if not workouts:
        print("No scored workouts found.")
        return 0
    if dry_run:
        print(json.dumps({"source": "whoop", "workouts": workouts}, indent=2))
        print(f"\n[dry-run] {len(workouts)} workout(s) not sent.", file=sys.stderr)
        return 0

    api_base, headers = ignis_target()
    status, _parsed, raw = request_with_retry(
        f"{api_base}/v1/health/workouts",
        method="POST",
        headers=headers,
        body={"source": "whoop", "workouts": workouts},
    )
    if status >= 400:
        raise ConfigError(f"Workout ingest failed ({status}): {raw[:400]}")
    print(f"Posted {len(workouts)} workout(s).")
    return 0


def _chunks(items, size):
    for index in range(0, len(items), size):
        yield items[index : index + size]


# --------------------------------------------------------------------------- #
# sync
# --------------------------------------------------------------------------- #


def sync(args):
    config = oauth_config()
    path = token_file_path()
    access_token = refresh_access_token(config, path)

    end = datetime.now(timezone.utc)
    start = end - timedelta(days=args.days)
    print(f"Pulling Whoop data from {_iso(start)} to {_iso(end)}")

    measurements = []
    # Read the nights first: recovery is scored in the morning but describes
    # the night before, and the only thing that knows when that night began is
    # the sleep record it points at.
    sleeps = list(paged_get(access_token, "/developer/v2/activity/sleep", start, end))
    starts = sleep_starts(sleeps)
    measurements += normalize_recovery(
        paged_get(access_token, "/developer/v2/recovery", start, end), starts
    )
    measurements += normalize_sleep(sleeps)
    measurements += normalize_cycles(paged_get(access_token, "/developer/v2/cycle", start, end))
    # Height and weight, and never worth losing a night's sleep over.
    #
    # This is one call for three numbers that change about twice a year, and it
    # is the last thing the sync reads -- so when it failed with a 401, it took
    # every night, recovery and cycle already fetched down with it and nothing
    # at all was posted. Hours of the feed went missing because a body
    # measurement was unavailable. It is now allowed to fail on its own.
    body_stamp = end.replace(hour=12, minute=0, second=0, microsecond=0).isoformat()
    try:
        measurements += normalize_body_measurements(
            get_one(access_token, "/developer/v2/user/measurement/body"), body_stamp
        )
    except ConfigError as error:
        print(f"Skipping body measurements: {error}")
    # Same rule for workouts: they are a separate collection with a separate
    # scope, and Whoop can refuse one scope while still serving the rest. A
    # walk that cannot be read is not a reason to throw away the night.
    try:
        workouts = normalize_workouts(
            paged_get(access_token, "/developer/v2/activity/workout", start, end)
        )
    except ConfigError as error:
        print(f"Skipping workouts: {error}")
        workouts = []

    print(f"Normalized {len(measurements)} measurement(s).")
    print(f"Normalized {len(workouts)} workout(s).")
    post_measurements(measurements, args.dry_run)
    return post_workouts(workouts, args.dry_run)


def main(argv=None):
    parser = argparse.ArgumentParser(
        description="Sync Whoop recovery, sleep, cycle and workout data into ignis-api."
    )
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--login", action="store_true", help="one-time browser OAuth flow")
    mode.add_argument("--sync", action="store_true", help="refresh tokens, pull and post data")
    parser.add_argument("--days", type=int, default=2, help="lookback window in days (default: 2)")
    parser.add_argument(
        "--dry-run", action="store_true", help="print the normalized payload instead of POSTing"
    )
    parser.add_argument(
        "--timeout", type=int, default=300, help="--login callback wait, seconds (default: 300)"
    )
    args = parser.parse_args(argv)

    if args.days < 1:
        parser.error("--days must be at least 1")

    try:
        return login(args) if args.login else sync(args)
    except ConfigError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    except (urllib.error.URLError, socket.timeout) as exc:
        print(f"error: network failure talking to Whoop or ignis-api: {exc}", file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        return 130


if __name__ == "__main__":
    sys.exit(main())
