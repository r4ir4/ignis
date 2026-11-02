"""Read-only Calendar access through a locally authorized macOS EventKit helper."""
import asyncio
import json
import os
import time
from pathlib import Path

from fastapi import APIRouter, HTTPException

router = APIRouter(prefix='/api/apple-calendar', tags=['Apple Calendar'])
PRIVATE = Path.home() / 'Library/Application Support/Ignis/apple-calendar'
HELPER = PRIVATE / 'Ignis Calendar Bridge.app'
lock = asyncio.Lock()
connection_task = None
connection_error = ''


def read(name):
    path = PRIVATE / name
    return json.loads(path.read_text()) if path.exists() else None


def save(data):
    PRIVATE.mkdir(parents=True, exist_ok=True)
    os.chmod(PRIVATE, 0o700)
    path = PRIVATE / 'import.json'
    temp = path.with_suffix('.tmp')
    fd = os.open(temp, os.O_CREAT | os.O_WRONLY | os.O_TRUNC, 0o600)
    with os.fdopen(fd, 'w') as output:
        json.dump(data, output)
    temp.replace(path)


def validated(snapshot):
    if not snapshot or not snapshot.get('connected'):
        raise HTTPException(403, 'Allow Ignis Calendar Bridge in System Settings → Privacy & Security → Calendars, then reconnect.')
    if not isinstance(snapshot.get('events'), list) or not isinstance(snapshot.get('calendars'), list):
        raise HTTPException(502, 'Calendar helper returned an invalid snapshot; previous import preserved.')
    # IDs include calendar, provider ID and occurrence start; repeats are not collapsed.
    events = {}
    for event in snapshot['events']:
        if not isinstance(event, dict) or not event.get('id') or not event.get('calendarId'):
            raise HTTPException(502, 'Calendar event identity is missing; previous import preserved.')
        events[event['id']] = event
    return {**snapshot, 'events': list(events.values())}


async def export(request_access=False):
    if not HELPER.exists():
        raise HTTPException(503, 'Build the local Apple Calendar helper first.')
    prior = (PRIVATE / 'latest.json').stat().st_mtime_ns if (PRIVATE / 'latest.json').exists() else 0
    args = ['/usr/bin/open', '-n', '-W', str(HELPER)]
    if request_access:
        args += ['--args', '--request-access']
    process = await asyncio.create_subprocess_exec(*args, stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL)
    try:
        code = await asyncio.wait_for(process.wait(), timeout=300 if request_access else 45)
    except TimeoutError:
        raise HTTPException(504, 'Calendar access/export is still waiting. Approve macOS permission and reconnect.')
    path = PRIVATE / 'latest.json'
    if code != 0 or not path.exists() or path.stat().st_mtime_ns <= prior:
        raise HTTPException(502, 'Calendar helper did not return new data; previous import preserved.')
    snapshot = validated(read('latest.json'))
    save(snapshot)
    return snapshot


@router.get('/status')
def status():
    latest = read('latest.json')
    return {'connected': bool(latest and latest.get('connected')), 'imported': read('import.json'), 'ready': HELPER.exists(), 'pending': bool(connection_task and not connection_task.done()), 'error': connection_error, 'readOnly': True}


async def connect_in_background():
    global connection_error
    try:
        async with lock:
            await export(request_access=True)
        connection_error = ''
    except HTTPException as error:
        connection_error = str(error.detail)
    except Exception:
        connection_error = 'The local calendar helper could not start. Please reconnect.'


@router.post('/connect')
async def connect():
    global connection_task, connection_error
    if not HELPER.exists():
        raise HTTPException(503, 'Build the local Apple Calendar helper first.')
    if connection_task is None or connection_task.done():
        connection_error = ''
        connection_task = asyncio.create_task(connect_in_background())
    return {'pending': True}


@router.post('/import')
async def import_events():
    async with lock:
        latest = read('latest.json')
        if not latest or not latest.get('connected'):
            raise HTTPException(403, 'Apple Calendar permission is required. Reconnect Apple Calendar.')
        cached = read('import.json')
        if cached and time.time() - cached.get('importedAt', 0) < 15:
            return cached
        return await export()
