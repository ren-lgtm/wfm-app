import { useState, useCallback } from 'react'

// Generic undo/redo hook. Stores full-state snapshots in a stack.
// push(next)  — add a new state, clearing any redo branch
// undo()      — move back one step
// redo()      — move forward one step
// reset(init) — replace the entire stack with a single initial entry
export function useUndoRedo(initial) {
  const [{ stack, cursor }, setState] = useState(() => ({ stack: [initial], cursor: 0 }))

  const current  = stack[cursor]
  const canUndo  = cursor > 0
  const canRedo  = cursor < stack.length - 1
  const isDirty  = cursor > 0

  const push = useCallback((next) => {
    setState(prev => ({
      stack: [...prev.stack.slice(0, prev.cursor + 1), next],
      cursor: prev.cursor + 1,
    }))
  }, [])

  const undo = useCallback(() => {
    setState(prev => ({ ...prev, cursor: Math.max(0, prev.cursor - 1) }))
  }, [])

  const redo = useCallback(() => {
    setState(prev => ({ ...prev, cursor: Math.min(prev.stack.length - 1, prev.cursor + 1) }))
  }, [])

  const reset = useCallback((newInitial) => {
    setState({ stack: [newInitial], cursor: 0 })
  }, [])

  return { current, canUndo, canRedo, isDirty, push, undo, redo, reset }
}
