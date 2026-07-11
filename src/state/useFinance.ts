import { createContext, useContext } from 'react'
import type { Dispatch } from 'react'
import type { PersistedState } from '../types'
import type { FinanceAction } from './financeReducer'

export interface FinanceContextValue {
  state: PersistedState
  dispatch: Dispatch<FinanceAction>
}

export const FinanceContext = createContext<FinanceContextValue | null>(null)

export function useFinance(): FinanceContextValue {
  const ctx = useContext(FinanceContext)
  if (!ctx) throw new Error('useFinance must be used within FinanceProvider')
  return ctx
}
