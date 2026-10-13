# Web application decisions

## Implemented foundation

- React with TypeScript.
- Vite for development and production builds.
- Chakra UI with Emotion for the component styling system.
- One application-wide Chakra provider and an Ignis theme based on Chakra's default configuration.
- Node.js 24, pinned to 24.14.0 for this app without changing the global default.
- Exact direct dependency versions plus npm's lockfile.
- Strict TypeScript checks as part of the production build.
- An interactive editorial workspace prototype with a cream canvas, paper-toned navigation, cobalt blue sans-serif headings and red action accents.
- Task list, folder navigation, editable notes and month calendar using in-memory sample content.
- Responsive panels and keyboard-accessible controls.
- The unused Chakra holding page component has been removed. The original static HTML is retained only as a deployment archive.

Chakra UI replaces the earlier Mantine proposal. Shared control styling belongs in the Chakra theme; CSS Modules can be added for styles that benefit from a separate stylesheet.

## Prototype boundary

The homepage is a layout and interaction trial. Task and note changes reset on reload. Calendar indicators and note content are illustrative, and the sample day is October 12, 2026. No Raira records, real medication data or backend APIs are involved. Production remains the protected holding page.

## Planned as features are built

- React Router for additional pages and navigation.
- TanStack Query for FastAPI server data, caching and mutations.
- API client types based on the backend's OpenAPI contract.
- Product screens, feature-specific components and meaningful tests.
- Authentication and API integration for the web application.

## File and deployment boundaries

The Vite entry is `apps/web/index.html`. Application code lives under `apps/web/src/`; assets live under `apps/web/public/`; production output goes to `apps/web/dist/`.

The earlier standalone HTML is archived at `docs/archive/holding-page.html`. Keeping it outside Vite's public directory avoids overwriting the generated app entry during a build.

The existing server configuration remains unchanged. A future approved deployment should serve the contents of the Vite output in `/opt/ignis/public/`. Client-side routing will require the nginx HTML fallback to be configured when routing is introduced. Preserve the site's Tinyauth protection, server-only credentials and authentication volume.

Native SwiftUI code and backend implementation remain in their own directories. Git is still deferred.

The default Today view presents a full sample day across tasks, food, exercise, medication reminder reviews and habits, with one chosen next action, completion and undo. Unscheduled tasks, extra folders and the calendar are revealed on demand. This is a usability trial with sample content, not a clinical intervention.

The paper-toned navigation uses outlined sans-serif primary links, fine blue dividers and a filled blue active state. Monospace is reserved for small metadata and folder headings; all navigation targets remain at least 44 pixels tall.

The Digital Impact reference informs a fine blue background grid around a plain reading sheet, an outlined focus panel and clear navigation controls. The grid stays outside the reading surface.

The day plan currently uses illustrative times and in-memory check-ins. Medication entries only mark a reminder as reviewed; there is no prescription, dose logging or Raira data connection. Food persists locally; notes reset on reload.

Food, Exercises, Meds and Habits each have a dedicated side-menu view. These views and Today share the same in-memory entries and check-in states; logging and undo remain consistent between views. Meds currently tracks sample reminder reviews only.

## Food planning and eating log

Food supports dated meal plans (any meal or snack name, time, food and optional notes) and separate records of what was actually eaten. Plans and logs can be edited or removed, with undo for the last change. Removing a plan retains linked eating history. Planned meals appear on Today; its Log meal action opens an editor rather than recording consumption automatically.

Food data is saved only in this browser under `ignis.food.v1`; it survives reloads but does not sync with a backend, native apps or food.raira.app. Tasks and daily check-ins are saved in this browser; notes remain in memory. Storage errors are displayed rather than treated as successful saves.

Run `npm run test:food` from `apps/web/` for plan/log integrity checks, then `npm run build` for TypeScript and production compilation.

Saved meals are reusable copies of a meal name, food and notes. Create or edit them in the Saved meals view, save an existing plan/log for reuse, or save a reusable copy when submitting a new record. Reuse prefills the plan or log editor without saving automatically. Existing browser records are normalized with an empty library; template edits and removals never change previous plans or eating logs. The library uses the same browser-only storage and undo.

Food now opens on the next unlogged planned meal and provides three views: Meal plan, What I ate, and Saved meals. Record editors use a native modal dialog with focus containment and Escape dismissal. Saved-meal selection is directly visible in plan/log editors; secondary record actions are disclosed under More. Existing food data and storage behavior are unchanged.

## Mini garden

Today has an original pixel-art SVG farm with three plants, a small farmhouse, fence and soil beds. Unique completed tasks, exercise/habit check-ins and eating log IDs contribute once; medication reviews, plans and saved meals are excluded. Undo reverses growth. Plants progress through seed, sprout, leaves and bloom, with no expiration or missed-day penalties. At nine contributions all three are mature; later contributions remain counted without resetting the garden.

Growth is derived from the existing records rather than a separate points counter. Task and daily check-in state now persist in this browser (`ignis.tasks.v1`, `ignis.checkins.v1`), alongside food. Invalid stored data is not overwritten, and saving failures are shown. The brief growth animation respects reduced-motion preferences. No backend or cross-device sync is connected.

Run `npm run test:garden` for contribution, undo and stage checks.

The pixel farm now spans the reading column, with larger crop sprites, distinct stage sizes, raised beds, a farmhouse, trees, tools and a pond. A short sparkle accompanies growth; reduced motion keeps the scene static.

## Interactive farm prototype

Aseprite 1.3.18.6 is available locally. Original editable character source is `art/farm/farmer.aseprite`; `art/farm/create-farmer.lua` regenerates it through Aseprite's batch scripting. The exported four-frame sheet is `apps/web/public/farm/farmer.png`.

The farm supports click/tap movement along the foreground grass lane, arrow keys/WASD while the map is focused, and cottage/bed inspection. Equivalent HTML buttons expose the places to keyboard users. The cottage's Open daily plan action returns to the next-action area. This is a first interaction prototype, with a bounded movement lane rather than a full navigable game world. Reduced motion moves the character instantly. Farm growth and saved records are unchanged; generated landscape concepts have not been added.

The static farm scene is now authored in Aseprite: `art/farm/farm-scene.aseprite` has eight editable layers, generated by `create-scene.lua` and exported to `apps/web/public/farm/farm-scene.png`. The runtime uses that image beneath the live crops and moving character. Cottage and bed coordinates remain aligned with existing interactions. See `art/farm/README.md` for export instructions.

## Farm hub dashboard

Today retains a next-action panel and the full-day agenda around the interactive farm. Direct location buttons open native pixel-framed dialogs: Cottage provides task planning/addition/check-offs; Kitchen uses the existing complete Food tools; Training yard, Garden and Medicine cabinet open exercise, habit and medication-review views. Walking remains optional and limited to the existing grass lane. Sidebar navigation remains available.

Aseprite scene layer 08 adds a kitchen, training yard and medicine cabinet. `art/farm/decorations.aseprite` contains three cosmetic sprites exported as `apps/web/public/farm/decorations.png`: porch light at three growth steps, flag at six, flowers at nine. No new reward counter or storage migration is introduced. Medication reviews remain excluded. Nested food editing dialogs close independently of their farm panel.

## Game-first Today screen

Today now hides the website headline, breadcrumbs and persistent sidebar, replacing them with a compact character/next-action HUD and a larger farm playfield. The Menu button opens navigation as an overlay. Location buttons use cropped Aseprite artwork as pixel icons and open practical farm panels directly. The whole-day agenda remains available in an expandable Day journal; unscheduled tasks remain accessible below it. Supporting forms retain normal readable text. Stored records, growth rules and the bounded walking lane are unchanged.

## Bahia scene lighting

The farm uses the current instant formatted in `America/Bahia`, refreshed every minute and when browser visibility changes. Artistic phases: dawn 05:00–07:00; day 07:00–16:00; golden hour 16:00–18:00; dusk 18:00–19:00; night otherwise. These are fixed aesthetic bands, not astronomical sunrise calculations or weather data. The HUD identifies Bahia and the current phase. The selected planning date does not change the live lighting clock.

The runtime Aseprite export hides its Sky layer so the app can draw a changing sky, moving sun and nighttime moon/stars. The editable source retains its Sky layer. World tint covers crops and character as well as scenery; pointer events pass through lighting. Warm night windows and subtle ambient details do not affect rewards or saved data. `npm run test:clock` validates timezone conversion, phase boundaries and sun positions.

Tree art now uses a shaded oak and a layered pine in the native scene. Sky detail comes from a separate Aseprite cloud overlay, pixel horizon bands, sun highlights, a textured moon and distant stars, all compatible with the existing Bahia lighting phases.

Clouds drift slowly in pixel steps; oak and pine canopies rustle independently while trunks stay fixed. The native Tree canopies layer exports separately. Pause wind freezes both motions; reduced-motion preferences disable them. Lighting continues to use Bahia time.

The pixel-console interface uses charcoal backgrounds, slate panels, bright text and a restrained pink action accent. The farm artwork uses outlined pixel silhouettes in a limited charcoal/slate/pale palette with small pink accents, authored directly in Aseprite. Live plants and sky lighting match that palette. No desaturation filter is applied. Day/night brightness, interactions and saved progress are unchanged.
