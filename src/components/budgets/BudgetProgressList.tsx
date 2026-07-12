import { useBudgets } from '../../hooks/useBudgets'
import { useCategories } from '../../hooks/useCategories'
import { useToast } from '../common/Toast'
import { formatMoney } from '../../utils/money'
import EmptyState from '../common/EmptyState'
import Icon from '../common/Icon'
import IconButton from '../common/IconButton'
import CategoryBadge from '../categories/CategoryBadge'
import BudgetProgressBar from './BudgetProgressBar'
import styles from './BudgetProgressList.module.css'

export default function BudgetProgressList() {
  const { progressForCurrentMonth, deleteBudget } = useBudgets()
  const { byId } = useCategories()
  const toast = useToast()
  const items = progressForCurrentMonth()

  if (items.length === 0) {
    return <EmptyState icon="budget" text="Пока нет ни одного бюджета" />
  }

  function handleDelete(id: string) {
    deleteBudget(id)
    toast.success('Бюджет удалён')
  }

  return (
    <div>
      {items.map(({ budget, spent, ratio, overLimit }) => (
        <div className={styles.item} key={budget.id}>
          <div className={styles.topRow}>
            <CategoryBadge category={byId(budget.categoryId)} />
            <div className={styles.right}>
              <span className={styles.amounts}>
                {formatMoney(spent)} / {formatMoney(budget.monthlyLimit)}
              </span>
              <IconButton icon="trash" label="Удалить бюджет" danger size={16} onClick={() => handleDelete(budget.id)} />
            </div>
          </div>
          <BudgetProgressBar ratio={ratio} />
          {overLimit && (
            <div className={`${styles.status} ${styles.statusCritical}`}>
              <Icon name="alert" size={15} />
              <span>Бюджет превышен на {formatMoney(spent - budget.monthlyLimit)}</span>
            </div>
          )}
          {!overLimit && ratio >= 0.7 && (
            <div className={`${styles.status} ${styles.statusWarning}`}>
              <Icon name="alert" size={15} />
              <span>Осталось {formatMoney(budget.monthlyLimit - spent)} до конца месяца</span>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
