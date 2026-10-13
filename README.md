# Ignis

Ignis targets iPhone, iPad and the web. The chosen platforms are SwiftUI for a shared iPhone/iPad app and React with TypeScript for the web app. The backend stack is FastAPI with Python, PostgreSQL, SQLAlchemy and Alembic.

The live site at https://ignis.farm currently shows a holding page protected by Tinyauth. This folder contains the page and deployment configuration plus the structure for the future applications. The web app is initialized with React, TypeScript, Vite and Chakra UI and now shows a local editorial workspace prototype with sample tasks, notes and a calendar. The SwiftUI and backend runtime projects are not initialized. Git was initialized locally on `main` through GitKraken's personal profile on October 13, 2026. No remote is configured yet.

## Structure

```text
ignis/
  apps/
    ios/                  # One SwiftUI app for iPhone and iPad
    web/
      index.html          # Vite HTML entry
      public/             # Static assets
      src/                # React/TypeScript app and Chakra theme
      package.json        # Web dependencies and local commands
  services/
    api/                  # FastAPI backend shared by the apps
      app/                # Routes, settings, database access, models, schemas, services
      migrations/versions/ # Alembic migration revisions
      tests/              # Future backend tests
  shared/
    contracts/            # Future language-neutral API definitions
  deploy/                 # Production Docker Compose and nginx configuration
  docs/                   # Architecture and project decisions
  AGENTS.md               # Working rules for this project
  README.md
  .gitignore              # Excludes credentials, dependencies and build output
```

Each application owns its interface. The planned shared API owns persistent data and common business rules. The backend folder structure is prepared, but no runnable API or application database exists yet. See `services/api/README.md` for the folders and `docs/backend.md` for the accepted backend stack.

## Run the web app locally

Use Node.js 24 (Volta pins 24.14.0 for the web app):

```sh
cd apps/web
npm install
npm run dev
```

Open http://127.0.0.1:5173. Run `npm run build` to check TypeScript and produce `dist/`, or `npm run preview` to view that build at http://127.0.0.1:4173. The local preview does not run production authentication.

The original holding page is archived in `docs/archive/holding-page.html`. See `apps/web/README.md` and `docs/web.md` for the web setup.

## Production

Production runs under `/opt/ignis`, accessed with the existing `ssh cabecao` alias:

```text
/opt/ignis/
  public/index.html
  nginx.conf
  compose.json
  auth.env                 # Server-only credentials and allowed users
```

Local source and deployment locations differ deliberately:

| Local source | Production location |
| --- | --- |
| `apps/web/dist/` (future approved build deployment) | `/opt/ignis/public/` |
| `deploy/nginx.conf` | `/opt/ignis/nginx.conf` |
| `deploy/compose.json` | `/opt/ignis/compose.json` |

The Compose file uses production paths and the existing shared Traefik network; it is not a local development stack. The web build produces `apps/web/dist/`; deployment automation has not been implemented. The existing production holding page has not been replaced.

Ignis has its own Tinyauth instance at https://auth.ignis.farm. Raira supplies sign-in through a dedicated OpenID Connect client. Ignis uses the same allowed-user list, HTTPS-only cookies, and a 90-day session expiry and maximum lifetime. Traefik handles HTTPS and the www redirect. Native app/API authentication is a separate implementation decision and is not implemented yet.

Credentials, authentication data and recovery archives stay on the server. Preserve `/opt/ignis/auth.env` and `ignis_auth_data` during deployment changes. Existing medication and other retained data belong to Raira and are not part of the Ignis application.

See `docs/architecture.md` for the current decisions and `docs/backend.md` for the backend plan. Folder organization and web initialization only changed local files; production was not modified.
