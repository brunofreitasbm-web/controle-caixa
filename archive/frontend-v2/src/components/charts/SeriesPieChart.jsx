import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { SERIES_COLORS } from './palette.js';

export default function SeriesPieChart({ data, dataKey = 'value', nameKey = 'name', height = 260, donut = true }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie
          data={data}
          dataKey={dataKey}
          nameKey={nameKey}
          innerRadius={donut ? '55%' : 0}
          outerRadius="80%"
          paddingAngle={2}
        >
          {data.map((entry, idx) => (
            <Cell key={entry[nameKey] || idx} fill={SERIES_COLORS[idx % SERIES_COLORS.length]} />
          ))}
        </Pie>
        <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 13 }} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}
