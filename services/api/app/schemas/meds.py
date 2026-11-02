from datetime import datetime, timedelta, timezone
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator


class MedsDose(BaseModel):
    id: int
    taken_at: datetime
    dose_mg: float
    owner_day: str


class MedsEvent(BaseModel):
    id: int
    dose_id: int
    event_type: Literal['onset', 'strongest', 'wearing_off']
    occurred_at: datetime


class MedsMedication(BaseModel):
    id: int
    slug: Literal['vyvanse']
    name: str
    dose_presets: list[float]


class MedsSnapshot(BaseModel):
    medication: MedsMedication
    timezone: str
    owner_day: str
    range: Literal['all']
    fetched_at: datetime
    doses: list[MedsDose]
    events: list[MedsEvent]


class MedsEntry(BaseModel):
    model_config = ConfigDict(extra='forbid')
    clientEventId: UUID

    @field_validator('taken_at', 'occurred_at', check_fields=False)
    @classmethod
    def recorded_time(cls, value):
        if value.tzinfo is None:
            raise ValueError('Include the timezone of the recorded time.')
        now = datetime.now(timezone.utc)
        if value > now + timedelta(seconds=60) or value < now - timedelta(days=7):
            raise ValueError('Choose a time within the past seven days, up to now.')
        return value


class MedsIntake(MedsEntry):
    dose_mg: float = Field(gt=0, allow_inf_nan=False, strict=True)
    taken_at: datetime


class MedsIntakeEdit(MedsIntake):
    dose_id: int = Field(gt=0, strict=True)


class MedsPhase(MedsEntry):
    dose_id: int = Field(gt=0, strict=True)
    event_type: Literal['onset', 'strongest', 'wearing_off']
    occurred_at: datetime


class MedsSaved(BaseModel):
    id: int


class MedsUndo(BaseModel):
    model_config = ConfigDict(extra='forbid')
    kind: Literal['intake', 'onset', 'strongest', 'wearing_off']
    dose_id: int = Field(gt=0, strict=True)
    expected_at: datetime
    dose_mg: float | None = Field(default=None, gt=0, allow_inf_nan=False, strict=True)

    @field_validator('expected_at')
    @classmethod
    def aware(cls, value):
        if value.tzinfo is None:
            raise ValueError('Include the timezone of the recorded time.')
        return value
