import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import type { TooltipProps } from 'recharts'
import type { CategorySlice } from '../../utils/analytics'
import { formatMoney } from '../../utils/money'
import EmptyState from '../common/EmptyState'
import styles from './CategoryPieChart.module.css'

interface Props {
  title: string
  data: CategorySlice[]
}

function renderTooltip({ active, payload }: TooltipProps<number, string>) {
  if (!active || !payload || payload.length === 0) return null
  const slice = payload[0].payload as CategorySlice
  return (
    <div className={styles.tooltip}>
      <strong>{slice.name}</strong>
      <div>{formatMoney(slice.amount)}</div>
    </div>
  )
}

export default function CategoryPieChart({ title, data }: Props) {
  const total = data.reduce((sum, s) => sum + s.amount, 0)

  return (
    <div className={styles.wrap}>
      <h3 className={styles.title}>{title}</h3>
      {total === 0 ? (
        <EmptyState icon="dashboard" text="Нет данных за период" />
      ) : (
        <div className={styles.body}>
          <div className={styles.chart}>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={data}
                  dataKey="amount"
                  nameKey="name"
                  innerRadius={55}
                  outerRadius={90}
                  paddingAngle={2}
                  strokeWidth={2}
                  style={{ stroke: 'var(--surface)' }}
                >
                  {data.map(slice => (
                    <Cell key={slice.categoryId} fill={slice.color} />
                  ))}
                </Pie>
                <Tooltip content={renderTooltip} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className={styles.legend}>
            {data.map(slice => (
              <div className={styles.legendRow} key={slice.categoryId}>
                <span className={styles.swatch} style={{ background: slice.color }} />
                <span className={styles.legendName}>{slice.name}</span>
                <span className={styles.legendAmount}>{formatMoney(slice.amount)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
