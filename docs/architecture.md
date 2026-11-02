# Architecture decisions

## Accepted

- One Ignis project folder, with separate applications under `apps/`.
- One SwiftUI application for iPhone and iPad in `apps/ios/`.
- React and TypeScript for the web application in `apps/web/`, initialized with Vite and Tailwind CSS.
- React Router for future navigation and TanStack Query for future API-connected screens.
- FastAPI with Python for the shared backend under `services/api/`.
- A dedicated PostgreSQL application database for Ignis.
- SQLAlchemy for database access and Alembic for schema migrations.
- Language-neutral API contracts under `shared/contracts/`.
- Deployment configuration under `deploy/`.
- A separate local Git repository on `main`, initialized through GitKraken's personal profile on October 13, 2026. Remote hosting is not configured yet.

## Tiptap workspace experiment (local, October 17, 2026)

The workspace now uses the official Tiptap React DragHandle and BubbleMenu integrations for top-level block reordering and selection formatting. Lists and quotes remain intact when moved; a single-transaction move command supplies keyboard and button alternatives and preserves editor selection. Moves are undoable and use the existing JSON autosave. Floating-menu and drag-position options keep stable references to avoid editor plugin registration loops during selection changes. No document storage format or backend contract changed.

The drag handle includes a sibling + control that creates a paragraph after the hovered block. It shares the slash picker, positioned from ProseMirror's cursor coordinates through Floating UI's virtual reference, scroll/resize updates and viewport collision handling. This menu is presentation state; it does not add slash characters to + insertions or change the JSON document format.

`apps/web/src/features/notebook/` provides a lazy-loaded `/notebook` experiment for a custom Notion-style workspace using Tiptap's MIT-licensed editor packages. Hierarchical page metadata and Tiptap document JSON are stored in a separate browser-local key, with JSON backup export and visible storage errors. This is an editor/workspace trial, not an accepted migration of Notes: `/notes`, its Markdown API, recovery state and local Quartz publishing remain unchanged. No database schema, OpenAPI contract, cloud service or deployment changes are needed for the experiment. A future integration must define lossless document storage and Markdown export compatibility before moving existing content; database views, synchronization, permissions and collaborative editing are separate product work.

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

## Editorial homepage (local, October 16, 2026)

The root web route now reproduces the user-supplied newspaper reference with its requested sample news content. Its responsive layout and typography are scoped to `src/features/home/`; it does not load or sync planner records. Existing daily tools remain at `/planner`, and Watch retains its hostname/path selection. Existing Structured/TickTick OAuth return queries continue opening the planner. No routing dependency was added. The menu connects these surfaces; sample article, subscription and podcast controls explain the available excerpt or missing content. Photographs and the sample logo are responsive windows into the supplied screenshot, with its original resolution limits; Poppins is self-hosted with its license. Production remains unchanged by this local work.

The backend folder responsibilities and implementation boundary are documented in `backend.md`.

Current authentication session storage is not an Ignis product database. Raira and its retained medication records remain separate. The local folder reorganization does not change server paths or the running deployment.

## Fairytale homepage refinement (local, October 16, 2026)

The homepage was refined from the newspaper reference into a continuous illustrated book leaf at the user's request. It retains the sample story content, full-width surface, red animated Ignis flame, menu routes and native dialogs. Locally hosted IM Fell typography, parchment grain, drop capitals, botanical masthead ornaments, original generated woodland illustrations and a page-number footer define the new design. Optimized WebP artwork and generation provenance live in `apps/web/public/storybook/`. All styling remains scoped to the homepage; this changes no backend, authentication or deployed site.

### Functional Today homepage

The approved book design now hosts the real Today experience, replacing the sample news stories. `useTodaySources` reads the existing status/import endpoints through the shared visibility-aware sync scheduler, shows cached imports immediately, and retains them on errors. It does not request new authorizations or mutate external records. Today reuses `dayOverview` and the Bahia day boundary; its next-task choice is local to the current day and mounted page. Food uses the existing `FoodPanel` with an optional editor-only/request interface, preserving revision checks, plan/log separation, saved-meal copying, cancel and undo. Its default planner presentation remains available. Source warnings and timestamps are disclosed in the footer. No API contract, persistent data model or production configuration changed.

`apps/web/src/styles/storybook.css` provides opt-in font/color tokens and shared book buttons, disclosures and dialogs. The homepage opts in; `/planner`, Watch and future SwiftUI screens remain separate interfaces for subsequent work. The branded masthead, woodcut red flame, generated woodland artwork and page folio are retained.

## Local calendar integration

Apple Calendar is read through a small macOS EventKit helper under `services/calendar-bridge/`, independently of the future SwiftUI iPhone/iPad app. The user selected all calendars configured on this Mac. This is a local, read-only integration; production and native app calendar access require their own implementation.

Apple Reminders uses a separate macOS EventKit helper under `services/reminders-bridge/`, with its own bundle identity and permission. It reads reminders only and keeps Calendar permission independent. Both Mac integrations stay outside production and the future iOS runtime.

### Watch subdomain

Watch is an independent production deployment on `watch.ignis.farm`, sharing Ignis Tinyauth protection. Its limited FastAPI entrypoint serves only the video library; local Structured/TickTick/EventKit credentials and routines are excluded from that image. Watch uses versioned atomic JSON records on a persistent host directory for this first release, matching the local food/exercise prototype's storage pattern. PostgreSQL remains the intended longer-term backend; no database or legacy data migration was performed. The video library is shared among accounts permitted by existing Ignis authentication. Local `/watch` data is independent of the server library.

## Notes editor (local, October 16, 2026)

MDXEditor is the accepted browser editor, in `apps/web/src/features/notes/`, routed at `/notes` with a lazy import. It edits standard Markdown with visual/source modes and raster image uploads. Existing Today, planner and Watch interfaces remain separate. No Obsidian installation is required. A future Quartz publishing adapter is still to be designed; no publish action or public site is configured in this increment.

`services/api/app/notes.py` owns local drafts, per-note revision checks, bounded raster uploads, private file serving and ZIP export with portable image references. This increment follows the existing local prototype's atomic file storage outside the code folder; PostgreSQL/SQLAlchemy/Alembic remain the accepted persistent backend before production or device sync. Draft JSON and uploaded images live under `~/Library/Application Support/Ignis/notes/`. Unsaved editor text has a browser recovery copy; saving to the API is explicit. Notes inherit the main local API's host/origin checks. The OpenAPI export is regenerated from the implemented app. No authentication, production stack or Raira data changed.

## Quartz publishing connection (local, October 16, 2026)

`apps/quartz/` owns the pinned Quartz installer and reader configuration. Quartz 5 runtime/dependencies stay outside the code folder; the installer uses the official upstream archive and lockfile, without initializing a repository. `services/api/app/notes_publish.py` builds explicitly selected saved Markdown snapshots, copies their referenced images and generates the published index. It never scans unpublished drafts into Quartz. Per-note revision checks and a cross-process publish lock prevent stale/competing writes. Successful builds switch the complete `notes-site/current` release symlink atomically; failed builds preserve the active output and publication metadata. Older releases remain for recovery.

`services/api/app/notes_reader.py` is a standalone read-only app bound to 127.0.0.1:8081. Keeping its origin separate from the authenticated writing/API origin also isolates active note HTML from the local integration API. It serves only active `public/` artifacts, including clean `.html` URLs; source snapshots and manifests are unreachable. The notebook offers Save draft, Publish/Publish update, View published note and Unpublish. Unpublish rebuilds without the selected snapshot and retains its private draft. The generated OpenAPI export includes publication status and mutation contracts.

This supersedes the earlier pending local Quartz adapter decision. Live hosting and access policy remain a separate configuration: the main Ignis homepage, existing authentication, Watch and Raira are unchanged. See `apps/quartz/README.md`.

### Published notes within Today (local, October 17, 2026)

The user chose to display published notes within the existing homepage. `apps/web/src/features/home/PublishedNotes.tsx` reads the publication-status API, lists the six latest saved published snapshots and links to their Quartz pages. Today remains the root experience. The section has independent loading/error/empty states and refreshes while visible and on focus without requesting private draft contents. The navigation Notes link targets `#home-notes`; the section provides an editor shortcut. This changes only the local web homepage, not production hosting or audience settings.

### Notebook organization refinement (local, October 17, 2026)

The Notes interface separates browsing, writing and publishing responsibilities within its existing component: library with search/status filters; manuscript with title, toolbar, content and save metadata; publishing rail with destination, publication state and export/help disclosures. Phone layouts collapse the library and stack publishing tools below writing. This is a scoped presentation refinement using the existing React/MDXEditor/Tailwind foundation and shared paper/ink tokens. No API, storage, publication or production deployment changed; existing unsaved-draft recovery and quiet field-focus behavior remain.

### Streamlined notebook and combined Save (local, October 17, 2026)

The latest requested layout removes the note-list caption, search/filters, recovery caption, word/date footer, separate publishing panel, export/help controls and Today backlink. The page retains a masthead title, one left note list and the writing surface. Its smaller Save action and save status sit below the editor.

Save now persists and publishes in sequence through `apps/web/src/features/notes/notesSaving.ts`. The publish request uses the revision returned by the successful PUT, never a stale client revision. Failed writes cannot trigger publication. A publish failure retains the confirmed saved draft in React/storage, reports partial success, and enables retry using the same revision without another PUT. Unsaved text recovery and existing API revision checks remain. The separate publication/export/unpublish endpoints stay implemented but their former editor controls are removed. This supersedes the earlier separate draft/publish button workflow. Live deployment remains unchanged.

### Per-note illustrations (local, October 17, 2026)

Drafts now carry allowlisted `illustration` and `pageLayout` settings with backward-compatible automatic defaults. `notes_illustrations.py` owns stable local topic selection and generated-HTML decoration after Quartz builds; `apps/quartz/assets/` owns the fixed ink artwork library. User Markdown and uploaded images are preserved. The editor exposes the choices in **Book design**, and Save uses the existing revision and atomic-publication flow. Reading a note does not invoke generation or an external service. OpenAPI and Markdown ZIP exports include the settings.

## Notebook as homepage (October 17, 2026)

The user promoted the Tiptap notebook to the Ignis homepage and requested it at ignis.farm. `/` now opens NotebookApp, with `/notebook` retained as an alias sharing the existing storage key; OAuth callback queries still open the planner. The previous Today homepage is preserved at `/today`. The notebook sidebar uses Ignis branding and keeps browser-only storage explicit. Links to the local Today/planner/Markdown tools appear only on localhost; production Watch links to its existing authenticated subdomain.

The approved production release replaces the old holding page with the built static app and adds an nginx page fallback. Missing assets and API paths retain real 404 responses. No application API, database, note migration, authentication change or shared-service restart is part of this release. localhost and ignis.farm storage are separate; synchronization and JSON backup import remain unimplemented.

### Bottom workspace menu (local)

The user requested the reference's bottom sidebar menu and selected existing tools/settings only. `WorkspaceMenu.tsx` supplies the workspace trigger, upward-opening native popover, existing navigation/backup actions and a notebook-name settings dialog. Desktop page navigation scrolls independently above the pinned footer. Browser preferences use a separate key; note contents, login and the single-workspace storage model are unchanged. This local refinement is not a production deployment.

## Reliable saving and Notion-style sidebar (local, October 17, 2026)

The accepted local milestone now uses the planned dedicated PostgreSQL store, SQLAlchemy models and Alembic migrations. Tiptap JSON remains the document format; page metadata and history are independent database rows. A workspace revision and PostgreSQL row lock provide atomic, stale-write-safe saves; concurrent merging is intentionally absent. The frontend queues writes, retains browser journals and exposes conflict/recovery actions, Trash and version restoration. Legacy browser content is preserved during migration. Database backups use daily-on-use custom-format dumps, and a real restore into a separate test database is verified.

The page sidebar provides collapsible trees, favorites, full-text search, drag/move alternatives and stable page URLs. Neutral whites/grays, sans-serif headings and compact controls replace the notebook parchment treatment only; Today and the older Markdown/Quartz surfaces keep their existing presentation and storage. Existing browser authentication is not API authorization. This foundation is local, with production/cross-device access pending a separate secure deployment. See `notebook.md`.

### Hosted notebook boundary (17 October 2026)

Keep the local integration API separate from the hosted notebook API. Hosted requests verify their session against the existing Ignis Tinyauth service and authorize only the configured notebook owner's verified email. Staging and production have separate PostgreSQL clusters, credentials, internal database networks and backups; no host database port is exposed. A migration job gates API readiness. A backup worker also runs while browsers are closed. The current live static notebook is not replaced by provisioning the production storage/API. Authenticated staging verification and an explicit production cutover remain separate steps. Deployment and backup limitations are documented in `deploy/notebook/README.md`.

### Reusable notebook views (local, 17 October 2026)

Premade view blocks reference editable personal lists stored once in their owning page metadata. Multiple views and pages can share a list; page duplication copies owned lists and remaps their references. The existing page revision, lock, history, recovery and backup contracts cover list changes. Optional notebook-page, imported-task and imported-meeting sources remain read-only adapters. This adds no generic database builder or new database migration. See `notebook-blocks.md`. These changes remain local until a separately requested deployment.

### Fixed notebook tools and chart blocks (local, 17 October 2026)

Tasks, Meds and Dashboard use dedicated singleton notebook pages; Meds renders the Dashboard view and the existing page metadata persistence. They are sidebar tools rather than insertable blocks. Meds copies the existing Dashboard layout and owned lists on first open, has independent settings, and has no cover. Home, Tasks and Meds share the shortcut row; Dashboard remains in Tools. The dedicated Calendar destination is retired, while its legacy storage kind remains accepted for recovery. The normal writing table remains; Table/Gallery/Feed data views are retired from insertion while old JSON remains readable. Charts use direct tabular input behind Edit data and keep configuration off their default surface. Image grids store uploaded/local image references or HTTP(S) URLs in validated block attrs. No external image service, generic database builder or new storage service is introduced. These changes require both local API and browser support before deployment.

### Local Meds and the Raira data boundary

Meds now uses its own Vyvanse component while retaining the existing fixed-page identity. The notebook store holds its page metadata only. The authoritative doses and response events stay in Raira; they are neither migrated into Ignis PostgreSQL nor cached in browser persistence. A local FastAPI adapter exposes an allowlisted read plus explicit intake/stage writes using Raira's existing service layer over the already trusted SSH connection. This preserves legacy validation and schedule side effects rather than introducing a competing medication database. The hosted notebook app does not include this local SSH adapter. Charts use observed timestamps and pairwise durations only; incomplete records are not interpreted as zero or converted into a clinical exposure curve.

### Notebook Habits (2026-10-18)

The fixed Habits page stores habit definitions and daily check-ins in the notebook page JSON (`habits`), using existing authenticated notebook persistence, recovery and history rather than a second local-only store. Frontend and API schemas validate IDs, unique real calendar dates, names and bounded collections; locked pages protect habit edits too. Daily keys use the browser's local calendar date, and completed days are explicit marks, never inferred from task or medication activity. Archiving retains all marks. Existing Raira medication and habit storage stays separate. No new database tables or data migration are required.

### Raira habits connection (2026-10-18)

The Habits fixed page additionally renders live Raira definitions and check-in history through a local, same-origin adapter (`/api/raira/habits`). A fixed remote Python program calls the existing source habit service; request values travel on stdin, not in shell arguments. Only filtered public habit fields are returned, excluding shortcut credentials. Explicit current-period check-in/undo requests use expected and desired counts; advisory locks serialize Ignis requests per habit and count/date/period guards prevent duplicate retry increments or stale undo requests. Medication-linked, paused, future-start and non-due habits cannot be marked through this adapter. External Raira writers retain their existing behavior. Source records remain outside Ignis storage. Notebook-owned habits continue to use the optional page `habits` field; the two stores remain separate and are never merged by name.

New habit creation is exposed through the local `/api/raira/habits/create` adapter. Only name, section, cadence and target are accepted; medication and schedule links cannot be created through this form. The adapter calls the existing source service without schema changes. A name-scoped advisory lock and exact configuration matching make repeated Ignis creates reuse an existing matching record; conflicts ask for a different name. The shared Habits tab renders any older notebook-owned habits without moving their data into Raira.

The connected Habits three-dot menu supports Edit habit and Archive habit through the local `/api/raira/habits/edit` and `/api/raira/habits/archive` adapters. Edits accept only name, section, cadence and target, check the loaded configuration for stale changes, and retain completion records. Cadence cannot change after any check-in history; medication-linked cadence and targets remain managed by Meds. Archive calls the existing source soft-archive function and removes the definition from active lists without deleting its check-ins. Per-habit locks and matching-state retries protect Ignis operations; external source writers keep their existing behavior.

Single-choice dropdowns across the web app use `src/components/Dropdown.tsx` and `dropdown.css`: the same dark menu, 28px desktop rows, selected-option checkmark, bounded scrolling, viewport-aware positioning and 44px touch rows. Habit cadence, board layout, list/view settings, task configuration, Meds dose choice and other tool forms share the control. Existing searchable/tag pickers retain their specialized behavior. Menus support arrow keys, Home/End, type-ahead, Escape and focus return, and render in the native popover top layer inside dialogs. Only the presentation/control changes; the underlying values and data connections are unchanged.

The Habits page presents connected records as a horizontal 16-week contribution-grid overview and responsive monthly calendar cards. Month navigation and recorded-date inspection are read-only; check-in/undo and edit/archive use their existing explicit controls. Streaks and all-time completion percentages come from the source snapshot. Missing history and future dates are distinct from incomplete periods, and weekly/monthly habits show their actual period records rather than inferred daily marks. Existing tabs, new-habit form, source ownership and data storage are preserved.

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

The Habits presentation now uses flat divider rows instead of boxed cards. A leading circular check-in control shows a filled accent dot when completed. Monthly history uses date labels and small completion dots in a horizontal line; mobile rows put the scrollable month below the habit name and controls. Date inspection, stats, menus and all native/bidirectional check-in behavior are preserved.

### Reading journal inside Habits

The Read tab stores typed books and dated page-count sessions in the Habits notebook page's optional `reading` JSON field. It uses the existing notebook snapshot revision and backup path rather than a separate browser store or provider connection. Both client and FastAPI validate book references, unique IDs, ratings, real dates, and positive integer page counts. The page's lock covers reading changes. Monthly totals and stacked daily chart segments are derived from sessions; imported habit and medication records remain separate.

### Monthly mood journal

Habits exposes a Mood tab with original SVG cat silhouettes and expression variants, driven by six mood IDs. The page's optional `moods` array stores one date/mood pair per day. Client and API validation reject invalid dates, duplicate days, and unknown mood IDs. Empty arrays and missing legacy fields compare consistently for notebook acknowledgements; moods are included in locked-page protection. Coloring is a normal notebook mutation, without provider writes or a separate browser storage store.

### Removal of the standalone Today page (October 18, 2026)

The user requested removal of the legacy Today tool. The workspace menu no longer links to it; the `features/home` screen, page CSS, Today source hook, and published-notes overview were removed along with their exclusive ornaments, textures, and fonts. Legacy `/today` URLs resolve to the notebook. The planner's day overview and source connections remain independent. Meadow/woodland cover images and IM Fell fonts remain because the notebook cover gallery and Markdown Notes still use them. No provider data, published notes, database tables, or live deployment was removed.

### Removal of the standalone Planner page (October 18, 2026)

The user requested the same removal for Planner. The menu entry, `src/App.tsx`, and its exclusive day overview, food/exercise panels/models, provider connection panels, sync hook, and matching frontend tests/scripts were removed. Markdown Notes navigation now links back to Notebook and Watch. The entry point renders Watch or Notes on their explicit paths and the notebook elsewhere, so legacy Planner, Today, and OAuth-return URLs no longer load the retired interface. The notebook's source readers and native trackers remain independent. Provider API adapters, private connection credentials, food/exercise records, database tables, and native app scaffolds are preserved. This is a local-only change.

### Removal of the Markdown Notes editor (October 18, 2026)

The user requested the same removal for Markdown Notes. Its menu link, `/notes` editor branch, `features/notes` files, frontend tests, shared book CSS now unused by the web app, and MDXEditor dependency were removed. Legacy `/notes` URLs now render the notebook. Saved Markdown notes, uploaded images, revisions, publication APIs, and Quartz releases remain untouched. Reader fonts/licenses and the oak illustration are now owned by `apps/quartz/assets`, and the publishing builder copies from that location. No live deployment was performed.

### Quartz retired (October 18, 2026)

The user explicitly approved removal of Quartz after adopting Tiptap. `apps/quartz`, its local runtime, and the API publisher, reader, illustration adapter, and matching tests were removed. The publication router was unregistered and OpenAPI exports regenerated. No reader was listening on port 8081 at removal. Saved Markdown drafts/images and the `notes-site` directory containing publication manifests, snapshots, and generated releases remain intact under private application support. The archived draft/export API stays available; nothing is automatically migrated into Tiptap. This supersedes earlier Quartz setup and preservation-of-runtime decisions. No live deployment changed.
