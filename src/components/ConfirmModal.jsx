export default function ConfirmModal({ title, message, confirmLabel = 'Delete', danger = true, onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={onCancel}>
      <div
        className="bg-[#141922] border border-[#2A3245] rounded-xl w-full max-w-sm shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-[#2A3245]">
          <h3 className="text-sm font-semibold text-white">{title}</h3>
          {message && <p className="text-xs text-gray-400 mt-1 leading-relaxed">{message}</p>}
        </div>
        <div className="px-5 py-3 flex gap-2 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-1.5 text-sm text-gray-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={`px-4 py-1.5 text-sm rounded-lg transition-colors font-medium ${
              danger
                ? 'bg-red-600 hover:bg-red-500 text-white'
                : 'bg-blue-600 hover:bg-blue-500 text-white'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
