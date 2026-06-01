const SLACK_WEBHOOK_URL = Deno.env.get('SLACK_WEBHOOK_URL')!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function slaEmoji(pct: number) {
  if (pct >= 80) return '🟢'
  if (pct >= 50) return '🟡'
  return '🔴'
}

function gapEmoji(gap: string) {
  if (gap === 'critical') return '🔴'
  if (gap === 'warn') return '🟡'
  return '🟢'
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { weekLabel, phoneSLA, emailSLA, days } = await req.json()
    // days: [ { day, note, gap, agents: [ { name, phoneHrs, emailHrs, isOff } ] } ]

    const blocks: any[] = []

    // Header
    blocks.push({
      type: 'header',
      text: { type: 'plain_text', text: `📅 CX Schedule — ${weekLabel}`, emoji: true }
    })

    // SLA summary
    blocks.push({
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Est. Phone SLA*\n${slaEmoji(phoneSLA)} ${phoneSLA}% _(target: 95%)_` },
        { type: 'mrkdwn', text: `*Est. Email SLA*\n${slaEmoji(emailSLA)} ${emailSLA}% _(target: 95%)_` },
      ]
    })

    blocks.push({ type: 'divider' })

    // Per day
    for (const d of days) {
      // Day header
      const dayHeader = `${gapEmoji(d.gap)} *${d.day}*${d.note ? `  _${d.note}_` : ''}`
      blocks.push({
        type: 'section',
        text: { type: 'mrkdwn', text: dayHeader }
      })

      // Agent rows — split into two columns using fields
      const activeAgents = d.agents.filter((a: any) => a.isOff || a.phoneHrs > 0 || a.emailHrs > 0)
      if (activeAgents.length === 0) {
        blocks.push({
          type: 'section',
          text: { type: 'mrkdwn', text: '_No agents scheduled_' }
        })
      } else {
        // Build fields — Slack allows max 10 per section
        const fields = activeAgents.map((a: any) => {
          if (a.isOff) return { type: 'mrkdwn', text: `*${a.name}*\n⛔ Off` }
          const parts = []
          if (a.phoneHrs > 0) parts.push(`📞 ${a.phoneHrs}h`)
          if (a.emailHrs > 0) parts.push(`✉ ${a.emailHrs}h`)
          return { type: 'mrkdwn', text: `*${a.name}*\n${parts.join('  ')}` }
        })

        // Slack fields max 10, split if needed
        for (let i = 0; i < fields.length; i += 10) {
          blocks.push({ type: 'section', fields: fields.slice(i, i + 10) })
        }
      }

      blocks.push({ type: 'divider' })
    }

    // Footer
    blocks.push({
      type: 'context',
      elements: [{ type: 'mrkdwn', text: 'Posted by WFM · CX Staffing App' }]
    })

    const res = await fetch(SLACK_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ blocks })
    })

    if (!res.ok) throw new Error(`Slack error: ${res.status} ${await res.text()}`)

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
