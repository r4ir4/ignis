"""Render isolated stacks. Credentials are generated on the host, never in this file."""
import argparse
import json
p = argparse.ArgumentParser()
p.add_argument('environment', choices=['staging', 'production'])
a = p.parse_args()
env = a.environment
name = 'ignis-notebook-' + env
root = '/opt/ignis/notebook/' + env
host = 'staging.ignis.farm' if env == 'staging' else 'ignis.farm'
common = {'image': 'ignis-notebook:20261017', 'restart': 'unless-stopped', 'read_only': True,
          'tmpfs': ['/tmp'], 'env_file': [root + '/runtime.env'], 'volumes': [root + '/data:/data'],
          'cap_drop': ['ALL'], 'security_opt': ['no-new-privileges:true'],
          'depends_on': {'migrate': {'condition': 'service_completed_successfully'}}}
services = {
    'db': {'image': 'postgres:18.6-alpine', 'restart': 'unless-stopped', 'env_file': [root + '/postgres.env'],
           'volumes': [name + '-postgres:/var/lib/postgresql', root + '/init-db.sh:/docker-entrypoint-initdb.d/001-app.sh:ro'],
           'networks': ['database'], 'shm_size': '128m',
           'healthcheck': {'test': ['CMD-SHELL', 'pg_isready -U postgres -d ignis_notebook'], 'interval': '5s', 'timeout': '3s', 'retries': 20}},
    'migrate': {'image': common['image'], 'read_only': True, 'tmpfs': ['/tmp'], 'user': '10001:10001',
                'env_file': common['env_file'], 'networks': ['database'], 'command': ['alembic', 'upgrade', 'head'],
                'depends_on': {'db': {'condition': 'service_healthy'}}, 'cap_drop': ['ALL'], 'security_opt': ['no-new-privileges:true']},
    'api': {**common, 'container_name': name + '-api', 'networks': ['database', 'proxy'], 'labels': {'traefik.enable': 'false'},
            'healthcheck': {'test': ['CMD', 'python', '-c', 'import urllib.request; urllib.request.urlopen("http://127.0.0.1:8000/healthz",timeout=3)'], 'interval': '10s', 'timeout': '4s', 'retries': 10}},
    'backup': {**common, 'networks': ['database'], 'command': ['python', '-m', 'app.notebook_backup_worker']},
    'site': {'image': 'nginx:alpine', 'restart': 'unless-stopped', 'read_only': True, 'tmpfs': ['/var/cache/nginx', '/var/run'],
             'volumes': [root + '/public:/usr/share/nginx/html:ro', root + '/nginx.conf:/etc/nginx/conf.d/default.conf:ro', root + '/notebook-proxy.conf:/etc/nginx/notebook-proxy.conf:ro'],
             'networks': ['proxy'], 'depends_on': {'api': {'condition': 'service_healthy'}},
             'labels': {'traefik.enable': 'true', 'traefik.docker.network': 'n8n_default',
                        f'traefik.http.services.{name}.loadbalancer.server.port': '80',
                        f'traefik.http.routers.{name}.rule': f'Host(`{host}`)',
                        f'traefik.http.routers.{name}.entrypoints': 'websecure',
                        f'traefik.http.routers.{name}.tls': 'true',
                        f'traefik.http.routers.{name}.tls.certresolver': 'mytlschallenge',
                        f'traefik.http.routers.{name}.service': name,
                        f'traefik.http.routers.{name}.middlewares': 'ignis-auth@docker'}}}
# Production's site is opt-in: provisioning storage never switches the live router.
if env == 'production':
    services['site']['profiles'] = ['release']
print(json.dumps({'name': name, 'services': services, 'networks': {'database': {'internal': True}, 'proxy': {'external': True, 'name': 'n8n_default'}},
                  'volumes': {name + '-postgres': {'name': name + '-postgres'}}}, indent=2))
