"""Ignis-owned habits. Uses the notebook's existing local/owner auth boundary."""
from fastapi import APIRouter, BackgroundTasks, HTTPException
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session
from app.db.notebook import engine
from app.services import habits
from app.services.notebook_backup import backup_daily
from app.schemas.raira_habits import RairaHabitsSnapshot, RairaHabitMark, RairaHabitCreate, RairaHabitEdit, RairaHabitArchive
router = APIRouter(prefix='/api/habits', tags=['Habits'])

def perform(action=None, body=None):
    try:
        with Session(engine()) as session, session.begin():
            return habits.change(session, action, body) if action else habits.snapshot(session)
    except SQLAlchemyError:
        raise HTTPException(503, 'Ignis habit storage is unavailable. Your saved check-ins are retained; retry shortly.') from None

@router.get('', response_model=RairaHabitsSnapshot)
def snapshot(): return perform()

@router.post('/mark', response_model=RairaHabitsSnapshot)
def mark(body: RairaHabitMark, tasks: BackgroundTasks):
    result = perform('mark', body.model_dump(mode='json')); tasks.add_task(backup_daily); return result

@router.post('/create', response_model=RairaHabitsSnapshot)
def create(body: RairaHabitCreate, tasks: BackgroundTasks):
    result = perform('create', body.model_dump(mode='json')); tasks.add_task(backup_daily); return result

@router.post('/edit', response_model=RairaHabitsSnapshot)
def edit(body: RairaHabitEdit, tasks: BackgroundTasks):
    result = perform('edit', body.model_dump(mode='json')); tasks.add_task(backup_daily); return result

@router.post('/archive', response_model=RairaHabitsSnapshot)
def archive(body: RairaHabitArchive, tasks: BackgroundTasks):
    result = perform('archive', body.model_dump(mode='json')); tasks.add_task(backup_daily); return result
