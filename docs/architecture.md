# Architecture decisions

## Accepted

- One Ignis project folder, with separate applications under `apps/`.
- One SwiftUI application for iPhone and iPad in `apps/ios/`.
- React and TypeScript for the web application in `apps/web/`, initialized with Vite and Chakra UI.
- React Router for future navigation and TanStack Query for future API-connected screens.
- FastAPI with Python for the shared backend under `services/api/`.
- A dedicated PostgreSQL application database for Ignis.
- SQLAlchemy for database access and Alembic for schema migrations.
- Language-neutral API contracts under `shared/contracts/`.
- Deployment configuration under `deploy/`.
- A separate local Git repository on `main`, initialized through GitKraken's personal profile on October 13, 2026. Remote hosting is not configured yet.

## Already deployed

- Static holding page at https://ignis.farm.
- HTTPS and www redirect through the shared Traefik proxy.
- Dedicated Tinyauth instance at https://auth.ignis.farm.
- Existing Raira identity provider, restricted to the same allowed users.
- 90-day session expiry and maximum lifetime, with secure cookies.

## Still to decide or implement

- Product features and first end-to-end user flow.
- Xcode project creation, deployment target and distribution method.
- Web feature implementation, routing, API integration and build deployment automation.
- Backend initialization, PostgreSQL provisioning, product data models and endpoints.
- Python dependency management, database session setup and Alembic initialization.
- Native authentication and API authorization.
- Offline behavior, synchronization and notifications if needed.
- Tests, deployment automation and backup policy for future Ignis application data.

The implemented web foundation is documented in `web.md`.

The backend folder responsibilities and implementation boundary are documented in `backend.md`.

Current authentication session storage is not an Ignis product database. Raira and its retained medication records remain separate. The local folder reorganization does not change server paths or the running deployment.
