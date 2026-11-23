"""Custom check-in folders and forms: you design a form (a list of questions), put it in a folder, fill it in once a day and look at the answers as charts.

Folders live in table checkin_folders. The six original ones (meds, corpo, mente, energia, pessoas, rotina) are ordinary rows created by a one-time migration
(see _migrate_builtin below), so they can be renamed or deleted like any other. A folder's colour is no longer used by the pages; the column stays and has a default.
Forms are never deleted, only archived, so the answers already given stay readable.

A question is {id, type, text, ...}: type is one of
  choice  options: 2-10 labels; the answer is the index of the chosen label
  scale   max: 4 or 10; the answer is a whole number from 0 to max
  yesno   ask: optional follow-up prompt; the answer is {v: "sim"|"nao", text}
  text    the answer is a short string
  number  unit: optional; the answer is a number (as text)
  time    the answer is "HH:MM"
Answers are stored as JSON keyed by question id. One response per form per day (a second one is refused with 409), the day being the client's local date.

Reference copy of the module for /opt/ignis/api/app/checkin_forms.py. Register it in app/main.py: `from . import checkin_forms`,
`checkin_forms.init_tables()` in lifespan and `app.include_router(checkin_forms.folders)` and `app.include_router(checkin_forms.forms)`.
"""
import json
import re
import sqlite3
import uuid
from datetime import date, datetime, timezone
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Path, Query
from pydantic import BaseModel, Field

from . import db
from .auth import caller

folders = APIRouter(prefix="/v1/checkin-folders", tags=["checkin-forms"])
forms = APIRouter(prefix="/v1/checkin-forms", tags=["checkin-forms"])

TYPES = {"choice", "scale", "yesno", "text", "number", "time"}
_ID = re.compile(r"^[a-z0-9_]{1,24}$")
_COLOR = re.compile(r"^#[0-9a-fA-F]{6}$")
MAX_QUESTIONS = 60
MAX_JSON = 60_000


def init_tables() -> None:
    with db.connect() as conn:
        conn.execute(
            """CREATE TABLE IF NOT EXISTS checkin_folders (
                   id TEXT PRIMARY KEY, name TEXT NOT NULL, color TEXT NOT NULL, position INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL)"""
        )
        conn.execute(
            """CREATE TABLE IF NOT EXISTS checkin_forms (
                   id TEXT PRIMARY KEY, folder TEXT NOT NULL, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
                   questions TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)"""
        )
        conn.execute(
            """CREATE TABLE IF NOT EXISTS checkin_form_responses (
                   id TEXT PRIMARY KEY, form_id TEXT NOT NULL REFERENCES checkin_forms(id), day TEXT NOT NULL, answers TEXT NOT NULL,
                   created_at TEXT NOT NULL, UNIQUE (form_id, day))"""
        )
        conn.execute("CREATE TABLE IF NOT EXISTS checkin_migrations (name TEXT PRIMARY KEY, done_at TEXT NOT NULL)")
        _migrate_venvanse(conn)
        _migrate_builtin(conn)


# The Venvanse check-in used to be hard-coded (table daily_checkins). It is now an ordinary form with the fixed id "venvanse", so it can be edited like the others.
# Its question ids keep the old numbers (q46-q50), so every answer saved so far fits. The first start after the upgrade creates the form and copies the old check-ins
# (the long form's q1-q45 answers come along unchanged; the charts just ignore questions the form no longer has). daily_checkins itself is left untouched.
VENVANSE_ID = "venvanse"
VENVANSE_QUESTIONS = [
    {"id": "q46", "type": "scale", "text": "Como avalio o foco hoje?", "max": 4},
    {"id": "q47", "type": "choice", "text": "Quantas tarefas da lista eu concluí?", "options": ["Todas", "A maior parte", "Uma ou duas", "Nenhuma"]},
    {"id": "q48", "type": "choice", "text": "Eu comi antes de tomar o remédio?", "options": ["Sim", "Não"]},
    {"id": "q49", "type": "choice", "text": "Senti sono ao passar o efeito da primeira dose?", "options": ["Sim, e tive que dormir", "Sim, mas não dormi", "Não"]},
    {"id": "q50", "type": "choice", "text": "Achei suficiente para o dia?", "options": ["Sim", "Mais ou menos", "Poderia ser melhor", "Não"]},
]


def _migrate_venvanse(conn: sqlite3.Connection) -> None:
    if conn.execute("SELECT 1 FROM checkin_forms WHERE id = ?", (VENVANSE_ID,)).fetchone():
        return  # already done (or archived on purpose): never recreate it
    now = db.now_utc()
    conn.execute(
        "INSERT INTO checkin_forms (id, folder, name, description, questions, created_at, updated_at) VALUES (?, 'meds', 'Venvanse', ?, ?, ?, ?)",
        (VENVANSE_ID, "Como a dose funcionou hoje", json.dumps(VENVANSE_QUESTIONS, ensure_ascii=False), "2026-11-01T00:00:00.000000Z", now))
    if conn.execute("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'daily_checkins'").fetchone():
        conn.execute("INSERT OR IGNORE INTO checkin_form_responses (id, form_id, day, answers, created_at) "
                     "SELECT id, ?, day, answers, created_at FROM daily_checkins WHERE kind = 'venvanse'", (VENVANSE_ID,))


# The six built-in folders and the five empty placeholder files that used to be hard-coded on the Meds page, now stored like everything else.
# Runs once (recorded in checkin_migrations), so deleting any of them later is respected. The placeholders get a starter question taken from their old hint.
BUILTIN_FOLDERS = [("meds", "Meds"), ("corpo", "Corpo"), ("mente", "Mente"), ("energia", "Energia"), ("pessoas", "Pessoas"), ("rotina", "Rotina")]
BUILTIN_FORMS = [
    ("ritalina", "Ritalina", "Como a dose funcionou hoje: foco, humor, apetite, o fim do efeito",
     [{"id": "q1", "type": "scale", "text": "Como a dose funcionou hoje?", "max": 4}]),
    ("lithium", "Lithium", "Como estão seu humor e seu corpo com o lítio",
     [{"id": "q1", "type": "scale", "text": "Como estão meu humor e meu corpo hoje?", "max": 4}]),
    ("sono_energia", "Sono e energia", "Qualidade do sono e a curva de energia ao longo do dia",
     [{"id": "q1", "type": "scale", "text": "Como foi a qualidade do meu sono?", "max": 4}, {"id": "q2", "type": "scale", "text": "Como foi minha energia ao longo do dia?", "max": 4}]),
    ("doses_esquecidas", "Doses esquecidas", "Quando uma dose escapou e o que aconteceu depois",
     [{"id": "q1", "type": "yesno", "text": "Esqueci alguma dose?", "ask": "O que aconteceu depois?"}]),
    ("para_medico", "Para meu médico", "Anotações para levar à próxima consulta",
     [{"id": "q1", "type": "text", "text": "O que quero levar para a próxima consulta?"}]),
]


def _migrate_builtin(conn: sqlite3.Connection) -> None:
    if conn.execute("SELECT 1 FROM checkin_migrations WHERE name = 'builtin-folders'").fetchone():
        return
    now = db.now_utc()
    for pos, (slug, name) in enumerate(BUILTIN_FOLDERS, start=1):
        conn.execute("INSERT OR IGNORE INTO checkin_folders (id, name, color, position, created_at) VALUES (?, ?, '#ffb0bf', ?, ?)", (slug, name, pos, now))
    for n, (form_id, name, description, questions) in enumerate(BUILTIN_FORMS, start=2):
        conn.execute("INSERT OR IGNORE INTO checkin_forms (id, folder, name, description, questions, created_at, updated_at) VALUES (?, 'meds', ?, ?, ?, ?, ?)",
                     (form_id, name, description, json.dumps(questions, ensure_ascii=False), "2026-11-%02dT00:00:00.000000Z" % n, now))
    conn.execute("INSERT INTO checkin_migrations (name, done_at) VALUES ('builtin-folders', ?)", (now,))


# ---- folders ----------------------------------------------------------------------------------------------------------------------------------------------

class FolderIn(BaseModel):
    name: str = Field(min_length=1, max_length=40)
    color: str = Field(default="#ffb0bf")


def _folder_row(r) -> dict:
    return {"id": r["id"], "name": r["name"], "color": r["color"], "position": r["position"], "created_at": r["created_at"]}


def _check_color(color: str) -> str:
    if not _COLOR.match(color):
        raise HTTPException(422, "color must be like #ffb0bf")
    return color.lower()


@folders.get("")
def list_folders(_: str = Depends(caller)) -> dict:
    with db.connect() as conn:
        rows = conn.execute("SELECT * FROM checkin_folders ORDER BY position, created_at").fetchall()
    return {"items": [_folder_row(r) for r in rows]}


@folders.post("", status_code=201)
def create_folder(body: FolderIn, _: str = Depends(caller)) -> dict:
    name, color = body.name.strip(), _check_color(body.color)
    if not name:
        raise HTTPException(422, "a folder needs a name")
    new_id, now = uuid.uuid4().hex[:12], db.now_utc()
    with db.connect() as conn:
        pos = conn.execute("SELECT COALESCE(MAX(position), 0) + 1 FROM checkin_folders").fetchone()[0]
        conn.execute("INSERT INTO checkin_folders (id, name, color, position, created_at) VALUES (?, ?, ?, ?, ?)", (new_id, name, color, pos, now))
        row = conn.execute("SELECT * FROM checkin_folders WHERE id = ?", (new_id,)).fetchone()
    return _folder_row(row)


@folders.patch("/{folder_id}")
def update_folder(body: FolderIn, folder_id: str = Path(..., max_length=24), _: str = Depends(caller)) -> dict:
    name, color = body.name.strip(), _check_color(body.color)
    if not name:
        raise HTTPException(422, "a folder needs a name")
    with db.connect() as conn:
        if not conn.execute("UPDATE checkin_folders SET name = ?, color = ? WHERE id = ?", (name, color, folder_id)).rowcount:
            raise HTTPException(404, "no such folder")
        row = conn.execute("SELECT * FROM checkin_folders WHERE id = ?", (folder_id,)).fetchone()
    return _folder_row(row)


@folders.delete("/{folder_id}", status_code=204)
def delete_folder(folder_id: str = Path(..., max_length=24), _: str = Depends(caller)) -> None:
    with db.connect() as conn:
        if conn.execute("SELECT 1 FROM checkin_forms WHERE folder = ? AND archived = 0 LIMIT 1", (folder_id,)).fetchone():
            raise HTTPException(409, "the folder still has forms; remove them first")
        if not conn.execute("DELETE FROM checkin_folders WHERE id = ?", (folder_id,)).rowcount:
            raise HTTPException(404, "no such folder")


# ---- forms ------------------------------------------------------------------------------------------------------------------------------------------------

class FormIn(BaseModel):
    folder: str = Field(min_length=1, max_length=24)
    name: str = Field(min_length=1, max_length=60)
    description: str = Field(default="", max_length=300)
    questions: list[dict[str, Any]]


def _clean_questions(raw: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if not raw or len(raw) > MAX_QUESTIONS:
        raise HTTPException(422, "a form needs between 1 and %d questions" % MAX_QUESTIONS)
    out, seen = [], set()
    for q in raw:
        qid, qtype = str(q.get("id", "")), q.get("type")
        text = str(q.get("text", "")).strip()
        if not _ID.match(qid) or qid in seen:
            raise HTTPException(422, "every question needs its own id")
        if qtype not in TYPES:
            raise HTTPException(422, "unknown question type")
        if not text or len(text) > 200:
            raise HTTPException(422, "every question needs a text of up to 200 characters")
        seen.add(qid)
        item: dict[str, Any] = {"id": qid, "type": qtype, "text": text}
        if qtype == "choice":
            opts = [str(o).strip() for o in (q.get("options") or []) if str(o).strip()]
            if not 2 <= len(opts) <= 10 or any(len(o) > 60 for o in opts):
                raise HTTPException(422, "a choice question needs 2 to 10 options of up to 60 characters")
            item["options"] = opts
        elif qtype == "scale":
            mx = q.get("max", 4)
            if mx not in (4, 10):
                raise HTTPException(422, "a scale goes up to 4 or 10")
            item["max"] = mx
        elif qtype == "yesno":
            ask = str(q.get("ask", "")).strip()[:60]
            if ask:
                item["ask"] = ask
        elif qtype == "number":
            unit = str(q.get("unit", "")).strip()[:12]
            if unit:
                item["unit"] = unit
        out.append(item)
    return out


def _form_row(r, with_questions: bool = True) -> dict:
    out = {"id": r["id"], "folder": r["folder"], "name": r["name"], "description": r["description"], "created_at": r["created_at"], "updated_at": r["updated_at"]}
    if with_questions:
        out["questions"] = json.loads(r["questions"])
    return out


def _check_folder(conn: sqlite3.Connection, folder: str) -> None:
    if not conn.execute("SELECT 1 FROM checkin_folders WHERE id = ?", (folder,)).fetchone():
        raise HTTPException(422, "unknown folder")


@forms.get("")
def list_forms(folder: Optional[str] = Query(None, max_length=24), _: str = Depends(caller)) -> dict:
    sql = ("SELECT f.*, (SELECT COUNT(*) FROM checkin_form_responses r WHERE r.form_id = f.id) AS n, "
           "(SELECT MAX(day) FROM checkin_form_responses r WHERE r.form_id = f.id) AS last_day FROM checkin_forms f WHERE f.archived = 0")
    args: tuple = ()
    if folder:
        sql, args = sql + " AND f.folder = ?", (folder,)
    with db.connect() as conn:
        rows = conn.execute(sql + " ORDER BY f.created_at", args).fetchall()
    items = []
    for r in rows:
        d = _form_row(r, with_questions=False)
        d.update({"question_count": len(json.loads(r["questions"])), "responses": r["n"], "last_day": r["last_day"]})
        items.append(d)
    return {"items": items}


@forms.post("", status_code=201)
def create_form(body: FormIn, _: str = Depends(caller)) -> dict:
    questions = _clean_questions(body.questions)
    blob = json.dumps(questions, ensure_ascii=False)
    if len(blob) > MAX_JSON:
        raise HTTPException(413, "the form is too large")
    new_id, now = uuid.uuid4().hex[:12], db.now_utc()
    with db.connect() as conn:
        _check_folder(conn, body.folder)
        conn.execute("INSERT INTO checkin_forms (id, folder, name, description, questions, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                     (new_id, body.folder, body.name.strip(), body.description.strip(), blob, now, now))
        row = conn.execute("SELECT * FROM checkin_forms WHERE id = ?", (new_id,)).fetchone()
    return _form_row(row)


def _get_form(conn: sqlite3.Connection, form_id: str):
    row = conn.execute("SELECT * FROM checkin_forms WHERE id = ? AND archived = 0", (form_id,)).fetchone()
    if not row:
        raise HTTPException(404, "no such form")
    return row


@forms.get("/{form_id}")
def get_form(form_id: str = Path(..., max_length=24), _: str = Depends(caller)) -> dict:
    with db.connect() as conn:
        return _form_row(_get_form(conn, form_id))


@forms.put("/{form_id}")
def update_form(body: FormIn, form_id: str = Path(..., max_length=24), _: str = Depends(caller)) -> dict:
    questions = _clean_questions(body.questions)
    blob = json.dumps(questions, ensure_ascii=False)
    if len(blob) > MAX_JSON:
        raise HTTPException(413, "the form is too large")
    with db.connect() as conn:
        _get_form(conn, form_id)
        _check_folder(conn, body.folder)
        conn.execute("UPDATE checkin_forms SET folder = ?, name = ?, description = ?, questions = ?, updated_at = ? WHERE id = ?",
                     (body.folder, body.name.strip(), body.description.strip(), blob, db.now_utc(), form_id))
        row = conn.execute("SELECT * FROM checkin_forms WHERE id = ?", (form_id,)).fetchone()
    return _form_row(row)


@forms.delete("/{form_id}", status_code=204)
def archive_form(form_id: str = Path(..., max_length=24), _: str = Depends(caller)) -> None:
    """Hides the form; its answers stay in the database."""
    with db.connect() as conn:
        _get_form(conn, form_id)
        conn.execute("UPDATE checkin_forms SET archived = 1, updated_at = ? WHERE id = ?", (db.now_utc(), form_id))


# ---- responses --------------------------------------------------------------------------------------------------------------------------------------------

class ResponseIn(BaseModel):
    day: str = Field(max_length=10)
    answers: dict[str, Any]


def _clean_answer(q: dict[str, Any], value: Any) -> Any:
    t = q["type"]
    if t == "choice":
        if isinstance(value, bool) or not isinstance(value, int) or not 0 <= value < len(q["options"]):
            raise HTTPException(422, "invalid choice for " + q["id"])
        return value
    if t == "scale":
        if isinstance(value, bool) or not isinstance(value, int) or not 0 <= value <= q["max"]:
            raise HTTPException(422, "invalid scale value for " + q["id"])
        return value
    if t == "yesno":
        if not isinstance(value, dict) or value.get("v") not in ("sim", "nao"):
            raise HTTPException(422, "invalid yes/no for " + q["id"])
        return {"v": value["v"], "text": str(value.get("text", ""))[:200] if value["v"] == "sim" else ""}
    if t == "time":
        if not isinstance(value, str) or not re.match(r"^([01]\d|2[0-3]):[0-5]\d$", value):
            raise HTTPException(422, "invalid time for " + q["id"])
        return value
    if t == "number":
        try:
            number = float(str(value).replace(",", "."))
        except ValueError:
            raise HTTPException(422, "invalid number for " + q["id"])
        if number != number or abs(number) > 1e9:
            raise HTTPException(422, "invalid number for " + q["id"])
        return number
    text = str(value).strip()
    if len(text) > 500:
        raise HTTPException(422, "an answer is too long")
    return text


def _check_day(value: str) -> str:
    try:
        d = date.fromisoformat(value)
    except ValueError:
        raise HTTPException(422, "day must be YYYY-MM-DD")
    if abs((d - datetime.now(timezone.utc).date()).days) > 1:
        raise HTTPException(422, "a form can only be filled in for today")
    return value


@forms.get("/{form_id}/responses")
def list_responses(form_id: str = Path(..., max_length=24), limit: int = Query(400, ge=1, le=1000), _: str = Depends(caller)) -> dict:
    with db.connect() as conn:
        _get_form(conn, form_id)
        rows = conn.execute("SELECT day, answers, created_at FROM checkin_form_responses WHERE form_id = ? ORDER BY day DESC LIMIT ?", (form_id, limit)).fetchall()
    return {"items": [{"day": r["day"], "answers": json.loads(r["answers"]), "created_at": r["created_at"]} for r in reversed(rows)]}


@forms.post("/{form_id}/responses", status_code=201)
def submit_response(body: ResponseIn, form_id: str = Path(..., max_length=24), _: str = Depends(caller)) -> dict:
    day = _check_day(body.day)
    with db.connect() as conn:
        form = _get_form(conn, form_id)
        by_id = {q["id"]: q for q in json.loads(form["questions"])}
        answers = {}
        for key, value in body.answers.items():
            if key not in by_id:
                raise HTTPException(422, "unknown question " + key[:24])
            answers[key] = _clean_answer(by_id[key], value)
        if not answers:
            raise HTTPException(422, "nothing was answered")
        new_id, now = uuid.uuid4().hex, db.now_utc()
        try:
            conn.execute("INSERT INTO checkin_form_responses (id, form_id, day, answers, created_at) VALUES (?, ?, ?, ?, ?)",
                         (new_id, form_id, day, json.dumps(answers, ensure_ascii=False), now))
        except sqlite3.IntegrityError:
            raise HTTPException(409, "today's response was already submitted")
    return {"id": new_id, "day": day, "answers": answers, "created_at": now}


@forms.get("/{form_id}/responses/{day}")
def get_response(form_id: str = Path(..., max_length=24), day: str = Path(..., max_length=10), _: str = Depends(caller)) -> dict:
    try:
        date.fromisoformat(day)
    except ValueError:
        raise HTTPException(422, "day must be YYYY-MM-DD")
    with db.connect() as conn:
        row = conn.execute("SELECT id, day, answers, created_at FROM checkin_form_responses WHERE form_id = ? AND day = ?", (form_id, day)).fetchone()
    if not row:
        raise HTTPException(404, "no response for that day")
    return {"id": row["id"], "day": row["day"], "answers": json.loads(row["answers"]), "created_at": row["created_at"]}
