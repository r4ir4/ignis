# Production deployment configuration

`compose.json` defines the Ignis static site and its Tinyauth service. `nginx.conf` serves the static page. Both files retain the production paths used by the running server.

The local web app now builds with Vite into `apps/web/dist/`. The original HTML is preserved in `docs/archive/holding-page.html`; production still serves its existing `/opt/ignis/public/index.html`. Local initialization does not deploy the new app.

`/opt/ignis/auth.env` contains server-only credentials and access rules. It is not copied into this project. Preserve that file and the `ignis_auth_data` volume during updates.

The build-output mapping is `apps/web/dist/` to `/opt/ignis/public/`. A repeatable deployment command is not implemented yet. Deploy built files only after production deployment is requested. Configure the nginx HTML fallback when client-side routing is introduced.
