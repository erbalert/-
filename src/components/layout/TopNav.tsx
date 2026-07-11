import styles from './TopNav.module.css'
import type { Tab } from '../../App'

const TABS: { id: Tab; label: string }[] = [
  { id: 'dashboard', label: 'Дашборд' },
  { id: 'transactions', label: 'Операции' },
  { id: 'accounts', label: 'Счета и категории' },
  { id: 'budgets', label: 'Бюджеты' },
  { id: 'recurring', label: 'Повторяющиеся' },
  { id: 'loans', label: 'Кредиты' },
  { id: 'import-export', label: 'Импорт/экспорт' },
]

interface Props {
  active: Tab
  onChange: (tab: Tab) => void
}

export default function TopNav({ active, onChange }: Props) {
  return (
    <nav className={styles.nav}>
      {TABS.map(tab => (
        <button
          key={tab.id}
          className={`${styles.tab} ${active === tab.id ? styles.tabActive : ''}`}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  )
}
