"""Register the separate public OAuth client for local read-only TickTick sync."""
import httpx
from app.ticktick import CALLBACK, load, save

if load('client.json'):
    print('Ignis TickTick client is already registered.')
else:
    response = httpx.post('https://api.ticktick.com/oauth/register', json={
        'client_name': 'Ignis Farm sync (read-only operations)', 'redirect_uris': [CALLBACK],
        'grant_types': ['authorization_code'], 'response_types': ['code'],
        'token_endpoint_auth_method': 'none', 'scope': 'tasks:read tasks:write',
    }, timeout=25)
    response.raise_for_status()
    save('client.json', response.json())
    print('Ignis TickTick client registered privately. Connect from the web app.')
