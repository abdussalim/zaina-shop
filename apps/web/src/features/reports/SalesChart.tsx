import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { formatQuantity } from '../../lib/format.js'

export function SalesChart({ data }: { data: { productName: string; quantityBase: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data.slice(0, 8)} layout="vertical" margin={{ left: 8, right: 18 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#dcd6c8" />
        <XAxis type="number" hide />
        <YAxis type="category" dataKey="productName" width={120} tick={{ fontSize: 11, fill: '#66675e' }} axisLine={false} tickLine={false} />
        <Tooltip formatter={(value) => formatQuantity(Number(value))} cursor={{ fill: '#f4f0e7' }} />
        <Bar dataKey="quantityBase" fill="#626a45" radius={[0, 4, 4, 0]} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  )
}
