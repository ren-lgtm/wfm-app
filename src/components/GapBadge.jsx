export function GapBadge({ status, children }) {
  const styles = {
    critical: 'bg-red-900/60 text-red-300 border border-red-700',
    warn:     'bg-amber-900/60 text-amber-300 border border-amber-700',
    ok:       'bg-emerald-900/60 text-emerald-300 border border-emerald-700',
    none:     'bg-gray-800 text-gray-500 border border-gray-700',
  }
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-mono ${styles[status] || styles.none}`}>
      {status === 'critical' && '⚠ '}
      {status === 'warn' && '△ '}
      {children}
    </span>
  )
}
