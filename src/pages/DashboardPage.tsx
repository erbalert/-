import { useTransactions } from '../hooks/useTransactions'
import { useCategories } from '../hooks/useCategories'
import { balanceTrend, incomeExpenseByPeriod, spendingByCategory, topCategories } from '../utils/analytics'
import CategoryPieChart from '../components/charts/CategoryPieChart'
import IncomeExpenseBarChart from '../components/charts/IncomeExpenseBarChart'
import BalanceTrendChart from '../components/charts/BalanceTrendChart'
import TopCategoriesList from '../components/charts/TopCategoriesList'
import EmptyState from '../components/common/EmptyState'
import styles from './DashboardPage.module.css'

export default function DashboardPage() {
  const { transactions } = useTransactions()
  const { categories } = useCategories()

  if (transactions.length === 0) {
    return <EmptyState icon="📊" text="Добавьте операции, чтобы увидеть аналитику" />
  }

  const expenseSlices = spendingByCategory(transactions, categories, 'expense')
  const incomeSlices = spendingByCategory(transactions, categories, 'income')
  const periods = incomeExpenseByPeriod(transactions, 6)
  const trend = balanceTrend(transactions, 6)
  const topExpense = topCategories(transactions, categories, 'expense', 5)

  return (
    <div>
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
