from alembic import context
from app.db.notebook import engine, Base
from app.models import notebook, habits, meds
with engine().connect() as connection:
    context.configure(connection=connection, target_metadata=Base.metadata)
    with context.begin_transaction():
        context.run_migrations()
