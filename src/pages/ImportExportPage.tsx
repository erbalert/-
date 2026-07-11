import { useRef, useState } from 'react'
import { useAccounts } from '../hooks/useAccounts'
import { useCategories } from '../hooks/useCategories'
import { useTransactions } from '../hooks/useTransactions'
import { useFinance } from '../state/useFinance'
import { downloadCsv, exportTransactionsToCsv, parseCsvContent, resolveImportRows } from '../utils/csv'
import type { CsvImportResult } from '../types'
import { todayIso } from '../utils/date'
import styles from './ImportExportPage.module.css'

export default function ImportExportPage() {
  const { accounts } = useAccounts()
  const { categories } = useCategories()
  const { transactions, addTransactionsBulk } = useTransactions()
  const { dispatch } = useFinance()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [result, setResult] = useState<CsvImportResult | null>(null)

  function handleExport() {
    const content = exportTransactionsToCsv(transactions, accounts, categories)
    downloadCsv(`operations-${todayIso()}.csv`, content)
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = () => {
      const content = String(reader.result ?? '')
      const { rows, errors } = parseCsvContent(content)
      const { newAccounts, newCategories, transactions: newTransactions } = resolveImportRows(rows, accounts, categories)

      for (const account of newAccounts) {
        dispatch({ type: 'ADD_ACCOUNT', payload: account })
      }
      for (const category of newCategories) {
        dispatch({ type: 'ADD_CATEGORY', payload: category })
      }
      if (newTransactions.length > 0) {
        addTransactionsBulk(newTransactions)
      }

      setResult({ imported: newTransactions.length, skipped: errors.length, errors })
    }
    reader.readAsText(file, 'utf-8')
    e.target.value = ''
  }

  return (
    <div>
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Экспорт в CSV</h2>
        <p className={styles.hint}>
          Выгружает все операции ({transactions.length}) в файл CSV с кодировкой UTF-8.
        </p>
        <button className={styles.button} onClick={handleExport} disabled={transactions.length === 0}>
          Экспортировать CSV
        </button>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Импорт из CSV</h2>
        <p className={styles.hint}>
          Формат: Дата,Тип,Счет,Категория,Сумма,Комментарий. Несуществующие счета и категории будут созданы
          автоматически.
        </p>
        <input ref={fileInputRef} type="file" accept=".csv,text/csv" onChange={handleFileChange} />
        {result && (
          <div className={styles.summary}>
            <div>
              Импортировано: {result.imported}, пропущено: {result.skipped}
            </div>
            {result.errors.length > 0 && (
              <div className={styles.errorList}>
                {result.errors.map((err, i) => (
                  <div className={styles.errorRow} key={i}>
                    Строка {err.row}: {err.message}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Импорт PDF-выписок (Kaspi, Halyk)</h2>
        <p className={styles.disabledNote}>
          Раздел появится после того, как будут переданы примеры PDF-выписок для калибровки разбора.
        </p>
      </section>
    </div>
  )
}
