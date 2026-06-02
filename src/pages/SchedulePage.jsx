import { useState, useMemo, useCallback } from 'react'
import {
  ChevronLeft, ChevronRight, ChevronDown, Copy,
  Users, BarChart2, Calendar, MessageSquare, LayoutGrid,
  GitBranch, TrendingUp, Clock, Target, Settings,
} from 'lucide-react'
import { useSchedule } from '../hooks/useSchedule'
import { useShiftTypes, DEFAULT_SHIFT_TYPES } from '../hooks/useShiftTypes'
import { ForecastChart } from '../components/ForecastChart'
import TimelineView from '../components/TimelineView'
import UsersPage from './UsersPage'
import SettingsPage from './SettingsPage'
import {
  DAYS, formatWeekLabel, computeCoverage,
  getPhoneGap, getEmailGap, PHONE_START, PHONE_END,
  estimateWeeklySLA, estimatePeriodSLA,
} from '../lib/forecast'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']

// ─── Sidebar nav ─────────────────────────────────────────────────────────────

const NAV = [
  {
    id: 'schedule',
    label: 'Schedule',
    icon: Calendar,
    children: [
      { id: 'timeline',  label: 'Timeline',    icon: GitBranch },
      { id: 'multiweek', label: '4-Week View', icon: LayoutGrid },
    ],
  },
  {
    id: 'forecast',
    label: 'Forecast',
    icon: BarChart2,
    children: [
      { id: 'forecast-volume',  label: 'Volume Forecast',  icon: TrendingUp },
      { id: 'forecast-sla',     label: 'Historical SLA',   icon: Clock },
      { id: 'forecast-targets', label: 'Staffing Targets', icon: Target },
    ],
  },
  {
    id: 'users',
    label: 'Users',
    icon: Users,
    children: null,
  },
]

// ─── 4-Week View ─────────────────────────────────────────────────────────────

function MultiWeekView({ agents, currentMonday, goToWeek, onOpenTimeline, forecast }) {
  const weeks = Array.from({ length: 4 }, (_, i) => {
    const mon = new Date(currentMonday)
    mon.setDate(mon.getDate() + i * 7)
    return mon
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-white">4-Week Overview</h2>
        <p className="text-xs text-gray-500">Click any day to jump to that week</p>
      </div>

      {weeks.map((monday, wi) => (
        <div key={wi} className="bg-[#141922] border border-[#2A3245] rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-[#2A3245] flex items-center justify-between">
            <span className="text-xs font-medium text-white font-mono">{formatWeekLabel(monday)}</span>
            <button
              onClick={() => { goToWeek(monday); onOpenTimeline() }}
              className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
            >
              Open week →
            </button>
          </div>

          <div className="grid grid-cols-5 divide-x divide-[#2A3245]">
            {WEEKDAYS.map(day => {
              const dayDate = new Date(monday)
              dayDate.setDate(dayDate.getDate() + WEEKDAYS.indexOf(day))
              const dateNum = dayDate.getDate()
              const month   = dayDate.toLocaleDateString('en-US', { month: 'short' })

              return (
                <button
                  key={day}
                  onClick={() => { goToWeek(monday); onOpenTimeline() }}
                  className="p-3 text-left hover:bg-[#2A3245]/40 transition-colors"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-medium text-gray-400">{day}</span>
                    <span className="text-[10px] text-gray-600 font-mono">{month} {dateNum}</span>
                  </div>
                  <div className="space-y-1">
                    {agents.slice(0, 5).map(agent => (
                      <div key={agent.id} className="flex items-center gap-1">
                        <div className="w-2 h-2 rounded-full shrink-0" style={{ background: agent.color }} />
                        <span className="text-[9px] text-gray-500 truncate">{agent.name}</span>
                      </div>
                    ))}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Main app ─────────────────────────────────────────────────────────────────

export default function SchedulePage({ theme, toggleTheme }) {
  const {
    agents, currentMonday, weekSchedule, forecast, slaData, saving, saveError, loadError,
    copyLastWeek, goNextWeek, goPrevWeek, goToWeek, updateSlot, addAgent,
  } = useSchedule()

  const {
    shiftTypes, addShiftType, updateShiftType, deleteShiftType, reorderShiftType,
  } = useShiftTypes()

  // Special sentinel from SettingsPage reset button
  const handleShiftTypeAdd = (form) => {
    if (form === '__reset__') {
      localStorage.removeItem('wfm-shift-types')
      window.location.reload()
      return
    }
    addShiftType(form)
  }

  const [activeView,       setActiveView]       = useState('timeline')
  const [sidebarOpen,      setSidebarOpen]       = useState(true)
  const [expandedSections, setExpandedSections] = useState({ schedule: true, forecast: false })
  const [copyMsg,          setCopyMsg]           = useState('')
  const [slackMsg,         setSlackMsg]          = useState('')
  const [slackLoading,     setSlackLoading]      = useState(false)

  // ── Timeline view info (reported back from TimelineView) ──
  const [viewInfo, setViewInfo] = useState({ mode: 'day', dows: [], label: 'Today' })
  const handleViewChange = useCallback((info) => setViewInfo(info), [])

  // ── KPI data — re-computed whenever the Timeline's date range changes ──
  const periodSLA = useMemo(() => {
    if (!agents.length || !forecast.phoneForecast || !viewInfo.dows.length) return null
    return estimatePeriodSLA(weekSchedule, agents, forecast.phoneForecast, forecast.emailForecast, viewInfo.dows)
  }, [agents, weekSchedule, forecast, viewInfo.dows])

  const slaColor = (pct) =>
    pct >= 80 ? 'text-emerald-400' : pct >= 50 ? 'text-amber-400' : 'text-red-400'

  // ── Handlers ──
  const handleCopyLastWeek = async () => {
    const ok = await copyLastWeek()
    setCopyMsg(ok ? 'Copied!' : 'No previous week found')
    setTimeout(() => setCopyMsg(''), 2500)
  }

  const handleSlackPost = async () => {
    setSlackLoading(true)
    setSlackMsg('')
    try {
      const SUPABASE_URL      = import.meta.env.VITE_SUPABASE_URL
      const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

      const res = await fetch(`${SUPABASE_URL}/functions/v1/slack-schedule`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          weekLabel: formatWeekLabel(currentMonday),
          phoneSLA:  weeklySLA?.phoneSLA  || 0,
          emailSLA:  weeklySLA?.emailSLA  || 0,
          days: WEEKDAYS.map(day => {
            const agentDaySlots = {}
            for (const agent of agents) {
              agentDaySlots[agent.id] = weekSchedule[agent.id]?.[day] || {}
            }
            const { phoneCov: pc } = computeCoverage(agentDaySlots)
            let gap = 'ok'
            for (let h = 12; h < 19; h++) {
              const pg = getPhoneGap(pc[h] || 0, forecast.phoneForecast[day]?.[h] || 0)
              if (pg === 'critical') { gap = 'critical'; break }
              if (pg === 'warn')       gap = 'warn'
            }
            return {
              day, gap,
              agents: agents.map(agent => {
                const slots  = weekSchedule[agent.id]?.[day] || {}
                const isOff  = !!slots.off
                let phoneHrs = 0, emailHrs = 0
                if (!isOff) {
                  Object.values(slots).forEach(a => {
                    if (a === 'phone') phoneHrs++
                    if (a === 'email') emailHrs++
                  })
                }
                return { name: agent.name, phoneHrs, emailHrs, isOff }
              }).filter(a => a.isOff || a.phoneHrs > 0 || a.emailHrs > 0),
            }
          }),
        }),
      })
      setSlackMsg(res.ok ? 'Posted to Slack!' : 'Failed — check Slack webhook setup')
    } catch {
      setSlackMsg('Error posting to Slack')
    } finally {
      setSlackLoading(false)
      setTimeout(() => setSlackMsg(''), 4000)
    }
  }

  // ── Sidebar helpers ──
  const toggleSection = (id) =>
    setExpandedSections(s => ({ ...s, [id]: !s[id] }))

  const handleSectionHeaderClick = (item) => {
    if (!sidebarOpen) {
      setSidebarOpen(true)
      setExpandedSections(s => ({ ...s, [item.id]: true }))
    } else {
      toggleSection(item.id)
    }
  }

  const isViewUnderSection = (sectionId) =>
    NAV.find(n => n.id === sectionId)?.children?.some(c => c.id === activeView)

  // ── Section prop map for ForecastChart ──
  const FORECAST_SECTION = {
    'forecast-volume':  'volume',
    'forecast-sla':     'baseline',
    'forecast-targets': 'targets',
  }

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: 'var(--bg-primary)', color: 'var(--text-primary)' }}>

      {/* ─── Sidebar ─────────────────────────────────────────────────────────── */}
      <aside
        className={`flex flex-col shrink-0 border-r transition-all duration-200 ${sidebarOpen ? 'w-56' : 'w-14'}`}
        style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-secondary)' }}
      >
        {/* Logo row */}
        <div
          className="flex items-center px-3 py-4 border-b"
          style={{ borderColor: 'var(--border-primary)', minHeight: 57 }}
        >
          {sidebarOpen ? (
            <>
              <div className="flex items-center gap-2.5 flex-1 min-w-0">
                <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold text-sm shrink-0">W</div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold leading-none" style={{ color: 'var(--text-primary)' }}>WFM</div>
                  <div className="text-[10px] mt-0.5" style={{ color: 'var(--text-tertiary)' }}>CX Staffing</div>
                </div>
              </div>
              <button
                onClick={() => setSidebarOpen(false)}
                className="p-1 rounded-lg transition-colors shrink-0"
                style={{ color: 'var(--text-tertiary)' }}
                title="Collapse sidebar"
              >
                <ChevronLeft size={14} />
              </button>
            </>
          ) : (
            <button
              onClick={() => setSidebarOpen(true)}
              className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold text-sm mx-auto"
              title="Expand sidebar"
            >
              W
            </button>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
          {NAV.map(item => {
            const Icon = item.icon

            // Single-level item (Users)
            if (!item.children) {
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveView(item.id)}
                  title={!sidebarOpen ? item.label : undefined}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                    activeView === item.id
                      ? 'bg-[#2A3245] text-white'
                      : 'text-gray-500 hover:text-gray-300 hover:bg-[#1A1F2E]'
                  } ${!sidebarOpen ? 'justify-center' : ''}`}
                >
                  <Icon size={15} className="shrink-0" />
                  {sidebarOpen && <span>{item.label}</span>}
                </button>
              )
            }

            // Section with children
            const isExpanded  = expandedSections[item.id]
            const sectionActive = isViewUnderSection(item.id)

            return (
              <div key={item.id}>
                <button
                  onClick={() => handleSectionHeaderClick(item)}
                  title={!sidebarOpen ? item.label : undefined}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold uppercase tracking-wider transition-colors ${
                    sectionActive && !isExpanded
                      ? 'bg-[#2A3245] text-white'
                      : 'text-gray-500 hover:text-gray-400 hover:bg-[#1A1F2E]'
                  } ${!sidebarOpen ? 'justify-center' : ''}`}
                >
                  <Icon size={15} className="shrink-0" />
                  {sidebarOpen && (
                    <>
                      <span className="flex-1 text-left">{item.label}</span>
                      <ChevronDown
                        size={12}
                        className={`transition-transform duration-150 ${isExpanded ? 'rotate-0' : '-rotate-90'}`}
                      />
                    </>
                  )}
                </button>

                {sidebarOpen && isExpanded && (
                  <div className="mt-0.5 ml-3 pl-3 border-l border-[#2A3245] space-y-0.5 pb-1">
                    {item.children.map(child => {
                      const CIcon = child.icon
                      return (
                        <button
                          key={child.id}
                          onClick={() => setActiveView(child.id)}
                          className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-sm transition-colors ${
                            activeView === child.id
                              ? 'bg-[#2A3245] text-white'
                              : 'text-gray-400 hover:text-gray-200 hover:bg-[#1A1F2E]'
                          }`}
                        >
                          <CIcon size={13} className="shrink-0" />
                          <span>{child.label}</span>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </nav>

        {/* Bottom: settings + theme toggle */}
        <div className="px-2 py-3 border-t space-y-0.5" style={{ borderColor: 'var(--border-primary)' }}>
          <button
            onClick={() => setActiveView('settings')}
            title={!sidebarOpen ? 'Settings' : undefined}
            className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors w-full ${
              activeView === 'settings'
                ? 'bg-[#2A3245] text-white'
                : 'text-gray-500 hover:text-gray-300 hover:bg-[#1A1F2E]'
            } ${!sidebarOpen ? 'justify-center' : ''}`}
          >
            <Settings size={15} className="shrink-0" />
            {sidebarOpen && <span>Settings</span>}
          </button>
          <button
            onClick={toggleTheme}
            title={!sidebarOpen ? (theme === 'dark' ? 'Light mode' : 'Dark mode') : undefined}
            className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors text-gray-500 hover:text-gray-300 hover:bg-[#1A1F2E] w-full ${!sidebarOpen ? 'justify-center' : ''}`}
          >
            <span className="text-base leading-none">{theme === 'dark' ? '☀️' : '🌙'}</span>
            {sidebarOpen && (
              <span className="text-xs">{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>
            )}
          </button>
        </div>
      </aside>

      {/* ─── Main content ────────────────────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto">
        <div className="p-6 space-y-6 max-w-[1400px] mx-auto">

          {/* Error banners */}
          {loadError && (
            <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-red-950/60 border border-red-800/60 text-sm text-red-300">
              <span className="font-semibold shrink-0">Load error:</span>
              <span className="font-mono text-xs">{loadError}</span>
            </div>
          )}
          {saveError && (
            <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-red-950/60 border border-red-800/60 text-sm text-red-300">
              <span className="font-semibold shrink-0">Save error — change was not saved:</span>
              <span className="font-mono text-xs">{saveError}</span>
            </div>
          )}

          {/* ── TIMELINE ── */}
          {activeView === 'timeline' && (
            <>
              {/* Action buttons */}
              <div className="flex items-center justify-end flex-wrap gap-3">

                <div className="flex items-center gap-2 flex-wrap">
                  {saving && <span className="text-xs text-gray-500 font-mono">saving…</span>}
                  {!saving && saveError && <span className="text-xs text-red-400 font-mono">save failed</span>}
                  {copyMsg && <span className="text-xs text-emerald-400 font-mono">{copyMsg}</span>}
                  {slackMsg && (
                    <span className={`text-xs font-mono ${slackMsg.includes('Posted') ? 'text-emerald-400' : 'text-red-400'}`}>
                      {slackMsg}
                    </span>
                  )}
                  <button
                    onClick={handleCopyLastWeek}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-[#1A1F2E] hover:bg-[#2A3245] text-gray-300 hover:text-white transition-colors"
                  >
                    <Copy size={13} /> Copy last week
                  </button>
                  <button
                    onClick={handleSlackPost}
                    disabled={slackLoading}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-[#4A154B] hover:bg-[#611f69] text-gray-200 hover:text-white transition-colors disabled:opacity-40"
                  >
                    <MessageSquare size={13} /> {slackLoading ? 'Posting…' : 'Post to Slack'}
                  </button>
                </div>
              </div>

              {/* KPI cards */}
              {periodSLA ? (
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <div className="bg-[#141922] border border-[#2A3245] rounded-xl p-4">
                    <div className="text-xs text-gray-500 mb-1">Est. phone SLA · {viewInfo.label}</div>
                    <div className={`text-2xl font-mono font-medium ${slaColor(periodSLA.phoneSLA)}`}>{periodSLA.phoneSLA}%</div>
                    <div className="text-[10px] text-gray-600 mt-1">target: 95%</div>
                  </div>
                  <div className="bg-[#141922] border border-[#2A3245] rounded-xl p-4">
                    <div className="text-xs text-gray-500 mb-1">Est. email SLA · {viewInfo.label}</div>
                    <div className={`text-2xl font-mono font-medium ${slaColor(periodSLA.emailSLA)}`}>{periodSLA.emailSLA}%</div>
                    <div className="text-[10px] text-gray-600 mt-1">target: 95%</div>
                  </div>
                  <div className="bg-[#141922] border border-[#2A3245] rounded-xl p-4">
                    <div className="text-xs text-gray-500 mb-1">Calls covered / expected</div>
                    <div className="text-2xl font-mono font-medium text-gray-300">{periodSLA.phoneTotalAnswered.toLocaleString()}</div>
                    <div className="text-[10px] text-gray-600 mt-1">of {periodSLA.phoneTotalExpected.toLocaleString()} expected</div>
                  </div>
                  <div className="bg-[#141922] border border-[#2A3245] rounded-xl p-4">
                    <div className="text-xs text-gray-500 mb-1">Emails covered / expected</div>
                    <div className="text-2xl font-mono font-medium text-gray-300">{periodSLA.emailTotalAnswered.toLocaleString()}</div>
                    <div className="text-[10px] text-gray-600 mt-1">of {periodSLA.emailTotalExpected.toLocaleString()} expected</div>
                  </div>
                </div>
              ) : viewInfo.dows.length === 0 && (
                <div className="text-xs text-gray-500 font-mono py-1">No scheduled days in selected range</div>
              )}

              <TimelineView
                agents={agents}
                weekSchedule={weekSchedule}
                currentMonday={currentMonday}
                phoneForecast={forecast.phoneForecast}
                emailForecast={forecast.emailForecast}
                updateSlot={updateSlot}
                shiftTypes={shiftTypes}
                onViewChange={handleViewChange}
              />
            </>
          )}

          {/* ── 4-WEEK VIEW ── */}
          {activeView === 'multiweek' && (
            <MultiWeekView
              agents={agents}
              currentMonday={currentMonday}
              goToWeek={goToWeek}
              onOpenTimeline={() => setActiveView('timeline')}
              forecast={forecast}
            />
          )}

          {/* ── FORECAST SECTIONS ── */}
          {activeView === 'forecast-volume' && (
            <ForecastChart
              section="volume"
              phoneForecast={forecast.phoneForecast}
              emailForecast={forecast.emailForecast}
              slaData={slaData}
            />
          )}
          {activeView === 'forecast-sla' && (
            <ForecastChart
              section="baseline"
              phoneForecast={forecast.phoneForecast}
              emailForecast={forecast.emailForecast}
              slaData={slaData}
            />
          )}
          {activeView === 'forecast-targets' && (
            <ForecastChart
              section="targets"
              phoneForecast={forecast.phoneForecast}
              emailForecast={forecast.emailForecast}
              slaData={slaData}
            />
          )}

          {/* ── USERS ── */}
          {activeView === 'users' && <UsersPage addAgent={addAgent} />}

          {/* ── SETTINGS ── */}
          {activeView === 'settings' && (
            <SettingsPage
              shiftTypes={shiftTypes}
              onAdd={handleShiftTypeAdd}
              onUpdate={updateShiftType}
              onDelete={deleteShiftType}
              onReorder={reorderShiftType}
            />
          )}

        </div>
      </main>
    </div>
  )
}
