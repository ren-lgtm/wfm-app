const GORGIAS_SUBDOMAIN = Deno.env.get('GORGIAS_SUBDOMAIN')!
const GORGIAS_EMAIL = Deno.env.get('GORGIAS_EMAIL')!
const GORGIAS_API_KEY = Deno.env.get('GORGIAS_API_KEY')!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const auth = btoa(`${GORGIAS_EMAIL}:${GORGIAS_API_KEY}`)
    
    // Fetch open email tickets - no date filter, just open status
    let totalOpen = 0
    let cursor = null
    let done = false

    while (!done) {
      let url = `https://${GORGIAS_SUBDOMAIN}.gorgias.com/api/tickets?limit=100&status=open&order_by=created_datetime%3Adesc`
      if (cursor) url += `&cursor=${encodeURIComponent(cursor)}`

      const res = await fetch(url, {
        headers: { 'Authorization': `Basic ${auth}` }
      })

      if (!res.ok) {
        throw new Error(`Gorgias API error: ${res.status}`)
      }

      const data = await res.json()
      const tickets = data.data || []
      
      // Only count email channel tickets
      const emailTickets = tickets.filter((t: any) => t.channel === 'email')
      totalOpen += emailTickets.length

      if (!data.meta?.next_cursor || tickets.length < 100) {
        done = true
      } else {
        cursor = data.meta.next_cursor
      }

      await new Promise(r => setTimeout(r, 300))
    }

    return new Response(
      JSON.stringify({ 
        openEmailTickets: totalOpen,
        fetchedAt: new Date().toISOString()
      }),
      { 
        headers: { 
          ...corsHeaders,
          'Content-Type': 'application/json' 
        } 
      }
    )
  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err) }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})
