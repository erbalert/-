import { useState } from 'react'
import TopNav from './components/layout/TopNav'
import Icon from './components/common/Icon'
import { useTheme } from './hooks/useTheme'
import DashboardPage from './pages/DashboardPage'
import TransactionsPage from './pages/TransactionsPage'
import AccountsPage from './pages/AccountsPage'
import BudgetsPage from './pages/BudgetsPage'
import RecurringPage from './pages/RecurringPage'
import LoansPage from './pages/LoansPage'
import ImportExportPage from './pages/ImportExportPage'
import styles from './App.module.css'

export type Tab =
  | 'dashboard'
  | 'transactions'
  | 'accounts'
  | 'budgets'
  | 'recurring'
  | 'loans'
  | 'import-export'

export default function App() {
  const [tab, setTab] = useState<Tab>('dashboard')
  const { theme, toggle } = useTheme()

  return (
    <div className={styles.app}>
      <TopNav active={tab} onChange={setTab} theme={theme} onToggleTheme={toggle} />
      <main className={styles.content}>
        {tab === 'dashboard' && <DashboardPage onNavigate={setTab} />}
        {tab === 'transactions' && <TransactionsPage />}
        {tab === 'accounts' && <AccountsPage />}
        {tab === 'budgets' && <BudgetsPage />}
        {tab === 'recurring' && <RecurringPage />}
        {tab === 'loans' && <LoansPage />}
        {tab === 'import-export' && <ImportExportPage onNavigate={setTab} />}
      </main>
      {tab !== 'transactions' && (
        <button className={styles.fab} onClick={() => setTab('transactions')} aria-label="Добавить операцию">
          <Icon name="plus" size={26} />
        </button>
      )}
    </div>
  )
}
