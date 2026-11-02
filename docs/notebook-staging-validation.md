# Notebook staging validation — 17 October 2026

Staging is available at https://staging.ignis.farm. The notebook owner is **rairarocks@gmail.com**, as explicitly selected after checking the existing signed-in identity. Tinyauth's configuration, credentials and authentication volume are unchanged.

## Confirmed

- Separate staging and production PostgreSQL 18.6 clusters, volumes, internal database networks and credentials. No API/database host port is published. The application role is neither superuser nor allowed to create roles or databases. Alembic migration `0001_notebook` is applied in each environment.
- The HTTPS staging frontend uses existing Ignis forward-auth. The notebook API independently revalidates the cookie against the internal auth service, ignores browser identity/forwarding headers, and restricts the verified email to the owner.
- Anonymous and forged identity requests to public staging return 401. A direct API request with a forged session and owner header also returns 401. The real signed-in account was denied while configured as a different owner, then saved successfully after the authorized owner update.
- UI-created rich text loads with its bold markup intact in another tab. A stale tab cannot overwrite the newer save; Keep both versions retains both as separately saved pages.
- Nested-page content and favorite state survive moving the parent subtree to Trash and restoring the child. History restoration creates a new save and resets the visible editor to the selected version.
- Stopping only staging's API produces an explicit unsaved state while retaining the draft. Starting it, retrying and reloading confirms the draft is saved. Records also survive a PostgreSQL restart and API container recreation, with the frontend left running. Nginx now re-resolves the explicit API container name through Docker DNS rather than retaining an obsolete upstream address.
- Phone-sized viewport check has no horizontal overflow; this is browser emulation, not a physical-phone test.
- A full dump produced with the restricted application credentials restores into a new disposable database. Every page payload, history record and workspace revision matches. The test database is removed after comparison; neither real database is overwritten.
- The final staging fixture set contains 5 pages, 16 history entries and revision 13. At this staging milestone production was empty at revision 0; the later production release imports the preserved user notebook. Staging content is synthetic test data, separate from localhost and the current live browser notebook.
- The daily dump worker runs independently of browser activity. Validated staging and pre-launch production dump copies were also saved off-host on this Mac under `~/Library/Application Support/Ignis/notebook/hosted-backups/`, mode 0600. These initial manual checkpoints are retained. A subsequent user-approved Mac LaunchAgent now pulls fresh copies of both databases every six hours while the Mac is awake, signed in and online; its first scheduled run and restoration of both downloaded archives succeeded. See the off-host section in `deploy/notebook/README.md`.

Validation: 114 local backend tests, 22 web notebook tests, successful TypeScript/production build, and the authentication tests executed inside the actual hosted API image. The build retains existing bundle-size warnings.

## Boundaries before release

At the staging milestone the production homepage had **not** yet been switched. The completed subsequent cutover is recorded in `docs/notebook-production-release.md`. Its static site, authentication container and Watch API retain their original start times. Production's prepared notebook API is healthy and its database is migrated, but the new frontend/router stays disabled under the `release` profile. No local/browser notebook migration, Raira data change or Watch deployment occurred.

Recurring off-host delivery is now configured to the explicitly selected Mac. Snapshots are retained without automatic pruning. Mac availability and non-interactive SSH access are required; no automatic stale-backup alert is installed. Server daily dumps alone do not protect against losing the VPS, and daily recovery is not point-in-time recovery of every edit. A physical second-device check remains useful before calling cross-device access fully verified. Plan the browser-page import and router cutover explicitly; do not enable a second production router while the current static site owns the same hostname.

See `deploy/notebook/README.md` for setup and the repeatable database/restore check. The hosted OpenAPI export is `shared/contracts/notebook.openapi.json`; it declares session authentication on each operation.
