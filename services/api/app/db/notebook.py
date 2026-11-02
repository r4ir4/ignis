"""Dedicated Ignis PostgreSQL connection. No Raira or authentication storage."""
import getpass
import os
from functools import lru_cache
from pathlib import Path
from sqlalchemy import create_engine
from sqlalchemy.engine import URL
from sqlalchemy.orm import DeclarativeBase

DATA = Path(os.environ['IGNIS_NOTEBOOK_DATA']) if os.environ.get('IGNIS_NOTEBOOK_DATA') else Path.home() / 'Library/Application Support/Ignis/notebook'

class Base(DeclarativeBase):
    pass

@lru_cache
def engine():
    url = os.environ.get('IGNIS_DATABASE_URL') or URL.create('postgresql+psycopg', username=getpass.getuser(), database='ignis_notebook', query={'host': str(DATA / 'socket'), 'port': '55437'})
    return create_engine(url, pool_pre_ping=True, connect_args={'connect_timeout': 3})
