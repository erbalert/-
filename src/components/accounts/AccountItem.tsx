import { useState } from 'react'
import type { Account } from '../../types'
import { formatMoney } from '../../utils/money'
import { useAccounts } from '../../hooks/useAccounts'
import { useToast } from '../common/Toast'
import ConfirmDialog from '../common/ConfirmDialog'
import Icon from '../common/Icon'
import IconButton from '../common/IconButton'
import AccountForm from './AccountForm'
import styles from './AccountItem.module.css'

interface Props {
  account: Account
}

export default function AccountItem({ account }: Props) {
  const { balanceOf, renameAccount, deleteAccount } = useAccounts()
  const toast = useToast()
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
    if (result.ok) {
      toast.success('Счёт удалён')
    } else {
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
        <div className={styles.info}>
          <span className={styles.badge}>
            <Icon name="wallet" size={19} />
          </span>
          <div>
            <div className={styles.name}>{account.name}</div>
            <div className={styles.balance}>{formatMoney(balanceOf(account.id))}</div>
          </div>
        </div>
        <div className={styles.actions}>
          <IconButton icon="edit" label="Переименовать" onClick={() => setEditing(true)} size={17} />
          <IconButton icon="trash" label="Удалить" danger onClick={() => setConfirming(true)} size={17} />
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
