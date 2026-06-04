import { useState, useRef, useEffect } from 'react'
import { addDays, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isWithinInterval } from 'date-fns'
import { ChevronLeft, ChevronRight, Check } from 'lucide-react'

export function CustomRangePicker({ startDate, endDate, onApply, onClose }) {
  const [tempStart, setTempStart] = useState(startDate ? new Date(startDate) : null)
  const [tempEnd, setTempEnd] = useState(endDate ? new Date(endDate) : null)
  const [firstMonth, setFirstMonth] = useState(() => {
    if (startDate) {
      const d = new Date(startDate)
      return new Date(d.getFullYear(), d.getMonth(), 1)
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
    <div className="bg-[#141922] border border-[#2A3245] rounded-xl p-4 shadow-xl">
      <div className="grid grid-cols-2 gap-4">
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

      <div className="flex items-center justify-between mt-4 pt-4 border-t border-[#2A3245]">
        <div className="text-xs text-gray-500">
          {tempStart && tempEnd ? (
            <span>
              {tempStart.toLocaleDateString()} – {tempEnd.toLocaleDateString()}
            </span>
          ) : tempStart ? (
            <span>Start: {tempStart.toLocaleDateString()}</span>
          ) : (
            <span>Select start and end date</span>
          )}
        </div>
        <div className="flex items-center gap-2">
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
    <div className="space-y-2">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold text-white">
          {months[month.getMonth()]} {month.getFullYear()}
        </h3>
        <div className="flex gap-1">
          {onPrevMonth && (
            <button
              onClick={onPrevMonth}
              className="p-1 rounded-lg hover:bg-[#1A1F2E] text-gray-400 hover:text-gray-300 transition-colors"
            >
              <ChevronLeft size={12} />
            </button>
          )}
          {onNextMonth && (
            <button
              onClick={onNextMonth}
              className="p-1 rounded-lg hover:bg-[#1A1F2E] text-gray-400 hover:text-gray-300 transition-colors"
            >
              <ChevronRight size={12} />
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 text-[9px] text-gray-600 font-semibold">
        {dayLabels.map(day => (
          <div key={day} className="text-center py-1">
            {day}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {allDays.map((day, i) => {
          if (!day) {
            return <div key={`empty-${i}`} />
          }

          const isStart = tempStart && isSameDay(day, tempStart)
          const isEnd = tempEnd && isSameDay(day, tempEnd)
          const isInRange = tempStart && tempEnd && isWithinInterval(day, { start: tempStart, end: tempEnd })
          const isCurrentSelection = isSelectingStart ? isStart : isEnd

          let bgColor = 'bg-transparent'
          let textColor = 'text-gray-400'

          if (isStart || isEnd) {
            bgColor = 'bg-blue-600'
            textColor = 'text-white font-semibold'
          } else if (isInRange) {
            bgColor = 'bg-blue-900/40'
            textColor = 'text-blue-200'
          }

          return (
            <button
              key={day.toISOString()}
              onClick={() => onDateClick(day)}
              className={`py-1.5 rounded text-xs font-medium ${bgColor} ${textColor} hover:bg-[#2A3245] transition-colors`}
            >
              {day.getDate()}
            </button>
          )
        })}
      </div>
    </div>
  )
}
