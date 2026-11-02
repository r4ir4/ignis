"""Ignis-owned Vyvanse tracking under the notebook authentication boundary."""
from fastapi import APIRouter, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError
from app.db.notebook import engine
from app.services.notebook_backup import backup_daily
from app.services import meds
from ...schemas.meds import MedsIntake, MedsIntakeEdit, MedsPhase, MedsSaved, MedsSnapshot, MedsUndo
def exchange(action, **values):
    try:
        with Session(engine()) as session, session.begin():
            return meds.snapshot(session) if action == 'read' else meds.change(session, action, values['payload'])
    except SQLAlchemyError:
        raise HTTPException(503, 'Ignis medication storage is unavailable. Your records are retained; retry the same entry after reconnecting.') from None


router = APIRouter(prefix='/api/meds', tags=['Meds'])


@router.get('/vyvanse', response_model=MedsSnapshot)
def snapshot():
    return exchange('read')


@router.post('/vyvanse/intake', response_model=MedsSaved)
def intake(body: MedsIntake, tasks: BackgroundTasks):
    tasks.add_task(backup_daily)
    return exchange('intake', payload=body.model_dump(mode='json'))


@router.patch('/vyvanse/intake', response_model=MedsSaved)
def edit_intake(body: MedsIntakeEdit, tasks: BackgroundTasks):
    tasks.add_task(backup_daily)
    return exchange('edit-intake', payload=body.model_dump(mode='json'))


@router.post('/vyvanse/phase', response_model=MedsSaved)
def phase(body: MedsPhase, tasks: BackgroundTasks):
    tasks.add_task(backup_daily)
    return exchange('phase', payload=body.model_dump(mode='json'))


@router.post('/vyvanse/undo', response_model=MedsSaved)
def undo(body: MedsUndo, tasks: BackgroundTasks):
    tasks.add_task(backup_daily)
    return exchange('undo', payload=body.model_dump(mode='json'))
