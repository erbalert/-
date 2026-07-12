import BudgetForm from '../components/budgets/BudgetForm'
import BudgetProgressList from '../components/budgets/BudgetProgressList'
import PageHeader from '../components/layout/PageHeader'
import Card from '../components/common/Card'

export default function BudgetsPage() {
  return (
    <div>
      <PageHeader title="Бюджеты" subtitle="Лимиты трат по категориям на текущий месяц" />
      <Card style={{ marginBottom: 'var(--sp-5)' }}>
        <BudgetForm />
      </Card>
      <BudgetProgressList />
    </div>
  )
}
