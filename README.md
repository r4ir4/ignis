# Ignis

Ignis targets iPhone, iPad and the web. The chosen platforms are SwiftUI for a shared iPhone/iPad app and React with TypeScript for the web app. The backend stack is FastAPI with Python, PostgreSQL, SQLAlchemy and Alembic.

The live site at https://ignis.farm opens the Tiptap notebook, protected by the existing Tinyauth login. Pages currently save in each browser; there is no server storage or device synchronization for this notebook. This folder contains the React/TypeScript/Vite/Tailwind web app, its deployment configuration and the separate native/backend applications. The local web app includes the notebook and Watch. The SwiftUI project is not initialized. The backend now has a local-only FastAPI Structured connection/import proof; the application database is not initialized. Git was initialized locally on `main` through GitKraken's personal profile on October 13, 2026. No remote is configured yet.

## Structure

```text
ignis/
  apps/
    ios/                  # One SwiftUI app for iPhone and iPad
    web/
      index.html          # Vite HTML entry
      public/             # Static assets
      src/                # Minimal React/TypeScript app and Tailwind CSS
      package.json        # Web dependencies and local commands
    project-site/         # Static pages for https://project.ignis.farm (vendor-src/ holds the Tiptap bundle source)
    portfolio/            # Hand-written one-page portfolio, live at https://raira.dev (public/: index.html, style.css, script.js, img/)
  services/
    api/                  # FastAPI backend shared by the apps
      app/                # Routes, settings, database access, models, schemas, services
      migrations/versions/ # Alembic migration revisions
      tests/              # Future backend tests
    project-api/          # Source copy of the live api.ignis.farm service
      app/                # FastAPI app: auth, SQLite, and the project.ignis.farm routes
      connectors/         # Whoop and Garmin sync scripts
  shared/
    contracts/            # Future language-neutral API definitions
  deploy/                 # Production Docker Compose and nginx configuration
  docs/                   # Architecture and project decisions
  AGENTS.md               # Working rules for this project
  README.md
  .gitignore              # Excludes credentials, dependencies and build output
```

Each application owns its interface. The planned shared API owns persistent data and common business rules. The backend folder structure is prepared, with a runnable local Structured connection proof but no application database yet. See `services/api/README.md` for the folders and `docs/backend.md` for the accepted backend stack.

`services/project-api` is a source copy of the live service at `/opt/ignis/api`, which backs https://project.ignis.farm and https://api.ignis.farm. It is separate from the notebook API in `services/api`. Secrets stay in `/opt/ignis/api/secrets` and the SQLite database stays in `/opt/ignis/api/data`; neither is in this folder. The four `import_*.py` scripts are local one-offs and are not deployed. A consistent copy of that database is pulled to this Mac every six hours. See `deploy/project-api/README.md`.

The project site stays hand-written pages. It is not part of the React app in `apps/web`, and its SQLite database is not migrated into the notebook's PostgreSQL. See `docs/architecture.md`.

## Run the web app locally

Use Node.js 24 (Volta pins 24.14.0 for the web app):

```sh
cd apps/web
npm install
npm run dev
```

Open http://127.0.0.1:5173. Run `npm run build` to check TypeScript and produce `dist/`, or `npm run preview` to view that build at http://127.0.0.1:4173. The local preview does not run production authentication.

The original holding page is archived in `docs/archive/holding-page.html`. See `apps/web/README.md` and `docs/web.md` for the web setup.

The root route `/` opens the notebook; `/notebook` remains an alias and uses the same browser storage key. The former Today page has been removed; legacy `/today` links open the notebook. The Planner page has also been removed; old `/planner` URLs open the notebook. Start the local API alongside Vite for notebook persistence and `/notes`. These local API tools are linked only in the local notebook. Production links to the existing separate Watch site at https://watch.ignis.farm. The notebook homepage replaced the production holding page on October 17, 2026.

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
| `apps/web/dist/` | `/opt/ignis/public/` |
| `deploy/nginx.conf` | `/opt/ignis/nginx.conf` |
| `deploy/compose.json` | `/opt/ignis/compose.json` |

The Compose file uses production paths and the existing shared Traefik network; it is not a local development stack. The web build produces `apps/web/dist/`; deployment automation has not been implemented. The notebook frontend is deployed; nginx provides an HTML fallback for page routes while missing assets and `/api/` return 404. No local integration API was deployed.

Ignis has its own Tinyauth instance at https://auth.ignis.farm. Raira supplies sign-in through a dedicated OpenID Connect client. Ignis uses the same allowed-user list, HTTPS-only cookies, and a 90-day session expiry and maximum lifetime. Traefik handles HTTPS and the www redirect. Native app/API authentication is a separate implementation decision and is not implemented yet.

Credentials, authentication data and recovery archives stay on the server. Preserve `/opt/ignis/auth.env` and `ignis_auth_data` during deployment changes. Existing medication and other retained data belong to Raira and are not part of the Ignis application.

See `docs/architecture.md` for the current decisions and `docs/backend.md` for the backend plan. The October 17 notebook release changes only static frontend files and nginx routing. It preserves the existing authentication service and volume, Watch stack and Raira data.

## Notes (local)

The notebook at `/notes` uses MDXEditor for visual Markdown, source editing and images, with a title in the masthead, one left note list and a compact **Save** action below the writing area. Save persists the note and publishes its confirmed revision to the local Quartz reader at http://127.0.0.1:8081. Unsaved edits stay in the editor; a failed Quartz build retains the saved draft and previous published site for retry. Successfully published notes remain available in the Quartz reader.

Run the local API and reader alongside Vite. See `apps/web/README.md` and `apps/quartz/README.md` for setup, storage and recovery behavior. Live hosting is not configured by this local connection.

## Notebook foundation (local development)

The local notebook now saves to dedicated PostgreSQL through FastAPI, with revision conflict protection, browser recovery, page history, Trash and database backups. Its sidebar and neutral typography are closer to Notion. This local foundation has not replaced the deployed browser-only build or deployed a public API. See `docs/notebook.md` for startup and tested recovery behavior.

## Hosted notebook staging

The authenticated staging notebook is available at `https://staging.ignis.farm`, restricted to the configured owner through existing Ignis sign-in. Staging and production have separate PostgreSQL databases, credentials and backup workers. The production homepage now uses the authenticated API/database; local and live-browser pages and their history were preserved during the 17 October release. See `docs/notebook-staging-validation.md` for tested behavior and remaining release boundaries, and `deploy/notebook/README.md` for operations.

Recurring off-host notebook backups now pull fresh staging and production snapshots to this Mac every six hours while it is awake and signed in. The first scheduled transfer and restore of both downloaded archives passed. Hosting remains on the VPS; the localhost preview is a separate Mac development copy. Operations and availability limits are in `deploy/notebook/README.md`.

The production notebook is live at https://ignis.farm. All existing local/live-browser pages, original IDs, Trash and old history were preserved. See `docs/notebook-production-release.md` for the verification and rollback record. The localhost preview remains a separate development copy.

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

The Markdown Notes editor has been removed locally at the user’s request. Legacy `/notes` URLs open the notebook. Its saved drafts, images, backend services and published Quartz reader are preserved; reader assets now live in `apps/quartz/assets/`.

Quartz has also been retired locally. Its source, publisher/reader code, and local runtime were removed. The saved Markdown notes/images and previously published files are preserved under the private Ignis application-support folder; Tiptap remains the active notebook.

### Custom check-in folders and forms (2026-11-22, local only)

On https://project.ignis.farm/checkin you can make your own folders and forms. A form is a list of questions (single choice, 0-4 or 0-10 scale, yes/no with a detail field, number, time, free text), filled in once a day and shown as charts per question. Built-in folders (Meds, Corpo, Mente, Energia, Pessoas, Rotina) stay on the pages and also accept custom forms. Pages: `checkin-pasta`, `checkin-editor`, `checkin-preencher`, `checkin-registros` in `apps/project-site/public`. API: `services/project-api/app/checkin_forms.py` (tables `checkin_folders`, `checkin_forms`, `checkin_form_responses` in the SQLite database; forms are archived, never deleted, so answers stay). Not deployed: the API module must be copied to `/opt/ignis/api/app/` and registered in `main.py` (see the module docstring) before the pages work in production.

The Venvanse check-in is now one of these forms (id `venvanse`, folder Meds, questions q46-q50). On the first API start after the upgrade, `checkin_forms.init_tables()` creates it and copies the check-ins from `daily_checkins` into `checkin_form_responses`; the old table is left untouched and nothing is recreated if the form is archived. `checkin-venvanse` and `checkin-venvanse-dados` only redirect to the generic pages. The old long-form answers (q1-q45) are kept but not charted.

### Mobile layer (2026-11-22, local only)

`apps/project-site/public/mobile.css` is loaded last on every page and only acts on phones and small tablets (max-width 900/760/560px): tap targets of about 40px, 16px form fields (no zoom on focus in iOS), nothing under 11.5px, safe-area padding (pages use `viewport-fit=cover`), money numbers that never break across lines, the Workout plan with all six days fitting, and bottom-sheet dialogs. The Rotina page has its own phone view (day tabs plus an agenda; `rotina.js`/`rotina.css`). Audit method: load each page in a 375px iframe and check horizontal overflow, targets under 32px and text under 11px.


## Portfolio (raira.dev)

`apps/portfolio/public` is a static, public one-page site (no login, no API, no database). It runs on the same server as the Ignis sites, as its own nginx container (`raira-portfolio`) behind Traefik at `/opt/ignis/portfolio` (`compose.json`, `nginx.conf`, `public/`). Traefik routes `raira.dev` with a Let's Encrypt certificate and redirects `www.raira.dev` to it. The DNS records for `raira.dev` (A and a wildcard A to the server, `www` CNAME) are managed at Hostinger. To deploy a change, copy the files in `apps/portfolio/public` to `/opt/ignis/portfolio/public`; no restart is needed. The text and images come from the previous WordPress site at raira.io, which is a separate hosting account that this repository does not touch.
