import { useState } from 'react'
import { Plus, Pencil, Trash2, Check, X, GripVertical, ChevronUp, ChevronDown } from 'lucide-react'
import { DEFAULT_SHIFT_TYPES } from '../hooks/useShiftTypes'

// ─── Inline add / edit form ───────────────────────────────────────────────────

function ShiftTypeForm({ initial, onSave, onCancel }) {
  const [name,  setName]  = useState(initial?.name  || '')
  const [color, setColor] = useState(initial?.color || '#60a5fa')

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!name.trim()) return
    onSave({ name: name.trim(), color })
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex items-center gap-3 px-5 py-3 bg-[#0C0F14] border-b border-[#2A3245]"
    >
      {/* Color swatch + picker */}
      <div className="relative shrink-0">
        <div
          className="w-7 h-7 rounded-full border-2 border-[#2A3245]"
          style={{ background: color }}
        />
        <input
          type="color"
          value={color}
          onChange={e => setColor(e.target.value)}
          className="absolute inset-0 opacity-0 cursor-pointer w-full h-full rounded-full"
          title="Pick color"
        />
      </div>

      {/* Name */}
      <input
        value={name}
        onChange={e => setName(e.target.value)}
        placeholder="Shift type name…"
        autoFocus
        className="flex-1 bg-[#141922] border border-[#2A3245] rounded-lg px-3 py-1.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 transition-colors"
      />

      {/* Preview badge */}
      <span
        className="px-2.5 py-1 rounded text-xs font-medium shrink-0"
        style={{ background: color + '26', color }}
      >
        {name || 'Preview'}
      </span>

      <div className="flex gap-1.5 shrink-0">
        <button
          type="submit"
          disabled={!name.trim()}
          className="flex items-center gap-1 px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded-lg transition-colors font-medium"
        >
          <Check size={12} /> Save
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 text-xs text-gray-500 hover:text-white transition-colors"
        >
          <X size={12} />
        </button>
      </div>
    </form>
  )
}

// ─── Single row ───────────────────────────────────────────────────────────────

function ShiftTypeRow({ type, onEdit, onDelete, onUp, onDown, isFirst, isLast }) {
  return (
    <div className="flex items-center gap-3 px-5 py-3 border-b border-[#1A1F2E] last:border-b-0 group">
      {/* Reorder */}
      <div className="flex flex-col gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        <button onClick={onUp}   disabled={isFirst} className="text-gray-600 hover:text-gray-300 disabled:opacity-20 transition-colors"><ChevronUp   size={11} /></button>
        <button onClick={onDown} disabled={isLast}  className="text-gray-600 hover:text-gray-300 disabled:opacity-20 transition-colors"><ChevronDown size={11} /></button>
      </div>

      {/* Color swatch */}
      <div
        className="w-4 h-4 rounded-full shrink-0"
        style={{ background: type.color }}
      />

      {/* Name */}
      <span className="flex-1 text-sm text-gray-200 font-medium">{type.name}</span>

      {/* Preview badge */}
      <span
        className="px-2.5 py-0.5 rounded text-xs font-medium"
        style={{ background: type.color + '26', color: type.color }}
      >
        {type.name}
      </span>

      {/* ID slug */}
      <span className="text-[10px] font-mono text-gray-600 w-24 text-right shrink-0">{type.id}</span>

      {/* Actions */}
      <div className="flex gap-2 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={onEdit}
          className="p-1 text-gray-500 hover:text-blue-400 transition-colors"
          title="Edit"
        >
          <Pencil size={13} />
        </button>
        <button
          onClick={onDelete}
          className="p-1 text-gray-500 hover:text-red-400 transition-colors"
          title="Delete"
        >
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  )
}

// ─── Main Settings page ───────────────────────────────────────────────────────

export default function SettingsPage({ shiftTypes, onAdd, onUpdate, onDelete, onReorder }) {
  const [editingId, setEditingId] = useState(null) // null | 'new' | type.id

  const handleDelete = (type) => {
    if (window.confirm(`Delete "${type.name}"? Existing shifts with this type will still display, but won't be editable as this type.`)) {
      onDelete(type.id)
    }
  }

  const handleReset = () => {
    if (window.confirm('Reset shift types to defaults? This will replace your current list.')) {
      DEFAULT_SHIFT_TYPES.forEach((t, i) => {
        // Simple approach: clear and re-add via onAdd wouldn't work well since IDs might conflict.
        // Instead, parent should expose a reset. For now, delete all and re-add.
      })
      // Call onUpdate for matching IDs, onAdd for new ones — instead just signal the parent
      onAdd('__reset__') // handled specially in parent
    }
  }

  return (
    <div className="space-y-8 max-w-2xl">

      {/* Page header */}
      <div>
        <h2 className="text-base font-semibold text-white">Settings</h2>
        <p className="text-xs text-gray-500 mt-0.5">Configure workspace preferences</p>
      </div>

      {/* ── Shift Types ── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-sm font-semibold text-white">Shift Types</h3>
            <p className="text-xs text-gray-500 mt-0.5">Appear as options when adding or editing shifts in the timeline</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setEditingId('new')}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition-colors font-medium"
            >
              <Plus size={12} /> Add type
            </button>
          </div>
        </div>

        <div className="bg-[#141922] border border-[#2A3245] rounded-xl overflow-hidden">
          {/* Column headers */}
          <div className="flex items-center gap-3 px-5 py-2.5 border-b border-[#2A3245] bg-[#0C0F14]">
            <div className="w-4 shrink-0" />
            <div className="w-4 shrink-0" />
            <span className="flex-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500">Name</span>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 w-24">Preview</span>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 w-24 text-right">ID (activity)</span>
            <div className="w-12 shrink-0" />
          </div>

          {/* Add form */}
          {editingId === 'new' && (
            <ShiftTypeForm
              onSave={(form) => { onAdd(form); setEditingId(null) }}
              onCancel={() => setEditingId(null)}
            />
          )}

          {/* Rows */}
          {shiftTypes.length === 0 && editingId !== 'new' && (
            <div className="px-5 py-10 text-center text-gray-600 text-sm">
              No shift types yet. <button onClick={() => setEditingId('new')} className="text-blue-400 hover:text-blue-300">Add one</button>.
            </div>
          )}

          {shiftTypes.map((type, idx) =>
            editingId === type.id ? (
              <ShiftTypeForm
                key={type.id}
                initial={type}
                onSave={(form) => { onUpdate(type.id, form); setEditingId(null) }}
                onCancel={() => setEditingId(null)}
              />
            ) : (
              <ShiftTypeRow
                key={type.id}
                type={type}
                isFirst={idx === 0}
                isLast={idx === shiftTypes.length - 1}
                onEdit={() => setEditingId(type.id)}
                onDelete={() => handleDelete(type)}
                onUp={() => onReorder(type.id, 'up')}
                onDown={() => onReorder(type.id, 'down')}
              />
            )
          )}

          {/* Footer with reset */}
          <div className="px-5 py-3 border-t border-[#2A3245] bg-[#0C0F14] flex items-center justify-between">
            <span className="text-[11px] text-gray-600">{shiftTypes.length} type{shiftTypes.length !== 1 ? 's' : ''}</span>
            <button
              onClick={() => {
                if (window.confirm('Reset to default shift types?')) onAdd('__reset__')
              }}
              className="text-[11px] text-gray-600 hover:text-gray-400 transition-colors"
            >
              Reset to defaults
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
