import { hLabel, getPhoneGap, getEmailGap, PHONE_START, PHONE_END, WORK_START, WORK_END, AVG_EMAILS_PER_AGENT_HOUR } from '../lib/forecast'

const GAP_COLORS = {
  critical: { bg: 'bg-red-900/70', text: 'text-red-300', border: 'border-red-700' },
  warn:     { bg: 'bg-amber-900/50', text: 'text-amber-300', border: 'border-amber-700' },
  ok:       { bg: 'bg-emerald-900/50', text: 'text-emerald-300', border: 'border-emerald-700' },
  none:     { bg: 'bg-[#111827]', text: 'text-gray-600', border: 'border-gray-800' },
}

const QUEUE_COLORS = {
  growing:  { bg: 'bg-red-900/70', text: 'text-red-300', border: 'border-red-700' },
  steady:   { bg: 'bg-amber-900/50', text: 'text-amber-300', border: 'border-amber-700' },
  clearing: { bg: 'bg-emerald-900/50', text: 'text-emerald-300', border: 'border-emerald-700' },
  empty:    { bg: 'bg-[#111827]', text: 'text-gray-600', border: 'border-gray-800' },
}

function computeEmailQueue(hours, emailCov, emailForecast, day) {
  // Start with overnight backlog (emails from midnight to WORK_START)
  let queue = 0
  for (let h = 0; h < WORK_START; h++) {
    queue += emailForecast?.[day]?.[h] || 0
  }

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

export function CoverageBar({ phoneCov, emailCov, phoneForecast, emailForecast, day }) {
  const hours = Array.from({ length: WORK_END - WORK_START }, (_, i) => i + WORK_START)
  const queueByHour = computeEmailQueue(hours, emailCov, emailForecast, day)

  return (
    <div className="space-y-1.5">
      {/* Phone coverage row */}
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
                title={`${hLabel(h)}: ${n} agent${n !== 1 ? 's' : ''} on phones, ~${vol} calls expected`}
                className={`flex-1 h-7 rounded border ${c.bg} ${c.border} flex flex-col items-center justify-center cursor-default`}
              >
                <span className={`text-[10px] font-mono font-medium ${c.text}`}>{n}</span>
                {vol > 0 && <span className={`text-[8px] ${c.text} opacity-60`}>{vol}c</span>}
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
            const prevQueue = h > WORK_START ? (queueByHour[h-1]?.queue || 0) : 0
            let status = 'empty'
            if (agentsOn === 0 && incoming > 0) status = 'growing'
            else if (queue > prevQueue) status = 'growing'
            else if (queue > 0 && queue <= prevQueue) status = 'clearing'
            els
