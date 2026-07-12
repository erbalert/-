import { useState } from 'react'
import type { Loan } from '../../types'
import { useLoans } from '../../hooks/useLoans'
import { useTransactions } from '../../hooks/useTransactions'
import { summarizeLoan } from '../../utils/loans'
import { formatMoney } from '../../utils/money'
import ConfirmDialog from '../common/ConfirmDialog'
import Button from '../common/Button'
import styles from './LoanItem.module.css'

interface Props {
  loan: Loan
  selected: boolean
  onSelect: () => void
}

export default function LoanItem({ loan, selected, onSelect }: Props) {
  const { updateLoan, deleteLoan } = useLoans()
  const { transactions } = useTransactions()
  const [deleting, setDeleting] = useState(false)
  const [blockedMessage, setBlockedMessage] = useState<string | null>(null)

  const summary = summarizeLoan(loan, transactions)

  function handleDelete() {
    const result = deleteLoan(loan.id)
    setDeleting(false)
    if (!result.ok) {
      setBlockedMessage(`Нельзя удалить кредит: с ним связано операций — ${result.usageCount}.`)
    }
  }

  return (
    <div
      className={`${styles.item} ${selected ? styles.selected : ''} ${!loan.active ? styles.closed : ''}`}
      onClick={onSelect}
    >
      <div className={styles.topRow}>
        <div>
          <div className={styles.name}>
            {loan.name} {!loan.active && '(закрыт)'}
          </div>
          <div className={styles.meta}>
            {formatMoney(loan.principal)} · {loan.interestRate}% годовых · {loan.termMonths} мес.
          </div>
        </div>
        <div className={styles.remaining}>
          <div className={styles.remainingLabel}>Остаток (факт)</div>
          <div className={styles.remainingValue}>{formatMoney(summary.actualRemaining)}</div>
        </div>
      </div>
      <div className={styles.actions} onClick={e => e.stopPropagation()}>
        <Button variant="secondary" size="sm" onClick={() => updateLoan({ ...loan, active: !loan.active })}>
          {loan.active ? 'Закрыть кредит' : 'Возобновить'}
        </Button>
        <Button variant="ghost" size="sm" icon="trash" onClick={() => setDeleting(true)}>
          Удалить
        </Button>
      </div>
      {blockedMessage && <p className={styles.warning}>{blockedMessage}</p>}
      {deleting && (
        <div onClick={e => e.stopPropagation()}>
          <ConfirmDialog
            title="Удалить кредит?"
            message={`Кредит «${loan.name}» будет удалён без возможности восстановления.`}
            onConfirm={handleDelete}
            onCancel={() => setDeleting(false)}
          />
        </div>
      )}
    </div>
  )
}
