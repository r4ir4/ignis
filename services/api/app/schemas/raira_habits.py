from datetime import date, datetime
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, StrictInt, StrictStr, model_validator

class HabitHistory(BaseModel):
    date: date
    count: int
    checked: bool
    rest: bool

class HabitTotals(BaseModel):
    periods: int
    completed: int
    percent: int

class RairaHabit(BaseModel):
    id: int
    name: str
    section: str
    moment: str | None
    status: Literal['active', 'paused', 'archived']
    cadence: Literal['daily', 'weekly', 'monthly']
    target_count: int
    start_date: date
    period_key: date
    completed_count: int
    period_done: bool
    due: bool
    rest_day: bool
    current_streak: int
    medication_linked: bool
    history: list[HabitHistory]
    totals: HabitTotals

class RairaHabitsSnapshot(BaseModel):
    timezone: str
    owner_day: date
    fetched_at: datetime
    habits: list[RairaHabit]

class RairaHabitMark(BaseModel):
    model_config = ConfigDict(extra='forbid')
    habit_id: StrictInt = Field(gt=0, le=2147483647)
    date: date
    period_key: date
    expected_count: StrictInt = Field(ge=0, le=100000)
    desired_count: StrictInt = Field(ge=0, le=100000)

    @model_validator(mode='after')
    def one_mark(self):
        if abs(self.desired_count - self.expected_count) != 1:
            raise ValueError('Add or undo one check-in at a time.')
        return self

class RairaHabitCreate(BaseModel):
    model_config = ConfigDict(extra='forbid')
    name: StrictStr = Field(min_length=1, max_length=200)
    section: StrictStr = Field(default='Other', min_length=1, max_length=80)
    cadence: Literal['daily', 'weekly', 'monthly'] = 'daily'
    target_count: StrictInt = Field(default=1, ge=1, le=50)

    @model_validator(mode='after')
    def trimmed(self):
        self.name = self.name.strip()
        self.section = self.section.strip()
        if not self.name or not self.section:
            raise ValueError('Enter a habit name and a section.')
        return self

class RairaHabitConfig(BaseModel):
    model_config = ConfigDict(extra='forbid')
    name: StrictStr = Field(min_length=1, max_length=200)
    section: StrictStr = Field(min_length=1, max_length=80)
    cadence: Literal['daily', 'weekly', 'monthly']
    target_count: StrictInt = Field(ge=1, le=50)

class RairaHabitEdit(RairaHabitCreate):
    habit_id: StrictInt = Field(gt=0, le=2147483647)
    expected: RairaHabitConfig

class RairaHabitArchive(BaseModel):
    model_config = ConfigDict(extra='forbid')
    habit_id: StrictInt = Field(gt=0, le=2147483647)
    expected: RairaHabitConfig
