import { useRealtimeStatus } from '../../lib/realtime.jsx';

const STATUS = {
  'ao-vivo': { dot: 'bg-emerald-500', text: 'text-emerald-700 bg-emerald-50', label: 'Ao vivo' },
  fallback: { dot: 'bg-amber-500', text: 'text-amber-700 bg-amber-50', label: 'Atualizando a cada 20s' },
  reconectando: { dot: 'bg-rose-500', text: 'text-rose-700 bg-rose-50', label: 'Reconectando...' },
};

export default function RealtimeIndicator() {
  const status = useRealtimeStatus();
  const cfg = STATUS[status] || STATUS.reconectando;

  return (
    <span className={`hidden md:inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${cfg.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}
