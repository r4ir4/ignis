# Ignis working rules

- Use SwiftUI for one shared iPhone/iPad app in `apps/ios/` and React with TypeScript for the web app in `apps/web/`.
- The web app uses Vite and Tailwind CSS. Use utility classes and the Tailwind import in `apps/web/src/index.css`; use Node.js 24 and follow `apps/web/README.md` for commands.
- Keep app interfaces separate. Put shared API definitions in `shared/contracts/` and backend implementation in `services/api/` when those are designed.
- The accepted backend stack is FastAPI with Python, a dedicated PostgreSQL database, SQLAlchemy and Alembic. Follow the folder responsibilities in `services/api/README.md` and `docs/backend.md`.
- Generate the OpenAPI contract from the implemented FastAPI app and keep exports in `shared/contracts/` consistent with it.
- Do not initialize Git until the user explicitly requests it.
- Do not initialize frameworks or add dependencies solely to fill empty folders. Follow the requested implementation scope.
- Keep credentials and authentication databases out of the code folder. Preserve server-only `auth.env` and the authentication volume.
- Change the live deployment only when requested. Local folder changes do not imply a production deployment.
- Keep Raira's existing medication and other data separate; do not migrate or delete it without an explicit request.
- Update the README and architecture decisions when paths or accepted project choices change.
