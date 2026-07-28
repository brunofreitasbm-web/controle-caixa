import { Loader2 } from 'lucide-react';

export default function Spinner({ size = 20, className = '' }) {
  return <Loader2 size={size} className={`animate-spin text-blue-600 ${className}`} />;
}

export function LoadingBlock({ label = 'Carregando...' }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12 text-slate-500">
      <Spinner size={28} />
      <p className="text-sm">{label}</p>
    </div>
  );
}
