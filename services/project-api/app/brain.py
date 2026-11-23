"""Brain: decks of flashcards to study any subject.

A deck is a titled collection; a card is a front (the question or term) and a back (the answer). Each card remembers how well you know it
with a simple box system: answering right moves it one box up and schedules it further away, answering wrong sends it back to the first
box to be seen again soon. `due` is the next day the card should be reviewed (empty = never studied, so due now).

Days are plain local dates (YYYY-MM-DD) sent by the client.
"""
import uuid
from datetime import date, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from pydantic import BaseModel, Field

from . import db
from .auth import caller

router = APIRouter(prefix="/v1/brain", tags=["brain"])

BOX_DAYS = (0, 1, 3, 7, 14, 30)   # days until the next review for a card in box 0..5
MAX_BOX = len(BOX_DAYS) - 1
MAX_CARDS = 2000


def init_tables() -> None:
    with db.connect() as conn:
        conn.execute(
            """CREATE TABLE IF NOT EXISTS brain_decks (
                   id TEXT PRIMARY KEY, title TEXT NOT NULL, note TEXT NOT NULL DEFAULT '', sort INTEGER NOT NULL DEFAULT 0,
                   best_score INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)"""
        )
        conn.execute(
            """CREATE TABLE IF NOT EXISTS brain_cards (
                   id TEXT PRIMARY KEY, deck_id TEXT NOT NULL REFERENCES brain_decks (id) ON DELETE CASCADE,
                   front TEXT NOT NULL, back TEXT NOT NULL, sort INTEGER NOT NULL DEFAULT 0,
                   box INTEGER NOT NULL DEFAULT 0, due TEXT, seen INTEGER NOT NULL DEFAULT 0, right INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL)"""
        )
        conn.execute("CREATE INDEX IF NOT EXISTS brain_cards_deck ON brain_cards (deck_id, sort)")


class CardIn(BaseModel):
    front: str = Field(min_length=1, max_length=500)
    back: str = Field(min_length=1, max_length=500)


class DeckIn(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    note: str = Field("", max_length=1000)
    cards: list[CardIn] = Field(default_factory=list, max_length=MAX_CARDS)


class DeckPatch(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=120)
    note: Optional[str] = Field(None, max_length=1000)


class CardsIn(BaseModel):
    cards: list[CardIn] = Field(min_length=1, max_length=MAX_CARDS)


class CardPatch(BaseModel):
    front: Optional[str] = Field(None, min_length=1, max_length=500)
    back: Optional[str] = Field(None, min_length=1, max_length=500)


class ReviewIn(BaseModel):
    correct: bool
    day: str = Field(max_length=10)


class ScoreIn(BaseModel):
    score: int = Field(ge=0, le=10_000_000)


def _day(value: str) -> date:
    try:
        return date.fromisoformat(value)
    except ValueError:
        raise HTTPException(422, "day must be YYYY-MM-DD")


def _deck_row(conn, deck_id: str):
    row = conn.execute("SELECT * FROM brain_decks WHERE id = ?", (deck_id,)).fetchone()
    if not row:
        raise HTTPException(404, "not found")
    return row


def _cards(conn, deck_id: str) -> list:
    return [dict(r) for r in conn.execute("SELECT id, front, back, box, due, seen, right FROM brain_cards WHERE deck_id = ? ORDER BY sort, created_at", (deck_id,))]


def _summary(conn, row, today: str) -> dict:
    s = conn.execute(
        "SELECT COUNT(*) AS n, COALESCE(SUM(CASE WHEN due IS NULL OR due <= ? THEN 1 ELSE 0 END), 0) AS due, COALESCE(SUM(CASE WHEN box >= 3 THEN 1 ELSE 0 END), 0) AS learned "
        "FROM brain_cards WHERE deck_id = ?", (today, row["id"])).fetchone()
    return {"id": row["id"], "title": row["title"], "note": row["note"], "best_score": row["best_score"], "created_at": row["created_at"],
            "cards": s["n"], "due": s["due"], "learned": s["learned"]}


def _insert(conn, deck_id: str, cards: list) -> None:
    have = conn.execute("SELECT COUNT(*), COALESCE(MAX(sort), 0) FROM brain_cards WHERE deck_id = ?", (deck_id,)).fetchone()
    if have[0] + len(cards) > MAX_CARDS:
        raise HTTPException(422, "a deck can hold up to %d cards" % MAX_CARDS)
    for i, c in enumerate(cards, 1):
        conn.execute("INSERT INTO brain_cards (id, deck_id, front, back, sort, created_at) VALUES (?, ?, ?, ?, ?, ?)",
                     (uuid.uuid4().hex, deck_id, c.front.strip(), c.back.strip(), have[1] + i, db.now_utc()))


@router.get("")
def list_decks(day: str = Query(..., max_length=10), _: str = Depends(caller)) -> dict:
    _day(day)
    with db.connect() as conn:
        return {"decks": [_summary(conn, r, day) for r in conn.execute("SELECT * FROM brain_decks ORDER BY sort, created_at")]}


@router.post("", status_code=201)
def create_deck(body: DeckIn, day: str = Query(..., max_length=10), _: str = Depends(caller)) -> dict:
    _day(day)
    did = uuid.uuid4().hex
    now = db.now_utc()
    with db.connect() as conn:
        order = conn.execute("SELECT COALESCE(MAX(sort), 0) + 1 FROM brain_decks").fetchone()[0]
        conn.execute("INSERT INTO brain_decks (id, title, note, sort, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)", (did, body.title.strip(), body.note.strip(), order, now, now))
        _insert(conn, did, body.cards)
        return _summary(conn, _deck_row(conn, did), day)


@router.get("/{deck_id}")
def get_deck(deck_id: str, day: str = Query(..., max_length=10), _: str = Depends(caller)) -> dict:
    _day(day)
    with db.connect() as conn:
        row = _deck_row(conn, deck_id)
        return _summary(conn, row, day) | {"items": _cards(conn, deck_id)}


@router.patch("/cards/{card_id}")
def patch_card(card_id: str, body: CardPatch, _: str = Depends(caller)) -> dict:
    data = {k: v.strip() for k, v in body.model_dump(exclude_unset=True).items() if v is not None}
    if any(v == "" for v in data.values()):
        raise HTTPException(422, "front and back cannot be empty")
    with db.connect() as conn:
        if not conn.execute("SELECT 1 FROM brain_cards WHERE id = ?", (card_id,)).fetchone():
            raise HTTPException(404, "not found")
        if data:
            conn.execute(f"UPDATE brain_cards SET {', '.join(k + ' = ?' for k in data)} WHERE id = ?", (*data.values(), card_id))
        return dict(conn.execute("SELECT id, front, back, box, due, seen, right FROM brain_cards WHERE id = ?", (card_id,)).fetchone())


@router.delete("/cards/{card_id}", status_code=204)
def delete_card(card_id: str, _: str = Depends(caller)) -> Response:
    with db.connect() as conn:
        if conn.execute("DELETE FROM brain_cards WHERE id = ?", (card_id,)).rowcount == 0:
            raise HTTPException(404, "not found")
    return Response(status_code=204)


@router.post("/cards/{card_id}/review")
def review_card(card_id: str, body: ReviewIn, _: str = Depends(caller)) -> dict:
    """You answered a card: right moves it up a box and pushes its next review out, wrong sends it back to the first box."""
    today = _day(body.day)
    with db.connect() as conn:
        row = conn.execute("SELECT box, seen, right FROM brain_cards WHERE id = ?", (card_id,)).fetchone()
        if not row:
            raise HTTPException(404, "not found")
        box = min(row["box"] + 1, MAX_BOX) if body.correct else 0
        due = (today + timedelta(days=BOX_DAYS[box])).isoformat()
        conn.execute("UPDATE brain_cards SET box = ?, due = ?, seen = ?, right = ? WHERE id = ?", (box, due, row["seen"] + 1, row["right"] + (1 if body.correct else 0), card_id))
        return dict(conn.execute("SELECT id, front, back, box, due, seen, right FROM brain_cards WHERE id = ?", (card_id,)).fetchone())


@router.patch("/{deck_id}")
def patch_deck(deck_id: str, body: DeckPatch, day: str = Query(..., max_length=10), _: str = Depends(caller)) -> dict:
    _day(day)
    data = body.model_dump(exclude_unset=True)
    with db.connect() as conn:
        _deck_row(conn, deck_id)
        fields = {}
        if data.get("title") is not None:
            fields["title"] = data["title"].strip()
        if "note" in data:
            fields["note"] = (data["note"] or "").strip()
        if fields:
            fields["updated_at"] = db.now_utc()
            conn.execute(f"UPDATE brain_decks SET {', '.join(k + ' = ?' for k in fields)} WHERE id = ?", (*fields.values(), deck_id))
        return _summary(conn, _deck_row(conn, deck_id), day)


@router.delete("/{deck_id}", status_code=204)
def delete_deck(deck_id: str, _: str = Depends(caller)) -> Response:
    with db.connect() as conn:
        if conn.execute("DELETE FROM brain_decks WHERE id = ?", (deck_id,)).rowcount == 0:
            raise HTTPException(404, "not found")
    return Response(status_code=204)


@router.post("/{deck_id}/cards", status_code=201)
def add_cards(deck_id: str, body: CardsIn, day: str = Query(..., max_length=10), _: str = Depends(caller)) -> dict:
    _day(day)
    with db.connect() as conn:
        row = _deck_row(conn, deck_id)
        _insert(conn, deck_id, body.cards)
        return _summary(conn, row, day) | {"items": _cards(conn, deck_id)}


@router.post("/{deck_id}/score")
def save_score(deck_id: str, body: ScoreIn, day: str = Query(..., max_length=10), _: str = Depends(caller)) -> dict:
    """The score of a finished quiz; only the best one is kept."""
    _day(day)
    with db.connect() as conn:
        row = _deck_row(conn, deck_id)
        if body.score > row["best_score"]:
            conn.execute("UPDATE brain_decks SET best_score = ? WHERE id = ?", (body.score, deck_id))
        return _summary(conn, _deck_row(conn, deck_id), day)
