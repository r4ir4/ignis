"""Notes: free-form documents written in a block editor (Tiptap), shown as cards like the lists.

A note is a title and its body. The body is the editor's JSON document, stored as text; `preview` is a short plain-text
excerpt the editor sends along so the overview can show it without loading every document.
"""
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field

from . import db
from .auth import caller

router = APIRouter(prefix="/v1/notes", tags=["notes"])
MAX_BODY = 400_000   # characters of editor JSON; the proxy accepts requests up to 1 MB


def init_tables() -> None:
    with db.connect() as conn:
        conn.execute(
            """CREATE TABLE IF NOT EXISTS notes (
                   id TEXT PRIMARY KEY, title TEXT NOT NULL DEFAULT '', body TEXT NOT NULL DEFAULT '', preview TEXT NOT NULL DEFAULT '',
                   pinned INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)"""
        )


class NoteIn(BaseModel):
    title: str = Field("", max_length=200)
    body: str = Field("", max_length=MAX_BODY)
    preview: str = Field("", max_length=400)


class NotePatch(BaseModel):
    title: Optional[str] = Field(None, max_length=200)
    body: Optional[str] = Field(None, max_length=MAX_BODY)
    preview: Optional[str] = Field(None, max_length=400)
    pinned: Optional[bool] = None


def _card(row) -> dict:
    return {"id": row["id"], "title": row["title"], "preview": row["preview"], "pinned": bool(row["pinned"]),
            "created_at": row["created_at"], "updated_at": row["updated_at"]}


def _full(row) -> dict:
    return _card(row) | {"body": row["body"]}


def _get(conn, note_id: str):
    row = conn.execute("SELECT * FROM notes WHERE id = ?", (note_id,)).fetchone()
    if not row:
        raise HTTPException(404, "not found")
    return row


@router.get("")
def list_notes(_: str = Depends(caller)) -> dict:
    """The overview: no bodies, newest edit first, pinned notes on top."""
    with db.connect() as conn:
        return {"notes": [_card(r) for r in conn.execute(
            "SELECT id, title, preview, pinned, created_at, updated_at FROM notes ORDER BY pinned DESC, updated_at DESC")]}


@router.post("", status_code=201)
def create_note(body: NoteIn, _: str = Depends(caller)) -> dict:
    nid, now = uuid.uuid4().hex, db.now_utc()
    with db.connect() as conn:
        conn.execute("INSERT INTO notes (id, title, body, preview, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
                     (nid, body.title.strip(), body.body, body.preview.strip(), now, now))
        return _full(_get(conn, nid))


@router.get("/{note_id}")
def get_note(note_id: str, _: str = Depends(caller)) -> dict:
    with db.connect() as conn:
        return _full(_get(conn, note_id))


@router.patch("/{note_id}")
def patch_note(note_id: str, body: NotePatch, _: str = Depends(caller)) -> dict:
    data = body.model_dump(exclude_unset=True)
    with db.connect() as conn:
        _get(conn, note_id)
        fields: dict = {}
        for k in ("title", "preview"):
            if data.get(k) is not None:
                fields[k] = data[k].strip()
        if data.get("body") is not None:
            fields["body"] = data["body"]
        if data.get("pinned") is not None:
            fields["pinned"] = int(data["pinned"])
        if fields:
            # pinning is not an edit: it should not move the note to the top of the recent ones
            if set(fields) != {"pinned"}:
                fields["updated_at"] = db.now_utc()
            conn.execute(f"UPDATE notes SET {', '.join(k + ' = ?' for k in fields)} WHERE id = ?", (*fields.values(), note_id))
        return _full(_get(conn, note_id))


@router.delete("/{note_id}", status_code=204)
def delete_note(note_id: str, _: str = Depends(caller)) -> Response:
    with db.connect() as conn:
        if conn.execute("DELETE FROM notes WHERE id = ?", (note_id,)).rowcount == 0:
            raise HTTPException(404, "not found")
    return Response(status_code=204)
