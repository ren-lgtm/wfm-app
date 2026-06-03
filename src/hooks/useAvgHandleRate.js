import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

async function fetchHandleRate(startStr, endStr) {
  const { data } = await supabase
    .from('agent_metrics')
    .select('date, tickets_closed, online_time_seconds')
    .gte('date', startStr)
    .lte('date', endStr)
    .not('online_time_seconds', 'is', null)

  if (!data || data.length === 0) return null

  const byDate = {}
  for (const row of data) {
    const dateKey = String(row.date).slice(0, 10)
    if (!byDate[dateKey]) byDate[dateKey] = { closed: 0, hours: 0 }
    byDate[dateKey].closed += row.tickets_closed
    byDate[dateKey].hours  += row.online_time_seconds / 3600
  }

  const validDays = Object.values(byDate).filter(d => d.hours >= 0.5)
  if (validDays.length === 0) return null

  const totalClosed = validDays.reduce((a, d) => a + d.closed, 0)
  const totalHours  = validDays.reduce((a, d) => a + d.hours,  0)
  return Math.round((totalClosed / totalHours) * 10) / 10
}

// Returns { rangeRate, benchmarkRate }
// rangeRate:     handle rate for the selected date range (null if no data)
// benchmarkRate: weighted avg over the last 30 days (stable reference)
export function useAvgHandleRate({ startDate, endDate } = {}) {
  const [rangeRate,     setRangeRate]     = useState(null)
  const [benchmarkRate, setBenchmarkRate] = useState(null)

  // 30-day benchmark — independent of selected range
  useEffect(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const start30 = new Date(today.getTime() - 30 * 86400000)
    const end30   = new Date(today.getTime() - 86400000) // yesterday
    fetchHandleRate(
      start30.toISOString().split('T')[0],
      end30.toISOString().split('T')[0],
    ).then(setBenchmarkRate)
  }, [])

  // Range rate — recomputes when selected range changes
  useEffect(() => {
    if (!startDate || !endDate) { setRangeRate(null); return }
    const startStr = startDate.toISOString().split('T')[0]
    const endStr   = endDate.toISOString().split('T')[0]
    fetchHandleRate(startStr, endStr).then(setRangeRate)
  }, [startDate?.getTime(), endDate?.getTime()])

  return { rangeRate, benchmarkRate }
}
