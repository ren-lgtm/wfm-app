# Tempo — Architecture & Maintenance Guide

Workforce-management tool for CX teams: build agent schedules on a drag-to-edit
timeline, forecast call/email volume, and surface coverage gaps. Single-page
React app backed by Supabase (Postgres + Auth).

> This file is a map for making changes safely. Read the **Gotchas** section
> before touching schedules, drag/resize, or theming — most bugs live there.

---

## Stack

- **React 18** + **Vite 5** (JSX, no TypeScript)
- **Tailwind CSS 3** (utility classes; dark theme is the default)
- **Supabase** (`@supabase/supabase-js`) — Postgres data + Google OAuth
- **lucide-react** icons, **date-fns** (rarely used; most date logic is hand-rolled)
- No router in practice: `main.jsx` swaps Login ↔ SchedulePage; in-app nav is
  local state (`activeView`) in `SchedulePage`. `react-router-dom` is installed
  but not central.

Scripts: `npm run dev` (Vite dev server :5173), `npm run build`, `npm run preview`.
Env: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (in `.env`, gitignored).

---

## Entry & auth flow

`main.jsx` → `AuthProvider` → `AppContent`:
1. `loading` → spinner
2. no `user` → `LoginPage` (Google OAuth)
3. `user` but no `role` → "no access" screen (user isn't in `app_users`)
4. otherwise → `SchedulePage`

`contexts/AuthContext.jsx` exposes `{ user, role, agentId, loading, signOut }` via
`useAuth()`. `role` ∈ `member | lead | admin`; `agentId` links a login to an
`agents` row (so a member can edit only their own schedule).

Theme is `data-theme="dark|light"` on `<html>`, persisted to `localStorage`
(`wfm-theme`), toggled in `SchedulePage`.

---

## File map

```
src/
  main.jsx                 App shell, auth gate, theme
  index.css                Tailwind + CSS vars + ALL light-mode overrides + brand color
  contexts/AuthContext.jsx Session, role, agentId
  lib/
    supabase.js            Supabase client
    forecast.js            Constants + all staffing math (see below)
  hooks/
    useSchedule.js         Loads/saves week & month schedules, agents, forecast
    useUndoRedo.js         Generic snapshot-stack undo/redo
    useShiftTypes.js       Shift types (localStorage-backed, see Gotchas)
    usePeriodKPIs.js       Answer-rate KPI for a date range
    useVolumeTotals.js     Call/ticket totals for a date range
    useAvgHandleRate.js    Tickets/agent/hr benchmark
  pages/
    SchedulePage.jsx       Main shell: sidebar nav, KPI cards, view switching
    TimelineView.jsx       THE big one (~2k lines): Day/Week/Month/Custom views,
                           drag/resize editing, CoverageBar, ShiftModal
    TemplatesPage.jsx      Reusable week templates + publish-to-weeks
    UsersPage.jsx          Manage app_users + agents
    SettingsPage.jsx       Manage shift types
    LoginPage.jsx          Google OAuth
  components/
    CoverageBar.jsx        Per-hour phone/email SLA + queue simulation
    ForecastChart.jsx      Volume/SLA/targets charts
    ConfirmModal.jsx       Shared styled confirm dialog (use instead of window.confirm)
    AgentModal, CustomRangePicker, GapBadge, ScheduleGrid, WeeklySummary
supabase/migrations/       Numbered SQL migrations (001…011)
```

---

## Data model (Supabase)

- **agents** — `id, name, email, role('phone'|'email'|'both'), default_channel,
  color, active`. Soft-deleted via `active=false`.
- **schedules** — one row per `(week_start, agent_id, day_of_week)`.
  `week_start` is **always a Monday** (date). `is_off` flags a day off.
  Unique on `(week_start, agent_id, day_of_week)`.
- **schedule_slots** — one row per `(schedule_id, hour)`; `hour` 0–23,
  `activity` = a shift-type id (`'phone'|'email'|'lunch'` + custom types).
  Migration 009 removed the hard CHECK constraint so custom shift types work.
  An "empty" hour = **no row** (we delete rather than store null).
- **schedule_templates / template_schedules / template_slots** — same shape as
  schedules, but template-scoped instead of week-scoped. Published into real
  `schedules` rows by `TemplatesPage.handleSaveTemplate` / publish panel.
- **phone_volume / email_volume / phone_sla** — historical/forecast data keyed
  by `day_of_week, hour`.
- **app_users** — `email, name, role, agent_id`. RLS enabled (migration 011):
  users read their own row; admins read/write all.
- **day_notes** — per-day free-text notes.

The in-memory schedule shape used throughout the UI:
`weekSchedule[agentId][dayOfWeek] = { [hour]: activity }` (or `{ off: true }`).

---

## Staffing math — `lib/forecast.js`

Single source of truth for coverage logic. Key constants:
- Phone hours `PHONE_START=9`–`PHONE_END=16`; work window `WORK_START=8`–`WORK_END=21`
- `AVG_CALLS_PER_AGENT_HOUR=7`, `AVG_EMAILS_PER_AGENT_HOUR=6`
- SLA target 95%; gap thresholds green ≥80%, amber ≥50%, else red

Key functions: `agentsNeededPhone/Email`, `getPhoneGap/getEmailGap`,
`phoneAnswerRate/emailAnswerRate`, `buildForecast`, plus date helpers
`getMondayOfWeek`, `toISODate`, `hLabel`. **Use these everywhere** — both
`CoverageBar` and the timeline coverage rows call the same functions so the
two views never disagree.

---

## Gotchas (read before editing)

### 1. Time is anchored to Pacific (PT), and dates are strings
Schedules are PT-anchored. Date keys are `YYYY-MM-DD` **strings**, not `Date`
objects. **Never** do `new Date("2026-06-28")` — it parses as UTC and shifts the
day. Use the helpers: `parsePTDate`, `addDays`, `toISODate`, `getDayOfWeekIdx`
(Zeller's congruence, avoids `getDay()` TZ bugs). The timeline shows PT hours
with an ET label row; hour columns are PT column indices.

### 2. The slot model: empty = no row
Writing an empty hour means **deleting** the `schedule_slots` row, not writing
null. `updateSlot`/`batchUpdateSlots` handle this. Respect it or you'll get
phantom slots.

### 3. Editing is local-first with explicit Save (undo/redo)
`TimelineView` DayView and `TemplatesPage` WeekTemplateGrid both keep a **local**
copy of slots via `useUndoRedo`. Edits (modal, drag, resize, delete) push
snapshots; nothing hits the DB until **Save**. On save we diff local vs
canonical and write only changes (`batchUpdateSlots` for timeline; per-(agent,day)
rewrite for templates).
- `canonicalSlots` = DB truth; `localSlots` = what's on screen.
- A content-signature effect re-syncs local→canonical on nav/reload **but only
  when not dirty** (`isDirtyRef`), so it never clobbers unsaved edits.
- Coverage bars & hour totals compute from `localSlots`, so they update live.
- Keyboard: Cmd/Ctrl+Z undo, +Shift redo (or Cmd+Y), Cmd+S save.

### 4. Drag/resize hour math must be per-column
Pointer-X → hour conversion must account for which column you're over.
- Timeline (single day): `clientXToHour` subtracts the 140px agent column.
- Templates (5 day columns): **measures the real day-column left edge from the
  DOM** via `[data-day-col="Tue"]` — do NOT reintroduce a hardcoded column-width
  guess, that's what broke Tue–Fri resizing historically.
Both views use pointer capture (`setPointerCapture`) + edge auto-scroll. During a
drag, only the dragged block's original hours are hidden; other shifts stay
visible.

### 5. Blocks fill the cell; light-mode white was an inset bug
Shift blocks are positioned to fill the whole cell (timeline: `td` is
`relative p-0`, block is `absolute inset-0`; templates: block is `absolute`
top/bottom 0, no rounding). Any inset/rounding shows the cell background, which
in **light mode** is white — that was the "white outline around blocks" bug.
Keep blocks edge-to-edge.

### 6. Theming = CSS overrides in `index.css`, not per-component
Light mode is implemented almost entirely as `[data-theme="light"]` attribute-
selector overrides at the bottom of `index.css` (mapping dark hex classes like
`bg-[#141922]` → light values). The **brand color** (`#4F7EF8`) is likewise a
global remap of `bg-blue-600` / `hover:bg-blue-500` / `focus:border-blue-500`,
etc. So:
- Changing the brand color = edit the CSS remap block, not every component.
- `bg-blue-900/60` / `text-blue-300` (email coverage cells) are **semantic, not
  brand** — they're intentionally left out of the remap.
- If you add a new dark hex like `bg-[#XXXXXX]`, add a light-mode override too.

### 7. Shift types live in localStorage
`useShiftTypes` stores types in `localStorage` (`wfm-shift-types`), seeded from
`DEFAULT_SHIFT_TYPES`. The "Reset to defaults" path uses a `__reset__` sentinel
passed through `onAdd` → handled in `SchedulePage.handleShiftTypeAdd`.

### 8. Mock data is gone
The app always uses live Supabase data. `weekSchedule` starts `null` (shows the
loading spinner) and DayView shows an empty-state when there are no agents.

---

## Common tasks

- **New shift type behavior** → `useShiftTypes.js` + `SettingsPage.jsx`.
- **Change coverage thresholds / staffing ratios** → `lib/forecast.js` constants
  (updates timeline + CoverageBar together).
- **Touch schedule save/load** → `useSchedule.js` (`loadWeek`, `updateSlot`,
  `batchUpdateSlots`, `copyLastWeek`).
- **Drag/resize behavior** → `TimelineView.jsx` (DayView handlers) /
  `TemplatesPage.jsx` (WeekTemplateGrid handlers). Mind Gotcha #4.
- **Branding / colors** → `index.css` brand remap block + `TempoMark` SVG in
  `SchedulePage.jsx` / `LoginPage.jsx` + `public/favicon.svg`.
- **Roles / access** → `AuthContext.jsx` + the `NAV` gating in `SchedulePage.jsx`
  + `app_users` RLS (migration 011).
- **DB change** → add a numbered migration in `supabase/migrations/`.

## Conventions

- Match surrounding Tailwind style; reuse `ConfirmModal` instead of
  `window.confirm`/`alert`.
- Surface errors in-UI (banners/toasts), not just `console.error`.
- After edits, run `npm run build` to catch issues (no test suite; the
  `test_*.js` Playwright scripts are ad-hoc and need a running dev server + auth).
- Verifying UI changes live requires Google OAuth + a Supabase backend, so the
  login screen blocks headless testing — call that out when you can't visually
  confirm a change.
