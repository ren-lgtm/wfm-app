import { useState, useMemo } from 'react'
import { ChevronLeft, ChevronRight, Copy, Plus, Users, BarChart2, Calendar } from 'lucide-react'
import { useSchedule } from '../hooks/useSchedule'
import { ScheduleGrid } from '../components/ScheduleGrid'
import { CoverageBar } from '../components/CoverageBar'
import { WeeklySummary } from '../components/WeeklySummary'
import { ForecastChart } from '../components/ForecastChart'
import { AgentModal } from '../components/AgentModal'
import { GapBadge } from '../components/GapBadge'
import {
  DAYS, formatWeekLabel, computeCoverage,
  getPhoneGap, getEmailGap, PHONE_START, PHONE_END,
  estimateWeeklySLA
} from '../lib/forecast'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']

export default function SchedulePage() {
  const {
    agents, currentMonday, weekSchedule, forecast, slaData, loading, saving,
    updateSlot, markOff, copyLastWeek, addAgent, updateAgent, deactivateAgent,
    goNextWeek, goPrevWeek, getSlots, getAgentWeekHours
  } = useSchedule()

  const [activeDay, setActiveDay] = useState('Mon')
  const [activeTab, setActiveTab] = useState('schedule')
  const [agentModal, setAgentModal] = useState(null)
  const [copyMsg, setCopyMsg] = useState('')

  const daySlots = useMemo(() => {
    const slots = {}
    for (const agent of agents) {
      slots[agent.id] = weekSchedule[agent.id]?.[activeDay] || {}
    }
    return slots
  }, [agents, weekSchedule, activeDay])

  const { phoneCov, emailCov } = useMemo(() => {
    const agentDaySlots = {}
    for (const agent of agents) {
      agentDaySlots[agent.id] = weekSchedule[agent.id]?.[activeDay] || {}
    }
    return computeCoverage(agentDaySlots)
  }, [agents, weekSchedule, activeDay])

  // Weekly SLA estimate
  const weeklySLA = useMemo(() => {
    if (!agents.length || !forecast.phoneForecast) return null
    return estimateWeeklySLA(weekSchedule, agents, forecast.phoneForecast, forecast.emailForecast)
  }, [agents, weekSchedule, forecast])

  const dayGaps = useMemo(() => {
    const gaps = {}
    for (const day of WEEKDAYS) {
      const agentDaySlots = {}
      for (const agent of agents) {
        agentDaySlots[agent.id] = weekSchedule[agent.id]?.[day] || {}
      }
      const { phoneCov: pc, emailCov: ec } = computeCoverage(agentDaySlots)
      let worst = 'ok'
      for (let h = PHONE_START; h < PHONE_END; h++) {
        const pg = getPhoneGap(pc[h] || 0, forecast.phoneForecast[day]?.[h] || 0)
        const eg = getEmailGap(ec[h] || 0, forecast.emailForecast[day]?.[h] || 0)
        if (pg === 'critical' || eg === 'critical') { worst = 'critical'; break }
        if (pg === 'warn' || eg === 'warn') worst = 'warn'
      }
      gaps[day] = worst
    }
    return gaps
  }, [agents, weekSchedule, forecast])

  const handleCopyLastWeek = async () => {
    const ok = await copyLastWeek()
    setCopyMsg(ok ? 'Copied!' : 'No previous week found')
    setTimeout(() => setCopyMsg(''), 2500)
  }

  const handleSaveAgent = async (form) => {
    if (agentModal === 'new') await addAgent(form)
    else await updateAgent(agentModal.id, form)
    setAgentModal(null)
  }

  const gapDot = { critical: 'bg-red-500', warn: 'bg-amber-500', ok: 'bg-emerald-500', none: 'bg-gray-600' }

  const slaColor = (pct) => pct >= 80 ? 'text-emerald-400' : pct >= 50 ? 'text-amber-400' : 'text-red-400'

  return (
    <div className="min-h-screen bg-[#0C0F14] text-gray-200">
      {/* Header */}
      <header className="border-b border-[#1A1F2E] px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold text-sm">W</div>
          <div>
            <h1 className="text-sm font-semibold text-white leading-none">WFM</h1>
            <p className="text-[10px] text-gray-500 mt-0.5">CX Staffing</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={goPrevWeek} className="p-1.5 rounded-lg hover:bg-[#1A1F2E] text-gray-400 hover:text-white transition-colors">
            <ChevronLeft size={16} />
          </button>
          <span className="text-sm font-medium text-white font-mono px-2">{formatWeekLabel(currentMonday)}</span>
          <button onClick={goNextWeek} className="p-1.5 rounded-lg hover:bg-[#1A1F2E] text-gray-400 hover:text-white transition-colors">
            <ChevronRight size={16} />
          </button>
        </div>

        <div className="flex items-center gap-2">
          {saving && <span className="text-xs text-gray-500 font-mono">saving…</span>}
          {copyMsg && <span className="text-xs text-emerald-400 font-mono">{copyMsg}</span>}
          <button
            onClick={handleCopyLastWeek}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-[#1A1F2E] hover:bg-[#2A3245] text-gray-300 hover:text-white transition-colors"
          >
            <Copy size={13} /> Copy last week
          </button>
        </div>
      </header>

      {/* Tab nav */}
      <div className="border-b border-[#1A1F2E] px-6">
        <div className="flex gap-0">
          {[
            { id: 'schedule', icon: Calendar, label: 'Schedule' },
            { id: 'forecast', icon: BarChart2, label: 'Forecast' },
            { id: 'agents', icon: Users, label: 'Agents' },
          ].map(({ id, icon: Icon, label }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex items-center gap-1.5 px-4 py-3 text-sm border-b-2 transition-colors ${activeTab === id ? 'border-blue-500 text-blue-400' : 'border-transparent text-gray-500 hover:text-gray-300'}`}
            >
              <Icon size={14} /> {label}
            </button>
          ))}
        </div>
      </div>

      <main className="p-6 space-y-6 max-w-[1400px] mx-auto">

        {activeTab === 'schedule' && (
          <>
            {/* Weekly SLA cards */}
            {weeklySLA && (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <div className="bg-[#141922] border border-[#2A3245] rounded-xl p-4">
                  <div className="text-xs text-gray-500 mb-1">Est. phone SLA this week</div>
                  <div className={`text-2xl font-mono font-medium ${slaColor(weeklySLA.phoneSLA)}`}>
                    {weeklySLA.phoneSLA}%
                  </div>
                  <div className="text-[10px] text-gray-600 mt-1">target: 95%</div>
                </div>
                <div className="bg-[#141922] border border-[#2A3245] rounded-xl p-4">
                  <div className="text-xs text-gray-500 mb-1">Est. email SLA this week</div>
                  <div className={`text-2xl font-mono font-medium ${slaColor(weeklySLA.emailSLA)}`}>
                    {weeklySLA.emailSLA}%
                  </div>
                  <div className="text-[10px] text-gray-600 mt-1">target: 95%</div>
                </div>
                <div className="bg-[#141922] border border-[#2A3245] rounded-xl p-4">
                  <div className="text-xs text-gray-500 mb-1">Calls covered / expected</div>
                  <div className="text-2xl font-mono font-medium text-gray-300">
                    {weeklySLA.phoneTotalAnswered.toLocaleString()}
                  </div>
                  <div className="text-[10px] text-gray-600 mt-1">of {weeklySLA.phoneTotalExpected.toLocaleString()} expected</div>
                </div>
                <div className="bg-[#141922] border border-[#2A3245] rounded-xl p-4">
                  <div className="text-xs text-gray-500 mb-1">Emails covered / expected</div>
                  <div className="text-2xl font-mono font-medium text-gray-300">
                    {weeklySLA.emailTotalAnswered.toLocaleString()}
                  </div>
                  <div className="text-[10px] text-gray-600 mt-1">of {weeklySLA.emailTotalExpected.toLocaleString()} expected</div>
                </div>
              </div>
            )}

            {/* Day tabs */}
            <div className="flex gap-2 flex-wrap">
              {WEEKDAYS.map(day => {
                const gap = dayGaps[day] || 'ok'
                return (
                  <button
                    key={day}
                    onClick={() => setActiveDay(day)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all border ${
                      activeDay === day
                        ? 'bg-[#2A3245] border-[#3D4A6B] text-white'
                        : 'bg-[#141922] border-[#2A3245] text-gray-400 hover:text-white hover:border-[#3D4A6B]'
                    }`}
                  >
                    {day}
                    <span className={`w-1.5 h-1.5 rounded-full ${gapDot[gap]}`} />
                  </button>
                )
              })}
            </div>

            {loading ? (
              <div className="text-center py-20 text-gray-600 font-mono text-sm">Loading schedule…</div>
            ) : (
              <>
                {/* Schedule grid */}
                <div className="bg-[#141922] border border-[#2A3245] rounded-xl p-5">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h2 className="text-sm font-semibold text-white">{activeDay} Schedule</h2>
                      <p className="text-xs text-gray-500 mt-0.5">Click any cell to cycle: Phone → Email → Lunch → Off → Empty</p>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-gray-500">
                      <span className="flex items-center gap-1.5"><span className="w-3 h-2 rounded cell-phone inline-block" /> Phone</span>
                      <span className="flex items-center gap-1.5"><span className="w-3 h-2 rounded cell-email inline-block" /> Email</span>
                      <span className="flex items-center gap-1.5"><span className="w-3 h-2 rounded cell-lunch inline-block" /> Lunch</span>
                    </div>
                  </div>
                  <ScheduleGrid
                    agents={agents}
                    daySlots={daySlots}
                    day={activeDay}
                    onUpdateSlot={(agentId, hour, activity) => updateSlot(agentId, activeDay, hour, activity)}
                  />
                </div>

                {/* Coverage bar */}
                <div className="bg-[#141922] border border-[#2A3245] rounded-xl p-5">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h2 className="text-sm font-semibold text-white">Coverage Analysis</h2>
                      <p className="text-xs text-gray-500 mt-0.5">
                        SLA % = estimated calls/emails handled ÷ expected volume. Target: 95%.
                        Hover any cell for detail.
                      </p>
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      <GapBadge status="ok">≥80%</GapBadge>
                      <GapBadge status="warn">50–80%</GapBadge>
                      <GapBadge status="critical">&lt;50%</GapBadge>
                    </div>
                  </div>
                  <CoverageBar
                    phoneCov={phoneCov}
                    emailCov={emailCov}
                    phoneForecast={forecast.phoneForecast}
                    emailForecast={forecast.emailForecast}
                    day={activeDay}
                  />
                </div>

                {/* Weekly summary */}
                <WeeklySummary
                  agents={agents}
                  weekSchedule={weekSchedule}
                  getAgentWeekHours={getAgentWeekHours}
                />
              </>
            )}
          </>
        )}

        {activeTab === 'forecast' && (
          <ForecastChart
            phoneForecast={forecast.phoneForecast}
            emailForecast={forecast.emailForecast}
            slaData={slaData}
          />
        )}

        {activeTab === 'agents' && (
          <div className="bg-[#141922] border border-[#2A3245] rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-[#2A3245] flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white">Agent Roster</h2>
              <button
                onClick={() => setAgentModal('new')}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors font-medium"
              >
                <Plus size={13} /> Add agent
              </button>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#1A1F2E] text-xs text-gray-500">
                  <th className="text-left px-5 py-3 font-medium">Name</th>
                  <th className="text-left px-3 py-3 font-medium">Role</th>
                  <th className="text-left px-3 py-3 font-medium">Default channel</th>
                  <th className="text-right px-5 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {agents.map((agent, i) => (
                  <tr key={agent.id} className={`border-b border-[#1A1F2E] ${i % 2 === 0 ? '' : 'bg-[#0C0F14]/30'}`}>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white" style={{ background: agent.color }}>
                          {agent.name[0]}
                        </div>
                        <span className="text-gray-200 font-medium">{agent.name}</span>
                        {agent.email && <span className="text-gray-600 text-xs">{agent.email}</span>}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-gray-400 text-xs capitalize">{agent.role}</td>
                    <td className="px-3 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded font-medium ${agent.default_channel === 'phone' ? 'bg-emerald-900/50 text-emerald-400' : 'bg-blue-900/50 text-blue-400'}`}>
                        {agent.default_channel}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <button
                        onClick={() => setAgentModal(agent)}
                        className="text-xs text-gray-500 hover:text-white transition-colors mr-3"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => { if (confirm(`Remove ${agent.name}?`)) deactivateAgent(agent.id) }}
                        className="text-xs text-red-600 hover:text-red-400 transition-colors"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {agentModal && (
        <AgentModal
          agent={agentModal === 'new' ? null : agentModal}
          onSave={handleSaveAgent}
          onClose={() => setAgentModal(null)}
        />
      )}
    </div>
  )
}
