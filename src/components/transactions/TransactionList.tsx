import { useState } from 'react'
import type { Transaction } from '../../types'
import { useTransactions } from '../../hooks/useTransactions'
import { useToast } from '../common/Toast'
import Modal from '../common/Modal'
import EmptyState from '../common/EmptyState'
import TransactionForm from './TransactionForm'
import TransactionRow from './TransactionRow'

interface Props {
  transactions: Transaction[]
}

export default function TransactionList({ transactions }: Props) {
  const { updateTransaction, deleteTransaction, restoreTransaction } = useTransactions()
  const [editing, setEditing] = useState<Transaction | null>(null)
  const toast = useToast()

  if (transactions.length === 0) {
    return <EmptyState icon="transactions" text="Операций не найдено" />
  }

  function handleDelete(t: Transaction) {
    deleteTransaction(t.id)
    toast.info('Операция удалена', {
      actionLabel: 'Отменить',
      onAction: () => restoreTransaction(t),
    })
  }

  return (
    <div>
      {transactions.map(t => (
        <TransactionRow key={t.id} transaction={t} onEdit={() => setEditing(t)} onDelete={() => handleDelete(t)} />
      ))}
      {editing && (
        <Modal title="Изменить операцию" onClose={() => setEditing(null)}>
          <TransactionForm
            initial={editing}
            submitLabel="Сохранить"
            onSubmit={data => {
              updateTransaction({ ...editing, ...data })
              setEditing(null)
              toast.success('Операция обновлена')
            }}
          />
        </Modal>
      )}
    </div>
  )
}
