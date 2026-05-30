// supabase/functions/sync-volume/index.ts
// Deploy with: supabase functions deploy sync-volume
// Schedule via Supabase cron: 0 6 * * * (runs 6am UTC = 2am ET daily)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SERVICE_ROLE_KEY')!
)

const AIRCALL_API_ID = Deno.env.get('AIRCALL_API_ID')!
const AIRCALL_API_TOKEN = Deno.env.get('AIRCALL_API_TOKEN')!
const GORGIAS_SUBDOMAIN = Deno.env.get('GORGIAS_SUBDOMAIN')!
const GORGIAS_EMAIL = Deno.env.get('GORGIAS_EMAIL')!
const GORGIAS_API_KEY = Deno.env.get('GORGIAS_API_KEY')!

function etHour(utcTimestamp: number): number {
  const etOffset = -4 // EDT; change to -5 for EST in winter
  return (Math.floor(utcTimestamp / 3600) % 24 + etOffset + 24) % 24
}

function etDate(utcTimestamp: number): string {
  const etOffset = -4
  const d = new Date((utcTimestamp + etOffset * 3600) * 1000)
  return d.toISOString().split('T')[0]
}

async function syncAircall() {
  // Pull yesterday's calls
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  yesterday.setHours(0, 0, 0, 0)
  const from = Math.floor(yesterday.getTime() / 1000)
  const to = from + 86400

  const auth = btoa(`${AIRCALL_API_ID}:${AIRCALL_API_TOKEN}`)
  let page = 1
  let hasMore = true
  const hourCounts: Record<number, number> = {}

  while (hasMore) {
    const res = await fetch(
      `https://api.aircall.io/v1/calls?direction=inbound&from=${from}&to=${to}&per_page=50&page=${page}`,
      { headers: { Authorization: `Basic ${auth}` } }
    )
    const data = await res.json()
    const calls = data.calls || []
    for (const call of calls) {
      const h = etHour(call.started_at)
      hourCounts[h] = (hourCounts[h] || 0) + 1
    }
    hasMore = calls.length === 50
    page++
    await new Promise(r => setTimeout(r, 500))
  }

  const dateStr = etDate(from + 3600) // midday of yesterday ET
  const rows = Object.entries(hourCounts).map(([hour, count]) => ({
    date: dateStr,
    hour: parseInt(hour),
    call_count: count,
  }))

  if (rows.length) {
    await supabase.from('phone_volume').upsert(rows, { onConflict: 'date,hour' })
    console.log(`Aircall: inserted ${rows.length} rows for ${dateStr}`)
  }
}

async function syncGorgias() {
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  const dateStr = yesterday.toISOString().split('T')[0]

  const auth = btoa(`${GORGIAS_EMAIL}:${GORGIAS_API_KEY}`)
  const cutoff = new Date(dateStr)
  const nextDay = new Date(cutoff)
  nextDay.setDate(nextDay.getDate() + 1)

  // Fetch tickets from yesterday
  let cursor: string | null = null
  const hourCreated: Record<number, number> = {}
  const hourResponded: Record<number, number> = {}
  let done = false

  while (!done) {
    let url = `https://${GORGIAS_SUBDOMAIN}.gorgias.com/api/tickets?limit=100&order_by=created_datetime%3Adesc`
    if (cursor) url += `&cursor=${encodeURIComponent(cursor)}`

    const res = await fetch(url, { headers: { Authorization: `Basic ${auth}` } })
    const data = await res.json()
    const tickets = data.data || []

    for (const t of tickets) {
      const created = new Date(t.created_datetime)
      if (created < cutoff) { done = true; break }
      if (created >= nextDay) continue
      if (t.channel !== 'email') continue

      const etOffset = -4
      const h = (created.getUTCHours() + etOffset + 24) % 24
      hourCreated[h] = (hourCreated[h] || 0) + 1
    }

    if (!data.meta?.next_cursor || tickets.length < 100) break
    cursor = data.meta.next_cursor
    await new Promise(r => setTimeout(r, 400))
  }

  const rows = Array.from({ length: 24 }, (_, h) => ({
    date: dateStr,
    hour: h,
    tickets_created: hourCreated[h] || 0,
    tickets_responded: hourResponded[h] || 0,
  })).filter(r => r.tickets_created > 0 || r.tickets_responded > 0)

  if (rows.length) {
    await supabase.from('email_volume').upsert(rows, { onConflict: 'date,hour' })
    console.log(`Gorgias: inserted ${rows.length} rows for ${dateStr}`)
  }
}

Deno.serve(async () => {
  try {
    await Promise.all([syncAircall(), syncGorgias()])
    return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } })
  } catch (err) {
    console.error(err)
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 })
  }
})
