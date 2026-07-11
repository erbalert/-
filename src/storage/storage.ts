import { STORAGE_KEY, DEFAULT_EXPENSE_CATEGORIES, DEFAULT_INCOME_CATEGORIES } from '../constants'
import type { Category, PersistedState } from '../types'

function seedDefaultState(): PersistedState {
  const categories: Category[] = [...DEFAULT_EXPENSE_CATEGORIES, ...DEFAULT_INCOME_CATEGORIES].map(
    c => ({ ...c, id: crypto.randomUUID() })
  )
  return {
    version: 1,
    accounts: [],
    categories,
    transactions: [],
    budgets: [],
    recurringRules: [],
    loans: [],
  }
}

function migrate(raw: unknown): PersistedState {
  if (!raw || typeof raw !== 'object') return seedDefaultState()
  const state = raw as Partial<PersistedState>
  return {
    version: 1,
    accounts: state.accounts ?? [],
    categories: state.categories ?? [],
    transactions: state.transactions ?? [],
    budgets: state.budgets ?? [],
    recurringRules: state.recurringRules ?? [],
    loans: state.loans ?? [],
  }
}

export function loadState(): PersistedState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return seedDefaultState()
    return migrate(JSON.parse(raw))
  } catch {
    return seedDefaultState()
  }
}

export function saveState(state: PersistedState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}
