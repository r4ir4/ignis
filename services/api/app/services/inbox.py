from datetime import datetime, timezone
from uuid import uuid5, NAMESPACE_URL
from sqlalchemy import select, func
from sqlalchemy.dialects.postgresql import insert
from fastapi import HTTPException
from app.models.notebook import Notification, Page


def view(item):
    return dict(id=item.id, pageId=item.page_id, kind=item.kind, title=item.title, body=item.body,
                createdAt=item.created_at, dueAt=item.due_at, readAt=item.read_at, archivedAt=item.archived_at)


def backup_alert(session, marker):
    try:
        stamp = marker.stat().st_mtime_ns
    except FileNotFoundError:
        return
    now = datetime.now(timezone.utc)
    session.execute(insert(Notification).values(id=str(uuid5(NAMESPACE_URL, f'ignis:backup:{stamp}')),
        page_id=None, kind='workspace', title='Automatic backup needs attention',
        body='Your pages remain in the database. Download a notebook backup and check the backup service.',
        created_at=now, due_at=now, read_at=None, archived_at=None).on_conflict_do_nothing())


def unread_count(session, now):
    return session.scalar(select(func.count()).select_from(Notification).where(
        Notification.due_at <= now, Notification.read_at.is_(None), Notification.archived_at.is_(None)))


def listing(session, status, kind, cursor, limit):
    now = datetime.now(timezone.utc)
    query = select(Notification).where(Notification.due_at <= now)
    if status != 'all':
        query = query.where(Notification.archived_at.is_not(None) if status == 'archived' else Notification.archived_at.is_(None))
    if status == 'unread':
        query = query.where(Notification.read_at.is_(None))
    if kind:
        query = query.where(Notification.kind == kind)
    if cursor:
        previous = session.get(Notification, str(cursor))
        if not previous:
            raise HTTPException(400, 'The notification cursor is unavailable. Refresh Inbox.')
        query = query.where((Notification.due_at < previous.due_at) | ((Notification.due_at == previous.due_at) & (Notification.id < previous.id)))
    rows = list(session.scalars(query.order_by(Notification.due_at.desc(), Notification.id.desc()).limit(limit + 1)))
    return dict(items=[view(row) for row in rows[:limit]], unreadCount=unread_count(session, now), nextCursor=rows[limit-1].id if len(rows) > limit else None)


def change(session, notification_id, patch):
    item = session.scalar(select(Notification).where(Notification.id == str(notification_id)).with_for_update())
    if not item:
        raise HTTPException(404, 'Notification not found.')
    now = datetime.now(timezone.utc)
    if patch.read is not None:
        item.read_at = (item.read_at or now) if patch.read else None
    if patch.archived is not None:
        item.archived_at = (item.archived_at or now) if patch.archived else None
    session.flush()
    return view(item)


def reminder(session, request):
    def confirmed(item):
        if item.kind != 'reminder' or item.page_id != str(request.pageId) or item.due_at != request.dueAt:
            raise HTTPException(409, 'This reminder request was already used. Start a new reminder.')
        return view(item)
    existing = session.get(Notification, str(request.requestId))
    if existing:
        return confirmed(existing)
    page = session.get(Page, str(request.pageId))
    if not page or page.payload.get('deletedAt'):
        raise HTTPException(404, 'Save or restore this page before adding a reminder.')
    now = datetime.now(timezone.utc)
    # A stable client request ID makes a retry after a lost response safe.
    session.execute(insert(Notification).values(id=str(request.requestId), page_id=str(request.pageId), kind='reminder',
        title=f"Reminder: {page.payload.get('title') or 'Untitled'}", body='A reminder you set for this page.',
        created_at=now, due_at=request.dueAt, read_at=None, archived_at=None).on_conflict_do_nothing())
    item = session.get(Notification, str(request.requestId))
    return confirmed(item)
