import { useFinance } from '../state/useFinance'
import { countCategoryUsage } from '../state/financeReducer'
import type { Category, TransactionType } from '../types'
import type { DeleteResult } from './useAccounts'

export function useCategories() {
  const { state, dispatch } = useFinance()

  function addCategory(name: string, type: TransactionType, color: string, icon?: string) {
    dispatch({
      type: 'ADD_CATEGORY',
      payload: { id: crypto.randomUUID(), name, type, color, icon },
    })
  }

  function updateCategory(category: Category) {
    dispatch({ type: 'UPDATE_CATEGORY', payload: category })
  }

  function deleteCategory(id: string): DeleteResult {
    const usageCount = countCategoryUsage(state, id)
    if (usageCount > 0) return { ok: false, usageCount }
    dispatch({ type: 'DELETE_CATEGORY', payload: { id } })
    return { ok: true, usageCount: 0 }
  }

  function byType(type: TransactionType): Category[] {
    return state.categories.filter(c => c.type === type)
  }

  function byId(id: string): Category | undefined {
    return state.categories.find(c => c.id === id)
  }

  return { categories: state.categories, addCategory, updateCategory, deleteCategory, byType, byId }
}
