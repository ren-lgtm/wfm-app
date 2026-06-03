import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

// Returns the 30-day average email handle rate (tickets closed per agent hour).
// Per-day rate = sum(tickets_closed) / sum(online_time_seconds / 3600)
// for agents with non-null online_time_seconds. Average of those daily rates.
export function useAvgHandleRate() {
  const [handleRate, setHandleRate] = useState(null)

  useEffect(() => {
    async function load() {
      const end   = new Date()
      end.setHours(0, 0, 0, 0)
      const start = new Date(end.getTime() - 30 * 86400000)

      const endStr   = end.toISOString().split('T')[0]
      const startStr = start.toISOString().split('T')[0]

      const { data, error } = await supabase
        .from('agent_metrics')
        .select('date, tickets_closed, online_time_seconds')
        .gte('date', startStr)
        .lt('date', endStr)
        .not('online_time_seconds', 'is', null)

      console.log('[useAvgHandleRate] range:', startStr, '→', endStr)
      console.log('[useAvgHandleRate] rows:', data?.length ?? 0, 'error:', error)
      console.log('[useAvgHandleRate] sample:', data?.slice(0, 3))

      if (!data || data.length === 0) return

      // Group by date (normalize to YYYY-MM-DD in case Supabase returns a timestamp)
      const byDate = {}
      for (const row of data) {
        const dateKey = String(row.date).slice(0, 10)
        if (!byDate[dateKey]) byDate[dateKey] = { closed: 0, hours: 0 }
        byDate[dateKey].closed += row.tickets_closed
        byDate[dateKey].hours  += row.online_time_seconds / 3600
      }

      const validDays = Object.entries(byDate)
        .filter(([, d]) => d.hours >= 0.5)
        .map(([date, d]) => ({ date, closed: d.closed, hours: d.hours }))

      console.log('[useAvgHandleRate] daily rates:', validDays)

      if (validDays.length === 0) return

      const totalClosed = validDays.reduce((a, d) => a + d.closed, 0)
      const totalHours  = validDays.reduce((a, d) => a + d.hours,  0)
      setHandleRate(Math.round((totalClosed / totalHours) * 10) / 10)
    }

    load()
  }, [])

  return handleRate
}
