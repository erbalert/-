import { useState } from 'react'
import type { Account } from '../../types'
import { formatMoney } from '../../utils/money'
import { useAccounts } from '../../hooks/useAccounts'
import ConfirmDialog from '../common/ConfirmDialog'
import AccountForm from './AccountForm'
import styles from './AccountItem.module.css'

interface Props {
  account: Account
}

export default function AccountItem({ account }: Props) {
  const { balanceOf, renameAccount, deleteAccount } = useAccounts()
  const [editing, setEditing] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [blockedMessage, setBlockedMessage] = useState<string | null>(null)

  function handleRename(name: string) {
    renameAccount(account, name)
    setEditing(false)
  }

  function handleDelete() {
    const result = deleteAccount(account.id)
    setConfirming(false)
    if (!result.ok) {
      setBlockedMessage(
        `Нельзя удалить счёт: с ним связано операций/правил — ${result.usageCount}. Сначала удалите или перенесите их.`
      )
    }
  }

  if (editing) {
    return <AccountForm initialName={account.name} submitLabel="Сохранить" onSubmit={handleRename} />
  }

  return (
    <div>
      <div className={styles.item}>
        <div>
          <span className={styles.name}>{account.name}</span>
          <span className={styles.balance}>{formatMoney(balanceOf(account.id))}</span>
        </div>
        <div className={styles.actions}>
          <button className={styles.iconButton} onClick={() => setEditing(true)} aria-label="Переименовать">
            ✏️
          </button>
          <button className={styles.iconButton} onClick={() => setConfirming(true)} aria-label="Удалить">
            🗑️
          </button>
        </div>
      </div>
      {blockedMessage && <p className={styles.warning}>{blockedMessage}</p>}
      {confirming && (
        <ConfirmDialog
          title="Удалить счёт?"
          message={`Счёт «${account.name}» будет удалён без возможности восстановления.`}
          onConfirm={handleDelete}
          onCancel={() => setConfirming(false)}
        />
      )}
    </div>
  )
}
