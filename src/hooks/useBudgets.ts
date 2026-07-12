import { useFinance } from '../state/useFinance'
import { startOfMonthIso, todayIso } from '../utils/date'
import type { Budget } from '../types'

export interface BudgetProgress {
  budget: Budget
  spent: number
  ratio: number
  overLimit: boolean
}

export function useBudgets() {
  const { state, dispatch } = useFinance()

  function addBudget(categoryId: string, monthlyLimit: number) {
    dispatch({ type: 'ADD_BUDGET', payload: { id: crypto.randomUUID(), categoryId, monthlyLimit } })
  }

  function updateBudget(budget: Budget) {
    dispatch({ type: 'UPDATE_BUDGET', payload: budget })
  }

  function deleteBudget(id: string) {
    dispatch({ type: 'DELETE_BUDGET', payload: { id } })
  }

  function progressForCurrentMonth(): BudgetProgress[] {
    const today = todayIso()
    const start = startOfMonthIso(today)
    return state.budgets.map(budget => {
      const spent = state.transactions
        .filter(
          t => t.categoryId === budget.categoryId && t.type === 'expense' && t.date >= start && t.date <= today
        )
        .reduce((sum, t) => sum + t.amount, 0)
      const ratio = budget.monthlyLimit > 0 ? spent / budget.monthlyLimit : 0
      return { budget, spent, ratio, overLimit: ratio > 1 }
    })
  }

  return { budgets: state.budgets, addBudget, updateBudget, deleteBudget, progressForCurrentMonth }
}
