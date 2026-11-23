import os
import re
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from typing import Iterator, Optional

DB_PATH = os.environ.get("IGNIS_API_DB", "/data/ignis.db")

# Fixed-width UTC timestamps, so sorting the strings sorts by time.
TIME_FORMAT = "%Y-%m-%dT%H:%M:%S.%fZ"


def now_utc() -> str:
    return datetime.now(timezone.utc).strftime(TIME_FORMAT)


def to_utc(moment: datetime) -> str:
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=timezone.utc)
    return moment.astimezone(timezone.utc).strftime(TIME_FORMAT)


@contextmanager
def connect() -> Iterator[sqlite3.Connection]:
    conn = sqlite3.connect(DB_PATH, timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys=ON")
    try:
        with conn:
            yield conn
    finally:
        conn.close()


def init() -> None:
    with connect() as conn:
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute(
            """CREATE TABLE IF NOT EXISTS scans (
                   id TEXT PRIMARY KEY,
                   text TEXT NOT NULL,
                   device TEXT NOT NULL,
                   created_at TEXT NOT NULL
               )"""
        )
        conn.execute("CREATE INDEX IF NOT EXISTS scans_created_at ON scans (created_at)")

        conn.execute(
            """CREATE TABLE IF NOT EXISTS entries (
                   id TEXT PRIMARY KEY,
                   text TEXT NOT NULL,
                   source TEXT NOT NULL,
                   created_at TEXT NOT NULL,
                   edited_at TEXT
               )"""
        )
        conn.execute("CREATE INDEX IF NOT EXISTS entries_created_at ON entries (created_at, id)")
        conn.execute(
            """CREATE TABLE IF NOT EXISTS entry_tags (
                   entry_id TEXT NOT NULL REFERENCES entries (id) ON DELETE CASCADE,
                   tag TEXT NOT NULL,
                   PRIMARY KEY (entry_id, tag)
               )"""
        )
        conn.execute("CREATE INDEX IF NOT EXISTS entry_tags_tag ON entry_tags (tag)")

        # Wearable readings (Whoop today). One row per reading; a re-scored reading
        # arrives with the same external_id and replaces the old one.
        conn.execute(
            """CREATE TABLE IF NOT EXISTS health_measurements (
                   source TEXT NOT NULL,
                   external_id TEXT NOT NULL,
                   metric TEXT NOT NULL,
                   measured_at TEXT NOT NULL,
                   value REAL NOT NULL,
                   unit TEXT NOT NULL DEFAULT '',
                   received_at TEXT NOT NULL,
                   PRIMARY KEY (source, external_id)
               )"""
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS health_measurements_metric ON health_measurements (metric, measured_at)"
        )
        conn.execute(
            """CREATE TABLE IF NOT EXISTS health_workouts (
                   source TEXT NOT NULL,
                   external_id TEXT NOT NULL,
                   sport_name TEXT NOT NULL,
                   started_at TEXT NOT NULL,
                   ended_at TEXT NOT NULL,
                   timezone_offset TEXT,
                   strain REAL,
                   average_heart_rate REAL,
                   max_heart_rate REAL,
                   kilojoule REAL,
                   percent_recorded REAL,
                   distance_meter REAL,
                   altitude_gain_meter REAL,
                   altitude_change_meter REAL,
                   zone_durations TEXT NOT NULL DEFAULT '{}',
                   received_at TEXT NOT NULL,
                   PRIMARY KEY (source, external_id)
               )"""
        )
        conn.execute("CREATE INDEX IF NOT EXISTS health_workouts_started ON health_workouts (started_at)")

        # Medications: the dose log, when it kicked in / peaked / wore off, check-ins, schedules and the model
        # parameters behind the estimated-level curve. Migrated from the old raira stack (legacy_id keeps the old key).
        conn.execute(
            """CREATE TABLE IF NOT EXISTS med_doses (
                   id TEXT PRIMARY KEY,
                   med TEXT NOT NULL,
                   taken_at TEXT NOT NULL,
                   dose_mg REAL NOT NULL,
                   food_state TEXT,
                   formulation TEXT,
                   notes TEXT,
                   source TEXT NOT NULL DEFAULT 'web',
                   created_at TEXT NOT NULL,
                   legacy_id INTEGER
               )"""
        )
        conn.execute("CREATE INDEX IF NOT EXISTS med_doses_taken ON med_doses (med, taken_at)")
        conn.execute(
            """CREATE TABLE IF NOT EXISTS med_events (
                   id TEXT PRIMARY KEY,
                   dose_id TEXT NOT NULL REFERENCES med_doses (id) ON DELETE CASCADE,
                   med TEXT NOT NULL,
                   event_type TEXT NOT NULL,
                   occurred_at TEXT NOT NULL,
                   notes TEXT,
                   source TEXT NOT NULL DEFAULT 'web',
                   created_at TEXT NOT NULL,
                   legacy_id INTEGER
               )"""
        )
        conn.execute("CREATE INDEX IF NOT EXISTS med_events_dose ON med_events (dose_id)")
        conn.execute(
            """CREATE TABLE IF NOT EXISTS med_checkins (
                   id TEXT PRIMARY KEY,
                   dose_id TEXT NOT NULL REFERENCES med_doses (id) ON DELETE CASCADE,
                   reported_at TEXT NOT NULL,
                   task_initiation INTEGER,
                   motivation INTEGER,
                   focus INTEGER,
                   task_switching INTEGER,
                   was_enough TEXT,
                   note TEXT,
                   source TEXT NOT NULL DEFAULT 'web',
                   legacy_id INTEGER
               )"""
        )
        conn.execute("CREATE INDEX IF NOT EXISTS med_checkins_dose ON med_checkins (dose_id)")
        conn.execute(
            """CREATE TABLE IF NOT EXISTS med_observations (
                   id TEXT PRIMARY KEY,
                   med TEXT NOT NULL,
                   recorded_at TEXT NOT NULL,
                   data TEXT NOT NULL DEFAULT '{}',
                   notes TEXT,
                   source TEXT NOT NULL DEFAULT 'web',
                   legacy_id INTEGER
               )"""
        )
        conn.execute(
            """CREATE TABLE IF NOT EXISTS med_schedules (
                   id TEXT PRIMARY KEY,
                   med TEXT NOT NULL,
                   name TEXT NOT NULL,
                   dose_mg REAL,
                   times TEXT NOT NULL DEFAULT '[]',
                   frequency TEXT,
                   active INTEGER NOT NULL DEFAULT 1,
                   created_at TEXT NOT NULL,
                   legacy_id INTEGER
               )"""
        )
        conn.execute(
            """CREATE TABLE IF NOT EXISTS med_occurrences (
                   id TEXT PRIMARY KEY,
                   schedule_id TEXT NOT NULL REFERENCES med_schedules (id) ON DELETE CASCADE,
                   day TEXT NOT NULL,
                   scheduled_for TEXT,
                   status TEXT NOT NULL,
                   taken_at TEXT,
                   dose_id TEXT,
                   source TEXT,
                   legacy_id INTEGER
               )"""
        )
        conn.execute(
            """CREATE TABLE IF NOT EXISTS med_profiles (
                   id TEXT PRIMARY KEY,
                   med TEXT NOT NULL,
                   profile_name TEXT NOT NULL,
                   source TEXT NOT NULL,
                   scenario TEXT NOT NULL,
                   half_life REAL,
                   peak_time REAL,
                   absorption_rate REAL,
                   elimination_rate REAL,
                   scale_factor REAL,
                   lag_time REAL,
                   compartment TEXT,
                   notes TEXT,
                   parameter_source TEXT,
                   valid_until TEXT,
                   legacy_id INTEGER
               )"""
        )


def add_scan(text: str, device: str, created_at: str) -> dict:
    scan = {"id": uuid.uuid4().hex, "text": text, "device": device, "created_at": created_at}
    with connect() as conn:
        conn.execute(
            "INSERT INTO scans (id, text, device, created_at) VALUES (:id, :text, :device, :created_at)",
            scan,
        )
    return scan


def get_scan(scan_id: str) -> Optional[dict]:
    with connect() as conn:
        row = conn.execute("SELECT * FROM scans WHERE id = ?", (scan_id,)).fetchone()
    return dict(row) if row else None


def list_scans(limit: int, before: Optional[str], query: Optional[str]) -> list[dict]:
    where, params = [], []
    if before:
        where.append("created_at < ?")
        params.append(before)
    if query:
        escaped = query.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        where.append("text LIKE ? ESCAPE '\\'")
        params.append(f"%{escaped}%")
    sql = "SELECT * FROM scans"
    if where:
        sql += " WHERE " + " AND ".join(where)
    sql += " ORDER BY created_at DESC LIMIT ?"
    params.append(limit)
    with connect() as conn:
        return [dict(row) for row in conn.execute(sql, params).fetchall()]


def delete_scan(scan_id: str) -> bool:
    with connect() as conn:
        return conn.execute("DELETE FROM scans WHERE id = ?", (scan_id,)).rowcount > 0


# ---- diary entries ----

# #tag, not preceded by a word character (so "a#b" and URLs with fragments are ignored).
TAG_RE = re.compile(r"(?<!\w)#(\w{1,40})")


def tags_in(text: str) -> list[str]:
    found: list[str] = []
    for match in TAG_RE.finditer(text):
        tag = match.group(1).lower()
        if not tag.isdigit() and tag not in found:
            found.append(tag)
    return found


def _set_tags(conn: sqlite3.Connection, entry_id: str, text: str) -> None:
    conn.execute("DELETE FROM entry_tags WHERE entry_id = ?", (entry_id,))
    conn.executemany(
        "INSERT INTO entry_tags (entry_id, tag) VALUES (?, ?)",
        [(entry_id, tag) for tag in tags_in(text)],
    )


def add_entry(text: str, source: str, created_at: str) -> dict:
    entry = {"id": uuid.uuid4().hex, "text": text, "source": source, "created_at": created_at, "edited_at": None}
    with connect() as conn:
        conn.execute(
            "INSERT INTO entries (id, text, source, created_at, edited_at) "
            "VALUES (:id, :text, :source, :created_at, :edited_at)",
            entry,
        )
        _set_tags(conn, entry["id"], text)
    return entry


def get_entry(entry_id: str) -> Optional[dict]:
    with connect() as conn:
        row = conn.execute("SELECT * FROM entries WHERE id = ?", (entry_id,)).fetchone()
    return dict(row) if row else None


def update_entry(entry_id: str, text: str) -> Optional[dict]:
    with connect() as conn:
        changed = conn.execute(
            "UPDATE entries SET text = ?, edited_at = ? WHERE id = ?", (text, now_utc(), entry_id)
        ).rowcount
        if not changed:
            return None
        _set_tags(conn, entry_id, text)
        row = conn.execute("SELECT * FROM entries WHERE id = ?", (entry_id,)).fetchone()
    return dict(row)


def delete_entry(entry_id: str) -> bool:
    with connect() as conn:
        return conn.execute("DELETE FROM entries WHERE id = ?", (entry_id,)).rowcount > 0


def list_entries(
    limit: int,
    cursor: Optional[tuple[str, str]],
    query: Optional[str],
    tag: Optional[str],
    start: Optional[str],
    end: Optional[str],
) -> list[dict]:
    sql = "SELECT e.* FROM entries e"
    params: list = []
    if tag:
        sql += " JOIN entry_tags t ON t.entry_id = e.id AND t.tag = ?"
        params.append(tag.lower())
    where: list[str] = []
    if cursor:
        ts, entry_id = cursor
        where.append("(e.created_at < ? OR (e.created_at = ? AND e.id < ?))")
        params += [ts, ts, entry_id]
    if start:
        where.append("e.created_at >= ?")
        params.append(start)
    if end:
        where.append("e.created_at < ?")
        params.append(end)
    if query:
        escaped = query.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        where.append("e.text LIKE ? ESCAPE '\\'")
        params.append(f"%{escaped}%")
    if where:
        sql += " WHERE " + " AND ".join(where)
    sql += " ORDER BY e.created_at DESC, e.id DESC LIMIT ?"
    params.append(limit)
    with connect() as conn:
        return [dict(row) for row in conn.execute(sql, params).fetchall()]


def entry_times() -> list[str]:
    with connect() as conn:
        return [row[0] for row in conn.execute("SELECT created_at FROM entries").fetchall()]


def tag_counts(limit: int) -> list[dict]:
    with connect() as conn:
        rows = conn.execute(
            "SELECT tag, COUNT(*) AS count FROM entry_tags GROUP BY tag ORDER BY count DESC, tag ASC LIMIT ?",
            (limit,),
        ).fetchall()
    return [dict(row) for row in rows]


# ---- health (wearables) ----

OVERVIEW_METRICS = (
    "recovery_score", "hrv_ms", "resting_hr", "spo2", "respiratory_rate",
    "sleep_minutes", "deep_sleep_minutes", "rem_sleep_minutes", "sleep_efficiency",
    "strain", "weight_kg", "steps", "active_calories", "vo2max", "exercise_minutes",
    "body_battery", "body_battery_high", "body_battery_low", "body_battery_charged", "body_battery_drained",
    "stress_avg", "training_readiness", "sleep_score",
)

# Where two sources measure the same thing, the lower number wins (Whoop's strap is the
# dedicated sleep/recovery sensor; the Apple Watch fills in what Whoop does not report; Garmin
# comes last where it overlaps, and is the only source for Body Battery, stress and readiness).
SOURCE_RANK = {"whoop": 1, "apple_watch": 2, "garmin": 3}
# A better-ranked source only wins while its newest reading is this recent next to the other's.
SOURCE_FRESH = "-7 days"

WORKOUT_FIELDS = (
    "sport_name", "started_at", "ended_at", "timezone_offset", "strain", "average_heart_rate",
    "max_heart_rate", "kilojoule", "percent_recorded", "distance_meter", "altitude_gain_meter",
    "altitude_change_meter",
)


def upsert_measurements(source: str, rows: list[dict]) -> int:
    received = now_utc()
    with connect() as conn:
        conn.executemany(
            "INSERT INTO health_measurements (source, external_id, metric, measured_at, value, unit, received_at) "
            "VALUES (:source, :external_id, :metric, :measured_at, :value, :unit, :received_at) "
            "ON CONFLICT (source, external_id) DO UPDATE SET metric = excluded.metric, "
            "measured_at = excluded.measured_at, value = excluded.value, unit = excluded.unit, "
            "received_at = excluded.received_at",
            [{**row, "source": source, "received_at": received} for row in rows],
        )
    return len(rows)


def upsert_workouts(source: str, rows: list[dict]) -> int:
    received = now_utc()
    columns = ("source", "external_id") + WORKOUT_FIELDS + ("zone_durations", "received_at")
    updates = ", ".join(f"{c} = excluded.{c}" for c in columns[2:])
    sql = (
        f"INSERT INTO health_workouts ({', '.join(columns)}) VALUES ({', '.join(':' + c for c in columns)}) "
        f"ON CONFLICT (source, external_id) DO UPDATE SET {updates}"
    )
    with connect() as conn:
        conn.executemany(sql, [{**row, "source": source, "received_at": received} for row in rows])
    return len(rows)


def _rank(source: str) -> int:
    return SOURCE_RANK.get(source, 99)


def health_overview(since: str) -> dict:
    """Newest reading and the readings since `since` (oldest first) for each overview metric.

    One source per metric: the best-ranked one whose newest reading is within a week of the
    freshest source's, so a stalled Whoop sync does not hide a working Apple Watch.
    """
    marks = ",".join("?" * len(OVERVIEW_METRICS))
    with connect() as conn:
        newest = conn.execute(
            f"SELECT m.metric, m.source, m.value, m.unit, m.measured_at FROM health_measurements m "
            f"JOIN (SELECT metric, source, MAX(measured_at) AS at FROM health_measurements "
            f"      WHERE metric IN ({marks}) GROUP BY metric, source) x "
            f"ON x.metric = m.metric AND x.source = m.source AND x.at = m.measured_at",
            OVERVIEW_METRICS,
        ).fetchall()
        series_rows = conn.execute(
            f"SELECT metric, source, measured_at, value FROM health_measurements "
            f"WHERE metric IN ({marks}) AND measured_at >= ? ORDER BY measured_at ASC",
            (*OVERVIEW_METRICS, since),
        ).fetchall()
        updated = conn.execute("SELECT MAX(received_at) FROM health_measurements").fetchone()[0]

    by_metric: dict[str, dict[str, dict]] = {}
    for row in newest:
        by_metric.setdefault(row["metric"], {})[row["source"]] = dict(row)

    latest: dict[str, dict] = {}
    for metric, sources in by_metric.items():
        freshest = max(r["measured_at"] for r in sources.values())
        cutoff = (datetime.strptime(freshest, TIME_FORMAT) - timedelta(days=7)).strftime(TIME_FORMAT)
        candidates = [s for s, r in sources.items() if r["measured_at"] >= cutoff]
        source = min(candidates, key=_rank)
        latest[metric] = sources[source]

    # The charts merge the sources day by day: for each day, the best-ranked source that has a reading wins. So a
    # source that stopped syncing (or was only worn for a day or two) never hides older history from another one.
    best: dict[tuple, tuple] = {}
    for row in series_rows:
        slot = (row["metric"], row["measured_at"][:10])
        candidate = (_rank(row["source"]), row["measured_at"], row["value"])
        if slot not in best or candidate[0] < best[slot][0]:
            best[slot] = candidate
    series: dict[str, list] = {metric: [] for metric in OVERVIEW_METRICS}
    for (metric, _day), (_rank_, stamp, value) in sorted(best.items(), key=lambda kv: kv[1][1]):
        series[metric].append([stamp, value])
    return {"latest": latest, "series": series, "updated_at": updated}


def _overlaps(a: dict, b: dict) -> bool:
    """True when workout `a` mostly happened during workout `b`."""
    start = max(a["started_at"], b["started_at"])
    end = min(a["ended_at"], b["ended_at"])
    if end <= start:
        return False
    fmt = lambda s: datetime.strptime(s, TIME_FORMAT)
    shared = (fmt(end) - fmt(start)).total_seconds()
    own = max(1.0, (fmt(a["ended_at"]) - fmt(a["started_at"])).total_seconds())
    return shared / own >= 0.5


def list_workouts(limit: int) -> list[dict]:
    """Newest first. A workout recorded by two sources shows once, the better-ranked one."""
    import json

    with connect() as conn:
        rows = conn.execute(
            "SELECT * FROM health_workouts ORDER BY started_at DESC LIMIT ?", (limit * 3,)
        ).fetchall()
    items = [dict(row) for row in rows]
    kept: list[dict] = []
    for item in items:
        if any(_rank(other["source"]) < _rank(item["source"]) and _overlaps(item, other) for other in items if other is not item):
            continue
        kept.append(item)
    out = []
    for item in kept[:limit]:
        item.pop("received_at", None)
        try:
            item["zone_durations"] = json.loads(item["zone_durations"])
        except ValueError:
            item["zone_durations"] = {}
        out.append(item)
    return out
