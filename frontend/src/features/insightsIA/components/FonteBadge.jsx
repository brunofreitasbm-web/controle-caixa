// Badge pequeno que explica de onde veio o texto gerado (IA, fallback
// determinístico, ou "sem lastro suficiente para opinar") — os três estados
// que os endpoints /api/ia/* podem devolver em `_fonte`, sempre com HTTP 200.
const STYLES = {
  ia: 'bg-blue-100 text-blue-700',
  fallback: 'bg-slate-100 text-slate-600',
  'dados-insuficientes': 'bg-amber-100 text-amber-700',
  'sem-dados': 'bg-amber-100 text-amber-700',
};

const LABELS = {
  ia: 'Gerado por IA',
  fallback: 'Cálculo automático (IA indisponível)',
  'dados-insuficientes': 'Dados insuficientes',
  'sem-dados': 'Sem lançamentos ainda',
};

export default function FonteBadge({ fonte, className = '' }) {
  if (!fonte) return null;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold whitespace-nowrap ${STYLES[fonte] || STYLES.fallback} ${className}`}
    >
      {LABELS[fonte] || fonte}
    </span>
  );
}
