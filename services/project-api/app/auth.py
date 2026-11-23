import hashlib
import hmac
import json
import os
from pathlib import Path
from typing import Optional

import time

from fastapi import Header, HTTPException

from . import db

# Device name -> sha256 of that device's token (create with new-token.sh).
TOKENS_FILE = Path(os.environ.get("IGNIS_API_TOKENS_FILE", "/run/ignis/tokens.json"))
# Shared with the project.ignis.farm nginx, which adds it to requests that already
# passed the tinyauth login. Never trust Remote-Email or similar headers here: on the
# public api.ignis.farm route a caller can forge them.
WEB_SECRET_FILE = Path(os.environ.get("IGNIS_API_WEB_SECRET_FILE", "/run/ignis/web-secret"))

WEB_CALLER = "web"


def load_tokens() -> dict[str, str]:
    try:
        return json.loads(TOKENS_FILE.read_text())
    except (FileNotFoundError, ValueError):
        return {}


def load_web_secret() -> str:
    try:
        return WEB_SECRET_FILE.read_text().strip()
    except FileNotFoundError:
        return ""


_seen_at: dict[str, float] = {}


def _touch(name: str) -> None:
    """Remember when a device last called the API (at most once a minute per device), for the settings page."""
    now = time.monotonic()
    if now - _seen_at.get(name, -120.0) < 60:
        return
    _seen_at[name] = now
    try:
        with db.connect() as conn:
            conn.execute(
                "INSERT INTO token_seen (name, last_seen) VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET last_seen = excluded.last_seen",
                (name, db.now_utc()))
    except Exception:
        pass  # never fail a request because the bookkeeping failed


def _db_tokens() -> dict[str, str]:
    """Tokens made on the settings page: name -> sha256. They live in the database because the secrets folder is read-only."""
    try:
        with db.connect() as conn:
            return {r["name"]: r["hash"] for r in conn.execute("SELECT name, hash FROM api_tokens")}
    except Exception:
        return {}


def _unauthorized(detail: str) -> HTTPException:
    return HTTPException(401, detail, headers={"WWW-Authenticate": "Bearer"})


def caller(
    authorization: Optional[str] = Header(default=None),
    x_ignis_web_secret: Optional[str] = Header(default=None),
) -> str:
    """Names who is calling: a device (bearer token) or "web" (project.ignis.farm). Else 401."""
    if x_ignis_web_secret is not None:
        secret = load_web_secret()
        if secret and hmac.compare_digest(x_ignis_web_secret.encode(), secret.encode()):
            return WEB_CALLER
        raise _unauthorized("invalid web secret")

    scheme, _, token = (authorization or "").partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        raise _unauthorized("missing token")

    digest = hashlib.sha256(token.strip().encode()).hexdigest()
    device = None
    for name, stored in {**_db_tokens(), **load_tokens()}.items():
        if hmac.compare_digest(digest, stored):
            device = name
    if device is None:
        raise _unauthorized("invalid token")
    _touch(device)
    return device
