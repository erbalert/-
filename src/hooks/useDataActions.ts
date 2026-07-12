import { useFinance } from '../state/useFinance'
import { seedDefaultState } from '../storage/storage'
import { buildDemoState } from '../utils/demoData'

export function useDataActions() {
  const { dispatch } = useFinance()

  function loadDemo() {
    dispatch({ type: 'REPLACE_STATE', payload: buildDemoState() })
  }

  function clearAll() {
    dispatch({ type: 'REPLACE_STATE', payload: seedDefaultState() })
  }

  return { loadDemo, clearAll }
}
