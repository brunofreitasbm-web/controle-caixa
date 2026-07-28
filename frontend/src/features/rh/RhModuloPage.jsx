import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ShieldAlert } from 'lucide-react';
import Card from '../../components/ui/Card.jsx';
import Select from '../../components/ui/Select.jsx';
import Tabs from '../../components/ui/Tabs.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import { LoadingBlock } from '../../components/ui/Spinner.jsx';
import { getCurrentUser, isOwner } from '../../lib/auth.js';
import { useColaboradores } from '../../hooks/useColaboradores.js';
import { fetchDiscProfiles, persistDiscProfiles, LOJAS_RH } from './discProfiles.js';
import PerfisUploadTab from './components/PerfisUploadTab.jsx';
import DashboardGerencialTab from './components/DashboardGerencialTab.jsx';
import FormacaoEquipeTab from './components/FormacaoEquipeTab.jsx';

const TABS = [
  { key: 'perfis', label: 'Perfis & Upload' },
  { key: 'dashboard', label: 'Dashboard Gerencial' },
  { key: 'formacao', label: 'Formação de Equipe' },
];

export default function RhModuloPage() {
  const user = getCurrentUser();
  const [tab, setTab] = useState('perfis');
  const [filterStore, setFilterStore] = useState('all');
  const queryClient = useQueryClient();

  const colaboradoresQuery = useColaboradores();
  const profilesQuery = useQuery({ queryKey: ['disc-profiles'], queryFn: fetchDiscProfiles });

  if (!isOwner(user)) {
    return (
      <Card>
        <EmptyState
          icon={ShieldAlert}
          title="Acesso restrito"
          description="O Módulo RH (perfis DISC e formação de equipe) é visível apenas para o perfil Owner."
        />
      </Card>
    );
  }

  async function salvarPerfis(novosPerfis) {
    await persistDiscProfiles(novosPerfis);
    queryClient.setQueryData(['disc-profiles'], novosPerfis);
  }

  if (colaboradoresQuery.isLoading || profilesQuery.isLoading) {
    return (
      <Card>
        <LoadingBlock label="Carregando perfis DISC..." />
      </Card>
    );
  }

  if (colaboradoresQuery.isError || profilesQuery.isError) {
    toast.error('Não foi possível carregar os dados do Módulo RH.');
  }

  const colaboradores = colaboradoresQuery.data || [];
  const profiles = profilesQuery.data || {};

  return (
    <div className="animate-fade-in space-y-4">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Módulo RH — Perfis DISC</h1>
          <p className="text-sm text-slate-500 mt-0.5">Gestão de pessoas, comportamento e formação de equipe.</p>
        </div>
        <Select value={filterStore} onChange={(e) => setFilterStore(e.target.value)} className="w-full md:w-56">
          {Object.entries(LOJAS_RH).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </Select>
      </div>

      <Tabs tabs={TABS} active={tab} onChange={setTab} />

      {tab === 'perfis' && (
        <PerfisUploadTab
          profiles={profiles}
          colaboradores={colaboradores}
          filterStore={filterStore}
          onFilterStoreChange={setFilterStore}
          onSaveProfiles={salvarPerfis}
        />
      )}
      {tab === 'dashboard' && <DashboardGerencialTab profiles={profiles} colaboradores={colaboradores} filterStore={filterStore} />}
      {tab === 'formacao' && <FormacaoEquipeTab profiles={profiles} colaboradores={colaboradores} filterStore={filterStore} />}
    </div>
  );
}
