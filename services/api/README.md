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

A local FastAPI proof of connection now supports Structured OAuth and read-only task import. The Notebook foundation now initializes a separate PostgreSQL database with SQLAlchemy and Alembic; the older integration proofs remain independent. This trial keeps credentials and provider snapshots outside the repository, rather than creating an application database.

## Responsibilities

Routes translate HTTP requests into calls to application services. Schemas describe what clients send and receive. Services enforce business rules and use SQLAlchemy models and database sessions. `core/` contains configuration and identity/permission support; `db/` owns connection and session setup.

Database models and API schemas serve different purposes and remain separate. Database schema changes use Alembic migration revisions; the Alembic environment and configuration will live under this API project when initialized.

PostgreSQL will be dedicated to Ignis, with its own credentials, storage and backup policy. Raira's database and medication records remain separate.

The implemented FastAPI app will produce an OpenAPI specification for `shared/contracts/`, so Swift and TypeScript clients can agree on the API. Product data models, endpoint paths and native/API authentication are still to be designed.

See `../../docs/backend.md` for the backend plan and initialization boundary. Git remains deferred.

## Run the local Structured connection

From the project root:

```sh
python3 -m venv services/api/.venv
services/api/.venv/bin/pip install -r services/api/requirements.txt
services/api/.venv/bin/python services/api/register_structured.py
services/api/.venv/bin/uvicorn app.main:app --app-dir services/api --host 127.0.0.1 --port 8000 --no-access-log
```

Run the Vite web app alongside it. Vite proxies `/api` to localhost:8000; connect through http://127.0.0.1:5173/ so the OAuth callback and state cookie match. Do not use another hostname.

Registration, tokens and the last successful import are stored privately under `~/Library/Application Support/Ignis/structured/` (directory 0700, files 0600). No credentials are sent to React. OAuth uses one-time state, PKCE S256 and an HttpOnly SameSite cookie. Access logging is disabled so authorization codes do not enter terminal logs.

This is a single-user, local-only proof, not production API authentication. It calls only allowlisted read tools and preserves provider responses intact. Import reads today and the inbox, plus a 30-day future window in Bahia time. It requests up to 200 tasks per weekly range and splits capped ranges into days, warning if a day is still capped. Recurring occurrences use series ID plus date as their identity; the routine view groups those occurrences without inventing recurrence rules. No Structured task is edited or completed.

Run integrity checks:

```sh
PYTHONPATH=services/api services/api/.venv/bin/python -m unittest discover -s services/api/tests -v
```

The generated local OpenAPI contract is `shared/contracts/openapi.json`.

Automatic sync runs while the web page is open and visible, not as a background service when the app is closed. It retries failures with increasing delays (up to ten minutes); an expired login requires reconnecting. Concurrent requests reuse a snapshot imported within the last 15 seconds. Run `npm run test:sync` in `apps/web/` for scheduler lifecycle checks.

## TickTick connection

TickTick has a separate dedicated OAuth client and private storage under `~/Library/Application Support/Ignis/ticktick/`. Register it with `services/api/.venv/bin/python services/api/register_ticktick.py`, then use Connect TickTick in the local web app.

TickTick MCP requires `tasks:write` even to initialize a read session. The user approved that provider permission on October 13, 2026; the client requests `tasks:read tasks:write` at authorization and token exchange. Ignis permits only the named read tools in `app/ticktick.py`: mutation tools are blocked before network calls. No task completion, habit check-in or focus-session writing is implemented. PKCE S256, a separate state cookie and credential directory keep this connection isolated from Structured.

Import reads accessible projects and their active tasks (including virtual Inbox), recently completed tasks, all habits, habit check-ins and both Pomodoro/stopwatch histories. Completed tasks, check-ins and focus records cover the last 30 calendar days in America/Bahia. Provider history lists expose no pagination; only returned records can be claimed, not unlimited historical completeness. Provider failures preserve the last successful snapshot. Task IDs deduplicate tasks; focus type plus ID deduplicates sessions.

TickTick uses the shared frontend auto-sync scheduler: on opening, every minute while visible and when returning; hidden/offline pages pause and errors back off. Concurrent requests coalesce using the 15-second import cache. TickTick's advertised OAuth flow has no refresh grant; reconnect if its long-lived token expires. Credentials never reach React. Production and Raira data are unchanged.

## Apple Calendar

`app/apple_calendar.py` uses the local helper documented in `services/calendar-bridge/README.md`. Build it with `python3 services/calendar-bridge/build.py`, then Connect Apple Calendar in the web app and approve the native macOS permission. It reads all calendars configured on this Mac, including Google accounts, without a separate Google OAuth client.

The connection and automatic read-only sync are verified locally. The API starts the helper only on same-origin requests; imports coalesce with a 15-second cache and preserve the last successful data on failure or revoked permission. The standard frontend sync lifecycle applies. Events cover the past 30 days including today, plus the next 30 days, in Bahia time. Credential-free exports stay outside the repository. Production cannot use this Mac's EventKit store directly.

## Apple Reminders

`app/apple_reminders.py` uses a separate EventKit helper in `services/reminders-bridge/`. Build it with `python3 services/reminders-bridge/build.py`, then connect from the web screen and approve native Reminders access. It imports all active reminders and 30 days of completion history, including notes, priorities, due dates and recurring flags, with read-only automatic sync. Private snapshots, same-origin controls, cache coalescing and failure preservation follow the Calendar integration. The Calendar helper is not rebuilt. This is local to the Mac and is not deployed.

## Food records

`app/food.py` implements GET/PUT `/api/food` for meal plans, eating logs and reusable meals. Validated records save outside the repository in a private atomic JSON file, with optimistic revision checks to prevent stale-tab overwrites. This local prototype does not initialize PostgreSQL or SQLAlchemy; that remains the intended shared application store before device sync and production. No Raira food or medication records are read or migrated.

Food records include nullable, finite, nonnegative calories/protein/carbs/fat values. Older records load with unknown nutrition without being rewritten on read. Saved-meal, plan and log nutrition values remain independent copies.

## Exercise records

`app/exercise.py` implements GET/PUT `/api/exercise` for planned sessions, completed logs and saved workouts. Records include optional nonnegative finite duration/distance values and validated exercise rows (positive integer sets/reps, optional nonnegative kg). The independent private JSON store uses atomic writes and revision conflict checks like Food, preserving corrupt files and completed history. PostgreSQL and cross-device sync remain future work.

## Notes (local)

`app/notes.py` provides GET `/api/notes`, revision-checked PUT `/api/notes/{id}`, raw-body POST `/api/notes/images`, GET `/api/notes/images/{name}` and GET `/api/notes/{id}/export`. The export is a ZIP containing Markdown with title frontmatter and the note's referenced local images, rewritten to relative paths. Remote image URLs remain remote. Uploads allow raster signatures only, enforce an 8 MB streaming limit and assign UUID filenames; SVG/HTML and user-supplied file paths are not stored. Storage is private atomic JSON/images under `~/Library/Application Support/Ignis/notes/`, outside the repository. Preserve and back up that folder. No note publication, automatic Quartz build, PostgreSQL migration or production deployment is implemented here.

Run `PYTHONPATH=services/api services/api/.venv/bin/python -m unittest discover -s services/api/tests -p 'test_notes.py' -v` from the project root for storage/conflict/upload/export checks.

## Retired Markdown publishing

The Markdown web editor and Quartz publisher/reader have been removed. Publication routes and the local Quartz runtime are no longer present. Archived draft/image/export APIs remain available to preserve access to existing content. Saved notes remain under `~/Library/Application Support/Ignis/notes/`; previously generated publication files remain under `~/Library/Application Support/Ignis/notes-site/`. No content was migrated into Tiptap or deleted.

## Database-backed notebook (local)

The Tiptap notebook uses the implemented PostgreSQL/SQLAlchemy/Alembic layer under `app/db`, `app/models`, `app/schemas`, `app/services` and `app/api/routes`. It supports revision-checked saves, recoverable trash, page history and daily-on-use dumps. Run `scripts/notebook_database.py` to start the dedicated private local cluster and apply migrations before starting this API. See `../../docs/notebook.md` for startup, migration/recovery behavior, backup policy and validation. Browser API access remains localhost/same-origin only; no production/native authentication is implied.

## Hosted notebook API

`app.notebook_main:application --factory` is the dedicated hosted entry point, with session revalidation, a single configured owner and exact same-origin writes. It does not import the local integration app. `IGNIS_NOTEBOOK_DATA` selects the external hosted data/backup directory; `IGNIS_DATABASE_URL` remains server-only. Staging and production setup, role boundaries and restore checks are documented in `deploy/notebook/README.md`. Local API commands above remain unchanged.

## Notification Inbox

The notebook router also hosts persistent notification state and page reminders. `app/models/notebook.py`, `app/schemas/inbox.py`, `app/services/inbox.py` and migration `0002_notifications` implement the feature using the existing dedicated PostgreSQL database. Reminders use client request IDs for retry safety, and notification mutations do not increment page revisions. GET Inbox derives backup alerts from the existing backup warning marker and returns due notifications, a global unread count and a cursor. See `docs/notebook.md` for delivery semantics and the local-only release boundary.

## Local Meds connection to Raira

`GET /api/meds/vyvanse` returns only the Vyvanse dose/check-in fields required by Meds, plus the Raira profile timezone and owner day. History includes every recorded dose and response event up to now, with `range: "all"` and no lower date bound. `POST /api/meds/vyvanse/intake` accepts an explicitly entered positive amount, timezone-aware `taken_at`, and `clientEventId` UUID. `POST /api/meds/vyvanse/phase` accepts a dose id, `onset`/`strongest`/`wearing_off`, timezone-aware `occurred_at`, and `clientEventId`. Write times must be within the preceding seven days, with a one-minute clock-skew allowance. Source business rules validate medication ownership, stage order and the existing phase timing restrictions.

The local-only adapter runs a fixed Python program through `ssh cabecao` and `docker exec -i raira-api-1`. JSON values travel on stdin, never shell-interpolated arguments. It uses the existing trusted SSH identity and host verification. No service keys, auth cookies or credentials are exposed to React or added to this repository. The Raira medication service remains the source of truth; its `create_dose` and `create_response_event` functions perform all writes. A retry checks the client UUID and original values before invoking those functions. Errors never expose SSH stderr. `PATCH /api/meds/vyvanse/intake` edits a specific Vyvanse dose through the existing source service. The adapter checks ownership and keeps the intake before all existing response stages and within 36 hours of them. `POST /api/meds/vyvanse/undo` removes one specified mark after verifying Vyvanse ownership and its expected timestamp. Intake removal also requires the original amount, refuses linked phase marks/response reports, and preserves the source schedule-removal audit/habit reversal in one transaction. Missing records are an idempotent success; changed records are refused. No arbitrary-query, other-medication or server-command endpoints are exposed. Local host/origin checks apply; these routes are intentionally absent from `notebook_main.py` and require a separate deployment/authentication design before hosting.

Tests mock the transport and remote service; do not create test medication records against the live source.

The connected Habits three-dot menu supports Edit habit and Archive habit through the local `/api/raira/habits/edit` and `/api/raira/habits/archive` adapters. Edits accept only name, section, cadence and target, check the loaded configuration for stale changes, and retain completion records. Cadence cannot change after any check-in history; medication-linked cadence and targets remain managed by Meds. Archive calls the existing source soft-archive function and removes the definition from active lists without deleting its check-ins. Per-habit locks and matching-state retries protect Ignis operations; external source writers keep their existing behavior.

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

Taken now synchronizes its linked native habit in the same PostgreSQL transaction. New dose marks match the Vyvanse habit by medication slug and owner-day dose slot (first versus second dose), respecting habit cadence, start date, active status, rest days and target. Automatic completion events carry source `ignis_meds` and the native dose ID. Retries cannot add duplicates; manual check-ins are retained. Undo Taken reverses its automatic marks, while timestamp edits move marks to the proper period/slot with the old audit retained. Historical imports are not bulk-backfilled. Meds and habit writes use a consistent settings-lock order. Successful Meds writes invalidate the in-memory habit snapshot so navigation shows the latest check-ins. Raira is never called or changed.

Vyvanse habit check-ins now synchronize in both directions. A new check-in records Taken at the current time using the most recent active Vyvanse dose amount, or links to the matching existing first/second dose for the current owner-day. An initial amount must be entered in Meds if no prior dose exists. The shortcut requires a daily, one-check-in habit and respects first/second dose ordering and all existing recording guards. Dose creation and the automatic habit event commit atomically. Expected counts and shared Meds-then-Habits lock ordering protect retries and simultaneous taps from both pages. Undoing an automatic habit mark removes its linked Taken record only when no stages/reports prevent removal; historical/manual marks remain independent. Successful habit marks invalidate the in-memory Meds snapshot. No Raira records are read or changed by this flow.

Paired Vyvanse undo also resolves legacy imported `medication_dose_id` links and same-day manual marks for the corresponding dose slot. Undo Taken reverses matching habit completions before soft-removing the dose; unchecking the habit resolves that same dose and uses the standard removal service. Both changes commit together, retries converge, and unrelated habits and other dose slots are preserved. Saved stages or response reports block the removal before either record changes. Removed/reversed records remain in the native audit; Raira remains untouched.

Undo Taken now soft-clears every active Started/Peak/Wearing-off mark for the same dose, reverses its linked habit check-in, and soft-removes Taken in one transaction. This applies from the Meds action and the Vyvanse habit checkbox, including imported stages. The intake undo audit contains each cleared stage ID and its before/after payload, so cleared times remain recoverable in the native database audit. Repeated undo is idempotent and old stage request retries cannot resurrect removed marks. Stale-dose checks and saved-response-report protection still apply; a refusal leaves stages, dose and habit unchanged. Meds removal help and success messages describe the combined action.
