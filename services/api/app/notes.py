"""Archived local Markdown drafts, images and export; the web editor and publisher are retired."""
import io
import os
import re
import threading
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from uuid import UUID, uuid4
from typing import Literal

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel, ConfigDict, Field

router = APIRouter(prefix='/api/notes', tags=['Notes'])
PRIVATE = Path.home() / 'Library/Application Support/Ignis/notes'
lock = threading.Lock()
MAX_IMAGE = 8 * 1024 * 1024
IMAGE_NAME = r'[0-9a-f-]{36}\.(?:png|jpg|gif|webp)'

class DraftInput(BaseModel):
    model_config = ConfigDict(extra='forbid')
    title: str = Field(min_length=1, max_length=200)
    markdown: str = Field(max_length=1_000_000)
    revision: int = Field(ge=0)
    illustration: Literal['auto', 'woodland', 'castle', 'cats', 'botanical', 'none'] = 'auto'
    pageLayout: Literal['auto', 'classic', 'poetry', 'margin'] = 'auto'

class Draft(DraftInput):
    id: UUID
    updatedAt: str


def read_note(note_id: UUID):
    path = PRIVATE / f'{note_id}.json'
    if not path.exists():
        raise HTTPException(404, 'Note not found.')
    try:
        return Draft.model_validate_json(path.read_text())
    except (ValueError, OSError):
        raise HTTPException(500, 'This note could not be read. Its existing file has been preserved.')


def write_private(path: Path, data: bytes):
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    os.chmod(path.parent, 0o700)
    temp = path.with_name(f'.{path.name}.{uuid4()}.tmp')
    try:
        fd = os.open(temp, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
        with os.fdopen(fd, 'wb') as output:
            output.write(data)
            output.flush()
            os.fsync(output.fileno())
        temp.replace(path)
    except OSError:
        temp.unlink(missing_ok=True)
        raise HTTPException(500, 'Could not save. Previous files were preserved; please retry.')


@router.get('', response_model=list[Draft])
def list_notes():
    return sorted((read_note(UUID(p.stem)) for p in PRIVATE.glob('*.json')), key=lambda note: note.updatedAt, reverse=True)


@router.put('/{note_id}', response_model=Draft)
def save_note(note_id: UUID, value: DraftInput):
    with lock:
        current = read_note(note_id) if (PRIVATE / f'{note_id}.json').exists() else None
        if value.revision != (current.revision if current else 0):
            raise HTTPException(409, 'This note changed in another tab. Download your Markdown before reloading to compare the versions.')
        if not value.title.strip():
            raise HTTPException(422, 'Give your note a title.')
        saved = Draft(**{**value.model_dump(), 'title': value.title.strip(), 'revision': value.revision + 1}, id=note_id, updatedAt=datetime.now(timezone.utc).isoformat())
        write_private(PRIVATE / f'{note_id}.json', saved.model_dump_json().encode())
        return saved


@router.post('/images', response_model=str)
async def upload_image(request: Request):
    data = bytearray()
    async for chunk in request.stream():
        data.extend(chunk)
        if len(data) > MAX_IMAGE:
            raise HTTPException(413, 'Choose an image smaller than 8 MB.')
    # Only raster formats; reject executable SVG/HTML and ignore supplied filenames.
    if data.startswith(b'\x89PNG\r\n\x1a\n'):
        extension = 'png'
    elif data.startswith(b'\xff\xd8\xff'):
        extension = 'jpg'
    elif data[:6] in (b'GIF87a', b'GIF89a'):
        extension = 'gif'
    elif data.startswith(b'RIFF') and data[8:12] == b'WEBP':
        extension = 'webp'
    else:
        raise HTTPException(415, 'Use a PNG, JPEG, GIF or WebP image.')
    name = f'{uuid4()}.{extension}'
    write_private(PRIVATE / 'images' / name, bytes(data))
    return f'/api/notes/images/{name}'


@router.get('/images/{name}', response_class=FileResponse)
def get_image(name: str):
    if not re.fullmatch(IMAGE_NAME, name):
        raise HTTPException(404, 'Image not found.')
    path = PRIVATE / 'images' / name
    if not path.is_file():
        raise HTTPException(404, 'Image not found.')
    return FileResponse(path, headers={'X-Content-Type-Options': 'nosniff'})


@router.get('/{note_id}/export', response_class=Response)
def export_note(note_id: UUID):
    note = read_note(note_id)
    names = set(re.findall(r'/api/notes/images/(' + IMAGE_NAME + r')', note.markdown))
    markdown = note.markdown
    output = io.BytesIO()
    with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED) as archive:
        for name in names:
            path = PRIVATE / 'images' / name
            if not path.is_file():
                raise HTTPException(409, 'An image is missing. Restore it before exporting.')
            archive.write(path, f'images/{name}')
            markdown = markdown.replace(f'/api/notes/images/{name}', f'images/{name}')
        # JSON strings are also valid YAML quoted scalars.
        import json
        archive.writestr(f'{note_id}.md', '---\ntitle: ' + json.dumps(note.title, ensure_ascii=False) + '\nillustration: ' + note.illustration + '\npageLayout: ' + note.pageLayout + '\n---\n\n' + markdown)
    return Response(output.getvalue(), media_type='application/zip', headers={'Content-Disposition': f'attachment; filename="ignis-note-{note_id}.zip"'})
