import { useState } from 'react'
import { hLabel, PHONE_START, PHONE_END, WORK_START, WORK_END, DAYS, AVG_CALLS_PER_AGENT_HOUR } from '../lib/forecast'

const SLA_TIERS = [
  { label: '50% SLA', target: 0.50, color: '#BA7517' },
  { label: '75% SLA', target: 0.75, color: '#378ADD' },
  { label: '95% SLA', target: 0.95, color: '#1D9E75' },
]

function agentsNeeded(calls, target) {
  return Math.ceil((calls * target) / AVG_CALLS_PER_AGENT_HOUR)
}

function slaColor(pct) {
  if (pct >= 60) return '#1D9E75'
  if (pct >= 40) return '#BA7517'
  return '#E24B4A'
}

export function ForecastChart({ phoneForecast, emailForecast, slaData }) {
  const [channel, setChannel] = useState('phone')
  const [selectedDay, setSelectedDay] = useState('Tue')
  const [activeSection, setActiveSection] = useState('volume')

  const forecast = channel === 'phone' ? phoneForecast : emailForecast
  const hours = Array.from({ length: WORK_END - WORK_START }, (_, i) => i + WORK_START)
  const phoneHours = Array.from({ length: PHONE_END - PHONE_START }, (_, i) => i + PHONE_START)
  const weekdays = DAYS.filter(d => !['Sat', 'Sun'].includes(d))
  const dayData = forecast[selectedDay] || {}
  const max = Math.max(...hours.map(h => dayData[h] || 0), 1)

  // Compute overall SLA from live DB data
  const totalAnswered = Object.values(slaData.byDay).reduce((s, d) => s + d.answered, 0)
  const totalMissed = Object.values(slaData.byDay).reduce((s, d) => s + d.missed, 0)
  const totalCalls = totalAnswered + totalMissed
  const overallSLA = totalCalls ? Math.round((totalAnswered / totalCalls) * 100) : 0

  const hourTotalAnswered = Object.values(slaData.byHour).reduce((s, d) => s + d.answered, 0)
  const hourTotalMissed = Object.values(slaData.byHour).reduce((s, d) => s + d.missed, 0)

  return (
    <div className="space-y-6">

      {/* Section tabs */}
      <div className="flex gap-2">
        {[
          { id: 'volume', label: 'Volume forecast' },
          { id: 'baseline', label: 'Historical SLA' },
          { id: 'targets', label: 'Staffing targets' },
        ].map(s => (
          <button
            key={s.id}
            onClick={() => setActiveSection(s.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors border ${
              activeSection === s.id
                ? 'bg-[#2A3245] border-[#3D4A6B] text-white'
                : 'bg-[#141922] border-[#2A3245] text-gray-400 hover:text-white'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* ── VOLUME FORECAST ── */}
      {activeSection === 'volume' && (
        <div className="bg-[#141922] border border-[#2A3245] rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-[#2A3245] flex items-center justify-between flex-wrap gap-3">
            <div>
              <h3 className="text-sm font-semibold text-white">Volume forecast</h3>
              <p className="text-xs text-gray-500 mt-0.5">Rolling average from historical data — updates daily</p>
            </div>
            <div className="flex rounded-lg overflow-hidden border border-[#2A3245]">
              {['phone', 'email'].map(ch => (
                <button
                  key={ch}
                  onClick={() => setChannel(ch)}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors ${channel === ch ? (ch === 'phone' ? 'bg-emerald-900 text-emerald-300' : 'bg-blue-900 text-blue-300') : 'text-gray-500 hover:text-gray-300'}`}
                >
                  {ch === 'phone' ? '📞 Calls' : '✉ Email'}
                </button>
              ))}
            </div>
          </div>

          <div className="px-5 py-4">
            <div className="flex gap-1.5 mb-5">
              {weekdays.map(d => (
                <button
                  key={d}
                  onClick={() => setSelectedDay(d)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${selectedDay === d ? 'bg-[#2A3245] text-white' : 'text-gray-500 hover:text-gray-300'}`}
                >
                  {d}
                </button>
              ))}
            </div>

            <div className="flex items-end gap-0.5 h-32">
              {hours.map(h => {
                const val = dayData[h] || 0
                const pct = Math.round((val / max) * 100)
                const inPhone = h >= PHONE_START && h < PHONE_END
                return (
                  <div key={h} className="flex-1 flex flex-col items-center gap-1" title={`${hLabel(h)}: ${val} ${channel === 'phone' ? 'calls' : 'tickets'}`}>
                    <div className="w-full flex flex-col justify-end" style={{ height: '100px' }}>
                      <div
                        className={`w-full rounded-t transition-all ${inPhone ? (channel === 'phone' ? 'bg-emerald-600' : 'bg-blue-600') : 'bg-[#2A3245]'}`}
                        style={{ height: `${pct}%`, minHeight: val > 0 ? '2px' : '0' }}
                      />
                    </div>
                    <span className={`text-[8px] font-mono ${inPhone ? (channel === 'phone' ? 'text-emerald-500' : 'text-blue-400') : 'text-gray-700'}`}>
                      {hLabel(h).replace('am', '').replace('pm', '')}
                    </span>
                  </div>
                )
              })}
            </div>

            <div className="mt-4 grid grid-cols-5 gap-2">
              {weekdays.map(d => {
                const data = forecast[d] || {}
                const peak = Math.max(...phoneHours.map(h => data[h] || 0))
                const peakH = phoneHours.find(h => data[h] === peak)
                return (
                  <div key={d} className="bg-[#0C0F14] rounded-lg p-2.5 text-center">
                    <div className="text-[10px] text-gray-500 mb-1">{d}</div>
                    <div className={`text-base font-mono font-semibold ${channel === 'phone' ? 'text-emerald-400' : 'text-blue-400'}`}>{peak}</div>
                    <div className="text-[9px] text-gray-600 mt-0.5">{peakH !== undefined ? hLabel(peakH) : '—'}</div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── HISTORICAL SLA ── */}
      {activeSection === 'baseline' && (
        <div className="bg-[#141922] border border-[#2A3245] rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-[#2A3245] flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-white">Historical SLA baseline</h3>
              <p className="text-xs text-gray-500 mt-0.5">Live from DB · phone hours only (12–7pm ET) · updates daily</p>
            </div>
            <span className="text-[10px] text-emerald-500 font-mono">● live</span>
          </div>

          <div className="px-5 py-4 space-y-6">

            {totalCalls === 0 ? (
              <div className="text-center py-10 text-gray-600 font-mono text-sm">No SLA data loaded yet</div>
            ) : (
              <>
                {/* Headline */}
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-[#0C0F14] rounded-xl p-4 text-center">
                    <div className="text-xs text-gray-500 mb-2">Overall answer rate</div>
                    <div className="text-3xl font-mono font-medium" style={{ color: slaColor(overallSLA) }}>{overallSLA}%</div>
                    <div className="text-[10px] text-gray-600 mt-1">target: 95%</div>
                  </div>
                  <div className="bg-[#0C0F14] rounded-xl p-4 text-center">
                    <div className="text-xs text-gray-500 mb-2">Calls answered</div>
                    <div className="text-3xl font-mono font-medium text-emerald-400">{totalAnswered.toLocaleString()}</div>
                    <div className="text-[10px] text-gray-600 mt-1">of {totalCalls.toLocaleString()} total</div>
                  </div>
                  <div className="bg-[#0C0F14] rounded-xl p-4 text-center">
                    <div className="text-xs text-gray-500 mb-2">Calls missed</div>
                    <div className="text-3xl font-mono font-medium text-red-400">{totalMissed.toLocaleString()}</div>
                    <div className="text-[10px] text-gray-600 mt-1">{totalCalls ? Math.round(totalMissed/totalCalls*100) : 0}% miss rate</div>
                  </div>
                </div>

                {/* By day */}
                <div>
                  <div className="text-xs text-gray-500 font-medium uppercase tracking-wider mb-3">Answer rate by day</div>
                  <div className="grid grid-cols-5 gap-3">
                    {weekdays.map(day => {
                      const d = slaData.byDay[day]
                      if (!d) return (
                        <div key={day} className="bg-[#0C0F14] rounded-lg p-3 text-center">
                          <div className="text-[10px] text-gray-500 mb-2">{day}</div>
                          <div className="text-xl font-mono font-medium text-gray-700">–</div>
                        </div>
                      )
                      const total = d.answered + d.missed
                      const pct = Math.round(d.answered / total * 100)
                      const color = slaColor(pct)
                      return (
                        <div key={day} className="bg-[#0C0F14] rounded-lg p-3">
                          <div className="text-[10px] text-gray-500 mb-2">{day}</div>
                          <div className="text-xl font-mono font-medium mb-2" style={{ color }}>{pct}%</div>
                          <div className="w-full bg-[#1A1F2E] rounded-full h-1.5 mb-1">
                            <div className="h-1.5 rounded-full" style={{ width: `${pct}%`, background: color }} />
                          </div>
                          <div className="text-[9px] text-gray-600">{d.answered}/{total}</div>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* By hour */}
                <div>
                  <div className="text-xs text-gray-500 font-medium uppercase tracking-wider mb-3">Answer rate by hour</div>
                  <div className="grid grid-cols-7 gap-2">
                    {phoneHours.map(h => {
                      const d = slaData.byHour[h]
                      if (!d) return (
                        <div key={h} className="bg-[#0C0F14] rounded-lg p-3 text-center">
                          <div className="text-[10px] text-gray-500 mb-2">{hLabel(h)}</div>
                          <div className="text-lg font-mono font-medium text-gray-700">–</div>
                        </div>
                      )
                      const total = d.answered + d.missed
                      const pct = Math.round(d.answered / total * 100)
                      const color = slaColor(pct)
                      return (
                        <div key={h} className="bg-[#0C0F14] rounded-lg p-3 text-center">
                          <div className="text-[10px] text-gray-500 mb-2">{hLabel(h)}</div>
                          <div className="text-lg font-mono font-medium mb-2" style={{ color }}>{pct}%</div>
                          <div className="w-full bg-[#1A1F2E] rounded-full h-1.5 mb-1">
                            <div className="h-1.5 rounded-full" style={{ width: `${pct}%`, background: color }} />
                          </div>
                          <div className="text-[9px] text-gray-600">{d.answered}/{total}</div>
                        </div>
                      )
                    })}
                  </div>
                </div>

                <div className="bg-red-900/20 border border-red-900/40 rounded-lg px-4 py-3 text-xs text-red-300 leading-relaxed">
                  {(() => {
                    const worstDay = weekdays.reduce((worst, day) => {
                      const d = slaData.byDay[day]
                      if (!d) return worst
                      const pct = Math.round(d.answered / (d.answered + d.missed) * 100)
                      return (!worst || pct < worst.pct) ? { day, pct, ...d } : worst
                    }, null)
                    const worstHour = phoneHours.reduce((worst, h) => {
                      const d = slaData.byHour[h]
                      if (!d) return worst
                      const pct = Math.round(d.answered / (d.answered + d.missed) * 100)
                      return (!worst || pct < worst.pct) ? { h, pct, ...d } : worst
                    }, null)
                    if (!worstDay || !worstHour) return 'Loading analysis...'
                    return `Worst day: ${worstDay.day} at ${worstDay.pct}% answer rate (${worstDay.answered} answered, ${worstDay.missed} missed). Worst hour: ${hLabel(worstHour.h)} at ${worstHour.pct}% (${worstHour.answered} answered, ${worstHour.missed} missed). Both are staffing gaps — volume is consistent across the week.`
                  })()}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── STAFFING TARGETS ── */}
      {activeSection === 'targets' && (
        <div className="bg-[#141922] border border-[#2A3245] rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-[#2A3245]">
            <h3 className="text-sm font-semibold text-white">Staffing targets</h3>
            <p className="text-xs text-gray-500 mt-0.5">Agents needed per hour to hit each SLA tier · based on forecast volume · 7 calls/hr per agent</p>
          </div>

          <div className="px-5 py-4 space-y-6">
            <div className="flex gap-4 flex-wrap">
              {SLA_TIERS.map(t => (
                <div key={t.label} className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-sm" style={{ background: t.color }} />
                  <span className="text-xs text-gray-400">{t.label}</span>
                </div>
              ))}
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-sm bg-[#2A3245]" />
                <span className="text-xs text-gray-400">Current max (4 agents)</span>
              </div>
            </div>

            {weekdays.map(day => {
              const dayForecast = phoneForecast[day] || {}
              return (
                <div key={day}>
                  <div className="text-xs text-gray-500 font-medium uppercase tracking-wider mb-2">{day}</div>
                  <div className="flex gap-0.5">
                    {phoneHours.map(h => {
                      const vol = dayForecast[h] || 0
                      const current = 4
                      const tiers = SLA_TIERS.map(t => ({
                        ...t,
                        needed: agentsNeeded(vol, t.target)
                      }))
                      const maxNeeded = Math.max(...tiers.map(t => t.needed), current)
                      return (
                        <div
                          key={h}
                          className="flex-1 bg-[#0C0F14] rounded p-2"
                          title={`${hLabel(h)}: ${vol} calls. 50%→${tiers[0].needed}, 75%→${tiers[1].needed}, 95%→${tiers[2].needed} agents`}
                        >
                          <div className="text-[9px] text-gray-600 mb-1.5 text-center">{hLabel(h)}</div>
                          <div className="flex flex-col gap-0.5" style={{ height: '60px', justifyContent: 'flex-end' }}>
                            {tiers.map(t => (
                              <div
                                key={t.label}
                                className="w-full rounded-sm flex items-center justify-center"
                                style={{
                                  height: `${Math.max(14, Math.round((t.needed / (maxNeeded + 2)) * 60))}px`,
                                  background: t.color,
                                  opacity: 0.8,
                                }}
                              >
                                <span className="text-[8px] font-mono font-medium text-white">{t.needed}</span>
                              </div>
                            ))}
                            <div className="w-full rounded-sm flex items-center justify-center bg-[#2A3245]" style={{ height: '14px' }}>
                              <span className="text-[8px] font-mono text-gray-400">{current}</span>
                            </div>
                          </div>
                          <div className="text-[8px] text-gray-700 text-center mt-1">{vol}c</div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}

            <div className="bg-[#0C0F14] rounded-lg px-4 py-3 text-xs text-gray-400 leading-relaxed">
              Each bar shows agents needed to hit that SLA tier. Gray = current max (4 agents). The gap between gray and amber is your immediate hire target for 50% SLA.
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
