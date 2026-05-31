body: JSON.stringify({
        weekLabel: formatWeekLabel(currentMonday),
        phoneSLA: weeklySLA?.phoneSLA || 0,
        emailSLA: weeklySLA?.emailSLA || 0,
        days: WEEKDAYS.map(day => {
          const agentDaySlots = {}
          for (const agent of agents) {
            agentDaySlots[agent.id] = weekSchedule[agent.id]?.[day] || {}
          }
          const { phoneCov: pc, emailCov: ec } = computeCoverage(agentDaySlots)
          let gap = 'ok'
          for (let h = 12; h < 19; h++) {
            const pg = getPhoneGap(pc[h] || 0, forecast.phoneForecast[day]?.[h] || 0)
            if (pg === 'critical') { gap = 'critical'; break }
            if (pg === 'warn') gap = 'warn'
          }
          return {
            day,
            note: dayNotes[day] || null,
            gap,
            agents: agents.map(agent => {
              const slots = weekSchedule[agent.id]?.[day] || {}
              const isOff = !!slots.off
              let phoneHrs = 0, emailHrs = 0
              if (!isOff) {
                Object.values(slots).forEach(a => {
                  if (a === 'phone') phoneHrs++
                  if (a === 'email') emailHrs++
                })
              }
              return { name: agent.name, phoneHrs, emailHrs, isOff }
            }).filter(a => a.isOff || a.phoneHrs > 0 || a.emailHrs > 0)
          }
        })
      })
