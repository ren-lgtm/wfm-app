// Days mapping
export const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
export const PHONE_START = 12
export const PHONE_END = 19
export const WORK_START = 8
export const WORK_END = 21

// Baseline from our 30-day pull (fallback if DB empty)
export const BASELINE_PHONE = {
  Mon: {11:46,12:98,13:62,14:66,15:70,16:79,17:51,18:45,19:39},
  Tue: {11:45,12:132,13:79,14:72,15:75,16:85,17:71,18:48,19:29},
  Wed: {11:30,12:93,13:56,14:62,15:51,16:54,17:58,18:52,19:60},
  Thu: {11:35,12:101,13:66,14:68,15:65,16:78,17:66,18:58,19:62},
  Fri: {11:34,12:97,13:75,14:68,15:62,16:54,17:46,18:38,19:47},
  Sat: {11:21,12:11,13:15,14:12,15:16,16:17,17:2,18:9,19:4},
  Sun: {12:6,13:1,14:8,15:6,16:5,17:4,18:4,19:11},
}

export const BASELINE_EMAIL = {
  Mon: {8:11,9:16,10:10,11:6,12:11,13:16,14:17,15:25,16:6,17:7,18:6},
  Tue: {8:8,9:18,10:10,11:12,12:26,13:13,14:14,15:10,16:14,17:13,18:9},
  Wed: {8:10,9:18,10:17,11:15,12:16,13:10,14:9,15:12,16:13,17:8,18:11},
  Thu: {8:7,9:16,10:14,11:13,12:13,13:16,14:16,15:12,16:10,17:14,18:7},
  Fri: {8:14,9:16,10:13,11:15,12:13,13:8,14:13,15:10,16:9,17:3,18:17},
  Sat: {9:12,10:8,11:3,12:10,13:15,14:13,15:5,16:7,17:8,18:10},
  Sun: {9:11,10:8,11:5,12:6,13:5,14:7,15:8,16:9,17:6,18:9},
}

// Avg calls per agent per hour (weighted from our data)
export const AVG_CALLS_PER_AGENT_HOUR = 7
export const AVG_EMAILS_PER_AGENT_HOUR = 6

// Build forecast from DB data, fall back to baseline
export function buildForecast(phoneRows, emailRows) {
  const phoneByDayHour = {}
  const emailByDayHour = {}
  const phoneCounts = {}
  const emailCounts = {}

  // Aggregate DB rows by day_of_week + hour (average across dates)
  for (const row of phoneRows) {
    const day = row.day_of_week // 'Mon', 'Tue' etc from DB
    const h = row.hour
    if (!phoneByDayHour[day]) { phoneByDayHour[day] = {}; phoneCounts[day] = {} }
    if (!phoneByDayHour[day][h]) { phoneByDayHour[day][h] = 0; phoneCounts[day][h] = 0 }
    phoneByDayHour[day][h] += row.call_count
    phoneCounts[day][h]++
  }

  for (const row of emailRows) {
    const day = row.day_of_week
    const h = row.hour
    if (!emailByDayHour[day]) { emailByDayHour[day] = {}; emailCounts[day] = {} }
    if (!emailByDayHour[day][h]) { emailByDayHour[day][h] = 0; emailCounts[day][h] = 0 }
    emailByDayHour[day][h] += row.tickets_created
    emailCounts[day][h]++
  }

  // Average
  const phoneForecast = {}
  const emailForecast = {}

  for (const day of DAYS) {
    phoneForecast[day] = {}
    emailForecast[day] = {}
    for (let h = 0; h < 24; h++) {
      const pc = phoneCounts[day]?.[h]
      phoneForecast[day][h] = pc
        ? Math.round(phoneByDayHour[day][h] / pc)
        : (BASELINE_PHONE[day]?.[h] || 0)

      const ec = emailCounts[day]?.[h]
      emailForecast[day][h] = ec
        ? Math.round(emailByDayHour[day][h] / ec)
        : (BASELINE_EMAIL[day]?.[h] || 0)
    }
  }

  return { phoneForecast, emailForecast }
}

// Given slots for a day, compute per-hour phone/email agent counts
export function computeCoverage(agentDaySlots) {
  // agentDaySlots: { agentId: { hour: activity } }
  const phoneCov = {}
  const emailCov = {}

  for (let h = 0; h < 24; h++) {
    phoneCov[h] = 0
    emailCov[h] = 0
    for (const slots of Object.values(agentDaySlots)) {
      if (slots[h] === 'phone') phoneCov[h]++
      if (slots[h] === 'email') emailCov[h]++
    }
  }

  return { phoneCov, emailCov }
}

// Gap analysis for a single hour
export function getPhoneGap(agentsOn, expectedCalls) {
  const capacity = agentsOn * AVG_CALLS_PER_AGENT_HOUR
  if (expectedCalls === 0) return 'none'
  if (agentsOn === 0 && expectedCalls > 0) return 'critical'
  if (capacity < expectedCalls * 0.7) return 'critical'
  if (capacity < expectedCalls) return 'warn'
  return 'ok'
}

export function getEmailGap(agentsOn, expectedTickets) {
  const capacity = agentsOn * AVG_EMAILS_PER_AGENT_HOUR
  if (expectedTickets === 0) return 'none'
  if (agentsOn === 0 && expectedTickets > 5) return 'critical'
  if (capacity < expectedTickets * 0.6) return 'warn'
  return 'ok'
}

export function coveragePct(agentsOn, expectedCalls) {
  if (!expectedCalls) return 100
  return Math.min(100, Math.round((agentsOn * AVG_CALLS_PER_AGENT_HOUR / expectedCalls) * 100))
}

export function hLabel(h) {
  if (h === 0) return '12am'
  if (h < 12) return `${h}am`
  if (h === 12) return '12pm'
  return `${h - 12}pm`
}

export function getDayOfWeek(date) {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  return days[new Date(date).getDay()]
}

export function getMondayOfWeek(date) {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff)
  d.setHours(0, 0, 0, 0)
  return d
}

export function formatWeekLabel(monday) {
  const d = new Date(monday)
  const end = new Date(d)
  end.setDate(end.getDate() + 6)
  const opts = { month: 'short', day: 'numeric' }
  return `${d.toLocaleDateString('en-US', opts)} – ${end.toLocaleDateString('en-US', opts)}`
}

export function toISODate(date) {
  return new Date(date).toISOString().split('T')[0]
}
