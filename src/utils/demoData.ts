import { DEFAULT_EXPENSE_CATEGORIES, DEFAULT_INCOME_CATEGORIES } from '../constants'
import type { Account, Budget, Category, Loan, PersistedState, Transaction } from '../types'
import { toIso } from './date'
import { subMonths } from 'date-fns'

// Builds a believable demo dataset so the app looks alive for a demo.
export function buildDemoState(): PersistedState {
  const categories: Category[] = [...DEFAULT_EXPENSE_CATEGORIES, ...DEFAULT_INCOME_CATEGORIES].map(c => ({
    ...c,
    id: crypto.randomUUID(),
  }))
  const cat = (name: string) => categories.find(c => c.name === name)!

  const card: Account = { id: crypto.randomUUID(), name: 'Карта', createdAt: Date.now() }
  const cash: Account = { id: crypto.randomUUID(), name: 'Наличные', createdAt: Date.now() }
  const savings: Account = { id: crypto.randomUUID(), name: 'Сбережения', createdAt: Date.now() }
  const accounts = [card, cash, savings]

  const loan: Loan = {
    id: crypto.randomUUID(),
    name: 'Автокредит',
    principal: 1_200_000,
    interestRate: 18,
    termMonths: 24,
    startDate: toIso(subMonths(new Date(), 3)),
    paymentType: 'annuity',
    active: true,
  }

  const transactions: Transaction[] = []
  const now = new Date()

  // Salary + rent + loan payment for the last 3 months
  for (let m = 2; m >= 0; m--) {
    const base = subMonths(now, m)
    const y = base.getFullYear()
    const mm = base.getMonth()
    // For the current month, don't generate future-dated operations.
    const maxDay = m === 0 ? now.getDate() : 28
    const day = (d: number) => toIso(new Date(y, mm, Math.min(d, maxDay)))

    transactions.push(
      { id: crypto.randomUUID(), type: 'income', amount: 450_000, accountId: card.id, categoryId: cat('Зарплата').id, date: day(5), note: 'Зарплата', createdAt: Date.now() },
      { id: crypto.randomUUID(), type: 'expense', amount: 150_000, accountId: card.id, categoryId: cat('Жильё').id, date: day(7), note: 'Аренда квартиры', createdAt: Date.now() },
      { id: crypto.randomUUID(), type: 'expense', amount: 62_000, accountId: card.id, categoryId: cat('Кредиты').id, date: day(10), note: 'Платёж по автокредиту', createdAt: Date.now(), loanId: loan.id },
      { id: crypto.randomUUID(), type: 'expense', amount: 8_500, accountId: card.id, categoryId: cat('Транспорт').id, date: day(12), note: 'Бензин', createdAt: Date.now() },
      { id: crypto.randomUUID(), type: 'expense', amount: 24_000, accountId: card.id, categoryId: cat('Продукты').id, date: day(14), note: 'Продукты на неделю', createdAt: Date.now() },
      { id: crypto.randomUUID(), type: 'expense', amount: 12_500, accountId: card.id, categoryId: cat('Кафе и рестораны').id, date: day(16), note: 'Ужин с друзьями', createdAt: Date.now() },
      { id: crypto.randomUUID(), type: 'expense', amount: 6_900, accountId: cash.id, categoryId: cat('Развлечения').id, date: day(18), note: 'Кино', createdAt: Date.now() },
      { id: crypto.randomUUID(), type: 'expense', amount: 18_000, accountId: card.id, categoryId: cat('Продукты').id, date: day(22), note: 'Продукты', createdAt: Date.now() },
      { id: crypto.randomUUID(), type: 'expense', amount: 9_800, accountId: card.id, categoryId: cat('Здоровье').id, date: day(24), note: 'Аптека', createdAt: Date.now() },
      { id: crypto.randomUUID(), type: 'income', amount: 40_000, accountId: card.id, categoryId: cat('Подработка').id, date: day(26), note: 'Фриланс', createdAt: Date.now() },
      { id: crypto.randomUUID(), type: 'expense', amount: 30_000, accountId: savings.id, categoryId: cat('Прочее').id, date: day(27), note: 'Перевод в сбережения', createdAt: Date.now() }
    )
  }

  const budgets: Budget[] = [
    { id: crypto.randomUUID(), categoryId: cat('Продукты').id, monthlyLimit: 50_000 },
    { id: crypto.randomUUID(), categoryId: cat('Кафе и рестораны').id, monthlyLimit: 20_000 },
    { id: crypto.randomUUID(), categoryId: cat('Развлечения').id, monthlyLimit: 15_000 },
  ]

  return {
    version: 1,
    accounts,
    categories,
    transactions,
    budgets,
    recurringRules: [],
    loans: [loan],
  }
}
