import { useState } from 'react'
import { X } from 'lucide-react'

const COLORS = [
  '#7C3AED','#0891B2','#059669','#D97706',
  '#DC2626','#DB2777','#65A30D','#EA580C','#0284C7'
]

export function AgentModal({ agent, onSave, onClose }) {
  const [form, setForm] = useState({
    name: agent?.name || '',
    email: agent?.email || '',
    role: agent?.role || 'phone',
    default_channel: agent?.default_channel || 'phone',
    color: agent?.color || COLORS[0],
  })

  const handle = (k, v) => setForm(f => ({ ...f, [k]: v }))

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-[#141922] border border-[#2A3245] rounded-xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#2A3245]">
          <h2 className="font-semibold text-white">{agent ? 'Edit Agent' : 'Add Agent'}</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Name</label>
            <input
              value={form.name}
              onChange={e => handle('name', e.target.value)}
              className="w-full bg-[#0C0F14] border border-[#2A3245] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
              placeholder="Agent name"
            />
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Email (optional)</label>
            <input
              value={form.email}
              onChange={e => handle('email', e.target.value)}
              className="w-full bg-[#0C0F14] border border-[#2A3245] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
              placeholder="agent@company.com"
            />
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Role</label>
            <select
              value={form.role}
              onChange={e => handle('role', e.target.value)}
              className="w-full bg-[#0C0F14] border border-[#2A3245] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
            >
              <option value="phone">Phone only</option>
              <option value="email">Email only</option>
              <option value="both">Phone + Email</option>
            </select>
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Default channel</label>
            <select
              value={form.default_channel}
              onChange={e => handle('default_channel', e.target.value)}
              className="w-full bg-[#0C0F14] border border-[#2A3245] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
            >
              <option value="phone">Phone</option>
              <option value="email">Email</option>
            </select>
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-2">Color</label>
            <div className="flex gap-2 flex-wrap">
              {COLORS.map(c => (
                <button
                  key={c}
                  onClick={() => handle('color', c)}
                  className={`w-7 h-7 rounded-full border-2 transition-all ${form.color === c ? 'border-white scale-110' : 'border-transparent'}`}
                  style={{ background: c }}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-[#2A3245] flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors">
            Cancel
          </button>
          <button
            onClick={() => onSave(form)}
            disabled={!form.name.trim()}
            className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded-lg transition-colors font-medium"
          >
            {agent ? 'Save changes' : 'Add agent'}
          </button>
        </div>
      </div>
    </div>
  )
}
