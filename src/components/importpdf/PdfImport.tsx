import { useRef, useState } from 'react'
import type { TransactionType } from '../../types'
import type { NewTransaction } from '../../hooks/useTransactions'
import { useAccounts } from '../../hooks/useAccounts'
import { useCategories } from '../../hooks/useCategories'
import { useTransactions } from '../../hooks/useTransactions'
import { useFinance } from '../../state/useFinance'
import { useToast } from '../common/Toast'
import type { BankId } from '../../import/pdfStatement'
import { suggestCategory } from '../../import/autoCategory'
import { formatMoney } from '../../utils/money'
import Button from '../common/Button'
import Icon from '../common/Icon'
import IconButton from '../common/IconButton'
import styles from './PdfImport.module.css'

interface EditableRow {
  id: string
  date: string
  type: TransactionType
  amount: number
  description: string
  categoryId: string
  selected: boolean
}

const NEW_ACCOUNT = '__new__'

export default function PdfImport() {
  const { accounts } = useAccounts()
  const { categories, byType } = useCategories()
  const { addTransactionsBulk } = useTransactions()
  const { dispatch } = useFinance()
  const toast = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [bank, setBank] = useState<BankId>('kaspi')
  const [loading, setLoading] = useState(false)
  const [rows, setRows] = useState<EditableRow[]>([])
  const [detectWarning, setDetectWarning] = useState<string | null>(null)
  const [accountChoice, setAccountChoice] = useState<string>(accounts[0]?.id ?? NEW_ACCOUNT)
  const [newAccountName, setNewAccountName] = useState('')
  const [bulkCategory, setBulkCategory] = useState('')

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    setLoading(true)
    setDetectWarning(null)
    try {
      // Lazy-load pdf.js and parsers so they stay out of the initial bundle.
      const [{ extractLines }, { kaspiParser }, { halykParser }] = await Promise.all([
        import('../../import/pdfStatement'),
        import('../../import/parsers/kaspi'),
        import('../../import/parsers/halyk'),
      ])
      const parsers = { kaspi: kaspiParser, halyk: halykParser }

      const pages = await extractLines(file)
      const parser = parsers[bank]

      if (!parser.detect(pages)) {
        const other = Object.values(parsers).find(p => p.bankId !== bank && p.detect(pages))
        setDetectWarning(
          other
            ? `Файл похож на выписку ${other.label}, а выбран ${parser.label}. Проверьте выбор банка.`
            : `Не удалось распознать формат ${parser.label}. Проверьте, что это PDF-выписка нужного банка.`
        )
      }

      const parsed = parser.parse(pages)
      if (parsed.length === 0) {
        toast.error('Не удалось распознать операции в файле')
        setRows([])
        return
      }

      setRows(
        parsed.map(r => ({
          id: crypto.randomUUID(),
          date: r.date,
          type: r.type,
          amount: r.amount,
          description: r.description,
          categoryId: suggestCategory(r, categories),
          selected: true,
        }))
      )
      setNewAccountName(parser.defaultAccountName(pages))
      if (accounts.length === 0) setAccountChoice(NEW_ACCOUNT)
      toast.success(`Распознано операций: ${parsed.length}`)
    } catch (err) {
      toast.error('Ошибка чтения PDF-файла')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  function updateRow(id: string, patch: Partial<EditableRow>) {
    setRows(prev => prev.map(r => (r.id === id ? { ...r, ...patch } : r)))
  }

  function applyBulkCategory() {
    if (!bulkCategory) return
    setRows(prev => prev.map(r => (r.selected ? { ...r, categoryId: bulkCategory } : r)))
  }

  function handleConfirm() {
    const selectedRows = rows.filter(r => r.selected)
    if (selectedRows.length === 0) {
      toast.error('Нет выбранных операций')
      return
    }

    let accountId = accountChoice
    if (accountChoice === NEW_ACCOUNT) {
      const name = newAccountName.trim() || 'Импорт'
      accountId = crypto.randomUUID()
      dispatch({ type: 'ADD_ACCOUNT', payload: { id: accountId, name, createdAt: Date.now() } })
    }

    const fallbackByType = (type: TransactionType) => byType(type).find(c => c.name === 'Прочее')?.id ?? byType(type)[0]?.id ?? ''

    const transactions: NewTransaction[] = selectedRows.map(r => ({
      type: r.type,
      amount: r.amount,
      accountId,
      categoryId: r.categoryId || fallbackByType(r.type),
      date: r.date,
      note: r.description || undefined,
    }))

    addTransactionsBulk(transactions)
    toast.success(`Импортировано операций: ${transactions.length}`)
    setRows([])
    setDetectWarning(null)
  }

  const selectedCount = rows.filter(r => r.selected).length

  return (
    <div>
      <div className={styles.controls}>
        <select
          className={styles.control}
          value={bank}
          onChange={e => setBank(e.target.value as BankId)}
          aria-label="Банк"
        >
          <option value="kaspi">Kaspi Bank</option>
          <option value="halyk">Halyk Bank</option>
        </select>
        <input ref={fileInputRef} className={styles.hiddenInput} type="file" accept="application/pdf,.pdf" onChange={handleFile} />
        <Button variant="secondary" icon="upload" loading={loading} onClick={() => fileInputRef.current?.click()}>
          Загрузить PDF-выписку
        </Button>
      </div>

      {detectWarning && (
        <div className={styles.warning}>
          <Icon name="alert" size={16} />
          <span>{detectWarning}</span>
        </div>
      )}

      {rows.length > 0 && (
        <>
          <div className={styles.previewHead}>
            <span className={styles.count}>
              Проверьте операции: выбрано {selectedCount} из {rows.length}
            </span>
            <div className={styles.bulkRow}>
              <select
                className={styles.control}
                value={bulkCategory}
                onChange={e => setBulkCategory(e.target.value)}
                aria-label="Категория для выбранных"
              >
                <option value="">Категория для выбранных…</option>
                {categories.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.type === 'income' ? 'Доход' : 'Расход'}: {c.name}
                  </option>
                ))}
              </select>
              <Button variant="secondary" size="sm" onClick={applyBulkCategory} disabled={!bulkCategory}>
                Назначить выбранным
              </Button>
            </div>
          </div>

          <div className={styles.accountRow}>
            <span className={styles.accountLabel}>Счёт:</span>
            <select
              className={styles.control}
              value={accountChoice}
              onChange={e => setAccountChoice(e.target.value)}
              aria-label="Счёт для импорта"
            >
              {accounts.map(a => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
              <option value={NEW_ACCOUNT}>+ Новый счёт</option>
            </select>
            {accountChoice === NEW_ACCOUNT && (
              <input
                className={styles.control}
                value={newAccountName}
                onChange={e => setNewAccountName(e.target.value)}
                placeholder="Название счёта"
                aria-label="Название нового счёта"
              />
            )}
          </div>

          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th></th>
                  <th>Дата</th>
                  <th>Тип</th>
                  <th>Сумма</th>
                  <th>Описание</th>
                  <th>Категория</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map(row => (
                  <tr key={row.id}>
                    <td>
                      <input
                        type="checkbox"
                        checked={row.selected}
                        onChange={e => updateRow(row.id, { selected: e.target.checked })}
                        aria-label="Выбрать операцию"
                      />
                    </td>
                    <td>
                      <input
                        className={styles.cellInput}
                        type="date"
                        value={row.date}
                        onChange={e => updateRow(row.id, { date: e.target.value })}
                      />
                    </td>
                    <td>
                      <select
                        className={styles.cellInput}
                        value={row.type}
                        onChange={e => {
                          const type = e.target.value as TransactionType
                          updateRow(row.id, { type, categoryId: byType(type)[0]?.id ?? '' })
                        }}
                      >
                        <option value="expense">Расход</option>
                        <option value="income">Доход</option>
                      </select>
                    </td>
                    <td>
                      <input
                        className={`${styles.cellInput} ${styles.amountInput}`}
                        type="number"
                        min="0"
                        step="0.01"
                        value={row.amount}
                        onChange={e => updateRow(row.id, { amount: Number(e.target.value) })}
                      />
                    </td>
                    <td>
                      <input
                        className={`${styles.cellInput} ${styles.descInput}`}
                        value={row.description}
                        onChange={e => updateRow(row.id, { description: e.target.value })}
                      />
                    </td>
                    <td>
                      <select
                        className={styles.cellInput}
                        value={row.categoryId}
                        onChange={e => updateRow(row.id, { categoryId: e.target.value })}
                      >
                        {byType(row.type).map(c => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <IconButton
                        icon="trash"
                        label="Убрать строку"
                        danger
                        size={15}
                        onClick={() => setRows(prev => prev.filter(r => r.id !== row.id))}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className={styles.footer}>
            <Button icon="check" onClick={handleConfirm} disabled={selectedCount === 0}>
              Импортировать {selectedCount > 0 ? `(${selectedCount})` : ''}
            </Button>
            <Button variant="ghost" onClick={() => setRows([])}>
              Отмена
            </Button>
          </div>
          <p style={{ marginTop: 'var(--sp-2)', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
            Итого выбрано: {formatMoney(rows.filter(r => r.selected).reduce((s, r) => s + (r.type === 'income' ? r.amount : -r.amount), 0))}
          </p>
        </>
      )}
    </div>
  )
}
