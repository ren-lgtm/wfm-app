import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SERVICE_ROLE_KEY')!
)

const AIRCALL_API_ID    = Deno.env.get('AIRCALL_API_ID')!
const AIRCALL_API_TOKEN = Deno.env.get('AIRCALL_API_TOKEN')!
const GORGIAS_SUBDOMAIN = Deno.env.get('GORGIAS_SUBDOMAIN')!
const GORGIAS_EMAIL     = Deno.env.get('GORGIAS_EMAIL')!
const GORGIAS_API_KEY   = Deno.env.get('GORGIAS_API_KEY')!

const PHONE_START       = 9
const PHONE_END         = 16
const PT_OFFSET         = -7
const DAY_NAMES         = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
const TRACKED_CHANNELS  = ['email', 'chat', 'article', 'contact_form']

function ptHour(utcTimestamp: number): number {
  return (Math.floor(utcTimestamp / 3600) % 24 + PT_OFFSET + 24) % 24
}

function ptDateStr(utcTimestamp: number): string {
  const d = new Date((utcTimestamp + PT_OFFSET * 3600) * 1000)
  return d.toISOString().split('T')[0]
}

function ptDayName(utcTimestamp: number): string {
  const d = new Date((utcTimestamp + PT_OFFSET * 3600) * 1000)
  return DAY_NAMES[d.getUTCDay()]
}

async function syncAircall(targetDate: Date) {
  const from          = Math.floor(targetDate.getTime() / 1000) - PT_OFFSET * 3600
  const to            = from + 86400
  const targetPtDate  = ptDateStr(from)

  const auth = btoa(`${AIRCALL_API_ID}:${AIRCALL_API_TOKEN}`)
  let page    = 1
  let hasMore = true

  const byDateVolume: Record<string, Record<number, number>> = {}
  const byDateSLA: Record<string, Record<number, { answered: number; missed: number; waitSecs: number[] }>> = {}

  while (hasMore) {
    const res = await fetch(
      `https://api.aircall.io/v1/calls?direction=inbound&from=${from}&to=${to}&per_page=50&page=${page}`,
      { headers: { Authorization: `Basic ${auth}` } }
    )
    const data  = await res.json()
    const calls = data.calls || []

    for (const call of calls) {
      const d            = ptDateStr(call.started_at)
      if (d !== targetPtDate) continue
      const h            = ptHour(call.started_at)
      const inPhoneHours = h >= PHONE_START && h < PHONE_END

      if (!byDateVolume[d]) byDateVolume[d] = {}
      byDateVolume[d][h] = (byDateVolume[d][h] || 0) + 1

      if (inPhoneHours) {
        if (!byDateSLA[d]) byDateSLA[d] = {}
        if (!byDateSLA[d][h]) byDateSLA[d][h] = { answered: 0, missed: 0, waitSecs: [] }
        const wasAnswered = call.answered_at && call.answered_at > 0 && call.duration > 0 && call.answered_at > call.started_at
        if (wasAnswered) {
          byDateSLA[d][h].answered++
          const wait = call.answered_at - call.started_at
          if (wait >= 0 && wait < 600) byDateSLA[d][h].waitSecs.push(wait)
        } else {
          byDateSLA[d][h].missed++
        }
      }
    }

    hasMore = calls.length === 50
    page++
    await new Promise(r => setTimeout(r, 500))
  }

  const volumeRows = []
  for (const [date, hours] of Object.entries(byDateVolume)) {
    const dayName = ptDayName(new Date(date + 'T00:00:00Z').getTime() / 1000 - PT_OFFSET * 3600)
    for (const [hour, count] of Object.entries(hours)) {
      volumeRows.push({ date, hour: parseInt(hour), call_count: count, day_of_week: dayName })
    }
  }

  if (volumeRows.length) {
    await supabase.from('phone_volume').upsert(volumeRows, { onConflict: 'date,hour' })
    console.log(`Aircall volume: ${volumeRows.length} rows across ${Object.keys(byDateVolume).length} dates`)
  }

  const allSlaDates = Object.keys(byDateSLA)
  for (const date of allSlaDates) {
    await supabase.from('phone_sla').delete().eq('date', date)
  }

  const slaRows = []
  for (const [date, hours] of Object.entries(byDateSLA)) {
    const dayName = ptDayName(new Date(date + 'T00:00:00Z').getTime() / 1000 - PT_OFFSET * 3600)
    for (const [hour, d] of Object.entries(hours)) {
      slaRows.push({
        date,
        hour: parseInt(hour),
        day_of_week: dayName,
        answered: d.answered,
        missed: d.missed,
        avg_wait_secs: d.waitSecs.length
          ? Math.round(d.waitSecs.reduce((a, b) => a + b, 0) / d.waitSecs.length)
          : null,
      })
    }
  }

  if (slaRows.length) {
    await supabase.from('phone_sla').upsert(slaRows, { onConflict: 'date,hour' })
    console.log(`Aircall SLA: ${slaRows.length} rows across ${allSlaDates.length} dates`)
  }
}

async function syncGorgias(targetDate: Date) {
  const cutoff  = targetDate
  const nextDay = new Date(targetDate)
  nextDay.setUTCDate(nextDay.getUTCDate() + 1)

  const auth = btoa(`${GORGIAS_EMAIL}:${GORGIAS_API_KEY}`)

  // ── Helper: convert UTC timestamp to ET date string ──
  function etDateFromTimestamp(utcTimestamp: number): string {
    const d = new Date((utcTimestamp + PT_OFFSET * 3600) * 1000)
    return d.toISOString().split('T')[0]
  }

  // ── Count tickets created and closed per hour, grouped by ET date ──
  const byDateCreated: Record<string, Record<number, number>> = {}
  const byDateClosed: Record<string, Record<number, number>> = {}
  let cursor: string | null = null
  let done = false

  while (!done) {
    let url = `https://${GORGIAS_SUBDOMAIN}.gorgias.com/api/tickets?limit=100&order_by=created_datetime%3Adesc`
    if (cursor) url += `&cursor=${encodeURIComponent(cursor)}`

    const res  = await fetch(url, { headers: { Authorization: `Basic ${auth}` } })
    const data = await res.json()
    const tickets = data.data || []

    for (const t of tickets) {
      const created = new Date(t.created_datetime)
      if (created < cutoff)  { done = true; break }
      if (created >= nextDay) continue
      if (!TRACKED_CHANNELS.includes(t.channel)) continue

      const etDate = etDateFromTimestamp(Math.floor(created.getTime() / 1000))
      const h = (created.getUTCHours() + PT_OFFSET + 24) % 24

      // Count as created
      if (!byDateCreated[etDate]) byDateCreated[etDate] = {}
      byDateCreated[etDate][h] = (byDateCreated[etDate][h] || 0) + 1

      // Count as closed if status is 'closed'
      if (t.status === 'closed') {
        if (!byDateClosed[etDate]) byDateClosed[etDate] = {}
        byDateClosed[etDate][h] = (byDateClosed[etDate][h] || 0) + 1
      }
    }

    if (!data.meta?.next_cursor || tickets.length < 100) break
    cursor = data.meta.next_cursor
    await new Promise(r => setTimeout(r, 400))
  }

  // ── Merge by ET date ──
  const allDates = new Set([...Object.keys(byDateCreated), ...Object.keys(byDateClosed)])
  const rows = []

  for (const etDate of allDates) {
    const dayName = DAY_NAMES[new Date(etDate + 'T00:00:00Z').getUTCDay()]
    const hoursByDate = byDateCreated[etDate] || {}
    const closedByDate = byDateClosed[etDate] || {}
    const allHours = new Set([...Object.keys(hoursByDate).map(Number), ...Object.keys(closedByDate).map(Number)])

    for (const h of allHours) {
      const created = hoursByDate[h] || 0
      const closed = closedByDate[h] || 0
      if (created > 0 || closed > 0) {
        rows.push({
          date: etDate,
          hour: h,
          tickets_created: created,
          tickets_responded: 0,
          tickets_closed: closed,
          day_of_week: dayName,
        })
      }
    }
  }

  if (rows.length) {
    await supabase.from('email_volume').upsert(rows, { onConflict: 'date,hour' })
    const totalCreated = Object.values(byDateCreated).reduce((acc, h) => acc + Object.values(h).reduce((a, b) => a + b, 0), 0)
    const totalClosed = Object.values(byDateClosed).reduce((acc, h) => acc + Object.values(h).reduce((a, b) => a + b, 0), 0)
    console.log(`Gorgias: ${rows.length} rows across ${allDates.size} dates (created=${totalCreated}, closed=${totalClosed})`)
  }
}

async function syncGorgiasAgentMetrics(targetDate: Date) {
  const dateStr = targetDate.toISOString().split('T')[0]
  const auth    = btoa(`${GORGIAS_EMAIL}:${GORGIAS_API_KEY}`)
  const base    = `https://${GORGIAS_SUBDOMAIN}.gorgias.com`
  const jsonHdr = { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' }

  // ── 1. tickets-closed-per-agent-per-day ──────────────────────────────────────
  const closedRes = await fetch(`${base}/api/stats/tickets-closed-per-agent-per-day`, {
    method: 'POST',
    headers: jsonHdr,
    body: JSON.stringify({
      filters: { period: { start_datetime: `${dateStr}T00:00:00`, end_datetime: `${dateStr}T23:59:59` } },
    }),
  })
  const closedData = await closedRes.json()

  // Response shape: { data: { data: { axes: { x: [ts] }, lines: [{ name, data: [count] }] } } }
  const lines: { name: string; data: number[] }[] = closedData?.data?.data?.lines ?? []
  const closedByName: Record<string, number> = {}
  for (const line of lines) {
    if (line.data[0] > 0) closedByName[line.name] = line.data[0]
  }

  // ── 2. online-time per agent ──────────────────────────────────────────────────
  const onlineRes = await fetch(`${base}/api/reporting/stats`, {
    method: 'POST',
    headers: jsonHdr,
    body: JSON.stringify({
      query: {
        scope: 'online-time',
        timezone: 'America/Los_Angeles',
        measures: ['onlineTime'],
        dimensions: ['agentId'],
        filters: [
          { member: 'periodStart', operator: 'afterDate',  values: [dateStr] },
          { member: 'periodEnd',   operator: 'beforeDate', values: [new Date(targetDate.getTime() + 86400000).toISOString().split('T')[0]] },
        ],
      },
    }),
  })
  const onlineData = await onlineRes.json()
  const onlineRows: { agentId: number; onlineTime: number }[] = onlineData?.data ?? []

  // ── 3. agents list to map agentId → name ─────────────────────────────────────
  const usersRes  = await fetch(`${base}/api/users?limit=100`, { headers: { Authorization: `Basic ${auth}` } })
  const usersData = await usersRes.json()
  const idToName: Record<number, string> = {}
  for (const u of (usersData?.data ?? [])) {
    idToName[u.id] = u.name
  }

  const onlineByName: Record<string, number> = {}
  for (const row of onlineRows) {
    const name = idToName[row.agentId]
    if (name) onlineByName[name] = row.onlineTime
  }

  // ── 4. Join on agent name, filter to tickets_closed > 0 ──────────────────────
  const rows = Object.entries(closedByName).map(([agent_name, tickets_closed]) => ({
    date: dateStr,
    agent_name,
    tickets_closed,
    online_time_seconds: onlineByName[agent_name] ?? null,
  }))

  if (rows.length) {
    await supabase.from('agent_metrics').upsert(rows, { onConflict: 'date,agent_name' })
    console.log(`Gorgias agent metrics: ${rows.length} agents for ${dateStr}`)
  } else {
    console.log(`Gorgias agent metrics: no data for ${dateStr}`)
  }
}

// ─── Entry point ──────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  const url       = new URL(req.url)
  const dateParam = url.searchParams.get('date')

  let targetDate: Date

  if (dateParam) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
      return new Response(
        JSON.stringify({ error: 'Invalid date format. Use YYYY-MM-DD.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }
    targetDate = new Date(dateParam + 'T00:00:00Z')
    if (isNaN(targetDate.getTime())) {
      return new Response(
        JSON.stringify({ error: 'Invalid date.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }
  } else {
    targetDate = new Date()
    targetDate.setUTCDate(targetDate.getUTCDate() - 1)
    targetDate.setUTCHours(0, 0, 0, 0)
  }

  const dateStr = targetDate.toISOString().split('T')[0]
  const source  = url.searchParams.get('source')
  console.log(`Syncing volume for ${dateStr}${source ? ` (source=${source})` : ''}`)

  try {
    if (source === 'aircall') {
      await syncAircall(targetDate)
    } else if (source === 'gorgias') {
      await syncGorgias(targetDate)
    } else if (source === 'gorgias_metrics') {
      await syncGorgiasAgentMetrics(targetDate)
    } else {
      await Promise.all([syncAircall(targetDate), syncGorgias(targetDate), syncGorgiasAgentMetrics(targetDate)])
    }
    return new Response(
      JSON.stringify({ ok: true, date: dateStr }),
      { headers: { 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error(err)
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
})
