import { useMemo, useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import Card, { CardHeader } from '../../components/ui/Card.jsx';
import Table, { Td, Tr } from '../../components/ui/Table.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Select from '../../components/ui/Select.jsx';
import Input from '../../components/ui/Input.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import { LoadingBlock } from '../../components/ui/Spinner.jsx';
import { getCurrentUser, podeVerAuditoria } from '../../lib/auth.js';
import { formatDateTime } from '../../lib/format.js';
import { useAuditoriaLogs } from '../../hooks/useAuditoriaLogs.js';

const ACAO_BADGE = {
  CREATE: 'pago',
  CREATE_FA: 'pago',
  UPDATE: 'info',
  UPDATE_FA: 'info',
  DELETE: 'urgente',
  DELETE_FA: 'urgente',
};

export default function AuditoriaAcoesPage() {
  const user = getCurrentUser();

  if (!podeVerAuditoria(user)) {
    return (
      <Card>
        <EmptyState
          icon={ShieldAlert}
          title="Acesso restrito"
          description="A auditoria de ações só está disponível para Bruno, Isabella, Alexandra e LiderOP."
        />
      </Card>
    );
  }

  return <AuditoriaConteudo usuario={user.nome} />;
}

function AuditoriaConteudo({ usuario }) {
  const logsQuery = useAuditoriaLogs(usuario);

  const [filtroAcao, setFiltroAcao] = useState('');
  const [filtroUsuario, setFiltroUsuario] = useState('');
  const [dataDe, setDataDe] = useState('');
  const [dataAte, setDataAte] = useState('');

  const logs = logsQuery.data || [];

  const acoesDisponiveis = useMemo(() => {
    return [...new Set(logs.map((l) => l.acao).filter(Boolean))].sort();
  }, [logs]);

  const listaFiltrada = useMemo(() => {
    let lista = [...logs];
    if (filtroAcao) lista = lista.filter((l) => l.acao === filtroAcao);
    if (filtroUsuario.trim()) {
      const termo = filtroUsuario.trim().toLowerCase();
      lista = lista.filter((l) => (l.usuario || '').toLowerCase().includes(termo));
    }
    if (dataDe) lista = lista.filter((l) => new Date(l.data) >= new Date(`${dataDe}T00:00:00`));
    if (dataAte) lista = lista.filter((l) => new Date(l.data) <= new Date(`${dataAte}T23:59:59`));
    return lista;
  }, [logs, filtroAcao, filtroUsuario, dataDe, dataAte]);

  if (logsQuery.isLoading) {
    return (
      <Card>
        <LoadingBlock label="Carregando logs de auditoria..." />
      </Card>
    );
  }

  if (logsQuery.isError) {
    return (
      <Card>
        <EmptyState
          icon={ShieldAlert}
          title="Não foi possível carregar os logs"
          description={logsQuery.error?.message || 'Tente novamente mais tarde.'}
        />
      </Card>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <Card>
        <CardHeader
          title="Auditoria de Ações"
          subtitle="Últimos 100 eventos de criação, alteração e exclusão registrados no sistema."
        />

        <div className="flex flex-wrap gap-3 mb-4">
          <Input
            className="w-56"
            placeholder="Filtrar por usuário..."
            value={filtroUsuario}
            onChange={(e) => setFiltroUsuario(e.target.value)}
          />
          <Select className="w-48" value={filtroAcao} onChange={(e) => setFiltroAcao(e.target.value)}>
            <option value="">Todas as ações</option>
            {acoesDisponiveis.map((acao) => (
              <option key={acao} value={acao}>
                {acao}
              </option>
            ))}
          </Select>
          <Input type="date" className="w-40" value={dataDe} onChange={(e) => setDataDe(e.target.value)} />
          <Input type="date" className="w-40" value={dataAte} onChange={(e) => setDataAte(e.target.value)} />
        </div>

        {listaFiltrada.length === 0 ? (
          <EmptyState title="Nenhum log encontrado" description="Ajuste os filtros para ver outros eventos." />
        ) : (
          <Table columns={['Data', 'Ação', 'Usuário', 'Descrição', 'Registro']}>
            {listaFiltrada.map((log) => (
              <Tr key={log.id}>
                <Td>{formatDateTime(log.data)}</Td>
                <Td>
                  <Badge status={ACAO_BADGE[log.acao] || 'neutro'}>{log.acao}</Badge>
                </Td>
                <Td className="font-bold text-slate-800">{log.usuario}</Td>
                <Td className="max-w-md whitespace-normal">{log.descricao}</Td>
                <Td className="text-xs text-slate-400">{log.registroId}</Td>
              </Tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}
