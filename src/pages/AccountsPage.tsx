import AccountList from '../components/accounts/AccountList'
import CategoryList from '../components/categories/CategoryList'
import styles from './AccountsPage.module.css'

export default function AccountsPage() {
  return (
    <div>
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Счета</h2>
        <AccountList />
      </section>
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Категории</h2>
        <CategoryList />
      </section>
    </div>
  )
}
