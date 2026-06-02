import { useState } from 'react'

const STORAGE_KEY = 'wfm-shift-types'

export const DEFAULT_SHIFT_TYPES = [
  { id: 'email',       name: 'Email',       color: '#60a5fa' },
  { id: 'phone',       name: 'Phone',       color: '#34d399' },
  { id: 'lunch',       name: 'Lunch',       color: '#fbbf24' },
  { id: 'break',       name: 'Break',       color: '#a78bfa' },
  { id: 'meeting',     name: 'Meeting',     color: '#818cf8' },
  { id: 'training',    name: 'Training',    color: '#4ade80' },
  { id: 'off_queue',   name: 'Off Queue',   color: '#f87171' },
  { id: 'back_office', name: 'Back Office', color: '#c084fc' },
]

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : DEFAULT_SHIFT_TYPES
  } catch {
    return DEFAULT_SHIFT_TYPES
  }
}

function persist(types) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(types))
}

function makeId(name) {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/, '')
  return base || `type_${Date.now().toString(36)}`
}

export function useShiftTypes() {
  const [shiftTypes, setShiftTypes] = useState(load)

  const save = (types) => {
    setShiftTypes(types)
    persist(types)
  }

  const addShiftType = ({ name, color }) => {
    const id = makeId(name)
    save([...shiftTypes, { id, name, color }])
  }

  const updateShiftType = (id, { name, color }) => {
    save(shiftTypes.map(t => t.id === id ? { ...t, name, color } : t))
  }

  const deleteShiftType = (id) => {
    save(shiftTypes.filter(t => t.id !== id))
  }

  const reorderShiftType = (id, direction) => {
    const idx = shiftTypes.findIndex(t => t.id === id)
    if (idx === -1) return
    const next = [...shiftTypes]
    const swap = direction === 'up' ? idx - 1 : idx + 1
    if (swap < 0 || swap >= next.length) return
    ;[next[idx], next[swap]] = [next[swap], next[idx]]
    save(next)
  }

  return { shiftTypes, addShiftType, updateShiftType, deleteShiftType, reorderShiftType }
}
