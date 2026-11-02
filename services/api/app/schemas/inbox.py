from datetime import datetime, timedelta, timezone
from typing import Literal
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field, model_validator

class NotificationView(BaseModel):
    id: UUID
    pageId: UUID | None
    kind: Literal['reminder', 'workspace']
    title: str
    body: str
    createdAt: datetime
    dueAt: datetime
    readAt: datetime | None
    archivedAt: datetime | None

class InboxCount(BaseModel):
    unreadCount: int

class InboxView(BaseModel):
    items: list[NotificationView]
    unreadCount: int
    nextCursor: UUID | None

class NotificationChange(BaseModel):
    model_config = ConfigDict(extra='forbid')
    read: bool | None = None
    archived: bool | None = None

    @model_validator(mode='after')
    def not_empty(self):
        if self.read is None and self.archived is None:
            raise ValueError('Choose a read or archive action.')
        return self

class ReadNotifications(BaseModel):
    model_config = ConfigDict(extra='forbid')
    ids: list[UUID] = Field(min_length=1, max_length=500)

class ReminderRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')
    requestId: UUID
    pageId: UUID
    dueAt: datetime

    @model_validator(mode='after')
    def valid_time(self):
        now = datetime.now(timezone.utc)
        if self.dueAt.tzinfo is None or self.dueAt > now + timedelta(days=3650):
            raise ValueError('Choose a timezone-aware reminder time within ten years.')
        return self
