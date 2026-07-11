import { useBudgets } from '../../hooks/useBudgets'
import { useCategories } from '../../hooks/useCategories'
import { formatMoney } from '../../utils/money'
import EmptyState from '../common/EmptyState'
import CategoryBadge from '../categories/CategoryBadge'
import BudgetProgressBar from './BudgetProgressBar'
import styles from './BudgetProgressList.module.css'

export default function BudgetProgressList() {
  const { progressForCurrentMonth, deleteBudget } = useBudgets()
  const { byId } = useCategories()
  const items = progressForCurrentMonth()

  if (items.length === 0) {
    return <EmptyState icon="🎯" text="Пока нет ни одного бюджета" />
  }

  return (
    <div>
      {items.map(({ budget, spent, ratio, overLimit }) => (
        <div className={styles.item} key={budget.id}>
          <div className={styles.topRow}>
            <CategoryBadge category={byId(budget.categoryId)} />
            <div>
              <span className={styles.amounts}>
                {formatMoney(spent)} / {formatMoney(budget.monthlyLimit)}
              </span>
              <button className={styles.deleteButton} onClick={() => deleteBudget(budget.id)} aria-label="Удалить бюджет">
                🗑️
              </button>
            </div>
          </div>
          <BudgetProgressBar ratio={ratio} />
          {overLimit && (
            <div className={styles.status}>
              <span>🔴</span>
              <span>Бюджет превышен на {formatMoney(spent - budget.monthlyLimit)}</span>
            </div>
          )}
          {!overLimit && ratio >= 0.7 && (
            <div className={styles.status}>
              <span>⚠️</span>
              <span>Осталось {formatMoney(budget.monthlyLimit - spent)} до конца месяца</span>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
