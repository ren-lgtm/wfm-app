import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { toISODate, PHONE_START, PHONE_END, WORK_START, WORK_END } from '../lib/forecast'

const DAYS_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const WEEKDAYS   = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']

function getDOW(date) {
  const d = new Date(date).getDay()
  return DAYS_SHORT[d === 0 ? 6 : d - 1]
}

// Fetches real DB data for past/current dates, forecast for future dates.
// startDate and endDate are local midnight Date objects.
export function usePeriodKPIs({ startDate, endDate, phoneForecast, emailForecast }) {
  const [kpis,    setKpis]    = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!startDate || !endDate || endDate < startDate) {
      setKpis(null)
      return
    }

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    let cancelled = false
    setLoading(true)

    async function load() {
      let calls = 0, answered = 0, missed = 0, ticketsCreated = 0, ticketsClosed = 0
      let hasFutureData = endDate > today

      // ── Actual data for past / current dates ──────────────────────────────
      if (startDate <= today) {
        const startStr  = toISODate(startDate)
        const actualEnd = endDate <= today ? endDate : today
        const endStr    = toISODate(actualEnd)

        const [{ data: phoneVol }, { data: slaRows }, { data: emailVol }] = await Promise.all([
          supabase.from('phone_volume')
            .select('call_count')
            .gte('date', startStr).lte('date', endStr),
          supabase.from('phone_sla')
            .select('answered,missed')
            .gte('date', startStr).lte('date', endStr),
          supabase.from('email_volume')
            .select('tickets_created,tickets_closed')
            .gte('date', startStr).lte('date', endStr),
        ])

        for (const r of phoneVol || []) calls          += r.call_count
        for (const r of slaRows  || []) { answered     += r.answered; missed += r.missed }
        for (const r of emailVol || []) {
          ticketsCreated += r.tickets_created   || 0
          ticketsClosed  += r.tickets_closed    || 0
        }
      }

      // ── Forecast for future dates ─────────────────────────────────────────
      if (endDate > today) {
        const futureStart = startDate > today
          ? new Date(startDate)
          : new Date(today.getTime() + 86400000)   // tomorrow

        for (let d = new Date(futureStart); d <= endDate; d.setDate(d.getDate() + 1)) {
          const dow = getDOW(d)
          if (!WEEKDAYS.includes(dow)) continue

          for (let h = PHONE_START; h < PHONE_END; h++) {
            calls += phoneForecast?.[dow]?.[h] || 0
          }
          for (let h = WORK_START; h < WORK_END; h++) {
            ticketsCreated += emailForecast?.[dow]?.[h] || 0
          }
          // No closed-ticket forecast — only actual data contributes
        }
      }

      if (cancelled) return

      setKpis({
        calls:          Math.round(calls),
        answerRate:     (answered + missed) > 0
                          ? Math.round(answered / (answered + missed) * 100)
                          : null,
        ticketsCreated: Math.round(ticketsCreated),
        ticketsClosed,
        hasFutureData,
      })
      setLoading(false)
    }

    load()
    return () => { cancelled = true }
  }, [
    // Use numeric time values so the effect compares by value, not reference
    startDate?.getTime(),
    endDate?.getTime(),
    phoneForecast,
    emailForecast,
  ])

  return { kpis, loading }
}
