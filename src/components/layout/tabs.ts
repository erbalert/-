import type { Tab } from '../../App'
import type { IconName } from '../common/icons'

export interface TabDef {
  id: Tab
  label: string
  short: string
  icon: IconName
}

export const TABS: TabDef[] = [
  { id: 'dashboard', label: 'Дашборд', short: 'Обзор', icon: 'dashboard' },
  { id: 'transactions', label: 'Операции', short: 'Операции', icon: 'transactions' },
  { id: 'accounts', label: 'Счета и категории', short: 'Счета', icon: 'wallet' },
  { id: 'budgets', label: 'Бюджеты', short: 'Бюджеты', icon: 'budget' },
  { id: 'recurring', label: 'Повторяющиеся', short: 'Повтор', icon: 'repeat' },
  { id: 'loans', label: 'Кредиты', short: 'Кредиты', icon: 'loan' },
  { id: 'import-export', label: 'Импорт/экспорт', short: 'Импорт', icon: 'import' },
]
