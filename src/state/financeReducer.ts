import type {
  Account,
  Budget,
  Category,
  Loan,
  PersistedState,
  RecurringRule,
  Transaction,
} from '../types'

export type FinanceAction =
  | { type: 'ADD_ACCOUNT'; payload: Account }
  | { type: 'UPDATE_ACCOUNT'; payload: Account }
  | { type: 'DELETE_ACCOUNT'; payload: { id: string } }
  | { type: 'ADD_CATEGORY'; payload: Category }
  | { type: 'UPDATE_CATEGORY'; payload: Category }
  | { type: 'DELETE_CATEGORY'; payload: { id: string } }
  | { type: 'ADD_TRANSACTION'; payload: Transaction }
  | { type: 'UPDATE_TRANSACTION'; payload: Transaction }
  | { type: 'DELETE_TRANSACTION'; payload: { id: string } }
  | { type: 'ADD_TRANSACTIONS_BULK'; payload: { transactions: Transaction[] } }
  | { type: 'ADD_BUDGET'; payload: Budget }
  | { type: 'UPDATE_BUDGET'; payload: Budget }
  | { type: 'DELETE_BUDGET'; payload: { id: string } }
  | { type: 'ADD_RECURRING_RULE'; payload: RecurringRule }
  | { type: 'UPDATE_RECURRING_RULE'; payload: RecurringRule }
  | { type: 'DELETE_RECURRING_RULE'; payload: { id: string } }
  | {
      type: 'MATERIALIZE_RECURRING'
      payload: { newTransactions: Transaction[]; updatedRules: RecurringRule[] }
    }
  | { type: 'ADD_LOAN'; payload: Loan }
  | { type: 'UPDATE_LOAN'; payload: Loan }
  | { type: 'DELETE_LOAN'; payload: { id: string } }

export function countAccountUsage(state: PersistedState, accountId: string): number {
  return (
    state.transactions.filter(t => t.accountId === accountId).length +
    state.recurringRules.filter(r => r.accountId === accountId).length
  )
}

export function countCategoryUsage(state: PersistedState, categoryId: string): number {
  return (
    state.transactions.filter(t => t.categoryId === categoryId).length +
    state.recurringRules.filter(r => r.categoryId === categoryId).length +
    state.budgets.filter(b => b.categoryId === categoryId).length
  )
}

export function countLoanUsage(state: PersistedState, loanId: string): number {
  return state.transactions.filter(t => t.loanId === loanId).length
}

export function financeReducer(state: PersistedState, action: FinanceAction): PersistedState {
  switch (action.type) {
    case 'ADD_ACCOUNT':
      return { ...state, accounts: [...state.accounts, action.payload] }

    case 'UPDATE_ACCOUNT':
      return {
        ...state,
        accounts: state.accounts.map(a => (a.id === action.payload.id ? action.payload : a)),
      }

    case 'DELETE_ACCOUNT':
      if (countAccountUsage(state, action.payload.id) > 0) return state
      return { ...state, accounts: state.accounts.filter(a => a.id !== action.payload.id) }

    case 'ADD_CATEGORY':
      return { ...state, categories: [...state.categories, action.payload] }

    case 'UPDATE_CATEGORY':
      return {
        ...state,
        categories: state.categories.map(c => (c.id === action.payload.id ? action.payload : c)),
      }

    case 'DELETE_CATEGORY':
      if (countCategoryUsage(state, action.payload.id) > 0) return state
      return { ...state, categories: state.categories.filter(c => c.id !== action.payload.id) }

    case 'ADD_TRANSACTION':
      return { ...state, transactions: [action.payload, ...state.transactions] }

    case 'UPDATE_TRANSACTION':
      return {
        ...state,
        transactions: state.transactions.map(t =>
          t.id === action.payload.id ? action.payload : t
        ),
      }

    case 'DELETE_TRANSACTION':
      return {
        ...state,
        transactions: state.transactions.filter(t => t.id !== action.payload.id),
      }

    case 'ADD_TRANSACTIONS_BULK':
      return {
        ...state,
        transactions: [...action.payload.transactions, ...state.transactions],
      }

    case 'ADD_BUDGET':
      return { ...state, budgets: [...state.budgets, action.payload] }

    case 'UPDATE_BUDGET':
      return {
        ...state,
        budgets: state.budgets.map(b => (b.id === action.payload.id ? action.payload : b)),
      }

    case 'DELETE_BUDGET':
      return { ...state, budgets: state.budgets.filter(b => b.id !== action.payload.id) }

    case 'ADD_RECURRING_RULE':
      return { ...state, recurringRules: [...state.recurringRules, action.payload] }

    case 'UPDATE_RECURRING_RULE':
      return {
        ...state,
        recurringRules: state.recurringRules.map(r =>
          r.id === action.payload.id ? action.payload : r
        ),
      }

    case 'DELETE_RECURRING_RULE':
      return {
        ...state,
        recurringRules: state.recurringRules.filter(r => r.id !== action.payload.id),
      }

    case 'MATERIALIZE_RECURRING': {
      if (action.payload.newTransactions.length === 0) return state
      return {
        ...state,
        transactions: [...action.payload.newTransactions, ...state.transactions],
        recurringRules: state.recurringRules.map(
          r => action.payload.updatedRules.find(u => u.id === r.id) ?? r
        ),
      }
    }

    case 'ADD_LOAN':
      return { ...state, loans: [...state.loans, action.payload] }

    case 'UPDATE_LOAN':
      return { ...state, loans: state.loans.map(l => (l.id === action.payload.id ? action.payload : l)) }

    case 'DELETE_LOAN':
      if (countLoanUsage(state, action.payload.id) > 0) return state
      return { ...state, loans: state.loans.filter(l => l.id !== action.payload.id) }

    default:
      return state
  }
}
