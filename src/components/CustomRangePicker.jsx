import { useState, useRef, useEffect } from 'react'
import { addDays, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isWithinInterval } from 'date-fns'
import { ChevronLeft, ChevronRight, Check } from 'lucide-react'

export function CustomRangePicker({ startDate, endDate, onApply, onClose }) {
  // Parse date strings to local dates (avoid UTC shift)
  const parseLocalDate = (dateStr) => {
    if (!dateStr) return null
    const [y, m, d] = dateStr.split('-').map(Number)
    return new Date(y, m - 1, d)
  }

  const [tempStart, setTempStart] = useState(parseLocalDate(startDate))
  const [tempEnd, setTempEnd] = useState(parseLocalDate(endDate))
  const [firstMonth, setFirstMonth] = useState(() => {
    const start = parseLocalDate(startDate)
    if (start) {
      return new Date(start.getFullYear(), start.getMonth(), 1)
    }
    return new Date()
  })
  const [isSelecting, setIsSelecting] = useState(tempStart ? 'end' : 'start')

  const monthPrev = () => setFirstMonth(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))
  const monthNext = () => setFirstMonth(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))

  const handleDateClick = (date) => {
    if (isSelecting === 'start') {
      setTempStart(date)
      setIsSelecting('end')
    } else {
      if (date >= tempStart) {
        setTempEnd(date)
      } else {
        setTempStart(date)
        setTempEnd(null)
        setIsSelecting('end')
      }
    }
  }

  const handleApply = () => {
    if (tempStart && tempEnd) {
      onApply(tempStart, tempEnd)
      onClose()
    }
  }

  const canApply = tempStart && tempEnd && tempStart <= tempEnd

  return (
    <div className="bg-[#141922] border border-[#2A3245] rounded-xl p-4 shadow-xl" style={{ minWidth: '580px' }}>
      <div className="grid grid-cols-2 gap-6">
        <MonthCalendar
          month={firstMonth}
          tempStart={tempStart}
          tempEnd={tempEnd}
          isSelectingStart={isSelecting === 'start'}
          onDateClick={handleDateClick}
          onPrevMonth={monthPrev}
        />
        <MonthCalendar
          month={addDays(endOfMonth(firstMonth), 1)}
          tempStart={tempStart}
          tempEnd={tempEnd}
          isSelectingStart={isSelecting === 'start'}
          onDateClick={handleDateClick}
          onNextMonth={monthNext}
        />
      </div>

      <div className="mt-4 pt-4 border-t border-[#2A3245] space-y-3">
        <div className="text-xs text-gray-500 text-left">
          {tempStart && tempEnd ? (
            <span className="font-mono">
              {tempStart.toLocaleDateString()} – {tempEnd.toLocaleDateString()}
            </span>
          ) : tempStart ? (
            <span className="font-mono">Start: {tempStart.toLocaleDateString()}</span>
          ) : (
            <span>Select start and end date</span>
          )}
        </div>
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs rounded-lg bg-[#0C0F14] hover:bg-[#1A1F2E] text-gray-400 hover:text-gray-300 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleApply}
            disabled={!canApply}
            className="px-3 py-1.5 text-xs rounded-lg bg-blue-600 hover:bg-blue-500 disabled:bg-blue-950 disabled:text-gray-600 text-white transition-colors flex items-center gap-1"
          >
            <Check size={12} /> Apply
          </button>
        </div>
      </div>
    </div>
  )
}

function MonthCalendar({ month, tempStart, tempEnd, isSelectingStart, onDateClick, onPrevMonth, onNextMonth }) {
  const monthStart = startOfMonth(month)
  const monthEnd = endOfMonth(month)
  const monthDays = eachDayOfInterval({ start: monthStart, end: monthEnd })

  // Fill in leading empty days from previous month (0=Sunday, so Sunday stays at 0)
  const firstDayOfWeek = monthStart.getDay()
  const leadingEmptyDays = Array(firstDayOfWeek).fill(null)

  const allDays = [...leadingEmptyDays, ...monthDays]

  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
  const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-white flex-1">
          {months[month.getMonth()]} {month.getFullYear()}
        </h3>
        <div className="flex gap-0.5">
          {onPrevMonth && (
            <button
              onClick={onPrevMonth}
              className="p-1.5 rounded hover:bg-[#1A1F2E] text-gray-400 hover:text-gray-300 transition-colors"
            >
              <ChevronLeft size={14} />
            </button>
          )}
          {onNextMonth && (
            <button
              onClick={onNextMonth}
              className="p-1.5 rounded hover:bg-[#1A1F2E] text-gray-400 hover:text-gray-300 transition-colors"
            >
              <ChevronRight size={14} />
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 text-[10px] text-gray-500 font-semibold mb-1">
        {dayLabels.map(day => (
          <div key={day} className="text-center h-7 flex items-center justify-center">
            {day}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {allDays.map((day, i) => {
          if (!day) {
            return <div key={`empty-${i}`} className="h-8" />
          }

          const isStart = tempStart && isSameDay(day, tempStart)
          const isEnd = tempEnd && isSameDay(day, tempEnd)
          const isInRange = tempStart && tempEnd && isWithinInterval(day, { start: tempStart, end: tempEnd })

          let bgColor = 'hover:bg-[#2A3245]'
          let textColor = 'text-gray-400'

          if (isStart || isEnd) {
            bgColor = 'bg-blue-600 hover:bg-blue-600'
            textColor = 'text-white font-semibold'
          } else if (isInRange) {
            bgColor = 'bg-blue-900/30 hover:bg-blue-900/50'
            textColor = 'text-blue-200'
          }

          return (
            <button
              key={day.toISOString()}
              onClick={() => onDateClick(day)}
              className={`h-8 rounded text-xs font-medium ${bgColor} ${textColor} transition-colors flex items-center justify-center`}
              style={{ minWidth: '32px' }}
            >
              {day.getDate()}
            </button>
          )
        })}
      </div>
    </div>
  )
}
