import { useAccounts } from '../../hooks/useAccounts'
import EmptyState from '../common/EmptyState'
import AccountForm from './AccountForm'
import AccountItem from './AccountItem'

export default function AccountList() {
  const { accounts, addAccount } = useAccounts()

  return (
    <div>
      <AccountForm onSubmit={addAccount} />
      {accounts.length === 0 ? (
        <EmptyState icon="wallet" text="Пока нет ни одного счёта" />
      ) : (
        accounts.map(account => <AccountItem key={account.id} account={account} />)
      )}
    </div>
  )
}
