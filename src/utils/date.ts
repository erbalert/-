import { addDays, addMonths, addWeeks, format, parseISO, startOfMonth as dfStartOfMonth } from 'date-fns'
import { ru } from 'date-fns/locale'
import type { RecurrenceFrequency } from '../types'

export function todayIso(): string {
  return format(new Date(), 'yyyy-MM-dd')
}

export function toIso(date: Date): string {
  return format(date, 'yyyy-MM-dd')
}

export function fromIso(iso: string): Date {
  return parseISO(iso)
}

export function addOccurrence(iso: string, frequency: RecurrenceFrequency): string {
  const date = parseISO(iso)
  const next =
    frequency === 'daily' ? addDays(date, 1) : frequency === 'weekly' ? addWeeks(date, 1) : addMonths(date, 1)
  return toIso(next)
}

export function startOfMonthIso(iso: string): string {
  return toIso(dfStartOfMonth(parseISO(iso)))
}

export function formatMonthRu(iso: string): string {
  return format(parseISO(iso), 'LLLL yyyy', { locale: ru })
}

export function formatDateRu(iso: string): string {
  return format(parseISO(iso), 'dd.MM.yyyy')
}
