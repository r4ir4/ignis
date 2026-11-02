from datetime import datetime
from sqlalchemy import Integer, String, DateTime, ForeignKey, JSON, LargeBinary
from sqlalchemy.orm import Mapped, mapped_column
from app.db.notebook import Base

class Workspace(Base):
    __tablename__ = 'notebook_workspaces'
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    revision: Mapped[int] = mapped_column(Integer, default=0)

class Page(Base):
    __tablename__ = 'notebook_pages'
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    position: Mapped[int] = mapped_column(Integer)
    payload: Mapped[dict] = mapped_column(JSON)

class History(Base):
    __tablename__ = 'notebook_history'
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    page_id: Mapped[str] = mapped_column(ForeignKey('notebook_pages.id'), index=True)
    revision: Mapped[int] = mapped_column(Integer)
    saved_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    payload: Mapped[dict] = mapped_column(JSON)

class Notification(Base):
    __tablename__ = 'notebook_notifications'
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    page_id: Mapped[str | None] = mapped_column(ForeignKey('notebook_pages.id'))
    kind: Mapped[str] = mapped_column(String(20))
    title: Mapped[str] = mapped_column(String(600))
    body: Mapped[str] = mapped_column(String(2000))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    due_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

class CoverImage(Base):
    __tablename__ = 'notebook_cover_images'
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    data: Mapped[bytes] = mapped_column(LargeBinary)

class Attachment(Base):
    __tablename__ = 'notebook_attachments'
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    data: Mapped[bytes] = mapped_column(LargeBinary)
