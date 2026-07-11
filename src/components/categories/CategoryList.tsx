import { useState } from 'react'
import type { Category, TransactionType } from '../../types'
import { useCategories } from '../../hooks/useCategories'
import ConfirmDialog from '../common/ConfirmDialog'
import Modal from '../common/Modal'
import CategoryBadge from './CategoryBadge'
import CategoryForm from './CategoryForm'
import styles from './CategoryList.module.css'

function CategoryGroup({ type, title }: { type: TransactionType; title: string }) {
  const { byType, addCategory, updateCategory, deleteCategory } = useCategories()
  const [editing, setEditing] = useState<Category | null>(null)
  const [deleting, setDeleting] = useState<Category | null>(null)
  const [blockedMessage, setBlockedMessage] = useState<string | null>(null)

  function handleDelete() {
    if (!deleting) return
    const result = deleteCategory(deleting.id)
    setDeleting(null)
    if (!result.ok) {
      setBlockedMessage(
        `Нельзя удалить категорию «${deleting.name}»: с ней связано операций/бюджетов/правил — ${result.usageCount}.`
      )
    }
  }

  return (
    <div className={styles.group}>
      <h3 className={styles.groupTitle}>{title}</h3>
      {blockedMessage && <p className={styles.warning}>{blockedMessage}</p>}
      {byType(type).map(category => (
        <div className={styles.row} key={category.id}>
          <CategoryBadge category={category} />
          <div className={styles.actions}>
            <button className={styles.iconButton} onClick={() => setEditing(category)} aria-label="Изменить">
              ✏️
            </button>
            <button className={styles.iconButton} onClick={() => setDeleting(category)} aria-label="Удалить">
              🗑️
            </button>
          </div>
        </div>
      ))}
      <CategoryForm
        fixedType={type}
        onSubmit={data => addCategory(data.name, data.type, data.color, data.icon)}
      />
      {editing && (
        <Modal title="Изменить категорию" onClose={() => setEditing(null)}>
          <CategoryForm
            initial={editing}
            submitLabel="Сохранить"
            onSubmit={data => {
              updateCategory({ ...editing, ...data })
              setEditing(null)
            }}
          />
        </Modal>
      )}
      {deleting && (
        <ConfirmDialog
          title="Удалить категорию?"
          message={`Категория «${deleting.name}» будет удалена без возможности восстановления.`}
          onConfirm={handleDelete}
          onCancel={() => setDeleting(null)}
        />
      )}
    </div>
  )
}

export default function CategoryList() {
  return (
    <div>
      <CategoryGroup type="expense" title="Категории расходов" />
      <CategoryGroup type="income" title="Категории доходов" />
    </div>
  )
}
