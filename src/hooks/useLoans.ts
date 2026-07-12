import { useFinance } from '../state/useFinance'
import { countLoanUsage } from '../state/financeReducer'
import type { Loan } from '../types'
import type { DeleteResult } from './useAccounts'

export type NewLoan = Omit<Loan, 'id'>

export function useLoans() {
  const { state, dispatch } = useFinance()

  function addLoan(data: NewLoan) {
    dispatch({ type: 'ADD_LOAN', payload: { ...data, id: crypto.randomUUID() } })
  }

  function updateLoan(loan: Loan) {
    dispatch({ type: 'UPDATE_LOAN', payload: loan })
  }

  function deleteLoan(id: string): DeleteResult {
    const usageCount = countLoanUsage(state, id)
    if (usageCount > 0) return { ok: false, usageCount }
    dispatch({ type: 'DELETE_LOAN', payload: { id } })
    return { ok: true, usageCount: 0 }
  }

  return { loans: state.loans, addLoan, updateLoan, deleteLoan }
}
