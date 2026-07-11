import { useFinance } from '../state/useFinance'
import { countAccountUsage } from '../state/financeReducer'
import type { Account } from '../types'

export interface DeleteResult {
  ok: boolean
  usageCount: number
}

export function useAccounts() {
  const { state, dispatch } = useFinance()

  function addAccount(name: string) {
    dispatch({ type: 'ADD_ACCOUNT', payload: { id: crypto.randomUUID(), name, createdAt: Date.now() } })
  }

  function renameAccount(account: Account, name: string) {
    dispatch({ type: 'UPDATE_ACCOUNT', payload: { ...account, name } })
  }

  function deleteAccount(id: string): DeleteResult {
    const usageCount = countAccountUsage(state, id)
    if (usageCount > 0) return { ok: false, usageCount }
    dispatch({ type: 'DELETE_ACCOUNT', payload: { id } })
    return { ok: true, usageCount: 0 }
  }

  function balanceOf(accountId: string): number {
    return state.transactions
      .filter(t => t.accountId === accountId)
      .reduce((sum, t) => sum + (t.type === 'income' ? t.amount : -t.amount), 0)
  }

  return { accounts: state.accounts, addAccount, renameAccount, deleteAccount, balanceOf }
}
