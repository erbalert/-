import { useEffect, useReducer, useRef } from 'react'
import type { ReactNode } from 'react'
import { loadState, saveState } from '../storage/storage'
import { financeReducer } from './financeReducer'
import { FinanceContext } from './useFinance'
import { materializeDueTransactions } from '../utils/recurrence'
import { todayIso } from '../utils/date'

export default function FinanceProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(financeReducer, undefined, loadState)
  const materialized = useRef(false)

  useEffect(() => {
    if (materialized.current) return
    materialized.current = true
    const { newTransactions, updatedRules } = materializeDueTransactions(state.recurringRules, todayIso())
    if (newTransactions.length > 0) {
      dispatch({ type: 'MATERIALIZE_RECURRING', payload: { newTransactions, updatedRules } })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    saveState(state)
  }, [state])

  return <FinanceContext.Provider value={{ state, dispatch }}>{children}</FinanceContext.Provider>
}
