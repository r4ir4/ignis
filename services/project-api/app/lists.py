"""Lists ("Listography"): any number of titled lists, each a checklist of short items.

Meant for drafting things that are not goals yet, like "stop eating sugar" or "ideas for the trip". Items can be ticked off,
edited and removed; a list is just a title, an optional note and its items in order.
"""
import re
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field

from . import db
from .auth import caller

router = APIRouter(prefix="/v1/lists", tags=["lists"])
MAX_ITEM = 3000   # room for a few links written as [label](address); tracking addresses can be long


def init_tables() -> None:
    with db.connect() as conn:
        conn.execute(
            """CREATE TABLE IF NOT EXISTS lists (
                   id TEXT PRIMARY KEY, title TEXT NOT NULL, note TEXT, sort INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL)"""
        )
        conn.execute(
            """CREATE TABLE IF NOT EXISTS list_items (
                   id TEXT PRIMARY KEY, list_id TEXT NOT NULL REFERENCES lists (id) ON DELETE CASCADE,
                   text TEXT NOT NULL, done INTEGER NOT NULL DEFAULT 0, sort INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL)"""
        )
        conn.execute("CREATE INDEX IF NOT EXISTS list_items_list ON list_items (list_id, sort)")
        # items created from a diary entry remember which one, so editing the entry updates the item instead of duplicating it
        if "source_entry" not in {r["name"] for r in conn.execute("PRAGMA table_info(list_items)")}:
            conn.execute("ALTER TABLE list_items ADD COLUMN source_entry TEXT")
        conn.execute("CREATE INDEX IF NOT EXISTS list_items_source ON list_items (source_entry)")


class ListIn(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    note: Optional[str] = Field(None, max_length=1000)
    items: list[str] = Field(default_factory=list, max_length=200)


class ListPatch(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=120)
    note: Optional[str] = Field(None, max_length=1000)


class ItemsIn(BaseModel):
    texts: list[str] = Field(min_length=1, max_length=200)


class ItemPatch(BaseModel):
    text: Optional[str] = Field(None, min_length=1, max_length=MAX_ITEM)
    done: Optional[bool] = None


class OrderIn(BaseModel):
    item_ids: list[str] = Field(max_length=500)


# An item's text may hold links written as [label](https://address). Anything that is not an http(s) address is reduced to its label.
_MDLINK = re.compile(r"\[([^\]]*)\]\(((?:[^()\s]|\([^()\s]*\))*)\)")   # the address may hold balanced parentheses


def _safe(text: str) -> str:
    return _MDLINK.sub(lambda m: m.group(0) if re.match(r"^https?://", m.group(2), re.IGNORECASE) else m.group(1), text)


def _clean(texts: list[str]) -> list[str]:
    out = [t.strip()[:MAX_ITEM] for t in texts if t and t.strip()]
    if not out:
        raise HTTPException(422, "add at least one item")
    return out


def _shape(conn, row) -> dict:
    out = dict(row)
    out["items"] = [dict(r) | {"done": bool(r["done"])} for r in conn.execute("SELECT id, text, done FROM list_items WHERE list_id = ? ORDER BY sort, created_at", (out["id"],))]
    return out


def _insert_items(conn, list_id: str, texts: list[str]) -> None:
    start = conn.execute("SELECT COALESCE(MAX(sort), 0) FROM list_items WHERE list_id = ?", (list_id,)).fetchone()[0]
    for i, text in enumerate(texts, 1):
        conn.execute("INSERT INTO list_items (id, list_id, text, done, sort, created_at) VALUES (?, ?, ?, 0, ?, ?)", (uuid.uuid4().hex, list_id, _safe(text), start + i, db.now_utc()))


@router.get("")
def all_lists(_: str = Depends(caller)) -> dict:
    with db.connect() as conn:
        return {"lists": [_shape(conn, r) for r in conn.execute("SELECT * FROM lists ORDER BY sort, created_at")]}


@router.post("", status_code=201)
def create_list(body: ListIn, _: str = Depends(caller)) -> dict:
    lid = uuid.uuid4().hex
    texts = [t.strip()[:MAX_ITEM] for t in body.items if t and t.strip()]
    with db.connect() as conn:
        order = conn.execute("SELECT COALESCE(MAX(sort), 0) + 1 FROM lists").fetchone()[0]
        conn.execute("INSERT INTO lists (id, title, note, sort, created_at) VALUES (?, ?, ?, ?, ?)", (lid, body.title.strip(), (body.note or "").strip() or None, order, db.now_utc()))
        if texts:
            _insert_items(conn, lid, texts)
        return _shape(conn, conn.execute("SELECT * FROM lists WHERE id = ?", (lid,)).fetchone())


@router.patch("/items/{item_id}")
def patch_item(item_id: str, body: ItemPatch, _: str = Depends(caller)) -> dict:
    data = body.model_dump(exclude_unset=True)
    with db.connect() as conn:
        if not conn.execute("SELECT 1 FROM list_items WHERE id = ?", (item_id,)).fetchone():
            raise HTTPException(404, "not found")
        fields: dict = {}
        if data.get("text") is not None:
            fields["text"] = _safe(data["text"].strip())
            if not fields["text"]:
                raise HTTPException(422, "text is empty")
        if data.get("done") is not None:
            fields["done"] = int(data["done"])
        if fields:
            conn.execute(f"UPDATE list_items SET {', '.join(k + ' = ?' for k in fields)} WHERE id = ?", (*fields.values(), item_id))
        r = conn.execute("SELECT id, text, done FROM list_items WHERE id = ?", (item_id,)).fetchone()
        return dict(r) | {"done": bool(r["done"])}


@router.delete("/items/{item_id}", status_code=204)
def delete_item(item_id: str, _: str = Depends(caller)) -> Response:
    with db.connect() as conn:
        if conn.execute("DELETE FROM list_items WHERE id = ?", (item_id,)).rowcount == 0:
            raise HTTPException(404, "not found")
    return Response(status_code=204)


@router.patch("/{list_id}")
def patch_list(list_id: str, body: ListPatch, _: str = Depends(caller)) -> dict:
    data = body.model_dump(exclude_unset=True)
    with db.connect() as conn:
        if not conn.execute("SELECT 1 FROM lists WHERE id = ?", (list_id,)).fetchone():
            raise HTTPException(404, "not found")
        fields: dict = {}
        if data.get("title") is not None:
            fields["title"] = data["title"].strip()
        if "note" in data:
            fields["note"] = (data["note"] or "").strip() or None
        if fields:
            conn.execute(f"UPDATE lists SET {', '.join(k + ' = ?' for k in fields)} WHERE id = ?", (*fields.values(), list_id))
        return _shape(conn, conn.execute("SELECT * FROM lists WHERE id = ?", (list_id,)).fetchone())


@router.delete("/{list_id}", status_code=204)
def delete_list(list_id: str, _: str = Depends(caller)) -> Response:
    with db.connect() as conn:
        if conn.execute("DELETE FROM lists WHERE id = ?", (list_id,)).rowcount == 0:
            raise HTTPException(404, "not found")
    return Response(status_code=204)


@router.post("/{list_id}/items", status_code=201)
def add_items(list_id: str, body: ItemsIn, _: str = Depends(caller)) -> dict:
    texts = _clean(body.texts)
    with db.connect() as conn:
        if not conn.execute("SELECT 1 FROM lists WHERE id = ?", (list_id,)).fetchone():
            raise HTTPException(404, "not found")
        _insert_items(conn, list_id, texts)
        return _shape(conn, conn.execute("SELECT * FROM lists WHERE id = ?", (list_id,)).fetchone())


@router.put("/{list_id}/order")
def reorder(list_id: str, body: OrderIn, _: str = Depends(caller)) -> dict:
    with db.connect() as conn:
        if not conn.execute("SELECT 1 FROM lists WHERE id = ?", (list_id,)).fetchone():
            raise HTTPException(404, "not found")
        for i, item_id in enumerate(body.item_ids, 1):
            conn.execute("UPDATE list_items SET sort = ? WHERE id = ? AND list_id = ?", (i, item_id, list_id))
        return _shape(conn, conn.execute("SELECT * FROM lists WHERE id = ?", (list_id,)).fetchone())


# ---- diary link: a #pesquisar entry becomes an item of the "things to read about" list ----

RESEARCH_TAG = "pesquisar"
RESEARCH_LIST = "Temas interessantes pra ler sobre"
_TAG = re.compile(r"(?<!\w)#" + RESEARCH_TAG + r"(?!\w)", re.IGNORECASE)


def sync_research(entry_id: str, text: str) -> None:
    """Called when a diary entry is saved. An entry tagged #pesquisar is added to the research list (the list is created on first
    use); editing the entry updates that item. Nothing is ever removed from the list here: if the tag is dropped or the entry is
    deleted, the item stays, because the list is yours to curate."""
    if RESEARCH_TAG not in db.tags_in(text):
        return
    topic = re.sub(r"\s+", " ", _TAG.sub(" ", text)).strip(" -–—:,.;") or text.strip()
    topic = topic[:297] + "…" if len(topic) > 300 else topic
    with db.connect() as conn:
        row = conn.execute("SELECT id FROM lists WHERE title = ? ORDER BY created_at LIMIT 1", (RESEARCH_LIST,)).fetchone()
        if row:
            list_id = row["id"]
        else:
            list_id = uuid.uuid4().hex
            order = conn.execute("SELECT COALESCE(MAX(sort), 0) + 1 FROM lists").fetchone()[0]
            conn.execute("INSERT INTO lists (id, title, note, sort, created_at) VALUES (?, ?, ?, ?, ?)",
                         (list_id, RESEARCH_LIST, "Entradas do diário com #pesquisar chegam aqui sozinhas.", order, db.now_utc()))
        item = conn.execute("SELECT id FROM list_items WHERE source_entry = ?", (entry_id,)).fetchone()
        if item:
            conn.execute("UPDATE list_items SET text = ? WHERE id = ?", (topic, item["id"]))
        else:
            sort = conn.execute("SELECT COALESCE(MAX(sort), 0) + 1 FROM list_items WHERE list_id = ?", (list_id,)).fetchone()[0]
            conn.execute("INSERT INTO list_items (id, list_id, text, done, sort, created_at, source_entry) VALUES (?, ?, ?, 0, ?, ?, ?)",
                         (uuid.uuid4().hex, list_id, topic, sort, db.now_utc(), entry_id))
