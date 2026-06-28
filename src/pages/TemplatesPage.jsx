import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { ChevronRight, Copy, Plus, Trash2, X, Check } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { CustomRangePicker } from '../components/CustomRangePicker'
import { useShiftTypes, DEFAULT_SHIFT_TYPES } from '../hooks/useShiftTypes'
import { hLabel, getMondayOfWeek, toISODate, DAYS, WORK_START, WORK_END } from '../lib/forecast'
import ConfirmModal from '../components/ConfirmModal'

const DAYS_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
const DAYS_FULL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
const HOUR_COL_W = 48

// ─── Modal for editing a shift in the template ───

function ShiftModal({ agent, dow, clickedHour, agentSlots, updateSlot, shiftTypes, onClose }) {
  const existingActivity = agentSlots[clickedHour]
  const isEditing = !!existingActivity && existingActivity !== 'off'

  const { blockStart, blockEnd } = useMemo(() => {
    if (!isEditing) return { blockStart: clickedHour, blockEnd: clickedHour }
    const act = agentSlots[clickedHour]
    let start = clickedHour, end = clickedHour
    while (start > 0 && agentSlots[start - 1] === act) start--
    while (end < 23 && agentSlots[end + 1] === act) end++
    return { blockStart: start, blockEnd: end }
  }, [isEditing, clickedHour, agentSlots])

  const [channel, setChannel] = useState(() => {
    if (isEditing && shiftTypes?.find(t => t.id === existingActivity)) return existingActivity
    const defaultType = shiftTypes?.find(t => t.id === (agent.default_channel || 'email'))
    return defaultType?.id ?? shiftTypes?.[0]?.id ?? 'email'
  })
  const [startHour, setStartHour] = useState(blockStart)
  const [endHour, setEndHour] = useState(blockEnd)

  const modalRef = useRef(null)
  useEffect(() => {
    const modal = modalRef.current
    if (!modal) return
    const focusable = Array.from(modal.querySelectorAll(
      'button:not([disabled]), select, input, [tabindex]:not([tabindex="-1"])'
    ))
    if (focusable.length) focusable[0].focus()
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') { onClose(); return }
      if (e.key !== 'Tab' || !focusable.length) return
      const first = focusable[0], last = focusable[focusable.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const handleSave = () => {
    if (isEditing) {
      for (let h = blockStart; h <= blockEnd; h++) {
        if (h < startHour || h > endHour) {
          updateSlot(agent.id, dow, h, null)
        }
      }
    }
    for (let h = startHour; h <= endHour; h++) {
      updateSlot(agent.id, dow, h, channel)
    }
    onClose()
  }

  const handleDelete = () => {
    for (let h = blockStart; h <= blockEnd; h++) {
      updateSlot(agent.id, dow, h, null)
    }
    onClose()
  }

  return (
    <div
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        ref={modalRef}
        className="bg-[#141922] border border-[#2A3245] rounded-xl w-full max-w-sm shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#2A3245]">
          <div>
            <div className="flex items-center gap-2">
              <div
                className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white shrink-0"
                style={{ background: agent.color }}
              >
                {agent.name[0]}
              </div>
              <span className="font-semibold text-white text-sm">
                {isEditing ? 'Edit Shift' : 'Add Shift'}
              </span>
            </div>
            <p className="text-[11px] text-gray-500 mt-0.5">{agent.name} · {dow}</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors p-1">
            <X size={16} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div>
            <label className="block text-xs text-gray-400 mb-2 font-medium">Type</label>
            <div className="grid grid-cols-3 gap-1.5">
              {(shiftTypes || []).map(type => {
                const selected = channel === type.id
                return (
                  <button
                    key={type.id}
                    onClick={() => setChannel(type.id)}
                    style={{
                      background: selected ? type.color + '33' : type.color + '12',
                      color: type.color,
                      borderColor: selected ? type.color + '88' : type.color + '30',
                    }}
                    className="px-2 py-2 rounded-lg text-xs font-medium transition-all border truncate"
                  >
                    {type.name}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1.5 font-medium">Start time</label>
              <select
                value={startHour}
                onChange={e => {
                  const h = Number(e.target.value)
                  setStartHour(h)
                  if (endHour < h) setEndHour(h)
                }}
                className="w-full bg-[#0C0F14] border border-[#2A3245] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
              >
                {Array.from({ length: 24 }, (_, h) => (
                  <option key={h} value={h}>{hLabel(h)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1.5 font-medium">End time</label>
              <select
                value={endHour}
                onChange={e => setEndHour(Number(e.target.value))}
                className="w-full bg-[#0C0F14] border border-[#2A3245] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
              >
                {Array.from({ length: 24 }, (_, h) => h)
                  .filter(h => h >= startHour)
                  .map(h => (
                    <option key={h} value={h}>{hLabel(h)}</option>
                  ))}
              </select>
            </div>
          </div>
        </div>

        <div className="px-5 py-4 border-t border-[#2A3245] flex items-center justify-between gap-3">
          {isEditing ? (
            <button
              onClick={handleDelete}
              className="px-3 py-1.5 text-xs bg-red-700 hover:bg-red-600 text-white rounded-lg transition-colors font-medium"
            >
              Delete
            </button>
          ) : <div />}
          <div className="flex gap-2 ml-auto">
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-sm text-gray-400 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-1.5 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors font-medium"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Week template grid editor (like DayView with draggable blocks) ───

function WeekTemplateGrid({ template, agents, shiftTypes, onUpdateSlot }) {
  const [shiftModal, setShiftModal] = useState(null)
  const [drag, setDrag] = useState(null)
  const dragRef = useRef(null)
  const containerRef = useRef(null)
  const outerRef = useRef(null)
  const pointerDownRef = useRef(null)
  const dragStartedRef = useRef(false)

  // Keep dragRef in sync with drag state
  useEffect(() => {
    dragRef.current = drag
  }, [drag])

  // Show full 24-hour day (PT): 12am-11pm
  const hours = Array.from({ length: 24 }, (_, i) => i)

  if (!template) {
    return <div className="text-gray-400 text-center py-8">Select or create a template to edit</div>
  }

  const clientXToHour = (clientX) => {
    if (!containerRef.current) return null
    const rect = containerRef.current.getBoundingClientRect()
    const x = clientX - rect.left + containerRef.current.scrollLeft - 140
    return Math.max(0, Math.min(23, Math.floor(x / HOUR_COL_W)))
  }

  const handlePointerMove = (e) => {
    // Check if this is a potential shift block drag starting
    if (pointerDownRef.current && !dragStartedRef.current) {
      const dx = Math.abs(e.clientX - pointerDownRef.current.x)
      const dy = Math.abs(e.clientY - pointerDownRef.current.y)
      // If moved more than 12px, treat as drag start (matches standard touch threshold)
      if (dx > 12 || dy > 12) {
        dragStartedRef.current = true
        const h = clientXToHour(e.clientX)
        const pd = pointerDownRef.current
        setDrag({
          type: 'move',
          agentId: pd.agent.id,
          day: pd.day,
          origStart: pd.startH,
          origEnd: pd.endH,
          activity: pd.activity,
          offsetH: h !== null ? h - pd.startH : 0,
          previewStart: pd.startH,
          previewEnd: pd.endH,
        })
      }
    }

    setDrag(currentDrag => {
      if (!currentDrag) return null
      const h = clientXToHour(e.clientX)
      if (h === null) return currentDrag

      if (currentDrag.type === 'move') {
        const len = currentDrag.origEnd - currentDrag.origStart
        const newStart = Math.max(0, Math.min(23 - len, h - currentDrag.offsetH))
        const newEnd = newStart + len
        return { ...currentDrag, previewStart: newStart, previewEnd: newEnd }
      } else {
        if (currentDrag.edge === 'right') {
          const newEnd = Math.max(currentDrag.origStart, Math.min(23, h))
          return { ...currentDrag, previewEnd: newEnd }
        } else {
          const newStart = Math.min(currentDrag.origEnd, Math.max(0, h))
          return { ...currentDrag, previewStart: newStart }
        }
      }
    })

    // Auto-scroll when dragging near horizontal edges
    if (containerRef.current && dragRef.current) {
      const rect = containerRef.current.getBoundingClientRect()
      const ZONE = 80
      const distRight = rect.right - e.clientX
      const distLeft  = e.clientX  - rect.left
      if (distRight > 0 && distRight < ZONE) containerRef.current.scrollLeft += (ZONE - distRight) / ZONE * 16
      else if (distLeft > 0 && distLeft < ZONE) containerRef.current.scrollLeft -= (ZONE - distLeft) / ZONE * 16
    }
  }

  const handlePointerUp = (e) => {
    outerRef.current?.releasePointerCapture(e.pointerId)
    // If pointer down was on a shift block but no drag started, it's a click - open modal
    if (pointerDownRef.current && !dragStartedRef.current) {
      const pd = pointerDownRef.current
      openShiftModal(pd.agent, pd.day, pd.slots, pd.startH)
    }
    pointerDownRef.current = null
    dragStartedRef.current = false

    const currentDrag = dragRef.current
    if (!currentDrag) return
    const { type, agentId, day, origStart, origEnd, activity, previewStart, previewEnd, edge } = currentDrag
    setDrag(null)

    if (type === 'move') {
      for (let h = origStart; h <= origEnd; h++) {
        if (h < previewStart || h > previewEnd) {
          onUpdateSlot(agentId, day, h, null)
        }
      }
      for (let h = previewStart; h <= previewEnd; h++) {
        if (h < origStart || h > origEnd) {
          onUpdateSlot(agentId, day, h, activity)
        }
      }
    } else {
      if (edge === 'right') {
        if (previewEnd > origEnd) {
          for (let h = origEnd + 1; h <= previewEnd; h++) onUpdateSlot(agentId, day, h, activity)
        } else {
          for (let h = previewEnd + 1; h <= origEnd; h++) onUpdateSlot(agentId, day, h, null)
        }
      } else {
        if (previewStart < origStart) {
          for (let h = previewStart; h < origStart; h++) onUpdateSlot(agentId, day, h, activity)
        } else {
          for (let h = origStart; h < previewStart; h++) onUpdateSlot(agentId, day, h, null)
        }
      }
    }
  }

  const openShiftModal = (agent, day, slots, startH) => {
    setShiftModal({ agent, day, clickedHour: startH, agentSlots: slots })
  }

  return (
    <>
      <div
        ref={outerRef}
        className="bg-[#141922] border border-[#2A3245] rounded-xl overflow-hidden"
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={() => { pointerDownRef.current = null; dragStartedRef.current = false; setDrag(null) }}
        style={drag ? { userSelect: 'none' } : undefined}
      >
        <div className="overflow-x-auto" ref={containerRef}>
          <table
            className="text-[10px] border-collapse w-full"
            style={{ minWidth: `140px + ${DAYS_SHORT.length * (HOUR_COL_W * 24)}px` }}
          >
            {/* Header */}
            <thead>
              <tr className="border-b border-[#2A3245]">
                <th className="sticky left-0 z-20 bg-[#141922] border-r border-[#2A3245]" />
                {DAYS_SHORT.map(day => (
                  <th
                    key={day}
                    className="text-center px-2 py-1.5 bg-[#0C0F14] border-r border-[#2A3245]"
                  >
                    <div className="text-xs font-semibold text-white">{day}</div>
                  </th>
                ))}
              </tr>
              <tr className="border-b border-[#2A3245]">
                <th className="sticky left-0 z-20 bg-[#141922] text-left px-4 py-1 border-r border-[#2A3245] text-xs font-semibold text-gray-300">
                  Agent
                </th>
                {DAYS_SHORT.map(day => (
                  <th key={day} className="bg-[#0C0F14] border-r border-[#2A3245] p-0">
                    <div className="flex border-b border-[#2A3245]">
                      {hours.map(h => (
                        <div
                          key={h}
                          className="text-center text-[8px]"
                          style={{ width: HOUR_COL_W, minWidth: HOUR_COL_W, padding: '1px 0' }}
                        >
                          <span className="text-gray-500">{hLabel(h).replace('am', 'a').replace('pm', 'p')}</span>
                        </div>
                      ))}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>

            {/* Agent rows */}
            <tbody>
              {agents.map((agent, agentIdx) => (
                <tr key={agent.id} style={{ height: 32 }}>
                  <td className="sticky left-0 z-10 bg-[#141922] border-r border-[#2A3245] px-3 py-0">
                    <div className="flex items-center gap-2 h-full">
                      <div
                        className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white shrink-0"
                        style={{ background: agent.color }}
                      >
                        {agent.name[0]}
                      </div>
                      <span className="text-xs font-medium text-gray-300 whitespace-nowrap">{agent.name}</span>
                    </div>
                  </td>

                  {DAYS_SHORT.map(day => {
                    const slots = template.slots?.[agent.id]?.[day] || {}
                    const isBeingDragged = drag && drag.agentId === agent.id && drag.day === day

                    // Build runs of contiguous activities
                    const runs = []
                    let i = 0
                    while (i < 24) {
                      const h = i
                      const act = isBeingDragged ? null : (slots[h] || null)
                      if (!act) {
                        runs.push({ startH: h, endH: h, activity: null, span: 1 })
                        i++
                      } else {
                        let j = i + 1
                        while (j < 24 && slots[j] === act) j++
                        runs.push({ startH: h, endH: j - 1, activity: act, span: j - i })
                        i = j
                      }
                    }

                    // Get preview runs if dragging
                    const previewRuns = isBeingDragged ?
                      Array.from({ length: drag.previewEnd - drag.previewStart + 1 }, (_, i) => ({
                        h: drag.previewStart + i,
                        activity: drag.activity
                      })) : []

                    return (
                      <td key={day} className="border-r border-[#2A3245] p-0 bg-[#0C0F14]" style={{ minWidth: HOUR_COL_W * 24, height: 32 }}>
                        <div className="flex relative w-full h-full">
                          {/* Empty cells */}
                          {runs.map(({ startH, endH, activity, span }) => {
                            if (activity) return null
                            return (
                              <div
                                key={`empty-${startH}`}
                                className="border-r border-[#2A3245] hover:bg-[#2A3245]/20 cursor-pointer"
                                style={{ width: `${HOUR_COL_W * span}px`, height: '100%' }}
                                onClick={() => openShiftModal(agent, day, slots, startH)}
                              />
                            )
                          })}

                          {/* Drag preview - show semi-transparent preview block while dragging */}
                          {isBeingDragged && previewRuns.length > 0 && (
                            <div
                              className="absolute rounded opacity-60"
                              style={{
                                top: '2px',
                                bottom: '2px',
                                left: `${drag.previewStart * HOUR_COL_W}px`,
                                width: `${(drag.previewEnd - drag.previewStart + 1) * HOUR_COL_W}px`,
                                background: shiftTypes?.find(t => t.id === drag.activity)?.color || '#666',
                                pointerEvents: 'none',
                              }}
                            />
                          )}

                          {/* Shift blocks */}
                          {runs.map(({ startH, endH, activity, span }) => {
                            if (!activity) return null
                            const shiftType = shiftTypes?.find(t => t.id === activity)
                            const label = shiftType?.name || activity
                            return (
                              <div
                                key={`shift-${startH}`}
                                className={`absolute rounded cursor-grab active:cursor-grabbing transition-all ${isBeingDragged ? 'opacity-50' : 'hover:brightness-110 hover:shadow-lg'}`}
                                style={{
                                  top: '2px',
                                  bottom: '2px',
                                  left: `${startH * HOUR_COL_W}px`,
                                  width: `${span * HOUR_COL_W}px`,
                                  background: shiftType?.color || '#666',
                                  minHeight: '24px',
                                  boxShadow: isBeingDragged ? '0 0 0 2px rgba(255,255,255,0.2)' : undefined,
                                }}
                                onPointerDown={(e) => {
                                  e.stopPropagation()
                                  outerRef.current?.setPointerCapture(e.pointerId)
                                  pointerDownRef.current = {
                                    x: e.clientX,
                                    y: e.clientY,
                                    agent,
                                    day,
                                    startH,
                                    endH,
                                    activity,
                                    slots,
                                  }
                                }}
                                title="Click to edit · drag to move · drag edges to resize"
                              >
                                {/* Left resize handle */}
                                <div
                                  className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize bg-white/10 hover:bg-white/30 rounded-l"
                                  title="Drag to resize"
                                  onPointerDown={(e) => {
                                    e.stopPropagation()
                                    outerRef.current?.setPointerCapture(e.pointerId)
                                    dragStartedRef.current = true
                                    setDrag({
                                      type: 'resize',
                                      edge: 'left',
                                      agentId: agent.id,
                                      day,
                                      origStart: startH,
                                      origEnd: endH,
                                      activity,
                                      previewStart: startH,
                                      previewEnd: endH,
                                    })
                                  }}
                                />
                                {/* Label */}
                                <div className="text-[9px] font-medium text-white px-1.5 leading-tight select-none pointer-events-none overflow-hidden whitespace-nowrap text-ellipsis">
                                  {label}
                                </div>
                                {/* Right resize handle */}
                                <div
                                  className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize bg-white/10 hover:bg-white/30 rounded-r"
                                  title="Drag to resize"
                                  onPointerDown={(e) => {
                                    e.stopPropagation()
                                    outerRef.current?.setPointerCapture(e.pointerId)
                                    dragStartedRef.current = true
                                    setDrag({
                                      type: 'resize',
                                      edge: 'right',
                                      agentId: agent.id,
                                      day,
                                      origStart: startH,
                                      origEnd: endH,
                                      activity,
                                      previewStart: startH,
                                      previewEnd: endH,
                                    })
                                  }}
                                />
                              </div>
                            )
                          })}
                        </div>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {shiftModal && (
        <ShiftModal
          agent={shiftModal.agent}
          dow={shiftModal.day}
          clickedHour={shiftModal.clickedHour}
          agentSlots={shiftModal.agentSlots}
          updateSlot={onUpdateSlot}
          shiftTypes={shiftTypes}
          onClose={() => setShiftModal(null)}
        />
      )}
    </>
  )
}

// ─── Main TemplatesPage ───

export default function TemplatesPage({ agents, shiftTypes }) {
  const [templates, setTemplates] = useState([])
  const [selectedTemplate, setSelectedTemplate] = useState(null)
  const [templateData, setTemplateData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [showNewForm, setShowNewForm] = useState(false)
  const [newTemplateName, setNewTemplateName] = useState('Standard Week')
  const [confirmDelete, setConfirmDelete] = useState(null) // null | templateId
  const [deleteError, setDeleteError] = useState('')

  // Load templates
  useEffect(() => {
    async function load() {
      setLoading(true)
      const { data } = await supabase.from('schedule_templates').select('*')
      setTemplates(data || [])
      if (data?.length > 0) {
        setSelectedTemplate(data[0].id)
      }
      setLoading(false)
    }
    load()
  }, [])

  // Load template data when selected template changes
  useEffect(() => {
    if (!selectedTemplate) return
    async function load() {
      const { data: schedules } = await supabase
        .from('template_schedules')
        .select('*, template_slots(*)')
        .eq('template_id', selectedTemplate)

      const slots = {}
      for (const sched of (schedules || [])) {
        if (!slots[sched.agent_id]) slots[sched.agent_id] = {}
        const daySlots = {}
        for (const slot of sched.template_slots || []) {
          daySlots[slot.hour] = slot.activity
        }
        slots[sched.agent_id][sched.day_of_week] = sched.is_off ? { off: true } : daySlots
      }

      setTemplateData({
        id: selectedTemplate,
        slots,
      })
    }
    load()
  }, [selectedTemplate])

  const handleCreateTemplate = async () => {
    const { data: newTemplate } = await supabase
      .from('schedule_templates')
      .insert({ name: newTemplateName })
      .select()
      .single()

    if (newTemplate) {
      setTemplates(prev => [...prev, newTemplate])
      setSelectedTemplate(newTemplate.id)
      setShowNewForm(false)
      setNewTemplateName('Standard Week')
    }
  }

  const handleDeleteTemplate = (templateId) => {
    setConfirmDelete(templateId)
  }

  const confirmDeleteTemplate = async () => {
    const templateId = confirmDelete
    setConfirmDelete(null)
    setDeleteError('')
    const { error } = await supabase.from('schedule_templates').delete().eq('id', templateId)
    if (error) {
      console.error('Delete failed:', error)
      setDeleteError('Failed to delete template — check your connection.')
      return
    }
    setTemplates(prev => prev.filter(t => t.id !== templateId))
    setSelectedTemplate(null)
  }

  const handleUpdateSlot = async (agentId, day, hour, activity) => {
    if (!selectedTemplate) return

    // Upsert template_schedule
    const { data: sched } = await supabase
      .from('template_schedules')
      .upsert({
        template_id: selectedTemplate,
        agent_id: agentId,
        day_of_week: day,
        is_off: false,
      }, { onConflict: 'template_id,agent_id,day_of_week' })
      .select()
      .single()

    if (!sched) return

    if (activity === null) {
      await supabase.from('template_slots').delete().eq('template_schedule_id', sched.id).eq('hour', hour)
    } else {
      await supabase
        .from('template_slots')
        .upsert({ template_schedule_id: sched.id, hour, activity }, { onConflict: 'template_schedule_id,hour' })
    }

    // Reload template data
    const { data: schedules } = await supabase
      .from('template_schedules')
      .select('*, template_slots(*)')
      .eq('template_id', selectedTemplate)

    const slots = {}
    for (const s of (schedules || [])) {
      if (!slots[s.agent_id]) slots[s.agent_id] = {}
      const daySlots = {}
      for (const slot of s.template_slots || []) {
        daySlots[slot.hour] = slot.activity
      }
      slots[s.agent_id][s.day_of_week] = s.is_off ? { off: true } : daySlots
    }

    setTemplateData({ id: selectedTemplate, slots })
  }

  const handlePublish = async (startDateStr, endDateStr, overwrite) => {
    if (!selectedTemplate || !templateData) {
      throw new Error('No template selected or template data not loaded')
    }

    // Check if template has any data
    const hasTemplateData = Object.values(templateData.slots).some(agentDays =>
      Object.values(agentDays).some(day => day && Object.keys(day).length > 0)
    )
    if (!hasTemplateData) {
      throw new Error('Template has no schedule data to publish')
    }

    // Parse dates (handle timezone properly)
    const [sy, sm, sd] = startDateStr.split('-').map(Number)
    const [ey, em, ed] = endDateStr.split('-').map(Number)
    const startDate = new Date(sy, sm - 1, sd)
    const endDate = new Date(ey, em - 1, ed)

    // Find all Mondays in range
    let current = new Date(startDate)
    current.setDate(current.getDate() - current.getDay() + 1)  // Move to Monday
    const mondays = []
    while (current <= endDate) {
      const y = current.getFullYear()
      const m = String(current.getMonth() + 1).padStart(2, '0')
      const d = String(current.getDate()).padStart(2, '0')
      mondays.push(`${y}-${m}-${d}`)
      current.setDate(current.getDate() + 7)
    }

    let successCount = 0
    const errors = []

    try {
      for (const mondayStr of mondays) {
        for (const agentId in templateData.slots) {
          for (const day of DAYS_SHORT) {
            const templateSlots = templateData.slots[agentId]?.[day]
            if (!templateSlots) continue

            // Check if week already has data
            if (!overwrite) {
              const { data: existing } = await supabase
                .from('schedules')
                .select('id')
                .eq('week_start', mondayStr)
                .eq('agent_id', agentId)
                .eq('day_of_week', day)
                .single()
              if (existing) continue
            }

            // Upsert schedule
            const { data: sched, error: schedError } = await supabase
              .from('schedules')
              .upsert({
                week_start: mondayStr,
                agent_id: agentId,
                day_of_week: day,
                is_off: templateSlots.off ?? false,
              }, { onConflict: 'week_start,agent_id,day_of_week' })
              .select()
              .single()

            if (schedError) {
              errors.push(`${mondayStr} - ${agentId} - ${day}: ${schedError.message}`)
              continue
            }

            if (!sched) continue

            // Delete old slots
            await supabase.from('schedule_slots').delete().eq('schedule_id', sched.id)

            // Upsert new slots
            const slotsToInsert = Object.entries(templateSlots)
              .filter(([k]) => k !== 'off')
              .map(([hour, activity]) => ({
                schedule_id: sched.id,
                hour: parseInt(hour),
                activity,
              }))

            if (slotsToInsert.length > 0) {
              const { error: slotsError } = await supabase.from('schedule_slots').upsert(slotsToInsert, { onConflict: 'schedule_id,hour' })
              if (slotsError) {
                errors.push(`Slots for ${mondayStr} - ${agentId} - ${day}: ${slotsError.message}`)
                continue
              }
            }

            successCount++
          }
        }
      }

      if (errors.length > 0) {
        console.error('Publish errors:', errors)
      }
      return { successCount, errors, weeksCount: mondays.length }
    } catch (error) {
      console.error('Publish error:', error)
      throw error
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white mb-1">Templates</h1>
        <p className="text-sm text-gray-400">Create reusable schedules and publish them to multiple weeks</p>
      </div>

      {deleteError && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-red-950/60 border border-red-800/60 text-red-300 text-sm">
          <span className="flex-1">{deleteError}</span>
          <button onClick={() => setDeleteError('')} className="text-gray-500 hover:text-white transition-colors text-lg leading-none">×</button>
        </div>
      )}

      {/* Template selector */}
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <select
            value={selectedTemplate || ''}
            onChange={e => setSelectedTemplate(e.target.value)}
            className="w-full bg-[#0C0F14] border border-[#2A3245] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
          >
            <option value="">Select a template...</option>
            {templates.map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>
        {selectedTemplate && (
          <button
            onClick={() => handleDeleteTemplate(selectedTemplate)}
            className="p-2 text-gray-400 hover:text-red-400 rounded-lg hover:bg-red-950/20 transition-colors"
            title="Delete template"
          >
            <Trash2 size={18} />
          </button>
        )}
        <button
          onClick={() => setShowNewForm(!showNewForm)}
          className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg transition-colors"
        >
          <Plus size={16} /> New
        </button>
      </div>

      {/* New template form */}
      {showNewForm && (
        <div className="flex gap-2">
          <input
            type="text"
            value={newTemplateName}
            onChange={e => setNewTemplateName(e.target.value)}
            placeholder="Template name..."
            className="flex-1 bg-[#0C0F14] border border-[#2A3245] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
          />
          <button
            onClick={handleCreateTemplate}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg transition-colors font-medium"
          >
            Create
          </button>
          <button
            onClick={() => setShowNewForm(false)}
            className="px-4 py-2 bg-[#2A3245] hover:bg-[#3A4355] text-white text-sm rounded-lg transition-colors"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Week grid editor */}
      {loading ? (
        <div className="text-gray-400 text-center py-8">Loading...</div>
      ) : (
        <WeekTemplateGrid
          template={templateData}
          agents={agents}
          shiftTypes={shiftTypes}
          onUpdateSlot={handleUpdateSlot}
        />
      )}

      {/* Publish panel */}
      {selectedTemplate && templateData && (
        <PublishPanel
          templateId={selectedTemplate}
          onPublish={handlePublish}
        />
      )}

      {confirmDelete && (
        <ConfirmModal
          title="Delete this template?"
          message="This action cannot be undone."
          confirmLabel="Delete"
          onConfirm={confirmDeleteTemplate}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  )
}

// ─── Publish panel ───

function PublishPanel({ templateId, onPublish }) {
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [overwrite, setOverwrite] = useState(false)
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [isPublishing, setIsPublishing] = useState(false)
  const [publishResult, setPublishResult] = useState(null) // null | { successCount, errors, weeksCount }
  const [publishError, setPublishError] = useState('')

  const handleApply = (start, end) => {
    setStartDate(`${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`)
    setEndDate(`${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`)
    setShowDatePicker(false)
  }

  const handlePublish = async () => {
    if (!startDate || !endDate) {
      setPublishError('Select a date range first.')
      return
    }
    setIsPublishing(true)
    setPublishResult(null)
    setPublishError('')
    try {
      const result = await onPublish(startDate, endDate, overwrite)
      setPublishResult(result)
    } catch (error) {
      console.error('Publish failed:', error)
      setPublishError(error.message)
    } finally {
      setIsPublishing(false)
    }
  }

  return (
    <div className="bg-[#141922] border border-[#2A3245] rounded-xl p-6 space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-white mb-3">Publish to weeks</h3>

        <div className="space-y-4">
          {/* Date range picker */}
          <div className="relative">
            <button
              onClick={() => setShowDatePicker(!showDatePicker)}
              className="w-full flex items-center gap-2 px-3 py-2 border border-[#2A3245] bg-[#0C0F14] rounded-lg text-sm text-gray-300 hover:border-blue-500 transition-colors"
            >
              {startDate && endDate ? (
                <span className="font-mono">{startDate} → {endDate}</span>
              ) : (
                <span>Select date range</span>
              )}
            </button>
            {showDatePicker && (
              <div className="absolute top-full left-0 mt-2 z-20">
                <CustomRangePicker
                  startDate={startDate ? new Date(startDate) : null}
                  endDate={endDate ? new Date(endDate) : null}
                  onApply={handleApply}
                  onClose={() => setShowDatePicker(false)}
                />
              </div>
            )}
          </div>

          {/* Overwrite checkbox */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={overwrite}
              onChange={e => setOverwrite(e.target.checked)}
              className="w-4 h-4 rounded border-[#2A3245] bg-[#0C0F14]"
            />
            <span className="text-sm text-gray-400">Overwrite existing schedules</span>
          </label>

          {/* Publish button */}
          <button
            onClick={handlePublish}
            disabled={!startDate || !endDate || isPublishing}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm rounded-lg transition-colors font-medium"
          >
            {isPublishing ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Publishing...
              </>
            ) : (
              <>
                <Copy size={16} /> Publish Template
              </>
            )}
          </button>

          {publishError && (
            <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-red-950/60 border border-red-800/60 text-red-300 text-xs">
              <span className="flex-1">{publishError}</span>
              <button onClick={() => setPublishError('')} className="text-gray-500 hover:text-white transition-colors text-lg leading-none shrink-0">×</button>
            </div>
          )}

          {publishResult && (
            <div className={`px-3 py-2.5 rounded-lg text-xs border ${
              publishResult.errors.length > 0
                ? 'bg-amber-950/60 border-amber-800/60 text-amber-300'
                : 'bg-emerald-950/60 border-emerald-800/60 text-emerald-300'
            }`}>
              <div className="flex items-center gap-1.5 font-medium">
                {publishResult.errors.length === 0 && <Check size={11} />}
                Published {publishResult.successCount} agent-day{publishResult.successCount !== 1 ? 's' : ''} across {publishResult.weeksCount} week{publishResult.weeksCount !== 1 ? 's' : ''}
              </div>
              {publishResult.errors.length > 0 && (
                <div className="mt-1.5 space-y-0.5">
                  <div className="text-red-400 font-medium">{publishResult.errors.length} failed:</div>
                  {publishResult.errors.map((e, i) => (
                    <div key={i} className="font-mono text-[10px] text-red-300">{e}</div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
