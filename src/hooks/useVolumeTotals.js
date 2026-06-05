import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { PHONE_START, PHONE_END, WORK_START, WORK_END } from '../lib/forecast'

const DAYS_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const ALL_HOURS = Array.from({ length: 24 }, (_, i) => i)  // [0,1,2,...,23]

// Convert YYYY-MM-DD string to Date object using Date.UTC (no timezone shift)
function parseYMDString(yyyymmdd) {
  if (!yyyymmdd) return null
  // Handle Date objects that were passed instead of strings
  if (typeof yyyymmdd !== 'string') {
    console.warn('[parseYMDString] Received non-string:', yyyymmdd, 'type:', typeof yyyymmdd)
    return yyyymmdd instanceof Date ? yyyymmdd : null
  }
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
  phoneHours = ALL_HOURS,
  emailHours = ALL_HOURS
}) {
  console.log('[useVolumeTotals] called with:', { startDate, endDate, startDateType: typeof startDate, endDateType: typeof endDate, phoneForecast: !!phoneForecast, emailForecast: !!emailForecast })

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

        console.log(`[useVolumeTotals] Date range: ${startDate} to ${endDate}, today: ${todayPT}`)

        // ── Query actual data for past/current dates ──────────────────────────
        if (startDate <= todayPT) {
          const queryEnd = endDate <= todayPT ? endDate : todayPT
          console.log('[useVolumeTotals] Phone query: gte=' + startDate + ' lte=' + queryEnd + ' types=' + typeof startDate + '/' + typeof queryEnd)
          const [{ data: phoneVol, error: phoneErr }, { data: emailVol, error: emailErr }] = await Promise.all([
            supabase.from('phone_volume')
              .select('date,hour,call_count')
              .gte('date', startDate)
              .lte('date', queryEnd),
            supabase.from('email_volume')
              .select('date,hour,tickets_created')
              .gte('date', startDate)
              .lte('date', queryEnd)
          ])
          if (phoneErr) console.error('[useVolumeTotals] Phone query error:', phoneErr)
          if (emailErr) console.error('[useVolumeTotals] Email query error:', emailErr)

          console.log(`[useVolumeTotals] DB results: phone rows=${phoneVol?.length}, email rows=${emailVol?.length}`)
          if (phoneVol?.length > 0) console.log('  Phone sample:', phoneVol[0])
          if (emailVol?.length > 0) console.log('  Email sample:', emailVol[0])

          for (const row of phoneVol || []) {
            phoneTotal += row.call_count || 0
          }
          for (const row of emailVol || []) {
            emailTotal += row.tickets_created || 0
          }

          console.log(`[useVolumeTotals] After DB: phoneTotal=${phoneTotal}, emailTotal=${emailTotal}`)
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

        const roundedPhone = Math.round(phoneTotal)
        const roundedEmail = Math.round(emailTotal)
        console.log(`[useVolumeTotals] Final totals: phone=${roundedPhone}, email=${roundedEmail}`)

        setPhoneTotalVolume(roundedPhone)
        setEmailTotalVolume(roundedEmail)
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
