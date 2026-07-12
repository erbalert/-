import { useRef, useState } from 'react'
import { useAccounts } from '../hooks/useAccounts'
import { useCategories } from '../hooks/useCategories'
import { useTransactions } from '../hooks/useTransactions'
import { useFinance } from '../state/useFinance'
import { useDataActions } from '../hooks/useDataActions'
import { useToast } from '../components/common/Toast'
import { downloadCsv, exportTransactionsToCsv, parseCsvContent, resolveImportRows } from '../utils/csv'
import type { CsvImportResult } from '../types'
import { todayIso } from '../utils/date'
import PageHeader from '../components/layout/PageHeader'
import Card from '../components/common/Card'
import Button from '../components/common/Button'
import ConfirmDialog from '../components/common/ConfirmDialog'
import PdfImport from '../components/importpdf/PdfImport'
import styles from './ImportExportPage.module.css'

export default function ImportExportPage() {
  const { accounts } = useAccounts()
  const { categories } = useCategories()
  const { transactions, addTransactionsBulk } = useTransactions()
  const { dispatch } = useFinance()
  const { loadDemo, clearAll } = useDataActions()
  const toast = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [result, setResult] = useState<CsvImportResult | null>(null)
  const [confirmingClear, setConfirmingClear] = useState(false)

  function handleExport() {
    const content = exportTransactionsToCsv(transactions, accounts, categories)
    downloadCsv(`operations-${todayIso()}.csv`, content)
    toast.success('CSV экспортирован')
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = () => {
      const content = String(reader.result ?? '')
      const { rows, errors } = parseCsvContent(content)
      const { newAccounts, newCategories, transactions: newTransactions } = resolveImportRows(rows, accounts, categories)

      for (const account of newAccounts) dispatch({ type: 'ADD_ACCOUNT', payload: account })
      for (const category of newCategories) dispatch({ type: 'ADD_CATEGORY', payload: category })
      if (newTransactions.length > 0) addTransactionsBulk(newTransactions)

      setResult({ imported: newTransactions.length, skipped: errors.length, errors })
      if (newTransactions.length > 0) toast.success(`Импортировано: ${newTransactions.length}`)
      else if (errors.length > 0) toast.error('Не удалось импортировать строки')
    }
    reader.readAsText(file, 'utf-8')
    e.target.value = ''
  }

  return (
    <div>
      <PageHeader title="Импорт и экспорт" subtitle="CSV, банковские выписки и управление данными" />

      <Card className={styles.section}>
        <h2 className={styles.sectionTitle}>Экспорт в CSV</h2>
        <p className={styles.hint}>Выгружает все операции ({transactions.length}) в файл CSV с кодировкой UTF-8.</p>
        <Button icon="download" onClick={handleExport} disabled={transactions.length === 0}>
          Экспортировать CSV
        </Button>
      </Card>

      <Card className={styles.section}>
        <h2 className={styles.sectionTitle}>Импорт из CSV</h2>
        <p className={styles.hint}>
          Формат: Дата,Тип,Счет,Категория,Сумма,Комментарий. Несуществующие счета и категории будут созданы
          автоматически.
        </p>
        <input
          ref={fileInputRef}
          className={styles.hiddenInput}
          type="file"
          accept=".csv,text/csv"
          onChange={handleFileChange}
        />
        <Button variant="secondary" icon="upload" onClick={() => fileInputRef.current?.click()}>
          Выбрать CSV-файл
        </Button>
        {result && (
          <div className={styles.summary}>
            <div className={styles.summaryHead}>
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
      </Card>

      <Card className={styles.section}>
        <h2 className={styles.sectionTitle}>Импорт PDF-выписок (Kaspi, Halyk)</h2>
        <p className={styles.hint}>
          Выберите банк и загрузите PDF-выписку. Операции распознаются автоматически — проверьте и отредактируйте их
          перед сохранением.
        </p>
        <PdfImport />
      </Card>

      <Card className={styles.section}>
        <h2 className={styles.sectionTitle}>Данные</h2>
        <p className={styles.hint}>Загрузите демонстрационный набор данных или очистите всё, чтобы начать заново.</p>
        <div className={styles.row}>
          <Button
            variant="secondary"
            icon="sparkles"
            onClick={() => {
              loadDemo()
              toast.success('Демо-данные загружены')
            }}
          >
            Загрузить демо-данные
          </Button>
          <Button variant="ghost" icon="trash" onClick={() => setConfirmingClear(true)}>
            Очистить все данные
          </Button>
        </div>
        <p className={styles.dangerNote}>Очистка удалит все счета, операции, бюджеты и кредиты без возможности отмены.</p>
      </Card>

      {confirmingClear && (
        <ConfirmDialog
          title="Очистить все данные?"
          message="Все счета, операции, бюджеты и кредиты будут удалены. Категории вернутся к значениям по умолчанию."
          confirmLabel="Очистить"
          onConfirm={() => {
            clearAll()
            setConfirmingClear(false)
            toast.success('Данные очищены')
          }}
          onCancel={() => setConfirmingClear(false)}
        />
      )}
    </div>
  )
}
