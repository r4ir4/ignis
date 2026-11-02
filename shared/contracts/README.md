# Shared contracts

OpenAPI exports are generated from the implemented FastAPI applications:

- `openapi.json`: the local integration API, including notebook pages and Inbox.
- `notebook.openapi.json`: the dedicated hosted notebook API with owner/session security.

The notebook contracts cover revision-checked page saving, history, notifications and page reminders. Regenerate these specifications whenever the implemented schemas or routes change; do not hand-maintain a second definition. SwiftUI and React keep separate UI source. Credentials and database URLs never belong in exported contracts.
