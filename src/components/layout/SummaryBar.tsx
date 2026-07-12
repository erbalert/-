import { useAccounts } from '../../hooks/useAccounts'
import { useLoans } from '../../hooks/useLoans'
import { useTransactions } from '../../hooks/useTransactions'
import { summarizeLoan } from '../../utils/loans'
import { formatMoney } from '../../utils/money'
import { startOfMonthIso, todayIso } from '../../utils/date'
import Icon from '../common/Icon'
import styles from './SummaryBar.module.css'

export default function SummaryBar() {
  const { accounts, balanceOf } = useAccounts()
  const { loans } = useLoans()
  const { transactions } = useTransactions()

  const totalBalance = accounts.reduce((sum, a) => sum + balanceOf(a.id), 0)
  const totalDebt = loans
    .filter(l => l.active)
    .reduce((sum, l) => sum + summarizeLoan(l, transactions).actualRemaining, 0)

  const monthStart = startOfMonthIso(todayIso())
  const today = todayIso()
  let monthIncome = 0
  let monthExpense = 0
  for (const t of transactions) {
    if (t.date < monthStart || t.date > today) continue
    if (t.type === 'income') monthIncome += t.amount
    else monthExpense += t.amount
  }

  return (
    <div className={styles.hero}>
      <div className={styles.label}>Общий баланс</div>
      <div className={styles.balance}>{formatMoney(totalBalance)}</div>

      <div className={styles.deltas}>
        <div className={styles.delta}>
          <span className={styles.deltaIcon}>
            <Icon name="arrowDown" size={16} />
          </span>
          <div>
            <div className={styles.deltaLabel}>Доход за месяц</div>
            <div className={styles.deltaValue}>{formatMoney(monthIncome)}</div>
          </div>
        </div>
        <div className={styles.delta}>
          <span className={styles.deltaIcon}>
            <Icon name="arrowUp" size={16} />
          </span>
          <div>
            <div className={styles.deltaLabel}>Расход за месяц</div>
            <div className={styles.deltaValue}>{formatMoney(monthExpense)}</div>
          </div>
        </div>
      </div>

      {(accounts.length > 0 || totalDebt > 0) && (
        <div className={styles.chips}>
          {accounts.map(account => (
            <span className={styles.chip} key={account.id}>
              <span className={styles.chipName}>{account.name}</span>
              <span className={styles.chipValue}>{formatMoney(balanceOf(account.id))}</span>
            </span>
          ))}
          {totalDebt > 0 && (
            <span className={`${styles.chip} ${styles.chipDebt}`}>
              <span className={styles.chipName}>Долг по кредитам</span>
              <span className={styles.chipValue}>{formatMoney(totalDebt)}</span>
            </span>
          )}
        </div>
      )}
    </div>
  )
}
