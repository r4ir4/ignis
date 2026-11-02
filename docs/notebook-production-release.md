# Notebook production release — 17 October 2026

The authenticated notebook is live at **https://ignis.farm**. It uses the existing Ignis sign-in and allows the configured owner, `rairarocks@gmail.com`. Staging remains separate. The localhost app and its PostgreSQL database remain untouched development copies; use the live origin for future shared-device notebook work.

## Preservation and verification

Before the release, both browser notebooks were exported through their visible Download/Export controls. The local database snapshot and all page-history records were exported under a workspace lock, and a full local PostgreSQL dump was retained. The current live static site/configuration and the pre-import production/staging databases were also backed up.

The production database was confirmed empty at revision 0. The one-time `deploy/notebook/import_existing.py` migration was rehearsed against a disposable database before applying it. It imports all local pages and old history, merges browser sources by ID, retains distinct IDs, and preserves differing versions under new IDs if a collision occurs. Identical pages deduplicate. The script locks the destination and refuses a populated database; it never replaces existing production records.

Result: **4 original pages: 3 active, 1 in recoverable Trash**. All original page IDs, parent relationships, titles, rich text, checklist state, favorites and Trash flags match the source exports. All **12 pre-existing history entries** retain their payloads, revisions and timestamps. The migration adds a current import snapshot for each page. A reversible favorite toggle tested real production saves and returned the page to its original state; production then held 18 history records at revision 14.

The original `Ideas for Ignis` link works at `https://ignis.farm/#page=856a1783-66ee-4dc7-b005-ed7a64228718`. Browser verification confirmed its heading and checked task, old history entries, recoverable Trash, authenticated saving and full reload. Anonymous requests, including a spoofed owner identity header, return 401. The owner check remains in the hosted API.

Both the live browser's starter page and the separate local starter page are retained, even though both are titled “A place for your thoughts.” No content was deleted to remove that visual duplicate. Browser-local legacy storage is never removed by the new client. A different browser with additional legacy pages retains those under Browser recovery rather than overwriting server content.

A fresh post-release off-host backup was pulled through the Mac LaunchAgent and restored into disposable databases. Production recovered all 4 pages, 18 history records, revision 14 and schema `0001_notebook`; staging recovered its independent 5-page fixture set. Original local database revision remained 11. No Raira/medication data, Watch data, auth.env or authentication volume was migrated or modified.

## Deployment layout

- Existing `ignis-site-1` remains the production frontend/gateway, using `/opt/ignis/public/` and `/opt/ignis/nginx.conf`.
- Only the notebook API path is proxied to `ignis-notebook-production-api:8000`, using Docker DNS re-resolution, cookie forwarding, and cleared client identity/forwarding headers. Other local integration APIs remain unavailable.
- New static assets were copied first without deleting old assets; index.html was replaced atomically. Nginx was syntax-checked and reloaded, preserving the mounted configuration inode.
- The existing frontend, auth and Watch API containers retain their original start times. No existing containers were recreated for this cutover.
- The extra `site` service under the prepared production compose stack stays disabled. **Do not enable its release profile**: the existing gateway already owns the production hostname.

Frontend index SHA-256: `c2b9f4747f197438ba1373f8eef5b1fc7b7389078ca90e66b453f4ac4c2811ac`.
Hosted API image: `sha256:c2d858603ed719468211168d73846d1729f918f1ca377a3260852ce962266152`.

## Backups and rollback

Private release directory on the VPS: `/opt/ignis/notebook/releases/20261017T150254Z/`. It contains `previous-site.tar.gz` (old public assets, nginx.conf, compose.json), the private import input, and `before-import.tar` / `after-deployment.tar` database bundles. The corresponding Mac directory is `~/Library/Application Support/Ignis/notebook/releases/20261017T150254Z/`, retaining both browser exports, the local snapshot/history, and `local-before-release.dump`. These contain private notes and must never be served as public assets or committed.

Recurring off-host copies remain in `~/Library/Application Support/Ignis/notebook/offhost/snapshots/`. The verified post-release snapshot is `20261017T150624.857271Z`. It contains both notebook databases, with checksums verified before atomic publication. Mac availability limits still apply; see `deploy/notebook/README.md`.

To roll back the frontend, extract the old `public/index.html` and `nginx.conf` from `previous-site.tar.gz` into a new private rollback directory. Copy that index into the live public directory via a temporary file and atomic rename. Write the old nginx.conf into the existing mounted file, syntax-check, then reload nginx. Old assets have been retained. Keep the new notebook API/database and its backups intact: rolling back the frontend must not undo saved notebook records or restore an older dump over them. The old frontend uses its original browser storage; newer cloud edits remain preserved in PostgreSQL and the post-release backup.

## Native trackers and notebook refresh — October 18, 2026

Release `20261018T161120Z` deploys the current Tiptap notebook frontend and hosted image `ignis-notebook:20261018T161120Z`. Production was upgraded from `0001_notebook` to `0007_native_meds`. The existing gateway now forwards only `/api/notebook`, `/api/habits` and `/api/meds` to the same owner-authenticated API. API and backup containers were recreated; the gateway was reloaded, and authentication, staging, Watch and Raira were untouched.

The user authorized copying local trackers while preserving production pages. The private additive import copied 28 habit records, 307 completion/audit records, 74 medication dose records, 126 phase records, 53 medication source archives and two audit records, plus both settings rows and the fixed Meds/Habits pages. Reading and mood records are carried by the Habits page. Archived/reversed source records are retained. The import locked the workspace, refused populated destination tracker tables or page ID conflicts, verified every tracker table by checksum, and preserved all four existing page payloads. The full-width presentation migration was reconciled to retain those existing payloads. New page history records document the import. No original Raira data was changed.

The migration/import was rehearsed on a disposable production database restore, including rejection of a repeated import. Build, 176 frontend tests and 221 backend tests passed. Authenticated browser checks verified the existing notebook pages, habits, medication timeline, reading data and eight mood entries. Anonymous and spoofed-identity requests remain rejected. Nginx syntax and API health passed. No medication check-ins were created for QA.

Private release artifacts live under `/opt/ignis/notebook/releases/20261018T161120Z/` and the matching Mac folder in `~/Library/Application Support/Ignis/notebook/releases/`. They include prior static/config and compose backups, pre-upgrade and cutover PostgreSQL dumps, local full dump, tracker export, private import/rehearsal scripts, import checksums and fresh post-release off-host database archives. A post-release production dump was restored into a disposable local database: imported records, existing page fields, reading/mood data, schema and history validated. The user made subsequent production check-in reversals and page changes during verification and confirmed these were intentional; they were retained, never replaced by the local export.

Rollback should restore the previous frontend index and nginx configuration without deleting retained assets or reverting the database. The old image remains available. Do not rerun the additive import into populated tables or restore pre-release data over new production edits. Future production tracker edits save only to Ignis; local development and production databases remain separate.

## Image resizing — October 19, 2026

Frontend-only release `20261019T095831Z-image-resize` adds proportional mouse/touch resizing, keyboard resizing and 25%/50%/100% controls to editor images. Clipboard image files open the existing upload dialog with the file selected. Image dimensions use the existing Tiptap JSON attributes; no API or database migration was needed.

Before release, an isolated build with these image changes removed matched the production notebook JavaScript after normalizing its entry-chunk import name. Node 24 production build and all 165 notebook tests passed. New hashed assets were copied first, retaining old assets, then index.html was replaced atomically. Site, authentication, API and PostgreSQL container start times remained unchanged; no configuration or service restart was needed.

Authenticated production verification pasted a same-origin image into a temporary test page, resized it to 50%, waited for All changes saved, and reloaded. Its 663px width and 442px height survived the reload. The test page was then moved to recoverable Trash. Anonymous site/API requests and spoofed identity requests returned 401. Existing notes and trackers were not edited.

The previous public directory is backed up at `/opt/ignis/notebook/releases/20261019T095831Z-image-resize/previous-public.tar.gz`; staged release files and container-start evidence are beside it. Current index SHA-256: `0dd278ee78c6722063b46f9ca4af2e03a7ece50ae7ce5e07215f83b048ac29f4`. Previous index SHA-256: `03c002449f5363ca8b4b2ba5bf8703934b04ada7151ce6f7a07db6f31b6a185e`.

Rollback: extract `public/index.html` from that archive into a private directory, copy it to a temporary file inside `/opt/ignis/public/`, and atomically rename it to `index.html`. Retained hashed assets support the prior entry point. Do not restore databases or authentication state for this frontend rollback.

### Image selection border — October 19, 2026

Frontend-only release `20261019-image-border` removes the image frame outline on hover/selection and the generic selected-node outline for image blocks. Contextual resize controls and keyboard focus indicators remain. Build JavaScript matched the previous live files after normalizing chunk names; the CSS diff contained only these two outline changes. Node 24 build and TypeScript checks passed.

The previous public directory is backed up at `/opt/ignis/notebook/releases/20261019-image-border/previous-public.tar.gz`. New asset checksums matched before atomic index replacement; old assets remain available for rollback using the index procedure above. Current index SHA-256: `3d72bccaccdb4a28eabdbf45eb63cfe4e20247bbeaee1ed6c00bf00935d9d349`. Gateway, authentication, API and database start times remained unchanged. Anonymous HTTPS access returned 401. Authenticated browser verification reloaded the user's page and selected its existing image: no outline appeared, and contextual resizing controls remained available. No content, database, configuration or authentication changes were made.

### Image hover controls and side-by-side insertion — October 19, 2026

Frontend-only release `20261019-image-rows` limits image percentage controls to image hover and keyboard focus, with selection revealing them on touch devices. The contextual **+ Image** action opens the existing upload/link dialog and adds a neighboring image using the existing column layout, up to five columns. Side drops now use the visible image frame edges. Existing document storage and responsive column behavior remain in use; no schema or API change was needed.

The Node 24 build, TypeScript checks and 167 notebook tests passed. Local editor checks verified insertion into a two-column row and hover dismissal; regression tests cover JSON reload, single-step undo/redo, metadata preservation and the five-column limit. Production verification reloaded the existing page, confirmed controls appear over the image and hide away from it, and opened/cancelled Add image beside without modifying page content.

Previous public files are backed up at `/opt/ignis/notebook/releases/20261019-image-rows/previous-public.tar.gz`. Uploaded JavaScript and CSS checksums matched the tested build before atomic index replacement; old hashed assets remain for rollback using the index procedure above. Current index SHA-256: `277e129df9265c6c495afa16c148955ab39860095cd0a0ed9ccfc08e31f16409`. Container start times remained unchanged and anonymous HTTPS access returned 401. No database, authentication or service configuration changes were made.

### Direct image dragging — October 19, 2026

Frontend-only release `20261019-image-drag` enables dragging an editable image itself using Tiptap's node-view drag handle and the existing column drop preview. Dropping beside an existing image moves the original image into a neighboring column. Locked images remain non-draggable. No API or database changes were required.

Local browser checks dragged the second image to both the right and left edge of the first image, preserving image metadata and dimensions; one-step undo restored the original vertical layout. Node 24 build, TypeScript checks and all 167 notebook tests passed. The uploaded JavaScript and retained CSS checksums matched the tested build before atomic index replacement. The authenticated live page reloaded successfully with its existing content and All changes saved. No production content was edited for this release verification.

Previous public files are backed up at `/opt/ignis/notebook/releases/20261019-image-drag/previous-public.tar.gz`. Old assets remain available for rollback using the index procedure above. Current index SHA-256: `4051c02b73d2f5e356f77b9276090a4538a53e8bd6e800fcae8e67d0722d61ea`. Container start times remained unchanged; anonymous HTTPS access returned 401. Authentication, databases and service configuration were unchanged.

### Configurable task properties and alignment — October 19, 2026

Release `20261019-task-properties` deploys optional Value/Image task rows, shared built-in/custom property ordering through Customize properties, and the reported card-date and option-action alignment fixes. Removing a built-in row retains its saved values and allows restoring it through layout settings. The API accepts optional integer order metadata and the built-in Status/Date/Image display keys. No database migration or data conversion was needed.

The production schema diff was verified to contain only those metadata additions. Image `ignis-notebook:20261019-task-properties` derives from the exact current production image, replacing only `/app/app/schemas/notebook.py`; its two schema regression tests passed inside the built image. Only the production compose API image was changed, then that API container was recreated with no dependencies. Database, authentication, gateway, backup worker, staging and Watch retained their running services. API health passed before the frontend index switch.

Node 24 build and TypeScript passed; the 169 notebook tests and two API layout tests passed during implementation. Local browser verification exercised Value/Image removal, retained values on restoration, pointer dragging and arrow-button property reordering, and the reported alignment states. Uploaded frontend hashes matched the tested build. Authenticated production checks reloaded Tasks, opened Customize properties and the project option menu, and visually confirmed both alignment fixes. Production content and layout settings were not edited for these checks. Anonymous site and notebook API access remained 401.

Private artifacts are at `/opt/ignis/notebook/releases/20261019-task-properties/`: `previous-public.tar.gz`, `previous-compose.json`, the prior schema, container start evidence and `before-release-databases.tar`. That fresh staging/production dump bundle was copied off-host to `~/Library/Application Support/Ignis/notebook/releases/20261019-task-properties/`; archive and individual dump checksums matched. No restore was applied to application databases. Current index SHA-256: `9521bb898d8a08949a74079ce2f73f4433e8ec081ceff8a6c7a4797cc0186f1a`.

Rollback the frontend by atomically restoring its prior index from the public archive. Keep the additive API schema update when rolling back the frontend, so any newly saved ordering/display metadata continues to validate. Do not restore older databases or authentication state over current edits.

### Direct task and property dragging — October 19, 2026

Frontend-only release `20261019-direct-task-drag` adds direct property-row reorder grips and replaces Board card up/down controls with a six-dot pointer drag grip. Properties share the existing list-wide ordering; cards share the existing manual-order/status save behavior. Empty-column moves, insertion indicators, outside-drop cancellation and keyboard alternatives are retained. No API/schema/database change was required.

The Node 24 build, TypeScript checks and 169 notebook tests passed. Local browser checks exercised direct property moves in both directions, keyboard reordering, same-column card reordering, moving into an empty status column, invalid outside drops and keyboard column movement. Task values remained intact. Uploaded asset checksums matched the tested build before atomic index replacement. Production verification reloaded Tasks, confirmed card grips and direct property handles, and preserved the user's current layout and newer task records without editing them. Anonymous HTTPS access remained 401. Container start times were unchanged.

Previous public files are backed up at `/opt/ignis/notebook/releases/20261019-direct-task-drag/previous-public.tar.gz`; container start evidence is beside it. Current index SHA-256: `4a352886f28a13e39bbb26f76d5da52801d3c87f8ad620d089f68493b83fc503`. Old hashed assets are retained; rollback restores the prior index atomically using the earlier index-only procedure. Do not restore databases or authentication state.
