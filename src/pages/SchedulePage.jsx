import { useState, useCallback } from 'react'
import {
  ChevronLeft, ChevronRight, ChevronDown, Copy,
  Users, BarChart2, Calendar, LayoutGrid,
  GitBranch, TrendingUp, Clock, Target, Settings,
} from 'lucide-react'
import { useSchedule } from '../hooks/useSchedule'
import { useShiftTypes, DEFAULT_SHIFT_TYPES } from '../hooks/useShiftTypes'
import { ForecastChart } from '../components/ForecastChart'
import TimelineView from '../components/TimelineView'
import UsersPage from './UsersPage'
import SettingsPage from './SettingsPage'
import { DAYS, formatWeekLabel } from '../lib/forecast'
import { usePeriodKPIs } from '../hooks/usePeriodKPIs'
import { useAvgHandleRate } from '../hooks/useAvgHandleRate'

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
  const [copyMsg, setCopyMsg] = useState('')

  // ── Timeline view info (reported back from TimelineView) ──
  const [viewInfo, setViewInfo] = useState({ mode: 'day', dows: [], label: 'Today', startDate: null, endDate: null })
  const handleViewChange = useCallback((info) => setViewInfo(info), [])

  const { rangeRate, benchmarkRate } = useAvgHandleRate({
    startDate: viewInfo.startDate,
    endDate:   viewInfo.endDate,
  })

  // ── KPI data — real DB data for past/current, forecast for future ──
  const { kpis } = usePeriodKPIs({
    startDate:     viewInfo.startDate,
    endDate:       viewInfo.endDate,
    phoneForecast: forecast.phoneForecast,
    emailForecast: forecast.emailForecast,
  })

  const slaColor = (pct) =>
    pct >= 80 ? 'text-emerald-400' : pct >= 50 ? 'text-amber-400' : 'text-red-400'

  // ── Handlers ──
  const handleCopyLastWeek = async () => {
    const ok = await copyLastWeek()
    setCopyMsg(ok ? 'Copied!' : 'No previous week found')
    setTimeout(() => setCopyMsg(''), 2500)
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
                  <button
                    onClick={handleCopyLastWeek}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-[#1A1F2E] hover:bg-[#2A3245] text-gray-300 hover:text-white transition-colors"
                  >
                    <Copy size={13} /> Copy last week
                  </button>
                </div>
              </div>

              {/* KPI cards */}
              {kpis && (
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <div className="bg-[#141922] border border-[#2A3245] rounded-xl p-4">
                    <div className="text-xs text-gray-500 mb-1">Inbound calls · {viewInfo.label}</div>
                    <div className="text-2xl font-mono font-medium text-gray-300">{kpis.calls.toLocaleString()}</div>
                    <div className="text-[10px] text-gray-600 mt-1">{kpis.hasFutureData ? 'actual + forecast' : 'actual'}</div>
                  </div>
                  <div className="bg-[#141922] border border-[#2A3245] rounded-xl p-4">
                    <div className="text-xs text-gray-500 mb-1">Answer rate · {viewInfo.label}</div>
                    <div className={`text-2xl font-mono font-medium ${kpis.answerRate !== null ? slaColor(kpis.answerRate) : 'text-gray-600'}`}>
                      {kpis.answerRate !== null ? `${kpis.answerRate}%` : '—'}
                    </div>
                    <div className="text-[10px] text-gray-600 mt-1">{kpis.answerRate !== null ? 'target: 95%' : 'no data yet'}</div>
                  </div>
                  <div className="bg-[#141922] border border-[#2A3245] rounded-xl p-4">
                    <div className="text-xs text-gray-500 mb-1">Tickets created · {viewInfo.label}</div>
                    <div className="text-2xl font-mono font-medium text-gray-300">{kpis.ticketsCreated.toLocaleString()}</div>
                    <div className="text-[10px] text-gray-600 mt-1">{kpis.hasFutureData ? 'actual + forecast' : 'actual'}</div>
                  </div>
                  <div className="bg-[#141922] border border-[#2A3245] rounded-xl p-4">
                    <div className="text-xs text-gray-500 mb-1">Avg handle rate</div>
                    <div className="text-2xl font-mono font-medium text-gray-300">
                      {rangeRate !== null ? rangeRate.toFixed(1) : '—'}
                    </div>
                    <div className="text-[10px] text-gray-600 mt-1">tickets/agent/hr</div>
                    {benchmarkRate !== null && (
                      <div className="text-[10px] text-gray-600 mt-1">
                        30-day avg · {benchmarkRate.toFixed(1)}
                      </div>
                    )}
                  </div>
                </div>
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
                handleRate={benchmarkRate}
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
