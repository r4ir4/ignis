"""Medications: a dose log, when each dose kicked in / peaked / wore off, check-ins, and an estimated-level curve.

The curve is a one-compartment Bateman model (ported from the old raira stack): every dose keeps its own absorption-then-
elimination curve and they add. It is a *modelled* quantity from dose and elapsed time, not a blood level; the page says so.
"""
import json
import logging
import math
import statistics
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from . import db

CONFIG = {
    "vyvanse": {
        "slug": "vyvanse",
        "name": "Venvanse",
        "active_ingredient": "lisdexamfetamine → dextroamphetamine",
        "route": "oral",
        "presets": [20, 30, 50, 70],
        "tracks_events": True,
        "window_hours": [18, 14],
        "step_minutes": 10,
        "reference_dose_mg": 30,
        "reference_cmax": 118,
        "reference_cmax_dose_mg": 70,
        "concentration_unit": "ng/mL",
        # The personal profile is fitted on every dose's logged times whatever the food, so food adds no extra delay on top of it.
        "food_lag_hours": {"fasted": 0.0, "fed": 0.0, "high_fat": 0.0},
        "limitations": (
            "Until you have enough logged times this uses population estimates from trial cohorts, scaled to a published Cmax "
            "of 118 ng/mL at 70 mg. Once you have logged enough onset, strongest and wearing-off times it uses a curve fitted to "
            "your own: the rise starts when you report it kicking in, peaks when it feels strongest and fades when it wears off, "
            "so it follows how the medicine feels for you rather than a blood level. No blood levels are measured here. "
            "Educational approximation, not a dosing tool."
        ),
    },
    "ritalina": {
        "slug": "ritalina",
        "name": "Ritalina",
        "active_ingredient": "methylphenidate",
        "route": "oral",
        "presets": [10],
        "reference_dose_mg": 10,
        "reference_cmax": 6.0,
        "concentration_unit": "ng/mL",
        "decimals": 1,
        "tracks_events": True,
        "compact": True,
        "timeline_minutes": 360,
        "daily_doses": True,
        "window_hours": [12, 12],
        "step_minutes": 10,
        "lookback_days": 2,
        "model": {"name": "methylphenidate IR (population)", "ka": 1.2, "ke": 0.28, "lag": 0.25},
        "limitations": (
            "A generic one-compartment estimate for immediate-release methylphenidate (peak around 1.5 hours, half-life "
            "about 2.5 hours), scaled so a 10 mg dose peaks near 6 ng/mL. Real levels vary a lot between people and with "
            "food. Nothing is measured here. Educational approximation, not a dosing tool."
        ),
    },
    "lithium": {
        "slug": "lithium",
        "name": "Lithium",
        "active_ingredient": "lithium carbonate",
        "route": "oral",
        "presets": [300, 600, 900],
        "reference_dose_mg": 300,
        "reference_cmax": 0.2,
        "concentration_unit": "mmol/L",
        "decimals": 2,
        "window_hours": [72, 24],
        "step_minutes": 30,
        "lookback_days": 10,
        "model": {"name": "lithium carbonate IR (population)", "ka": 2.0, "ke": 0.035, "lag": 0.25},
        "limitations": (
            "A generic one-compartment estimate for immediate-release lithium (peak around 2 hours, half-life about 20 "
            "hours, so doses build up over several days). A single 300 mg dose is scaled to peak near 0.2 mmol/L. "
            "Kidney function, hydration and salt intake change real levels a lot, and only a blood test measures them. "
            "Educational approximation, never a basis for changing a dose."
        ),
    },
    "mounjaro": {
        "slug": "mounjaro",
        "name": "Mounjaro",
        "active_ingredient": "tirzepatide",
        "route": "weekly injection",
        "presets": [2.5, 5, 7.5, 10, 12.5, 15],
        "interval_days": 7,
        "compact": True,
        "reference_dose_mg": 5,
        "reference_cmax": 5,
        "concentration_unit": "mg",
        "decimals": 2,
        "window_hours": [504, 168],
        "step_minutes": 60,
        "lookback_days": 35,
        # Tirzepatide (label): median peak about 24 h after an injection (range 8-72 h), half-life about 5 days. ka 0.14/h puts the
        # peak at ~24 h. scale 1.0 keeps the curve in plain milligrams (a slow ka would otherwise be rescaled up to the reference).
        "model": {"name": "tirzepatide, peak at ~24 h, 5-day half-life", "ka": 0.14, "ke": 0.005776, "lag": 0.0, "scale": 1.0},
        "limitations": (
            "A simple estimate: after each injection the medicine is absorbed over about a day (it peaks around 24 hours) and then "
            "fades with a half-life of about five days, and the amounts left from your recent doses add up. It shows the "
            "milligrams still expected in your body, not a blood test, and real levels vary between people."
        ),
    },
    "roacutan": {
        "slug": "roacutan",
        "name": "Roacutan",
        "active_ingredient": "isotretinoin",
        "route": "oral",
        "presets": [10, 20, 40],
        "compact": True,
        "reference_dose_mg": 20,
        "reference_cmax": 20,
        "concentration_unit": "mg",
        "decimals": 1,
        "window_hours": [72, 24],
        "step_minutes": 30,
        "lookback_days": 12,
        "model": {"name": "isotretinoin + active metabolite, ~1-day half-life", "ka": 0.9, "ke": 0.02888, "lag": 0.0, "scale": 1.0},
        "limitations": (
            "A simple estimate for isotretinoin and its active metabolite: each capsule is absorbed over a few hours (peak "
            "around 3 to 5 hours) and then fades with a half-life of about a day, so daily doses build up over about a week. "
            "It shows the milligrams expected in your body from your doses. Taking it with a fatty meal absorbs more, which "
            "this estimate does not model, and it is not a blood test."
        ),
    },
}

EVENT_TYPES = ("onset", "strongest", "wearing_off")
FOOD_STATES = ("fasted", "fed", "high_fat")
FORMULATIONS = ("capsule", "chewable")

# Food does not change how much arrives, only when: about an hour later. The chewable tablet also loses ~6% fed.
FOOD_LAG_HOURS = {"fasted": 0.0, "fed": 1.0, "high_fat": 1.0}
CHEWABLE_FED_AMPLITUDE = 0.94

# Used only if the profiles table is empty: d-amphetamine (central) from the old model.
FALLBACK_PROFILE = {
    "profile_name": "d-amphetamine (central)", "source": "population", "scenario": "central",
    "absorption_rate": 0.78, "elimination_rate": 0.088, "scale_factor": 2.2247926, "lag_time": 1.5,
}


def new_id() -> str:
    return uuid.uuid4().hex


def config(slug: str) -> Optional[dict]:
    return CONFIG.get(slug)


def _parse(stamp: str) -> datetime:
    return datetime.strptime(stamp, db.TIME_FORMAT).replace(tzinfo=timezone.utc)


def _parse_any(stamp: str) -> datetime:
    """Like _parse, but also accepts stamps without fractional seconds (older imported rows)."""
    for fmt in (db.TIME_FORMAT, "%Y-%m-%dT%H:%M:%SZ"):
        try:
            return datetime.strptime(stamp, fmt).replace(tzinfo=timezone.utc)
        except ValueError:
            pass
    raise ValueError("bad timestamp " + stamp)


def _iso(moment: datetime) -> str:
    return moment.astimezone(timezone.utc).strftime(db.TIME_FORMAT)


# ---- the model ----------------------------------------------------------------------------------------------------


def active_profile(slug: str) -> dict:
    """personal, then adjusted, then population: the central profile of the first source that has one."""
    with db.connect() as conn:
        rows = conn.execute(
            "SELECT * FROM med_profiles WHERE med = ? AND valid_until IS NULL AND compartment = 'metabolite'", (slug,)
        ).fetchall()
    for source in ("personal", "adjusted", "population"):
        for row in rows:
            if row["source"] == source and row["scenario"] == "central":
                return dict(row)
    return dict(FALLBACK_PROFILE)


def _exposure(hours: float, mg: float, ka: float, ke: float, scale: float, lag: float) -> float:
    shifted = hours - lag
    if shifted <= 0:
        return 0.0
    return mg * scale * (ka / (ka - ke)) * (math.exp(-ke * shifted) - math.exp(-ka * shifted))


def _profile_for(slug: str) -> dict:
    """The kinetic parameters for a medication: a fixed population model when the config has one, else the stored profiles."""
    cfg = CONFIG[slug]
    model = cfg.get("model")
    if not model:
        return active_profile(slug)
    ka, ke = model["ka"], model["ke"]
    t_max = math.log(ka / ke) / (ka - ke)
    unit_peak = cfg["reference_dose_mg"] * (ka / (ka - ke)) * (math.exp(-ke * t_max) - math.exp(-ka * t_max))
    # "scale" fixed at 1 means the curve is plain milligrams in the body; otherwise scale so one reference dose peaks at reference_cmax
    scale = model["scale"] if model.get("scale") is not None else cfg["reference_cmax"] / unit_peak
    return {
        "profile_name": model["name"], "absorption_rate": ka, "elimination_rate": ke,
        "scale_factor": scale, "lag_time": model["lag"],
    }


def _reference_peak(cfg: dict, profile: dict) -> float:
    ka, ke, scale = profile["absorption_rate"], profile["elimination_rate"], profile["scale_factor"]
    t_max = math.log(ka / ke) / (ka - ke)
    return _exposure(t_max, cfg["reference_dose_mg"], ka, ke, scale, 0.0) or 1.0


def _dose_terms(row, slug: str) -> tuple[float, float]:
    """(effective mg, extra lag in hours) for one stored dose, after food and formulation."""
    amplitude = CHEWABLE_FED_AMPLITUDE if row["formulation"] == "chewable" and row["food_state"] in ("fed", "high_fat") else 1.0
    food_lag = CONFIG[slug].get("food_lag_hours", FOOD_LAG_HOURS)
    return row["dose_mg"] * amplitude, food_lag.get(row["food_state"] or "", 0.0)


def curve(slug: str, start: datetime, end: datetime, step_minutes: int = 10) -> dict:
    cfg = CONFIG[slug]
    profile = _profile_for(slug)
    ka, ke = profile["absorption_rate"], profile["elimination_rate"]
    scale, lag = profile["scale_factor"], profile["lag_time"] or 0.0
    reference = _reference_peak(cfg, profile)
    # Older doses contribute nothing measurable (four days for the short-acting ones, longer for lithium).
    with db.connect() as conn:
        rows = conn.execute(
            "SELECT taken_at, dose_mg, food_state, formulation FROM med_doses WHERE med = ? AND taken_at >= ? AND taken_at <= ? "
            "ORDER BY taken_at",
            (slug, _iso(start - timedelta(days=cfg.get("lookback_days", 4))), _iso(end)),
        ).fetchall()
    doses = [(_parse(r["taken_at"]), *_dose_terms(r, slug)) for r in rows]
    points = []
    moment = start
    while moment <= end:
        total = 0.0
        for taken, mg, extra in doses:
            hours = (moment - taken).total_seconds() / 3600
            total += _exposure(hours - extra, mg, ka, ke, scale, lag)
        points.append([_iso(moment), round(total, 4), round(total / reference, 4)])
        moment += timedelta(minutes=step_minutes)
    return {
        "profile": profile["profile_name"],
        "unit": cfg["concentration_unit"],
        "reference_dose_mg": cfg["reference_dose_mg"],
        "decimals": cfg.get("decimals", 0),
        "from": _iso(start),
        "to": _iso(end),
        "points": points,
    }


# ---- doses, events, check-ins -------------------------------------------------------------------------------------


def _dose_dict(row, events, checkins) -> dict:
    return {
        "id": row["id"],
        "taken_at": row["taken_at"],
        "dose_mg": row["dose_mg"],
        "food_state": row["food_state"],
        "formulation": row["formulation"],
        "notes": row["notes"],
        "source": row["source"],
        "events": events,
        "checkins": checkins,
    }


def list_doses(slug: str, limit: int, before: Optional[str]) -> list[dict]:
    sql = "SELECT * FROM med_doses WHERE med = ?"
    params: list = [slug]
    if before:
        sql += " AND taken_at < ?"
        params.append(before)
    sql += " ORDER BY taken_at DESC LIMIT ?"
    params.append(limit)
    with db.connect() as conn:
        rows = conn.execute(sql, params).fetchall()
        ids = [r["id"] for r in rows]
        events: dict[str, list] = {i: [] for i in ids}
        checkins: dict[str, list] = {i: [] for i in ids}
        if ids:
            marks = ",".join("?" * len(ids))
            for e in conn.execute(f"SELECT * FROM med_events WHERE dose_id IN ({marks}) ORDER BY occurred_at", ids):
                events[e["dose_id"]].append({"id": e["id"], "type": e["event_type"], "occurred_at": e["occurred_at"]})
            for c in conn.execute(f"SELECT * FROM med_checkins WHERE dose_id IN ({marks}) ORDER BY reported_at", ids):
                checkins[c["dose_id"]].append({
                    "id": c["id"], "reported_at": c["reported_at"], "task_initiation": c["task_initiation"],
                    "motivation": c["motivation"], "focus": c["focus"], "task_switching": c["task_switching"],
                    "was_enough": c["was_enough"], "note": c["note"],
                })
    return [_dose_dict(r, events[r["id"]], checkins[r["id"]]) for r in rows]


def add_dose(slug: str, taken_at: str, dose_mg: float, food_state: Optional[str], formulation: Optional[str],
             notes: Optional[str], source: str) -> dict:
    row = {
        "id": new_id(), "med": slug, "taken_at": taken_at, "dose_mg": dose_mg, "food_state": food_state,
        "formulation": formulation, "notes": notes, "source": source, "created_at": db.now_utc(),
    }
    with db.connect() as conn:
        conn.execute(
            "INSERT INTO med_doses (id, med, taken_at, dose_mg, food_state, formulation, notes, source, created_at) "
            "VALUES (:id, :med, :taken_at, :dose_mg, :food_state, :formulation, :notes, :source, :created_at)",
            row,
        )
    return _dose_dict(row, [], [])


def get_dose(dose_id: str):
    with db.connect() as conn:
        return conn.execute("SELECT * FROM med_doses WHERE id = ?", (dose_id,)).fetchone()


def delete_dose(dose_id: str) -> bool:
    with db.connect() as conn:
        row = conn.execute("SELECT med FROM med_doses WHERE id = ?", (dose_id,)).fetchone()
        gone = conn.execute("DELETE FROM med_doses WHERE id = ?", (dose_id,)).rowcount > 0
    if gone and row:
        refit_quietly(row["med"])
    return gone


def add_event(dose, event_type: str, occurred_at: str, source: str) -> dict:
    event = {
        "id": new_id(), "dose_id": dose["id"], "med": dose["med"], "event_type": event_type,
        "occurred_at": occurred_at, "source": source, "created_at": db.now_utc(),
    }
    with db.connect() as conn:
        # One of each kind per dose: logging it again moves it.
        conn.execute("DELETE FROM med_events WHERE dose_id = ? AND event_type = ?", (dose["id"], event_type))
        conn.execute(
            "INSERT INTO med_events (id, dose_id, med, event_type, occurred_at, source, created_at) "
            "VALUES (:id, :dose_id, :med, :event_type, :occurred_at, :source, :created_at)",
            event,
        )
    refit_quietly(dose["med"])
    return {"id": event["id"], "type": event_type, "occurred_at": occurred_at}


def add_checkin(dose, data: dict, reported_at: str, source: str) -> dict:
    row = {"id": new_id(), "dose_id": dose["id"], "reported_at": reported_at, "source": source, **data}
    with db.connect() as conn:
        conn.execute(
            "INSERT INTO med_checkins (id, dose_id, reported_at, task_initiation, motivation, focus, task_switching, "
            "was_enough, note, source) VALUES (:id, :dose_id, :reported_at, :task_initiation, :motivation, :focus, "
            ":task_switching, :was_enough, :note, :source)",
            row,
        )
    return row


# ---- the overview -------------------------------------------------------------------------------------------------


def _quantiles(values: list[float]) -> dict:
    values = sorted(values)
    n = len(values)
    if not n:
        return {"n": 0}
    pick = lambda q: values[min(n - 1, int(round(q * (n - 1))))]
    return {"n": n, "median": statistics.median(values), "p25": pick(0.25), "p75": pick(0.75)}


def overview(slug: str, tz_minutes: int) -> dict:
    cfg = CONFIG[slug]
    shift = timedelta(minutes=tz_minutes)
    with db.connect() as conn:
        doses = conn.execute("SELECT * FROM med_doses WHERE med = ? ORDER BY taken_at", (slug,)).fetchall()
        events = conn.execute("SELECT * FROM med_events WHERE med = ?", (slug,)).fetchall()
        schedule = conn.execute(
            "SELECT * FROM med_schedules WHERE med = ? AND active = 1 ORDER BY created_at DESC LIMIT 1", (slug,)
        ).fetchone()
        checkin_count = conn.execute(
            "SELECT COUNT(*) FROM med_checkins c JOIN med_doses d ON d.id = c.dose_id WHERE d.med = ?", (slug,)
        ).fetchone()[0]

    by_id = {d["id"]: _parse(d["taken_at"]) for d in doses}
    timing: dict[str, list[float]] = {t: [] for t in EVENT_TYPES}
    for e in events:
        taken = by_id.get(e["dose_id"])
        if not taken:
            continue
        minutes = (_parse(e["occurred_at"]) - taken).total_seconds() / 60
        if 0 < minutes < 24 * 60:
            timing[e["event_type"]].append(minutes)

    # The last 30 local days: when each dose was taken, as minutes after midnight.
    today = (datetime.now(timezone.utc) + shift).date()
    days: dict[str, list] = {}
    for d in doses:
        local = _parse(d["taken_at"]) + shift
        if (today - local.date()).days <= 29:
            days.setdefault(local.date().isoformat(), []).append(
                {"minute": local.hour * 60 + local.minute, "mg": d["dose_mg"]}
            )
    first_doses = [min(x["minute"] for x in v) for v in days.values()]
    taken_days = {(_parse(d["taken_at"]) + shift).date() for d in doses}
    streak = 0
    cursor = today if today in taken_days else today - timedelta(days=1)
    while cursor in taken_days:
        streak += 1
        cursor -= timedelta(days=1)

    last = doses[-1] if doses else None
    return {
        "med": cfg,
        "total_doses": len(doses),
        "first_dose": doses[0]["taken_at"] if doses else None,
        "last_dose": None if not last else {
            "id": last["id"], "taken_at": last["taken_at"], "dose_mg": last["dose_mg"],
            "food_state": last["food_state"], "source": last["source"],
        },
        "timing": {t: _quantiles(v) for t, v in timing.items()},
        "days30": [{"day": k, "doses": v} for k, v in sorted(days.items())],
        "days_taken_30": len(days),
        "avg_first_dose_minute": round(statistics.mean(first_doses)) if first_doses else None,
        "streak": streak,
        "checkins": checkin_count,
        "schedule": None if not schedule else {
            "name": schedule["name"], "dose_mg": schedule["dose_mg"], "times": json.loads(schedule["times"]),
            "frequency": schedule["frequency"],
        },
        "profile": _profile_for(slug)["profile_name"],
    }


# ---- a curve fitted to your own logged times ---------------------------------------------------------------------


def _shape(s: float, ka: float, ke: float) -> float:
    return 0.0 if s <= 0 else (ka / (ka - ke)) * (math.exp(-ke * s) - math.exp(-ka * s))


def _event_times(ka: float, ke: float, lag: float, level: float) -> Optional[tuple[float, float, float]]:
    """Hours after the dose when the curve first reaches `level` of its peak, peaks, and falls back to `level`."""
    if ka <= ke * 1.01:
        return None
    s_peak = math.log(ka / ke) / (ka - ke)
    target = level * _shape(s_peak, ka, ke)
    lo, hi = 0.0, s_peak
    for _ in range(50):
        mid = (lo + hi) / 2
        lo, hi = (mid, hi) if _shape(mid, ka, ke) < target else (lo, mid)
    s_on = (lo + hi) / 2
    lo, hi = s_peak, s_peak + 400
    for _ in range(60):
        mid = (lo + hi) / 2
        lo, hi = (mid, hi) if _shape(mid, ka, ke) > target else (lo, mid)
    return lag + s_on, lag + s_peak, lag + (lo + hi) / 2


FIT_LEVEL = 0.5  # "kicked in" and "wearing off" are the moments the effect crosses half of its peak
FIT_MIN_EVENTS = 15


def fit_personal(slug: str) -> dict:
    """Fit absorption, elimination and delay to the median logged onset / strongest / wearing-off times, and store it as the
    personal profile (updated in place when one exists). Returns what was fitted."""
    cfg = CONFIG.get(slug)
    if not cfg or not cfg.get("tracks_events"):
        raise ValueError("this medication has no event times to fit")
    with db.connect() as conn:
        rows = conn.execute(
            "SELECT e.event_type AS t, d.taken_at AS taken, e.occurred_at AS at FROM med_events e JOIN med_doses d ON d.id = e.dose_id "
            "WHERE e.med = ? AND e.event_type IN ('onset', 'strongest', 'wearing_off')", (slug,)).fetchall()
        by: dict[str, list[float]] = {"onset": [], "strongest": [], "wearing_off": []}
        for r in rows:
            minutes = (_parse_any(r["at"]) - _parse_any(r["taken"])).total_seconds() / 60
            if 0 < minutes <= 1200:
                by[r["t"]].append(minutes)
        counts = {k: len(v) for k, v in by.items()}
        if min(counts.values()) < FIT_MIN_EVENTS:
            raise ValueError(f"need at least {FIT_MIN_EVENTS} logged times of each kind (you have {counts})")
        t_on, t_pk, t_off = (statistics.median(by[k]) / 60 for k in ("onset", "strongest", "wearing_off"))
        if not t_on < t_pk < t_off:
            raise ValueError("the median times are not in order (kicked in, strongest, wearing off)")

        def cost(p: list[float]) -> float:
            ka, ke, lag = p
            if ka <= 0 or ke <= 0 or not 0 <= lag < t_on:
                return 1e9
            t = _event_times(ka, ke, lag, FIT_LEVEL)
            return 1e9 if t is None else (t[0] - t_on) ** 2 + (t[1] - t_pk) ** 2 + (t[2] - t_off) ** 2

        best = min(([ka, ke, lag] for ka in (0.5, 1, 2, 3, 5) for ke in (0.05, 0.1, 0.2, 0.4, 0.8) for lag in (0, 0.2, 0.5, 0.8)), key=cost)
        step = [0.5, 0.1, 0.2]
        for _ in range(400):
            improved = False
            for i in range(3):
                for sign in (1, -1):
                    trial = list(best)
                    trial[i] += sign * step[i]
                    if cost(trial) < cost(best):
                        best, improved = trial, True
            if not improved:
                step = [x / 2 for x in step]
            if max(step) < 1e-5:
                break
        if cost(best) > 0.01:
            raise ValueError("your logged times do not fit a single curve well enough")
        ka, ke, lag = best
        # keep the numbers comparable: the same peak per mg as the profile that was in use before the fit
        base = next((dict(r) for src in ("adjusted", "population") for r in conn.execute(
            "SELECT * FROM med_profiles WHERE med = ? AND valid_until IS NULL AND source = ? AND scenario = 'central' AND compartment = 'metabolite'", (slug, src)).fetchall()), dict(FALLBACK_PROFILE))
        def unit_peak(a: float, e: float) -> float:
            return _shape(math.log(a / e) / (a - e), a, e)
        scale = base["scale_factor"] * unit_peak(base["absorption_rate"], base["elimination_rate"]) / unit_peak(ka, ke)
        now = db.now_utc()
        name = f"Your logged times (n={min(counts.values())}+)"
        notes = "Fitted to the median logged onset, strongest and wearing-off times; onset and wearing off are the moments the effect crosses half of its peak."
        detail = json.dumps({"median_hours": {"onset": t_on, "strongest": t_pk, "wearing_off": t_off}, "counts": counts, "level": FIT_LEVEL, "fitted_at": now})
        peak_time = lag + math.log(ka / ke) / (ka - ke)
        existing = conn.execute("SELECT id FROM med_profiles WHERE med = ? AND source = 'personal' AND valid_until IS NULL", (slug,)).fetchone()
        if existing:
            # refits happen as you log, so the current personal profile is updated in place rather than piling up rows
            conn.execute(
                "UPDATE med_profiles SET profile_name = ?, half_life = ?, peak_time = ?, absorption_rate = ?, elimination_rate = ?, scale_factor = ?, "
                "lag_time = ?, notes = ?, parameter_source = ? WHERE id = ?",
                (name, math.log(2) / ke, peak_time, ka, ke, scale, lag, notes, detail, existing["id"]))
        else:
            conn.execute(
                "INSERT INTO med_profiles (id, med, profile_name, source, scenario, half_life, peak_time, absorption_rate, elimination_rate, scale_factor, "
                "lag_time, compartment, notes, parameter_source, valid_until) VALUES (?, ?, ?, 'personal', 'central', ?, ?, ?, ?, ?, ?, 'metabolite', ?, ?, NULL)",
                ("personal-" + slug + "-" + uuid.uuid4().hex[:8], slug, name, math.log(2) / ke, peak_time, ka, ke, scale, lag, notes, detail))
    return {
        "profile": name, "counts": counts,
        "median_minutes": {"onset": round(t_on * 60), "strongest": round(t_pk * 60), "wearing_off": round(t_off * 60)},
        "absorption_rate": round(ka, 4), "elimination_rate": round(ke, 4), "lag_hours": round(lag, 3),
        "half_life_hours": round(math.log(2) / ke, 2), "scale_factor": round(scale, 4), "replaces": base.get("profile_name"),
    }


def refit_quietly(slug: str) -> None:
    """Refit the personal curve after the logged times change. Never breaks the request that triggered it: with too few times,
    or times that do not fit one curve, the profile already in use simply stays."""
    if not CONFIG.get(slug, {}).get("tracks_events"):
        return
    try:
        fit_personal(slug)
    except ValueError:
        pass
    except Exception:
        logging.getLogger("ignis").exception("refit failed for %s", slug)
