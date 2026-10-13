# Ignis web app

The web app uses React, TypeScript, Vite and Chakra UI. The local homepage is an interactive workspace prototype inspired by the supplied Obsidian screenshot: an icon rail, folder tree, task/note pane and calendar. The live site still serves the original holding page.

## Requirements and commands

Use Node.js 24. The project pins Node 24.14.0 through Volta and `.node-version`; this does not change the global Node default.

From `apps/web/`:

```sh
npm install
npm run dev
```

Open http://127.0.0.1:5173. The server binds to localhost and fails if the port is occupied.

```sh
npm run typecheck
npm run build
npm run preview
```

`build` checks TypeScript and generates the production website in `dist/`. `preview` serves that build at http://127.0.0.1:4173.

## Source layout

```text
apps/web/
  index.html            # Vite HTML entry and page metadata
  public/               # Static assets copied into builds
  src/
    main.tsx            # React entry point
    app/
      App.tsx           # App root
      AppProvider.tsx   # Chakra provider
      theme.ts          # Ignis colors, fonts and global styles
    pages/
      WorkspacePage.tsx # Current interactive workspace prototype
      workspace.css     # Workspace-specific layout and styling
    features/workspace/ # Sample data, shared icons and calendar
  package.json          # Scripts, exact dependency versions and Node requirements
  package-lock.json     # Reproducible dependency resolution
  tsconfig.json         # Strict TypeScript checks
  vite.config.ts        # React build configuration
```

Use Chakra components for common controls and layouts. Add reusable application components as real screens require them. The current preview uses the reference’s print-inspired workspace style, with warm paper surfaces, cobalt blue sans-serif headings, restrained red action accents and all navigation in a paper-toned side menu. The top bar contains only the wordmark and a mobile menu button. Task completion/creation/search, folder expansion, calendar navigation and note editing use in-memory sample data. Food plans and eating logs persist in this browser; notes reset on reload. No backend is connected. Smaller screens show the folder and calendar panels on demand.

React Router is planned for navigation as additional screens are built. TanStack Query is planned for API-connected screens. Neither is installed just to wrap the current static screen. FastAPI remains a separate backend.

## Existing page and production

The original static HTML is preserved in `../../docs/archive/holding-page.html` (relative to this folder). It is not placed in `public/`, where it would conflict with Vite's generated `dist/index.html`.

Production still serves the existing page from `/opt/ignis/public/`, protected by Tinyauth. This local development server does not implement or test production sign-in. A future approved deployment must copy the **built contents of `dist/`**, not this source directory, to the production site directory. No production deployment has been performed as part of setup.

See `../../docs/web.md` for web decisions. Git remains uninitialized.

The default Today view presents a full sample day across tasks, food, exercise, medication reminder reviews and habits, with one chosen next action, completion and undo. Unscheduled tasks, extra folders and the calendar are revealed on demand. This is a usability trial with sample content, not a clinical intervention.

The day plan currently uses illustrative times and in-memory check-ins. Medication entries only mark a reminder as reviewed; there is no prescription, dose logging or Raira data connection. Reloading clears changes.

Food, Exercises, Meds and Habits each have a dedicated side-menu view. These views and Today share the same in-memory entries and check-in states; logging and undo remain consistent between views. Meds currently tracks sample reminder reviews only.

## Food planning and eating log

Food supports dated meal plans (any meal or snack name, time, food and optional notes) and separate records of what was actually eaten. Plans and logs can be edited or removed, with undo for the last change. Removing a plan retains linked eating history. Planned meals appear on Today; its Log meal action opens an editor rather than recording consumption automatically.

Food data is saved only in this browser under `ignis.food.v1`; it survives reloads but does not sync with a backend, native apps or food.raira.app. Tasks and daily check-ins are saved in this browser; notes remain in memory. Storage errors are displayed rather than treated as successful saves.

Run `npm run test:food` from `apps/web/` for plan/log integrity checks, then `npm run build` for TypeScript and production compilation.

Saved meals are reusable copies of a meal name, food and notes. Create or edit them in the Saved meals view, save an existing plan/log for reuse, or save a reusable copy when submitting a new record. Reuse prefills the plan or log editor without saving automatically. Existing browser records are normalized with an empty library; template edits and removals never change previous plans or eating logs. The library uses the same browser-only storage and undo.

Food now opens on the next unlogged planned meal and provides three views: Meal plan, What I ate, and Saved meals. Record editors use a native modal dialog with focus containment and Escape dismissal. Saved-meal selection is directly visible in plan/log editors; secondary record actions are disclosed under More. Existing food data and storage behavior are unchanged.

## Mini garden

Today has an original SVG garden with three plants. Unique completed tasks, exercise/habit check-ins and eating log IDs contribute once; medication reviews, plans and saved meals are excluded. Undo reverses growth. Plants progress through seed, sprout, leaves and bloom, with no expiration or missed-day penalties. At nine contributions all three are mature; later contributions remain counted without resetting the garden.

Growth is derived from the existing records rather than a separate points counter. Task and daily check-in state now persist in this browser (`ignis.tasks.v1`, `ignis.checkins.v1`), alongside food. Invalid stored data is not overwritten, and saving failures are shown. The brief growth animation respects reduced-motion preferences. No backend or cross-device sync is connected.

Run `npm run test:garden` for contribution, undo and stage checks.
