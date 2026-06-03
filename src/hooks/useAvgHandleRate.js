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

      const { data } = await supabase
        .from('agent_metrics')
        .select('date, tickets_closed, online_time_seconds')
        .gte('date', startStr)
        .lt('date', endStr)
        .not('online_time_seconds', 'is', null)

      if (!data || data.length === 0) return

      // Group by date, sum tickets_closed and online hours per day
      const byDate = {}
      for (const row of data) {
        if (!byDate[row.date]) byDate[row.date] = { closed: 0, hours: 0 }
        byDate[row.date].closed += row.tickets_closed
        byDate[row.date].hours  += row.online_time_seconds / 3600
      }

      const dailyRates = Object.values(byDate)
        .filter(d => d.hours > 0)
        .map(d => d.closed / d.hours)

      if (dailyRates.length === 0) return

      const avg = dailyRates.reduce((a, b) => a + b, 0) / dailyRates.length
      setHandleRate(Math.round(avg * 10) / 10)
    }

    load()
  }, [])

  return handleRate
}
