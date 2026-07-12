import type { TransactionFilters as Filters } from '../../types'
import { useAccounts } from '../../hooks/useAccounts'
import { useCategories } from '../../hooks/useCategories'
import Icon from '../common/Icon'
import styles from './TransactionFilters.module.css'

interface Props {
  filters: Filters
  onChange: (filters: Filters) => void
}

export default function TransactionFilters({ filters, onChange }: Props) {
  const { accounts } = useAccounts()
  const { categories } = useCategories()

  function set<K extends keyof Filters>(key: K, value: Filters[K]) {
    onChange({ ...filters, [key]: value || undefined })
  }

  const isEmpty = Object.values(filters).every(v => !v)

  return (
    <div className={styles.filters}>
      <select
        className={styles.control}
        value={filters.type ?? ''}
        onChange={e => set('type', e.target.value as Filters['type'])}
        aria-label="Тип"
      >
        <option value="">Все типы</option>
        <option value="income">Доход</option>
        <option value="expense">Расход</option>
      </select>
      <select
        className={styles.control}
        value={filters.accountId ?? ''}
        onChange={e => set('accountId', e.target.value)}
        aria-label="Счёт"
      >
        <option value="">Все счета</option>
        {accounts.map(a => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </select>
      <select
        className={styles.control}
        value={filters.categoryId ?? ''}
        onChange={e => set('categoryId', e.target.value)}
        aria-label="Категория"
      >
        <option value="">Все категории</option>
        {categories.map(c => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <input
        className={styles.control}
        type="date"
        value={filters.dateFrom ?? ''}
        onChange={e => set('dateFrom', e.target.value)}
        aria-label="С даты"
      />
      <input
        className={styles.control}
        type="date"
        value={filters.dateTo ?? ''}
        onChange={e => set('dateTo', e.target.value)}
        aria-label="По дату"
      />
      <input
        className={`${styles.control} ${styles.search}`}
        value={filters.search ?? ''}
        onChange={e => set('search', e.target.value)}
        placeholder="Поиск по комментарию"
        aria-label="Поиск"
      />
      {!isEmpty && (
        <button className={styles.reset} onClick={() => onChange({})}>
          <Icon name="close" size={15} />
          Сбросить
        </button>
      )}
    </div>
  )
}
