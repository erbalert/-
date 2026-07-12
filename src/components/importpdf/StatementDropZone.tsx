import { useRef, useState } from 'react'
import { useFinance } from '../../state/useFinance'
import { useToast } from '../common/Toast'
import { formatDateRu } from '../../utils/date'
import Icon from '../common/Icon'
import styles from './StatementDropZone.module.css'

interface Props {
  onImported?: () => void
}

export default function StatementDropZone({ onImported }: Props) {
  const { state, dispatch } = useFinance()
  const toast = useToast()
  const inputRef = useRef<HTMLInputElement>(null)
  const [loading, setLoading] = useState(false)
  const [dragover, setDragover] = useState(false)
  const [progress, setProgress] = useState<{ pct: number; label: string } | null>(null)

  async function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return
    const files = Array.from(fileList).filter(f => /\.pdf$/i.test(f.name) || f.type === 'application/pdf')
    if (files.length === 0) {
      toast.error('Поддерживаются только PDF-выписки')
      return
    }

    setLoading(true)
    setProgress({ pct: 0, label: 'Готовим файлы…' })
    try {
      const { runImport } = await import('../../import/importPipeline')
      const result = await runImport(files, state, p => {
        if (p.phase === 'commit') {
          setProgress({ pct: 100, label: 'Сохраняем…' })
          return
        }
        const pct = p.totalPages > 0 ? Math.round((p.processedPages / p.totalPages) * 100) : 0
        const filePart = p.files > 1 ? `файл ${p.fileIndex} из ${p.files} · ` : ''
        setProgress({ pct, label: `Распознаём: ${filePart}страница ${p.processedPages}/${p.totalPages}` })
      })

      const now = Date.now()
      const txs = result.transactions.map(t => ({ ...t, id: crypto.randomUUID(), createdAt: now }))
      dispatch({
        type: 'IMPORT_COMMIT',
        payload: { accounts: result.newAccounts, loans: result.newLoans, transactions: txs },
      })

      const { stats } = result
      if (stats.imported === 0) {
        if (stats.duplicates > 0) toast.info(`Новых операций нет — пропущено дублей: ${stats.duplicates}`)
        else if (stats.unrecognized.length > 0) toast.error('Не удалось распознать выписку. Поддерживаются Kaspi и Halyk.')
        else toast.error('В файле не найдено операций')
      } else {
        const period = stats.dateRange
          ? ` за ${formatDateRu(stats.dateRange.from)} – ${formatDateRu(stats.dateRange.to)}`
          : ''
        let msg = `Импортировано ${stats.imported} операций${period}`
        const extras: string[] = []
        if (stats.duplicates > 0) extras.push(`дублей пропущено: ${stats.duplicates}`)
        if (stats.loansDetected > 0) extras.push(`кредитов найдено: ${stats.loansDetected}`)
        if (extras.length) msg += ` (${extras.join(', ')})`
        toast.success(msg)
        if (stats.unrecognized.length > 0) {
          toast.error(`Не распознано файлов: ${stats.unrecognized.length}`)
        }
        onImported?.()
      }
    } catch (err) {
      console.error(err)
      toast.error('Ошибка при обработке выписок')
    } finally {
      setLoading(false)
      setProgress(null)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  if (loading) {
    return (
      <div className={styles.loading}>
        <div className={styles.progressTrack}>
          <div className={styles.progressFill} style={{ width: `${progress?.pct ?? 0}%` }} />
        </div>
        <div className={styles.progressText}>
          <span>{progress?.label ?? 'Распознаём выписки…'}</span>
          <span className={styles.progressPct}>{progress?.pct ?? 0}%</span>
        </div>
      </div>
    )
  }

  return (
    <>
      <div
        className={`${styles.zone} ${dragover ? styles.dragover : ''}`}
        onClick={() => inputRef.current?.click()}
        onDragOver={e => {
          e.preventDefault()
          setDragover(true)
        }}
        onDragLeave={() => setDragover(false)}
        onDrop={e => {
          e.preventDefault()
          setDragover(false)
          handleFiles(e.dataTransfer.files)
        }}
        role="button"
        tabIndex={0}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            inputRef.current?.click()
          }
        }}
      >
        <span className={styles.iconWrap}>
          <Icon name="upload" size={24} />
        </span>
        <span className={styles.title}>Перетащите PDF-выписки сюда</span>
        <span className={styles.hint}>
          Можно несколько файлов за раз (например, за весь год). Всё распознаётся, категоризируется и попадает в аналитику
          автоматически.
        </span>
        <span className={styles.banks}>Поддерживаются Kaspi и Halyk</span>
      </div>
      <input
        ref={inputRef}
        className={styles.hiddenInput}
        type="file"
        accept="application/pdf,.pdf"
        multiple
        onChange={e => handleFiles(e.target.files)}
      />
    </>
  )
}
