"""Local-only same-origin connection to Raira's existing habits."""
from fastapi import APIRouter
from ...schemas.raira_habits import RairaHabitArchive, RairaHabitEdit, RairaHabitCreate, RairaHabitMark, RairaHabitsSnapshot
from ...services.raira_habits import exchange
router = APIRouter(prefix='/api/raira/habits', tags=['Raira habits'])

@router.get('', response_model=RairaHabitsSnapshot)
def snapshot():
    return exchange('read')

@router.post('/mark', response_model=RairaHabitsSnapshot)
def mark(body: RairaHabitMark):
    return exchange('mark', payload=body.model_dump(mode='json'))

@router.post('/create', response_model=RairaHabitsSnapshot)
def create(body: RairaHabitCreate):
    return exchange('create', payload=body.model_dump(mode='json'))

@router.post('/edit', response_model=RairaHabitsSnapshot)
def edit(body: RairaHabitEdit):
    return exchange('edit', payload=body.model_dump(mode='json'))

@router.post('/archive', response_model=RairaHabitsSnapshot)
def archive(body: RairaHabitArchive):
    return exchange('archive', payload=body.model_dump(mode='json'))
