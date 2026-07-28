import { Sparkles, TriangleAlert } from 'lucide-react';
import { useIAStatus } from '../../../hooks/useIA.js';

export default function StatusBadge() {
  const { data, isLoading, isError } = useIAStatus();

  if (isLoading) return null;

  const habilitada = !isError && data?.habilitada;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold ${
        habilitada ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
      }`}
    >
      {habilitada ? <Sparkles size={14} /> : <TriangleAlert size={14} />}
      {habilitada
        ? `IA ativa${data?.provedor ? ` (${data.provedor})` : ''}`
        : 'IA indisponível — usando cálculo automático'}
    </span>
  );
}
