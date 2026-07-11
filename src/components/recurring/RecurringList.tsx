import { useState } from 'react'
import { useRecurring } from '../../hooks/useRecurring'
import ConfirmDialog from '../common/ConfirmDialog'
import EmptyState from '../common/EmptyState'
import RecurringItem from './RecurringItem'

export default function RecurringList() {
  const { rules, deleteRule } = useRecurring()
  const [deletingId, setDeletingId] = useState<string | null>(null)

  if (rules.length === 0) {
    return <EmptyState icon="🔁" text="Пока нет повторяющихся операций" />
  }

  return (
    <div>
      {rules.map(rule => (
        <RecurringItem key={rule.id} rule={rule} onDelete={() => setDeletingId(rule.id)} />
      ))}
      {deletingId && (
        <ConfirmDialog
          title="Удалить правило?"
          message="Повторяющаяся операция будет удалена. Уже созданные операции останутся в списке."
          onConfirm={() => {
            deleteRule(deletingId)
            setDeletingId(null)
          }}
          onCancel={() => setDeletingId(null)}
        />
      )}
    </div>
  )
}
