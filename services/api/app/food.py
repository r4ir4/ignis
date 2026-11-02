"""Ignis-owned local food records. Versioned writes prevent stale tabs losing data."""
import asyncio
import json
import os
from datetime import date
from pathlib import Path
from uuid import UUID
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, ConfigDict, field_validator, model_validator

router = APIRouter(prefix='/api/food', tags=['Food'])
PRIVATE = Path.home() / 'Library/Application Support/Ignis/food'
lock = asyncio.Lock()

class SavedMeal(BaseModel):
    model_config = ConfigDict(extra='forbid')
    id: UUID
    name: str = Field(min_length=1, max_length=120)
    food: str = Field(min_length=1, max_length=4000)
    notes: str = Field(default='', max_length=4000)
    calories: float | None = Field(default=None, ge=0, allow_inf_nan=False)
    protein: float | None = Field(default=None, ge=0, allow_inf_nan=False)
    carbs: float | None = Field(default=None, ge=0, allow_inf_nan=False)
    fat: float | None = Field(default=None, ge=0, allow_inf_nan=False)
    @field_validator('name', 'food')
    @classmethod
    def nonblank(cls, value):
        if not value.strip(): raise ValueError('Must not be blank')
        return value.strip()

class Meal(SavedMeal):
    date: date
    time: str = Field(pattern=r'^([01]\d|2[0-3]):[0-5]\d$')

class Log(Meal):
    planId: UUID | None = None

class FoodState(BaseModel):
    model_config = ConfigDict(extra='forbid')
    revision: int = Field(ge=0)
    plans: list[Meal] = Field(default_factory=list, max_length=10000)
    logs: list[Log] = Field(default_factory=list, max_length=10000)
    savedMeals: list[SavedMeal] = Field(default_factory=list, max_length=2000)
    @model_validator(mode='after')
    def unique_ids(self):
        for collection in (self.plans, self.logs, self.savedMeals):
            if len({item.id for item in collection}) != len(collection): raise ValueError('Duplicate record ID')
        return self


def load():
    path = PRIVATE / 'records.json'
    if not path.exists(): return FoodState(revision=0)
    try: return FoodState.model_validate_json(path.read_text())
    except (ValueError, OSError):
        raise HTTPException(500, 'Food data could not be read. Existing records have been preserved.')


def persist(state):
    PRIVATE.mkdir(parents=True, exist_ok=True); os.chmod(PRIVATE, 0o700)
    path = PRIVATE / 'records.json'; temp = path.with_suffix('.tmp')
    try:
        fd = os.open(temp, os.O_CREAT | os.O_WRONLY | os.O_TRUNC, 0o600)
        with os.fdopen(fd, 'w') as output:
            output.write(state.model_dump_json()); output.flush(); os.fsync(output.fileno())
        temp.replace(path)
    except OSError: raise HTTPException(500, 'Food data could not be saved. Please retry; previous records were preserved.')

@router.get('', response_model=FoodState)
def read_food(): return load()

@router.put('', response_model=FoodState)
async def write_food(state: FoodState):
    async with lock:
        current = load()
        if state.revision != current.revision:
            raise HTTPException(409, 'Food changed in another tab. The latest records were loaded; review and retry your change.')
        saved = state.model_copy(update={'revision': current.revision + 1})
        persist(saved)
        return saved
