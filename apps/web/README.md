# Ignis web app

React + TypeScript + Tailwind CSS app built with Vite. The homepage is the Tiptap notebook. Watch remains available at `/watch`. The former Today, Planner and Markdown Notes pages have been removed; their old URLs now open the notebook.

## Local development

Use Node.js 24 (Volta pins 24.14.0):

```sh
cd apps/web
npm install
npm run dev
```

Open http://127.0.0.1:5173/. The server binds to localhost and requires that port to be available.

```sh
npm run typecheck
npm run build
npm run preview
```

The build checks TypeScript and writes `dist/`. Preview serves that build on http://127.0.0.1:4173/.

## Source

- `src/main.tsx`: React entry point, selecting the notebook or Watch.
- `public/storybook/`: shared woodland cover image used by the notebook cover gallery.
- `public/field-notes/`: shared meadow image used by the notebook cover gallery.
- `public/editorial/`: archived visual reference.
- `src/index.css`: Tailwind CSS import and Watch styles.
- `vite.config.ts`: React and Tailwind Vite plugins.
- `index.html`: HTML entry and page title.

There is no routing library; the entry point chooses the surface by hostname/path. Legacy planner and OAuth return URLs now open the notebook. Vite proxies `/api` to the local FastAPI proof on port 8000; start it with the commands in `services/api/README.md`.

The standalone Today and Planner screens and their exclusive frontend files have been removed. Old URLs open the notebook. Provider data and food/exercise records remain in backend storage; no database tables, credentials, or integrations were deleted. The notebook keeps its own source readers, native Habits/Meds, reading journal, and mood tracker.

Local source changes do not deploy to ignis.farm.

## Notes editor (local)

### Tiptap workspace trial

Open `/` or `/notebook` for the Ignis notebook built with Tiptap's open-source React editor. It offers editable pages and nested pages, title search, keyboard-filterable slash commands, headings, lists, checklists, quotes, code blocks, dividers, basic formatting, image insertion by URL and undo/redo. The layout collapses page navigation on phones. No paid template or Tiptap Cloud service is used.

Select text to open the floating formatting menu (bold, italic, underline, strikethrough, inline code and block styles). Hover beside a block to reveal its six-dot handle; drag it to reorder, or click it to select the block and open its actions. Lists and quotes move as complete top-level blocks. Click the six-dot handle for a contextual block menu with insertion, image, move and undo/redo actions. Image is also available in the slash menu. Alt+Shift+Up/Down moves the current block; standard undo/redo shortcuts remain available. There is no permanent editor-tools row beneath the title. Reordering preserves content and saves through the same browser autosave. Run `npm run test:notebook` for movement, selection and undo integrity checks.

The **+** next to the handle inserts a blank paragraph below that block and opens the block picker there. Editor tools also offers Insert block for keyboard/touch access. Typing `/` at the beginning of a paragraph opens the same picker, filtered by what follows the slash. Both menus anchor to the editor cursor through Floating UI, update on scroll/resize, flip above when needed and stay within the viewport. Arrow keys/Enter select an option; Escape or clicking elsewhere dismisses the menu. Cancelling + insertion leaves its new blank paragraph available for writing or Undo.

The local sidebar now pins a workspace button to its bottom, with an upward-opening menu for Settings, Download backup and the existing Ignis tools. Settings can rename the notebook in this browser (`ignis.notebook.preferences.v1`); pages keep their original storage key. The menu uses the native popover layer, viewport collision handling, arrow/Home/End keyboard navigation and Escape/outside-click dismissal. On phones it sits below the expanded page list. This layout refinement has not been deployed; it does not add separate workspaces, account switching or shared membership.

This playground stores Tiptap JSON in the current browser under `ignis.tiptap.playground.v1`. Changes save automatically; storage failures show an error and retain the open session. Download backup exports all playground pages as JSON (there is no restore UI yet). It does not read, migrate, publish or overwrite existing Markdown notes. The old Markdown Notes editor has been retired; saved Markdown records remain preserved outside the web app. This trial has no backend persistence, cross-device sync, database views or collaboration. It is deployed as the authenticated ignis.farm homepage; browser data on localhost and ignis.farm belongs to separate origins and does not transfer automatically. The local API tools remain local; production navigation links to the separate Watch site.

### Markdown Notes editor retired

The editor and menu entry, MDXEditor dependency, editor CSS and frontend save/publish code/tests have been removed. Old `/notes` URLs open the notebook. Saved notes, images, archived draft/export APIs, and existing published files remain intact outside the frontend. Quartz itself has also been removed, including its source, publishing/reader routes, assets, and local runtime.

## Notebook foundation update (local)

The local notebook now uses the FastAPI PostgreSQL notebook API instead of browser-only saving. Run the database setup and local API from `../../docs/notebook.md` before using it. The previous browser copy is preserved; unconfirmed changes retain per-tab recovery journals. The sidebar now includes collapsible pages, favorites, full-text search, page moves, duplication, history and recoverable Trash. Page links use stable hash IDs. The interface now uses neutral surfaces and sans-serif typography closer to Notion. Existing block editing controls remain. This supersedes the earlier local browser-only descriptions; the last production build remains browser-only until a separate authenticated backend deployment.

### Hosted notebook staging

The staging build at `https://staging.ignis.farm` uses the dedicated authenticated notebook API and displays a staging marker in the sidebar. Cloud builds describe server saving; localhost continues to describe the local Mac database. Browser drafts, cache and preferences remain isolated by origin. The reviewed build has since been promoted to the live ignis.farm homepage; see `docs/notebook-production-release.md`. See `docs/notebook-staging-validation.md` for the staging checks.

### Production promotion

The reviewed notebook build is now live at `https://ignis.farm`, using the owner-authenticated VPS API and PostgreSQL database. Existing local/browser pages and history were preserved, and off-host restoration was verified. Localhost remains an independent development copy. See `docs/notebook-production-release.md` for the release and rollback record.

### Page icons (local development)

Each page can select an emoji or flat icon above its title. The same icon appears in the page tree and Favorites. Icons save with page records, browser recovery copies, exports and version history; duplication and Trash preserve them. Remove clears only the icon. The top Ignis wordmark is removed, while the bottom notebook menu retains its fixed flame. This change requires the matching API schema update before a future hosted release; it has not been deployed.

The sidebar has an accessible search field without a visible title, plus Inbox, New page and Close sidebar icon buttons. Inbox opens (or creates) a top-level Inbox page for quick captures. Closing navigation expands the writing area; the top bar offers Open sidebar. Phones start with the sidebar closed, and choosing a page closes it again. These refinements are local only.

### Notion reference refinement (local)

The notebook now matches the reviewed Notion dark surfaces and sidebar proportions: a 270px sidebar, 44px toolbar, 32px search field, compact page rows, collapsible Private/Favorites sections, Home navigation and a pinned workspace/tools footer. Closing animates the sidebar transform/opacity and document column over 200ms; reduced-motion preferences disable these transitions. Closed navigation is inert and keyboard focus moves to the reopen button. On phones, navigation overlays the document and dismisses via its backdrop or page selection. The edge supports pointer dragging, arrow-key resizing, Home/End limits (220–420px), and double-click resets to 270px. Cmd/Ctrl+K opens search; Cmd/Ctrl+Backslash toggles navigation. Chat, agents, meetings and calendar integrations are not added by this visual refinement. No production deployment is included.

### Notification Inbox (local)

The sidebar Inbox icon now opens a notification panel instead of creating/opening a capture page. Existing Inbox pages remain untouched. The panel has pin/unpin, unread badges, status/type filters, read/unread, Archive/Unarchive and linked page navigation. Notifications persist in the dedicated database. Page actions → Remind me supports scheduled reminders, immediate reminders and cancellation; polling delivers due items while Ignis is open or when you return. Backup warnings are another real notification source. The view starts empty without seeded examples. There is no browser push, email, comments or mentions integration. See `docs/notebook.md`; this requires the matching API migration before any hosted release and has not been deployed.

Inbox opening now matches the observed Notion reveal: a full-width horizontal slide from the sidebar edge with opacity progressing from 0.7 to 1 over 200ms. A clipped frame prevents the moving panel from covering navigation. Closing retains the inert panel for its exit transition, and reopening cancels the pending removal. Reduced-motion preferences make the transition immediate. This refinement remains local.

### Meetings sidebar (local)

Home and Meetings use compact icon tabs matching the reviewed Notion sidebar. Switching tabs changes navigation while keeping the document open. Meetings displays a read-only list of upcoming calendar events, with three shown initially and an option to expand the list. There are no meeting-note creation controls or saved-notes sections.

The calendar section reads the existing local Apple Calendar snapshot only while Meetings is open. Refresh uses the existing read-only import endpoint; Connect requests macOS access only after an explicit click. The last sync date is shown. Hosted calendar integration, recording, transcription and Chat are not included. Existing notebook pages and recoverable Trash remain separate from this view. The optional page category field remains compatible with pages from the earlier note trial. No production deployment was performed.

### Page covers and writing width

Notebook pages support a full-bleed cover, overlapping page icon, and a wider writing area by default for existing and new pages. Page actions → Appearance & layout → Full width can be switched off per page to use the focused 720px column. Add cover offers Gallery, Upload, and Link. Upload accepts JPEG, PNG, WebP and GIF files up to 8 MB and 20 megapixels; animated files use their first frame. Change cover, Remove cover, and Reposition are available on the cover (on hover/focus on desktop, always on touch devices). Reposition lets you drag the cover directly with mouse or touch, then Save position or Cancel. Arrow keys also adjust the crop; Enter saves and Escape cancels. Cover metadata and width save with the page, survive duplication/recovery, and restore from page history; existing page content is preserved.

Uploaded covers are validated and converted to metadata-free WebP (up to 3840px), then stored as immutable, deduplicated assets in the notebook PostgreSQL database. They remain available to previous page versions and are included in full database backups. JSON notebook exports contain asset references, not embedded image bytes; use database backups for a complete restore. Gallery covers are served locally; image links load directly from the chosen HTTPS source. These changes are local and require a separate requested production deployment.

### Page options

The top-right page menu groups working actions in a Notion-style popover: Copy link, Copy page contents (Markdown), favorite, Rename, Duplicate, Move to, Version history, Remind me, Appearance & layout, Export page (Markdown), and recoverable Trash. It shows the body word count and provides copy/export feedback. Appearance offers Default, Serif and Mono fonts, Small text, and Full width; choices save per page and survive duplication, history restoration and browser recovery. Document text is preserved. Exports contain the current page only; workspace JSON backup remains in Tools and settings. Page links retain the current site's host and page ID and require the recipient to have access. Shared editing, publishing, AI and analytics have not been added.

### Lock page

Page actions → Lock page protects against accidental editing. The persisted lock makes the title and Tiptap body read-only, blocks checkbox edits, hides block/formatting controls, and disables cover/icon/appearance changes and version restoration. Reading, selection/copy, export, favorites, moving and viewing history remain available. Use the same menu switch or the inline Unlock button to edit again. The API rejects title/body/icon/cover/appearance edits when a page stays locked; explicit unlocking remains available to the owner. This is an editing guard, not a separate access-control role. Copies and browser recovery retain lock state. Existing pages default to unlocked. No database migration is needed.

### Block actions

Click the six-dot handle for Turn into, Duplicate, Delete, insertion, move and undo/redo actions. Turn into supports Text, Headings 1–3, bulleted/numbered/to-do lists, Quote and Code. Duplicate and Delete operate on whole top-level blocks (including nested lists and images) and each action can be undone independently. Converting list types keeps nested structure; turning a list into text creates a paragraph for each entry. Code uses plain text. Blocks containing non-text assets are excluded from conversion to avoid discarding those assets. Removing the last block leaves an editable empty paragraph. The handle stays anchored while its menu is open, and all changes use existing page saving/history.

Block actions → Color offers Default, Gray, Brown, Orange, Yellow, Green, Blue, Purple, Pink and Red text/background palettes. Text and background are independent attributes on paragraph, heading, list, quote and code blocks; Default clears just that attribute. Colors save with Tiptap content, survive copies, recovery and supported conversions, and are included in version history and database backups. Each color change is undoable. Locked pages retain their existing colors while preventing changes. Markdown exports retain document text but do not represent block colors; JSON/database backups preserve them.

The notebook slash menu follows the compact grouped writing menu: Text, headings 1–4, bulleted/numbered/to-do lists, toggles, Page, Callout, Quote, Table, Divider, Link to page, Image and Code. Type to filter (including aliases such as checklist), use arrows/Enter or click, and Escape to close. Toggles preserve their open state; callouts support rich nested text; tables support row/column insertion/removal, a header row and column resizing through contextual controls. Page creates a nested page with a link in the current document; Link to page opens a searchable picker. New node types are accepted by the notebook API and retained in recovery JSON and Markdown exports. Database views, AI and external embeds are outside this writing-block step.

Inside a notebook page, `/image` or the block menu opens an image dialog with Upload and Link options. Upload accepts JPEG, PNG, WebP and GIF up to 8 MB, with an image description, and uses the existing authenticated PostgreSQL image store shared with covers. Canceling or leaving the dialog aborts the request and never inserts a late image. The server normalizes uploads to WebP (first frame for animated GIFs); saved page JSON keeps the stable image URL.

Callouts use a compact inline icon picker for emojis, built-in icons and custom emoji. The symbol is stored in the callout icon attribute (default light bulb for older blocks), retained by saving, recovery and duplication, and can be changed or removed independently of the callout text and colors. Locked pages show a static symbol.

Toggle heading 1–3 are available under Advanced blocks in the slash menu and in Turn into. A heading converts to a collapsible title with its inline marks retained; nested content stays inside the toggle when its heading level changes. Heading level lives on detailsSummary, so collapsing a section preserves its style. Normal heading conversion retains section body blocks below the heading. Recovery, duplication and Markdown export preserve the toggle heading level.

Drag handles support blocks inside callouts and toggle bodies. While dragging, a blue insertion line shows the block boundary and an outline marks the destination container. Drop to the right of a container’s indent to nest the block; move left of the indent to place it outside. Dropping on a collapsed toggle opens it. Movement retains complete block JSON, including nested lists, images, symbols, colors and heading levels, in one undo step. Moving the last child out leaves an editable empty paragraph, and self/descendant drops are rejected. Block actions and sibling movement also work for nested blocks. Locked pages disable dragging.

Reusable layout blocks are available in the slash menu: `2 columns` through `5 columns`, `Tabs`, and `Table of contents`. Columns stack on mobile and retain surplus content when reducing their count. Tabs support keyboard navigation, adding, renaming, ordering and removing without discarding contents. Their active panel is a transient viewing choice. The live table of contents also opens headings in hidden tabs and collapsed toggles. See [the reusable block architecture](../../docs/notebook-blocks.md) for schema, renderer, validation, export and future data-view responsibilities. These changes are local; production deployment is separate.

Charts are available from `/line chart`, `/horizontal bar chart`, `/vertical bar chart` and `/number chart`. They show a clean chart surface; Edit data opens direct row entry and the settings icon opens configuration. Tasks and Meds are dedicated sidebar pages and cannot be inserted as blocks. Table/Gallery/Feed data views have been removed from insertion (the normal writing table remains). `/2-image grid`, `/3-image grid` and `/4-image grid` add premade photo layouts with upload or link per slot. Previously saved view blocks remain readable. See `docs/notebook-blocks.md`. Changes remain local until separately deployed.

Drag personal-list board cards between status columns to change their status. Empty status columns remain available. Alt+Left/Right moves a focused card; its item dialog provides the same status choices without dragging. Locked pages and imported sources disable card dragging.

Drag above/below a board card to reorder it. The blue insertion line previews its position; moving a card selects Manual order for that view. Alt+Up/Down on a focused card or its drag grip provides keyboard reordering. Manual order is saved in the shared list and survives reloads.

The dedicated Board has an editable title, icon and page cover. Use + New item to add a card; saving the first card creates its backing list automatically, with no setup dialog required.

The Board uses Notion-style gray/blue/green status columns, dotted status badges and an inline New task action in each status column. Enter saves to that column; Escape/Cancel discards the draft. The header New task action opens the full task details dialog. Tasks remain list items and do not create notebook pages.

Use the three-dot menu in a Board column header to rename it or choose its color. Save column persists the display settings without changing the tasks or their completion state.

Use Add column at the right of a Board to create another status column. In its three-dot menu, Delete column removes an empty column or asks where to move all its tasks first. Hidden tasks are moved too. Keep at least one column; up to 20 are supported. Column definitions and task moves save together and are shared by views of the same list.

The column three-dot menu offers Edit group, Hide/Show aggregation, Hide group and Delete group. Restore hidden columns from the Hidden groups row below the board. Visibility only changes the current view and never deletes its tasks.

Drag column name/count headers to reorder the Board, following the blue insertion line. Alt+Left/Right on a focused header or Move left/right in its three-dot menu provide the same action. Column order saves with the shared list; tasks retain their statuses and manual order.

Board task panels autosave valid edits as you type, including title, status, date, numeric value, description and image link. The top toolbar shows the notebook save status. Close/Escape keeps edits; invalid values must be corrected or discarded. Task actions contains Delete task. The side peek follows the Notion reference with a large title, compact property rows and a borderless description area; it fills the screen on phones. Other item editors retain Save/Cancel.

Task panels now have an inline calendar (month arrows, date entry, Today, Clear) and aligned property values. Add a property supports Text, Number, Select, Multi-select, Date, Checkbox and URL. Properties are shared across tasks on the same board; each task keeps its own values. Click a custom property name to rename it, edit its choices or delete it and its values. All changes autosave and are included in backups, history and exports.

Add a property now creates directly when you pick its type, with an optional name and searchable types. Leaving the name blank uses a unique default. Select and Multi-select options can be created from the task’s value menu; new options and the chosen value autosave together.

### Task property catalog

Add a property offers 17 active property types, with a searchable scrolling catalog. Person, Phone, Created by, Last edited by and Place have been removed from selection, while old stored values remain readable for recovery. Click a property’s name and change Type to preview conversion across all tasks. Compatible values carry over under the same property ID; incompatible values require explicit confirmation before clearing. The definition and converted values save together. Click a property's name to rename/configure it; calculated fields and buttons also offer setup through their value. Formulas support a safe, bounded local expression subset; relations link tasks in personal lists, and rollups calculate over linked tasks. Files & media supports file links and uploads (8 MB each), stored with the notebook database. Apply `services/api` Alembic migration `0005_task_attachments` before using uploads. The private workspace uses You for automatic author metadata and offers person-name labels without invitations. Place stores address text; IDs use permanent UUIDs with optional prefixes. Button actions are limited to completing/reopening the current task or checking one of its properties. External connected services and AI Autofill are excluded. See `docs/notebook-blocks.md` for limits and recovery behavior. This is a local change, not a production release.

Property dialogs follow the compact Notion reference: name/icon header, searchable type menu, individual choice pills, and duplicate/delete actions. Rename with Enter or blur; edit choices individually. Duplication copies the property’s values across tasks. Used-option deletion and incompatible type conversions keep explicit review. Advanced settings show Apply changes only when edited.

The task Image field supports Upload and Link, shows a preview, and displays the saved image on its board card. It reuses the existing notebook image upload endpoint and task autosave. A link must load as an image before replacing the current one; failed attempts retain the previous image, and closing the picker cancels pending work.

Task notes use the same Tiptap editor as pages: type `/` for writing blocks, select text to format it, and use Markdown shortcuts for lists and headings. Notes support images, checklists, toggles, callouts and tables and save automatically. Existing plain descriptions are preserved literally. Rich documents are stored alongside a plain text summary and retained in recovery, history and backups. The matching API/schema changes are local; production deployment is separate.

Click a custom task property's name for Rename, Edit property, Property visibility, Duplicate property, Delete property and Customize layout. Visibility can always show, hide when empty, or always hide a property without removing its values. Restore hidden fields through Add a property → Customize layout. Value supports a custom label, visibility and duplication into an independent Number property; its original type remains fixed for chart metrics. These board-level preferences autosave with notebook history and backups.

Number properties and Value now support Edit property → Show as Number, Bar or Ring. Bar/Ring offer color, Divide by and Show number. Settings autosave across the board and persist through reloads, history and backups. Click the displayed number/bar/ring to edit its raw number. The display ratio never changes numbers used by charts or calculations; empty values stay empty.

Task Select/Multi-select properties support colored options, search/create, per-option edit menus, manual drag ordering, and alphabetical sorting. Option settings autosave with the page and apply across its tasks; no database migration is required.

Status fields now support To-do/In progress/Complete groups, per-option colors and defaults. Board column settings also expose a status group; Complete controls completion styling and counts independently of the column's label/color.

Files & media now uses Upload/Link tabs with multi-file/folder uploads, image paste, file drop, filenames and image previews. Limits remain 8 MB per file and 30 attachments; non-image files keep their download behavior.

Task system fields: Created time is preserved and legacy times recover from available page history; Last edited time tracks task content changes. IDs use permanent sequential list numbers with optional prefixes. Button properties support a label, ordered local property/status/date/checkbox actions and optional confirmation, applied atomically. These fields use existing snapshot JSON and require the matching API schema; no migration or hosted deployment is implied.

Tasks board view preferences are under the toolbar settings icon: Layout, Property visibility, Filter, Sort and Group open compact autosaving submenus with Back navigation. The existing chart settings dialog remains for charts.

Meds uses an independent copy of the Dashboard layout and owned lists on first open. Its shortcut sits beside Tasks and it has no page cover. The dedicated Calendar and Dashboard destinations are retired. Their sidebar destinations are removed, and old links fall back to an available page. Legacy records remain compatible with the storage schema for recovery; existing saved lists are preserved.

### Meds: connected Vyvanse history (local)

Meds now has a dedicated Venvanse dashboard instead of the generic Dashboard renderer. It reads existing Raira doses and reported start/peak/wearing-off events, with all-time records, median timing summaries, an observed daily timeline, a reported-duration plot and an accessible history table. Missing check-ins remain unknown; no pharmacokinetic or concentration model is inferred. Dates and inputs use Raira's profile timezone. The intake form pre-fills the last recorded amount, which the user can edit; it does not recommend a dose. Stage check-ins are attached to a selected dose within the preceding 36 hours.

Run the existing local API alongside Vite. `services/api/app/services/raira_meds.py` uses the existing private `ssh cabecao` connection and calls Raira's medication service inside `raira-api-1`; no credentials enter React and no legacy database is copied or migrated. Saving a dose or check-in explicitly writes to the same Raira history. Existing source validation, duplicate guards and schedule synchronization stay in effect. A client UUID is retained for retries after transport errors. Initial connection failures show Retry; later refresh failures preserve the last loaded records and disable logging until reconnection. The SSH adapter is local only and is not registered in the hosted notebook app. No deployment is implied.

Meds stage buttons record the current timestamp immediately when no check-in exists. A recorded stage displays its time and opens the time editor when clicked. Saves disable repeat clicks; transport-error retries retain the original timestamp and client UUID. Taken records the current time using the last recorded amount. Once recorded, Taken displays a checkmark and time, and opens the existing dose editor when clicked. If no prior amount exists, it asks for one. The editor also offers an explicit Record another dose action.

Meds displays all-time history without date-range or refresh controls. Taken, Started, Peak and Wearing off share four matching tracking buttons (two columns on phones). The timeline contains every recorded dose in a scrollable plot; summaries and the duration chart also use the full history. Automatic background refresh remains enabled.

New medication marks offer an Undo action until the next mark; recorded marks can also be removed from their time editor after reload. Undo matches the original record timestamp, so a stale screen cannot remove a subsequently edited mark. Taken can be removed only after its linked phase marks are removed and when no dose response report exists. This preserves response reports; those doses must be managed in Raira. Removing a mistaken intake also reverses linked habit completions and audits/removes its medication schedule occurrences atomically. UI regression checks use an isolated mocked medication endpoint, never real medication writes.

Shared notebook typography and symbol dimensions live in `notebookMetrics.css`, loaded after the component styles. They match measurements from the open Notion reference: the native sans-serif UI stack, 14/21 sidebar text, 30px desktop navigation rows, 20px sidebar page symbols, 16/24 editor text, 40/48 page titles without negative tracking, and 78px page-header symbols. Custom serif/mono page fonts, smaller callout icons, icon-picker sizes, and coarse-pointer touch targets remain separately scoped.

Floating menus and form dialogs share `notebookSurfaces.css`: the measured dark Notion surface, 10px popover corners, outline/shadow, 28px desktop menu rows, 8px icon gaps, common dividers, 32px fields and action buttons, and consistent dialog headings/padding. It covers page/workspace/column/property/view menus, nested task menus, pickers, and standard forms including Meds. Full-height task panels and media previews retain their specialized layout; coarse-pointer actions retain 44px targets.

### Habits (local notebook)

Habits is a fixed page beside Tasks and Meds, with the same icon shortcut behavior and no cover. Add or rename a daily habit, check or undo a day, inspect the last seven days, and navigate previous days. Future check-ins and dates before a habit's creation are disabled. Archive/restore preserves history. Habit definitions and unique completion dates are saved in each page's optional `habits` array through the existing notebook API, recovery drafts, version history and backups. This is independent of Raira's medication/habit data. No migration of that data or production deployment is included.


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

Habit day squares record a check-in for the selected day and undo the latest check-in when that day's target is complete. For targets above one, each click adds one check-in until the target is reached. Future, rest, paused, and pre-start days are disabled. Historical medication-linked squares remain read-only so the habit shortcut never invents a past dose time; today's square uses the existing Meds synchronization. Past regular check-ins retain their selected period and the actual recording timestamp.

The Habits page's Read tab keeps an editable book shelf (author, rating, owned/bought/borrowed and color) and dated page-count sessions. The month navigation filters stacked daily bars and totals; book colors link the shelf to each bar. Click a daily bar to edit or remove its session; days with multiple sessions open an entry chooser. The separate reading log is omitted. Reading data lives in the page's `reading` field and uses the notebook's existing save, conflict, backup, and locked-page behavior. No example books are inserted into the user's journal.

The Mood tab is a monthly cat journal. Select one of six mood colors, then click a past or current day to paint its cat and expression. Select Clear a day to erase a mark; repainting replaces that day's mood. Future days are disabled. Mood entries are saved in the notebook page's `moods` field, with revision checks, backups, and page locks shared with the rest of the notebook.

Books support an optional Already read pages starting balance. The shelf shows this balance plus all logged sessions across months; monthly totals and daily bars include only dated sessions, so starting progress never invents reading dates. Legacy books default to zero, including save acknowledgements and locked-page comparisons.

The topbar breadcrumbs show the full page ancestry with page icons, clickable parent links, muted slash separators, and a Private label on top-level pages. Long hierarchies collapse middle ancestors into a keyboard-accessible menu. Trails handle missing/deleted ancestors and cycles safely; narrow layouts truncate page names without changing their full accessible titles.

### Resizable editor images

Pasting an image file opens the existing upload dialog with that file selected for description and upload. Uploaded, linked and pasted HTML images share contextual size controls. Drag the right-edge handle with mouse or touch while preserving proportions; its arrow keys adjust by 10px (Shift: 50px), Home chooses the minimum and End fills the current column. The 25%, 50% and 100% buttons set a width relative to the current writing area. Sizes save in page JSON and support undo/redo. Images shrink to fit narrower screens and columns. Locked pages hide resizing controls. Deployed to ignis.farm on October 19, 2026; see `../../docs/notebook-production-release.md`.

Percentage controls now appear only while hovering over the visible image or focusing its controls with the keyboard; touch users can select the image to reveal them. The contextual **+ Image** action opens the upload/link dialog and adds an image beside the current one, using the existing column layout (up to five columns). Dragging a block beside an image now targets the visible image edges even after resizing. Image rows retain proportions, support undo/redo and use the existing document save format; columns stack on narrow screens. Deployed to ignis.farm on October 19, 2026 as `20261019-image-rows`.

Drag an editable image itself to another image’s left or right edge to move it into a neighboring column. The existing block drag preview shows the placement; the move preserves image attributes and supports one-step undo. Locked images do not start a move. Direct image dragging was verified locally in both directions and deployed on October 19, 2026 as `20261019-image-drag`.

### Configurable task properties

On task pages, Value and Image now offer **Remove property** from their property-name menus. This removes the row from the list's task layout while retaining its saved values; **Customize properties** can restore it. All task properties, including Status, Date and custom fields, share the same layout ordering. Use the drag grip or up/down buttons in Customize properties to reorder them. Ordering changes the actual DOM and keyboard reading order, and is shared across tasks in the same list. Locked pages disable layout editing. Card property visibility remains controlled by the existing Board view settings.

Property display settings accept the built-in `status`, `date` and `image` keys in addition to `value`, with an optional integer `order`. The matching FastAPI schema and generated OpenAPI exports are updated. No SQL migration or task-data conversion is required. The frontend and matching API schema were deployed to ignis.farm on October 19, 2026 as `20261019-task-properties`. Card dates and Select/Multi-select option action buttons also received alignment fixes.

Task property rows now expose a six-dot handle on hover or keyboard focus (always available on touch devices). Drag the handle above or below another row to rearrange properties directly on the task. A blue line previews placement; dropping outside the property list or pressing Escape cancels. Alt+Up/Down moves the focused handle's property. This uses the same list-wide saved order as Customize properties; hidden properties and all task values are preserved. Locked tasks expose no reorder handles. Direct row reordering was deployed on October 19, 2026 as `20261019-direct-task-drag` and requires no additional API/schema change.

Board card arrow controls are replaced with a six-dot drag grip. Drag it above/below another card to reorder, or into another status column to move it, including empty columns. Existing blue insertion and column indicators preview the drop. Pointer capture supports mouse, pen and touch; dropping outside the Board or pressing Escape cancels. Card editing remains on its title, and the existing Alt+arrow shortcuts remain available. This change uses the current shared-list save format and was deployed on October 19, 2026 as `20261019-direct-task-drag`; no API update was needed.
