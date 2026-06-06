import { useState, useMemo, useEffect, useLayoutEffect, useRef, useCallback } from 'react'
import { ChevronLeft, ChevronRight, X, Copy, Calendar } from 'lucide-react'
import {
  hLabel, getMondayOfWeek, toISODate,
  BASELINE_EMAIL, BASELINE_PHONE,
  AVG_EMAILS_PER_AGENT_HOUR, AVG_CALLS_PER_AGENT_HOUR,
  agentsNeededPhone, agentsNeededEmail,
  getPhoneGap, getEmailGap,
  PHONE_START, PHONE_END,
} from '../lib/forecast'
import { supabase } from '../lib/supabase'
import { CustomRangePicker } from './CustomRangePicker'

// ─── Mock Data ───────────────────────────────────────────────────────────────

const MOCK_AGENTS = [
  { id: 'a1', name: 'Deb',     color: '#7C3AED', default_channel: 'email' },
  { id: 'a2', name: 'Ezra',    color: '#0891B2', default_channel: 'email' },
  { id: 'a3', name: 'Lucy',    color: '#059669', default_channel: 'email' },
  { id: 'a4', name: 'Delaney', color: '#D97706', default_channel: 'email' },
  { id: 'a5', name: 'Allison', color: '#DC2626', default_channel: 'email' },
  { id: 'a6', name: 'Dolly',   color: '#DB2777', default_channel: 'email' },
  { id: 'a7', name: 'Lori',    color: '#65A30D', default_channel: 'email' },
]

function generateAgentDay(agentIdx, dayOfWeek) {
  const isWeekend = dayOfWeek >= 5
  if (isWeekend) {
    if (agentIdx < 4) return null
    const slots = {}
    for (let h = 9; h <= 16; h++) { slots[h] = h === 12 ? 'lunch' : 'email' }
    return slots
  }
  const patterns = [
    (h) => h >= 8  && h <= 16 ? (h === 12 ? 'lunch' : 'email') : null,
    (h) => h >= 9  && h <= 17 ? (h === 13 ? 'lunch' : 'email') : null,
    (h) => h >= 8  && h <= 15 ? (h === 12 ? 'lunch' : 'email') : null,
    (h) => h >= 10 && h <= 18 ? (h === 14 ? 'lunch' : 'email') : null,
    (h) => h >= 8  && h <= 16 ? (h === 11 ? 'lunch' : 'email') : null,
    (h) => h >= 9  && h <= 16 ? (h === 13 ? 'lunch' : 'email') : null,
    (h) => h >= 8  && h <= 15 ? (h === 12 ? 'lunch' : 'email') : null,
  ]
  const fn = patterns[agentIdx % patterns.length]
  const slots = {}
  for (let h = 0; h < 24; h++) { const v = fn(h); if (v) slots[h] = v }
  return slots
}

function buildMockSchedule() {
  const schedule = {}
  for (const [idx, agent] of MOCK_AGENTS.entries()) {
    schedule[agent.id] = {}
    for (let d = 0; d < 7; d++) { schedule[agent.id][d] = generateAgentDay(idx, d) }
  }
  return schedule
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ALL_HOURS  = Array.from({ length: 24 }, (_, i) => i)
const DAYS_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const DAYS_FULL  = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

// Minimum column width for hour cells (px) — keeps header/cell alignment locked
const HOUR_COL_W = 48

// Channel cell styles
const CHANNEL_STYLES = {
  email:  { bg: 'bg-blue-900/60',    text: 'text-blue-300',    label: 'Email'  },
  phone:  { bg: 'bg-emerald-900/60', text: 'text-emerald-300', label: 'Phone'  },
  lunch:  { bg: 'bg-amber-900/50',   text: 'text-amber-300',   label: '☕'     },
  off:    { bg: 'bg-[#111827]',      text: 'text-gray-600',    label: 'Off'    },
}
function cellStyle(activity) {
  return CHANNEL_STYLES[activity] || { bg: '', text: 'text-transparent', label: '' }
}

// Coverage gap status → display tokens
const GAP_STATUS = {
  ok:       { bg: 'bg-emerald-900/60', text: 'text-emerald-300', border: 'border-emerald-700/50' },
  warn:     { bg: 'bg-amber-900/60',   text: 'text-amber-300',   border: 'border-amber-700/50'   },
  critical: { bg: 'bg-red-900/60',     text: 'text-red-300',     border: 'border-red-700/50'     },
  none:     { bg: '',                  text: 'text-gray-700',     border: 'border-transparent'    },
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

// Safely parse YYYY-MM-DD strings (PT-anchored) without UTC timezone shift
function parsePTDate(str) {
  if (typeof str === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(str)) {
    const [y, m, d] = str.split('-').map(Number)
    return new Date(Date.UTC(y, m - 1, d))
  }
  return new Date(str)
}

function addDays(dateStr, days) {
  // dateStr is a YYYY-MM-DD string (PT-anchored). Never parse through new Date(string).
  // Instead, parse components and use Date.UTC for timezone-safe arithmetic.
  const [y, m, d] = dateStr.split('-').map(Number)
  const result = new Date(Date.UTC(y, m - 1, d + days))
  const ry = result.getUTCFullYear()
  const rm = String(result.getUTCMonth() + 1).padStart(2, '0')
  const rd = String(result.getUTCDate()).padStart(2, '0')
  return `${ry}-${rm}-${rd}`  // return PT-anchored YYYY-MM-DD string
}
function formatDate(date, opts) {
  // YYYY-MM-DD strings are parsed as UTC via parsePTDate, so use timeZone: 'UTC'
  // to format them without shifting to local time
  if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const [y, m, d] = date.split('-').map(Number)
    const utcDate = new Date(Date.UTC(y, m - 1, d))
    return utcDate.toLocaleDateString('en-US', { ...opts, timeZone: 'UTC' })
  }
  return new Date(date).toLocaleDateString('en-US', opts)
}
function getDayOfWeekIdx(date) {
  const d = parsePTDate(date).getDay()
  return d === 0 ? 6 : d - 1
}
function isoStr(date) { return toISODate(date) }

// For a date, get the slot map from schedule[agentId][dayOffset]
// monday is a PT-anchored YYYY-MM-DD string; targetDate is a Date object.
// We compute day offset using Date.UTC() to avoid new Date(string) parsing as UTC.
function getSlotsForDate(schedule, agentId, monday, targetDate) {
  // Parse YYYY-MM-DD strings and Date objects consistently as local calendar dates
  const toYMD = (d) => {
    if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) return d
    const dt = new Date(d)
    const y = dt.getFullYear()
    const m = String(dt.getMonth() + 1).padStart(2, '0')
    const day = String(dt.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }

  const mondayYMD = toYMD(monday)
  const targetYMD = toYMD(targetDate)

  // Parse YYYY-MM-DD to components and compute day offset using UTC (timezone-safe for dates)
  const [my, mm, md] = mondayYMD.split('-').map(Number)
  const [ty, tm, td] = targetYMD.split('-').map(Number)
  const mondayMs = Date.UTC(my, mm - 1, md)
  const targetMs = Date.UTC(ty, tm - 1, td)
  const dayIdx = Math.round((targetMs - mondayMs) / 86400000)

  if (dayIdx < 0 || dayIdx > 6) return {}
  return schedule[agentId]?.[dayIdx] || {}
}

// Returns the current hour in PT (0–23), derived from ET via Intl API.
// Columns are indexed in PT, so this is the correct column to highlight.
function getCurrentPtHour() {
  const etHour = parseInt(
    new Date().toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', hour12: false })
  ) % 24  // midnight can return 24 in some browsers
  return (etHour - 3 + 24) % 24
}

// Determine if a (date, hour) is in the past, current, or future relative to now
function hourStatus(date, hour) {
  const d = parsePTDate(date)
  d.setHours(0, 0, 0, 0)
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)

  if (d < todayStart) return 'past'
  if (d > todayStart) return 'future'
  // same day — compare against current PT hour (columns are PT-indexed)
  const currentPtHour = getCurrentPtHour()
  if (hour < currentPtHour) return 'past'
  if (hour === currentPtHour) return 'current'
  return 'future'
}

// ─── useVolumeData hook — fetches actual volume for a specific date ───────────

function useVolumeData(date) {
  const [data, setData] = useState({ phone: {}, email: {} }) // { [hour]: count }

  useEffect(() => {
    if (!date) return
    const iso = isoStr(date)
    let cancelled = false

    async function load() {
      const [{ data: phoneRows }, { data: emailRows }] = await Promise.all([
        supabase.from('phone_volume')
          .select('hour,call_count')
          .eq('date', iso),
        supabase.from('email_volume')
          .select('hour,tickets_created')
          .eq('date', iso),
      ])
      if (cancelled) return
      const phone = {}
      for (const r of (phoneRows || [])) phone[r.hour] = r.call_count
      const email = {}
      for (const r of (emailRows || [])) email[r.hour] = r.tickets_created
      setData({ phone, email })
    }
    load()
    return () => { cancelled = true }
  }, [isoStr(date)])

  return data
}

// ─── useLatestWeekSchedule — fetches the most recent saved week as a template ──
//
// Returns { schedule, weekStart, loading } where schedule has the same
// agentId → dayOffset(0-6) → { hour: activity } shape the rest of the
// component uses, or null if nothing is saved yet.

function useLatestWeekSchedule(agents) {
  const [result, setResult] = useState({ schedule: null, weekStart: null, loading: true })

  useEffect(() => {
    if (!agents || agents.length === 0) {
      setResult({ schedule: null, weekStart: null, loading: false })
      return
    }
    let cancelled = false

    async function load() {
      // Find the most recent week_start that has any schedule rows
      const { data: weekRows } = await supabase
        .from('schedules')
        .select('week_start')
        .order('week_start', { ascending: false })
        .limit(1)

      if (cancelled) return

      const weekStart = weekRows?.[0]?.week_start
      if (!weekStart) {
        setResult({ schedule: null, weekStart: null, loading: false })
        return
      }

      const { data: schedules } = await supabase
        .from('schedules')
        .select('*, schedule_slots(*)')
        .eq('week_start', weekStart)

      if (cancelled) return

      // Convert to agentId → dayOffset(0-6) → { hour: activity }
      const dow2idx = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 }
      const sched = {}
      for (const agent of agents) {
        sched[agent.id] = { 0: {}, 1: {}, 2: {}, 3: {}, 4: {}, 5: {}, 6: {} }
      }
      for (const row of (schedules || [])) {
        const di = dow2idx[row.day_of_week]
        if (di === undefined) continue
        if (!sched[row.agent_id]) continue
        if (row.is_off) {
          sched[row.agent_id][di] = null
        } else {
          const slots = {}
          for (const slot of row.schedule_slots || []) {
            slots[slot.hour] = slot.activity
          }
          sched[row.agent_id][di] = slots
        }
      }

      setResult({ schedule: sched, weekStart, loading: false })
    }

    load()
    return () => { cancelled = true }
  }, [agents?.map(a => a.id).join(',')])

  return result
}

// ─── Shift Modal ─────────────────────────────────────────────────────────────

function ShiftModal({ agent, date, dow, clickedHour, agentSlots, updateSlot, shiftTypes, onClose }) {
  const existingActivity = agentSlots[clickedHour]
  const isEditing = !!existingActivity && existingActivity !== 'off'

  // Detect the contiguous block of the same activity around clickedHour
  const { blockStart, blockEnd } = useMemo(() => {
    if (!isEditing) return { blockStart: clickedHour, blockEnd: clickedHour }
    const act = agentSlots[clickedHour]
    let start = clickedHour, end = clickedHour
    while (start > 0 && agentSlots[start - 1] === act) start--
    while (end < 23 && agentSlots[end + 1] === act) end++
    return { blockStart: start, blockEnd: end }
  }, [isEditing, clickedHour, agentSlots])

  const [channel, setChannel] = useState(() => {
    if (isEditing && shiftTypes?.find(t => t.id === existingActivity)) return existingActivity
    const defaultType = shiftTypes?.find(t => t.id === (agent.default_channel || 'email'))
    return defaultType?.id ?? shiftTypes?.[0]?.id ?? 'email'
  })
  const [startHour, setStartHour] = useState(blockStart)
  const [endHour,   setEndHour]   = useState(blockEnd)

  const handleSave = () => {
    // Clear any old block hours that fall outside the new range
    if (isEditing) {
      for (let h = blockStart; h <= blockEnd; h++) {
        if (h < startHour || h > endHour) {
          updateSlot(agent.id, dow, h, null)
        }
      }
    }
    // Write new range
    for (let h = startHour; h <= endHour; h++) {
      updateSlot(agent.id, dow, h, channel)
    }
    onClose()
  }

  const handleDelete = () => {
    for (let h = blockStart; h <= blockEnd; h++) {
      updateSlot(agent.id, dow, h, null)
    }
    onClose()
  }

  const dateLabel = parsePTDate(date).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  })

  return (
    <div
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-[#141922] border border-[#2A3245] rounded-xl w-full max-w-sm shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#2A3245]">
          <div>
            <div className="flex items-center gap-2">
              <div
                className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white shrink-0"
                style={{ background: agent.color }}
              >
                {agent.name[0]}
              </div>
              <span className="font-semibold text-white text-sm">
                {isEditing ? 'Edit Shift' : 'Add Shift'}
              </span>
            </div>
            <p className="text-[11px] text-gray-500 mt-0.5">{agent.name} · {dateLabel}</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors p-1">
            <X size={16} />
          </button>
        </div>

        {/* Fields */}
        <div className="px-5 py-4 space-y-4">
          {/* Shift type grid */}
          <div>
            <label className="block text-xs text-gray-400 mb-2 font-medium">Type</label>
            <div className="grid grid-cols-3 gap-1.5">
              {(shiftTypes || []).map(type => {
                const selected = channel === type.id
                return (
                  <button
                    key={type.id}
                    onClick={() => setChannel(type.id)}
                    style={{
                      background: selected ? type.color + '33' : type.color + '12',
                      color: type.color,
                      borderColor: selected ? type.color + '88' : type.color + '30',
                    }}
                    className="px-2 py-2 rounded-lg text-xs font-medium transition-all border truncate"
                  >
                    {type.name}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Start / End time */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1.5 font-medium">Start time</label>
              <select
                value={startHour}
                onChange={e => {
                  const h = Number(e.target.value)
                  setStartHour(h)
                  if (endHour < h) setEndHour(h)
                }}
                className="w-full bg-[#0C0F14] border border-[#2A3245] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
              >
                {Array.from({ length: 24 }, (_, h) => (
                  <option key={h} value={h}>{hLabel(h)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1.5 font-medium">End time</label>
              <select
                value={endHour}
                onChange={e => setEndHour(Number(e.target.value))}
                className="w-full bg-[#0C0F14] border border-[#2A3245] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
              >
                {Array.from({ length: 24 }, (_, h) => h)
                  .filter(h => h >= startHour)
                  .map(h => (
                    <option key={h} value={h}>{hLabel(h)}</option>
                  ))}
              </select>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-[#2A3245] flex items-center justify-between">
          {isEditing ? (
            <button
              onClick={handleDelete}
              className="px-3 py-1.5 text-xs text-red-400 hover:text-red-300 hover:bg-red-950/40 rounded-lg transition-colors"
            >
              Delete shift
            </button>
          ) : <div />}
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-sm text-gray-400 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-1.5 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors font-medium"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Day View ─────────────────────────────────────────────────────────────────

function DayView({ date, agents, schedule, monday, phoneForecast, emailForecast, updateSlot, shiftTypes, handleRate, userRole, userAgentId }) {
  const dayIdx    = getDayOfWeekIdx(date)
  const dow       = DAYS_SHORT[dayIdx]          // 'Mon' … 'Sun'
  const actualVol = useVolumeData(date)         // actual DB volume for this date

  // Check if the current schedule has any data for this specific day
  const hasDayData = useMemo(() => {
    for (const agent of agents) {
      const slots = getSlotsForDate(schedule, agent.id, monday, date)
      if (Object.keys(slots).length > 0) return true
    }
    return false
  }, [agents, schedule, monday, date])

  // Fetch the most-recent saved week as a fallback template
  const { schedule: templateSchedule, weekStart: templateWeekStart, loading: templateLoading } =
    useLatestWeekSchedule(hasDayData ? [] : agents)  // skip fetch when we have live data

  // Whether the parent has already loaded the correct week for this date.
  // If monday matches the date's week, we're showing live data (even if empty for this day).
  const dateMondayStr = toISODate(getMondayOfWeek(date))
  const isSameWeek    = toISODate(monday) === dateMondayStr

  // The schedule source we actually render:
  // - live data for this date if it exists
  // - show template ONLY when the correct week isn't loaded yet and we have a fallback
  // - never show template if we're already on the correct week (empty weekend = editable empty)
  const isTemplate = !hasDayData && !!templateSchedule && !isSameWeek
  const effectiveSchedule = isTemplate ? templateSchedule : schedule
  const effectiveMonday   = isTemplate
    ? parsePTDate(templateWeekStart) // treat template monday as anchor
    : monday

  // For the template: we want the same day-of-week (0-6), not offset from today's monday.
  function getSlotsForRender(agentId) {
    if (isTemplate) return effectiveSchedule[agentId]?.[dayIdx] || {}
    return getSlotsForDate(schedule, agentId, monday, date)
  }

  // Per-agent slot maps for this day — declared before drag handlers so they can reference it
  const agentSlots = useMemo(() => {
    const m = {}
    for (const a of agents) m[a.id] = getSlotsForRender(a.id)
    return m
  }, [agents, effectiveSchedule, dayIdx, isTemplate, monday, date])

  // Shift modal state — only enabled when showing live (non-template) data
  // Members can only edit their own agent row
  const canEditAny = !!updateSlot && !isTemplate
  const canEditAgent = (agId) => {
    if (!canEditAny) return false
    if (userRole === 'member') return agId === userAgentId
    return true
  }
  const [shiftModal, setShiftModal] = useState(null)

  // ── Drag state ─────────────────────────────────────────────────────────────
  // drag = { type:'move'|'resize', agentId, dow, origStart, origEnd, activity,
  //          offsetH, edge, previewStart, previewEnd, conflict }
  const [drag, setDrag]   = useState(null)
  const containerRef      = useRef(null)
  const justDragged       = useRef(false)

  function clientXToHour(clientX) {
    if (!containerRef.current) return null
    const rect = containerRef.current.getBoundingClientRect()
    const x = clientX - rect.left + containerRef.current.scrollLeft - 140
    return Math.max(0, Math.min(23, Math.floor(x / HOUR_COL_W)))
  }

  // Returns a modified slots map reflecting the current drag preview
  function computeDisplaySlots(base, d) {
    const s = { ...base }
    for (let h = d.origStart; h <= d.origEnd; h++) delete s[h]
    for (let h = d.previewStart; h <= d.previewEnd; h++) s[h] = d.activity
    return s
  }

  const handlePointerMove = useCallback((e) => {
    if (!drag || !canEditAny) return
    e.preventDefault()
    const h = clientXToHour(e.clientX)
    if (h === null) return
    const base = agentSlots[drag.agentId] || {}
    const isRealActivity = (a, currentAct) => a && a !== 'off' && a !== currentAct

    if (drag.type === 'move') {
      const len      = drag.origEnd - drag.origStart
      const newStart = Math.max(0, Math.min(23 - len, h - drag.offsetH))
      const newEnd   = newStart + len
      let conflict   = false
      for (let i = newStart; i <= newEnd; i++) {
        if (isRealActivity(base[i], drag.activity) && (i < drag.origStart || i > drag.origEnd)) {
          conflict = true; break
        }
      }
      setDrag(d => ({
        ...d,
        previewStart: conflict ? d.origStart : newStart,
        previewEnd:   conflict ? d.origEnd   : newEnd,
        conflict,
      }))
    } else {
      if (drag.edge === 'right') {
        let maxEnd = 23
        for (let i = drag.origEnd + 1; i <= 23; i++) {
          if (isRealActivity(base[i], drag.activity)) { maxEnd = i - 1; break }
        }
        const newEnd = Math.max(drag.origStart, Math.min(maxEnd, h))
        setDrag(d => ({ ...d, previewEnd: newEnd }))
      } else {
        let minStart = 0
        for (let i = drag.origStart - 1; i >= 0; i--) {
          if (isRealActivity(base[i], drag.activity)) { minStart = i + 1; break }
        }
        const newStart = Math.min(drag.origEnd, Math.max(minStart, h))
        setDrag(d => ({ ...d, previewStart: newStart }))
      }
    }
  }, [drag, canEditAny, agentSlots])

  const handlePointerUp = useCallback((e) => {
    if (!drag || !canEditAny) return
    const { type, agentId, dow: d, origStart, origEnd, activity, previewStart, previewEnd, conflict, edge } = drag
    if (conflict) return
    if (previewStart === origStart && previewEnd === origEnd) {
      setDrag(null)
      return
    }

    justDragged.current = true
    setTimeout(() => { justDragged.current = false }, 150)

    // Collect all changes to make
    const updates = []
    if (type === 'move') {
      for (let h = origStart; h <= origEnd; h++) {
        if (h < previewStart || h > previewEnd) {
          updates.push({ h, activity: null })
        }
      }
      for (let h = previewStart; h <= previewEnd; h++) {
        if (h < origStart || h > origEnd) {
          updates.push({ h, activity })
        }
      }
    } else {
      if (edge === 'right') {
        if (previewEnd > origEnd) {
          for (let h = origEnd + 1;  h <= previewEnd; h++) updates.push({ h, activity })
        } else {
          for (let h = previewEnd + 1; h <= origEnd; h++) updates.push({ h, activity: null })
        }
      } else {
        if (previewStart < origStart) {
          for (let h = previewStart; h < origStart; h++) updates.push({ h, activity })
        } else {
          for (let h = origStart; h < previewStart; h++) updates.push({ h, activity: null })
        }
      }
    }

    // Clear drag preview first
    setDrag(null)

    // Make the updates (fire and forget - updateSlot will reload the schedule)
    for (const { h, activity: act } of updates) {
      updateSlot(agentId, d, h, act)
    }
  }, [drag, canEditAny, updateSlot])

  const openShiftModal = (agent, h, slots) => {
    if (!canEditAgent(agent.id) || justDragged.current) return
    setShiftModal({ agent, clickedHour: h, agentSlots: slots })
  }

  // Determine which hours have any activity (to auto-trim the display)
  // Always show full 24 h as requested, but we'll grey out dead zones
  const hours = ALL_HOURS

  // Current time info for highlighting — currentHour is a PT column index
  const currentHour = getCurrentPtHour()
  const isToday = isoStr(date) === isoStr(new Date())

  // Measure the exact left-edge pixel position of the current-hour column from the DOM.
  // The table is w-full so columns expand beyond HOUR_COL_W — getBoundingClientRect() is accurate.
  const [overlayLeft, setOverlayLeft] = useState(140 + currentHour * HOUR_COL_W)
  useLayoutEffect(() => {
    if (!containerRef.current || !isToday) return
    const cell = containerRef.current.querySelector(`th[data-hour="${currentHour}"]`)
    if (!cell) return
    const containerRect = containerRef.current.getBoundingClientRect()
    const cellRect      = cell.getBoundingClientRect()
    setOverlayLeft(cellRect.left - containerRect.left + containerRef.current.scrollLeft)
  })

  // Per-hour coverage counts
  const coverage = useMemo(() => {
    const out = {}
    for (const h of hours) {
      let emailStaff = 0, phoneStaff = 0
      for (const a of agents) {
        const act = agentSlots[a.id]?.[h]
        if (act === 'email') emailStaff++
        if (act === 'phone') phoneStaff++
      }
      out[h] = { emailStaff, phoneStaff }
    }
    return out
  }, [agentSlots, agents, hours])

  // Resolve volume for a given hour: actual (past/current) or forecast (future)
  function emailVolume(h) {
    const status = hourStatus(date, h)
    if (status === 'past' || status === 'current') {
      // Use actual if we have it, else fall back to forecast
      return actualVol.email[h] ?? (emailForecast[dow]?.[h] || 0)
    }
    return emailForecast[dow]?.[h] || 0
  }
  function phoneVolume(h) {
    const status = hourStatus(date, h)
    if (status === 'past' || status === 'current') {
      return actualVol.phone[h] ?? (phoneForecast[dow]?.[h] || 0)
    }
    return phoneForecast[dow]?.[h] || 0
  }

  // Use the same shared functions as CoverageBar so both views are identical
  function emailNeeded(h) { return agentsNeededEmail(emailVolume(h), handleRate ?? undefined) }
  function phoneNeeded(h) { return agentsNeededPhone(phoneVolume(h)) }

  // Label for source (actual vs forecast)
  function volLabel(h) {
    const s = hourStatus(date, h)
    return s === 'past' || s === 'current' ? 'actual' : 'fcst'
  }

  // Template banner text
  const templateBanner = isTemplate && templateWeekStart
    ? `Showing last saved schedule (week of ${parsePTDate(templateWeekStart).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}) as template — no schedule saved for this date yet`
    : null

  return (
    <div className="bg-[#141922] border border-[#2A3245] rounded-xl overflow-hidden">

      {/* Template banner */}
      {templateBanner && (
        <div className="flex items-center gap-2 px-4 py-2 bg-indigo-950/60 border-b border-indigo-800/50">
          <span className="text-[10px] text-indigo-300">{templateBanner}</span>
        </div>
      )}

      {/* Loading state for template fetch */}
      {!hasDayData && templateLoading && (
        <div className="flex items-center gap-2 px-4 py-2 bg-[#0C0F14] border-b border-[#2A3245]">
          <span className="text-[10px] text-gray-600">Loading template…</span>
        </div>
      )}

      <div
        className="overflow-x-auto relative"
        ref={containerRef}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={() => setDrag(null)}
        style={drag ? { userSelect: 'none' } : undefined}
      >
        {isToday && (
          <div
            className="pointer-events-none absolute top-0 bottom-0 z-[8]"
            style={{
              left:        overlayLeft,
              width:       HOUR_COL_W,
              borderLeft:  '2px solid rgb(59,130,246)',
              background:  'rgba(30,58,138,0.08)',
            }}
          />
        )}
        <table className="text-[10px] border-collapse w-full" style={{ minWidth: 24 * HOUR_COL_W + 140 }}>

          {/* ── Column widths ── */}
          <colgroup>
            <col style={{ width: 140, minWidth: 140 }} />
            {hours.map(h => <col key={h} style={{ width: HOUR_COL_W, minWidth: HOUR_COL_W }} />)}
            <col style={{ width: 48, minWidth: 48 }} />
          </colgroup>

          <thead>
            {/* Phone-hours bracket row — label spans phone columns via colspan */}
            <tr>
              <th className="sticky left-0 z-20 bg-[#141922] border-r border-[#2A3245]" />
              {hours.map(h => {
                const isPhone = h >= PHONE_START && h < PHONE_END
                if (h === PHONE_START) {
                  return (
                    <th
                      key={h}
                      colSpan={PHONE_END - PHONE_START}
                      className="pt-1 pb-0 text-center bg-emerald-950/40 overflow-hidden"
                    >
                      <span className="text-[8px] font-semibold text-emerald-600 tracking-widest uppercase">
                        Phone hours
                      </span>
                    </th>
                  )
                }
                if (isPhone) return null  // consumed by colspan above
                return <th key={h} className="pt-1 pb-0" />
              })}
              <th className="pt-1 pb-0" />
            </tr>

            {/* ET hour labels row */}
            <tr>
              <th className="sticky left-0 z-20 bg-[#141922] border-r border-[#2A3245]" />
              {hours.map(h => {
                const isCurrent = isToday && h === currentHour
                const isPast    = isToday && h < currentHour
                const isPhone   = h >= PHONE_START && h < PHONE_END
                const etH       = (h + 3) % 24
                return (
                  <th
                    key={h}
                    className={`py-0.5 text-center font-mono text-[9px] border-[#2A3245] ${
                      isCurrent
                        ? 'text-blue-300/50 bg-blue-950/30'
                        : isPhone
                          ? isPast ? 'text-emerald-900/60 bg-emerald-950/40' : 'text-emerald-700/60 bg-emerald-950/40'
                          : isPast
                            ? 'text-gray-800'
                            : 'text-gray-600'
                    }`}
                  >
                    {hLabel(etH)}
                  </th>
                )
              })}
              <th className="py-0.5 px-1 border-l border-[#2A3245] text-[9px] font-semibold text-gray-600 text-center">ET</th>
            </tr>

            {/* PT hour labels row */}
            <tr>
              <th className="sticky left-0 z-20 bg-[#141922] text-left px-4 py-2 text-xs font-semibold text-gray-300 border-b border-r border-[#2A3245]">
                Agent
              </th>
              {hours.map(h => {
                const isCurrent  = isToday && h === currentHour
                const isPast     = isToday && h < currentHour
                const isPhone    = h >= PHONE_START && h < PHONE_END
                return (
                  <th
                    key={h}
                    data-hour={h}
                    className={`py-2 text-center font-mono border-b border-[#2A3245] ${
                      isCurrent
                        ? 'text-blue-400 bg-blue-950/30'
                        : isPhone
                          ? isPast ? 'text-emerald-900 bg-emerald-950/40' : 'text-emerald-600 bg-emerald-950/40'
                          : isPast
                            ? 'text-gray-700'
                            : 'text-gray-500'
                    }`}
                  >
                    {hLabel(h)}
                  </th>
                )
              })}
              <th className="py-1 px-1 border-b border-l border-[#2A3245] text-center">
                <div className="text-[9px] font-semibold text-gray-500 leading-none">Total</div>
                <div className="text-[8px] font-semibold text-gray-600 leading-none mt-0.5">PT</div>
              </th>
            </tr>
          </thead>

          <tbody>
            {/* ── Agent rows ── */}
            {agents.map((agent, idx) => {
              const canEdit = canEditAgent(agent.id)
              const baseSlots = agentSlots[agent.id] || {}
              const isBeingDragged = drag && drag.agentId === agent.id
              const slots = (isBeingDragged && !drag.conflict)
                ? computeDisplaySlots(baseSlots, drag)
                : baseSlots

              return (
                <tr
                  key={agent.id}
                  className={`border-b border-[#1A1F2E] ${idx % 2 === 1 ? 'bg-[#0C0F14]/20' : 'bg-[#1A1F2E]'}`}
                >
                  <td className="sticky left-0 z-10 bg-[#141922] border-r border-[#2A3245] px-3 py-1">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white shrink-0"
                        style={{ background: agent.color }}
                      >
                        {agent.name[0]}
                      </div>
                      <span className="text-xs font-medium text-gray-200 whitespace-nowrap">{agent.name}</span>
                    </div>
                  </td>
                  {(() => {
                    const runs = []
                    let i = 0
                    while (i < hours.length) {
                      const h   = hours[i]
                      const act = slots[h] || null
                      if (!act || act === 'off') {
                        runs.push({ startH: h, endH: h, activity: act, span: 1 })
                        i++
                      } else {
                        let j = i + 1
                        while (j < hours.length && (slots[hours[j]] || null) === act) j++
                        runs.push({ startH: h, endH: hours[j - 1], activity: act, span: j - i })
                        i = j
                      }
                    }

                    return runs.map(({ startH, endH, activity, span }) => {
                      const isCurrent    = isToday && startH <= currentHour && currentHour <= endH
                      const isPast       = isToday && endH < currentHour
                      const isPhone      = startH >= PHONE_START && endH < PHONE_END
                      const isPreview    = isBeingDragged && !drag.conflict && drag.type === 'move' && startH === drag.previewStart

                      if (!activity || activity === 'off') {
                        return (
                          <td
                            key={startH}
                            onClick={canEdit ? () => openShiftModal(agent, startH, baseSlots) : undefined}
                            className={`py-1 px-0.5 bg-transparent ${canEdit ? 'cursor-pointer hover:bg-[#2A3245]/40' : ''} ${
                              isCurrent ? 'bg-blue-950/20' : isPhone ? 'bg-emerald-950/20' : ''
                            }`}
                          />
                        )
                      }

                      const shiftType = shiftTypes?.find(t => t.id === activity)
                      const cs        = cellStyle(activity)
                      const label     = shiftType ? shiftType.name : cs.label
                      const showHandles = canEdit && !(activity === 'lunch' && span < 2)

                      return (
                        <td
                          key={startH}
                          colSpan={span}
                          className={`py-1 px-0.5 bg-transparent ${canEdit ? 'cursor-grab active:cursor-grabbing' : ''}`}
                          onClick={canEdit ? (e) => {
                            if (!justDragged.current) openShiftModal(agent, startH, baseSlots)
                          } : undefined}
                        >
                          <div
                            className={`
                              relative text-center rounded text-[9px] font-medium py-1 select-none
                              ${shiftType ? '' : `${cs.bg} ${cs.text}`}
                              ${isPast ? 'opacity-60' : ''}
                              ${isPreview ? 'opacity-60 ring-1 ring-white/20' : ''}
                              ${canEdit && !isPreview ? 'hover:brightness-125 transition-all' : ''}
                            `}
                            style={shiftType ? { background: shiftType.color + '33', color: shiftType.color } : undefined}
                            onPointerDown={canEdit ? (e) => {
                              if (e.target !== e.currentTarget && e.target.dataset.handle) return
                              e.stopPropagation()
                              const h = clientXToHour(e.clientX)
                              setDrag({
                                type: 'move', agentId: agent.id, dow,
                                origStart: startH, origEnd: endH, activity,
                                offsetH: h !== null ? h - startH : 0,
                                previewStart: startH, previewEnd: endH, conflict: false,
                              })
                            } : undefined}
                          >
                            {/* Left resize handle */}
                            {showHandles && (
                              <div
                                data-handle="left"
                                className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize rounded-l hover:bg-white/20 z-10"
                                onPointerDown={(e) => {
                                  e.stopPropagation()
                                  setDrag({
                                    type: 'resize', edge: 'left', agentId: agent.id, dow,
                                    origStart: startH, origEnd: endH, activity,
                                    previewStart: startH, previewEnd: endH, conflict: false,
                                  })
                                }}
                              />
                            )}
                            {label}
                            {/* Right resize handle */}
                            {showHandles && (
                              <div
                                data-handle="right"
                                className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize rounded-r hover:bg-white/20 z-10"
                                onPointerDown={(e) => {
                                  e.stopPropagation()
                                  setDrag({
                                    type: 'resize', edge: 'right', agentId: agent.id, dow,
                                    origStart: startH, origEnd: endH, activity,
                                    previewStart: startH, previewEnd: endH, conflict: false,
                                  })
                                }}
                              />
                            )}
                          </div>
                        </td>
                      )
                    })
                  })()}
                  {/* Total worked hours for this agent/day */}
                  {(() => {
                    const worked = Object.entries(slots).filter(
                      ([key, val]) => key !== 'off' && val && val !== 'lunch' && val !== 'off'
                    ).length
                    return (
                      <td className="py-1 px-1 text-center border-l border-[#2A3245] text-[10px] font-mono text-gray-400 whitespace-nowrap">
                        {worked > 0 ? `${worked}h` : <span className="text-gray-700">—</span>}
                      </td>
                    )
                  })()}
                </tr>
              )
            })}

            {/* ── Divider row between agents and summary ── */}
            <tr>
              <td
                colSpan={hours.length + 2}
                className="h-px bg-[#2A3245]"
              />
            </tr>

            {/* ══════════════════════════════════════════
                EMAIL COVERAGE ROWS
            ══════════════════════════════════════════ */}
            <CoverageGroupHeader label="Email" hours={hours} isToday={isToday} currentHour={currentHour} />

            {/* Email Staffed */}
            <CoverageRow
              label="Staffed"
              hours={hours}
              isToday={isToday}
              currentHour={currentHour}
              renderCell={(h) => {
                const n = coverage[h].emailStaff
                return n > 0
                  ? <span className="font-mono font-semibold text-blue-300">{n}</span>
                  : <span className="text-gray-700">—</span>
              }}
              summaryCell={(() => {
                const peak = Math.max(0, ...hours.map(h => coverage[h].emailStaff))
                return peak > 0 ? <span className="font-semibold text-blue-300">{peak}</span> : <span className="text-gray-700">—</span>
              })()}
            />

            {/* Email Volume */}
            <CoverageRow
              label="Volume"
              hours={hours}
              isToday={isToday}
              currentHour={currentHour}
              renderCell={(h) => {
                const vol = emailVolume(h)
                const src = volLabel(h)
                if (!vol) return <span className="text-gray-700">—</span>
                return (
                  <span className={`font-mono ${src === 'actual' ? 'text-gray-300' : 'text-gray-500'}`}>
                    {vol}
                  </span>
                )
              }}
              summaryCell={(() => {
                const total = hours.reduce((s, h) => s + emailVolume(h), 0)
                return total > 0 ? <span className="text-gray-400">{total}</span> : <span className="text-gray-700">—</span>
              })()}
            />

            {/* Email Needed */}
            <CoverageRow
              label="Needed"
              hours={hours}
              isToday={isToday}
              currentHour={currentHour}
              renderCell={(h) => {
                const n = emailNeeded(h)
                return n > 0
                  ? <span className="font-mono text-gray-500">{n}</span>
                  : <span className="text-gray-700">—</span>
              }}
              summaryCell={(() => {
                const peak = Math.max(0, ...hours.map(h => emailNeeded(h)))
                return peak > 0 ? <span className="text-gray-500">{peak}</span> : <span className="text-gray-700">—</span>
              })()}
            />

            {/* Email Gap */}
            <CoverageRow
              label="Gap"
              hours={hours}
              isToday={isToday}
              currentHour={currentHour}
              isGapRow
              renderCell={(h) => {
                const staffed = coverage[h].emailStaff
                const vol     = emailVolume(h)
                const needed  = emailNeeded(h)
                const status  = getEmailGap(staffed, vol)   // identical to CoverageBar
                if (status === 'none') return <span className="text-gray-700">—</span>
                const diff  = staffed - needed
                const style = GAP_STATUS[status]
                return (
                  <div className={`rounded text-[9px] font-mono font-semibold px-0.5 py-0.5 text-center border ${style.bg} ${style.text} ${style.border}`}>
                    {diff >= 0 ? `+${diff}` : diff}
                  </div>
                )
              }}
              summaryCell={(() => {
                const gapSum = hours.reduce((s, h) => {
                  const diff = coverage[h].emailStaff - emailNeeded(h)
                  return diff < 0 ? s + diff : s
                }, 0)
                if (gapSum === 0) return <span className="text-gray-700">—</span>
                const st = GAP_STATUS.critical
                return <div className={`rounded text-[9px] font-mono font-semibold px-0.5 py-0.5 text-center border ${st.bg} ${st.text} ${st.border}`}>{gapSum}</div>
              })()}
            />

            {/* ══════════════════════════════════════════
                PHONE COVERAGE ROWS
            ══════════════════════════════════════════ */}
            <CoverageGroupHeader label="Phone" hours={hours} isToday={isToday} currentHour={currentHour} />

            {/* Phone Staffed */}
            <CoverageRow
              label="Staffed"
              hours={hours}
              isToday={isToday}
              currentHour={currentHour}
              renderCell={(h) => {
                const n = coverage[h].phoneStaff
                return n > 0
                  ? <span className="font-mono font-semibold text-emerald-300">{n}</span>
                  : <span className="text-gray-700">—</span>
              }}
              summaryCell={(() => {
                const peak = Math.max(0, ...hours.map(h => coverage[h].phoneStaff))
                return peak > 0 ? <span className="font-semibold text-emerald-300">{peak}</span> : <span className="text-gray-700">—</span>
              })()}
            />

            {/* Phone Volume */}
            <CoverageRow
              label="Volume"
              hours={hours}
              isToday={isToday}
              currentHour={currentHour}
              renderCell={(h) => {
                const vol = phoneVolume(h)
                const src = volLabel(h)
                if (!vol) return <span className="text-gray-700">—</span>
                return (
                  <span className={`font-mono ${src === 'actual' ? 'text-gray-300' : 'text-gray-500'}`}>
                    {vol}
                  </span>
                )
              }}
              summaryCell={(() => {
                const total = hours.reduce((s, h) => s + phoneVolume(h), 0)
                return total > 0 ? <span className="text-gray-400">{total}</span> : <span className="text-gray-700">—</span>
              })()}
            />

            {/* Phone Needed */}
            <CoverageRow
              label="Needed"
              hours={hours}
              isToday={isToday}
              currentHour={currentHour}
              renderCell={(h) => {
                const n = phoneNeeded(h)
                return n > 0
                  ? <span className="font-mono text-gray-500">{n}</span>
                  : <span className="text-gray-700">—</span>
              }}
              summaryCell={(() => {
                const peak = Math.max(0, ...hours.map(h => phoneNeeded(h)))
                return peak > 0 ? <span className="text-gray-500">{peak}</span> : <span className="text-gray-700">—</span>
              })()}
            />

            {/* Phone Gap */}
            <CoverageRow
              label="Gap"
              hours={hours}
              isToday={isToday}
              currentHour={currentHour}
              isGapRow
              renderCell={(h) => {
                const staffed = coverage[h].phoneStaff
                const vol     = phoneVolume(h)
                const needed  = phoneNeeded(h)
                const status  = getPhoneGap(staffed, vol)   // identical to CoverageBar
                if (status === 'none') return <span className="text-gray-700">—</span>
                const diff  = staffed - needed
                const style = GAP_STATUS[status]
                return (
                  <div className={`rounded text-[9px] font-mono font-semibold px-0.5 py-0.5 text-center border ${style.bg} ${style.text} ${style.border}`}>
                    {diff >= 0 ? `+${diff}` : diff}
                  </div>
                )
              }}
              summaryCell={(() => {
                const gapSum = hours.reduce((s, h) => {
                  const diff = coverage[h].phoneStaff - phoneNeeded(h)
                  return diff < 0 ? s + diff : s
                }, 0)
                if (gapSum === 0) return <span className="text-gray-700">—</span>
                const st = GAP_STATUS.critical
                return <div className={`rounded text-[9px] font-mono font-semibold px-0.5 py-0.5 text-center border ${st.bg} ${st.text} ${st.border}`}>{gapSum}</div>
              })()}
            />
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="px-4 py-2.5 border-t border-[#2A3245] flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[10px] text-gray-500">
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-blue-900/60 inline-block" /> Email</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-emerald-900/60 inline-block" /> Phone</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-amber-900/50 inline-block" /> Lunch</span>
        <span className="text-gray-700">·</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-emerald-900/60 border border-emerald-700/50 inline-block" /> Covered</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-amber-900/60 border border-amber-700/50 inline-block" /> Understaffed</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-red-900/60 border border-red-700/50 inline-block" /> Critical gap</span>
        <span className="text-gray-700">·</span>
        <span className="text-gray-600">Volume: bold = actual data, dim = forecast</span>
        {isToday && (
          <span className="ml-auto flex items-center gap-1.5 text-blue-400">
            <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" /> Current hour highlighted
          </span>
        )}
      </div>

      {/* Shift modal */}
      {shiftModal && (
        <ShiftModal
          agent={shiftModal.agent}
          date={date}
          dow={dow}
          clickedHour={shiftModal.clickedHour}
          agentSlots={shiftModal.agentSlots}
          updateSlot={updateSlot}
          shiftTypes={shiftTypes}
          onClose={() => setShiftModal(null)}
        />
      )}
    </div>
  )
}

const SUMMARY_CELL_CLS = 'py-1 px-1 text-center text-[10px] font-mono border-l border-[#2A3245] whitespace-nowrap'

// Group header row (Email / Phone separator)
function CoverageGroupHeader({ label, hours, isToday, currentHour }) {
  return (
    <tr className="border-t-2 border-[#2A3245]">
      <td className="sticky left-0 z-10 bg-[#0F1520] border-r border-[#2A3245] px-4 py-1">
        <span className="text-[9px] font-bold uppercase tracking-widest text-gray-500">{label}</span>
      </td>
      {hours.map(h => {
        const isCurrent = isToday && h === currentHour
        const isPhone   = h >= PHONE_START && h < PHONE_END
        return (
          <td
            key={h}
            className={`py-1 ${
              isCurrent
                ? 'bg-blue-950/20'
                : isPhone
                  ? 'bg-emerald-950/30'
                  : 'bg-[#0F1520]'
            }`}
          />
        )
      })}
      <td className={`${SUMMARY_CELL_CLS} bg-[#0F1520]`} />
    </tr>
  )
}

// Generic coverage summary row
function CoverageRow({ label, hours, isToday, currentHour, renderCell, isGapRow = false, summaryCell }) {
  return (
    <tr className={`border-t border-[#1A1F2E] ${isGapRow ? 'bg-[#0C0F14]/60' : 'bg-[#0C0F14]/40'}`}>
      <td className="sticky left-0 z-10 bg-[#0C0F14]/80 border-r border-[#2A3245] px-4 py-1">
        <span className="text-[10px] text-gray-500 font-medium whitespace-nowrap">{label}</span>
      </td>
      {hours.map(h => {
        const isCurrent = isToday && h === currentHour
        const isPhone   = h >= PHONE_START && h < PHONE_END
        return (
          <td
            key={h}
            className={`py-1 px-0.5 text-center text-[10px] ${
              isCurrent
                ? 'bg-blue-950/20'
                : isPhone
                  ? 'bg-emerald-950/20'
                  : ''
            }`}
          >
            {renderCell(h)}
          </td>
        )
      })}
      <td className={SUMMARY_CELL_CLS}>
        {summaryCell ?? <span className="text-gray-700">—</span>}
      </td>
    </tr>
  )
}

// ─── Week View ────────────────────────────────────────────────────────────────

function WeekView({ monday, agents, schedule }) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i))

  return (
    <div className="bg-[#141922] border border-[#2A3245] rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-xs" style={{ minWidth: 700 }}>
          <thead>
            <tr className="border-b border-[#2A3245]">
              <th className="sticky left-0 z-10 bg-[#141922] text-left px-4 py-3 w-32 font-semibold text-gray-300 border-r border-[#2A3245]">
                Agent
              </th>
              {days.map((d, i) => {
                const isWeekend = i >= 5
                return (
                  <th key={i} className={`py-3 px-3 text-center min-w-[100px] ${isWeekend ? 'text-gray-600' : 'text-gray-300'}`}>
                    <div className="font-semibold">{DAYS_SHORT[i]}</div>
                    <div className="text-[10px] text-gray-500 font-mono">{formatDate(d, { month: 'short', day: 'numeric' })}</div>
                  </th>
                )
              })}
              <th className="py-3 px-3 text-center text-gray-400 font-semibold">Total</th>
            </tr>
          </thead>
          <tbody>
            {agents.map((agent, idx) => {
              const weekTotal = { email: 0, phone: 0 }
              const dayCells = days.map((d, di) => {
                const slots = getSlotsForDate(schedule, agent.id, monday, d)
                let email = 0, phone = 0
                Object.values(slots).forEach(v => {
                  if (v === 'email') email++
                  if (v === 'phone') phone++
                })
                weekTotal.email += email
                weekTotal.phone += phone
                return { email, phone, isOff: email + phone === 0 }
              })

              return (
                <tr key={agent.id} className={`border-t border-[#1A1F2E] ${idx % 2 === 1 ? 'bg-[#0C0F14]/20' : ''}`}>
                  <td className="sticky left-0 z-10 bg-[#141922] border-r border-[#2A3245] px-4 py-2">
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white shrink-0" style={{ background: agent.color }}>
                        {agent.name[0]}
                      </div>
                      <span className="font-medium text-gray-200 whitespace-nowrap">{agent.name}</span>
                    </div>
                  </td>
                  {dayCells.map((cell, di) => {
                    const isWeekend = di >= 5
                    if (cell.isOff) {
                      return (
                        <td key={di} className={`py-2 px-3 text-center ${isWeekend ? 'opacity-30' : ''}`}>
                          <span className="text-[10px] text-gray-700">Off</span>
                        </td>
                      )
                    }
                    return (
                      <td key={di} className="py-2 px-3">
                        <div className="flex flex-col gap-0.5">
                          {cell.email > 0 && (
                            <div className="flex items-center justify-between bg-blue-900/40 rounded px-2 py-0.5">
                              <span className="text-[9px] text-blue-400">Email</span>
                              <span className="text-[10px] font-mono text-blue-300 font-semibold">{cell.email}h</span>
                            </div>
                          )}
                          {cell.phone > 0 && (
                            <div className="flex items-center justify-between bg-emerald-900/40 rounded px-2 py-0.5">
                              <span className="text-[9px] text-emerald-400">Phone</span>
                              <span className="text-[10px] font-mono text-emerald-300 font-semibold">{cell.phone}h</span>
                            </div>
                          )}
                        </div>
                      </td>
                    )
                  })}
                  <td className="py-2 px-3 text-center border-l border-[#2A3245]">
                    <div className="text-xs font-mono font-semibold text-gray-300">{weekTotal.email + weekTotal.phone}h</div>
                    <div className="text-[9px] text-gray-600">{((weekTotal.email + weekTotal.phone) / 40 * 100).toFixed(0)}% FTE</div>
                  </td>
                </tr>
              )
            })}

            {/* Coverage summary rows */}
            <tr className="border-t-2 border-[#2A3245]">
              <td className="sticky left-0 z-10 bg-[#141922] border-r border-[#2A3245] px-4 py-1.5">
                <span className="text-[10px] text-gray-500 font-medium">Email Agents</span>
              </td>
              {days.map((d, di) => {
                let emailAgents = 0
                for (const agent of agents) {
                  const slots = getSlotsForDate(schedule, agent.id, monday, d)
                  if (Object.values(slots).includes('email')) emailAgents++
                }
                const isWeekend = di >= 5
                return (
                  <td key={di} className={`py-1.5 px-3 text-center ${isWeekend ? 'opacity-40' : ''}`}>
                    <span className="text-[10px] font-mono font-semibold text-blue-300">{emailAgents}</span>
                  </td>
                )
              })}
              <td className="border-l border-[#2A3245]" />
            </tr>

            <tr className="border-t border-[#1A1F2E]">
              <td className="sticky left-0 z-10 bg-[#141922] border-r border-[#2A3245] px-4 py-1.5">
                <span className="text-[10px] text-gray-500 font-medium">Coverage Health</span>
              </td>
              {days.map((d, di) => {
                let emailAgents = 0
                for (const agent of agents) {
                  const slots = getSlotsForDate(schedule, agent.id, monday, d)
                  if (Object.values(slots).includes('email')) emailAgents++
                }
                const isWeekend = di >= 5
                const needed = isWeekend ? 2 : 4
                const status = emailAgents >= needed ? 'ok' : emailAgents >= Math.ceil(needed * 0.6) ? 'warn' : 'critical'
                const statusStyle = {
                  ok:       'bg-emerald-900/50 text-emerald-400',
                  warn:     'bg-amber-900/50 text-amber-400',
                  critical: 'bg-red-900/50 text-red-400',
                }
                return (
                  <td key={di} className="py-1.5 px-3 text-center">
                    <span className={`text-[9px] font-semibold px-2 py-0.5 rounded ${statusStyle[status]}`}>
                      {status === 'ok' ? 'Good' : status === 'warn' ? 'Low' : 'Gap'}
                    </span>
                  </td>
                )
              })}
              <td className="border-l border-[#2A3245]" />
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Month View ───────────────────────────────────────────────────────────────

function MonthView({ year, month, agents, schedule, monthSchedule, monday, onSelectDay }) {
  const firstDay  = new Date(year, month, 1)
  const lastDay   = new Date(year, month + 1, 0)
  const startDow  = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1
  // Convert firstDay to YYYY-MM-DD string before passing to addDays
  const firstDayStr = `${year}-${String(month + 1).padStart(2, '0')}-01`
  const calStart  = addDays(firstDayStr, -startDow)

  const weeks = []
  for (let w = 0; w < 6; w++) {
    const week = []
    for (let d = 0; d < 7; d++) week.push(addDays(calStart, w * 7 + d))
    weeks.push(week)
    // Compare last day of week with last day of month (both as YYYY-MM-DD strings)
    const lastDayStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(new Date(year, month + 1, 0).getDate()).padStart(2, '0')}`
    if (week[6] >= lastDayStr) break
  }

  const todayStr = isoStr(new Date())

  // Helper to get slots from monthSchedule (keyed by date string)
  function getSlotsForMonthDate(agentId, date) {
    const dateStr = isoStr(date)
    return monthSchedule?.[agentId]?.[dateStr] || {}
  }

  function getCoverageForDate(date) {
    let emailAgents = 0, totalHours = 0
    const scheduledAgents = []
    for (const agent of agents) {
      const slots = monthSchedule ? getSlotsForMonthDate(agent.id, date) : getSlotsForDate(schedule, agent.id, monday, date)
      let hrs = 0
      Object.values(slots).forEach(v => { if (v === 'email' || v === 'phone') hrs++ })
      if (hrs > 0) {
        emailAgents++
        totalHours += hrs
        scheduledAgents.push({ agent, hours: hrs })
      }
    }
    const di     = getDayOfWeekIdx(date)
    const needed = di >= 5 ? 2 : 4
    const status = totalHours === 0 ? 'none'
      : emailAgents >= needed ? 'ok'
      : emailAgents >= Math.ceil(needed * 0.6) ? 'warn'
      : 'critical'
    return { emailAgents, totalHours, status, scheduledAgents }
  }

  const statusColor = {
    ok:       { dot: 'bg-emerald-500', label: 'text-emerald-400', bar: 'bg-emerald-900/50' },
    warn:     { dot: 'bg-amber-500',   label: 'text-amber-400',   bar: 'bg-amber-900/50'   },
    critical: { dot: 'bg-red-500',     label: 'text-red-400',     bar: 'bg-red-900/50'     },
    none:     { dot: 'bg-gray-700',    label: 'text-gray-700',    bar: ''                  },
  }

  return (
    <div className="bg-[#141922] border border-[#2A3245] rounded-xl overflow-hidden">
      <div className="grid grid-cols-7 border-b border-[#2A3245]">
        {DAYS_SHORT.map(d => (
          <div key={d} className="py-2 text-center text-[10px] font-semibold text-gray-500 border-r border-[#2A3245] last:border-r-0">
            {d}
          </div>
        ))}
      </div>

      {weeks.map((week, wi) => (
        <div key={wi} className="grid grid-cols-7 border-b border-[#2A3245] last:border-b-0" style={{ minHeight: 90 }}>
          {week.map((date, di) => {
            // date is a YYYY-MM-DD string; extract month to compare with current month
            const dateMonth = parseInt(date.split('-')[1]) - 1
            const isCurrentMonth = dateMonth === month
            const isToday        = isoStr(date) === todayStr
            const isWeekend      = di >= 5
            const { emailAgents, totalHours, status, scheduledAgents } = getCoverageForDate(date)
            const sc = statusColor[status]
            const agentsToShow = scheduledAgents.slice(0, 5)
            const moreCount = scheduledAgents.length > 5 ? scheduledAgents.length - 5 : 0

            return (
              <button
                key={di}
                onClick={() => onSelectDay(date)}
                className={`
                  relative p-2 text-left border-r border-[#2A3245] last:border-r-0 transition-colors
                  hover:bg-[#2A3245]/40
                  ${!isCurrentMonth ? 'opacity-30' : ''}
                  ${isWeekend ? 'bg-[#0C0F14]/20' : ''}
                `}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className={`text-xs font-mono font-semibold ${
                    isToday
                      ? 'bg-blue-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-[10px]'
                      : isCurrentMonth ? 'text-gray-300' : 'text-gray-600'
                  }`}>
                    {parseInt(date.split('-')[2], 10)}
                  </span>
                  {isCurrentMonth && status !== 'none' && (
                    <span className={`w-2 h-2 rounded-full ${sc.dot}`} />
                  )}
                </div>
                {isCurrentMonth && totalHours > 0 && (
                  <>
                    <div className={`text-[9px] font-mono px-1.5 py-0.5 rounded mb-1.5 ${sc.bar} ${sc.label}`}>
                      {emailAgents} agents · {Math.round(totalHours)}h
                    </div>
                    <div className="space-y-0.5">
                      {agentsToShow.map(({ agent }) => (
                        <div key={agent.id} className="flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: agent.color }} />
                          <span className="text-[8px] text-gray-400 truncate">{agent.name.split(' ')[0]}</span>
                        </div>
                      ))}
                      {moreCount > 0 && (
                        <div className="text-[8px] text-gray-600">+{moreCount} more</div>
                      )}
                    </div>
                  </>
                )}
                {isCurrentMonth && totalHours === 0 && (
                  <div className="text-[9px] text-gray-700">No schedule</div>
                )}
              </button>
            )
          })}
        </div>
      ))}

      <div className="px-4 py-2.5 border-t border-[#2A3245] flex items-center gap-4 text-[10px] text-gray-500">
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" /> Well staffed</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-500 inline-block" /> Understaffed</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" /> Coverage gap</span>
        <span className="ml-auto text-gray-600 italic">Click any day to view detailed timeline</span>
      </div>
    </div>
  )
}

// ─── Custom Range View ────────────────────────────────────────────────────────

function CustomRangeView({ startDate, endDate, agents, schedule, monday, onSelectDay }) {
  if (!startDate || !endDate) {
    return (
      <div className="bg-[#141922] border border-[#2A3245] rounded-xl p-10 text-center text-gray-500 text-sm">
        Select a start and end date above to view the timeline.
      </div>
    )
  }

  // startDate and endDate are already YYYY-MM-DD strings
  if (endDate < startDate) {
    return (
      <div className="bg-[#141922] border border-[#2A3245] rounded-xl p-10 text-center text-red-400 text-sm">
        End date must be after start date.
      </div>
    )
  }

  // Calculate day count from date strings
  const [sy, sm, sd] = startDate.split('-').map(Number)
  const [ey, em, ed] = endDate.split('-').map(Number)
  const start = new Date(sy, sm - 1, sd)
  const end   = new Date(ey, em - 1, ed)
  const diffDays = Math.round((end - start) / 86400000) + 1

  if (diffDays > 60) {
    return (
      <div className="bg-[#141922] border border-[#2A3245] rounded-xl p-10 text-center text-amber-400 text-sm">
        Range too large. Please select 60 days or fewer.
      </div>
    )
  }

  // Use startDate string directly with addDays, not the Date object
  const dates = Array.from({ length: diffDays }, (_, i) => addDays(startDate, i))

  return (
    <div className="bg-[#141922] border border-[#2A3245] rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="text-xs border-collapse" style={{ minWidth: Math.max(700, diffDays * 82 + 160) }}>
          <thead>
            <tr className="border-b border-[#2A3245]">
              <th className="sticky left-0 z-10 bg-[#141922] text-left px-4 py-3 w-36 font-semibold text-gray-300 border-r border-[#2A3245]">
                Agent
              </th>
              {dates.map((d, i) => {
                const di        = getDayOfWeekIdx(d)
                const isWeekend = di >= 5
                const isToday   = isoStr(d) === isoStr(new Date())
                return (
                  <th key={i} className={`py-2 px-1 text-center min-w-[72px] ${isWeekend ? 'text-gray-600 bg-[#0C0F14]/20' : 'text-gray-400'} ${isToday ? 'bg-blue-950/30' : ''}`}>
                    <div className="text-[9px] text-gray-500">{DAYS_SHORT[di]}</div>
                    <div className={`font-mono text-[10px] ${isToday ? 'text-blue-400 font-semibold' : ''}`}>
                      {formatDate(d, { month: 'numeric', day: 'numeric' })}
                    </div>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {agents.map((agent, idx) => (
              <tr key={agent.id} className={`border-t border-[#1A1F2E] ${idx % 2 === 1 ? 'bg-[#0C0F14]/20' : ''}`}>
                <td className="sticky left-0 z-10 bg-[#141922] border-r border-[#2A3245] px-4 py-2">
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white shrink-0" style={{ background: agent.color }}>
                      {agent.name[0]}
                    </div>
                    <span className="font-medium text-gray-200 whitespace-nowrap">{agent.name}</span>
                  </div>
                </td>
                {dates.map((d, ci) => {
                  const dayIdx    = getDayOfWeekIdx(d)
                  const isWeekend = dayIdx >= 5
                  const isToday   = isoStr(d) === isoStr(new Date())
                  const slots     = getSlotsForDate(schedule, agent.id, monday, d)
                  let email = 0, phone = 0
                  Object.values(slots).forEach(v => {
                    if (v === 'email') email++
                    if (v === 'phone') phone++
                  })
                  return (
                    <td
                      key={ci}
                      className={`py-1.5 px-1 text-center cursor-pointer hover:bg-[#2A3245]/40
                        ${isWeekend ? 'bg-[#0C0F14]/20' : ''}
                        ${isToday ? 'bg-blue-950/20' : ''}
                      `}
                      onClick={() => onSelectDay(d)}
                    >
                      {email + phone > 0 ? (
                        <div className="space-y-0.5">
                          {email > 0 && <div className="text-[9px] rounded bg-blue-900/50 text-blue-300 font-mono px-1 py-0.5">{email}h</div>}
                          {phone > 0 && <div className="text-[9px] rounded bg-emerald-900/50 text-emerald-300 font-mono px-1 py-0.5">{phone}h</div>}
                        </div>
                      ) : (
                        <span className="text-[9px] text-gray-700">—</span>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}

            <tr className="border-t-2 border-[#2A3245]">
              <td className="sticky left-0 z-10 bg-[#141922] border-r border-[#2A3245] px-4 py-1.5">
                <span className="text-[10px] text-gray-500 font-medium">Active Agents</span>
              </td>
              {dates.map((d, ci) => {
                const dayIdx    = getDayOfWeekIdx(d)
                const isWeekend = dayIdx >= 5
                let active = 0
                for (const agent of agents) {
                  const slots = getSlotsForDate(schedule, agent.id, monday, d)
                  if (Object.values(slots).some(v => v === 'email' || v === 'phone')) active++
                }
                return (
                  <td key={ci} className={`py-1.5 px-1 text-center ${isWeekend ? 'bg-[#0C0F14]/20 opacity-50' : ''}`}>
                    <span className="text-[10px] font-mono font-semibold text-gray-300">{active}</span>
                  </td>
                )
              })}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Main TimelineView ────────────────────────────────────────────────────────

export default function TimelineView({
  agents: liveAgents,
  weekSchedule: liveSchedule,
  monthSchedule: liveMonthSchedule,
  currentMonday: liveMonday,
  phoneForecast: livePF,
  emailForecast: liveEF,
  updateSlot,
  shiftTypes,
  onViewChange,
  onWeekChange,
  handleRate,
  userRole,
  userAgentId,
  onCopyLastWeek,
  copyMsg,
  loadMonth,
}) {
  // Compute today's date in PT (used for Monday anchor and "today" buttons)
  const todayPT = useMemo(() => {
    const ptToday = new Date().toLocaleDateString('en-US', {
      timeZone: 'America/Los_Angeles',
      year: 'numeric', month: '2-digit', day: '2-digit'
    })
    const [m, d, y] = ptToday.split('/')
    return `${y}-${m}-${d}`  // YYYY-MM-DD PT-anchored string
  }, [])

  const [viewMode,     setViewMode]     = useState('day')
  const [selectedDate, setSelectedDate] = useState(todayPT)
  const [monthOffset,  setMonthOffset]  = useState(0)
  const [customStart,  setCustomStart]  = useState('')
  const [customEnd,    setCustomEnd]    = useState('')
  const [showDatePicker, setShowDatePicker] = useState(false)
  const datePickerRef = useRef(null)

  // Close date picker on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (datePickerRef.current && !datePickerRef.current.contains(e.target)) {
        setShowDatePicker(false)
      }
    }
    if (showDatePicker) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showDatePicker])

  // Live vs mock agents
  const hasLiveData = liveAgents && liveAgents.length > 0
  const agents = hasLiveData ? liveAgents : MOCK_AGENTS

  // Anchor Monday
  const monday = useMemo(() => {
    if (hasLiveData && liveMonday) return liveMonday
    // Compute Monday from todayPT (PT date string) without parsing through new Date
    const [y, m, d] = todayPT.split('-').map(Number)
    const ptDate = new Date(Date.UTC(y, m - 1, d))
    const dow = ptDate.getUTCDay()
    const diff = dow === 0 ? -6 : 1 - dow
    const monday = new Date(Date.UTC(y, m - 1, d + diff))
    const my = monday.getUTCFullYear()
    const mm = String(monday.getUTCMonth() + 1).padStart(2, '0')
    const md = String(monday.getUTCDate()).padStart(2, '0')
    return `${my}-${mm}-${md}`
  }, [hasLiveData, liveMonday, todayPT])

  // When selectedDate moves to a different week, sync the parent's currentMonday.
  // This ensures useSchedule loads that week's data and updateSlot writes to the correct week_start.
  useEffect(() => {
    if (!onWeekChange || !hasLiveData) return
    const selectedMonday    = getMondayOfWeek(selectedDate)
    const selectedMondayStr = toISODate(selectedMonday)
    const currentMondayStr  = liveMonday ? toISODate(liveMonday) : null
    if (selectedMondayStr !== currentMondayStr) {
      onWeekChange(selectedMonday)
    }
  }, [selectedDate, liveMonday])

  // Schedule (live only, null while loading to prevent mock data flash)
  const schedule = useMemo(() => {
    if (!hasLiveData || !liveSchedule) return null  // Don't show mock data — wait for real data
    const converted = {}
    for (const agent of agents) {
      converted[agent.id] = {}
      DAYS_SHORT.forEach((day, di) => {
        // Copy the slots from liveSchedule, ensuring we get the latest data
        const slots = liveSchedule[agent.id]?.[day]
        converted[agent.id][di] = slots ? { ...slots } : {}
      })
    }
    return converted
  }, [hasLiveData, liveSchedule, agents])

  // Forecast — use live if available, else baseline
  const phoneForecast = useMemo(() => livePF && Object.keys(livePF).length > 0 ? livePF : BASELINE_PHONE, [livePF])
  const emailForecast = useMemo(() => liveEF && Object.keys(liveEF).length > 0 ? liveEF : BASELINE_EMAIL, [liveEF])

  // Month date
  const monthDate = useMemo(() => {
    const d = parsePTDate(todayPT)
    d.setMonth(d.getMonth() + monthOffset)
    return d
  }, [monthOffset, todayPT])

  const weekMonday = useMemo(() => getMondayOfWeek(selectedDate), [selectedDate])

  // Load month schedule when month view is displayed
  useEffect(() => {
    if (viewMode === 'month' && loadMonth) {
      const yr = monthDate.getFullYear()
      const mo = monthDate.getMonth()
      loadMonth(yr, mo)
    }
  }, [viewMode, monthDate, loadMonth])

  // Report the effective date range to parent for KPI computation
  useEffect(() => {
    if (!onViewChange) return
    const WEEKDAYS = ['Mon','Tue','Wed','Thu','Fri']

    let dows = [], label = '', startDate = null, endDate = null

    if (viewMode === 'day') {
      const dow = DAYS_SHORT[getDayOfWeekIdx(selectedDate)]
      dows = WEEKDAYS.includes(dow) ? [dow] : []
      label = formatDate(selectedDate, { weekday: 'short', month: 'short', day: 'numeric' })
      startDate = selectedDate  // Already a YYYY-MM-DD string
      endDate   = selectedDate  // Already a YYYY-MM-DD string

    } else if (viewMode === 'week') {
      dows = [...WEEKDAYS]
      label = `${formatDate(weekMonday, { month: 'short', day: 'numeric' })} – ${formatDate(addDays(weekMonday, 4), { month: 'short', day: 'numeric' })}`
      startDate = weekMonday  // Already a YYYY-MM-DD string
      endDate   = addDays(weekMonday, 6)  // Already a YYYY-MM-DD string

    } else if (viewMode === 'month') {
      const yr = monthDate.getFullYear()
      const mo = monthDate.getMonth()
      const last = new Date(yr, mo + 1, 0).getDate()
      for (let day = 1; day <= last; day++) {
        const dow = DAYS_SHORT[getDayOfWeekIdx(new Date(yr, mo, day))]
        if (WEEKDAYS.includes(dow)) dows.push(dow)
      }
      label = `${MONTHS_SHORT[mo]} ${yr}`
      // Convert to YYYY-MM-DD strings
      startDate = `${yr}-${String(mo + 1).padStart(2, '0')}-01`
      endDate   = `${yr}-${String(mo + 1).padStart(2, '0')}-${String(last).padStart(2, '0')}`

    } else if (viewMode === 'custom') {
      if (customStart && customEnd) {
        const [sy, sm, sd] = customStart.split('-').map(Number)
        const [ey, em, ed] = customEnd.split('-').map(Number)
        if (customEnd >= customStart) {
          for (let d = new Date(sy, sm - 1, sd); d <= new Date(ey, em - 1, ed); d.setDate(d.getDate() + 1)) {
            const dow = DAYS_SHORT[getDayOfWeekIdx(new Date(d))]
            if (WEEKDAYS.includes(dow)) dows.push(dow)
          }
          label = `${customStart} – ${customEnd}`
          startDate = customStart  // Already a YYYY-MM-DD string
          endDate   = customEnd    // Already a YYYY-MM-DD string
        }
      }
    }

    onViewChange({ mode: viewMode, dows, label, startDate, endDate })
  }, [viewMode, selectedDate, weekMonday, monthDate, customStart, customEnd, onViewChange])

  // Navigation
  const prevDay  = () => setSelectedDate(d => addDays(d, -1))
  const nextDay  = () => setSelectedDate(d => addDays(d,  1))
  const prevWeek = () => setSelectedDate(d => addDays(d, -7))
  const nextWeek = () => setSelectedDate(d => addDays(d,  7))

  const handleMonthDayClick  = (date) => { setSelectedDate(date); setViewMode('day') }
  const handleCustomDayClick = (date) => { setSelectedDate(date); setViewMode('day') }

  const viewModes = [
    { id: 'day',    label: 'Day'          },
    { id: 'week',   label: 'Week'         },
    { id: 'month',  label: 'Month'        },
    { id: 'custom', label: 'Custom Range' },
  ]

  return (
    <div className="space-y-4">

      {/* ── Toolbar ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2 flex-wrap flex-1">

          {/* View mode pills */}
          <div className="flex rounded-lg overflow-hidden border border-[#2A3245]">
            {viewModes.map(vm => (
              <button
                key={vm.id}
                onClick={() => setViewMode(vm.id)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  viewMode === vm.id
                    ? 'bg-[#2A3245] text-white'
                    : 'bg-[#141922] text-gray-500 hover:text-gray-300 hover:bg-[#1A1F2E]'
                }`}
              >
                {vm.label}
              </button>
            ))}
          </div>

          {/* Day nav */}
          {viewMode === 'day' && (
            <div className="flex items-center gap-1">
              <button onClick={prevDay} className="p-1.5 rounded-lg hover:bg-[#1A1F2E] text-gray-400 hover:text-white transition-colors">
                <ChevronLeft size={14} />
              </button>
              <span className="text-sm font-semibold text-white px-2 font-mono min-w-[130px] text-center">
                {formatDate(selectedDate, { weekday: 'short', month: 'short', day: 'numeric' })}
              </span>
              <button onClick={nextDay} className="p-1.5 rounded-lg hover:bg-[#1A1F2E] text-gray-400 hover:text-white transition-colors">
                <ChevronRight size={14} />
              </button>
              <button
                onClick={() => setSelectedDate(todayPT)}
                className="ml-1 px-2 py-1 text-[10px] rounded bg-[#1A1F2E] text-gray-400 hover:text-white hover:bg-[#2A3245] transition-colors"
              >
                Today
              </button>
            </div>
          )}

          {/* Week nav */}
          {viewMode === 'week' && (
            <div className="flex items-center gap-1">
              <button onClick={prevWeek} className="p-1.5 rounded-lg hover:bg-[#1A1F2E] text-gray-400 hover:text-white transition-colors">
                <ChevronLeft size={14} />
              </button>
              <span className="text-sm font-semibold text-white px-2 font-mono min-w-[160px] text-center">
                {formatDate(weekMonday, { month: 'short', day: 'numeric' })} – {formatDate(addDays(weekMonday, 6), { month: 'short', day: 'numeric' })}
              </span>
              <button onClick={nextWeek} className="p-1.5 rounded-lg hover:bg-[#1A1F2E] text-gray-400 hover:text-white transition-colors">
                <ChevronRight size={14} />
              </button>
              <button
                onClick={() => setSelectedDate(todayPT)}
                className="ml-1 px-2 py-1 text-[10px] rounded bg-[#1A1F2E] text-gray-400 hover:text-white hover:bg-[#2A3245] transition-colors"
              >
                This week
              </button>
            </div>
          )}

          {/* Month nav */}
          {viewMode === 'month' && (
            <div className="flex items-center gap-1">
              <button onClick={() => setMonthOffset(o => o - 1)} className="p-1.5 rounded-lg hover:bg-[#1A1F2E] text-gray-400 hover:text-white transition-colors">
                <ChevronLeft size={14} />
              </button>
              <span className="text-sm font-semibold text-white px-2 font-mono min-w-[110px] text-center">
                {MONTHS_SHORT[monthDate.getMonth()]} {monthDate.getFullYear()}
              </span>
              <button onClick={() => setMonthOffset(o => o + 1)} className="p-1.5 rounded-lg hover:bg-[#1A1F2E] text-gray-400 hover:text-white transition-colors">
                <ChevronRight size={14} />
              </button>
              <button
                onClick={() => setMonthOffset(0)}
                className="ml-1 px-2 py-1 text-[10px] rounded bg-[#1A1F2E] text-gray-400 hover:text-white hover:bg-[#2A3245] transition-colors"
              >
                This month
              </button>
            </div>
          )}

          {/* Custom range picker dropdown */}
          {viewMode === 'custom' && (
            <div className="relative" ref={datePickerRef}>
              <button
                onClick={() => setShowDatePicker(!showDatePicker)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-[#2A3245] bg-[#0C0F14] text-gray-300 hover:text-white hover:bg-[#1A1F2E] transition-colors min-w-[220px]"
              >
                <Calendar size={13} />
                {customStart && customEnd ? (
                  <span className="font-mono">{customStart} – {customEnd}</span>
                ) : (
                  <span>Select dates</span>
                )}
              </button>

              {/* Date picker dropdown */}
              {showDatePicker && (
                <div className="absolute top-full left-0 mt-2 z-20">
                  <CustomRangePicker
                    startDate={customStart}
                    endDate={customEnd}
                    onApply={(start, end) => {
                      const formatDateStr = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
                      setCustomStart(formatDateStr(start))
                      setCustomEnd(formatDateStr(end))
                    }}
                    onClose={() => setShowDatePicker(false)}
                  />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Copy last week button — right side */}
        <div className="flex items-center gap-2 flex-wrap">
          {copyMsg && <span className="text-xs text-emerald-400 font-mono">{copyMsg}</span>}
          {onCopyLastWeek && (
            <button
              onClick={onCopyLastWeek}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-[#1A1F2E] hover:bg-[#2A3245] text-gray-300 hover:text-white transition-colors"
            >
              <Copy size={13} /> Copy last week
            </button>
          )}
        </div>

        {/* Mock data banner */}
        {!hasLiveData && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-900/30 border border-amber-800/50">
            <span className="text-[10px] text-amber-400">Showing mock data — connect Supabase to see live schedules</span>
          </div>
        )}
      </div>

      {/* ── View content ── */}
      {!schedule && hasLiveData ? (
        <div className="flex flex-col items-center justify-center gap-3 py-12">
          <div className="text-sm text-gray-400">Loading schedule…</div>
          <div className="w-8 h-8 border-2 border-gray-700 border-t-blue-500 rounded-full animate-spin" />
        </div>
      ) : schedule ? (
        <>
          {viewMode === 'day' && (
            <DayView
              date={selectedDate}
              agents={agents}
              schedule={schedule}
              monday={monday}
              phoneForecast={phoneForecast}
              emailForecast={emailForecast}
              updateSlot={updateSlot}
              shiftTypes={shiftTypes}
              handleRate={handleRate}
              userRole={userRole}
              userAgentId={userAgentId}
            />
          )}

          {viewMode === 'week' && (
            <WeekView
              monday={weekMonday}
              agents={agents}
              schedule={schedule}
            />
          )}

          {viewMode === 'month' && (
            <MonthView
              year={monthDate.getFullYear()}
              month={monthDate.getMonth()}
              agents={agents}
              schedule={schedule}
              monthSchedule={liveMonthSchedule}
              monday={monday}
              onSelectDay={handleMonthDayClick}
            />
          )}

          {viewMode === 'custom' && (
            <CustomRangeView
              startDate={customStart}
              endDate={customEnd}
              agents={agents}
              schedule={schedule}
              monday={monday}
              onSelectDay={handleCustomDayClick}
            />
          )}
        </>
      ) : null}
    </div>
  )
}
