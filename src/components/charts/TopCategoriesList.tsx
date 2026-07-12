import type { CategorySlice } from '../../utils/analytics'
import { formatMoney } from '../../utils/money'
import EmptyState from '../common/EmptyState'
import styles from './TopCategoriesList.module.css'

interface Props {
  title: string
  data: CategorySlice[]
}

export default function TopCategoriesList({ title, data }: Props) {
  const max = Math.max(...data.map(d => d.amount), 1)

  return (
    <div className={styles.wrap}>
      <h3 className={styles.title}>{title}</h3>
      {data.length === 0 ? (
        <EmptyState icon="sparkles" text="Нет данных за период" />
      ) : (
        data.map((slice, i) => (
          <div className={styles.item} key={slice.categoryId}>
            <div className={styles.topRow}>
              <span className={styles.rank}>{i + 1}</span>
              <span className={styles.name}>{slice.name}</span>
              <span className={styles.amount}>{formatMoney(slice.amount)}</span>
            </div>
            <div className={styles.barTrack}>
              <div
                className={styles.barFill}
                style={{ width: `${(slice.amount / max) * 100}%`, background: slice.color }}
              />
            </div>
          </div>
        ))
      )}
    </div>
  )
}
