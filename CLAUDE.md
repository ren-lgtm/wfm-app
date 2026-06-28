# CLAUDE.md

Tempo — workforce-management app for CX teams (React + Vite + Tailwind + Supabase).

**Read [ARCHITECTURE.md](./ARCHITECTURE.md) for the full map** (file structure,
data model, staffing math, common tasks). This file is the quick reference +
the invariants that cause bugs if ignored.

## Commands
- `npm run dev` — Vite dev server on :5173
- `npm run build` — production build (run this to catch errors; there is no test suite)
- Live UI verification needs Google OAuth + Supabase, so the login screen blocks
  headless testing — say so when you can't visually confirm a change.

## Critical invariants (don't break these)
1. **Dates are PT-anchored `YYYY-MM-DD` strings.** Never `new Date("2026-06-28")`
   (parses as UTC, shifts the day). Use helpers in `lib/forecast.js` /
   `TimelineView.jsx` (`parsePTDate`, `addDays`, `toISODate`, `getDayOfWeekIdx`).
2. **Slots are 15-min quarters (0-95)**, stored in the `hour` column of
   `schedule_slots`/`template_slots` (migration 012). quarter q = hour
   `floor(q/4)`, minute `(q%4)*15`. Empty quarter = delete the row, never null.
   Coverage/forecast stay **hourly** — aggregate an agent's 4 quarters to one
   activity (`dominantHourActivity`, majority ≥2). Worked hours = quarters/4.
3. **Editing is local-first with explicit Save.** DayView (`TimelineView.jsx`) and
   WeekTemplateGrid (`TemplatesPage.jsx`) hold local slots via `useUndoRedo`;
   edits push snapshots, Save diffs vs canonical. Don't write straight to the DB
   on every edit. The dirty-guard sync must not clobber unsaved edits.
4. **Drag hour math is per-column.** Templates measures the real day-column left
   edge from the DOM (`[data-day-col]`) — do NOT hardcode a column-width guess
   (that broke Tue–Fri resizing before).
5. **Shift blocks fill the cell** (no inset/rounding) — the cell bg is white in
   light mode, so any gap shows as a white outline.
6. **Theming + brand color are CSS overrides in `index.css`**, not per-component.
   Brand `#4F7EF8` is a global remap of `bg-blue-600`/`hover:bg-blue-500`/etc.
   `bg-blue-900/60` & `text-blue-300` (email coverage) are semantic — leave them.

## Conventions
- Reuse `ConfirmModal` instead of `window.confirm`/`alert`; surface errors in-UI.
- Match surrounding Tailwind style. Run `npm run build` after edits.
- DB changes go in numbered `supabase/migrations/`.
- End commit messages with the `Co-Authored-By` trailer.
