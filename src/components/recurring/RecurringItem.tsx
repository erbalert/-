import type { RecurringRule } from '../../types'
import { useAccounts } from '../../hooks/useAccounts'
import { useCategories } from '../../hooks/useCategories'
import { useRecurring } from '../../hooks/useRecurring'
import { addOccurrence, formatDateRu } from '../../utils/date'
import { formatMoney } from '../../utils/money'
import styles from './RecurringItem.module.css'

const FREQUENCY_LABELS: Record<RecurringRule['frequency'], string> = {
  daily: 'ежедневно',
  weekly: 'еженедельно',
  monthly: 'ежемесячно',
}

interface Props {
  rule: RecurringRule
  onDelete: () => void
}

export default function RecurringItem({ rule, onDelete }: Props) {
  const { accounts } = useAccounts()
  const { byId } = useCategories()
  const { toggleActive } = useRecurring()

  const account = accounts.find(a => a.id === rule.accountId)
  const category = byId(rule.categoryId)
  const nextDate = rule.lastGeneratedDate ? addOccurrence(rule.lastGeneratedDate, rule.frequency) : rule.startDate

  return (
    <div className={`${styles.item} ${!rule.active ? styles.inactive : ''}`}>
      <div className={styles.info}>
        <div className={styles.title}>
          {category?.icon ? `${category.icon} ` : ''}
          {category?.name ?? 'Без категории'} · {account?.name ?? '—'}
        </div>
        <div className={styles.meta}>
          {FREQUENCY_LABELS[rule.frequency]}, следующая: {formatDateRu(nextDate)}
          {rule.note ? ` · ${rule.note}` : ''}
        </div>
      </div>
      <span className={`${styles.amount} ${rule.type === 'income' ? styles.amountIncome : styles.amountExpense}`}>
        {rule.type === 'income' ? '+' : '−'}
        {formatMoney(rule.amount)}
      </span>
      <div className={styles.actions}>
        <button className={styles.iconButton} onClick={() => toggleActive(rule)} aria-label={rule.active ? 'Приостановить' : 'Возобновить'}>
          {rule.active ? '⏸️' : '▶️'}
        </button>
        <button className={styles.iconButton} onClick={onDelete} aria-label="Удалить">
          🗑️
        </button>
      </div>
    </div>
  )
}
