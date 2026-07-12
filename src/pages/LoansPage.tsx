import LoanForm from '../components/loans/LoanForm'
import LoanList from '../components/loans/LoanList'
import PageHeader from '../components/layout/PageHeader'
import Card from '../components/common/Card'

export default function LoansPage() {
  return (
    <div>
      <PageHeader title="Кредиты" subtitle="График платежей и анализ долговой нагрузки" />
      <Card style={{ marginBottom: 'var(--sp-5)' }}>
        <LoanForm />
      </Card>
      <LoanList />
    </div>
  )
}
