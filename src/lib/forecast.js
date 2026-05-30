export const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
export const PHONE_START = 12
export const PHONE_END = 19
export const WORK_START = 8
export const WORK_END = 21

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

export const AVG_CALLS_PER_AGENT_HOUR = 7
export const AVG_EMAILS_PER_AGENT_HOUR = 6

// SLA targets
export const PHONE_SLA_TARGET = 0.95
export const EMAIL_SLA_TARGET = 0.95

// Answer rate thresholds for color coding
export const PHONE_SLA_GREEN = 0.80  // 80%+ = green
export const PHONE_SLA_AMBER = 0.50  // 50-80% = amber, below 50% = red
export const EMAIL_SLA_GREEN = 0.80
export const EMAIL_SLA_AMBER = 0.50

export function buildForecast(phoneRows, emailRows) {
  const phoneByDayHour = {}
  const emailByDayHour = {}
  const phoneCounts = {}
  const emailCounts = {}

  for (const row of phoneRows) {
    const day = row.day_of_week
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

export function computeCoverage(agentDaySlots) {
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

// Answer rate for phones: agents × capacity / expected calls
export function phoneAnswerRate(agentsOn, expectedCalls) {
  if (!expectedCalls) return 1
  return Math.min(1, (agentsOn * AVG_CALLS_PER_AGENT_HOUR) / expectedCalls)
}

// Answer rate for email: agents × capacity / expected tickets
export function emailAnswerRate(agentsOn, expectedTickets) {
  if (!expectedTickets) return 1
  return Math.min(1, (agentsOn * AVG_EMAILS_PER_AGENT_HOUR) / expectedTickets)
}

// Gap status based on answer rate
export function getPhoneGap(agentsOn, expectedCalls) {
  if (!expectedCalls) return 'none'
  if (agentsOn === 0) return 'critical'
  const rate = phoneAnswerRate(agentsOn, expectedCalls)
  if (rate >= PHONE_SLA_GREEN) return 'ok'
  if (rate >= PHONE_SLA_AMBER) return 'warn'
  return 'critical'
}

export function getEmailGap(agentsOn, expectedTickets) {
  if (!expectedTickets) return 'none'
  if (agentsOn === 0) return 'critical'
  const rate = emailAnswerRate(agentsOn, expectedTickets)
  if (rate >= EMAIL_SLA_GREEN) return 'ok'
  if (rate >= EMAIL_SLA_AMBER) return 'warn'
  return 'critical'
}

// Agents needed to hit 95% SLA
export function agentsNeededPhone(expectedCalls) {
  return Math.ceil((expectedCalls * PHONE_SLA_TARGET) / AVG_CALLS_PER_AGENT_HOUR)
}

export function agentsNeededEmail(expectedTickets) {
  return Math.ceil((expectedTickets * EMAIL_SLA_TARGET) / AVG_EMAILS_PER_AGENT_HOUR)
}

// Weekly SLA estimate based on schedule
export function estimateWeeklySLA(weekSchedule, agents, phoneForecast, emailForecast) {
  let phoneTotalExpected = 0
  let phoneTotalAnswered = 0
  let emailTotalExpected = 0
  let emailTotalAnswered = 0

  for (const day of ['Mon','Tue','Wed','Thu','Fri']) {
    const agentDaySlots = {}
    for (const agent of agents) {
      agentDaySlots[agent.id] = weekSchedule[agent.id]?.[day] || {}
    }
    const { phoneCov, emailCov } = computeCoverage(agentDaySlots)

    for (let h = PHONE_START; h < PHONE_END; h++) {
      const vol = phoneForecast[day]?.[h] || 0
      phoneTotalExpected += vol
      phoneTotalAnswered += Math.min(vol, (phoneCov[h] || 0) * AVG_CALLS_PER_AGENT_HOUR)
    }

    for (let h = WORK_START; h < WORK_END; h++) {
      const vol = emailForecast[day]?.[h] || 0
      emailTotalExpected += vol
      emailTotalAnswered += Math.min(vol, (emailCov[h] || 0) * AVG_EMAILS_PER_AGENT_HOUR)
    }
  }

  return {
    phoneSLA: phoneTotalExpected ? Math.round((phoneTotalAnswered / phoneTotalExpected) * 100) : 0,
    emailSLA: emailTotalExpected ? Math.round((emailTotalAnswered / emailTotalExpected) * 100) : 0,
    phoneTotalExpected,
    phoneTotalAnswered: Math.round(phoneTotalAnswered),
    emailTotalExpected,
    emailTotalAnswered: Math.round(emailTotalAnswered),
  }
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
