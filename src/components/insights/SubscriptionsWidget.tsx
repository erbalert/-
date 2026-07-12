import type { Transaction } from '../../types'
import { detectSubscriptions } from '../../utils/insights'
import { formatMoney } from '../../utils/money'
import Icon from '../common/Icon'
import styles from './Widget.module.css'

interface Props {
  transactions: Transaction[]
}

export default function SubscriptionsWidget({ transactions }: Props) {
  const subs = detectSubscriptions(transactions).slice(0, 6)
  const monthlyTotal = subs.reduce((s, x) => s + x.amount, 0)

  return (
    <div className={styles.card}>
      <div className={styles.head}>
        <span className={styles.title}>Подписки и регулярные платежи</span>
      </div>
      {subs.length === 0 ? (
        <div className={styles.empty}>Регулярных списаний не обнаружено.</div>
      ) : (
        <>
          <div className={styles.headline}>
            {formatMoney(monthlyTotal)}
            <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-muted)' }}> / мес</span>
          </div>
          <div className={styles.headlineSub}>Найдено регулярных платежей: {subs.length}</div>
          <div className={styles.list}>
            {subs.map(s => (
              <div className={styles.row} key={s.merchant}>
                <span className={styles.badge} style={{ background: 'var(--brand-soft)', color: 'var(--brand-1)' }}>
                  <Icon name="repeat" size={17} />
                </span>
                <div className={styles.rowMain}>
                  <div className={styles.rowName}>{s.merchant}</div>
                  <div className={styles.rowSub}>{s.monthsActive} мес · {s.count} списаний</div>
                </div>
                <span className={styles.rowValue}>{formatMoney(s.amount)}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
