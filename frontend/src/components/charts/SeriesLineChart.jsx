import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { SERIES_COLORS, TOOLTIP_CURSOR_FILL } from './palette.js';

export default function SeriesLineChart({ data, lines, xKey, height = 260, formatter }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="#e2e8f0" />
        <XAxis dataKey={xKey} tick={{ fontSize: 12, fill: '#64748b' }} axisLine={{ stroke: '#e2e8f0' }} tickLine={false} />
        <YAxis tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
        <Tooltip
          cursor={{ stroke: TOOLTIP_CURSOR_FILL, strokeWidth: 16 }}
          formatter={formatter}
          contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 13 }}
        />
        {lines.map((line, idx) => (
          <Line
            key={line.dataKey}
            type="monotone"
            dataKey={line.dataKey}
            name={line.name || line.dataKey}
            stroke={line.color || SERIES_COLORS[idx % SERIES_COLORS.length]}
            strokeWidth={2.5}
            dot={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
