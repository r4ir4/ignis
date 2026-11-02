"""Native medication tracking, imported metadata and immutable edit/removal audit."""
from sqlalchemy import Integer, String, JSON, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column
from app.db.notebook import Base

class MedsSettings(Base):
    __tablename__ = 'ignis_meds_settings'
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    payload: Mapped[dict] = mapped_column(JSON)

class MedsDose(Base):
    __tablename__ = 'ignis_meds_doses'
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=False)
    payload: Mapped[dict] = mapped_column(JSON)

class MedsPhase(Base):
    __tablename__ = 'ignis_meds_phases'
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=False)
    dose_id: Mapped[int] = mapped_column(ForeignKey('ignis_meds_doses.id'), index=True)
    payload: Mapped[dict] = mapped_column(JSON)

class MedsArchive(Base):
    __tablename__ = 'ignis_meds_import_archive'
    id: Mapped[str] = mapped_column(String(100), primary_key=True)
    payload: Mapped[dict] = mapped_column(JSON)

class MedsAudit(Base):
    __tablename__ = 'ignis_meds_audit'
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    payload: Mapped[dict] = mapped_column(JSON)
