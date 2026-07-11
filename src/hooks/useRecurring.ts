import { useFinance } from '../state/useFinance'
import type { RecurringRule } from '../types'

export type NewRecurringRule = Omit<RecurringRule, 'id' | 'lastGeneratedDate'>

export function useRecurring() {
  const { state, dispatch } = useFinance()

  function addRule(data: NewRecurringRule) {
    dispatch({
      type: 'ADD_RECURRING_RULE',
      payload: { ...data, id: crypto.randomUUID(), lastGeneratedDate: null },
    })
  }

  function updateRule(rule: RecurringRule) {
    dispatch({ type: 'UPDATE_RECURRING_RULE', payload: rule })
  }

  function deleteRule(id: string) {
    dispatch({ type: 'DELETE_RECURRING_RULE', payload: { id } })
  }

  function toggleActive(rule: RecurringRule) {
    dispatch({ type: 'UPDATE_RECURRING_RULE', payload: { ...rule, active: !rule.active } })
  }

  return { rules: state.recurringRules, addRule, updateRule, deleteRule, toggleActive }
}
