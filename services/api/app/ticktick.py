"""Dedicated local TickTick OAuth; provider writes are never available."""
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
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import RedirectResponse

router = APIRouter(prefix='/api/ticktick', tags=['TickTick'])
PRIVATE = Path.home() / 'Library/Application Support/Ignis/ticktick'
PRIVATE.mkdir(parents=True, exist_ok=True)
os.chmod(PRIVATE, 0o700)
ORIGIN = 'http://127.0.0.1:5173'
CALLBACK = ORIGIN + '/api/ticktick/callback'
MCP = 'https://mcp.ticktick.com/'
AUTHORIZE = 'https://ticktick.com/oauth/authorize'
TOKEN = 'https://api.ticktick.com/oauth/token'
pending = {}
lock = asyncio.Lock()
READ_TOOLS = {'list_projects', 'get_project_with_undone_tasks', 'list_completed_tasks_by_date', 'list_habits', 'get_habit_checkins', 'get_focuses_by_time', 'get_user_preference'}


def load(name):
    path = PRIVATE / name
    return json.loads(path.read_text()) if path.exists() else None


def save(name, data):
    path = PRIVATE / name
    temp = path.with_suffix('.tmp')
    fd = os.open(temp, os.O_CREAT | os.O_WRONLY | os.O_TRUNC, 0o600)
    with os.fdopen(fd, 'w') as f:
        json.dump(data, f)
    temp.replace(path)


@router.get('/status')
def status():
    return {'connected': bool(load('tokens.json')), 'imported': load('import.json'), 'readOnly': True}


@router.get('/connect')
def connect():
    client = load('client.json')
    if not client:
        raise HTTPException(503, 'TickTick client registration is missing.')
    state, verifier = secrets.token_urlsafe(32), secrets.token_urlsafe(48)
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b'=').decode()
    for key in list(pending):
        if pending[key]['expires'] < time.time():
            del pending[key]
    pending[state] = {'verifier': verifier, 'expires': time.time() + 600}
    response = RedirectResponse(AUTHORIZE + '?' + urlencode({'client_id': client['client_id'], 'redirect_uri': CALLBACK, 'response_type': 'code', 'scope': 'tasks:read tasks:write', 'state': state, 'code_challenge': challenge, 'code_challenge_method': 'S256'}))
    response.set_cookie('ignis_ticktick_state', state, httponly=True, samesite='lax', max_age=600, path='/api/ticktick')
    return response


@router.get('/callback', include_in_schema=False)
async def callback(request: Request):
    state = request.query_params.get('state', '')
    record = pending.pop(state, None)
    if not record or record['expires'] < time.time() or not secrets.compare_digest(state, request.cookies.get('ignis_ticktick_state', '')):
        raise HTTPException(400, 'TickTick login expired or state did not match. Please reconnect.')
    if request.query_params.get('error'):
        return RedirectResponse('/?ticktick=denied')
    code = request.query_params.get('code')
    if not code:
        raise HTTPException(400, 'TickTick authorization code is missing.')
    client = load('client.json')
    async with httpx.AsyncClient(timeout=25) as http:
        result = await http.post(TOKEN, data={'grant_type': 'authorization_code', 'scope': 'tasks:read tasks:write', 'code': code, 'client_id': client['client_id'], 'redirect_uri': CALLBACK, 'code_verifier': record['verifier']})
    if result.status_code != 200:
        raise HTTPException(502, 'TickTick refused authorization exchange. Please reconnect.')
    tokens = result.json()
    if not tokens.get('access_token'):
        raise HTTPException(502, 'TickTick returned no access token.')
    tokens['expires_at'] = time.time() + tokens.get('expires_in', 3600)
    save('tokens.json', tokens)
    # An explicit connection may select a different account. Never display an old account's snapshot.
    (PRIVATE / 'import.json').unlink(missing_ok=True)
    response = RedirectResponse('/?ticktick=connected')
    response.delete_cookie('ignis_ticktick_state', path='/api/ticktick')
    return response


async def access_token():
    tokens = load('tokens.json')
    if not tokens or tokens.get('expires_at', 0) <= time.time() + 60:
        raise HTTPException(401, 'TickTick login expired or is missing. Reconnect TickTick.')
    return tokens['access_token']


async def rpc(http, headers, method, params=None):
    if method == 'tools/call' and (params or {}).get('name') not in READ_TOOLS:
        raise HTTPException(403, 'Ignis blocks TickTick write tools.')
    response = await http.post(MCP, headers=headers, json={'jsonrpc': '2.0', 'id': 1, 'method': method, 'params': params or {}})
    if response.status_code == 403 and 'insufficient_scope' in response.text:
        raise HTTPException(403, 'TickTick MCP requires tasks:write permission even for read access. Reauthorization is needed; Ignis remains read-only.')
    if response.status_code in (401, 403):
        raise HTTPException(401, 'TickTick rejected the session. Reconnect TickTick.')
    if response.status_code >= 400:
        raise HTTPException(502, f'TickTick MCP returned HTTP {response.status_code}.')
    if response.headers.get('mcp-session-id'):
        headers['Mcp-Session-Id'] = response.headers['mcp-session-id']
    if 'text/event-stream' in response.headers.get('content-type', ''):
        message = None
        for block in response.text.replace('\r\n', '\n').split('\n\n'):
            text = '\n'.join(line[5:].strip() for line in block.splitlines() if line.startswith('data:'))
            if text:
                candidate = json.loads(text)
                if 'result' in candidate or 'error' in candidate:
                    message = candidate; break
        if message is None:
            raise HTTPException(502, 'TickTick returned no MCP response.')
    else:
        message = response.json()
    if 'error' in message:
        raise HTTPException(502, f'TickTick could not complete {method}.')
    return message['result']


async def begin(http):
    headers = {'Authorization': 'Bearer ' + await access_token(), 'Accept': 'application/json, text/event-stream', 'MCP-Protocol-Version': '2025-03-26'}
    await rpc(http, headers, 'initialize', {'protocolVersion': '2025-03-26', 'capabilities': {}, 'clientInfo': {'name': 'Ignis Farm read-only', 'version': '0.1.0'}})
    result = await http.post(MCP, headers=headers, json={'jsonrpc': '2.0', 'method': 'notifications/initialized'})
    if result.status_code >= 400:
        raise HTTPException(502, 'TickTick MCP initialization failed.')
    tools = []
    cursor = None
    for _ in range(20):
        page = await rpc(http, headers, 'tools/list', {'cursor': cursor} if cursor else {})
        tools.extend(page.get('tools', []))
        cursor = page.get('nextCursor')
        if not cursor:
            save('tools.json', tools)
            return headers, tools
    raise HTTPException(502, 'TickTick tool discovery exceeded its limit.')


@router.post('/discover')
async def discover():
    async with lock, httpx.AsyncClient(timeout=40) as http:
        _, tools = await begin(http)
        return {'tools': tools}


def payload(result):
    if result.get('isError'):
        raise HTTPException(502, 'TickTick reported a read error; previous import preserved.')
    value = result.get('structuredContent')
    if value is None:
        for block in result.get('content', []):
            if block.get('type') == 'text':
                try:
                    value = json.loads(block.get('text', ''))
                    break
                except ValueError:
                    continue
    if value is None:
        raise HTTPException(502, 'TickTick returned an unknown response; previous import preserved.')
    if isinstance(value, dict) and 'error' in value:
        raise HTTPException(502, 'TickTick reported a read error; previous import preserved.')
    if isinstance(value, dict) and 'result' in value:
        value = value['result']
    return value


def as_list(value):
    if not isinstance(value, list) or any(not isinstance(item, dict) for item in value):
        raise HTTPException(502, 'TickTick returned an unexpected list; previous import preserved.')
    return value


def unique(records, focus=False):
    found = {}
    for record in records:
        if not record.get('id'):
            raise HTTPException(502, 'TickTick record has no stable ID; previous import preserved.')
        key = (record.get('type'), record['id']) if focus else record['id']
        found[key] = record
    return list(found.values())


@router.post('/import')
async def import_data():
    async with lock:
        await access_token()
        cached = load('import.json')
        if cached and time.time() - cached.get('importedAt', 0) < 15:
            return cached
        now = datetime.now(ZoneInfo('America/Bahia'))
        first = (now - timedelta(days=29)).replace(hour=0, minute=0, second=0, microsecond=0)
        last = now.replace(hour=23, minute=59, second=59, microsecond=0)
        warnings = []
        async with httpx.AsyncClient(timeout=40) as http:
            headers, tools = await begin(http)
            names = {tool['name'] for tool in tools}
            needed = READ_TOOLS - {'get_user_preference'}
            if not needed.issubset(names):
                raise HTTPException(502, 'TickTick required read tools changed; previous import preserved.')
            async def read(name, args):
                return payload(await rpc(http, headers, 'tools/call', {'name': name, 'arguments': args}))
            # The unpaginated form includes TickTick's virtual inbox; retain it.
            projects = unique(as_list(await read('list_projects', {})))
            tasks = []
            for project in projects:
                if project.get('kind') == 'NOTE':
                    continue
                result = await read('get_project_with_undone_tasks', {'project_id': project['id']})
                if not isinstance(result, dict) or 'tasks' not in result:
                    raise HTTPException(502, 'TickTick project response changed; previous import preserved.')
                tasks.extend(as_list(result['tasks'] or []))
            completed = as_list(await read('list_completed_tasks_by_date', {'search': {'startDate': first.isoformat(), 'endDate': last.isoformat()}, 'client_timezone': 'America/Bahia'}))
            tasks = unique(tasks + completed)
            habits = unique(as_list(await read('list_habits', {})))
            checkins = []
            # Small batches make large habit collections manageable.
            for offset in range(0, len(habits), 50):
                batch = await read('get_habit_checkins', {'habit_ids': [h['id'] for h in habits[offset:offset+50]], 'from_stamp': int(first.strftime('%Y%m%d')), 'to_stamp': int(now.strftime('%Y%m%d')), 'client_timezone': 'America/Bahia'})
                checkins.extend(as_list(batch))
            focuses = []
            for kind in (0, 1):
                rows = as_list(await read('get_focuses_by_time', {'from_time': first.isoformat(), 'to_time': last.isoformat(), 'type': kind}))
                # Preserve provider types, supply only the type explicitly requested if absent.
                focuses.extend([{**row, 'type': row.get('type') if row.get('type') is not None else kind} for row in rows])
            focuses = unique(focuses, focus=True)
        snapshot = {'importedAt': time.time(), 'projects': projects, 'tasks': tasks, 'habits': habits, 'checkins': checkins, 'focuses': focuses, 'rangeStart': first.date().isoformat(), 'rangeEnd': now.date().isoformat(), 'timezone': 'America/Bahia', 'warnings': warnings, 'scope': 'All accessible project/inbox tasks; completed tasks, habit check-ins and both focus types for the last 30 days. Provider lists do not expose pagination for task/check-in/focus history; completeness beyond provider responses is not guaranteed.'}
        save('import.json', snapshot)
        return snapshot
