import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { PHONE_START, PHONE_END, WORK_START, WORK_END } from '../lib/forecast'

const DAYS_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

// Convert YYYY-MM-DD string to Date object using Date.UTC (no timezone shift)
function parseYMDString(yyyymmdd) {
  const [y, m, d] = yyyymmdd.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

// Convert Date to YYYY-MM-DD string using getUTC* methods
function dateToYMD(date) {
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  const d = String(date.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

// Get day of week from YYYY-MM-DD string
function getDOWFromYMD(yyyymmdd) {
  const date = parseYMDString(yyyymmdd)
  const dow = date.getUTCDay()
  return DAYS_SHORT[dow === 0 ? 6 : dow - 1]
}

// Get "today" in PT timezone as YYYY-MM-DD string
function getTodayPT() {
  const ptStr = new Date().toLocaleDateString('en-US', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  })
  const [m, d, y] = ptStr.split('/')
  return `${y}-${m}-${d}`
}

// Fetches actual and forecast volume totals for a date range
// startDate and endDate are YYYY-MM-DD strings (PT-anchored)
export function useVolumeTotals({
  startDate,        // YYYY-MM-DD string
  endDate,          // YYYY-MM-DD string
  phoneForecast,    // { [dow]: { [hour]: count } }
  emailForecast,    // { [dow]: { [hour]: count } }
  phoneHours = Array.from({ length: PHONE_END - PHONE_START }, (_, i) => PHONE_START + i),
  emailHours = Array.from({ length: WORK_END - WORK_START }, (_, i) => WORK_START + i)
}) {
  const [phoneTotalVolume, setPhoneTotalVolume] = useState(null)
  const [emailTotalVolume, setEmailTotalVolume] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!startDate || !endDate) {
      setPhoneTotalVolume(null)
      setEmailTotalVolume(null)
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)

    async function load() {
      try {
        let phoneTotal = 0
        let emailTotal = 0
        const todayPT = getTodayPT()

        // ── Query actual data for past/current dates ──────────────────────────
        if (startDate <= todayPT) {
          const queryEnd = endDate <= todayPT ? endDate : todayPT
          const [{ data: phoneVol }, { data: emailVol }] = await Promise.all([
            supabase.from('phone_volume')
              .select('call_count')
              .gte('date', startDate)
              .lte('date', queryEnd),
            supabase.from('email_volume')
              .select('tickets_created')
              .gte('date', startDate)
              .lte('date', queryEnd)
          ])

          for (const row of phoneVol || []) {
            phoneTotal += row.call_count || 0
          }
          for (const row of emailVol || []) {
            emailTotal += row.tickets_created || 0
          }
        }

        // ── Add forecast for future dates ────────────────────────────────────
        if (endDate > todayPT) {
          const forecastStart = startDate > todayPT ? startDate : getTodayPT()
          const startDateObj = parseYMDString(forecastStart)
          const endDateObj = parseYMDString(endDate)

          for (let d = new Date(startDateObj); d <= endDateObj; d.setUTCDate(d.getUTCDate() + 1)) {
            const ymdStr = dateToYMD(d)
            const dow = getDOWFromYMD(ymdStr)

            // Phone forecast for this day
            for (const h of phoneHours) {
              phoneTotal += phoneForecast?.[dow]?.[h] || 0
            }

            // Email forecast for this day
            for (const h of emailHours) {
              emailTotal += emailForecast?.[dow]?.[h] || 0
            }
          }
        }

        if (cancelled) return

        setPhoneTotalVolume(Math.round(phoneTotal))
        setEmailTotalVolume(Math.round(emailTotal))
      } catch (err) {
        console.error('[useVolumeTotals] Error:', err)
        if (!cancelled) setError(err.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [startDate, endDate, phoneForecast, emailForecast, phoneHours, emailHours])

  return {
    phoneTotalVolume,
    emailTotalVolume,
    loading,
    error
  }
}
