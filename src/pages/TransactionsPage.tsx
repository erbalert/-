import { useState } from 'react'
import type { TransactionFilters as Filters } from '../types'
import { useTransactions } from '../hooks/useTransactions'
import TransactionForm from '../components/transactions/TransactionForm'
import TransactionFilters from '../components/transactions/TransactionFilters'
import TransactionList from '../components/transactions/TransactionList'

export default function TransactionsPage() {
  const { addTransaction, filtered } = useTransactions()
  const [filters, setFilters] = useState<Filters>({})

  return (
    <div>
      <TransactionForm onSubmit={addTransaction} />
      <TransactionFilters filters={filters} onChange={setFilters} />
      <TransactionList transactions={filtered(filters)} />
    </div>
  )
}
