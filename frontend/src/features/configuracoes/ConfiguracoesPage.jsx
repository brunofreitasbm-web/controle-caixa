import { Settings } from 'lucide-react';
import { getCurrentUser, isOwner, isLiderOperacao } from '../../lib/auth.js';
import OperacoesCard from './components/OperacoesCard.jsx';
import NotificacoesCard from './components/NotificacoesCard.jsx';
import PinsCard from './components/PinsCard.jsx';
import BackupCard from './components/BackupCard.jsx';

export default function ConfiguracoesPage() {
  const user = getCurrentUser();
  // Mesma regra do app antigo: só quem cuida da operação no dia a dia mexe em
  // geolocalização/horário/cerca virtual (afeta o Ponto de todo mundo).
  const podeVerOperacoes = isOwner(user) || isLiderOperacao(user);
  // Gestão de PINs concede acesso ao login de qualquer colaborador(a) — fica
  // restrita ao Owner.
  const podeVerPins = isOwner(user);

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <Settings className="text-blue-600" size={22} />
          Configurações
        </h1>
        <p className="text-sm text-slate-500 mt-1">Parâmetros gerais da operação, notificações, acesso e backup.</p>
      </div>

      {podeVerOperacoes && <OperacoesCard />}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <NotificacoesCard />
        <BackupCard />
      </div>

      {podeVerPins && <PinsCard />}
    </div>
  );
}
