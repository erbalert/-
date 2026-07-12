import AccountList from '../components/accounts/AccountList'
import CategoryList from '../components/categories/CategoryList'
import PageHeader from '../components/layout/PageHeader'
import styles from './AccountsPage.module.css'

export default function AccountsPage() {
  return (
    <div>
      <PageHeader title="Счета и категории" subtitle="Управляйте счетами и категориями операций" />
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
