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

A local-only FastAPI proof now implements dedicated Structured OAuth and read-only MCP imports. It uses Python 3.13, pinned dependencies in `services/api/requirements.txt`, and a local ignored virtual environment. Private OAuth files and imported snapshots live outside the repository; PostgreSQL, SQLAlchemy and Alembic remain uninitialized.

The trial is bound to localhost, restricts hosts and cross-origin writes, uses PKCE/state validation and does not expose provider tokens to React. It has no production or native-app authentication. Authenticated task import and recurring occurrence identities have been verified. Coverage is today, the inbox and the next 30 days; recurrence definitions are not available through the documented read tools.

See `services/api/README.md` for commands and boundaries. Production remains unchanged.

The local proof also supports TickTick in `app/ticktick.py`, with independent credentials, read-tool enforcement and automatic read-only imports. Provider scope requirements and history coverage are documented in `services/api/README.md`. No application database or production deployment was added.

## Notebook database foundation (October 17, 2026, local)

The Notebook now implements the accepted PostgreSQL/SQLAlchemy/Alembic stack in its dedicated local cluster. Workspace revisions serialize saves, page rows retain Tiptap JSON and metadata, and history rows retain changed page versions. The first migration is `0001_notebook`; the OpenAPI export is generated from the implemented FastAPI routes. The older integration/Food/Exercise/Markdown stores remain separate and unchanged. PostgreSQL is initialized for Notebook only; authentication and production/cross-device access remain pending. See `notebook.md` for the complete local setup and recovery contract.

## Hosted notebook preparation (17 October 2026)

The hosted notebook uses a separate `app.notebook_main:application --factory` entry point. It revalidates the existing Ignis session with Tinyauth and enforces a configured owner email and same-origin writes. Local integration routes and their credentials are excluded. Staging and production each use a dedicated PostgreSQL 18.6 cluster, restricted application role, Alembic migration job and backup worker. Production routing is disabled until release. See `deploy/notebook/README.md`; the hosted contract is generated separately at `shared/contracts/notebook.openapi.json`. The existing local integration contract remains unchanged.

## Notebook notification persistence (17 October 2026, local)

The implemented notebook PostgreSQL layer now includes an additive notification table in Alembic `0002_notifications`. Notifications and scheduled reminders are separate from page snapshots, so changing read/archive state cannot conflict with editor saves. API schemas in `app/schemas/inbox.py` and notification logic in `app/services/inbox.py` feed the same owner-authenticated notebook router; both OpenAPI exports are regenerated from the apps. Due reminders are returned on Inbox polling/focus rather than delivered by a separate scheduler or push provider. Backup markers are deduplicated into durable Workspace alerts. Full PostgreSQL recovery dumps cover the new table. Production adoption remains a separate migration/release operation.

The optional page category field remains accepted for compatibility with the earlier meeting-note trial, including recoverable Trash and history. The current Meetings view only displays the existing local calendar snapshot; it does not create pages or modify calendar events. Local calendar access continues through the separate read-only macOS integration router and is not added to the hosted notebook API.

Notebook presentation metadata (`cover`, including HTTPS image URL, vertical position and optional attribution, plus `fullWidth`) lives in the existing page JSON payload and history. No database migration is required. Absent cover metadata normalizes to null and width defaults to true without creating artificial page revisions. Migration `0003_cover_images` adds immutable, content-addressed cover image bytes in PostgreSQL. The owner-protected `/api/notebook/cover-images` upload endpoint bounds streamed input at 8 MB and uses Pillow to validate raster images, cap decoded size at 20 megapixels, normalize orientation, strip metadata and encode WebP. GET `/api/notebook/cover-images/{sha256}.webp` uses the same hosted session boundary and serves only `image/webp` with `nosniff`. Assets are retained when a cover changes so history, copies and recovery references remain valid. Full PostgreSQL dumps include image bytes; JSON exports preserve references only. Apply the migration before starting the updated API; the hosted health check requires its table. No production deployment was performed.

Migration `0004_default_full_width` switches existing pages (including recoverable Trash) to the wider layout, recording changed pages in history and advancing the workspace revision atomically. It preserves content, cover assets and earlier history. New pages default to full width in both web and API; an explicit false remains a supported per-page preference after migration.

Notebook appearance also includes `font` (`default`, `serif`, `mono`) and `smallText` (boolean), stored with the existing page payload/history. Missing values normalize to default/false without creating artificial revisions; no schema migration is needed. Copy and Markdown export run in the browser and do not modify stored page content.

Notebook pages include `locked` (default false) in their JSON payload/history. Saving compares protected title/content/icon/cover/appearance fields against an existing locked page and returns 422 for edits while the incoming page remains locked. Explicit unlocking and organizational actions remain allowed. Canonical normalization treats absent lock fields as false without generating versions of unchanged legacy pages. The field is included in generated OpenAPI contracts.

Tiptap block attributes `textColor` and `backgroundColor` store palette names (gray, brown, orange, yellow, green, blue, purple, pink, red) or null for Default. API and browser recovery validation reject unsupported values. They live inside existing content JSON, so no migration is required. The web extension renders allowlisted data attributes with fixed CSS colors, rather than arbitrary saved CSS. Block conversions carry colors across supported styles; duplication/history retain the full attributes. The existing locked-content check also protects color changes.

Notebook task files use immutable, content-addressed binary rows in `notebook_attachments` (Alembic 0005). They share existing notebook authentication and database backups. File responses always download as octet-stream with no-sniff and sandbox CSP; page cover images remain normalized WebP in their separate table. Task property definitions, calculated-field configuration, and optional task metadata remain in the existing validated notebook JSON payload. No production migration is implied by local changes.

### Native Ignis habits (2026-10-18)

Ignis is now the primary habit tracker. Migration `0006_native_habits` adds dedicated habit definitions, immutable completion events and an import/settings manifest to the existing Ignis PostgreSQL database. `/api/habits` and its create/edit/archive/mark routes read and write only that database; the local app no longer registers the Raira habit routes. The hosted entry point includes the native routes under its existing owner/session and same-origin checks, but no live deployment was made.

`services/api/scripts/import_raira_habits.py` reads Raira in a repeatable-read, read-only transaction, exports all definitions (including archived habits) and all completion events (including reversals), and copies them atomically into empty native storage. It preserves source IDs, timestamps, period keys, configuration, medication-link metadata and pack-cycle rules without importing credentials. A private pre-import database backup and JSON export live outside the repository. Every imported payload is hash-verified before commit. The import manifest prevents later runs from overwriting native edits or check-ins. Re-import returns the prior manifest without contacting Raira.

The local cutover imported 28 habits and 270 completion events (258 live, 12 reversed), including 10 archived definitions. Current counts, streaks and lifetime totals matched the source immediately after import. Source timezone/day-start are retained. New events use native UUIDs and source `ignis`; undo records a reversal timestamp. Transactions serialize check-ins and expected counts/configurations reject stale writes. Retries converge to the requested count. Medication-linked habits retain their tab and imported history, but future habit marks are independent Ignis check-ins; the existing Meds integration and Raira medication data remain separate.

The page uses monthly cards, three desktop columns and month controls beside its title. Its previous heatmap section and progress bar are removed. Recent native snapshots stay in memory for instant return navigation, with refreshes reading only Ignis. PostgreSQL recovery dumps include all three native tables; browser notebook JSON backups do not include the separate native habit event tables. Use the private database dumps for full recovery.

### Native Vyvanse records (2026-10-18)

Meds now reads and writes Ignis PostgreSQL through the existing `/api/meds/vyvanse` contract. Migration `0007_native_meds` adds dose, phase, settings, source-archive and audit tables. The routes use the notebook's existing local/same-origin or hosted owner/session boundary. The runtime does not call the Raira adapter. This is a local cutover; no production deployment was performed.

`services/api/scripts/import_raira_meds.py` takes a private pre-import database backup, exports only Vyvanse in a repeatable-read/read-only source transaction, and atomically copies the medication configuration, all doses and phases plus related reports/schedules/occurrences/audit into empty native tables. It retains original IDs, timestamps, dosage precision, notes and source metadata. Hash verification compares every imported payload before commit. A private JSON export and post-import database dump are retained outside the repository. Its manifest prevents later imports from replacing native records or edits, and repeated runs do not reconnect to Raira.

The verified local import contains 73 doses, 126 phase records, 10 response reports, one schedule, 40 schedule occurrences and two occurrence-audit records. Doses, stage timestamps and owner-day keys matched the source after import. The original Raira database is unchanged. Full database recovery dumps include these tables; notebook browser JSON exports do not include medication records.

New intakes, stage marks, edits and removals write only in Ignis. Existing five-minute/36-hour stage timing, chronological ordering, and same-day duplicate-dose protections are preserved as recording rules. Client event IDs handle retries and pending requests created before cutover. Soft removals and immutable audit entries preserve local edit/removal history; retries cannot resurrect removed marks. Doses with linked response reports are retained. These recording rules are not dose recommendations. Historical schedule records are retained as an archive; this change does not introduce schedule notifications, remote writes or automatic medication/habit synchronization. Native snapshots remain in memory for fast return navigation.
