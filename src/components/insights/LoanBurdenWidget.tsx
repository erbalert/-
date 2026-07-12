import type { Tab } from '../../App'
import type { Transaction } from '../../types'
import { detectLoanActivity } from '../../utils/loanDetection'
import { formatMoney } from '../../utils/money'
import Icon from '../common/Icon'
import styles from './Widget.module.css'

interface Props {
  transactions: Transaction[]
  onNavigate: (tab: Tab) => void
}

export default function LoanBurdenWidget({ transactions, onNavigate }: Props) {
  const { streams } = detectLoanActivity(
    transactions.map(t => ({ date: t.date, amount: t.amount, type: t.type, description: t.note ?? '' }))
  )

  const totalExpense = transactions.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
  const totalLoan = streams.reduce((s, l) => s + l.totalPaid, 0)
  const monthlyLoan = streams.reduce((s, l) => s + l.monthlyPayment, 0)
  const share = totalExpense > 0 ? totalLoan / totalExpense : 0

  return (
    <div className={styles.card}>
      <div className={styles.head}>
        <span className={styles.title}>Кредитная нагрузка</span>
        <button className={styles.link} onClick={() => onNavigate('loans')}>
          Кредиты <Icon name="chevronRight" size={14} />
        </button>
      </div>

      {streams.length === 0 ? (
        <div className={styles.empty}>Платежей по кредитам за период не обнаружено.</div>
      ) : (
        <>
          <div className={styles.headline}>
            {formatMoney(monthlyLoan)}
            <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-muted)' }}> / мес</span>
          </div>
          <div className={styles.headlineSub}>
            {Math.round(share * 100)}% расходов · всего за период {formatMoney(totalLoan)}
          </div>
          <div className={styles.list}>
            {streams.map(s => (
              <div className={styles.row} key={s.key}>
                <span className={styles.badge} style={{ background: 'var(--expense-soft)', color: 'var(--expense)' }}>
                  <Icon name="loan" size={18} />
                </span>
                <div className={styles.rowMain}>
                  <div className={styles.rowName}>{s.name}</div>
                  <div className={styles.rowSub}>
                    {s.count} платежей · ~{formatMoney(s.monthlyPayment)}/мес
                  </div>
                </div>
                <span className={styles.rowValue}>{formatMoney(s.totalPaid)}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
