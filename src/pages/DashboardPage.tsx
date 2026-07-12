import { useState } from 'react'
import type { Tab } from '../App'
import { useTransactions } from '../hooks/useTransactions'
import { useCategories } from '../hooks/useCategories'
import { useAccounts } from '../hooks/useAccounts'
import { balanceTrend, incomeExpenseByPeriod, spendingByCategory, topCategories } from '../utils/analytics'
import SummaryBar from '../components/layout/SummaryBar'
import CategoryPieChart from '../components/charts/CategoryPieChart'
import IncomeExpenseBarChart from '../components/charts/IncomeExpenseBarChart'
import BalanceTrendChart from '../components/charts/BalanceTrendChart'
import TopCategoriesList from '../components/charts/TopCategoriesList'
import Onboarding from '../components/onboarding/Onboarding'
import styles from './DashboardPage.module.css'

const PERIODS = [
  { months: 3, label: '3 мес' },
  { months: 6, label: '6 мес' },
  { months: 12, label: '12 мес' },
]

interface Props {
  onNavigate: (tab: Tab) => void
}

export default function DashboardPage({ onNavigate }: Props) {
  const { transactions } = useTransactions()
  const { categories } = useCategories()
  const { accounts } = useAccounts()
  const [months, setMonths] = useState(6)

  if (accounts.length === 0 && transactions.length === 0) {
    return <Onboarding onNavigate={onNavigate} />
  }

  const expenseSlices = spendingByCategory(transactions, categories, 'expense')
  const incomeSlices = spendingByCategory(transactions, categories, 'income')
  const periods = incomeExpenseByPeriod(transactions, months)
  const trend = balanceTrend(transactions, months)
  const topExpense = topCategories(transactions, categories, 'expense', 5)

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
              key={p.months}
              className={`${styles.segmentButton} ${months === p.months ? styles.segmentButtonActive : ''}`}
              onClick={() => setMonths(p.months)}
              aria-pressed={months === p.months}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.grid}>
        <CategoryPieChart title="Расходы по категориям" data={expenseSlices} />
        <CategoryPieChart title="Доходы по категориям" data={incomeSlices} />
        <div className={styles.full}>
          <IncomeExpenseBarChart data={periods} />
        </div>
        <div className={styles.full}>
          <BalanceTrendChart data={trend} />
        </div>
        <div className={styles.full}>
          <TopCategoriesList title="Топ категорий расходов" data={topExpense} />
        </div>
      </div>
    </div>
  )
}
