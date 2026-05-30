import { DAYS } from '../lib/forecast'

export function WeeklySummary({ agents, weekSchedule, getAgentWeekHours }) {
  return (
    <div className="bg-[#141922] border border-[#2A3245] rounded-xl overflow-hidden">
      <div className="px-5 py-3 border-b border-[#2A3245]">
        <h3 className="text-sm font-semibold text-white">Weekly Summary</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-[#1A1F2E]">
              <th className="text-left px-4 py-2.5 text-gray-400 font-medium">Agent</th>
              {DAYS.map(d => (
                <th key={d} className="text-center px-2 py-2.5 text-gray-400 font-medium">{d}</th>
              ))}
              <th className="text-center px-3 py-2.5 text-gray-400 font-medium">Total hrs</th>
              <th className="text-center px-3 py-2.5 text-gray-400 font-medium">FTE</th>
            </tr>
          </thead>
          <tbody>
            {agents.map((agent, i) => {
              const totalHrs = getAgentWeekHours(agent.id)
              const fte = (totalHrs / 40).toFixed(2)
              return (
                <tr key={agent.id} className={`border-b border-[#1A1F2E] ${i % 2 === 0 ? '' : 'bg-[#0C0F14]/30'}`}>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="w-3.5 h-3.5 rounded-full" style={{ background: agent.color }} />
                      <span className="text-gray-200 font-medium">{agent.name}</span>
                      <span className="text-gray-600 text-[10px]">{agent.role}</span>
                    </div>
                  </td>
                  {DAYS.map(day => {
                    const slots = weekSchedule[agent.id]?.[day] || {}
                    const isOff = slots.off
                    const hrs = isOff ? 0 : Object.values(slots).filter(a => a !== 'off' && a !== 'lunch').length
                    const phoneHrs = Object.values(slots).filter(a => a === 'phone').length
                    const emailHrs = Object.values(slots).filter(a => a === 'email').length
                    return (
                      <td key={day} className="text-center px-2 py-2.5">
                        {isOff ? (
                          <span className="text-gray-700 font-mono text-[10px]">OFF</span>
                        ) : hrs === 0 ? (
                          <span className="text-gray-700">–</span>
                        ) : (
                          <div className="flex flex-col items-center gap-0.5">
                            <span className="text-gray-300 font-mono">{hrs}h</span>
                            <div className="flex gap-0.5">
                              {phoneHrs > 0 && <span className="text-emerald-500 text-[9px]">{phoneHrs}P</span>}
                              {emailHrs > 0 && <span className="text-blue-400 text-[9px]">{emailHrs}E</span>}
                            </div>
                          </div>
                        )}
                      </td>
                    )
                  })}
                  <td className="text-center px-3 py-2.5">
                    <span className="text-white font-mono font-medium">{totalHrs}h</span>
                  </td>
                  <td className="text-center px-3 py-2.5">
                    <span className="text-gray-400 font-mono text-[11px]">{fte}</span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
