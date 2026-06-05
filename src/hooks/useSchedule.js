import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { getMondayOfWeek, toISODate, buildForecast, DAYS } from '../lib/forecast'

export function useSchedule({ userId } = {}) {
  const [agents, setAgents] = useState([])
  const [currentMonday, setCurrentMonday] = useState(() => getMondayOfWeek(new Date()))
  const [weekSchedule, setWeekSchedule] = useState({}) // { agentId: { Mon: { hour: activity } } }
  const [monthSchedule, setMonthSchedule] = useState({}) // { agentId: { dateStr: { hour: activity } } } for entire month
  const [forecast, setForecast] = useState({ phoneForecast: {}, emailForecast: {} })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)   // last write error message, or null
  const [loadError, setLoadError] = useState(null)   // last load error message, or null

  // Load agents — gated on userId so this only runs after auth session is confirmed
  useEffect(() => {
    if (!userId) return
    supabase.from('agents').select('*').eq('active', true).order('name')
      .then(({ data, error }) => {
        if (data) setAgents(data)
      })
  }, [userId])

  // Load forecast + SLA data from DB
  const [slaData, setSlaData] = useState({ byDay: {}, byHour: {} })

  useEffect(() => {
    if (!userId) return
    async function loadForecast() {
      const [{ data: phoneRows }, { data: emailRows }, { data: slaRows }] = await Promise.all([
        supabase.from('phone_volume').select('day_of_week,hour,call_count'),
        supabase.from('email_volume').select('day_of_week,hour,tickets_created'),
        supabase.from('phone_sla').select('day_of_week,hour,answered,missed,avg_wait_secs'),
      ])
      const newForecast = buildForecast(phoneRows || [], emailRows || [])
      setForecast(prev =>
        JSON.stringify(prev) === JSON.stringify(newForecast) ? prev : newForecast
      )

      // Aggregate SLA by day and hour
      const byDay = {}
      const byHour = {}
      for (const row of (slaRows || [])) {
        const day = row.day_of_week
        const h = row.hour
        if (!byDay[day]) byDay[day] = { answered: 0, missed: 0 }
        byDay[day].answered += row.answered
        byDay[day].missed += row.missed

        if (!byHour[h]) byHour[h] = { answered: 0, missed: 0 }
        byHour[h].answered += row.answered
        byHour[h].missed += row.missed
      }
      setSlaData({ byDay, byHour })
    }
    loadForecast()
  }, [userId])

  // Load week schedule
  const loadWeek = useCallback(async (monday) => {
    console.log('[loadWeek] called with monday:', monday)
    setLoading(true)
    setLoadError(null)
    // monday is now a PT-anchored string from getMondayOfWeek (YYYY-MM-DD format)
    // Use it directly as weekStart — don't pass through toISODate (would cause timezone shift)
    const weekStart = monday

    const { data: schedules, error } = await supabase
      .from('schedules')
      .select('*, schedule_slots(*)')
      .eq('week_start', weekStart)

    if (error) {
      console.error('[loadWeek] Supabase error:', error)
      setLoadError(`Failed to load schedule: ${error.message}`)
      setLoading(false)
      return
    }

    // Build weekSchedule: { agentId: { day: { hour: activity } } }
    const ws = {}
    if (schedules) {
      for (const sched of schedules) {
        if (!ws[sched.agent_id]) ws[sched.agent_id] = {}
        const slots = {}
        for (const slot of sched.schedule_slots || []) {
          slots[slot.hour] = slot.activity
        }
        ws[sched.agent_id][sched.day_of_week] = sched.is_off ? { off: true } : slots
      }
    }
    console.log('[loadWeek] completed, setting weekSchedule:', JSON.stringify(ws).slice(0, 200))
    setWeekSchedule(ws)
    setLoading(false)
  }, [])

  // Load entire month schedule — for month view which needs all weeks in the month
  const loadMonth = useCallback(async (year, month) => {
    // Calculate first and last Monday of the month
    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0)

    // Find first Monday >= firstDay
    const firstMonday = new Date(firstDay)
    const dow = firstMonday.getDay()
    firstMonday.setDate(firstMonday.getDate() + (dow === 0 ? 1 : (dow === 1 ? 0 : (8 - dow))))

    // Find last Monday <= lastDay
    const lastMonday = new Date(lastDay)
    const lastDow = lastMonday.getDay()
    lastMonday.setDate(lastMonday.getDate() - (lastDow === 0 ? 6 : (lastDow === 1 ? 0 : (lastDow - 1))))

    const firstMondayStr = toISODate(firstMonday)
    const lastMondayStr = toISODate(lastMonday)

    const { data: schedules, error } = await supabase
      .from('schedules')
      .select('*, schedule_slots(*)')
      .gte('week_start', firstMondayStr)
      .lte('week_start', lastMondayStr)

    if (error) {
      console.error('[loadMonth] Supabase error:', error)
      return
    }

    // Build monthSchedule: { agentId: { dateStr: { hour: activity } } }
    const ms = {}
    if (schedules) {
      for (const sched of schedules) {
        if (!ms[sched.agent_id]) ms[sched.agent_id] = {}

        const dayObj = sched.is_off ? { off: true } : {}
        for (const slot of sched.schedule_slots || []) {
          dayObj[slot.hour] = slot.activity
        }

        // Calculate date from week_start and day_of_week
        const weekStart = new Date(sched.week_start)
        const dayIdx = DAYS.indexOf(sched.day_of_week)
        const dateObj = new Date(weekStart)
        dateObj.setDate(dateObj.getDate() + dayIdx)
        const dateStr = toISODate(dateObj)

        ms[sched.agent_id][dateStr] = dayObj
      }
    }
    setMonthSchedule(ms)
  }, [])

  // Load week schedule when userId is available (session confirmed) and currentMonday changes
  useEffect(() => {
    if (userId) {
      loadWeek(currentMonday)
    }
  }, [currentMonday, loadWeek, userId])

  // Save a single slot change
  const updateSlot = useCallback(async (agentId, day, hour, activity) => {
    const weekStart = currentMonday
    console.log('[updateSlot]', {agentId, day, hour, activity, weekStart})

    // Snapshot previous state so we can rollback on failure
    let prevSnapshot
    setWeekSchedule(prev => {
      prevSnapshot = prev
      const updated = {
        ...prev,
        [agentId]: {
          ...prev[agentId],
          [day]: {
            ...(prev[agentId]?.[day] || {}),
            [hour]: activity,
          }
        }
      }
      console.log('[updateSlot] optimistic update for', agentId, day, hour, '→ activity:', activity)
      return updated
    })

    setSaving(true)
    setSaveError(null)
    try {
      // Upsert the parent schedule row
      const { data: sched, error: schedErr } = await supabase
        .from('schedules')
        .upsert(
          { week_start: weekStart, agent_id: agentId, day_of_week: day, is_off: false },
          { onConflict: 'week_start,agent_id,day_of_week' }
        )
        .select()
        .single()

      console.log('[updateSlot] result:', {data: sched, error: schedErr})
      if (schedErr) throw new Error(`schedules upsert: ${schedErr.message}`)
      if (!sched) throw new Error('schedules upsert returned no row')

      if (activity === null) {
        // "Empty" cell — remove the slot row rather than writing null
        const { error: delErr } = await supabase
          .from('schedule_slots')
          .delete()
          .eq('schedule_id', sched.id)
          .eq('hour', hour)
        console.log('[updateSlot] schedule_slots delete result:', {error: delErr})
        if (delErr) throw new Error(`schedule_slots delete: ${delErr.message}`)
      } else {
        // Upsert the slot with a real activity value
        const { error: slotErr } = await supabase
          .from('schedule_slots')
          .upsert(
            { schedule_id: sched.id, hour, activity },
            { onConflict: 'schedule_id,hour' }
          )
        console.log('[updateSlot] schedule_slots upsert result:', {error: slotErr})
        if (slotErr) throw new Error(`schedule_slots upsert: ${slotErr.message}`)
      }
      console.log('[updateSlot] SUCCESS - all DB operations completed')
    } catch (err) {
      console.error('[updateSlot] Save failed:', err)
      setSaveError(err.message)
      // Rollback optimistic update
      setWeekSchedule(prevSnapshot)
    } finally {
      setSaving(false)
    }
  }, [currentMonday])

  // Mark agent as off for a day
  const markOff = useCallback(async (agentId, day) => {
    const weekStart = currentMonday
    let prevSnapshot
    setWeekSchedule(prev => {
      prevSnapshot = prev
      return { ...prev, [agentId]: { ...prev[agentId], [day]: { off: true } } }
    })
    const { error } = await supabase.from('schedules')
      .upsert(
        { week_start: weekStart, agent_id: agentId, day_of_week: day, is_off: true },
        { onConflict: 'week_start,agent_id,day_of_week' }
      )
    if (error) {
      console.error('[markOff] Supabase error:', error)
      setSaveError(`markOff: ${error.message}`)
      setWeekSchedule(prevSnapshot)
    }
  }, [currentMonday])

  // Unmark agent as off (clear the day)
  const unmarkOff = useCallback(async (agentId, day) => {
    const weekStart = currentMonday
    let prevSnapshot
    setWeekSchedule(prev => {
      prevSnapshot = prev
      return { ...prev, [agentId]: { ...prev[agentId], [day]: {} } }
    })
    const { error } = await supabase.from('schedules')
      .upsert(
        { week_start: weekStart, agent_id: agentId, day_of_week: day, is_off: false },
        { onConflict: 'week_start,agent_id,day_of_week' }
      )
    if (error) {
      console.error('[unmarkOff] Supabase error:', error)
      setSaveError(`unmarkOff: ${error.message}`)
      setWeekSchedule(prevSnapshot)
    }
  }, [currentMonday])

  // Day notes
  const [dayNotes, setDayNotes] = useState({}) // { 'Mon': 'Dolly out', ... }

  const loadDayNotes = useCallback(async (monday) => {
    const weekStart = toISODate(monday)
    const { data } = await supabase
      .from('day_notes')
      .select('day_of_week, note')
      .eq('week_start', weekStart)
    if (data) {
      const notes = {}
      data.forEach(r => { notes[r.day_of_week] = r.note })
      setDayNotes(notes)
    }
  }, [])

  useEffect(() => { if (userId) loadDayNotes(currentMonday) }, [currentMonday, loadDayNotes, userId])

  const updateDayNote = useCallback(async (day, note) => {
    const weekStart = currentMonday
    setDayNotes(prev => ({ ...prev, [day]: note }))
    await supabase.from('day_notes')
      .upsert({ week_start: weekStart, day_of_week: day, note },
        { onConflict: 'week_start,day_of_week' })
  }, [currentMonday])

  // Copy last week's schedule into current week
  const copyLastWeek = useCallback(async () => {
    const lastMonday = new Date(currentMonday)
    lastMonday.setDate(lastMonday.getDate() - 7)
    const lastWeekStart = toISODate(lastMonday)
    const thisWeekStart = currentMonday

    setLoading(true)
    const { data: lastSchedules } = await supabase
      .from('schedules')
      .select('*, schedule_slots(*)')
      .eq('week_start', lastWeekStart)

    if (!lastSchedules?.length) { setLoading(false); return false }

    for (const sched of lastSchedules) {
      const { data: newSched } = await supabase.from('schedules')
        .upsert({
          week_start: thisWeekStart,
          agent_id: sched.agent_id,
          day_of_week: sched.day_of_week,
          is_off: sched.is_off,
          note: sched.note,
        }, { onConflict: 'week_start,agent_id,day_of_week' })
        .select().single()

      if (newSched && sched.schedule_slots?.length) {
        await supabase.from('schedule_slots').upsert(
          sched.schedule_slots.map(s => ({
            schedule_id: newSched.id,
            hour: s.hour,
            activity: s.activity,
          })),
          { onConflict: 'schedule_id,hour' }
        )
      }
    }
    await loadWeek(currentMonday)
    return true
  }, [currentMonday, loadWeek])

  // Add a new agent
  const addAgent = useCallback(async (agentData) => {
    const { data, error } = await supabase.from('agents').insert(agentData).select().single()
    if (error) {
      console.error('[addAgent] Supabase error:', error.message, error.details, agentData)
      throw new Error(error.message)
    }
    if (data) setAgents(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)))
    return data
  }, [])

  // Update agent
  const updateAgent = useCallback(async (id, updates) => {
    const { data } = await supabase.from('agents').update(updates).eq('id', id).select().single()
    if (data) setAgents(prev => prev.map(a => a.id === id ? data : a))
  }, [])

  // Delete (deactivate) agent
  const deactivateAgent = useCallback(async (id) => {
    await supabase.from('agents').update({ active: false }).eq('id', id)
    setAgents(prev => prev.filter(a => a.id !== id))
  }, [])

  // Navigate weeks
  const goToWeek = useCallback((monday) => setCurrentMonday(monday), [])

  const goNextWeek = useCallback(() => {
    const next = new Date(currentMonday)
    next.setDate(next.getDate() + 7)
    setCurrentMonday(next)
  }, [currentMonday])

  const goPrevWeek = useCallback(() => {
    const prev = new Date(currentMonday)
    prev.setDate(prev.getDate() - 7)
    setCurrentMonday(prev)
  }, [currentMonday])

  // Get slots for a specific agent/day
  const getSlots = useCallback((agentId, day) => {
    return weekSchedule[agentId]?.[day] || {}
  }, [weekSchedule])

  // Compute total hours for an agent this week
  const getAgentWeekHours = useCallback((agentId) => {
    let total = 0
    for (const day of DAYS) {
      const slots = weekSchedule[agentId]?.[day] || {}
      if (slots.off) continue
      for (const activity of Object.values(slots)) {
        if (activity !== 'off' && activity !== 'lunch') total++
      }
    }
    return total
  }, [weekSchedule])

  return {
    agents, currentMonday, weekSchedule, monthSchedule, forecast, slaData, loading, saving,
    saveError, loadError,
    dayNotes, updateDayNote,
    updateSlot, markOff, unmarkOff, copyLastWeek, addAgent, updateAgent, deactivateAgent,
    goToWeek, goNextWeek, goPrevWeek, getSlots, getAgentWeekHours,
    loadMonth,
  }
}
