"""Ignis-owned habits and immutable completion audit, independent of Raira."""
from sqlalchemy import Integer, String, JSON, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column
from app.db.notebook import Base

class HabitSettings(Base):
    __tablename__ = 'ignis_habit_settings'
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    payload: Mapped[dict] = mapped_column(JSON)

class Habit(Base):
    __tablename__ = 'ignis_habits'
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=False)
    payload: Mapped[dict] = mapped_column(JSON)

class HabitCompletion(Base):
    __tablename__ = 'ignis_habit_completions'
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    habit_id: Mapped[int] = mapped_column(ForeignKey('ignis_habits.id'), index=True)
    payload: Mapped[dict] = mapped_column(JSON)
