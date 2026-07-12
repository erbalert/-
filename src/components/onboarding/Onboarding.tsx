import type { Tab } from '../../App'
import Icon from '../common/Icon'
import Button from '../common/Button'
import { useDataActions } from '../../hooks/useDataActions'
import { useToast } from '../common/Toast'
import styles from './Onboarding.module.css'

const STEPS = [
  { title: 'Создайте счёт', desc: 'Например «Карта» или «Наличные» — на нём будут храниться операции.' },
  { title: 'Добавьте операцию', desc: 'Запишите доход или расход с суммой, категорией и датой.' },
  { title: 'Смотрите аналитику', desc: 'Графики, бюджеты и баланс обновятся автоматически.' },
]

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
        <h1 className={styles.title}>Добро пожаловать!</h1>
        <p className={styles.subtitle}>
          Учёт доходов и расходов, бюджеты, кредиты и аналитика — всё локально в вашем браузере. Начните за 3 шага.
        </p>
      </div>

      <div className={styles.steps}>
        {STEPS.map((step, i) => (
          <div className={styles.step} key={i}>
            <span className={styles.stepNum}>{i + 1}</span>
            <div className={styles.stepText}>
              <div className={styles.stepTitle}>{step.title}</div>
              <div className={styles.stepDesc}>{step.desc}</div>
            </div>
          </div>
        ))}
      </div>

      <div className={styles.actions}>
        <Button icon="wallet" size="lg" onClick={() => onNavigate('accounts')}>
          Создать первый счёт
        </Button>
        <span className={styles.or}>или</span>
        <Button variant="secondary" icon="sparkles" onClick={handleDemo}>
          Загрузить демо-данные
        </Button>
      </div>
    </div>
  )
}
