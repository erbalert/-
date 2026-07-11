import { useState } from 'react'
import TopNav from './components/layout/TopNav'
import SummaryBar from './components/layout/SummaryBar'
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

  return (
    <div className={styles.app}>
      <TopNav active={tab} onChange={setTab} />
      <SummaryBar />
      <div className={styles.content}>
        {tab === 'dashboard' && <DashboardPage />}
        {tab === 'transactions' && <TransactionsPage />}
        {tab === 'accounts' && <AccountsPage />}
        {tab === 'budgets' && <BudgetsPage />}
        {tab === 'recurring' && <RecurringPage />}
        {tab === 'loans' && <LoansPage />}
        {tab === 'import-export' && <ImportExportPage />}
      </div>
    </div>
  )
}
