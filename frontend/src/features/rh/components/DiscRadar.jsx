import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer } from 'recharts';
import { DISC_LABELS } from '../discProfiles.js';

export default function DiscRadar({ d = 0, i = 0, s = 0, c = 0, height = 260 }) {
  const data = [
    { eixo: 'D', label: DISC_LABELS.d, valor: d },
    { eixo: 'I', label: DISC_LABELS.i, valor: i },
    { eixo: 'S', label: DISC_LABELS.s, valor: s },
    { eixo: 'C', label: DISC_LABELS.c, valor: c },
  ];

  return (
    <ResponsiveContainer width="100%" height={height}>
      <RadarChart data={data} outerRadius="72%">
        <PolarGrid stroke="#e2e8f0" />
        <PolarAngleAxis dataKey="eixo" tick={{ fontSize: 13, fontWeight: 700, fill: '#334155' }} />
        <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fontSize: 10, fill: '#94a3b8' }} />
        <Radar name="Perfil" dataKey="valor" stroke="#4f46e5" fill="#4f46e5" fillOpacity={0.35} />
      </RadarChart>
    </ResponsiveContainer>
  );
}
