import { useAccounts } from '../../hooks/useAccounts'
import { useLoans } from '../../hooks/useLoans'
import { useTransactions } from '../../hooks/useTransactions'
import { summarizeLoan } from '../../utils/loans'
import { formatMoney } from '../../utils/money'
import styles from './SummaryBar.module.css'

export default function SummaryBar() {
  const { accounts, balanceOf } = useAccounts()
  const { loans } = useLoans()
  const { transactions } = useTransactions()

  const totalBalance = accounts.reduce((sum, a) => sum + balanceOf(a.id), 0)
  const totalDebt = loans
    .filter(l => l.active)
    .reduce((sum, l) => sum + summarizeLoan(l, transactions).actualRemaining, 0)

  return (
    <div className={styles.bar}>
      <div className={styles.card}>
        <div className={styles.label}>Общий баланс</div>
        <div className={`${styles.value} ${totalBalance >= 0 ? styles.valuePositive : styles.valueNegative}`}>
          {formatMoney(totalBalance)}
        </div>
      </div>
      {accounts.map(account => (
        <div className={styles.card} key={account.id}>
          <div className={styles.label}>{account.name}</div>
          <div className={styles.value}>{formatMoney(balanceOf(account.id))}</div>
        </div>
      ))}
      {loans.some(l => l.active) && (
        <div className={styles.card}>
          <div className={styles.label}>Задолженность по кредитам</div>
          <div className={`${styles.value} ${styles.valueNegative}`}>{formatMoney(totalDebt)}</div>
        </div>
      )}
    </div>
  )
}
