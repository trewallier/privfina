export interface RecognizedSchedule {
  type: 'monthly' | 'weekly' | 'annual' | 'unsupported'
  day?: number
  month?: number
  weekday?: number
}

export function recognizeSchedule(period: string): RecognizedSchedule {
  const tokens = period.trim().split(/\s+/)
  if (tokens.length !== 5) {
    return { type: 'unsupported' }
  }

  const [, , day, month, weekday] = tokens

  if (/^([1-9]|[12]\d|3[01])$/.test(day) && month === '*' && weekday === '*') {
    return { type: 'monthly', day: Number(day) }
  }

  if (day === '*' && month === '*' && /^([0-6])$/.test(weekday)) {
    return { type: 'weekly', weekday: Number(weekday) }
  }

  if (/^([1-9]|[12]\d|3[01])$/.test(day) && /^([1-9]|1[0-2])$/.test(month) && weekday === '*') {
    return { type: 'annual', day: Number(day), month: Number(month) }
  }

  return { type: 'unsupported' }
}