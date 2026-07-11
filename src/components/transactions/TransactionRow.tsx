import type { Transaction } from '../../types'
import { useAccounts } from '../../hooks/useAccounts'
import { useCategories } from '../../hooks/useCategories'
import { formatDateRu } from '../../utils/date'
import { formatMoney } from '../../utils/money'
import CategoryBadge from '../categories/CategoryBadge'
import styles from './TransactionRow.module.css'

interface Props {
  transaction: Transaction
  onEdit: () => void
  onDelete: () => void
}

export default function TransactionRow({ transaction, onEdit, onDelete }: Props) {
  const { accounts } = useAccounts()
  const { byId } = useCategories()
  const account = accounts.find(a => a.id === transaction.accountId)

  return (
    <div className={styles.row}>
      <span className={styles.date}>{formatDateRu(transaction.date)}</span>
      <span className={styles.account}>{account?.name ?? '—'}</span>
      <span className={styles.category}>
        <CategoryBadge category={byId(transaction.categoryId)} />
        {transaction.note && <div className={styles.note}>{transaction.note}</div>}
      </span>
      <span className={`${styles.amount} ${transaction.type === 'income' ? styles.amountIncome : styles.amountExpense}`}>
        {transaction.type === 'income' ? '+' : '−'}
        {formatMoney(transaction.amount)}
      </span>
      <span className={styles.actions}>
        <button className={styles.iconButton} onClick={onEdit} aria-label="Изменить">
          ✏️
        </button>
        <button className={styles.iconButton} onClick={onDelete} aria-label="Удалить">
          🗑️
        </button>
      </span>
    </div>
  )
}
