import { useState } from 'react'
import type { Tab } from '../App'
import { useTransactions } from '../hooks/useTransactions'
import { useCategories } from '../hooks/useCategories'
import { useAccounts } from '../hooks/useAccounts'
import {
  balanceTrend,
  incomeExpenseByPeriod,
  monthsSpan,
  scopeByMonths,
  spendingByCategory,
  topCategories,
} from '../utils/analytics'
import { NON_SPENDING_CATEGORY_NAMES } from '../constants'
import SummaryBar from '../components/layout/SummaryBar'
import CategoryPieChart from '../components/charts/CategoryPieChart'
import IncomeExpenseBarChart from '../components/charts/IncomeExpenseBarChart'
import BalanceTrendChart from '../components/charts/BalanceTrendChart'
import TopCategoriesList from '../components/charts/TopCategoriesList'
import CashflowWidget from '../components/insights/CashflowWidget'
import LoanBurdenWidget from '../components/insights/LoanBurdenWidget'
import SubscriptionsWidget from '../components/insights/SubscriptionsWidget'
import MerchantsWidget from '../components/insights/MerchantsWidget'
import MonthlyComparison from '../components/insights/MonthlyComparison'
import Onboarding from '../components/onboarding/Onboarding'
import styles from './DashboardPage.module.css'

type PeriodSel = 3 | 6 | 12 | 'all'
const PERIODS: { value: PeriodSel; label: string }[] = [
  { value: 3, label: '3 мес' },
  { value: 6, label: '6 мес' },
  { value: 12, label: '12 мес' },
  { value: 'all', label: 'Всё' },
]

interface Props {
  onNavigate: (tab: Tab) => void
}

export default function DashboardPage({ onNavigate }: Props) {
  const { transactions } = useTransactions()
  const { categories } = useCategories()
  const { accounts } = useAccounts()
  const [sel, setSel] = useState<PeriodSel>(6)

  if (accounts.length === 0 && transactions.length === 0) {
    return <Onboarding onNavigate={onNavigate} />
  }

  const months = sel === 'all' ? monthsSpan(transactions) : sel
  const scoped = scopeByMonths(transactions, months)

  // Consumption view excludes money-movement categories (transfers, loan payments)
  // so merchant/subscription/biggest widgets reflect real spending, not transfers.
  const nonSpendingIds = new Set(
    categories.filter(c => NON_SPENDING_CATEGORY_NAMES.includes(c.name)).map(c => c.id)
  )
  const consumption = scoped.filter(t => !nonSpendingIds.has(t.categoryId))

  const expenseSlices = spendingByCategory(scoped, categories, 'expense')
  const incomeSlices = spendingByCategory(scoped, categories, 'income')
  const periods = incomeExpenseByPeriod(transactions, months)
  const trend = balanceTrend(transactions, months)
  const topExpense = topCategories(scoped, categories, 'expense', 5)

  return (
    <div>
      <div className={styles.hero}>
        <SummaryBar />
      </div>

      <div className={styles.toolbar}>
        <h2 className={styles.sectionTitle}>Аналитика</h2>
        <div className={styles.segment} role="tablist" aria-label="Период">
          {PERIODS.map(p => (
            <button
              key={String(p.value)}
              className={`${styles.segmentButton} ${sel === p.value ? styles.segmentButtonActive : ''}`}
              onClick={() => setSel(p.value)}
              aria-pressed={sel === p.value}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.grid}>
        <CashflowWidget transactions={scoped} months={months} />
        <LoanBurdenWidget transactions={scoped} onNavigate={onNavigate} />

        <CategoryPieChart title="Расходы по категориям" data={expenseSlices} />
        <CategoryPieChart title="Доходы по категориям" data={incomeSlices} />

        <div className={styles.full}>
          <IncomeExpenseBarChart data={periods} />
        </div>
        <div className={styles.full}>
          <BalanceTrendChart data={trend} />
        </div>

        <SubscriptionsWidget transactions={consumption} />
        <MerchantsWidget transactions={consumption} variant="merchants" />

        <MerchantsWidget transactions={consumption} variant="biggest" />
        <TopCategoriesList title="Топ категорий расходов" data={topExpense} />

        <div className={styles.full}>
          <MonthlyComparison transactions={transactions} categories={categories} months={months} />
        </div>
      </div>
    </div>
  )
}
