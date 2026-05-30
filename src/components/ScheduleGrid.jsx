import { hLabel, PHONE_START, PHONE_END, WORK_START, WORK_END } from '../lib/forecast'

const ACTIVITIES = ['phone', 'email', 'lunch', 'off']

const CELL_STYLES = {
  phone:  'cell-phone',
  email:  'cell-email',
  lunch:  'cell-lunch',
  off:    'cell-off',
  null:   'cell-empty',
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
    : agentRole === 'phone'
    ? ['phone', 'email', 'lunch', 'off', null]
    : ['phone', 'email', 'lunch', 'off', null]

  const idx = allowed.indexOf(current ?? null)
  return allowed[(idx + 1) % allowed.length]
}

export function ScheduleGrid({ agents, daySlots, day, onUpdateSlot }) {
  const hours = Array.from({ length: WORK_END - WORK_START }, (_, i) => i + WORK_START)

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse" style={{ minWidth: `${50 + agents.length * 56}px` }}>
        <thead>
          <tr>
            <th className="w-14 pb-2" />
            {agents.map(agent => (
              <th key={agent.id} className="pb-2 px-0.5 text-center">
                <div className="flex flex-col items-center gap-1">
                  <div
                    className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white"
                    style={{ background: agent.color }}
                  >
                    {agent.name[0]}
                  </div>
                  <span className="text-[10px] text-gray-400 font-medium leading-none">{agent.name}</span>
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {hours.map(h => {
            const inPhone = h >= PHONE_START && h < PHONE_END
            return (
              <tr key={h} className={inPhone ? 'bg-blue-950/10' : ''}>
                <td className="pr-2 py-0.5">
                  <span className={`text-[10px] font-mono block text-right ${inPhone ? 'text-blue-400' : 'text-gray-600'}`}>
                    {hLabel(h)}
                  </span>
                </td>
                {agents.map(agent => {
                  const slots = daySlots[agent.id] || {}
                  if (slots.off) {
                    return (
                      <td key={agent.id} className="px-0.5 py-0.5">
                        <div className="h-7 rounded cell-off flex items-center justify-center text-[10px] font-mono opacity-40">
                          OFF
                        </div>
                      </td>
                    )
                  }
                  const activity = slots[h] ?? null
                  const styleKey = activity || 'null'
                  return (
                    <td key={agent.id} className="px-0.5 py-0.5">
                      <button
                        onClick={() => {
                          const next = cycleActivity(activity, agent.role)
                          onUpdateSlot(agent.id, h, next)
                        }}
                        title={`Click to cycle: ${ACTIVITIES.join(' → ')}`}
                        className={`w-full h-7 rounded text-[10px] font-mono font-medium transition-all hover:opacity-80 active:scale-95 ${CELL_STYLES[styleKey]}`}
                      >
                        {activity ? CELL_LABELS[activity] : ''}
                      </button>
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
