# Ignis API

The backend shared by the SwiftUI iPhone/iPad app and React/TypeScript web app will use:

- FastAPI with Python for the HTTP API and request/response validation.
- PostgreSQL for application data.
- SQLAlchemy for database models, sessions and queries.
- Alembic for versioned database schema migrations.

## Folder structure

```text
services/api/
  app/
    api/
      routes/       # FastAPI endpoints and HTTP-specific request handling
    core/           # Application settings and authentication/authorization support
    db/             # SQLAlchemy engine, session lifecycle and declarative base
    models/         # SQLAlchemy database models
    schemas/        # API request/response schemas
    services/       # Business rules shared across endpoints and client platforms
  migrations/
    versions/       # Alembic migration revisions
  tests/            # API, business-rule and database integration tests
  README.md
```

The directories are reserved for implementation. There is no executable API, Python package setup, dependency installation, SQLAlchemy configuration or initialized Alembic environment yet. No database has been provisioned. Add the application entry point, package files and Alembic configuration when backend implementation begins.

## Responsibilities

Routes translate HTTP requests into calls to application services. Schemas describe what clients send and receive. Services enforce business rules and use SQLAlchemy models and database sessions. `core/` contains configuration and identity/permission support; `db/` owns connection and session setup.

Database models and API schemas serve different purposes and remain separate. Database schema changes use Alembic migration revisions; the Alembic environment and configuration will live under this API project when initialized.

PostgreSQL will be dedicated to Ignis, with its own credentials, storage and backup policy. Raira's database and medication records remain separate.

The implemented FastAPI app will produce an OpenAPI specification for `shared/contracts/`, so Swift and TypeScript clients can agree on the API. Product data models, endpoint paths and native/API authentication are still to be designed.

See `../../docs/backend.md` for the backend plan and initialization boundary. Git remains deferred.
