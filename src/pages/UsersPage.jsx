import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { UserPlus, X, ChevronDown, Check, Mail, Shield, Star, User, Plus, Loader, Pencil } from 'lucide-react'
import { supabase } from '../lib/supabase'
import ConfirmModal from '../components/ConfirmModal'

const ROLES = ['member', 'lead', 'admin']
const ROLE_LABELS = { member: 'Member', lead: 'Lead', admin: 'Admin' }

const ROLE_META = {
  member: { icon: User,   color: 'text-gray-400',   bg: 'bg-gray-800/60',   border: 'border-gray-700/50'   },
  lead:   { icon: Star,   color: 'text-amber-400',  bg: 'bg-amber-900/40',  border: 'border-amber-700/50'  },
  admin:  { icon: Shield, color: 'text-blue-400',   bg: 'bg-blue-900/40',   border: 'border-blue-700/50'   },
}

const AGENT_COLORS = ['#7C3AED','#0891B2','#059669','#D97706','#DC2626','#DB2777','#65A30D','#EA580C','#0284C7']

function RoleBadge({ role }) {
  const meta = ROLE_META[role]
  const Icon = meta.icon
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium border ${meta.color} ${meta.bg} ${meta.border}`}>
      <Icon size={10} />
      {ROLE_LABELS[role]}
    </span>
  )
}

function RoleDropdown({ value, onChange }) {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState({ top: 0, left: 0, width: 0 })
  const buttonRef = useRef(null)
  const portalRef = useRef(null)

  useEffect(() => {
    if (!open || !buttonRef.current) return

    const rect = buttonRef.current.getBoundingClientRect()
    const dropdownHeight = Math.min(180, ROLES.length * 50)
    const viewportHeight = window.innerHeight
    const spaceBelow = viewportHeight - rect.bottom
    const spaceAbove = rect.top

    // Decide if dropdown should go above or below
    const positionBelow = spaceBelow > dropdownHeight || spaceAbove < dropdownHeight
    const top = positionBelow ? rect.bottom + 8 : rect.top - dropdownHeight - 8

    setPosition({
      top,
      left: rect.left,
      width: rect.width,
    })

    // Close on outside click (but not clicks inside portal)
    const handleClickOutside = (e) => {
      const isOutsideButton = buttonRef.current && !buttonRef.current.contains(e.target)
      const isOutsidePortal = portalRef.current && !portalRef.current.contains(e.target)
      if (isOutsideButton && isOutsidePortal) {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#2A3245] bg-[#0C0F14] text-sm text-gray-200 hover:border-[#3D4A6B] transition-colors min-w-[100px]"
      >
        <span className="flex-1 text-left">{ROLE_LABELS[value]}</span>
        <ChevronDown size={13} className="text-gray-500 shrink-0" />
      </button>

      {open &&
        createPortal(
          <div
            ref={portalRef}
            className="fixed z-50 bg-[#141922] border border-[#2A3245] rounded-lg shadow-xl overflow-hidden"
            style={{
              top: `${position.top}px`,
              left: `${position.left}px`,
              width: `${position.width}px`,
              minWidth: '100px',
            }}
          >
            {ROLES.map(r => (
              <button
                key={r}
                type="button"
                onClick={() => {
                  console.log('[RoleDropdown] Clicked role:', r, 'current value:', value)
                  onChange(r)
                  setOpen(false)
                }}
                className="w-full flex items-center justify-between px-3 py-2 text-sm text-gray-300 hover:bg-[#2A3245] hover:text-white transition-colors"
              >
                <RoleBadge role={r} />
                {value === r && <Check size={12} className="text-blue-400" />}
              </button>
            ))}
          </div>,
          document.body
        )
      }
    </>
  )
}

function AgentDropdown({ value, agents, onChange }) {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState({ top: 0, left: 0, width: 0 })
  const buttonRef = useRef(null)
  const portalRef = useRef(null)
  const selected = agents.find(a => a.id === value)

  useEffect(() => {
    if (!open || !buttonRef.current) return

    const rect = buttonRef.current.getBoundingClientRect()
    const dropdownHeight = Math.min(200, (agents.length + 1) * 40)
    const viewportHeight = window.innerHeight
    const spaceBelow = viewportHeight - rect.bottom
    const spaceAbove = rect.top

    // Decide if dropdown should go above or below
    const positionBelow = spaceBelow > dropdownHeight || spaceAbove < dropdownHeight
    const top = positionBelow ? rect.bottom + 8 : rect.top - dropdownHeight - 8

    setPosition({
      top,
      left: rect.left,
      width: rect.width,
    })

    // Close on outside click (but not clicks inside portal)
    const handleClickOutside = (e) => {
      const isOutsideButton = buttonRef.current && !buttonRef.current.contains(e.target)
      const isOutsidePortal = portalRef.current && !portalRef.current.contains(e.target)
      if (isOutsideButton && isOutsidePortal) {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open, agents.length])

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#2A3245] bg-[#0C0F14] text-sm text-gray-200 hover:border-[#3D4A6B] transition-colors min-w-[120px]"
      >
        {selected ? (
          <span className="flex items-center gap-1.5 flex-1 text-left">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: selected.color }} />
            {selected.name}
          </span>
        ) : (
          <span className="flex-1 text-left text-gray-500">No agent</span>
        )}
        <ChevronDown size={13} className="text-gray-500 shrink-0" />
      </button>

      {open &&
        createPortal(
          <div
            ref={portalRef}
            className="fixed z-50 bg-[#141922] border border-[#2A3245] rounded-lg shadow-xl overflow-hidden max-h-48 overflow-y-auto"
            style={{
              top: `${position.top}px`,
              left: `${position.left}px`,
              width: `${position.width}px`,
              minWidth: '120px',
            }}
          >
            <button
              type="button"
              onClick={() => { onChange(null); setOpen(false) }}
              className="w-full flex items-center px-3 py-2 text-sm text-gray-500 hover:bg-[#2A3245] transition-colors"
            >
              None
            </button>
            {agents.map(a => (
              <button
                key={a.id}
                type="button"
                onClick={() => { onChange(a.id); setOpen(false) }}
                className="w-full flex items-center justify-between gap-2 px-3 py-2 text-sm text-gray-300 hover:bg-[#2A3245] hover:text-white transition-colors"
              >
                <span className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: a.color }} />
                  {a.name}
                </span>
                {a.id === value && <Check size={12} className="text-blue-400" />}
              </button>
            ))}
          </div>,
          document.body
        )
      }
    </>
  )
}

function EditRow({ user, agents, onSave, onCancel }) {
  const [name,    setName]    = useState(user.name ?? '')
  const [role,    setRole]    = useState(user.role)
  const [agentId, setAgentId] = useState(user.agent_id ?? null)
  const [saving,  setSaving]  = useState(false)

  // Debug: log role changes
  useEffect(() => {
    console.log('[EditRow] role state changed to:', role)
  }, [role])

  const handleSave = async () => {
    setSaving(true)
    await supabase.from('app_users')
      .update({ name: name.trim() || null, role, agent_id: agentId })
      .eq('id', user.id)
    setSaving(false)
    onSave({ ...user, name: name.trim() || null, role, agent_id: agentId })
  }

  return (
    <tr className="border-b border-[#1A1F2E] bg-[#1A1F2E]/60">
      <td className="px-5 py-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-[#2A3245] flex items-center justify-center text-[11px] font-bold text-gray-300 shrink-0">
            {(user.name ?? user.email)[0].toUpperCase()}
          </div>
          <div className="space-y-1">
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Display name"
              className="bg-[#0C0F14] border border-[#2A3245] rounded px-2 py-1 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 w-40"
            />
            <div className="text-xs text-gray-500">{user.email}</div>
          </div>
        </div>
      </td>
      <td className="px-3 py-3"><RoleDropdown value={role} onChange={setRole} /></td>
      <td className="px-3 py-3"><AgentDropdown value={agentId} agents={agents} onChange={setAgentId} /></td>
      <td className="px-5 py-3 text-right">
        <div className="flex items-center justify-end gap-3">
          <button onClick={onCancel} className="text-xs text-gray-600 hover:text-gray-300 transition-colors">Cancel</button>
          <button onClick={handleSave} disabled={saving}
            className="text-xs text-blue-400 hover:text-blue-300 disabled:opacity-40 transition-colors font-medium">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </td>
    </tr>
  )
}

export default function UsersPage({ addAgent }) {
  const [users,      setUsers]      = useState([])
  const [agents,     setAgents]     = useState([])
  const [loading,    setLoading]    = useState(true)
  const [editingId,     setEditingId]     = useState(null)
  const [confirmRemove, setConfirmRemove] = useState(null) // null | { id, email }
  const [showInvite, setShowInvite] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole,  setInviteRole]  = useState('member')
  const [inviteError, setInviteError] = useState('')
  const [inviteSent,  setInviteSent]  = useState('')
  const [showAddForm, setShowAddForm] = useState(false)
  const [addName,     setAddName]     = useState('')
  const [addEmail,    setAddEmail]    = useState('')
  const [addRole,     setAddRole]     = useState('member')
  const [addError,    setAddError]    = useState('')
  const [addSaving,   setAddSaving]   = useState(false)
  const [addSuccess,  setAddSuccess]  = useState('')

  async function loadUsers() {
    setLoading(true)
    const [{ data: usersData }, { data: agentsData }] = await Promise.all([
      supabase.from('app_users').select('id, email, name, role, agent_id').order('created_at'),
      supabase.from('agents').select('id, name, color').eq('active', true).order('name'),
    ])
    setUsers(usersData || [])
    setAgents(agentsData || [])
    setLoading(false)
  }

  useEffect(() => { loadUsers() }, [])

  const handleInvite = async (e) => {
    e.preventDefault()
    setInviteError('')
    const email = inviteEmail.trim().toLowerCase()
    if (!email) { setInviteError('Email is required.'); return }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setInviteError('Enter a valid email.'); return }
    if (users.some(u => u.email.toLowerCase() === email)) { setInviteError('This email already has access.'); return }

    const { error: insertErr } = await supabase.from('app_users').insert({ email, role: inviteRole })
    if (insertErr) { setInviteError('Failed to add user.'); return }

    setInviteSent(`${email} added — they can sign in with Google`)
    setInviteEmail(''); setInviteRole('member'); setShowInvite(false)
    setTimeout(() => setInviteSent(''), 5000)
    loadUsers()
  }

  const handleAddPerson = async (e) => {
    e.preventDefault()
    setAddError('')
    if (!addName.trim()) { setAddError('Name is required.'); return }
    setAddSaving(true)
    try {
      const color = AGENT_COLORS[agents.length % AGENT_COLORS.length]
      const agentData = await addAgent?.({
        name: addName.trim(),
        email: addEmail.trim() || null,
        role: 'both',
        default_channel: 'email',
        color,
        active: true,
      })
      if (addEmail.trim()) {
        await supabase.from('app_users').upsert(
          { email: addEmail.trim().toLowerCase(), name: addName.trim(), role: addRole, agent_id: agentData?.id ?? null },
          { onConflict: 'email' }
        )
      }
      setAddSuccess(`${addName.trim()} added`)
      setAddName(''); setAddEmail(''); setAddRole('member'); setShowAddForm(false)
      setTimeout(() => setAddSuccess(''), 4000)
      loadUsers()
    } catch {
      setAddError('Failed to save — check your connection.')
    } finally {
      setAddSaving(false)
    }
  }

  const handleRemove = (id, email) => {
    setConfirmRemove({ id, email })
  }

  const confirmRemoveUser = async () => {
    const { id } = confirmRemove
    setConfirmRemove(null)
    await supabase.from('app_users').delete().eq('id', id)
    setUsers(us => us.filter(u => u.id !== id))
  }

  const handleEditSave = (updated) => {
    setUsers(us => us.map(u => u.id === updated.id ? updated : u))
    setEditingId(null)
  }

  const agentName = (agentId) => agents.find(a => a.id === agentId)?.name ?? '—'
  const displayName = (u) => u.name || u.email.split('@')[0]

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-white">Users</h2>
          <p className="text-xs text-gray-500 mt-0.5">{users.length} member{users.length !== 1 ? 's' : ''} · manage team access and roles</p>
        </div>
        <div className="flex items-center gap-3">
          {addSuccess && <span className="text-xs text-emerald-400 font-mono flex items-center gap-1"><Check size={12} /> {addSuccess}</span>}
          {inviteSent && <span className="text-xs text-emerald-400 font-mono flex items-center gap-1"><Check size={12} /> {inviteSent}</span>}
          <button
            onClick={() => { setShowAddForm(v => !v); setShowInvite(false); setAddError('') }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-[#1A1F2E] hover:bg-[#2A3245] text-gray-300 hover:text-white transition-colors font-medium border border-[#2A3245]"
          >
            <Plus size={13} /> Add person
          </button>
          <button
            onClick={() => { setShowInvite(v => !v); setShowAddForm(false) }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition-colors font-medium"
          >
            <UserPlus size={13} /> Add user
          </button>
        </div>
      </div>

      {/* Add user form (Google OAuth — just needs email in app_users) */}
      {showInvite && (
        <div className="bg-[#141922] border border-[#2A3245] rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-white">Add a user</h3>
              <p className="text-xs text-gray-500 mt-0.5">They'll be able to sign in with their Google account.</p>
            </div>
            <button onClick={() => { setShowInvite(false); setInviteError('') }} className="p-1 rounded hover:bg-[#2A3245] text-gray-500 hover:text-white transition-colors"><X size={14} /></button>
          </div>
          <form onSubmit={handleInvite} className="flex items-start gap-3 flex-wrap">
            <div className="flex-1 min-w-[220px]">
              <label className="block text-[11px] text-gray-500 mb-1.5 font-medium uppercase tracking-wider">Google email</label>
              <div className="relative">
                <Mail size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                <input
                  type="email" value={inviteEmail}
                  onChange={e => { setInviteEmail(e.target.value); setInviteError('') }}
                  placeholder="colleague@gmail.com" autoFocus
                  className="w-full bg-[#0C0F14] border border-[#2A3245] rounded-lg pl-8 pr-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 transition-colors"
                />
              </div>
              {inviteError && <p className="text-[11px] text-red-400 mt-1.5">{inviteError}</p>}
            </div>
            <div>
              <label className="block text-[11px] text-gray-500 mb-1.5 font-medium uppercase tracking-wider">Role</label>
              <RoleDropdown value={inviteRole} onChange={setInviteRole} />
            </div>
            <div className="pt-[22px]">
              <button type="submit" className="px-4 py-2 text-sm rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium transition-colors">Add</button>
            </div>
          </form>
          <div className="mt-4 grid grid-cols-3 gap-3">
            {ROLES.map(r => {
              const meta = ROLE_META[r]
              const Icon = meta.icon
              const desc = { member: 'View schedules and own assignments.', lead: 'Edit schedules and manage shifts.', admin: 'Full access including users and settings.' }[r]
              return (
                <div key={r} className={`rounded-lg p-3 border ${meta.bg} ${meta.border}`}>
                  <div className={`flex items-center gap-1.5 mb-1 text-[11px] font-semibold ${meta.color}`}><Icon size={11} /> {ROLE_LABELS[r]}</div>
                  <p className="text-[11px] text-gray-500 leading-relaxed">{desc}</p>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Add person form */}
      {showAddForm && (
        <div className="bg-[#141922] border border-[#2A3245] rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-white">Add to roster</h3>
            <button onClick={() => { setShowAddForm(false); setAddError('') }} className="p-1 rounded hover:bg-[#2A3245] text-gray-500 hover:text-white transition-colors"><X size={14} /></button>
          </div>
          <form onSubmit={handleAddPerson} className="flex items-end gap-3 flex-wrap">
            <div className="min-w-[160px]">
              <label className="block text-[11px] text-gray-500 mb-1.5 font-medium uppercase tracking-wider">Name</label>
              <input type="text" value={addName} onChange={e => { setAddName(e.target.value); setAddError('') }} placeholder="Full name" autoFocus
                className="w-full bg-[#0C0F14] border border-[#2A3245] rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 transition-colors" />
            </div>
            <div className="min-w-[180px]">
              <label className="block text-[11px] text-gray-500 mb-1.5 font-medium uppercase tracking-wider">Email (optional)</label>
              <input type="email" value={addEmail} onChange={e => setAddEmail(e.target.value)} placeholder="name@company.com"
                className="w-full bg-[#0C0F14] border border-[#2A3245] rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 transition-colors" />
            </div>
            <div>
              <label className="block text-[11px] text-gray-500 mb-1.5 font-medium uppercase tracking-wider">Role</label>
              <RoleDropdown value={addRole} onChange={setAddRole} />
            </div>
            <div className="pb-0.5">
              <button type="submit" disabled={addSaving || !addName.trim()}
                className="px-4 py-2 text-sm rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white font-medium transition-colors">
                {addSaving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </form>
          {!addName.trim() && (
            <p className="text-[11px] text-gray-600 mt-2">Enter a name to enable Save.</p>
          )}
          {addError && <p className="text-[11px] text-red-400 mt-3">{addError}</p>}
        </div>
      )}

      {confirmRemove && (
        <ConfirmModal
          title={`Remove ${confirmRemove.email}?`}
          message="They will lose access to the app immediately."
          confirmLabel="Remove"
          onConfirm={confirmRemoveUser}
          onCancel={() => setConfirmRemove(null)}
        />
      )}

      {/* Users list */}
      <div className="bg-[#141922] border border-[#2A3245] rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-[#2A3245]">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">Members · {users.length}</span>
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader size={16} className="text-gray-600 animate-spin" />
          </div>
        ) : (
          <table className="w-full text-sm">
            <tbody>
              {users.map((user, i) => {
                if (editingId === user.id) {
                  return (
                    <EditRow
                      key={user.id}
                      user={user}
                      agents={agents}
                      onSave={handleEditSave}
                      onCancel={() => setEditingId(null)}
                    />
                  )
                }
                return (
                  <tr key={user.id} className={`border-b border-[#1A1F2E] last:border-b-0 ${i % 2 !== 0 ? 'bg-[#0C0F14]/30' : ''}`}>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-[#2A3245] flex items-center justify-center text-[11px] font-bold text-gray-300 shrink-0">
                          {displayName(user)[0].toUpperCase()}
                        </div>
                        <div>
                          <div className="font-medium text-gray-200">{displayName(user)}</div>
                          <div className="text-xs text-gray-500">{user.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3"><RoleBadge role={user.role} /></td>
                    <td className="px-3 py-3 text-xs text-gray-500">{agentName(user.agent_id)}</td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex items-center justify-end gap-3">
                        <button
                          onClick={() => setEditingId(user.id)}
                          className="text-xs text-gray-600 hover:text-gray-300 transition-colors flex items-center gap-1"
                        >
                          <Pencil size={11} /> Edit
                        </button>
                        <button
                          onClick={() => handleRemove(user.id, user.email)}
                          className="text-xs text-gray-600 hover:text-red-400 transition-colors"
                        >
                          Remove
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
