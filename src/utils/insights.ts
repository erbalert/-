import type { Category, Transaction } from '../types'
import { incomeExpenseByPeriod } from './analytics'
import { normalizeMerchant } from './merchant'
import { CATEGORY_COLOR_PALETTE, OTHER_SLICE_COLOR } from '../constants'

/* ---------- Savings / cashflow ---------- */

export interface SavingsPoint {
  period: string
  label: string
  income: number
  expense: number
  net: number
}

export interface SavingsSummary {
  points: SavingsPoint[]
  avgSavingsRate: number
  totalNet: number
  totalIncome: number
  totalExpense: number
}

export function savingsByPeriod(transactions: Transaction[], months: number): SavingsSummary {
  const buckets = incomeExpenseByPeriod(transactions, months)
  const points = buckets.map(b => ({ ...b, net: b.income - b.expense }))
  const totalIncome = points.reduce((s, p) => s + p.income, 0)
  const totalExpense = points.reduce((s, p) => s + p.expense, 0)
  const totalNet = totalIncome - totalExpense
  return {
    points,
    avgSavingsRate: totalIncome > 0 ? totalNet / totalIncome : 0,
    totalNet,
    totalIncome,
    totalExpense,
  }
}

/* ---------- Subscriptions / recurring payments ---------- */

export interface Subscription {
  merchant: string
  amount: number
  count: number
  monthsActive: number
}

export function detectSubscriptions(transactions: Transaction[]): Subscription[] {
  const byMerchant = new Map<string, Transaction[]>()
  for (const t of transactions) {
    if (t.type !== 'expense') continue
    const m = normalizeMerchant(t.note ?? '')
    if (m.length < 3) continue
    if (!byMerchant.has(m)) byMerchant.set(m, [])
    byMerchant.get(m)!.push(t)
  }

  const subs: Subscription[] = []
  for (const [merchant, txs] of byMerchant) {
    // Bucket by amount rounded to nearest 100; a subscription repeats a similar amount across months.
    const byAmount = new Map<number, Set<string>>()
    const countByAmount = new Map<number, number>()
    for (const t of txs) {
      const bucket = Math.round(t.amount / 100) * 100
      if (!byAmount.has(bucket)) byAmount.set(bucket, new Set())
      byAmount.get(bucket)!.add(t.date.slice(0, 7))
      countByAmount.set(bucket, (countByAmount.get(bucket) ?? 0) + 1)
    }
    let best: { amount: number; months: number; count: number } | null = null
    for (const [amount, months] of byAmount) {
      if (!best || months.size > best.months) best = { amount, months: months.size, count: countByAmount.get(amount) ?? 0 }
    }
    if (best && best.months >= 3) {
      subs.push({ merchant, amount: best.amount, count: best.count, monthsActive: best.months })
    }
  }

  return subs.sort((a, b) => b.amount - a.amount)
}

/* ---------- Top merchants & biggest transactions ---------- */

export interface MerchantTotal {
  merchant: string
  total: number
  count: number
}

export function topMerchants(transactions: Transaction[], limit = 6): MerchantTotal[] {
  const totals = new Map<string, { total: number; count: number }>()
  for (const t of transactions) {
    if (t.type !== 'expense') continue
    const m = normalizeMerchant(t.note ?? '')
    const cur = totals.get(m) ?? { total: 0, count: 0 }
    cur.total += t.amount
    cur.count += 1
    totals.set(m, cur)
  }
  return Array.from(totals.entries())
    .map(([merchant, v]) => ({ merchant, ...v }))
    .sort((a, b) => b.total - a.total)
    .slice(0, limit)
}

export function biggestTransactions(transactions: Transaction[], limit = 6): Transaction[] {
  return transactions
    .filter(t => t.type === 'expense')
    .sort((a, b) => b.amount - a.amount)
    .slice(0, limit)
}

/* ---------- Monthly category comparison ---------- */

export interface MonthlyComparisonData {
  months: string[]
  series: { name: string; color: string; key: string }[]
  rows: Record<string, number | string>[] // recharts data: { label, [seriesKey]: value }
  deltas: { name: string; color: string; current: number; prev: number; changePct: number | null }[]
}

export function categoryMonthlyTrend(
  transactions: Transaction[],
  categories: Category[],
  months: number,
  topN = 5
): MonthlyComparisonData {
  const buckets = incomeExpenseByPeriod(transactions, months) // gives ordered periods/labels
  const periods = buckets.map(b => ({ period: b.period, label: b.label }))
  const periodSet = new Set(periods.map(p => p.period))

  // Totals per category over the window (expense only), to pick top N.
  const catTotal = new Map<string, number>()
  for (const t of transactions) {
    if (t.type !== 'expense') continue
    if (!periodSet.has(t.date.slice(0, 7))) continue
    catTotal.set(t.categoryId, (catTotal.get(t.categoryId) ?? 0) + t.amount)
  }
  const topCats = Array.from(catTotal.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([id]) => id)

  const series = topCats.map((id, i) => {
    const cat = categories.find(c => c.id === id)
    return { name: cat?.name ?? 'Категория', color: cat?.color ?? CATEGORY_COLOR_PALETTE[i % CATEGORY_COLOR_PALETTE.length], key: id }
  })

  // rows: per month, spend per top category.
  const rows: Record<string, number | string>[] = periods.map(p => {
    const row: Record<string, number | string> = { label: p.label }
    for (const id of topCats) row[id] = 0
    return row
  })
  const idxByPeriod = new Map<string, number>()
  periods.forEach((p, i) => idxByPeriod.set(p.period, i))
  for (const t of transactions) {
    if (t.type !== 'expense') continue
    if (!topCats.includes(t.categoryId)) continue
    const idx = idxByPeriod.get(t.date.slice(0, 7))
    if (idx === undefined) continue
    rows[idx][t.categoryId] = (rows[idx][t.categoryId] as number) + t.amount
  }

  // MoM deltas: last full month vs previous.
  const deltas = series.map(s => {
    const current = periods.length >= 1 ? (rows[rows.length - 1][s.key] as number) : 0
    const prev = periods.length >= 2 ? (rows[rows.length - 2][s.key] as number) : 0
    const changePct = prev > 0 ? (current - prev) / prev : null
    return { name: s.name, color: s.color, current, prev, changePct }
  })

  return { months: periods.map(p => p.label), series, rows, deltas }
}

export { OTHER_SLICE_COLOR }
