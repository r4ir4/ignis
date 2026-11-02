"""Private video library; no YouTube credentials or account access required."""
import asyncio
import json
import os
import time
import httpx
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal
from uuid import UUID
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field, model_validator, field_validator

router = APIRouter(prefix='/api/watch', tags=['Watch'])
PRIVATE = Path(os.environ.get('IGNIS_WATCH_DATA', str(Path.home() / 'Library/Application Support/Ignis/watch')))
lock = asyncio.Lock()

class Comment(BaseModel):
    model_config = ConfigDict(extra='forbid')
    id: UUID
    text: str = Field(min_length=1, max_length=4000)
    createdAt: datetime

class Progress(BaseModel):
    model_config = ConfigDict(extra='forbid')
    seconds: float = Field(ge=0, le=604800, allow_inf_nan=False)
    duration: float = Field(ge=0, le=604800, allow_inf_nan=False)

class NewComment(BaseModel):
    model_config = ConfigDict(extra='forbid')
    id: UUID
    text: str = Field(min_length=1, max_length=4000)
    @field_validator('text')
    @classmethod
    def nonblank(cls, value):
        if not value.strip(): raise ValueError('Comment must not be blank')
        return value.strip()

class Preferences(BaseModel):
    model_config = ConfigDict(extra='forbid')
    rating: int = Field(default=0, ge=0, le=5, strict=True)
    favorite: bool = False
    status: Literal['queued', 'watching', 'finished'] = 'queued'

class Video(BaseModel):
    model_config = ConfigDict(extra='forbid')
    id: UUID
    videoId: str = Field(pattern=r'^[A-Za-z0-9_-]{11}$')
    title: str = Field(min_length=1, max_length=200)
    rating: int = Field(default=0, ge=0, le=5, strict=True)
    favorite: bool = False
    channel: str = Field(default='', max_length=200)
    collection: str = Field(default='', max_length=80)
    collections: list[str] = Field(default_factory=list, max_length=20)
    tags: list[str] = Field(default_factory=list, max_length=20)
    notes: str = Field(default='', max_length=10000)
    status: Literal['queued', 'watching', 'finished'] = 'queued'
    progressSeconds: float = Field(default=0, ge=0, allow_inf_nan=False)
    durationSeconds: float = Field(default=0, ge=0, allow_inf_nan=False)
    comments: list[Comment] = Field(default_factory=list, max_length=2000)
    @model_validator(mode='before')
    @classmethod
    def migrate_collection(cls, value):
        if isinstance(value, dict) and 'collections' not in value:
            value = dict(value)
            legacy = value.get('collection', '')
            value['collections'] = [legacy] if isinstance(legacy, str) and legacy.strip() else []
        return value
    @field_validator('collections')
    @classmethod
    def valid_collections(cls, values):
        if any(not value.strip() or len(value.strip()) > 80 for value in values):
            raise ValueError('Collection names must be 1 to 80 characters')
        return list(dict.fromkeys(value.strip() for value in values))
    @model_validator(mode='after')
    def legacy_collection(self):
        self.collection = self.collections[0] if self.collections else ''
        return self
    @field_validator('tags')
    @classmethod
    def valid_tags(cls, values):
        if any(not value.strip() or len(value) > 80 for value in values): raise ValueError('Tags must be 1 to 80 characters')
        return list(dict.fromkeys(value.strip() for value in values))
    @field_validator('title')
    @classmethod
    def nonblank(cls, value):
        if not value.strip(): raise ValueError('Title is required')
        return value.strip()

class WatchState(BaseModel):
    model_config = ConfigDict(extra='forbid')
    revision: int = Field(ge=0)
    videos: list[Video] = Field(default_factory=list, max_length=10000)
    @model_validator(mode='after')
    def unique(self):
        if len({v.id for v in self.videos}) != len(self.videos): raise ValueError('Duplicate ID')
        if len({v.videoId for v in self.videos}) != len(self.videos): raise ValueError('Video already saved')
        return self

def load():
    path = PRIVATE / 'records.json'
    if not path.exists(): return WatchState(revision=0)
    try: return WatchState.model_validate_json(path.read_text())
    except (ValueError, OSError): raise HTTPException(500, 'Library could not be read. Existing records were preserved.')

@router.get('', response_model=WatchState)
def read(): return load()

@router.put('', response_model=WatchState)
async def write(state: WatchState):
    async with lock:
        current = load()
        if state.revision != current.revision: raise HTTPException(409, 'Library changed in another tab. Reload the library and retry your change.')
        for video in state.videos:
            previous = next((item for item in current.videos if item.id == video.id), None)
            if previous:
                video.rating = previous.rating
                video.favorite = previous.favorite
                video.comments = previous.comments
                video.progressSeconds = previous.progressSeconds if previous.videoId == video.videoId else 0
                video.durationSeconds = previous.durationSeconds if previous.videoId == video.videoId else 0
        saved = state.model_copy(update={'revision': state.revision + 1})
        persist(saved)
        return saved


def persist(saved):
    try:
        PRIVATE.mkdir(parents=True, exist_ok=True); os.chmod(PRIVATE, 0o700)
        path = PRIVATE / 'records.json'; temp = path.with_suffix('.tmp')
        fd = os.open(temp, os.O_CREAT | os.O_TRUNC | os.O_WRONLY, 0o600)
        with os.fdopen(fd, 'w') as output:
            output.write(saved.model_dump_json()); output.flush(); os.fsync(output.fileno())
        temp.replace(path)
    except OSError: raise HTTPException(500, 'Library could not be saved. Previous records were preserved.')


@router.patch('/{record_id}/progress', response_model=WatchState)
async def progress(record_id: UUID, value: Progress):
    async with lock:
        state = load()
        video = next((video for video in state.videos if video.id == record_id), None)
        if video is None: raise HTTPException(404, 'Video not found')
        seconds = min(value.seconds, value.duration) if value.duration > 0 else value.seconds
        video.progressSeconds = round(seconds, 1)
        video.durationSeconds = round(value.duration, 1)
        if video.status == 'queued' and seconds > 0: video.status = 'watching'
        state.revision += 1; persist(state)
        return state


@router.post('/{record_id}/comments', response_model=WatchState)
async def comment(record_id: UUID, value: NewComment):
    async with lock:
        state = load()
        video = next((video for video in state.videos if video.id == record_id), None)
        if video is None: raise HTTPException(404, 'Video not found')
        existing = next((item for item in video.comments if item.id == value.id), None)
        if existing:
            if existing.text != value.text: raise HTTPException(409, 'Comment ID already used')
            return state
        if len(video.comments) >= 2000: raise HTTPException(422, 'Comment limit reached for this video')
        video.comments.append(Comment(id=value.id, text=value.text, createdAt=datetime.now(timezone.utc)))
        state.revision += 1; persist(state)
        return state



# Only a validated video ID reaches a fixed YouTube endpoint: no arbitrary URL fetches.
metadata_cache: dict[str, tuple[float, dict]] = {}

@router.get('/metadata')
async def metadata(video_id: str = Query(pattern=r'^[A-Za-z0-9_-]{11}$')):
    cached = metadata_cache.get(video_id)
    if cached and time.monotonic() - cached[0] < 3600: return cached[1]
    try:
        async with httpx.AsyncClient(timeout=8, follow_redirects=False) as client:
            response = await client.get('https://www.youtube.com/oembed', params={'url': f'https://www.youtube.com/watch?v={video_id}', 'format': 'json'})
        if response.status_code != 200:
            raise HTTPException(422, 'YouTube could not provide this video’s details. It may be private or unavailable. You can enter the title yourself.')
        details = response.json()
        title = details.get('title')
        if not isinstance(title, str) or not title.strip(): raise ValueError('Missing title')
        result = {'videoId': video_id, 'title': title.strip()[:200], 'channel': str(details.get('author_name') or '')[:200], 'thumbnail': f'https://i.ytimg.com/vi/{video_id}/hqdefault.jpg'}
    except (httpx.HTTPError, ValueError):
        raise HTTPException(502, 'Video details could not be loaded. You can enter the title yourself or try the link again.')
    if len(metadata_cache) >= 256: metadata_cache.pop(next(iter(metadata_cache)))
    metadata_cache[video_id] = (time.monotonic(), result)
    return result


@router.patch('/{record_id}/preferences', response_model=WatchState)
async def preferences(record_id: UUID, value: Preferences):
    async with lock:
        state = load()
        video = next((video for video in state.videos if video.id == record_id), None)
        if video is None: raise HTTPException(404, 'Video not found')
        for key, item in value.model_dump(exclude_unset=True).items(): setattr(video, key, item)
        state.revision += 1; persist(state)
        return state
