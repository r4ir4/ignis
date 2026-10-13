# Backend plan

## Accepted technology choices

| Concern | Choice |
| --- | --- |
| API framework | FastAPI with Python |
| Application database | PostgreSQL |
| Database access and models | SQLAlchemy |
| Database schema migrations | Alembic |
| API contract | OpenAPI produced by the implemented FastAPI application |

One backend application will serve the SwiftUI and React clients. Core permissions, validation and business rules belong to this backend; each client owns its interface.

## Code organization

The backend lives in `services/api/`:

- `app/api/routes/`: HTTP endpoints, status codes and endpoint dependencies.
- `app/core/`: application configuration and authentication/authorization support.
- `app/db/`: SQLAlchemy engine, declarative base and database session lifecycle.
- `app/models/`: SQLAlchemy persistence models and relationships.
- `app/schemas/`: API request and response schemas.
- `app/services/`: business logic used by routes and both client platforms.
- `migrations/versions/`: Alembic revision files.
- `tests/`: tests for the implemented API, business rules and database behavior.

Start with these directories. Add feature-specific subdivisions when actual features warrant them.

## Data and contracts

Ignis will have a dedicated PostgreSQL database, credentials and persistent storage. Its backup and restore process will be established before storing application data. PostgreSQL supports the shared application; any device-local/offline storage and synchronization are separate design decisions.

Raira and its existing medication records are separate systems. Selecting PostgreSQL for Ignis does not migrate, expose or delete those records.

SQLAlchemy models describe persistence. API schemas describe the client-facing contract. Generate the OpenAPI specification from the implemented FastAPI application and place reviewed contract exports in `shared/contracts/`; keep generated artifacts consistent with the backend.

Schema changes will be recorded as Alembic revisions and reviewed before applying them to a populated database.

## Authentication

The deployed holding page already uses Tinyauth and the Raira identity provider, with 90-day sessions. That setup protects browser access to the current site.

Backend API authorization and native sign-in still need a design covering both SwiftUI and web clients. The API must use a trusted identity and enforce its own permissions; browser session configuration alone does not implement native/API authentication.

## Current stage and next implementation decisions

This change creates folders and records the accepted stack. It does not initialize a runnable FastAPI application, Python package/dependency tooling, SQLAlchemy, an Alembic environment or a PostgreSQL service.

Before implementing the first feature, define:

1. The feature's user flow, records and API endpoints.
2. Python version, dependency management and pinned package versions.
3. Database connection/session configuration and transaction boundaries.
4. Client sign-in and API authorization.
5. The first schema migration and meaningful validation for that feature.
6. Local development commands and the production deployment/backup process.

Git initialization remains deferred until requested. Existing production configuration is unchanged.
