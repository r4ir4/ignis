from datetime import datetime, timezone
from typing import Literal
from uuid import UUID
from fastapi import APIRouter, HTTPException, BackgroundTasks, Query, Request
from fastapi.responses import Response
from starlette.concurrency import run_in_threadpool
from sqlalchemy import select, update
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session
from app.db.notebook import engine, DATA
from app.models.notebook import History, Notification, CoverImage
from app.schemas.notebook import Snapshot, SnapshotStatus, CoverUpload, ItemMetadata
from app.schemas.inbox import InboxCount, InboxView, NotificationView, NotificationChange, ReadNotifications, ReminderRequest
from app.services import notebook, inbox, cover_images
from app.services.notebook_backup import backup_daily

router = APIRouter(prefix='/api/notebook', tags=['Notebook'])

def unavailable():
    return HTTPException(503, 'Notebook database is unavailable. Your browser recovery copy is retained; start the local PostgreSQL database and retry.')

@router.get('', response_model=SnapshotStatus)
def get_notebook():
    try:
        with Session(engine()) as session:
            value = notebook.read(session)
            backup_error = DATA / 'backups/backup-error.txt'
            return {**value, 'backupWarning': 'The automatic database backup needs attention. Download a browser backup and check the local backup script.' if backup_error.exists() else None}
    except SQLAlchemyError:
        raise unavailable()

@router.put('', response_model=Snapshot)
def put_notebook(value: Snapshot, tasks: BackgroundTasks):
    try:
        with Session(engine()) as session, session.begin():
            confirmed = notebook.save(session, value)
        tasks.add_task(backup_daily)
        return confirmed
    except SQLAlchemyError:
        raise unavailable()

@router.get('/pages/{page_id}/task-metadata', response_model=dict[str, ItemMetadata])
def get_task_metadata(page_id: UUID):
    try:
        with Session(engine()) as session:
            return notebook.task_metadata(session, str(page_id))
    except SQLAlchemyError:
        raise unavailable()

@router.get('/pages/{page_id}/history')
def history(page_id: UUID):
    try:
        with Session(engine()) as session:
            items = session.scalars(select(History).where(History.page_id == str(page_id)).order_by(History.id.desc()).limit(50))
            return [{'revision': h.revision, 'savedAt': h.saved_at.isoformat(), 'page': h.payload} for h in items]
    except SQLAlchemyError:
        raise unavailable()

# These routes inherit the same owner/session and same-origin boundary as pages.
@router.get('/inbox', response_model=InboxView)
def get_inbox(status: Literal['inbox', 'unread', 'archived', 'all'] = 'inbox', kind: Literal['reminder', 'workspace'] | None = None, cursor: UUID | None = None, limit: int = Query(default=50, ge=1, le=100)):
    try:
        with Session(engine()) as session, session.begin():
            inbox.backup_alert(session, DATA / 'backups/backup-error.txt')
            return inbox.listing(session, status, kind, cursor, limit)
    except (SQLAlchemyError, OSError):
        raise HTTPException(503, 'Inbox is unavailable. Your notifications have not been cleared; retry shortly.')

@router.patch('/inbox/{notification_id}', response_model=NotificationView)
def update_notification(notification_id: UUID, value: NotificationChange):
    try:
        with Session(engine()) as session, session.begin():
            return inbox.change(session, notification_id, value)
    except SQLAlchemyError:
        raise HTTPException(503, 'Inbox is unavailable. Your notifications have not been cleared; retry shortly.')

@router.post('/inbox/read', response_model=InboxCount)
def read_notifications(value: ReadNotifications):
    try:
        with Session(engine()) as session, session.begin():
            now = datetime.now(timezone.utc)
            session.execute(update(Notification).where(Notification.id.in_([str(i) for i in value.ids]), Notification.due_at <= now, Notification.read_at.is_(None)).values(read_at=now))
            return {'unreadCount': inbox.unread_count(session, now)}
    except SQLAlchemyError:
        raise HTTPException(503, 'Inbox is unavailable. Your notifications have not been cleared; retry shortly.')

@router.post('/reminders', response_model=NotificationView)
def create_reminder(value: ReminderRequest):
    try:
        with Session(engine()) as session, session.begin():
            return inbox.reminder(session, value)
    except SQLAlchemyError:
        raise HTTPException(503, 'Inbox is unavailable. Your notifications have not been cleared; retry shortly.')

@router.get('/reminders', response_model=list[NotificationView])
def upcoming_reminders(pageId: UUID):
    try:
        with Session(engine()) as session:
            rows = session.scalars(select(Notification).where(Notification.page_id == str(pageId), Notification.kind == 'reminder', Notification.due_at > datetime.now(timezone.utc), Notification.archived_at.is_(None)).order_by(Notification.due_at).limit(100))
            return [inbox.view(row) for row in rows]
    except SQLAlchemyError:
        raise HTTPException(503, 'Inbox is unavailable. Your notifications have not been cleared; retry shortly.')


@router.post('/cover-images', response_model=CoverUpload, openapi_extra={'requestBody': {'required': True, 'content': {'application/octet-stream': {'schema': {'type': 'string', 'format': 'binary'}}}}})
async def upload_cover(request: Request, tasks: BackgroundTasks):
    data = bytearray()
    async for chunk in request.stream():
        if len(data) + len(chunk) > cover_images.MAX_BYTES:
            raise HTTPException(413, 'Choose an image smaller than 8 MB.')
        data.extend(chunk)
    normalized = await run_in_threadpool(cover_images.normalize, bytes(data))
    def persist():
        with Session(engine()) as session, session.begin():
            return cover_images.save(session, normalized)
    try:
        url = await run_in_threadpool(persist)
    except SQLAlchemyError:
        raise HTTPException(503, 'The image could not be saved. Your current cover is unchanged; retry shortly.')
    tasks.add_task(backup_daily)
    return {'url': url}

@router.get('/cover-images/{name}', response_class=Response, responses={200: {'content': {'image/webp': {}}}})
def get_cover_image(name: str):
    import re
    if not re.fullmatch(r'[a-f0-9]{64}\.webp', name):
        raise HTTPException(404, 'Cover image not found.')
    try:
        with Session(engine()) as session:
            image = session.get(CoverImage, name[:-5])
            if image is None:
                raise HTTPException(404, 'Cover image not found.')
            return Response(image.data, media_type='image/webp', headers={'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, no-store'})
    except SQLAlchemyError:
        raise HTTPException(503, 'Cover image is temporarily unavailable.')

@router.post('/attachments', response_model=CoverUpload, openapi_extra={'requestBody': {'required': True, 'content': {'application/octet-stream': {'schema': {'type': 'string', 'format': 'binary'}}}}})
async def upload_attachment(request: Request, tasks: BackgroundTasks, filename: str = Query(min_length=1, max_length=200)):
    import hashlib
    import re
    from urllib.parse import quote
    from sqlalchemy.dialects.postgresql import insert
    from app.models.notebook import Attachment
    if re.search(r'[\x00-\x1f\x7f/\\]', filename) or not filename.strip():
        raise HTTPException(422, 'Use a valid file name.')
    data = bytearray()
    async for chunk in request.stream():
        if len(data) + len(chunk) > 8 * 1024 * 1024:
            raise HTTPException(413, 'Choose a file smaller than 8 MB.')
        data.extend(chunk)
    key = hashlib.sha256(data).hexdigest()
    def persist():
        with Session(engine()) as session, session.begin():
            session.execute(insert(Attachment).values(id=key, data=bytes(data)).on_conflict_do_nothing(index_elements=['id']))
    try:
        await run_in_threadpool(persist)
    except SQLAlchemyError:
        raise HTTPException(503, 'The file could not be saved. Please retry.')
    tasks.add_task(backup_daily)
    return {'url': f'/api/notebook/attachments/{key}/{quote(filename, safe="-_.")}'}

@router.get('/attachments/{key}/{filename}', response_class=Response)
def get_attachment(key: str, filename: str):
    import re
    from urllib.parse import quote
    from app.models.notebook import Attachment
    if not re.fullmatch(r'[a-f0-9]{64}', key) or len(filename) > 200 or re.search(r'[\x00-\x1f\x7f/\\]', filename):
        raise HTTPException(404, 'File not found.')
    try:
        with Session(engine()) as session:
            asset = session.get(Attachment, key)
            if asset is None:
                raise HTTPException(404, 'File not found.')
            # All attachments are downloads, including HTML/SVG; never execute uploaded content.
            return Response(asset.data, media_type='application/octet-stream', headers={'Content-Disposition': f"attachment; filename*=UTF-8''{quote(filename, safe='-_.')}", 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox", 'Cache-Control': 'private, no-store'})
    except SQLAlchemyError:
        raise HTTPException(503, 'File temporarily unavailable.')


@router.get('/attachments/{key}/{filename}/preview', response_class=Response, responses={200: {'content': {'image/webp': {}}}})
def preview_attachment(key: str, filename: str):
    # Reuse bounded raster decoding; original attachments remain downloads, including SVG/HTML.
    original = get_attachment(key, filename)
    normalized = cover_images.normalize(original.body, size=1280)
    return Response(normalized, media_type='image/webp', headers={'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, max-age=300'})
