"""Daily check-ins (the Venvanse questionnaire for now): one finished form per kind per day, kept as it was submitted.

A check-in cannot be edited or deleted from the page and only one can exist for a day (a second one for the same day is refused with 409).
Days are plain local dates (YYYY-MM-DD) sent by the client. The answers are stored as JSON: keys are the question numbers (q1 ... q45),
values are a short string (a 0-4 answer, hours, a time such as 08:15) or a small object (yes/no with a note, a second dose).
`auto` records which answers were filled in from other data (the Meds log or the Health sleep data) rather than typed.

Reference copy of the module deployed as /opt/ignis/api/app/checkins.py. Register it in app/main.py: `from . import checkins`,
`checkins.init_tables()` in lifespan and `app.include_router(checkins.router)`.
"""
import json
import re
import sqlite3
import uuid
from datetime import date, datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Path, Query
from pydantic import BaseModel, Field

from . import db
from .auth import caller

router = APIRouter(prefix="/v1/checkins", tags=["checkins"])

KIND = "^(venvanse)$"
MAX_JSON = 40_000
_KEY = re.compile(r"^q\d{1,2}$")


def init_tables() -> None:
    with db.connect() as conn:
        conn.execute(
            """CREATE TABLE IF NOT EXISTS daily_checkins (
                   id TEXT PRIMARY KEY, kind TEXT NOT NULL, day TEXT NOT NULL, answers TEXT NOT NULL, auto TEXT NOT NULL DEFAULT '{}',
                   created_at TEXT NOT NULL, UNIQUE (kind, day))"""
        )


class CheckinIn(BaseModel):
    day: str = Field(max_length=10)
    answers: dict[str, Any]
    auto: dict[str, str] = Field(default_factory=dict)


def _clean(value: Any, depth: int = 0) -> Any:
    """Answers are short strings, numbers, or one level of small objects; anything else is refused."""
    if value is None or isinstance(value, (int, float)) and not isinstance(value, bool):
        return value
    if isinstance(value, str):
        if len(value) > 500:
            raise HTTPException(422, "an answer is too long")
        return value
    if isinstance(value, dict) and depth == 0:
        return {str(k)[:20]: _clean(v, 1) for k, v in value.items()}
    raise HTTPException(422, "unsupported answer")


def _row(row) -> dict:
    return {"id": row["id"], "kind": row["kind"], "day": row["day"], "answers": json.loads(row["answers"]), "auto": json.loads(row["auto"]), "created_at": row["created_at"]}


def _check_day(value: str) -> str:
    try:
        d = date.fromisoformat(value)
    except ValueError:
        raise HTTPException(422, "day must be YYYY-MM-DD")
    # the client sends its own local date; it must be today (give or take a day for time zones), never an old or future day
    if abs((d - datetime.now(timezone.utc).date()).days) > 1:
        raise HTTPException(422, "a check-in can only be filled in for today")
    return value


@router.get("/{kind}")
def list_checkins(kind: str = Path(..., pattern=KIND), limit: int = Query(60, ge=1, le=400), _: str = Depends(caller)) -> dict:
    with db.connect() as conn:
        rows = conn.execute("SELECT id, kind, day, created_at FROM daily_checkins WHERE kind = ? ORDER BY day DESC LIMIT ?", (kind, limit)).fetchall()
    return {"items": [dict(r) for r in rows]}


@router.get("/{kind}/{day}")
def get_checkin(kind: str = Path(..., pattern=KIND), day: str = Path(..., max_length=10), _: str = Depends(caller)) -> dict:
    try:
        date.fromisoformat(day)
    except ValueError:
        raise HTTPException(422, "day must be YYYY-MM-DD")
    with db.connect() as conn:
        row = conn.execute("SELECT * FROM daily_checkins WHERE kind = ? AND day = ?", (kind, day)).fetchone()
    if not row:
        raise HTTPException(404, "no check-in for that day")
    return _row(row)


@router.post("/{kind}", status_code=201)
def submit(body: CheckinIn, kind: str = Path(..., pattern=KIND), _: str = Depends(caller)) -> dict:
    day = _check_day(body.day)
    answers = {}
    for key, value in body.answers.items():
        if not _KEY.match(key):
            raise HTTPException(422, "unknown question " + key[:12])
        answers[key] = _clean(value)
    auto = {k: v[:20] for k, v in body.auto.items() if _KEY.match("q" + k)}
    blob, auto_blob = json.dumps(answers, ensure_ascii=False), json.dumps(auto)
    if len(blob) > MAX_JSON:
        raise HTTPException(413, "the check-in is too large")
    if not answers:
        raise HTTPException(422, "nothing was answered")
    new_id, now = uuid.uuid4().hex, db.now_utc()
    try:
        with db.connect() as conn:
            conn.execute("INSERT INTO daily_checkins (id, kind, day, answers, auto, created_at) VALUES (?, ?, ?, ?, ?, ?)", (new_id, kind, day, blob, auto_blob, now))
    except sqlite3.IntegrityError:
        raise HTTPException(409, "today's check-in was already submitted")
    return {"id": new_id, "kind": kind, "day": day, "answers": answers, "auto": auto, "created_at": now}
