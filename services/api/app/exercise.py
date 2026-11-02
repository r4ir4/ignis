"""Ignis-owned local exercise records. Versioned writes prevent stale tabs losing data."""
import asyncio
import json
import os
from datetime import date
from pathlib import Path
from uuid import UUID
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, ConfigDict, field_validator, model_validator

router = APIRouter(prefix='/api/exercise', tags=['Exercise'])
PRIVATE = Path.home() / 'Library/Application Support/Ignis/exercise'
lock = asyncio.Lock()

class ExerciseDetail(BaseModel):
    model_config = ConfigDict(extra='forbid')
    id: UUID
    name: str = Field(min_length=1, max_length=120)
    sets: int | None = Field(default=None, ge=1)
    reps: int | None = Field(default=None, ge=1)
    weightKg: float | None = Field(default=None, ge=0, allow_inf_nan=False)
    @field_validator('name')
    @classmethod
    def nonblank(cls, value):
        if not value.strip(): raise ValueError('Exercise name must not be blank')
        return value.strip()

class SavedWorkout(BaseModel):
    model_config = ConfigDict(extra='forbid')
    id: UUID
    name: str = Field(min_length=1, max_length=120)
    activity: str = Field(min_length=1, max_length=4000)
    notes: str = Field(default='', max_length=4000)
    durationMinutes: float | None = Field(default=None, ge=0, allow_inf_nan=False)
    distanceKm: float | None = Field(default=None, ge=0, allow_inf_nan=False)
    exercises: list[ExerciseDetail] = Field(default_factory=list, max_length=100)
    @model_validator(mode='after')
    def unique_exercises(self):
        if len({item.id for item in self.exercises}) != len(self.exercises): raise ValueError('Duplicate exercise ID')
        return self
    @field_validator('name', 'activity')
    @classmethod
    def nonblank(cls, value):
        if not value.strip(): raise ValueError('Must not be blank')
        return value.strip()

class Workout(SavedWorkout):
    date: date
    time: str = Field(pattern=r'^([01]\d|2[0-3]):[0-5]\d$')

class Log(Workout):
    planId: UUID | None = None

class ExerciseState(BaseModel):
    model_config = ConfigDict(extra='forbid')
    revision: int = Field(ge=0)
    plans: list[Workout] = Field(default_factory=list, max_length=10000)
    logs: list[Log] = Field(default_factory=list, max_length=10000)
    savedWorkouts: list[SavedWorkout] = Field(default_factory=list, max_length=2000)
    @model_validator(mode='after')
    def unique_ids(self):
        for collection in (self.plans, self.logs, self.savedWorkouts):
            if len({item.id for item in collection}) != len(collection): raise ValueError('Duplicate record ID')
        return self


def load():
    path = PRIVATE / 'records.json'
    if not path.exists(): return ExerciseState(revision=0)
    try: return ExerciseState.model_validate_json(path.read_text())
    except (ValueError, OSError):
        raise HTTPException(500, 'Exercise data could not be read. Existing records have been preserved.')


def persist(state):
    PRIVATE.mkdir(parents=True, exist_ok=True); os.chmod(PRIVATE, 0o700)
    path = PRIVATE / 'records.json'; temp = path.with_suffix('.tmp')
    try:
        fd = os.open(temp, os.O_CREAT | os.O_WRONLY | os.O_TRUNC, 0o600)
        with os.fdopen(fd, 'w') as output:
            output.write(state.model_dump_json()); output.flush(); os.fsync(output.fileno())
        temp.replace(path)
    except OSError: raise HTTPException(500, 'Exercise data could not be saved. Please retry; previous records were preserved.')

@router.get('', response_model=ExerciseState)
def read_exercise(): return load()

@router.put('', response_model=ExerciseState)
async def write_exercise(state: ExerciseState):
    async with lock:
        current = load()
        if state.revision != current.revision:
            raise HTTPException(409, 'Exercise changed in another tab. The latest records were loaded; review and retry your change.')
        saved = state.model_copy(update={'revision': current.revision + 1})
        persist(saved)
        return saved
