const STATUS_STYLES = {
  aberto: 'bg-amber-100 text-amber-700',
  pendente: 'bg-amber-100 text-amber-700',
  pago: 'bg-emerald-100 text-emerald-700',
  concluido: 'bg-emerald-100 text-emerald-700',
  fechado: 'bg-emerald-100 text-emerald-700',
  vencido: 'bg-rose-100 text-rose-700',
  urgente: 'bg-rose-100 text-rose-700',
  atencao: 'bg-orange-100 text-orange-700',
  neutro: 'bg-slate-100 text-slate-600',
  info: 'bg-blue-100 text-blue-700',
};

export default function Badge({ status = 'neutro', className = '', children }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${STATUS_STYLES[status] || STATUS_STYLES.neutro} ${className}`}
    >
      {children}
    </span>
  );
}

export function CountBadge({ count, className = '' }) {
  if (!count) return null;
  return (
    <span
      className={`inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full bg-rose-500 text-white text-xs font-bold ${className}`}
    >
      {count}
    </span>
  );
}
