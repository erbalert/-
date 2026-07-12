import type { Tab } from '../../App'
import Icon from '../common/Icon'
import IconButton from '../common/IconButton'
import { TABS } from './tabs'
import styles from './TopNav.module.css'

interface Props {
  active: Tab
  onChange: (tab: Tab) => void
  theme: 'light' | 'dark'
  onToggleTheme: () => void
}

export default function TopNav({ active, onChange, theme, onToggleTheme }: Props) {
  return (
    <>
      {/* Desktop / tablet top bar */}
      <header className={styles.header}>
        <div className={styles.brand}>
          <span className={styles.brandMark}>
            <Icon name="wallet" size={20} />
          </span>
          <span className={styles.brandText}>Финансы</span>
        </div>
        <nav className={styles.nav} aria-label="Основная навигация">
          {TABS.map(tab => (
            <button
              key={tab.id}
              className={`${styles.tab} ${active === tab.id ? styles.tabActive : ''}`}
              onClick={() => onChange(tab.id)}
              aria-current={active === tab.id ? 'page' : undefined}
            >
              <Icon name={tab.icon} size={17} />
              {tab.label}
            </button>
          ))}
        </nav>
        <div className={styles.themeToggle}>
          <IconButton
            icon={theme === 'dark' ? 'sun' : 'moon'}
            label={theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
            onClick={onToggleTheme}
          />
        </div>
      </header>

      {/* Mobile top bar (brand + theme) */}
      <div className={styles.mobileHeader}>
        <div className={styles.brand}>
          <span className={styles.brandMark}>
            <Icon name="wallet" size={18} />
          </span>
          <span className={styles.brandText}>Финансы</span>
        </div>
        <IconButton
          icon={theme === 'dark' ? 'sun' : 'moon'}
          label={theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
          onClick={onToggleTheme}
        />
      </div>

      {/* Mobile bottom tab bar */}
      <nav className={styles.bottomNav} aria-label="Навигация">
        {TABS.map(tab => (
          <button
            key={tab.id}
            className={`${styles.bottomTab} ${active === tab.id ? styles.bottomTabActive : ''}`}
            onClick={() => onChange(tab.id)}
            aria-current={active === tab.id ? 'page' : undefined}
          >
            <span className={styles.bottomTabIcon}>
              <Icon name={tab.icon} size={19} />
            </span>
            {tab.short}
          </button>
        ))}
      </nav>
    </>
  )
}
