import { hLabel, PHONE_START, PHONE_END, WORK_START, WORK_END } from '../lib/forecast'

const CELL_STYLES = {
  phone: 'cell-phone',
  email: 'cell-email',
  lunch: 'cell-lunch',
  off:   'cell-off',
  null:  'cell-empty',
}

const CELL_LABELS = {
  phone: 'P',
  email: 'E',
  lunch: 'L',
  off:   '–',
}

function cycleActivity(current, agentRole) {
  const allowed = agentRole === 'email'
    ? ['email', 'lunch', 'off', null]
    : ['phone', 'email', 'lunch', 'off', null]
  const idx = allowed.indexOf(current ?? null)
  return allowed[(idx + 1) % allowed.length]
}

export function ScheduleGrid({ agents, daySlots, day, onUpdateSlot }) {
  const hours = Array.from({ length: WORK_END - WORK_START }, (_, i) => i + WORK_START)

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse" style={{ minWidth: `${160 + hours.length * 36 + 120}px` }}>
        <thead>
          <tr>
            <th className="text-left pb-2 pr-3 w-28">
              <span className="text-[10px] text-gray-600 font-medium uppercase tracking-wider">Agent</span>
            </th>
            {hours.map(h => {
              const inPhone = h >= PHONE_START && h < PHONE_END
              return (
                <th key={h} className="pb-2 px-0.5 text-center w-9">
                  <span className={`text-[9px] font-mono block ${inPhone ? 'text-blue-400 font-medium' : 'text-gray-700'}`}>
                    {hLabel(h).replace('am','a').replace('pm','p')}
                  </span>
                </th>
              )
            })}
            <th className="pb-2 pl-3 text-center w-14">
              <span className="text-[9px] text-emerald-600 font-mono uppercase tracking-wider">Phone</span>
            </th>
            <th className="pb-2 px-1 text-center w-14">
              <span className="text-[9px] text-blue-500 font-mono uppercase tracking-wider">Email</span>
            </th>
            <th className="pb-2 px-1 text-center w-14">
              <span className="text-[9px] text-gray-600 font-mono uppercase tracking-wider">Total</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {agents.map((agent, agentIdx) => {
            const slots = daySlots[agent.id] || {}
            const isOff = slots.off
            let phoneHrs = 0, emailHrs = 0
            if (!isOff) {
              hours.forEach(h => {
                if (slots[h] === 'phone') phoneHrs++
                if (slots[h] === 'email') emailHrs++
              })
            }
            const totalHrs = phoneHrs + emailHrs

            return (
              <tr key={agent.id} className={`${agentIdx % 2 === 0 ? '' : 'bg-white/[0.02]'} group`}>
                <td className="pr-3 py-0.5">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white shrink-0"
                      style={{ background: agent.color }}
                    >
                      {agent.name[0]}
                    </div>
                    <span className="text-xs text-gray-300 font-medium truncate">{agent.name}</span>
                  </div>
                </td>
                {hours.map(h => {
                  const inPhone = h >= PHONE_START && h < PHONE_END
                  if (isOff) {
                    return (
                      <td key={h} className={`px-0.5 py-0.5 ${inPhone ? 'bg-blue-950/5' : ''}`}>
                        <div className="h-7 w-full rounded cell-off flex items-center justify-center text-[9px] font-mono opacity-20">
                          {h === hours[Math.floor(hours.length / 2)] ? 'OFF' : ''}
                        </div>
                      </td>
                    )
                  }
                  const activity = slots[h] ?? null
                  return (
                    <td key={h} className={`px-0.5 py-0.5 ${inPhone ? 'bg-blue-950/5' : ''}`}>
                      <button
                        onClick={() => onUpdateSlot(agent.id, h, cycleActivity(activity, agent.role))}
                        title={`${agent.name} ${hLabel(h)} — click to change`}
                        className={`w-full h-7 rounded text-[10px] font-mono font-medium transition-all hover:opacity-75 active:scale-95 ${CELL_STYLES[activity || 'null']}`}
                      >
                        {activity ? CELL_LABELS[activity] : ''}
                      </button>
                    </td>
                  )
                })}
                <td className="pl-3 py-0.5 text-center">
                  <span className={`text-[11px] font-mono font-medium ${phoneHrs > 0 ? 'text-emerald-400' : 'text-gray-700'}`}>
                    {isOff ? '–' : `${phoneHrs}h`}
                  </span>
                </td>
                <td className="px-1 py-0.5 text-center">
                  <span className={`text-[11px] font-mono font-medium ${emailHrs > 0 ? 'text-blue-400' : 'text-gray-700'}`}>
                    {isOff ? '–' : `${emailHrs}h`}
                  </span>
                </td>
                <td className="px-1 py-0.5 text-center">
                  <span className={`text-[11px] font-mono font-medium ${totalHrs > 0 ? 'text-gray-300' : 'text-gray-700'}`}>
                    {isOff ? 'OFF' : `${totalHrs}h`}
                  </span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
