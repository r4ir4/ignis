# Notebook foundation — local implementation

The notebook now has PostgreSQL-backed saving and a neutral, Notion-style sidebar. This stage is implemented and running locally; the deployed ignis.farm frontend still uses its previous browser-only build. The local API is not production-authenticated and must not be exposed publicly. Cross-device access requires a separate authenticated production deployment.

## Start

Use Node.js 24 for the web app. Install the API's pinned requirements in its existing Python 3.13 virtual environment. PostgreSQL 18 is installed through Homebrew on this Mac; it is not registered as a login service.

From the project root:

```sh
services/api/.venv/bin/pip install -r services/api/requirements.txt
services/api/.venv/bin/python services/api/scripts/notebook_database.py
services/api/.venv/bin/uvicorn app.main:app --app-dir services/api --host 127.0.0.1 --port 8000 --no-access-log
```

In a separate terminal, `cd apps/web` and run `npm run dev`. Open http://127.0.0.1:5173/. The existing Vite proxy routes `/api` to port 8000.

The database script initializes a dedicated cluster, creates `ignis_notebook` if absent, creates a pre-import dump and applies Alembic migrations. It is safe to rerun. It uses a private Unix socket under `~/Library/Application Support/Ignis/notebook/socket`, port identifier 55437 and **no TCP listener**. Data, logs and backups stay outside source under `~/Library/Application Support/Ignis/notebook/`. The directory and socket are private to the local macOS user; production must use proper database credentials and API authorization. `IGNIS_DATABASE_URL` can supply a separate server-only SQLAlchemy connection URL. Do not put credentials in source.

## Saving and recovery

`GET /api/notebook` reads one consistent workspace snapshot. `PUT /api/notebook` validates the entire page tree and document sizes, locks the workspace revision, and commits page updates and per-page history atomically. A stale revision returns 409. Existing pages cannot disappear from a PUT; deletion is represented by `deletedAt`, preserving their text and history. Cycles, missing parents, unsupported document nodes and an active child of a trashed parent are rejected. The current coarse workspace revision deliberately detects concurrent edits even to different pages; collaborative merging is not implemented.

The client debounces saves, serializes requests and queues edits made during a request. “All changes saved” requires server confirmation. Failed saves keep the editor text and a durable browser journal. Reloads recover the tab's pending draft; conflicts offer Keep both versions (new page IDs) or Open server version, and keep the prior journal available under Workspace menu → Browser recovery. That panel recovers journal pages as separate copies. Opening server content or restoring history resets the editor content, preventing stale visual text from overwriting restored data on the next edit.

The previous `ignis.tiptap.playground.v1` value is never removed or rewritten. On an empty database, its valid pages import through the revision-checked API. If the database already has different content, the previous browser copy is archived into Browser recovery rather than merged silently. Browser settings use their own key. API errors and recovery-storage failures are visible; leaving with unconfirmed server changes warns the user. This is not an offline collaborative sync engine.

## Pages and sidebar

The sidebar has collapsible nested pages, favorites, body/title search, new subpages, and recoverable Trash. Page IDs are stable in `#page=<UUID>` links and browser navigation. Pages can be moved under another page by dragging; Page actions → Move page supplies a keyboard/touch alternative and excludes descendant targets. Page actions also offers Rename, Duplicate (including nested pages), History, Export and Move to trash. Restoring a child restores the necessary ancestors. History exposes up to 50 recent saved versions per page; restoring creates a new save instead of rewriting old history.

Desktop uses a compact neutral sidebar, white writing surface, sans-serif headings and a bottom workspace menu. Mobile keeps an expandable page panel and viewport-bounded menus. Existing Tiptap block dragging, insertion and text-selection formatting remain.

## Backups

Each successful API save attempts a dump after commit if no dump exists for the current UTC date. This runs while the API is in use, not as a scheduler when it is closed. Dumps are PostgreSQL custom archives, private (0600) and never automatically pruned. Failure leaves `backups/backup-error.txt`; the next notebook load shows a backup warning. Database saving remains independent of the dump. To attempt today's dump manually:

```sh
services/api/.venv/bin/python services/api/scripts/notebook_backup.py
```

Include the external notebook directory in machine backups. The browser's JSON export remains available. Database dump/restore was tested against an independently created test database; never restore a dump over a populated product database without first backing it up and verifying the intended destination.

## Validation

The notebook API tests create uniquely named disposable databases on the dedicated local PostgreSQL cluster and apply the real Alembic migration. They do not truncate the application database. They cover migration/save/read, stale writes, simultaneous writers, input/tree validation, trash/history and an actual pg_dump/pg_restore round trip.

```sh
PYTHONPATH=services/api services/api/.venv/bin/python -m unittest discover -s services/api/tests -q
cd apps/web
npm run test:notebook
npm run build
```

Manual browser checks cover legacy import, nested-page URLs, bold formatting after reload, favorites, full-text search, collapse/expand, failed-save retry after restarting the API, stale-tab conflict, version restore, Trash/restore and mobile width. No production deployment, Raira migration, authentication change or Quartz note conversion was performed.

## Reliability review — 17 October 2026

Fixed and covered with fault-injection tests against the actual saving hook:

- Edits typed while a save is pending remain queued behind the acknowledged revision. Recent unconfirmed requests are retained in memory so a committed save with a lost response can be recognized on retry, even after more typing. If none matches, the client keeps an explicit conflict instead of overwriting server content.
- Retry, recovery and conflict-resolution operations cannot replace the notebook during an outstanding write. Retry preserves the conflict message and its resolution buttons. Unsaved-tab protection remains active during reconnects.
- Opening server content and acknowledging an already committed recovery draft both refresh the offline cache. Corrupt journals are preserved but excluded from editor input; a malformed journal cannot prevent an offline reload from using a valid cache.
- Page trees and basic document structure are validated before rendering browser journals or trusting successful API responses. A malformed success does not clear recovery data.
- Opening another version requires the current draft to be archived successfully. If browser storage is full or unavailable, the current draft stays open with instructions to download a copy and free storage.
- Database dump setup and cleanup failures are contained after the transaction commits. Each partial dump uses an exclusive private temporary file, preventing API processes from sharing a partial dump. If even the warning file cannot be written, the API logs a sanitized warning; this case requires checking server logs.

The hook tests use deterministic transport, storage and timers without modifying the real notebook. The API suite uses disposable databases, including dump/restore validation. A normal browser reload was also checked against the local app and showed saved content with “All changes saved.” These checks do not constitute a production deployment or a guarantee against every failure. Very old ambiguous writes, recovery across devices and automatic collaborative merging still require explicit conflict handling.

Before production: enforce trusted authenticated identity at every notebook API route, provision the separate production database and backup destination, and verify restore plus the authenticated cross-device workflow in staging. Current API host/origin restrictions and the private Mac socket are local-development boundaries, not production authorization.

## Hosted staging (17 October 2026)

The next milestone is now running at `https://staging.ignis.farm`: existing Ignis sign-in, verified owner-only API access, an isolated staging PostgreSQL database and a separate prepared production database/API. At the staging milestone the live frontend had not yet been replaced; the later production promotion below preserves and migrates its pages. See `docs/notebook-staging-validation.md` for completed checks and `deploy/notebook/README.md` for operations and remaining backup/release boundaries.

## Production promotion (17 October 2026)

The authenticated notebook is now live at https://ignis.farm. The release preserves 3 active pages, 1 trashed page and all 12 original history entries from the local and browser notebooks, with original IDs and content unchanged. A fresh off-host backup of the deployed database was restored successfully. See `docs/notebook-production-release.md` for full evidence and rollback. The local app remains separate; it is not a continuously synchronized mirror of production.

## Notification Inbox (local development)

Inbox is a notification panel beside navigation, with pin/unpin, resizing, unread count, Unread & read / Unread / Archived / All workspace updates status filters and Reminders / Workspace type filters. Reading retains a notification; archiving retains it with an Unarchive action. The older Inbox capture page remains an ordinary page and is preserved.

Alembic revision `0002_notifications` adds a dedicated notification table; page JSON and revision/history are untouched. The owner-authenticated notebook router exposes GET `/api/notebook/inbox` (cursor pagination, status/type filters and global unread count), PATCH `/api/notebook/inbox/{id}`, POST `/api/notebook/inbox/read` (explicit IDs only), and GET/POST `/api/notebook/reminders`. All hosted routes inherit session revalidation and same-origin writes. The local database was backed up before applying this additive migration.

Page actions → Remind me schedules a database-backed reminder using an idempotent request ID. Dates are stored in UTC and displayed in the browser's timezone. Future reminders can be canceled from the same dialog. Due reminders appear when Inbox polls (every 30 seconds while visible), on focus/return, or when opened. This is an in-app Inbox: browser push, email, operating-system notifications, comments and mentions are not implemented. Backup warning markers generate deduplicated Workspace notifications; clearing the marker does not erase the alert. No sample notifications are seeded.

PostgreSQL dumps include read/archive state and scheduled reminders; the dump/restore test verifies these records in a disposable database. Browser page JSON exports cover pages, not notifications. Deploying this feature later requires applying the API migration and matching frontend release together; production was not changed here.

## Meetings sidebar (local development)

Home and Meetings change only sidebar navigation and keep the current document open. Meetings displays the existing local Apple Calendar snapshot as a read-only upcoming-events list. It shows the next seven days, initially limited to three events, with expansion and an explicit Refresh action. Connect requests calendar access only after a user click. No meeting-note creation, recording, transcription or calendar writes are included. Hosted calendar authorization and Chat remain separate work.

Pages produced during the earlier meeting-note trial remain compatible with the nullable category field in the page schema. That metadata is retained through history and Trash recovery rather than stripped from existing records. The trial's extra note-creation interface has been removed. This feature remains local; no production release is included.

The notebook shortcut row now contains Home, Tasks and Meds. Meds is a separate saved page copied from the existing Dashboard on first open, without a cover image. Dashboard remains in Tools. The standalone Calendar page is retired from navigation and active page selection; old Calendar records remain preserved for recovery.

### Task property layout (October 19, 2026)

The list's existing `propertyDisplay` JSON carries optional `order` positions (0–33) for built-in and custom task fields. Built-in keys are `status`, `date`, `value` and `image`; custom keys must reference current definitions. Reordering normalizes all current positions atomically while preserving task payloads and property settings. Missing order values retain the legacy Status → Date → Value → Image → custom-fields order. Frontend save acknowledgement comparisons normalize missing/null order values consistently with the API.

Value and Image can be removed from the task-page layout and restored without clearing saved numbers or image links. Board card settings remain independent. The API must be updated with the frontend to accept the extended display metadata; storage uses existing page JSON and needs no database migration. The matching frontend and API schema were deployed to production as `20261019-task-properties`; see `notebook-production-release.md`.
