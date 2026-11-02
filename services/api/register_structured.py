"""Register a dedicated local Ignis OAuth client; never print credentials."""
import httpx
from app.main import AUTH, CALLBACK, read_file, save_file

if read_file('client.json'):
    print('An Ignis client is already registered.')
else:
    response = httpx.post(AUTH + '/oauth/clients/register', json={
        'client_name': 'Ignis Farm local import', 'redirect_uris': [CALLBACK],
        'grant_types': ['authorization_code', 'refresh_token'],
        'response_types': ['code'], 'token_endpoint_auth_method': 'none',
    }, timeout=25)
    response.raise_for_status()
    save_file('client.json', response.json())
    print('Ignis client registered privately. Start the API and connect from the web app.')
