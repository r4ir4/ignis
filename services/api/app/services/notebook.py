from datetime import datetime, timezone
from sqlalchemy import select
from sqlalchemy.orm import Session
from fastapi import HTTPException
from app.models.notebook import Workspace, Page, History
from app.schemas.notebook import Snapshot


def read(session: Session):
    workspace = session.scalar(select(Workspace).where(Workspace.id == 1).with_for_update(read=True))
    return {'revision': workspace.revision if workspace else 0, 'pages': [p.payload for p in session.scalars(select(Page).order_by(Page.position))]}


def save(session: Session, incoming: Snapshot):
    workspace = session.scalar(select(Workspace).where(Workspace.id == 1).with_for_update())
    if workspace is None:
        raise HTTPException(503, 'Notebook migrations have not been applied.')
    if incoming.revision != workspace.revision:
        raise HTTPException(409, 'Another tab saved newer changes. Your browser recovery copy has been retained.')
    existing = {p.id: p for p in session.scalars(select(Page))}
    payloads = [p.model_dump(mode='json') for p in incoming.pages]
    if set(existing) - {p['id'] for p in payloads}:
        raise HTTPException(422, 'Pages cannot be removed from storage. Move them to Trash instead.')
    # New optional presentation fields must not create versions of unchanged legacy pages.
    canonical = lambda payload: {**payload, 'habits': payload.get('habits'), 'reading': ({**payload['reading'], 'books': [{**book, 'alreadyReadPages': book.get('alreadyReadPages', 0)} for book in payload['reading']['books']]} if payload.get('reading') else None), 'moods': payload.get('moods'), 'kind': payload.get('kind'), 'cover': payload.get('cover'), 'fullWidth': payload.get('fullWidth', True), 'font': payload.get('font', 'default'), 'smallText': payload.get('smallText', False), 'locked': payload.get('locked', False), 'lists': [{**entry, 'idCounter': entry.get('idCounter'), 'board': entry.get('board'), 'properties': ([{**prop, 'config': prop.get('config')} for prop in entry['properties']] if entry.get('properties') is not None else None), 'items': [{**item, 'properties': item.get('properties'), 'metadata': {**item['metadata'], 'number': item['metadata'].get('number')} if item.get('metadata') else None} for item in entry.get('items', [])]} for entry in payload.get('lists', [])]}
    protected = ('kind', 'title', 'content', 'icon', 'cover', 'fullWidth', 'font', 'smallText', 'lists', 'habits', 'reading', 'moods')
    for payload in payloads:
        previous = existing.get(payload['id'])
        if previous and previous.payload.get('locked') and payload.get('locked'):
            old = canonical(previous.payload)
            if any(old.get(key) != payload.get(key) for key in protected):
                raise HTTPException(422, 'Unlock this page before editing it. Your browser draft is retained.')
    if [canonical(p.payload) for p in sorted(existing.values(), key=lambda p: p.position)] == payloads:
        return read(session)
    workspace.revision += 1
    for position, payload in enumerate(payloads):
        record = existing.get(payload['id'])
        changed = record is None or canonical(record.payload) != payload
        if record is None:
            record = Page(id=payload['id'], position=position, payload=payload)
            session.add(record)
            session.flush()
        else:
            record.position = position
            record.payload = payload
        if changed:
            session.add(History(page_id=record.id, revision=workspace.revision, saved_at=datetime.now(timezone.utc), payload=payload))
    session.flush()
    return read(session)


def task_metadata(session: Session, page_id: str):
    """Recover first recorded creation and last task-content edit, never page-only edits."""
    page = session.get(Page, page_id)
    if page is None:
        raise HTTPException(404, 'Page unavailable.')
    current = {item['id']: item for entry in page.payload.get('lists', []) for item in entry.get('items', [])}
    result, previous = {}, {}
    keys = ('title', 'status', 'date', 'value', 'description', 'descriptionContent', 'cover', 'properties')
    for version in session.scalars(select(History).where(History.page_id == page_id).order_by(History.id)):
        stamp = version.saved_at.isoformat()
        for entry in version.payload.get('lists', []):
            for item in entry.get('items', []):
                identity = item['id']
                if identity not in current:
                    continue
                metadata = item.get('metadata') or {}
                content = {key: item.get(key) for key in keys}
                if identity not in result:
                    result[identity] = dict(createdAt=metadata.get('createdAt') or stamp, createdBy=metadata.get('createdBy'), editedAt=metadata.get('editedAt') or stamp, editedBy=metadata.get('editedBy'))
                elif previous.get(identity) != content:
                    result[identity].update(editedAt=metadata.get('editedAt') or stamp, editedBy=metadata.get('editedBy'))
                previous[identity] = content
    for identity, item in current.items():
        metadata = item.get('metadata') or {}
        recovered = result.setdefault(identity, dict(createdAt=None, createdBy=None, editedAt=None, editedBy=None))
        for key, value in metadata.items():
            if value is not None:
                recovered[key] = value
    return result
