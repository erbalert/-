import { useState } from 'react'
import type { Transaction } from '../../types'
import { useTransactions } from '../../hooks/useTransactions'
import ConfirmDialog from '../common/ConfirmDialog'
import Modal from '../common/Modal'
import EmptyState from '../common/EmptyState'
import TransactionForm from './TransactionForm'
import TransactionRow from './TransactionRow'

interface Props {
  transactions: Transaction[]
}

export default function TransactionList({ transactions }: Props) {
  const { updateTransaction, deleteTransaction } = useTransactions()
  const [editing, setEditing] = useState<Transaction | null>(null)
  const [deleting, setDeleting] = useState<Transaction | null>(null)

  if (transactions.length === 0) {
    return <EmptyState icon="💳" text="Операций не найдено" />
  }

  return (
    <div>
      {transactions.map(t => (
        <TransactionRow key={t.id} transaction={t} onEdit={() => setEditing(t)} onDelete={() => setDeleting(t)} />
      ))}
      {editing && (
        <Modal title="Изменить операцию" onClose={() => setEditing(null)}>
          <TransactionForm
            initial={editing}
            submitLabel="Сохранить"
            onSubmit={data => {
              updateTransaction({ ...editing, ...data })
              setEditing(null)
            }}
          />
        </Modal>
      )}
      {deleting && (
        <ConfirmDialog
          title="Удалить операцию?"
          message="Операция будет удалена без возможности восстановления."
          onConfirm={() => {
            deleteTransaction(deleting.id)
            setDeleting(null)
          }}
          onCancel={() => setDeleting(null)}
        />
      )}
    </div>
  )
}
