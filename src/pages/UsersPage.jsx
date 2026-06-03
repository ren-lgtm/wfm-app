import { useState, useEffect } from 'react'
import { UserPlus, X, ChevronDown, Check, Mail, Shield, Star, User, Plus, Loader } from 'lucide-react'
import { supabase } from '../lib/supabase'

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
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#2A3245] bg-[#0C0F14] text-sm text-gray-200 hover:border-[#3D4A6B] transition-colors min-w-[110px]"
      >
        <span className="flex-1 text-left">{ROLE_LABELS[value]}</span>
        <ChevronDown size={13} className="text-gray-500 shrink-0" />
      </button>
      {open && (
        <div className="absolute top-full mt-1 left-0 z-20 w-full bg-[#141922] border border-[#2A3245] rounded-lg shadow-xl overflow-hidden">
          {ROLES.map(r => (
            <button
              key={r}
              type="button"
              onClick={() => { onChange(r); setOpen(false) }}
              className="w-full flex items-center justify-between px-3 py-2 text-sm text-gray-300 hover:bg-[#2A3245] hover:text-white transition-colors"
            >
              <RoleBadge role={r} />
              {value === r && <Check size={12} className="text-blue-400" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function UsersPage({ addAgent }) {
  const [users,      setUsers]      = useState([])
  const [loading,    setLoading]    = useState(true)
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
    const { data } = await supabase
      .from('app_users')
      .select('id, email, role, agent_id, agents(name)')
      .order('created_at')
    setUsers(data || [])
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

    const { error: insertErr } = await supabase
      .from('app_users')
      .insert({ email, role: inviteRole })
    if (insertErr) { setInviteError('Failed to add user.'); return }

    // Send magic link — they'll be in app_users so login will succeed
    await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } })

    setInviteSent(`Invite sent to ${email}`)
    setInviteEmail('')
    setInviteRole('member')
    setShowInvite(false)
    setTimeout(() => setInviteSent(''), 4000)
    loadUsers()
  }

  const handleAddPerson = async (e) => {
    e.preventDefault()
    setAddError('')
    if (!addName.trim()) { setAddError('Name is required.'); return }
    setAddSaving(true)
    try {
      const color = AGENT_COLORS[users.length % AGENT_COLORS.length]
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
          { email: addEmail.trim().toLowerCase(), role: addRole, agent_id: agentData?.id ?? null },
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

  const handleRoleChange = async (id, role) => {
    await supabase.from('app_users').update({ role }).eq('id', id)
    setUsers(us => us.map(u => u.id === id ? { ...u, role } : u))
  }

  const handleRemove = async (id, email) => {
    if (!window.confirm(`Remove ${email}?`)) return
    await supabase.from('app_users').delete().eq('id', id)
    setUsers(us => us.filter(u => u.id !== id))
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-white">Users</h2>
          <p className="text-xs text-gray-500 mt-0.5">{users.length} member{users.length !== 1 ? 's' : ''} · manage team access and roles</p>
        </div>
        <div className="flex items-center gap-3">
          {addSuccess  && <span className="text-xs text-emerald-400 font-mono flex items-center gap-1"><Check size={12} /> {addSuccess}</span>}
          {inviteSent  && <span className="text-xs text-emerald-400 font-mono flex items-center gap-1"><Check size={12} /> {inviteSent}</span>}
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
            <UserPlus size={13} /> Invite user
          </button>
        </div>
      </div>

      {/* Invite form */}
      {showInvite && (
        <div className="bg-[#141922] border border-[#2A3245] rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-white">Invite a team member</h3>
            <button onClick={() => { setShowInvite(false); setInviteError('') }} className="p-1 rounded hover:bg-[#2A3245] text-gray-500 hover:text-white transition-colors"><X size={14} /></button>
          </div>
          <form onSubmit={handleInvite} className="flex items-start gap-3 flex-wrap">
            <div className="flex-1 min-w-[220px]">
              <label className="block text-[11px] text-gray-500 mb-1.5 font-medium uppercase tracking-wider">Email address</label>
              <div className="relative">
                <Mail size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                <input
                  type="email" value={inviteEmail}
                  onChange={e => { setInviteEmail(e.target.value); setInviteError('') }}
                  placeholder="colleague@company.com" autoFocus
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
              <button type="submit" className="px-4 py-2 text-sm rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium transition-colors">Send invite</button>
            </div>
          </form>
          <div className="mt-4 grid grid-cols-3 gap-3">
            {ROLES.map(r => {
              const meta = ROLE_META[r]
              const Icon = meta.icon
              const desc = { member: 'Can view schedules and their own assignments.', lead: 'Can edit schedules and manage shifts.', admin: 'Full access including settings and user management.' }[r]
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
          {addError && <p className="text-[11px] text-red-400 mt-3">{addError}</p>}
          <p className="text-[11px] text-gray-600 mt-3">Adding an email also creates an app_users entry so they can log in.</p>
        </div>
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
              {users.map((user, i) => (
                <tr key={user.id} className={`border-b border-[#1A1F2E] last:border-b-0 ${i % 2 !== 0 ? 'bg-[#0C0F14]/30' : ''}`}>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-[#2A3245] flex items-center justify-center text-[11px] font-bold text-gray-300 shrink-0">
                        {user.email[0].toUpperCase()}
                      </div>
                      <div>
                        <div className="font-medium text-gray-200">{user.agents?.name ?? '—'}</div>
                        <div className="text-xs text-gray-500">{user.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <RoleDropdown value={user.role} onChange={role => handleRoleChange(user.id, role)} />
                  </td>
                  <td className="px-5 py-3 text-right">
                    <button
                      onClick={() => handleRemove(user.id, user.email)}
                      className="text-xs text-gray-600 hover:text-red-400 transition-colors"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
