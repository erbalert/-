import type { Filter } from '../types'
import styles from './TodoFilter.module.css'

interface Props {
  filter: Filter
  onFilter: (f: Filter) => void
  activeCount: number
  hasCompleted: boolean
  onClearCompleted: () => void
}

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'Все' },
  { value: 'active', label: 'Активные' },
  { value: 'completed', label: 'Завершённые' },
]

export default function TodoFilter({
  filter,
  onFilter,
  activeCount,
  hasCompleted,
  onClearCompleted,
}: Props) {
  return (
    <div className={styles.footer}>
      <span className={styles.count}>
        {activeCount} {plural(activeCount, 'задача', 'задачи', 'задач')} осталось
      </span>
      <nav className={styles.filters}>
        {FILTERS.map(f => (
          <button
            key={f.value}
            className={`${styles.filterBtn} ${filter === f.value ? styles.active : ''}`}
            onClick={() => onFilter(f.value)}
          >
            {f.label}
          </button>
        ))}
      </nav>
      {hasCompleted && (
        <button className={styles.clear} onClick={onClearCompleted}>
          Очистить завершённые
        </button>
      )}
    </div>
  )
}

function plural(n: number, one: string, few: string, many: string) {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return one
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few
  return many
}
