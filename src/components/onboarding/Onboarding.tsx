import type { Tab } from '../../App'
import Icon from '../common/Icon'
import Button from '../common/Button'
import StatementDropZone from '../importpdf/StatementDropZone'
import { useDataActions } from '../../hooks/useDataActions'
import { useToast } from '../common/Toast'
import styles from './Onboarding.module.css'

interface Props {
  onNavigate: (tab: Tab) => void
}

export default function Onboarding({ onNavigate }: Props) {
  const { loadDemo } = useDataActions()
  const toast = useToast()

  function handleDemo() {
    loadDemo()
    toast.success('Демо-данные загружены')
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.hero}>
        <div className={styles.badge}>
          <Icon name="sparkles" size={30} />
        </div>
        <h1 className={styles.title}>Загрузите выписки — остальное сделаю я</h1>
        <p className={styles.subtitle}>
          Перетащите PDF-выписки банка (можно за весь год) — приложение само распознает операции, определит счета,
          категории и кредиты и построит аналитику. Всё локально в вашем браузере.
        </p>
      </div>

      <StatementDropZone onImported={() => onNavigate('dashboard')} />

      <div className={styles.actions}>
        <span className={styles.or}>или</span>
        <div className={styles.secondaryActions}>
          <Button variant="secondary" icon="sparkles" onClick={handleDemo}>
            Демо-данные
          </Button>
          <Button variant="ghost" icon="wallet" onClick={() => onNavigate('accounts')}>
            Ввести вручную
          </Button>
        </div>
      </div>
    </div>
  )
}
