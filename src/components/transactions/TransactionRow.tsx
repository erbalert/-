import type { Transaction } from '../../types'
import { useAccounts } from '../../hooks/useAccounts'
import { useCategories } from '../../hooks/useCategories'
import { formatDateRu } from '../../utils/date'
import { formatMoney } from '../../utils/money'
import IconButton from '../common/IconButton'
import styles from './TransactionRow.module.css'

interface Props {
  transaction: Transaction
  onEdit: () => void
  onDelete: () => void
}

function hexToSoft(hex: string): string {
  return `${hex}22`
}

export default function TransactionRow({ transaction, onEdit, onDelete }: Props) {
  const { accounts } = useAccounts()
  const { byId } = useCategories()
  const account = accounts.find(a => a.id === transaction.accountId)
  const category = byId(transaction.categoryId)
  const color = category?.color ?? '#8f8da6'

  const subParts = [account?.name, transaction.note].filter(Boolean)

  return (
    <div className={styles.row}>
      <span className={styles.iconBadge} style={{ background: hexToSoft(color), color }}>
        {category?.icon ?? '•'}
      </span>
      <div className={styles.body}>
        <div className={styles.topLine}>
          <span className={styles.category}>{category?.name ?? 'Без категории'}</span>
          <span className={styles.date}>{formatDateRu(transaction.date)}</span>
        </div>
        {subParts.length > 0 && <div className={styles.sub}>{subParts.join(' · ')}</div>}
      </div>
      <span className={`${styles.amount} ${transaction.type === 'income' ? styles.amountIncome : styles.amountExpense}`}>
        {transaction.type === 'income' ? '+' : '−'}
        {formatMoney(transaction.amount)}
      </span>
      <span className={styles.actions}>
        <IconButton icon="edit" label="Изменить" onClick={onEdit} size={16} />
        <IconButton icon="trash" label="Удалить" onClick={onDelete} danger size={16} />
      </span>
    </div>
  )
}
