# WFM — CX Staffing App

A workforce management app for scheduling CX agents, forecasting call/email volume, and detecting coverage gaps in real time.

---

## Stack

- **Frontend**: React + Tailwind, hosted on Vercel
- **Database**: Supabase (Postgres)
- **Daily sync**: Supabase Edge Function (Aircall + Gorgias APIs → DB)

---

## Setup: Step by Step

### 1. Supabase

1. Go to [supabase.com](https://supabase.com) → New project
2. Once created, go to **SQL Editor**
3. Paste the contents of `supabase/migrations/001_initial_schema.sql` and run it
4. Go to **Project Settings → API** and copy:
   - `Project URL` → this is your `VITE_SUPABASE_URL`
   - `anon public` key → this is your `VITE_SUPABASE_ANON_KEY`

### 2. GitHub

1. Create a new repo on GitHub (e.g. `wfm-app`)
2. In your terminal:
```bash
cd path/to/wfm
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/wfm-app.git
git push -u origin main
```

### 3. Vercel

1. Go to [vercel.com](https://vercel.com) → New Project
2. Import your GitHub repo
3. Add environment variables:
   - `VITE_SUPABASE_URL` = your Supabase project URL
   - `VITE_SUPABASE_ANON_KEY` = your Supabase anon key
4. Deploy

### 4. Daily Volume Sync (Supabase Edge Function)

This runs nightly to pull yesterday's Aircall + Gorgias data into your DB automatically.

1. Install Supabase CLI: `npm install -g supabase`
2. Link your project: `supabase link --project-ref YOUR_PROJECT_REF`
3. Deploy the function: `supabase functions deploy sync-volume`
4. Set the function secrets:
```bash
supabase secrets set AIRCALL_API_ID=your_id
supabase secrets set AIRCALL_API_TOKEN=your_token
supabase secrets set GORGIAS_SUBDOMAIN=suzannesomers
supabase secrets set GORGIAS_EMAIL=your_email
supabase secrets set GORGIAS_API_KEY=your_key
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```
5. Schedule it (in Supabase dashboard → Edge Functions → Schedules):
   - Cron: `0 6 * * *` (6am UTC = 2am ET, runs after midnight)

### 5. Backfill Historical Data (optional but recommended)

To seed the DB with your existing 30-day Aircall + Gorgias data, run the node scripts we built earlier and use the Supabase JS client to insert. Or just let the daily sync run for a few weeks — your forecast will get more accurate over time automatically.

---

## Local Development

```bash
cp .env.example .env.local
# fill in your Supabase URL and anon key

npm install
npm run dev
```

---

## App Features

- **Schedule builder** — click any cell to cycle Phone → Email → Lunch → Off
- **Gap detector** — real-time red/amber flagging per hour vs forecast volume
- **Copy last week** — one click to duplicate previous week as a starting point
- **Forecast tab** — bar chart of expected call/email volume by day and hour
- **Agents tab** — add, edit, remove agents. Color-coded, role-aware
- **Weekly summary** — total hours and FTE per agent

---

## Agent Colors (default)
- Deb — purple
- Ezra — cyan
- Lucy — green
- Delaney — amber
- Allison — red
- Dolly — pink
- Lori — lime
