# Production deployment configuration

`compose.json` defines the Ignis static site and its Tinyauth service. `nginx.conf` serves the built React notebook homepage with an HTML fallback for page routes. Both files retain the production paths used by the running server.

The local web app now builds with Vite into `apps/web/dist/`. The original HTML is preserved in `docs/archive/holding-page.html`; production now serves the notebook build from `/opt/ignis/public/`.

`/opt/ignis/auth.env` contains server-only credentials and access rules. It is not copied into this project. Preserve that file and the `ignis_auth_data` volume during updates.

The build-output mapping is `apps/web/dist/` to `/opt/ignis/public/`. A repeatable deployment command is not implemented yet. Deploy built files only after production deployment is requested. Nginx provides the HTML fallback required by the current page routes.

## Watch subdomain

`https://watch.ignis.farm` is a separate stack at `/opt/ignis/watch`, defined in `deploy/watch/compose.json`. It uses the existing `ignis-auth@docker` forward-auth middleware and existing 90-day Ignis authentication configuration. Main Ignis, Raira, Casa 27 and their data are not deployed by the Watch stack.

The Watch frontend uses the same React/Tailwind build, selected by hostname in `src/main.tsx`. Development preview is `/watch`. Only `watch.py` and `watch_main.py` are copied into the production API image; the API has no host port and runs on an internal network behind authenticated nginx. Production records live in `/opt/ignis/watch/data/records.json`, outside the static assets and image. They persist across container recreation; keep this directory in backups. This is one shared private library for users admitted by existing Ignis authentication, not separate libraries per account. Local Watch records are independent, under `~/Library/Application Support/Ignis/watch`.

To update, build the web app on Node 24, copy only `apps/web/dist/` to `/opt/ignis/watch/public/`, and update the two Watch Python files under `/opt/ignis/watch/api/app/` when needed. Preserve `data/`. Rebuild/recreate only this stack using `docker compose -f /opt/ignis/watch/compose.json up -d --build`. Do not copy the full local backend or credentials into the Watch image. HTTPS certificates are managed by the existing Traefik resolver. No DNS change was required for the initial deployment.

Initial validation: HTTPS certificate valid; unauthenticated site/API return 401, including spoofed Remote-Email; nginx config check passed; isolated API read successful; existing main site/auth containers were not restarted. Interactive sign-in and embedded video playback still require browser verification.

## Notebook homepage release (October 17, 2026)

The user requested the Tiptap notebook as the ignis.farm homepage. `/` and `/notebook` open the same notebook; the former Today interface has been removed; legacy `/today` URLs open the notebook. The live release deploys static frontend files only. The local planner/Markdown/Quartz API is not deployed and its navigation links are shown only on localhost. Live Watch links to its existing subdomain. Notebook pages remain browser-local and are not migrated from localhost.

Release files are staged at `/opt/ignis/releases/notebook-home-20261017/`; the prior public directory and nginx configuration are backed up under `/opt/ignis/backups/notebook-home-20261017/`. Assets are copied before replacing index.html, and old assets are retained. Nginx was syntax-checked and reloaded without recreating containers. Roll back by restoring public files from `public.tar.gz` and writing the backed-up nginx.conf into the existing config file, then syntax-checking/reloading nginx. Do not restore or touch auth.env, authentication volumes, Watch or Raira.

## Hosted notebook preparation

The isolated stacks under `deploy/notebook/` prepare an authenticated staging API and dedicated staging/production PostgreSQL databases. Production's new frontend/router is disabled until a separate cutover; the live browser-only homepage and existing auth/Watch containers are preserved. See `deploy/notebook/README.md` for setup, backups and staging verification.

## Authenticated notebook production release

On 17 October the existing production nginx gateway was updated to serve the reviewed web build and proxy only `/api/notebook` to the prepared owner-authenticated API. The original site/auth/Watch containers were not recreated. Browser and local database pages/history were preserved. The extra production-stack frontend remains disabled to avoid a duplicate router. See `docs/notebook-production-release.md` for the preservation checks, release backups and rollback procedure.

Local update, October 18, 2026: Today and Planner have both been removed from the frontend and workspace menu. Their old paths render the notebook through the SPA fallback. No deployment was performed as part of this removal; backend data and integrations remain intact.

Production update, October 18, 2026: the current notebook UI and native Habits/Meds backend are deployed. The gateway proxies `/api/notebook`, `/api/habits` and `/api/meds` under existing authentication. Local trackers, reading and mood data were copied with explicit user approval; existing production pages were preserved. Today, Planner, Markdown Notes and Quartz navigation/code removals are included. Private legacy Markdown files were not deployed or deleted. See `docs/notebook-production-release.md` for the release, verified backups and rollback boundary.
