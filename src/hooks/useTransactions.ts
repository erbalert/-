import { useFinance } from '../state/useFinance'
import type { Transaction, TransactionFilters } from '../types'

export type NewTransaction = Omit<Transaction, 'id' | 'createdAt'>

export function useTransactions() {
  const { state, dispatch } = useFinance()

  function addTransaction(data: NewTransaction) {
    dispatch({
      type: 'ADD_TRANSACTION',
      payload: { ...data, id: crypto.randomUUID(), createdAt: Date.now() },
    })
  }

  function updateTransaction(transaction: Transaction) {
    dispatch({ type: 'UPDATE_TRANSACTION', payload: transaction })
  }

  function deleteTransaction(id: string) {
    dispatch({ type: 'DELETE_TRANSACTION', payload: { id } })
  }

  function addTransactionsBulk(items: NewTransaction[]) {
    const transactions: Transaction[] = items.map(item => ({
      ...item,
      id: crypto.randomUUID(),
      createdAt: Date.now(),
    }))
    dispatch({ type: 'ADD_TRANSACTIONS_BULK', payload: { transactions } })
  }

  function filtered(filters: TransactionFilters): Transaction[] {
    return state.transactions.filter(t => {
      if (filters.accountId && t.accountId !== filters.accountId) return false
      if (filters.categoryId && t.categoryId !== filters.categoryId) return false
      if (filters.type && t.type !== filters.type) return false
      if (filters.loanId && t.loanId !== filters.loanId) return false
      if (filters.dateFrom && t.date < filters.dateFrom) return false
      if (filters.dateTo && t.date > filters.dateTo) return false
      if (filters.search && !(t.note ?? '').toLowerCase().includes(filters.search.toLowerCase())) return false
      return true
    })
  }

  return {
    transactions: state.transactions,
    addTransaction,
    updateTransaction,
    deleteTransaction,
    addTransactionsBulk,
    filtered,
  }
}
