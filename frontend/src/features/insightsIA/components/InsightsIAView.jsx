import { Sparkles } from 'lucide-react';
import StatusBadge from './StatusBadge.jsx';
import BriefingCard from './BriefingCard.jsx';
import CoachCard from './CoachCard.jsx';
import EscalaCard from './EscalaCard.jsx';
import CopilotoCard from './CopilotoCard.jsx';

const LOJAS_CS = ['Marambaia', 'Icoaraci', 'Mário Covas'];

export default function InsightsIAView({ negocio, title }) {
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Sparkles className="text-blue-600" size={22} />
            {title}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Leitura apurada dos dados do negócio, com coaching e recomendações geradas por IA.
          </p>
        </div>
        <StatusBadge />
      </div>

      <BriefingCard />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {negocio === 'cacau-show' ? (
          <>
            <EscalaCard lojas={LOJAS_CS} />
            <CopilotoCard />
          </>
        ) : (
          <CoachCard />
        )}
      </div>
    </div>
  );
}
