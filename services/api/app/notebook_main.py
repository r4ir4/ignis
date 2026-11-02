"""Hosted notebook only. No local integrations, provider tokens or publishing routes."""
import os
import secrets
from urllib.parse import urlsplit
import httpx
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from sqlalchemy import text
from .db.notebook import engine
from .api.routes.notebook import router


def create_app(origin: str, owner: str, auth_url: str, environment: str = 'production') -> FastAPI:
    parsed = urlsplit(origin)
    if parsed.scheme != 'https' or not parsed.hostname or parsed.path or not owner or '@' not in owner:
        raise ValueError('A canonical HTTPS origin and notebook owner email are required.')
    if not auth_url.startswith('http://ignis-auth-1:3000/'):
        raise ValueError('Use the existing internal Ignis authentication service.')
    app = FastAPI(title='Ignis notebook', version='0.1.0', docs_url=None, redoc_url=None)

    @app.middleware('http')
    async def authorize(request: Request, call_next):
        def reject(status, detail):
            return JSONResponse({'detail': detail}, status_code=status, headers={'Cache-Control': 'no-store'})
        if request.url.path == '/healthz':
            return await call_next(request)
        if request.headers.get('host') != parsed.netloc:
            return reject(403, 'Canonical notebook host required.')
        if request.method not in {'GET', 'HEAD'} and request.headers.get('origin') != origin:
            return reject(403, 'Same-origin request required.')
        cookie = request.headers.get('cookie')
        if not cookie:
            return reject(401, 'Sign in to Ignis to open your notebook.')
        # Revalidate the session ourselves. Client identity/forwarding headers are never trusted.
        headers = {'Cookie': cookie, 'X-Forwarded-Host': parsed.netloc,
                   'X-Forwarded-Proto': 'https', 'X-Forwarded-Uri': request.url.path,
                   'X-Forwarded-Method': request.method}
        try:
            async with httpx.AsyncClient(timeout=5, follow_redirects=False) as client:
                response = await client.get(auth_url, headers=headers)
        except httpx.HTTPError:
            return reject(503, 'Ignis sign-in is temporarily unavailable. Your browser draft is retained.')
        if response.status_code >= 500:
            return reject(503, 'Ignis sign-in is temporarily unavailable. Your browser draft is retained.')
        if response.status_code != 200:
            return reject(403 if response.status_code == 403 else 401, 'Your Ignis session is unavailable or expired. Sign in again.')
        email = response.headers.get('remote-email', '').strip().casefold()
        if not secrets.compare_digest(email.encode('utf-8'), owner.strip().casefold().encode('utf-8')):
            return reject(403, 'This notebook is private to its owner.')
        request.state.notebook_owner = email
        result = await call_next(request)
        result.headers['Cache-Control'] = 'no-store'
        return result

    @app.get('/healthz', include_in_schema=False)
    def health():
        try:
            with engine().connect() as connection:
                connection.execute(text('SELECT revision FROM notebook_workspaces WHERE id=1')).scalar_one()
                connection.execute(text('SELECT 1 FROM notebook_notifications LIMIT 1'))
                connection.execute(text('SELECT 1 FROM notebook_cover_images LIMIT 1'))
            return {'status': 'ok'}
        except Exception:
            return JSONResponse({'status': 'unavailable'}, status_code=503)

    @app.get('/api/notebook/session')
    def session():
        return {'authenticated': True, 'environment': environment, 'storage': 'server', 'private': True}

    app.include_router(router)
    from .api.routes.habits import router as habits_router
    app.include_router(habits_router)
    from .api.routes.meds import router as meds_router
    app.include_router(meds_router)
    schema = app.openapi()
    schema.setdefault('components', {}).setdefault('securitySchemes', {})['IgnisSession'] = {
        'type': 'apiKey', 'in': 'header', 'name': 'Cookie',
        'description': 'Existing Ignis session cookie; revalidated against Tinyauth on every request and restricted to the configured notebook owner.'}
    for operations in schema['paths'].values():
        for operation in operations.values():
            operation['security'] = [{'IgnisSession': []}]
    app.openapi_schema = schema
    return app


def application():
    return create_app(os.environ['IGNIS_PUBLIC_ORIGIN'], os.environ['IGNIS_NOTEBOOK_OWNER_EMAIL'],
                      os.environ.get('IGNIS_AUTH_URL', 'http://ignis-auth-1:3000/api/auth/traefik'),
                      os.environ.get('IGNIS_ENVIRONMENT', 'production'))
