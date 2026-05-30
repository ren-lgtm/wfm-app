import { hLabel, PHONE_START, PHONE_END, WORK_START, WORK_END, DAYS } from '../lib/forecast'
import { useState } from 'react'

export function ForecastChart({ phoneForecast, emailForecast }) {
  const [channel, setChannel] = useState('phone')
  const [selectedDay, setSelectedDay] = useState('Tue')

  const forecast = channel === 'phone' ? phoneForecast : emailForecast
  const hours = Array.from({ length: WORK_END - WORK_START }, (_, i) => i + WORK_START)
  const dayData = forecast[selectedDay] || {}
  const max = Math.max(...hours.map(h => dayData[h] || 0), 1)

  const weekdays = DAYS.filter(d => !['Sat', 'Sun'].includes(d))

  return (
    <div className="bg-[#141922] border border-[#2A3245] rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-[#2A3245] flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 className="text-sm font-semibold text-white">Volume Forecast</h3>
          <p className="text-xs text-gray-500 mt-0.5">Rolling average from historical data — updates daily</p>
        </div>
        <div className="flex gap-2">
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
      </div>

      <div className="px-5 py-4">
        {/* Day selector */}
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

        {/* Bar chart */}
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

        <div className="mt-3 flex items-center gap-4 text-xs text-gray-500">
          <span className="flex items-center gap-1.5">
            <span className={`w-3 h-3 rounded-sm ${channel === 'phone' ? 'bg-emerald-600' : 'bg-blue-600'}`} />
            Phone hours (12–7pm ET)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-[#2A3245]" />
            Outside phone hours
          </span>
        </div>
      </div>

      {/* Day-of-week comparison */}
      <div className="px-5 pb-5">
        <div className="text-xs text-gray-500 mb-3">Peak hour by day (12pm–7pm ET window)</div>
        <div className="grid grid-cols-5 gap-2">
          {weekdays.map(d => {
            const data = forecast[d] || {}
            const phoneHours = Array.from({ length: 7 }, (_, i) => i + PHONE_START)
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
  )
}
