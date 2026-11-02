"""Isolated production Watch API: no access to local productivity integrations."""
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from .watch import router
app = FastAPI(title='Ignis Watch API')
@app.middleware('http')
async def boundary(request: Request, call_next):
    if request.headers.get('host') != 'watch.ignis.farm': return JSONResponse({'detail': 'Invalid host'}, status_code=400)
    if not request.headers.get('remote-email'): return JSONResponse({'detail': 'Authentication required'}, status_code=401)
    if request.method not in ('GET', 'HEAD') and request.headers.get('origin') != 'https://watch.ignis.farm':
        return JSONResponse({'detail': 'Invalid origin'}, status_code=403)
    response = await call_next(request)
    response.headers['Cache-Control'] = 'no-store'
    return response
app.include_router(router)
