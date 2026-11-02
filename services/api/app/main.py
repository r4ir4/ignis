"""Local-only Structured OAuth and read-only MCP proof of connection."""
import asyncio
import base64
import hashlib
import json
import os
import secrets
import time
from pathlib import Path
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
from urllib.parse import urlencode

import httpx
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import RedirectResponse

app = FastAPI(title='Ignis local integration', version='0.1.0')
PRIVATE = Path.home() / 'Library/Application Support/Ignis/structured'
PRIVATE.mkdir(parents=True, exist_ok=True)
os.chmod(PRIVATE, 0o700)
AUTH = 'https://zgfbpcdjhiakkczmfldk.supabase.co/auth/v1'
MCP = 'https://mcp.structured.app/mcp'
ORIGIN = 'http://127.0.0.1:5173'
CALLBACK = ORIGIN + '/api/structured/callback'
pending = {}
lock = asyncio.Lock()
READ_TOOLS = {'get_today', 'get_inbox', 'list_tasks', 'get_tasks_for_day'}


def read_file(name):
    path = PRIVATE / name
    return json.loads(path.read_text()) if path.exists() else None


def save_file(name, data):
    path = PRIVATE / name
    temp = path.with_suffix('.tmp')
    fd = os.open(temp, os.O_CREAT | os.O_WRONLY | os.O_TRUNC, 0o600)
    with os.fdopen(fd, 'w') as f:
        json.dump(data, f)
    temp.replace(path)


@app.middleware('http')
async def local_only(request: Request, call_next):
    # Local proof: no public hosting, no CORS and no cross-origin writes.
    if request.headers.get('host') not in {'127.0.0.1:5173', '127.0.0.1:8000'}:
        from fastapi.responses import JSONResponse
        return JSONResponse({'detail': 'Local host required'}, status_code=403)
    if request.method not in {'GET', 'HEAD'} and request.headers.get('origin') != ORIGIN:
        from fastapi.responses import JSONResponse
        return JSONResponse({'detail': 'Same-origin request required'}, status_code=403)
    response = await call_next(request)
    response.headers['Cache-Control'] = 'no-store'
    return response


@app.get('/api/structured/status')
def status():
    snapshot = read_file('import.json')
    return {'connected': bool(read_file('tokens.json')), 'imported': snapshot, 'readOnly': True}


@app.get('/api/structured/connect')
def connect():
    client = read_file('client.json')
    if not client:
        raise HTTPException(503, 'Ignis client registration is missing.')
    state = secrets.token_urlsafe(32)
    verifier = secrets.token_urlsafe(48)
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b'=').decode()
    now = time.time()
    for key in list(pending):
        if pending[key]['expires'] < now:
            del pending[key]
    pending[state] = {'verifier': verifier, 'expires': now + 600}
    url = AUTH + '/oauth/authorize?' + urlencode({'client_id': client['client_id'], 'redirect_uri': CALLBACK, 'response_type': 'code', 'scope': 'email', 'state': state, 'code_challenge': challenge, 'code_challenge_method': 'S256'})
    response = RedirectResponse(url)
    response.set_cookie('ignis_structured_state', state, httponly=True, samesite='lax', max_age=600, path='/api/structured')
    return response


@app.get('/api/structured/callback', include_in_schema=False)
async def callback(request: Request):
    state = request.query_params.get('state', '')
    record = pending.pop(state, None)
    if not record or record['expires'] < time.time() or not secrets.compare_digest(state, request.cookies.get('ignis_structured_state', '')):
        raise HTTPException(400, 'Login expired or state did not match. Please reconnect.')
    if request.query_params.get('error'):
        return RedirectResponse('/?structured=denied')
    code = request.query_params.get('code')
    if not code:
        raise HTTPException(400, 'Authorization code is missing.')
    client = read_file('client.json')
    async with httpx.AsyncClient(timeout=25) as http:
        result = await http.post(AUTH + '/oauth/token', data={'grant_type': 'authorization_code', 'code': code, 'client_id': client['client_id'], 'redirect_uri': CALLBACK, 'code_verifier': record['verifier']})
    if result.status_code != 200:
        raise HTTPException(502, 'Structured refused the authorization exchange. Please reconnect.')
    tokens = result.json()
    tokens['expires_at'] = time.time() + tokens.get('expires_in', 3600)
    save_file('tokens.json', tokens)
    response = RedirectResponse('/?structured=connected')
    response.delete_cookie('ignis_structured_state', path='/api/structured')
    return response


async def access_token():
    tokens = read_file('tokens.json')
    if not tokens:
        raise HTTPException(401, 'Connect Structured first.')
    if tokens['expires_at'] <= time.time() + 60:
        refresh = tokens.get('refresh_token')
        if not refresh:
            raise HTTPException(401, 'Structured login expired. Please reconnect.')
        async with httpx.AsyncClient(timeout=25) as http:
            result = await http.post(AUTH + '/oauth/token', data={'grant_type': 'refresh_token', 'refresh_token': refresh, 'client_id': read_file('client.json')['client_id']})
        if result.status_code != 200:
            raise HTTPException(401, 'Structured login expired. Please reconnect.')
        new = result.json()
        new.setdefault('refresh_token', refresh)
        new['expires_at'] = time.time() + new.get('expires_in', 3600)
        save_file('tokens.json', new)
        tokens = new
    return tokens['access_token']


def decode_rpc(response):
    if response.status_code == 401:
        raise HTTPException(401, 'Structured rejected the session. Please reconnect.')
    if response.status_code >= 400:
        raise HTTPException(502, f'Structured MCP returned HTTP {response.status_code}.')
    if 'text/event-stream' in response.headers.get('content-type', ''):
        for block in response.text.split('\n\n'):
            payload = '\n'.join(line[5:].strip() for line in block.splitlines() if line.startswith('data:'))
            if payload:
                message = json.loads(payload)
                if 'result' in message or 'error' in message:
                    return message
        raise HTTPException(502, 'Structured returned no MCP response.')
    return response.json()


async def rpc(http, headers, method, params=None, request_id=1):
    response = await http.post(MCP, headers=headers, json={'jsonrpc': '2.0', 'id': request_id, 'method': method, 'params': params or {}})
    session = response.headers.get('mcp-session-id')
    if session:
        headers['Mcp-Session-Id'] = session
    message = decode_rpc(response)
    if 'error' in message:
        raise HTTPException(502, f'Structured could not complete {method}.')
    return message['result']


def provider_tasks(result):
    """Structured returns a JSON array in text, with optional MCP structured content."""
    if result.get('isError'):
        raise HTTPException(502, 'Structured reported a read error; previous import preserved.')
    for block in result.get('content', []):
        if block.get('type') != 'text':
            continue
        text = block.get('text', '')
        try:
            data = json.loads(text)
        except ValueError:
            if text.strip() in {'No tasks in inbox.', 'No tasks found.', 'No tasks for this day.', 'No tasks scheduled for today.'}:
                return []
            continue
        if isinstance(data, list) and all(isinstance(t, dict) and 'title' in t for t in data):
            return data
    data = result.get('structuredContent')
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        for key in ('tasks', 'result', 'data'):
            if isinstance(data.get(key), list):
                return data[key]
    raise HTTPException(502, 'Structured task response changed; previous import preserved.')


def task_key(task):
    # A recurring series is not an occurrence: retain one key for every scheduled day.
    if task.get('recurring_id') and task.get('day'):
        return 'recurring:' + str(task['recurring_id']) + ':' + task['day']
    if task.get('id'):
        return 'task:' + str(task['id'])
    raise HTTPException(502, 'A Structured task has no stable identity; previous import preserved.')


def merge_tasks(results):
    unique = {}
    for task in results:
        unique[task_key(task)] = task
    return list(unique.values())


@app.post('/api/structured/import')
async def import_tasks():
    async with lock:
        token = await access_token()
        cached = read_file('import.json')
        if cached and cached.get('tasks') is not None and time.time() - cached.get('importedAt', 0) < 15:
            return cached  # Coalesce simultaneous tabs and requests queued behind an import.
        headers = {'Authorization': f'Bearer {token}', 'Accept': 'application/json, text/event-stream', 'MCP-Protocol-Version': '2025-03-26'}
        today = datetime.now(ZoneInfo('America/Bahia')).date()
        end = today + timedelta(days=30)
        async with httpx.AsyncClient(timeout=40) as http:
            await rpc(http, headers, 'initialize', {'protocolVersion': '2025-03-26', 'capabilities': {}, 'clientInfo': {'name': 'Ignis Farm', 'version': '0.1.0'}})
            initialized = await http.post(MCP, headers=headers, json={'jsonrpc': '2.0', 'method': 'notifications/initialized'})
            if initialized.status_code >= 400:
                raise HTTPException(502, 'Structured MCP initialization failed.')
            tools = []
            cursor = None
            for _ in range(20):
                page = await rpc(http, headers, 'tools/list', {'cursor': cursor} if cursor else {})
                tools.extend(page.get('tools', []))
                cursor = page.get('nextCursor')
                if not cursor:
                    break
            names = {tool['name'] for tool in tools}
            if not {'get_today', 'get_inbox', 'list_tasks'}.issubset(names):
                raise HTTPException(502, 'Structured read tools changed; previous import preserved.')
            records, warnings = [], []
            async def read(name, args):
                if name not in READ_TOOLS:
                    raise HTTPException(400, 'Only read tools are allowed.')
                result = await rpc(http, headers, 'tools/call', {'name': name, 'arguments': args})
                tasks = provider_tasks(result)
                records.append({'source': name, 'arguments': args, 'result': result})
                return tasks
            today_tasks = await read('get_today', {'timezone': 'America/Bahia'})
            inbox = await read('get_inbox', {})
            upcoming = []
            first = today
            while first <= end:
                last = min(first + timedelta(days=6), end)
                args = {'day_from': first.isoformat(), 'day_to': last.isoformat(), 'timezone': 'America/Bahia', 'limit': 200}
                batch = await read('list_tasks', args)
                if len(batch) < 200:
                    upcoming.extend(batch)
                else:
                    # No cursor exists for task lists. Split saturated ranges into individual days.
                    day = first
                    while day <= last:
                        daily = await read('list_tasks', {**args, 'day_from': day.isoformat(), 'day_to': day.isoformat()})
                        upcoming.extend(daily)
                        if len(daily) >= 200:
                            warnings.append(f'{day.isoformat()} reached the 200-task limit; that day may be incomplete.')
                        day += timedelta(days=1)
                first = last + timedelta(days=1)
        tasks = merge_tasks(today_tasks + upcoming + inbox)
        recurring = {}
        for task in tasks:
            recurring_id = task.get('recurring_id')
            if recurring_id:
                group = recurring.setdefault(recurring_id, {'id': recurring_id, 'title': task['title'], 'occurrences': []})
                group['occurrences'].append(task)
        snapshot = {'importedAt': time.time(), 'sources': records, 'tasks': tasks, 'routines': list(recurring.values()), 'today': today.isoformat(), 'rangeEnd': end.isoformat(), 'timezone': 'America/Bahia', 'warnings': warnings, 'scope': 'Today, inbox and the next 30 days. Routines are grouped from actual recurring occurrences; recurrence definitions are not exposed.'}
        save_file('import.json', snapshot)
        return snapshot

# Keep provider credentials and imports isolated.
from app.ticktick import router as ticktick_router
app.include_router(ticktick_router)
from app.apple_calendar import router as apple_calendar_router
app.include_router(apple_calendar_router)

from app.apple_reminders import router as apple_reminders_router
app.include_router(apple_reminders_router)
from app.food import router as food_router
app.include_router(food_router)

from app.exercise import router as exercise_router
app.include_router(exercise_router)

from .watch import router as watch_router
app.include_router(watch_router)

from .notes import router as notes_router
app.include_router(notes_router)


from .api.routes.notebook import router as notebook_router
app.include_router(notebook_router)

from .api.routes.meds import router as meds_router
app.include_router(meds_router)

from .api.routes.habits import router as habits_router
app.include_router(habits_router)
