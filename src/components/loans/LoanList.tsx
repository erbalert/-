import { useState } from 'react'
import { useLoans } from '../../hooks/useLoans'
import { useTransactions } from '../../hooks/useTransactions'
import { buildBalanceHistory, summarizeLoan } from '../../utils/loans'
import { formatDateRu } from '../../utils/date'
import { formatMoney } from '../../utils/money'
import EmptyState from '../common/EmptyState'
import LoanBalanceChart from '../charts/LoanBalanceChart'
import LoanItem from './LoanItem'
import LoanScheduleTable from './LoanScheduleTable'
import styles from './LoanList.module.css'

export default function LoanList() {
  const { loans } = useLoans()
  const { transactions } = useTransactions()
  const [selectedId, setSelectedId] = useState<string | null>(null)

  if (loans.length === 0) {
    return <EmptyState icon="📄" text="Пока нет ни одного кредита" />
  }

  const selected = loans.find(l => l.id === selectedId) ?? null
  const summary = selected ? summarizeLoan(selected, transactions) : null

  return (
    <div>
      {loans.map(loan => (
        <LoanItem
          key={loan.id}
          loan={loan}
          selected={loan.id === selectedId}
          onSelect={() => setSelectedId(loan.id === selectedId ? null : loan.id)}
        />
      ))}

      {selected && summary && (
        <div className={styles.detail}>
          <div className={styles.statsRow}>
            <div className={styles.stat}>
              <div className={styles.statLabel}>Остаток по графику</div>
              <div className={styles.statValue}>{formatMoney(summary.plannedRemaining)}</div>
            </div>
            <div className={styles.stat}>
              <div className={styles.statLabel}>Остаток фактический</div>
              <div className={styles.statValue}>{formatMoney(summary.actualRemaining)}</div>
            </div>
            <div className={styles.stat}>
              <div className={styles.statLabel}>Оплачено фактически</div>
              <div className={styles.statValue}>{formatMoney(summary.paidTotal)}</div>
            </div>
            <div className={styles.stat}>
              <div className={styles.statLabel}>Следующий платёж</div>
              <div className={styles.statValue}>
                {summary.nextDueDate ? `${formatDateRu(summary.nextDueDate)} · ${formatMoney(summary.nextDueAmount ?? 0)}` : '—'}
              </div>
            </div>
            <div className={styles.stat}>
              <div className={styles.statLabel}>Всего процентов по графику</div>
              <div className={styles.statValue}>{formatMoney(summary.totalInterest)}</div>
            </div>
            <div className={styles.stat}>
              <div className={styles.statLabel}>Дата погашения по графику</div>
              <div className={styles.statValue}>{formatDateRu(summary.payoffDate)}</div>
            </div>
          </div>

          <LoanBalanceChart data={buildBalanceHistory(selected, transactions)} />

          <h3 className={styles.subTitle}>График платежей</h3>
          <LoanScheduleTable loan={selected} />
        </div>
      )}
    </div>
  )
}
