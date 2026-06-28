import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { ChevronRight, Copy, Plus, Trash2, X, Check, Undo2, Redo2 } from 'lucide-react'
import { useUndoRedo } from '../hooks/useUndoRedo'
import { supabase } from '../lib/supabase'
import { CustomRangePicker } from '../components/CustomRangePicker'
import { useShiftTypes, DEFAULT_SHIFT_TYPES } from '../hooks/useShiftTypes'
import { hLabel, qLabel, getMondayOfWeek, toISODate, DAYS, WORK_START, WORK_END } from '../lib/forecast'
import ConfirmModal from '../components/ConfirmModal'

const DAYS_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
const DAYS_FULL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
const HOUR_COL_W = 48
const QUARTERS_PER_HOUR = 4
const QUARTERS_PER_DAY = 96
const QUARTER_W = HOUR_COL_W / QUARTERS_PER_HOUR // 12px
const ALL_QUARTERS = Array.from({ length: QUARTERS_PER_DAY }, (_, i) => i)

// ─── Modal for editing a shift in the template ───

function ShiftModal({ agent, dow, clickedQuarter, agentSlots, shiftTypes, onClose, onApply }) {
  const existingActivity = agentSlots[clickedQuarter]
  const isEditing = !!existingActivity && existingActivity !== 'off'

  const { blockStart, blockEnd } = useMemo(() => {
    if (!isEditing) return { blockStart: clickedQuarter, blockEnd: clickedQuarter }
    const act = agentSlots[clickedQuarter]
    let start = clickedQuarter, end = clickedQuarter
    while (start > 0 && agentSlots[start - 1] === act) start--
    while (end < QUARTERS_PER_DAY - 1 && agentSlots[end + 1] === act) end++
    return { blockStart: start, blockEnd: end }
  }, [isEditing, clickedQuarter, agentSlots])

  const [channel, setChannel] = useState(() => {
    if (isEditing && shiftTypes?.find(t => t.id === existingActivity)) return existingActivity
    const defaultType = shiftTypes?.find(t => t.id === (agent.default_channel || 'email'))
    return defaultType?.id ?? shiftTypes?.[0]?.id ?? 'email'
  })
  // Quarter units (0-95). endQ is EXCLUSIVE — the time the shift ends.
  // New shifts default to a 1-hour block; edits open at the existing extent.
  const [startQ, setStartQ] = useState(blockStart)
  const [endQ, setEndQ] = useState(isEditing ? blockEnd + 1 : Math.min(QUARTERS_PER_DAY, blockStart + QUARTERS_PER_HOUR))

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
    // endQ is exclusive — fill startQ .. endQ-1 (quarter units)
    const changes = []
    if (isEditing) {
      for (let q = blockStart; q <= blockEnd; q++) {
        if (q < startQ || q >= endQ) changes.push({ hour: q, activity: null })
      }
    }
    for (let q = startQ; q < endQ; q++) changes.push({ hour: q, activity: channel })
    onApply(agent.id, dow, changes)
    onClose()
  }

  const handleDelete = () => {
    const changes = []
    for (let q = blockStart; q <= blockEnd; q++) changes.push({ hour: q, activity: null })
    onApply(agent.id, dow, changes)
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
                value={startQ}
                onChange={e => {
                  const q = Number(e.target.value)
                  setStartQ(q)
                  if (endQ <= q) setEndQ(q + 1)
                }}
                className="w-full bg-[#0C0F14] border border-[#2A3245] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
              >
                {ALL_QUARTERS.map(q => (
                  <option key={q} value={q}>{qLabel(q)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1.5 font-medium">End time</label>
              <select
                value={endQ}
                onChange={e => setEndQ(Number(e.target.value))}
                className="w-full bg-[#0C0F14] border border-[#2A3245] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
              >
                {Array.from({ length: QUARTERS_PER_DAY }, (_, q) => q + 1)
                  .filter(q => q > startQ)
                  .map(q => (
                    <option key={q} value={q}>{qLabel(q % QUARTERS_PER_DAY)}</option>
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

function WeekTemplateGrid({ template, agents, shiftTypes, onSave }) {
  const [shiftModal, setShiftModal] = useState(null)
  const [drag, setDrag] = useState(null)
  const dragRef = useRef(null)
  const containerRef = useRef(null)
  const outerRef = useRef(null)
  const pointerDownRef = useRef(null)
  const dragStartedRef = useRef(false)

  // Keep dragRef in sync with drag state
  useEffect(() => { dragRef.current = drag }, [drag])

  // ── Local editable state with undo/redo ────────────────────────────────────
  const canonical = useMemo(() => (template?.slots ? template.slots : {}), [template?.slots])

  const { current: localSlots, canUndo, canRedo, isDirty, push, undo, redo, reset } =
    useUndoRedo(canonical)

  // Sync local state to canonical when the DB data changes (template switch,
  // post-save refetch) — but never clobber unsaved edits.
  const canonicalSig = useMemo(() => JSON.stringify(canonical), [canonical])
  const isDirtyRef = useRef(isDirty)
  isDirtyRef.current = isDirty
  useEffect(() => {
    if (!isDirtyRef.current) reset(JSON.parse(canonicalSig))
  }, [canonicalSig]) // eslint-disable-line react-hooks/exhaustive-deps

  const localSlotsRef = useRef(localSlots)
  localSlotsRef.current = localSlots
  const canonicalRef = useRef(canonical)
  canonicalRef.current = canonical

  // Apply a batch of slot changes (across potentially multiple agent/day combos)
  const applyChanges = useCallback((changes) => {
    const prev = localSlotsRef.current
    const next = JSON.parse(JSON.stringify(prev))
    for (const { agentId, day, hour, activity } of changes) {
      if (!next[agentId]) next[agentId] = {}
      if (!next[agentId][day]) next[agentId][day] = {}
      if (activity === null) delete next[agentId][day][hour]
      else next[agentId][day][hour] = activity
    }
    push(next)
  }, [push])

  // Called from ShiftModal: (agentId, day, [{hour, activity}])
  const handleApplySlots = useCallback((agentId, day, changes) => {
    applyChanges(changes.map(c => ({ agentId, day, ...c })))
  }, [applyChanges])

  const [isSaving, setIsSaving] = useState(false)

  const handleSave = useCallback(async () => {
    setIsSaving(true)
    try {
      await onSave(localSlotsRef.current)
      reset(localSlotsRef.current)
    } finally {
      setIsSaving(false)
    }
  }, [onSave, reset])

  const handleDiscard = useCallback(() => reset(JSON.parse(JSON.stringify(canonicalRef.current))), [reset])

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e) => {
      if (!(e.metaKey || e.ctrlKey)) return
      if (e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo() }
      if (e.key === 'z' &&  e.shiftKey) { e.preventDefault(); redo() }
      if (e.key === 'y')                { e.preventDefault(); redo() }
      if (e.key === 's' && isDirty)     { e.preventDefault(); handleSave() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo, redo, isDirty, handleSave])

  // Show full 24-hour day (PT): 12am-11pm
  const hours = Array.from({ length: 24 }, (_, i) => i)

  if (!template) {
    return <div className="text-gray-400 text-center py-8">Select or create a template to edit</div>
  }

  // Convert a screen X to a quarter (0-95) WITHIN the given day's column.
  // Measures the target day column's real width from the DOM (tagged
  // data-day-col) so the math is exact for every day and any column width.
  const clientXToQuarter = (clientX, day) => {
    const container = containerRef.current
    if (!container) return null
    const dayEl = container.querySelector(`[data-day-col="${day}"]`)
    if (!dayEl) return null
    const rect = dayEl.getBoundingClientRect()
    const q = Math.floor((clientX - rect.left) / (rect.width / QUARTERS_PER_DAY))
    return Math.max(0, Math.min(QUARTERS_PER_DAY - 1, q))
  }

  const handlePointerMove = (e) => {
    const MAXQ = QUARTERS_PER_DAY - 1
    // Check if this is a potential shift block drag starting
    if (pointerDownRef.current && !dragStartedRef.current) {
      const dx = Math.abs(e.clientX - pointerDownRef.current.x)
      const dy = Math.abs(e.clientY - pointerDownRef.current.y)
      // If moved more than 12px, treat as drag start (matches standard touch threshold)
      if (dx > 12 || dy > 12) {
        dragStartedRef.current = true
        const pd = pointerDownRef.current
        const q = clientXToQuarter(e.clientX, pd.day)
        setDrag({
          type: 'move',
          agentId: pd.agent.id,
          day: pd.day,
          origStart: pd.startH,
          origEnd: pd.endH,
          activity: pd.activity,
          offsetH: q !== null ? q - pd.startH : 0,
          previewStart: pd.startH,
          previewEnd: pd.endH,
        })
      }
    }

    setDrag(currentDrag => {
      if (!currentDrag) return null
      const q = clientXToQuarter(e.clientX, currentDrag.day)
      if (q === null) return currentDrag

      if (currentDrag.type === 'move') {
        const len = currentDrag.origEnd - currentDrag.origStart
        const newStart = Math.max(0, Math.min(MAXQ - len, q - currentDrag.offsetH))
        const newEnd = newStart + len
        return { ...currentDrag, previewStart: newStart, previewEnd: newEnd }
      } else {
        if (currentDrag.edge === 'right') {
          const newEnd = Math.max(currentDrag.origStart, Math.min(MAXQ, q))
          return { ...currentDrag, previewEnd: newEnd }
        } else {
          const newStart = Math.min(currentDrag.origEnd, Math.max(0, q))
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
    if (pointerDownRef.current && !dragStartedRef.current) {
      const pd = pointerDownRef.current
      openShiftModal(pd.agent, pd.day, pd.startH)
    }
    pointerDownRef.current = null
    dragStartedRef.current = false

    const currentDrag = dragRef.current
    if (!currentDrag) return
    const { type, agentId, day, origStart, origEnd, activity, previewStart, previewEnd, edge } = currentDrag
    setDrag(null)

    const changes = []
    if (type === 'move') {
      for (let h = origStart; h <= origEnd; h++) {
        if (h < previewStart || h > previewEnd) changes.push({ agentId, day, hour: h, activity: null })
      }
      for (let h = previewStart; h <= previewEnd; h++) {
        if (h < origStart || h > origEnd) changes.push({ agentId, day, hour: h, activity })
      }
    } else {
      if (edge === 'right') {
        if (previewEnd > origEnd) {
          for (let h = origEnd + 1; h <= previewEnd; h++) changes.push({ agentId, day, hour: h, activity })
        } else {
          for (let h = previewEnd + 1; h <= origEnd; h++) changes.push({ agentId, day, hour: h, activity: null })
        }
      } else {
        if (previewStart < origStart) {
          for (let h = previewStart; h < origStart; h++) changes.push({ agentId, day, hour: h, activity })
        } else {
          for (let h = origStart; h < previewStart; h++) changes.push({ agentId, day, hour: h, activity: null })
        }
      }
    }
    if (changes.length > 0) applyChanges(changes)
  }

  const openShiftModal = (agent, day, startQ) => {
    const agentDaySlots = localSlotsRef.current[agent.id]?.[day] || {}
    setShiftModal({ agent, day, clickedQuarter: startQ, agentSlots: agentDaySlots })
  }

  return (
    <>
      {/* Unsaved changes bar */}
      {isDirty && (
        <div className="flex items-center gap-1.5 px-3 py-2 border border-[#2A3245] rounded-xl mb-3 bg-[#4F7EF8]/5 border-[#4F7EF8]/20">
          <span className="text-[11px] text-gray-500 mr-1">Unsaved changes</span>
          <button onClick={undo} disabled={!canUndo} title="Undo (Cmd+Z)"
            className="p-1 rounded text-gray-400 hover:text-white disabled:opacity-25 disabled:cursor-not-allowed transition-colors">
            <Undo2 size={13} />
          </button>
          <button onClick={redo} disabled={!canRedo} title="Redo (Cmd+Shift+Z)"
            className="p-1 rounded text-gray-400 hover:text-white disabled:opacity-25 disabled:cursor-not-allowed transition-colors">
            <Redo2 size={13} />
          </button>
          <div className="flex-1" />
          <button onClick={handleDiscard}
            className="px-2.5 py-1 text-xs text-gray-500 hover:text-gray-300 transition-colors">
            Discard
          </button>
          <button onClick={handleSave} disabled={isSaving}
            className="flex items-center gap-1.5 px-3 py-1 text-xs bg-[#4F7EF8] hover:bg-[#3D6CE6] disabled:opacity-50 text-white rounded-lg transition-colors font-medium">
            {isSaving
              ? <><div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Saving…</>
              : 'Save'}
          </button>
        </div>
      )}

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
                    const slots = localSlots[agent.id]?.[day] || {}
                    const isBeingDragged = drag && drag.agentId === agent.id && drag.day === day

                    // Build runs of contiguous activities (quarter units). While
                    // dragging, hide only the block being dragged (its original
                    // quarters) — other shifts in the same cell stay visible.
                    const runs = []
                    let i = 0
                    while (i < QUARTERS_PER_DAY) {
                      const h = i
                      const isDraggedBlock = isBeingDragged && h >= drag.origStart && h <= drag.origEnd
                      const act = isDraggedBlock ? null : (slots[h] || null)
                      if (!act) {
                        let j = i + 1
                        while (j < QUARTERS_PER_DAY) {
                          const draggedJ = isBeingDragged && j >= drag.origStart && j <= drag.origEnd
                          if ((draggedJ ? null : (slots[j] || null)) !== null) break
                          j++
                        }
                        runs.push({ startH: h, endH: j - 1, activity: null, span: j - i })
                        i = j
                      } else {
                        let j = i + 1
                        while (j < QUARTERS_PER_DAY && slots[j] === act) j++
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
                      <td key={day} data-day-col={day} className="border-r border-[#2A3245] p-0 bg-[#141922]" style={{ minWidth: HOUR_COL_W * 24, height: 32 }}>
                        <div className="flex relative w-full h-full">
                          {/* Empty cells + invisible spacers for shift blocks so flex positions stay in sync with the hour grid */}
                          {runs.map(({ startH, activity, span }) => {
                            if (activity) {
                              // Spacer holds the correct width in the flex flow — the absolute shift block renders on top
                              return <div key={`spacer-${startH}`} style={{ width: `${QUARTER_W * span}px`, flexShrink: 0 }} />
                            }
                            return (
                              <div
                                key={`empty-${startH}`}
                                className="border-r border-[#2A3245] hover:bg-[#2A3245]/20 cursor-pointer active:bg-[#2A3245]/70"
                                style={{ width: `${QUARTER_W * span}px`, height: '100%', flexShrink: 0 }}
                                onClick={() => openShiftModal(agent, day, startH)}
                              />
                            )
                          })}

                          {/* Drag preview - show semi-transparent preview block while dragging */}
                          {isBeingDragged && previewRuns.length > 0 && (
                            <div
                              className="absolute opacity-60"
                              style={{
                                top: '0',
                                bottom: '0',
                                left: `${drag.previewStart * QUARTER_W}px`,
                                width: `${(drag.previewEnd - drag.previewStart + 1) * QUARTER_W}px`,
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
                                className={`absolute cursor-grab active:cursor-grabbing transition-all ${isBeingDragged ? 'opacity-50' : 'hover:brightness-110 hover:shadow-lg'}`}
                                style={{
                                  top: '0',
                                  bottom: '0',
                                  left: `${startH * QUARTER_W}px`,
                                  width: `${span * QUARTER_W}px`,
                                  background: shiftType?.color || '#666',
                                  boxShadow: isBeingDragged ? '0 0 0 2px rgba(255,255,255,0.2)' : undefined,
                                }}
                                onPointerDown={(e) => {
                                  e.stopPropagation()
                                  outerRef.current?.setPointerCapture(e.pointerId)
                                  pointerDownRef.current = { x: e.clientX, y: e.clientY, agent, day, startH, endH, activity }
                                }}
                                title="Click to edit · drag to move · drag edges to resize"
                              >
                                {/* Left resize handle */}
                                <div
                                  className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/25 rounded-l"
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
                                  className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/25 rounded-r"
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
          clickedQuarter={shiftModal.clickedQuarter}
          agentSlots={shiftModal.agentSlots}
          shiftTypes={shiftTypes}
          onClose={() => setShiftModal(null)}
          onApply={handleApplySlots}
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

  // Persist the full local slots map to the DB by diffing against templateData,
  // then refetch so templateData reflects the saved state.
  const handleSaveTemplate = async (localSlots) => {
    if (!selectedTemplate) return
    const canon = templateData?.slots || {}

    // Collect per-(agent,day) writes that differ from the canonical state
    const dirtyDays = []
    const agentIds = new Set([...Object.keys(localSlots), ...Object.keys(canon)])
    for (const agentId of agentIds) {
      for (const day of DAYS_SHORT) {
        const local = localSlots[agentId]?.[day] || {}
        const prev  = canon[agentId]?.[day] || {}
        if (JSON.stringify(local) !== JSON.stringify(prev)) {
          dirtyDays.push({ agentId, day, slots: local })
        }
      }
    }

    for (const { agentId, day, slots } of dirtyDays) {
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
      if (!sched) continue

      // Replace all slots for this schedule with the local set
      await supabase.from('template_slots').delete().eq('template_schedule_id', sched.id)
      const rows = Object.entries(slots)
        .filter(([k]) => k !== 'off')
        .map(([hour, activity]) => ({ template_schedule_id: sched.id, hour: parseInt(hour), activity }))
      if (rows.length > 0) {
        await supabase.from('template_slots').upsert(rows, { onConflict: 'template_schedule_id,hour' })
      }
    }

    // Refetch canonical state
    const { data: schedules } = await supabase
      .from('template_schedules')
      .select('*, template_slots(*)')
      .eq('template_id', selectedTemplate)

    const slots = {}
    for (const s of (schedules || [])) {
      if (!slots[s.agent_id]) slots[s.agent_id] = {}
      const daySlots = {}
      for (const slot of s.template_slots || []) daySlots[slot.hour] = slot.activity
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
          onSave={handleSaveTemplate}
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
