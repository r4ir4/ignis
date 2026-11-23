"""Settings: API tokens made from the web (shown once, stored as sha256 in the database) and the health of the wearable connections.

Tokens made here live in `api_tokens`. Tokens made with new-token.sh live in the read-only secrets file; they are listed
but can only be removed on the server.
"""
import hashlib
import re
import secrets
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field

from . import db
from .auth import WEB_CALLER, caller, load_tokens

router = APIRouter(prefix="/v1/settings", tags=["settings"])

NAME = re.compile(r"^[a-z0-9-]{1,32}$")

# What each source is, how often it should arrive, and how late is late (hours): ok up to `ok`, late up to `late`, then down.
CONNECTIONS = [
    ("whoop", "Whoop", "Recovery, sleep, strain and workouts", "every 4 hours", 8, 24, "whoop"),
    ("garmin", "Garmin", "Body Battery, stress, sleep, HRV and activities", "every hour", 3, 24, "garmin"),
    ("apple_watch", "Apple Watch", "Steps and activity, sent by the iPhone app", "when the app opens", 48, 168, "iphone"),
]


def init_tables() -> None:
    with db.connect() as conn:
        conn.execute("CREATE TABLE IF NOT EXISTS api_tokens (name TEXT PRIMARY KEY, hash TEXT NOT NULL, created_at TEXT NOT NULL)")
        conn.execute("CREATE TABLE IF NOT EXISTS token_seen (name TEXT PRIMARY KEY, last_seen TEXT NOT NULL)")


class TokenIn(BaseModel):
    name: str = Field(min_length=1, max_length=32)


def _age_hours(stamp: Optional[str]) -> Optional[float]:
    if not stamp:
        return None
    moment = datetime.strptime(stamp, db.TIME_FORMAT).replace(tzinfo=timezone.utc)
    return (datetime.now(timezone.utc) - moment).total_seconds() / 3600


def _web_only(who: str) -> None:
    if who != WEB_CALLER:
        raise HTTPException(403, "tokens can only be managed from the web page")


@router.get("/overview")
def overview(_: str = Depends(caller)) -> dict:
    file_tokens = set(load_tokens())
    with db.connect() as conn:
        seen = {r["name"]: r["last_seen"] for r in conn.execute("SELECT name, last_seen FROM token_seen")}
        made = {r["name"]: r["created_at"] for r in conn.execute("SELECT name, created_at FROM api_tokens")}
        connections = []
        for key, label, what, cadence, ok_h, late_h, token_name in CONNECTIONS:
            row = conn.execute(
                "SELECT MAX(received_at) AS last_sync, MAX(measured_at) AS newest, COUNT(*) AS readings FROM health_measurements WHERE source = ?", (key,)).fetchone()
            wk = conn.execute("SELECT MAX(received_at) AS last_sync, COUNT(*) AS n FROM health_workouts WHERE source = ?", (key,)).fetchone()
            last_sync = max([s for s in (row["last_sync"], wk["last_sync"]) if s], default=None)
            checked = seen.get(token_name) if token_name else None
            age = _age_hours(last_sync)
            status = "never" if last_sync is None else "ok" if age <= ok_h else "late" if age <= late_h else "down"
            connections.append({
                "key": key, "label": label, "what": what, "cadence": cadence, "status": status,
                "last_sync": last_sync, "newest_reading": row["newest"], "readings": row["readings"], "workouts": wk["n"],
                "last_check": checked,
            })
    tokens = []
    for name in sorted(set(file_tokens) | set(made)):
        tokens.append({"name": name, "origin": "server" if name in file_tokens else "web", "created_at": made.get(name), "last_seen": seen.get(name)})
    return {"connections": connections, "tokens": tokens, "now": db.now_utc()}


@router.post("/tokens", status_code=201)
def create_token(body: TokenIn, who: str = Depends(caller)) -> dict:
    _web_only(who)
    name = body.name.strip().lower()
    if not NAME.match(name):
        raise HTTPException(422, "use lowercase letters, digits and dashes only (up to 32)")
    if name == WEB_CALLER:
        raise HTTPException(422, "\"web\" is reserved")
    if name in load_tokens():
        raise HTTPException(409, "that name is used by a server-managed token")
    token = secrets.token_urlsafe(32)
    with db.connect() as conn:
        conn.execute(
            "INSERT INTO api_tokens (name, hash, created_at) VALUES (?, ?, ?) ON CONFLICT(name) DO UPDATE SET hash = excluded.hash, created_at = excluded.created_at",
            (name, hashlib.sha256(token.encode()).hexdigest(), db.now_utc()))
        conn.execute("DELETE FROM token_seen WHERE name = ?", (name,))
    return {"name": name, "token": token}


@router.delete("/tokens/{name}", status_code=204)
def delete_token(name: str, who: str = Depends(caller)) -> Response:
    _web_only(who)
    with db.connect() as conn:
        if conn.execute("DELETE FROM api_tokens WHERE name = ?", (name,)).rowcount == 0:
            raise HTTPException(404, "not a token made on this page")
        conn.execute("DELETE FROM token_seen WHERE name = ?", (name,))
    return Response(status_code=204)
