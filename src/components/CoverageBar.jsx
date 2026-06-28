import { useState } from 'react'
import { RefreshCw } from 'lucide-react'
import {
  hLabel, getPhoneGap, getEmailGap,
  PHONE_START, PHONE_END, WORK_START, WORK_END,
  AVG_EMAILS_PER_AGENT_HOUR, AVG_CALLS_PER_AGENT_HOUR,
  phoneAnswerRate, emailAnswerRate, agentsNeededPhone, agentsNeededEmail
} from '../lib/forecast'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

const GAP_COLORS = {
  critical: { bg: 'bg-red-900/70', text: 'text-red-300', border: 'border-red-700', indicator: '!!' },
  warn:     { bg: 'bg-amber-900/50', text: 'text-amber-300', border: 'border-amber-700', indicator: '!' },
  ok:       { bg: 'bg-emerald-900/50', text: 'text-emerald-300', border: 'border-emerald-700', indicator: '' },
  none:     { bg: 'bg-[#111827]', text: 'text-gray-600', border: 'border-gray-800', indicator: '' },
}

const QUEUE_COLORS = {
  growing:  { bg: 'bg-red-900/70', text: 'text-red-300', border: 'border-red-700' },
  steady:   { bg: 'bg-amber-900/50', text: 'text-amber-300', border: 'border-amber-700' },
  clearing: { bg: 'bg-emerald-900/50', text: 'text-emerald-300', border: 'border-emerald-700' },
  empty:    { bg: 'bg-[#111827]', text: 'text-gray-600', border: 'border-gray-800' },
}

function computeEmailQueue(hours, emailCov, emailForecast, day, startingQueue) {
  let queue = startingQueue
  const queueByHour = {}
  for (const h of hours) {
    const incoming = emailForecast?.[day]?.[h] || 0
    const agentsOn = emailCov[h] || 0
    const capacity = agentsOn * AVG_EMAILS_PER_AGENT_HOUR
    queue = Math.max(0, queue + incoming - capacity)
    queueByHour[h] = { queue: Math.round(queue), incoming, capacity, agentsOn }
  }
  return queueByHour
}

export function CoverageBar({ phoneCov, emailCov, phoneForecast, emailForecast, day, handleRate }) {
  const [liveQueue, setLiveQueue] = useState(null)
  const [fetchedAt, setFetchedAt] = useState(null)
  const [loading, setLoading] = useState(false)

  const fetchLiveQueue = async () => {
    setLoading(true)
    try {
      const res = await fetch(
        `${SUPABASE_URL}/functions/v1/gorgias-queue`,
        { headers: { 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` } }
      )
      const data = await res.json()
      if (data.openEmailTickets !== undefined) {
        setLiveQueue(data.openEmailTickets)
        setFetchedAt(new Date(data.fetchedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }))
      }
    } catch (err) {
      console.error('Failed to fetch live queue:', err)
    } finally {
      setLoading(false)
    }
  }

  const hours = Array.from({ length: WORK_END - WORK_START }, (_, i) => i + WORK_START)
  const startingQueue = liveQueue ?? 0
  const queueByHour = computeEmailQueue(hours, emailCov, emailForecast, day, startingQueue)

  return (
    <div className="space-y-2">

      {/* Live queue fetch */}
      <div className="flex items-center gap-3 mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">Live email queue:</span>
          {liveQueue !== null ? (
            <span className={`text-sm font-mono font-medium ${liveQueue > 20 ? 'text-red-400' : liveQueue > 10 ? 'text-amber-400' : 'text-emerald-400'}`}>
              {liveQueue} open tickets
            </span>
          ) : (
            <span className="text-xs text-gray-600 font-mono">not fetched yet</span>
          )}
          {fetchedAt && <span className="text-[10px] text-gray-600">as of {fetchedAt}</span>}
        </div>
        <button
          onClick={fetchLiveQueue}
          disabled={loading}
          className="flex items-center gap-1.5 px-2.5 py-1 text-xs bg-[#1A1F2E] hover:bg-[#2A3245] text-gray-300 hover:text-white rounded-lg transition-colors disabled:opacity-40"
        >
          <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
          {loading ? 'Fetching...' : 'Refresh'}
        </button>
      </div>

      {/* Phone SLA row */}
      <div className="flex items-center gap-1">
        <span className="text-[10px] text-gray-500 w-14 text-right shrink-0 font-mono">PHONE %</span>
        <div className="flex gap-0.5 flex-1">
          {hours.map(h => {
            const inPhone = h >= PHONE_START && h < PHONE_END
            if (!inPhone) {
              return (
                <div key={h} className="flex-1 h-7 rounded bg-[#0C0F14] border border-[#1A1F2E] flex items-center justify-center">
                  <span className="text-[9px] text-gray-700">–</span>
                </div>
              )
            }
            const n = phoneCov[h] || 0
            const vol = phoneForecast?.[day]?.[h] || 0
            const gap = getPhoneGap(n, vol)
            const rate = phoneAnswerRate(n, vol)
            const needed = agentsNeededPhone(vol)
            const c = GAP_COLORS[gap]
            return (
              <div
                key={h}
                title={`${hLabel(h)} [${gap.toUpperCase()}]: ${n} agents, ~${vol} calls, ${Math.round(rate*100)}% answer rate. Need ${needed} for 95% SLA.`}
                aria-label={`${hLabel(h)} ${gap}: ${Math.round(rate*100)}% answer rate`}
                className={`flex-1 h-7 rounded border ${c.bg} ${c.border} flex flex-col items-center justify-center cursor-default`}
              >
                <span className={`text-[10px] font-mono font-medium ${c.text}`}>
                  {vol > 0 ? `${c.indicator}${Math.round(rate*100)}%` : '–'}
                </span>
                {vol > 0 && n < needed && (
                  <span className={`text-[8px] ${c.text} opacity-60`}>need {needed}</span>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Phone agents row */}
      <div className="flex items-center gap-1">
        <span className="text-[10px] text-gray-500 w-14 text-right shrink-0 font-mono">PHONES</span>
        <div className="flex gap-0.5 flex-1">
          {hours.map(h => {
            const inPhone = h >= PHONE_START && h < PHONE_END
            if (!inPhone) {
              return (
                <div key={h} className="flex-1 h-7 rounded bg-[#0C0F14] border border-[#1A1F2E] flex items-center justify-center">
                  <span className="text-[9px] text-gray-700">–</span>
                </div>
              )
            }
            const n = phoneCov[h] || 0
            const vol = phoneForecast?.[day]?.[h] || 0
            const gap = getPhoneGap(n, vol)
            const c = GAP_COLORS[gap]
            return (
              <div
                key={h}
                title={`${hLabel(h)}: ${n} agents on phones, ~${vol} calls expected`}
                className={`flex-1 h-7 rounded border ${c.bg} ${c.border} flex flex-col items-center justify-center cursor-default`}
              >
                <span className={`text-[10px] font-mono font-medium ${c.text}`}>{n}</span>
                {vol > 0 && <span className={`text-[8px] ${c.text} opacity-60`}>{vol}c</span>}
              </div>
            )
          })}
        </div>
      </div>

      {/* Email SLA row */}
      <div className="flex items-center gap-1">
        <span className="text-[10px] text-gray-500 w-14 text-right shrink-0 font-mono">EMAIL %</span>
        <div className="flex gap-0.5 flex-1">
          {hours.map(h => {
            const n = emailCov[h] || 0
            const vol = emailForecast?.[day]?.[h] || 0
            const gap = getEmailGap(n, vol)
            const rate = emailAnswerRate(n, vol)
            const needed = agentsNeededEmail(vol, handleRate ?? undefined)
            const c = GAP_COLORS[gap]
            return (
              <div
                key={h}
                title={`${hLabel(h)} [${gap.toUpperCase()}]: ${n} agents, ~${vol} tickets, ${Math.round(rate*100)}% coverage. Need ${needed} for 95% SLA.`}
                aria-label={`${hLabel(h)} ${gap}: ${Math.round(rate*100)}% coverage`}
                className={`flex-1 h-7 rounded border ${c.bg} ${c.border} flex flex-col items-center justify-center cursor-default`}
              >
                <span className={`text-[10px] font-mono font-medium ${c.text}`}>
                  {vol > 0 ? `${c.indicator}${Math.round(rate*100)}%` : '–'}
                </span>
                {vol > 0 && n < needed && (
                  <span className={`text-[8px] ${c.text} opacity-60`}>need {needed}</span>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Email queue row */}
      <div className="flex items-center gap-1">
        <span className="text-[10px] text-gray-500 w-14 text-right shrink-0 font-mono">EMAIL Q</span>
        <div className="flex gap-0.5 flex-1">
          {hours.map(h => {
            const { queue, incoming, capacity, agentsOn } = queueByHour[h] || {}
            const prevQueue = h > WORK_START ? (queueByHour[h-1]?.queue || 0) : startingQueue
            let status = 'empty'
            if (agentsOn === 0 && incoming > 0) status = 'growing'
            else if (queue > prevQueue) status = 'growing'
            else if (queue > 0 && queue <= prevQueue) status = 'clearing'
            else if (queue === 0 && agentsOn > 0) status = 'clearing'
            else status = 'empty'
            const c = QUEUE_COLORS[status]
            return (
              <div
                key={h}
                title={`${hLabel(h)}: ${agentsOn} on email, ${incoming} incoming, queue: ${queue}`}
                className={`flex-1 h-7 rounded border ${c.bg} ${c.border} flex flex-col items-center justify-center cursor-default`}
              >
                <span className={`text-[10px] font-mono font-medium ${c.text}`}>
                  {queue > 0 ? `${queue}` : agentsOn > 0 ? '✓' : '–'}
                </span>
                {queue > 0 && <span className={`text-[8px] ${c.text} opacity-60`}>queued</span>}
              </div>
            )
          })}
        </div>
      </div>

      {/* Email agents row */}
      <div className="flex items-center gap-1">
        <span className="text-[10px] text-gray-500 w-14 text-right shrink-0 font-mono">EMAIL</span>
        <div className="flex gap-0.5 flex-1">
          {hours.map(h => {
            const n = emailCov[h] || 0
            const vol = emailForecast?.[day]?.[h] || 0
            const gap = getEmailGap(n, vol)
            const c = GAP_COLORS[gap]
            return (
              <div
                key={h}
                title={`${hLabel(h)}: ${n} on email, ~${vol} tickets expected`}
                className={`flex-1 h-7 rounded border ${c.bg} ${c.border} flex flex-col items-center justify-center cursor-default`}
              >
                <span className={`text-[10px] font-mono font-medium ${c.text}`}>{n > 0 ? n : ''}</span>
                {vol > 0 && n > 0 && <span className={`text-[8px] ${c.text} opacity-60`}>{vol}t</span>}
              </div>
            )
          })}
        </div>
      </div>

      {/* Hour labels */}
      <div className="flex items-center gap-1">
        <span className="w-14 shrink-0" />
        <div className="flex gap-0.5 flex-1">
          {hours.map(h => (
            <div key={h} className="flex-1 text-center">
              <span className={`text-[9px] font-mono ${h >= PHONE_START && h < PHONE_END ? 'text-blue-400' : 'text-gray-700'}`}>
                {hLabel(h)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
