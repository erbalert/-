import { useState } from 'react'
import type { TransactionFilters as Filters } from '../types'
import type { NewTransaction } from '../hooks/useTransactions'
import { useTransactions } from '../hooks/useTransactions'
import { useToast } from '../components/common/Toast'
import PageHeader from '../components/layout/PageHeader'
import Card from '../components/common/Card'
import TransactionForm from '../components/transactions/TransactionForm'
import TransactionFilters from '../components/transactions/TransactionFilters'
import TransactionList from '../components/transactions/TransactionList'
import styles from './TransactionsPage.module.css'

export default function TransactionsPage() {
  const { addTransaction, filtered } = useTransactions()
  const [filters, setFilters] = useState<Filters>({})
  const toast = useToast()

  function handleAdd(data: NewTransaction) {
    addTransaction(data)
    toast.success(data.type === 'income' ? 'Доход добавлен' : 'Расход добавлен')
  }

  const list = filtered(filters)

  return (
    <div>
      <PageHeader title="Операции" subtitle="Добавляйте доходы и расходы, фильтруйте историю" />
      <Card className={styles.formCard}>
        <TransactionForm onSubmit={handleAdd} />
      </Card>
      <h2 className={styles.listTitle}>История ({list.length})</h2>
      <TransactionFilters filters={filters} onChange={setFilters} />
      <TransactionList transactions={list} />
    </div>
  )
}
