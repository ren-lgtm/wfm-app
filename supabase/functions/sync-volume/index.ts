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

const PHONE_START = 12
const PHONE_END = 19
const ET_OFFSET = -4
const DAY_NAMES = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

function etHour(utcTimestamp: number): number {
  return (Math.floor(utcTimestamp / 3600) % 24 + ET_OFFSET + 24) % 24
}

function etDateStr(utcTimestamp: number): string {
  const d = new Date((utcTimestamp + ET_OFFSET * 3600) * 1000)
  return d.toISOString().split('T')[0]
}

function etDayName(utcTimestamp: number): string {
  const d = new Date((utcTimestamp + ET_OFFSET * 3600) * 1000)
  return DAY_NAMES[d.getUTCDay()]
}

async function syncAircall() {
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  yesterday.setHours(0, 0, 0, 0)
  const from = Math.floor(yesterday.getTime() / 1000)
  const to = from + 86400

  const auth = btoa(`${AIRCALL_API_ID}:${AIRCALL_API_TOKEN}`)
  let page = 1
  let hasMore = true

  const hourCounts: Record<number, number> = {}
  const hourSLA: Record<number, { answered: number; missed: number; waitSecs: number[]; }> = {}

  while (hasMore) {
    const res = await fetch(
      `https://api.aircall.io/v1/calls?direction=inbound&from=${from}&to=${to}&per_page=50&page=${page}`,
      { headers: { Authorization: `Basic ${auth}` } }
    )
    const data = await res.json()
    const calls = data.calls || []

    for (const call of calls) {
      const h = etHour(call.started_at)
      const inPhoneHours = h >= PHONE_START && h < PHONE_END

      // Volume tracking (all hours)
      hourCounts[h] = (hourCounts[h] || 0) + 1

      // SLA tracking (phone hours only)
      if (inPhoneHours) {
        if (!hourSLA[h]) hourSLA[h] = { answered: 0, missed: 0, waitSecs: [] }
        const wasAnswered = call.answered_at !== null && call.duration > 0
        if (wasAnswered) {
          hourSLA[h].answered++
          if (call.answered_at && call.started_at) {
            const wait = call.answered_at - call.started_at
            if (wait >= 0 && wait < 600) hourSLA[h].waitSecs.push(wait)
          }
        } else {
          hourSLA[h].missed++
        }
      }
    }

    hasMore = calls.length === 50
    page++
    await new Promise(r => setTimeout(r, 500))
  }

  const dateStr = etDateStr(from + 3600)
  const dayName = etDayName(from + 3600)

  // Insert volume rows
  const volumeRows = Object.entries(hourCounts).map(([hour, count]) => ({
    date: dateStr,
    hour: parseInt(hour),
    call_count: count,
    day_of_week: dayName,
  }))

  if (volumeRows.length) {
    await supabase.from('phone_volume').upsert(volumeRows, { onConflict: 'date,hour' })
    console.log(`Aircall volume: ${volumeRows.length} rows for ${dateStr}`)
  }

  // Insert SLA rows
  const slaRows = Object.entries(hourSLA).map(([hour, d]) => ({
    date: dateStr,
    hour: parseInt(hour),
    day_of_week: dayName,
    answered: d.answered,
    missed: d.missed,
    avg_wait_secs: d.waitSecs.length
      ? Math.round(d.waitSecs.reduce((a, b) => a + b, 0) / d.waitSecs.length)
      : null,
  }))

  if (slaRows.length) {
    await supabase.from('phone_sla').upsert(slaRows, { onConflict: 'date,hour' })
    console.log(`Aircall SLA: ${slaRows.length} rows for ${dateStr}`)
  }
}

async function syncGorgias() {
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  const dateStr = yesterday.toISOString().split('T')[0]
  const cutoff = new Date(dateStr)
  const nextDay = new Date(cutoff)
  nextDay.setDate(nextDay.getDate() + 1)

  const auth = btoa(`${GORGIAS_EMAIL}:${GORGIAS_API_KEY}`)
  const hourCreated: Record<number, number> = {}
  let cursor: string | null = null
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
      const h = (created.getUTCHours() + ET_OFFSET + 24) % 24
      hourCreated[h] = (hourCreated[h] || 0) + 1
    }

    if (!data.meta?.next_cursor || tickets.length < 100) break
    cursor = data.meta.next_cursor
    await new Promise(r => setTimeout(r, 400))
  }

  const dayName = DAY_NAMES[new Date(dateStr).getDay()]
  const rows = Object.entries(hourCreated).map(([h, count]) => ({
    date: dateStr,
    hour: parseInt(h),
    tickets_created: count,
    tickets_responded: 0,
    day_of_week: dayName,
  })).filter(r => r.tickets_created > 0)

  if (rows.length) {
    await supabase.from('email_volume').upsert(rows, { onConflict: 'date,hour' })
    console.log(`Gorgias: ${rows.length} rows for ${dateStr}`)
  }
}

Deno.serve(async () => {
  try {
    await Promise.all([syncAircall(), syncGorgias()])
    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'Content-Type': 'application/json' }
    })
  } catch (err) {
    console.error(err)
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
})
