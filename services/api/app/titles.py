"""Films and series for Watch: TMDB search, and the titles saved from it with your own status, rating and episode progress.

Saved titles live in `titles.json` beside `records.json` and carry everything they draw (poster, year, runtime, where to stream),
so the page still renders when the TMDB key is missing or the API is down; only searching and adding need TMDB.
"""
import asyncio
import os
import uuid
from datetime import datetime, timezone
from typing import Literal

import httpx
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field

from .watch import PRIVATE, persist_file

router = APIRouter(prefix='/api/watch/titles', tags=['Watch titles'])
lock = asyncio.Lock()
TMDB_KEY = os.environ.get('TMDB_API_KEY', '')
TMDB_BASE = os.environ.get('TMDB_API_BASE', 'https://api.themoviedb.org/3')
TMDB_IMAGE = os.environ.get('TMDB_IMAGE_BASE', 'https://image.tmdb.org/t/p/w342')
TMDB_REGION = os.environ.get('TMDB_REGION', 'BR')
TMDB_LANGUAGE = os.environ.get('TMDB_LANGUAGE', 'pt-BR')
FILE = 'titles.json'


class Episode(BaseModel):
    model_config = ConfigDict(extra='forbid')
    season: int = Field(ge=0, le=1000)
    episode: int = Field(ge=0, le=100000)
    watchedAt: datetime
    runtime: int | None = Field(default=None, ge=0, le=10000)


class Title(BaseModel):
    model_config = ConfigDict(extra='forbid')
    id: uuid.UUID
    mediaType: Literal['movie', 'tv']
    tmdbId: int = Field(ge=1)
    title: str = Field(min_length=1, max_length=500)
    releaseDate: str = Field(default='', max_length=10)
    overview: str = Field(default='', max_length=4000)
    posterUrl: str = Field(default='', max_length=500)
    voteAverage: float | None = None
    status: Literal['watchlist', 'watching', 'finished'] = 'watchlist'
    rating: int = Field(default=0, ge=0, le=10, strict=True)
    favorite: bool = False
    watchedAt: datetime | None = None
    addedAt: datetime
    runtimeMinutes: int | None = None
    genres: list[str] = Field(default_factory=list, max_length=20)
    providers: list[str] = Field(default_factory=list, max_length=40)
    providersAt: datetime | None = None
    episodeTotal: int | None = None
    episodes: list[Episode] = Field(default_factory=list, max_length=20000)


class TitleState(BaseModel):
    model_config = ConfigDict(extra='forbid')
    titles: list[Title] = Field(default_factory=list, max_length=20000)


class NewTitle(BaseModel):
    model_config = ConfigDict(extra='forbid')
    mediaType: Literal['movie', 'tv']
    tmdbId: int = Field(ge=1)
    status: Literal['watchlist', 'watching', 'finished'] = 'watchlist'


class TitleChange(BaseModel):
    model_config = ConfigDict(extra='forbid')
    status: Literal['watchlist', 'watching', 'finished'] | None = None
    rating: int | None = Field(default=None, ge=0, le=10, strict=True)
    favorite: bool | None = None


class EpisodeChange(BaseModel):
    model_config = ConfigDict(extra='forbid')
    season: int = Field(ge=0, le=1000)
    episode: int = Field(ge=0, le=100000)
    watched: bool = True
    runtime: int | None = Field(default=None, ge=0, le=10000)


class SeasonChange(BaseModel):
    model_config = ConfigDict(extra='forbid')
    watched: bool = True


def now() -> datetime:
    return datetime.now(timezone.utc)


def load() -> TitleState:
    path = PRIVATE / FILE
    if not path.exists():
        return TitleState()
    try:
        return TitleState.model_validate_json(path.read_text())
    except (ValueError, OSError):
        raise HTTPException(500, 'Titles could not be read. Existing records were preserved.')


def save(state: TitleState) -> None:
    persist_file(FILE, state.model_dump_json())


def find(state: TitleState, title_id: uuid.UUID) -> Title:
    title = next((item for item in state.titles if item.id == title_id), None)
    if title is None:
        raise HTTPException(404, 'Title not found')
    return title


async def tmdb(path: str, **params):
    if not TMDB_KEY:
        raise HTTPException(503, 'TMDB is not configured on this server.')
    try:
        async with httpx.AsyncClient(timeout=12, follow_redirects=False) as client:
            response = await client.get(f'{TMDB_BASE}{path}', params={'api_key': TMDB_KEY, 'language': TMDB_LANGUAGE, **params}, headers={'Accept': 'application/json'})
    except httpx.HTTPError:
        raise HTTPException(502, 'TMDB could not be reached. Try again in a moment.')
    if response.status_code == 401:
        raise HTTPException(502, 'TMDB rejected the API key.')
    if response.status_code == 404:
        raise HTTPException(404, 'TMDB does not have that title.')
    if response.status_code != 200:
        raise HTTPException(502, 'TMDB could not answer right now.')
    return response.json()


def text(value, limit) -> str:
    return str(value or '').strip()[:limit]


def card(raw: dict, media_type: str) -> dict:
    poster = text(raw.get('poster_path'), 300)
    date = text(raw.get('release_date') if media_type == 'movie' else raw.get('first_air_date'), 10)
    return {
        'mediaType': media_type, 'tmdbId': raw.get('id'),
        'title': text(raw.get('title') if media_type == 'movie' else raw.get('name'), 500),
        'releaseDate': date, 'overview': text(raw.get('overview'), 4000),
        'posterUrl': f'{TMDB_IMAGE}{poster}' if poster else '',
        'voteAverage': round(float(raw.get('vote_average') or 0), 1) or None,
    }


def stream_names(raw: dict) -> list[str]:
    region = ((raw.get('watch/providers') or {}).get('results') or {}).get(TMDB_REGION) or {}
    return list(dict.fromkeys(text(p.get('provider_name'), 80) for p in region.get('flatrate') or [] if p.get('provider_name')))[:40]


def fill(title: Title, raw: dict) -> None:
    """Copy what TMDB says about a title onto it; your own status, rating and progress are never touched."""
    base = card(raw, title.mediaType)
    title.title = base['title'] or title.title
    title.releaseDate, title.overview, title.voteAverage = base['releaseDate'], base['overview'], base['voteAverage']
    title.posterUrl = base['posterUrl'] or title.posterUrl
    title.genres = [text(g.get('name'), 60) for g in raw.get('genres') or [] if g.get('name')][:20]
    if title.mediaType == 'movie':
        title.runtimeMinutes = raw.get('runtime') or None
    else:
        runtimes = raw.get('episode_run_time') or []
        title.runtimeMinutes = runtimes[0] if runtimes else title.runtimeMinutes
        title.episodeTotal = raw.get('number_of_episodes') or None
    if 'watch/providers' in raw:
        title.providers, title.providersAt = stream_names(raw), now()


def sync_status(title: Title) -> None:
    """A series moves itself along as episodes are ticked: first tick starts it, the last one finishes it."""
    if title.mediaType != 'tv':
        return
    watched = len(title.episodes)
    if watched and title.status == 'watchlist':
        title.status = 'watching'
    if title.episodeTotal and watched >= title.episodeTotal and title.status != 'finished':
        title.status, title.watchedAt = 'finished', title.watchedAt or now()


@router.get('')
def read() -> dict:
    return {'titles': load().model_dump(mode='json')['titles'], 'configured': bool(TMDB_KEY)}


@router.get('/search')
async def search(q: str = Query(min_length=1, max_length=200), type: Literal['movie', 'tv'] = 'movie'):
    raw = await tmdb(f'/search/{type}', query=q.strip(), include_adult='false')
    return {'results': [card(item, type) for item in (raw.get('results') or [])[:20] if item.get('id')]}


@router.post('', status_code=201)
async def add(value: NewTitle):
    async with lock:
        state = load()
        existing = next((t for t in state.titles if t.mediaType == value.mediaType and t.tmdbId == value.tmdbId), None)
        if existing:
            raise HTTPException(409, f'“{existing.title}” is already saved.')
        raw = await tmdb(f'/{value.mediaType}/{value.tmdbId}', append_to_response='watch/providers')
        title = Title(id=uuid.uuid4(), mediaType=value.mediaType, tmdbId=value.tmdbId, title=card(raw, value.mediaType)['title'] or 'Untitled', addedAt=now(), status=value.status)
        fill(title, raw)
        if value.status == 'finished':
            title.watchedAt = now()
        state.titles.insert(0, title)
        save(state)
        return title.model_dump(mode='json')


@router.patch('/{title_id}')
async def change(title_id: uuid.UUID, value: TitleChange):
    async with lock:
        state = load()
        title = find(state, title_id)
        if value.rating is not None:
            title.rating = value.rating
        if value.favorite is not None:
            title.favorite = value.favorite
        if value.status is not None and value.status != title.status:
            title.status = value.status
            if value.status == 'finished':
                title.watchedAt = title.watchedAt or now()
            elif value.status == 'watchlist':
                title.watchedAt = None
        save(state)
        return title.model_dump(mode='json')


@router.delete('/{title_id}')
async def remove(title_id: uuid.UUID):
    async with lock:
        state = load()
        title = find(state, title_id)
        state.titles.remove(title)
        save(state)
        return {'removed': str(title_id)}


@router.post('/{title_id}/refresh')
async def refresh(title_id: uuid.UUID):
    """Re-read details and where it streams; cheap enough to run when you open a title."""
    async with lock:
        state = load()
        title = find(state, title_id)
        fill(title, await tmdb(f'/{title.mediaType}/{title.tmdbId}', append_to_response='watch/providers'))
        sync_status(title)
        save(state)
        return title.model_dump(mode='json')


@router.get('/{title_id}/seasons')
async def seasons(title_id: uuid.UUID):
    title = find(load(), title_id)
    if title.mediaType != 'tv':
        raise HTTPException(422, 'Only series have seasons.')
    raw = await tmdb(f'/tv/{title.tmdbId}')
    return {'seasons': [{'number': s['season_number'], 'name': text(s.get('name'), 200), 'episodeCount': s.get('episode_count') or 0, 'airDate': text(s.get('air_date'), 10)} for s in raw.get('seasons') or [] if s.get('season_number', 0) >= 1 and (s.get('episode_count') or 0) > 0]}


async def season_episodes(title: Title, number: int) -> list[dict]:
    raw = await tmdb(f'/tv/{title.tmdbId}/season/{number}')
    return [{'number': e['episode_number'], 'name': text(e.get('name'), 300), 'airDate': text(e.get('air_date'), 10), 'runtime': e.get('runtime') or None, 'overview': text(e.get('overview'), 1000)} for e in raw.get('episodes') or []]


@router.get('/{title_id}/seasons/{number}')
async def episodes(title_id: uuid.UUID, number: int):
    title = find(load(), title_id)
    if title.mediaType != 'tv':
        raise HTTPException(422, 'Only series have episodes.')
    return {'episodes': await season_episodes(title, number)}


@router.patch('/{title_id}/episodes')
async def tick_episode(title_id: uuid.UUID, value: EpisodeChange):
    async with lock:
        state = load()
        title = find(state, title_id)
        if title.mediaType != 'tv':
            raise HTTPException(422, 'Only series have episodes.')
        title.episodes = [e for e in title.episodes if (e.season, e.episode) != (value.season, value.episode)]
        if value.watched:
            title.episodes.append(Episode(season=value.season, episode=value.episode, watchedAt=now(), runtime=value.runtime))
        sync_status(title)
        save(state)
        return title.model_dump(mode='json')


@router.patch('/{title_id}/seasons/{number}')
async def tick_season(title_id: uuid.UUID, number: int, value: SeasonChange):
    async with lock:
        state = load()
        title = find(state, title_id)
        if title.mediaType != 'tv':
            raise HTTPException(422, 'Only series have seasons.')
        listed = await season_episodes(title, number)
        mine = {e['number'] for e in listed}
        title.episodes = [e for e in title.episodes if e.season != number or e.episode not in mine]
        if value.watched:
            title.episodes += [Episode(season=number, episode=e['number'], watchedAt=now(), runtime=e['runtime']) for e in listed]
        sync_status(title)
        save(state)
        return title.model_dump(mode='json')
