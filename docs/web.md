# Web application decisions

## Fairytale Today homepage (October 16, 2026)

The root route now presents real daily data in the accepted illustrated book design. Sample news articles and demo controls were removed. The homepage reuses `dayOverview` for source roles/date filtering, the shared visible-page sync lifecycle for external read-only imports, and the existing food editor/API for meal plans, diary entries, reuse and undo. Choosing another next task changes the current page focus; external task completion remains in TickTick. Empty, disconnected, loading, cached/stale and error states are distinct. Shared visual foundations live in `src/styles/storybook.css`, with layout under `src/features/home/`. `/planner` and Watch keep their detailed interfaces. Production and authentication are unchanged.

Validation includes the production build, day/food/sync tests, and isolated browser checks for task choice, saved-meal prefill, cancel, confirmed planning/logging and undo using a temporary in-memory API separate from the real records. Local API reads were checked on the actual homepage; desktop, tablet and mobile layouts are verified locally.

The local web app was reset on October 13, 2026 to a minimal React + TypeScript + Tailwind CSS foundation.

## Current setup

- React and React DOM.
- Strict TypeScript.
- Vite with its React plugin and the official Tailwind CSS Vite plugin.
- One CSS file importing Tailwind; styling uses utility classes.
- A simple `App.tsx` with the Ignis Farm name, Structured connection status and read-only import controls.
- Node.js 24, pinned through Volta and `.node-version`.

Chakra UI, Emotion, the previous dashboard, food tools, farm artwork, custom styles and feature tests have been removed. There are no installed routing, query or component libraries. Product features can be added to this clean foundation when requested.

## Boundaries

The native app and FastAPI/PostgreSQL backend scaffolds remain separate. The local app connects to the local Structured proof through Vite’s `/api` proxy and does not access Raira data. Existing browser-local prototype records are left untouched, but the reset app does not read or write them.

Production configuration remains under `deploy/`; the original holding page is retained in `docs/archive/holding-page.html`. This local reset does not change the deployed site or authentication.

See `../apps/web/README.md` for commands and the current source layout.

The Structured screen shows Today, Upcoming, Routines and Inbox using actual imported records. The Routines view groups occurrences by Structured series ID and shows their dates; it does not infer editable recurrence rules. Automatic sync performs a read-only import on opening, every minute while visible, and when returning to the page. It pauses while hidden or offline, backs off after errors and preserves the last successful snapshot. Scope remains today, the inbox and the next 30 days.

Automatic sync runs while the web page is open and visible, not as a background service when the app is closed. It retries failures with increasing delays (up to ten minutes); an expired login requires reconnecting. Concurrent requests reuse a snapshot imported within the last 15 seconds. Run `npm run test:sync` in `apps/web/` for scheduler lifecycle checks.

TickTick has a dedicated, verified direct OAuth/MCP connection with read-only automatic sync. Its panel shows Tasks, Habits (including check-in history) and Focus history. Active tasks are imported from accessible projects/inbox; completion, check-in and focus history covers 30 days in Bahia time. The installed chat connector is not used as the web backend connection. TickTick requires broader OAuth permission, approved by the user, but the backend blocks mutation tools.

Apple Calendar has a verified read-only Mac connection, a calendar filter and event list. The native helper reads all calendars available on the Mac, including Google/iCloud accounts, with repeating occurrences and all-day dates preserved. Automatic sync uses the shared lifecycle. The connection is local to this Mac and has not been deployed.

Apple Reminders has a verified read-only Mac connection with Active/Completed views and list filtering. All active reminders and 30 days of completion history sync automatically through the separate reminders helper. No reminders are completed or modified in Ignis.

Routinery integration was requested on October 13, 2026. The supplied MCP endpoint (`https://mcp.routinery.app/mcp`) rejected OAuth discovery and initialization with Cloudflare Error 1010 (browser_signature_banned), stating owner action is required and retry is not permitted. No client registration, user authorization or routine import succeeded. Integration remains pending provider access resolution; no nonfunctional connector screen was added.

Cronometer was briefly prepared as a read-only community connector, then discarded at the user’s request on October 13, 2026 before a verified account import. Its UI, routes, worker, tests and isolated runtime were removed. The food section will be native to Ignis; the first feature scope is being selected.

## Ignis-owned food section

Meal plan, Food diary and Saved meals are implemented in React/Tailwind with a native modal editor. Plans and actual eating records are separate, linked only by an optional plan ID. Saved meals are independent copies that prefill an editor without saving automatically. Editing/deleting plans or templates leaves eating history intact. Last-change undo is available.

Records persist through the local FastAPI `/api/food` endpoint to `~/Library/Application Support/Ignis/food/records.json`, outside the repository (directory 0700, file 0600). Writes are atomic and use a revision check so stale tabs cannot overwrite newer records. Corrupt existing data is preserved rather than reset. Dates and initial log times use Bahia; users can edit them. Form drafts keep stable IDs across save retries.

This is local persistence, not device sync or the planned PostgreSQL database. No demo food entries are added. Meals support manually entered calories (kcal), protein, carbs and fat (grams). Food diary totals include only logs on the selected date; missing values remain null and partial totals flag missing entries. A food database and automatic nutrition lookup are not implemented.

## Ignis-owned exercise section

Workout plan, Exercise diary and Saved workouts follow Food's date selection, native modal editor, reuse, editing/removal and last-change undo. A workout has a name, activity description, optional notes, session duration (minutes), distance (km) and exercise details (name, sets, reps, weight in kg). Diary totals count completed session logs on the selected day; unknown measurements are flagged.

Plans and logged sessions are separate, linked by optional plan ID. Logging a plan or saved workout prefills a fresh editor for confirming actual results. Templates and their exercise rows are copied rather than linked, so editing/deleting templates or plans preserves workout history. Food and Exercise share Bahia date/time helpers.

Records persist through `/api/exercise` to `~/Library/Application Support/Ignis/exercise/records.json` outside the repository, with atomic writes, private permissions and optimistic revision checks. No sample records, external workout connection, timer, calorie estimation or device sync is added. PostgreSQL remains the intended future shared store.


## Shared daily overview

Today brings the connected sources together with explicit responsibilities:

- Structured provides the scheduled routine blocks, including individual occurrences.
- TickTick provides actionable tasks, preserving project names, plus habits and focus history.
- Apple Calendar provides appointments and events.
- Apple Reminders provides reminders, separately from tasks.
- Ignis provides meal and workout plans and their independent diary entries.

The overview uses Bahia dates. TickTick tasks that are due, overdue, undated or available by their start date appear in Today; future tasks remain accessible in the imported records. Completed and abandoned tasks are excluded from the action list. Recurring TickTick tasks remain tasks, and similar titles across sources are not automatically merged. Reminder date-only deadlines and Calendar exclusive all-day end dates are preserved.

One next task is suggested by earliest due date, followed by available undated tasks. “Make this next” changes the local suggestion for the current page session; it does not reschedule or modify TickTick. External completion stays in the source app and reaches Ignis through the existing automatic sync. The source panels remain mounted inside Connections and imported records, so collapsing that section does not stop syncing. Their snapshots are shared with Today without an additional import loop. Connection errors and last-sync timestamps remain in those panels. Food and Exercise share updates after successful saves; their editing flows remain below the overview.

Verify aggregation with `npm run test:day --prefix apps/web` on Node 24.

## Watch library

Watch is served at `watch.ignis.farm`, or `/watch` locally. It supports saved YouTube links with automatic title, channel and thumbnail lookup, free-form collections, tags, personal notes, search and Up next/Watching/Finished filters. Opening a queued video marks it Watching; finishing is explicit with Mark watched. No automatic playback-position tracking, Google OAuth, playlist import or YouTube account modifications are implemented. YouTube may require opening some videos externally; the player always provides that link. Video IDs are validated and embeds are built from IDs, never arbitrary saved HTML or URLs.

`GET/PUT /api/watch` persists a versioned library. Conflicting revisions return 409 and refresh the current library while retaining the editor draft for review. Corrupt files are preserved and writes fail rather than resetting data. Deleting a video asks for confirmation and removes its notes. The production API is a separate entrypoint with no productivity integration routes. See deploy/README.md for storage, authentication and updates.

Checks: `npm run test:watch --prefix apps/web` and Python `test_watch.py` cover accepted/rejected URLs, filtering, persistence, permissions, version conflicts, corruption and production origin/auth checks.


Pasting a supported YouTube link into the Watch editor fetches metadata after a 350 ms debounce. Previous lookups are cancelled when the video or editor changes. A custom title is retained; automatically populated titles update when a different link is pasted. Thumbnail previews come from canonical YouTube image URLs. Lookup failures keep manual title entry available. Channel information is stored with new/edited videos; older records remain readable without migration.

The read-only `/api/watch/metadata?video_id=...` endpoint accepts only an 11-character video ID and calls YouTube's fixed oEmbed endpoint with an 8-second timeout and no redirect following. It caches up to 256 results for one hour. It does not fetch arbitrary user-supplied URLs or embed provider-supplied HTML. The Watch API needs an outbound network for this lookup; no incoming host port is exposed. The Watch interface now uses an editorial shelf layout with serif display typography, warm paper/brown/amber colors, a featured video, collection index, and focused player. No extra stylesheet was introduced.


The current Watch design follows the supplied document-editor reference: a framed application surface, dark brown collection index, amber identity strip, subtle 18px graph-paper background, and serif titles. The sidebar becomes a wrapped navigation block on small screens. The paper CSS is scoped to `.watch-paper` in the existing Tailwind stylesheet; no abandoned stylesheet or alternate theme is retained. Playback, metadata and storage behavior are unchanged by this visual revision.

Watch now opens directly into a full-width header search and Save a video action, followed by queue filters and video results. The introductory headings, total-video summary, shelf heading, empty-library explanatory copy and sidebar descriptions were removed following the annotated review. The library heading and search label remain available to assistive technology without adding visible copy.

The Watch editor only shows metadata status while loading or when lookup fails. The status select uses an inset custom chevron with native keyboard behavior. Notes and tags use a full-width disclosure with explicit expanded state and labelled fields. Primary buttons have separate base/hover styles to preserve white-on-dark contrast without conflicting neutral hover backgrounds.


### Dedicated video pages

Each saved video opens at `/video/<record-id>` on watch.ignis.farm, or `/watch/video/<record-id>` locally. Video thumbnails, titles and Watch video actions use ordinary links, supporting browser history, opening in a new tab and direct access. The dedicated page contains only the player, title, channel, notes and watch actions, with Back to library navigation. The library no longer renders an inline player. The existing nginx HTML fallback serves deep links on refresh. Unknown/deleted IDs show Video not found rather than opening a different video. Opening a queued record attempts to mark it Watching once per page visit; Mark watched remains explicit. Deleting the currently open video returns to the library. No backend records or permissions change for routing.


### Playback progress and comments

The dedicated watch page now uses the YouTube IFrame API. Each video resumes from its saved `progressSeconds`. Ignis saves position and duration about every 10 seconds after playback starts, on pause/end, when the page is hidden and on pagehide; requests use keepalive for navigation. Abrupt browser/process termination can lose the latest few seconds. External YouTube playback does not update this position. If a content blocker prevents player API access, playback can remain available while progress tracking shows an explanatory status. Start from beginning seeks the player to zero. Completing a video remains an explicit Mark watched action.

`PATCH /api/watch/<id>/progress` merges only progress fields into the current record under the store lock; `POST /api/watch/<id>/comments` appends timestamped Ignis comments with idempotent UUIDs. Both return the latest library revision. Ordinary library edits preserve server-owned progress/comments, including when an editor was open while progress saved. Comments and their drafts are separate from the general video editor. Existing notes appear as Saved notes in the comments section and remain editable through the library's Edit video action. The comments are part of the existing shared private Ignis library, not YouTube comments. No external comments are read or posted.

Player implementation follows https://developers.google.com/youtube/iframe_api_reference .


### Video page actions and comment layout

The video title appears above playback. A top action bar provides a five-star personal rating (click the selected star to clear), a heart to toggle favorite and a watched check icon that can also mark the video not watched. Each icon has an accessible name, visible focus and pressed state. Channel labels and the app-level external YouTube action/helper sentence were removed from the watch page; the embedded YouTube player retains its own native controls.

`PATCH /api/watch/<id>/preferences` atomically merges only supplied rating (0-5), favorite or status fields. These settings persist in the existing library with defaults for older records. Whole-library edits preserve rating and favorite fields to avoid resetting them while editing metadata. Player progress updates do not overwrite watched state.

Comments use a narrower reading column, compact composer that expands on focus, character counter, Cancel/Post actions, Ctrl/Cmd+Enter posting, clear paper-backed entries and timestamps. A count is displayed, and ordering is selectable when there are multiple comments. Existing comment records and saved notes remain intact.


### Personal notebook refinement

The video page now labels the personal entries Notes. The count sits on the heading baseline; the transparent, serif composer and bullet list use the existing graph-paper surface, with small timestamps under each note. Chat avatars, bubbles and entry cards were removed. Stored comment records and the existing endpoint remain unchanged for compatibility; no entries were migrated or deleted. The rendered component is VideoNotes.tsx; the obsolete VideoComments component file was removed.

Ratings use @smastrom/react-rating 1.5.0 with a custom warm star palette, hover previews, reset support and keyboard navigation. Its required stylesheet is imported once in VideoActions.tsx. Watched/favorite controls use consistent square shapes and the watched icon is a single clear check. React 19 server rendering of the rating component and the Vite production build were checked.


### Side-by-side notes

Desktop video pages now use a wider frame with a flexible player column and a 300-320px right-hand Notes panel. The player and panel are sticky within the page; long note lists scroll within the panel. On screens below the desktop breakpoint, notes stack below playback. The editor is hidden initially and opened with an accessible add-note icon. Opening focuses the textarea; closing preserves an unfinished draft, while Cancel explicitly clears it. Successful posting returns focus to the add-note icon. Sorting controls were removed; notes remain newest first. The heading/count share one typographic size and line-height. Existing records and playback state are unchanged.

Watch library pagination shows 10 videos total per page, including the featured video. Previous/Next controls and page status appear when filtered results exceed 10 items. Search, collection and status changes reset to page 1; removing records clamps the current page to the last available page. Pagination applies after filtering and does not change saved ordering or records.


### Multiple collections per video

Videos now store a `collections` array (up to 20 unique names, 1-80 characters each). Legacy records with only `collection` load into a one-item array without rewriting the file on read. The legacy scalar remains synchronized to the first collection for compatibility; an explicitly empty array clears membership. The editor displays removable selected collections and an add/create input supporting Enter. Any uncommitted name in that input is included when saving the video. Collection filters, counts and card labels use all memberships; the all-videos view and pagination contain each video once. Existing tags, notes, ratings, favorites and playback progress are preserved.


### Compact library cards

The library now uses a uniform grid rather than a featured-video layout: three columns from the desktop breakpoint, two on small/tablet screens, one on narrow screens. Cards show only thumbnails and titles; channel, status, collection and tag metadata are hidden on the cards without changing stored values or filter behavior. Each thumbnail has a separate accessible edit-icon button outside its watch link, always visible for touch/keyboard use. Ten videos per page remains unchanged. The header action is Add video with a plus icon. The sidebar heading is Collections, and collection counts cannot shrink or wrap into separate digits.


### Video editor refinement

The Add/Edit dialog now uses a labelled fixed header, scrollable field area and persistent action footer within 90% of the viewport height. Inputs use consistent 48px minimum heights and paper-colored surfaces. The collection input and Add button share a single aligned border, without conflicting input margins. Collection creation uses one handler for mouse/Enter and enforces the existing name/count limits. A compact metadata preview separates the video details from collection/tag/status organization. Remove video remains separate from Cancel and the primary Add video/Save changes action. The native dialog retains Escape, focus containment and return-focus behavior; existing records and notes are unchanged.

## Today page retired (October 18, 2026)

The standalone Today page and its exclusive files/assets have been removed. The workspace menu now offers Planner, Watch, and Markdown Notes. Old `/today` URLs open the notebook. Earlier Today sections above describe historical decisions; planner connections, food/exercise tools, Notes publishing, and shared cover assets remain in use.

## Planner page retired (October 18, 2026)

Planner has been removed from the workspace menu and web source, including its exclusive embedded panels, models, and tests. `/planner` now opens the notebook. The earlier integration and Planner sections are historical; backend records and integration services remain intact.

## Quartz retired (October 18, 2026)

Quartz source, publishing/reader integration, and the local runtime have been removed at the user's request. The active editor is the Tiptap notebook. Earlier Quartz sections are historical; saved Markdown drafts/images and existing published files remain preserved outside the repository.
