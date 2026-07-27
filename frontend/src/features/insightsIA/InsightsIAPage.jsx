import { Sparkles } from 'lucide-react';
import StatusBadge from './components/StatusBadge.jsx';
import BriefingCard from './components/BriefingCard.jsx';
import CoachCard from './components/CoachCard.jsx';
import EscalaCard from './components/EscalaCard.jsx';

export default function InsightsIAPage() {
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Sparkles className="text-blue-600" size={22} />
            Insights IA
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Leitura apurada dos dados do negócio, com coaching e recomendações geradas por IA.
          </p>
        </div>
        <StatusBadge />
      </div>

      <BriefingCard />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <CoachCard />
        <EscalaCard />
      </div>
    </div>
  );
}
