import { format, parseISO, subMonths } from 'date-fns'
import { ru } from 'date-fns/locale'
import type { Category, Transaction, TransactionType } from '../types'
import { CATEGORY_COLOR_PALETTE, MAX_PIE_SLICES, OTHER_SLICE_COLOR } from '../constants'
import { todayIso } from './date'

export interface CategorySlice {
  categoryId: string
  name: string
  color: string
  amount: number
}

export interface PeriodBucket {
  period: string
  label: string
  income: number
  expense: number
}

export interface BalancePoint {
  period: string
  label: string
  balance: number
}

export function spendingByCategory(
  transactions: Transaction[],
  categories: Category[],
  type: TransactionType
): CategorySlice[] {
  const totals = new Map<string, number>()
  for (const t of transactions) {
    if (t.type !== type) continue
    totals.set(t.categoryId, (totals.get(t.categoryId) ?? 0) + t.amount)
  }

  const slices: CategorySlice[] = Array.from(totals.entries())
    .map(([categoryId, amount]) => {
      const category = categories.find(c => c.id === categoryId)
      return { categoryId, name: category?.name ?? 'Без категории', color: category?.color ?? CATEGORY_COLOR_PALETTE[0], amount }
    })
    .sort((a, b) => b.amount - a.amount)

  if (slices.length <= MAX_PIE_SLICES) return slices

  const top = slices.slice(0, MAX_PIE_SLICES - 1)
  const rest = slices.slice(MAX_PIE_SLICES - 1)
  const otherAmount = rest.reduce((sum, s) => sum + s.amount, 0)
  return [...top, { categoryId: '__other__', name: 'Другое', color: OTHER_SLICE_COLOR, amount: otherAmount }]
}

export function topCategories(
  transactions: Transaction[],
  categories: Category[],
  type: TransactionType,
  limit = 5
): CategorySlice[] {
  return spendingByCategory(transactions, categories, type)
    .filter(s => s.categoryId !== '__other__')
    .slice(0, limit)
}

export function incomeExpenseByPeriod(transactions: Transaction[], monthsBack = 6): PeriodBucket[] {
  const buckets: PeriodBucket[] = []
  const today = parseISO(todayIso())

  for (let i = monthsBack - 1; i >= 0; i--) {
    const monthDate = subMonths(today, i)
    const period = format(monthDate, 'yyyy-MM')
    buckets.push({ period, label: format(monthDate, 'LLL yyyy', { locale: ru }), income: 0, expense: 0 })
  }

  const byPeriod = new Map(buckets.map(b => [b.period, b]))
  for (const t of transactions) {
    const period = t.date.slice(0, 7)
    const bucket = byPeriod.get(period)
    if (!bucket) continue
    if (t.type === 'income') bucket.income += t.amount
    else bucket.expense += t.amount
  }

  return buckets
}

export function balanceTrend(transactions: Transaction[], monthsBack = 6): BalancePoint[] {
  const today = parseISO(todayIso())
  const startPeriod = format(subMonths(today, monthsBack - 1), 'yyyy-MM')

  const startingBalance = transactions
    .filter(t => t.date.slice(0, 7) < startPeriod)
    .reduce((sum, t) => sum + (t.type === 'income' ? t.amount : -t.amount), 0)

  const buckets = incomeExpenseByPeriod(transactions, monthsBack)
  let running = startingBalance
  return buckets.map(b => {
    running += b.income - b.expense
    return { period: b.period, label: b.label, balance: running }
  })
}
