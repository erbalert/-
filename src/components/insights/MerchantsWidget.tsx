import type { Transaction } from '../../types'
import { useCategories } from '../../hooks/useCategories'
import { biggestTransactions, topMerchants } from '../../utils/insights'
import { normalizeMerchant } from '../../utils/merchant'
import { formatDateRu } from '../../utils/date'
import { formatMoney } from '../../utils/money'
import styles from './Widget.module.css'

interface Props {
  transactions: Transaction[]
  variant: 'merchants' | 'biggest'
}

export default function MerchantsWidget({ transactions, variant }: Props) {
  const { byId } = useCategories()

  if (variant === 'merchants') {
    const merchants = topMerchants(transactions, 6)
    const max = Math.max(...merchants.map(m => m.total), 1)
    return (
      <div className={styles.card}>
        <div className={styles.head}>
          <span className={styles.title}>Куда уходят деньги</span>
        </div>
        {merchants.length === 0 ? (
          <div className={styles.empty}>Нет расходов за период.</div>
        ) : (
          <div className={styles.list}>
            {merchants.map(m => (
              <div className={styles.row} key={m.merchant} style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
                <div style={{ display: 'flex', gap: 8 }}>
                  <span className={styles.rowMain}>
                    <span className={styles.rowName}>{m.merchant}</span>
                    <span className={styles.rowSub}> · {m.count} операц.</span>
                  </span>
                  <span className={styles.rowValue}>{formatMoney(m.total)}</span>
                </div>
                <div style={{ height: 6, borderRadius: 3, background: 'var(--surface-2)', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${(m.total / max) * 100}%`, background: 'var(--brand-gradient)', borderRadius: 3 }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  const biggest = biggestTransactions(transactions, 6)
  return (
    <div className={styles.card}>
      <div className={styles.head}>
        <span className={styles.title}>Крупнейшие траты</span>
      </div>
      {biggest.length === 0 ? (
        <div className={styles.empty}>Нет расходов за период.</div>
      ) : (
        <div className={styles.list}>
          {biggest.map(t => {
            const cat = byId(t.categoryId)
            return (
              <div className={styles.row} key={t.id}>
                <span className={styles.badge} style={{ background: `${cat?.color ?? '#8f8da6'}22`, color: cat?.color ?? '#8f8da6' }}>
                  {cat?.icon ?? '•'}
                </span>
                <div className={styles.rowMain}>
                  <div className={styles.rowName}>{normalizeMerchant(t.note ?? '') || cat?.name || 'Операция'}</div>
                  <div className={styles.rowSub}>{formatDateRu(t.date)} · {cat?.name ?? 'Без категории'}</div>
                </div>
                <span className={styles.rowValue} style={{ color: 'var(--expense)' }}>−{formatMoney(t.amount)}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
