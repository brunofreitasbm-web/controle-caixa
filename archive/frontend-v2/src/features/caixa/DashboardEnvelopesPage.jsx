import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, CheckCircle2, Clock, Lock, MessageCircleMore, PackageOpen, Wallet } from 'lucide-react';
import Card, { CardHeader } from '../../components/ui/Card.jsx';
import StatCard from '../../components/ui/StatCard.jsx';
import Table, { Td, Tr } from '../../components/ui/Table.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Button from '../../components/ui/Button.jsx';
import Select from '../../components/ui/Select.jsx';
import Input, { Field } from '../../components/ui/Input.jsx';
import Modal from '../../components/ui/Modal.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import { LoadingBlock } from '../../components/ui/Spinner.jsx';
import { getCurrentUser } from '../../lib/auth.js';
import { formatBRL, formatDateTime } from '../../lib/format.js';
import { abrirWhatsapp } from '../../lib/whatsapp.js';
import {
  LOJAS_CACAU_SHOW,
  RETIRADA_PERMITIDA,
  RISCO_DIAS,
  STATUS_BADGE,
  STATUS_LABELS,
  diffDias,
  mesmoDia,
  montarMensagemAviso,
  toDatetimeLocal,
  useAtualizarRegistro,
  useRegistros,
} from '../../hooks/useCaixa.js';

export default function DashboardEnvelopesPage() {
  const user = getCurrentUser();
  const podeRetirar = RETIRADA_PERMITIDA.includes(user?.nome);

  const registrosQuery = useRegistros();
  const atualizarRegistro = useAtualizarRegistro();

  const [filtroLoja, setFiltroLoja] = useState('');
  const [filtroStatus, setFiltroStatus] = useState('');
  const [alvoRetirada, setAlvoRetirada] = useState(null);
  const [dataRetirada, setDataRetirada] = useState(toDatetimeLocal());
  const [responsavelRetirada, setResponsavelRetirada] = useState('');

  const registros = registrosQuery.data || [];

  const stats = useMemo(() => {
    const hoje = new Date().toISOString();
    const abertosHoje = registros.filter((r) => r.tipoOperacao === 'Abertura' && mesmoDia(r.dataOperacao, hoje)).length;
    const fechadosHoje = registros.filter((r) => r.tipoOperacao === 'Fechamento' && mesmoDia(r.dataOperacao, hoje)).length;
    const pendentes = registros.filter((r) => r.status === 'aguardando_retirada');
    const totalTransito = pendentes.reduce((s, r) => s + (Number(r.valorEnvelope) || 0), 0);
    return { abertosHoje, fechadosHoje, pendentesQtd: pendentes.length, totalTransito };
  }, [registros]);

  const listaFiltrada = useMemo(() => {
    let lista = [...registros].sort((a, b) => new Date(b.dataOperacao) - new Date(a.dataOperacao));
    if (filtroLoja) lista = lista.filter((r) => r.loja === filtroLoja);
    if (filtroStatus) lista = lista.filter((r) => r.status === filtroStatus);
    return lista;
  }, [registros, filtroLoja, filtroStatus]);

  function abrirModalRetirada(registro) {
    if (!podeRetirar) {
      toast.error('Apenas Bruno, Isabella, Alexandra ou LiderOP podem confirmar retiradas.');
      return;
    }
    setAlvoRetirada(registro);
    setDataRetirada(toDatetimeLocal());
    setResponsavelRetirada('');
  }

  async function confirmarRetirada() {
    if (!alvoRetirada) return;
    if (!dataRetirada || !responsavelRetirada.trim()) {
      toast.error('Preencha a data e o responsável pela retirada.');
      return;
    }
    try {
      await atualizarRegistro.mutateAsync({
        id: alvoRetirada.id,
        campos: {
          status: 'retirado',
          dataRetirada: new Date(dataRetirada).toISOString(),
          retiradoPor: responsavelRetirada.trim(),
          confirmadoPorApp: user?.nome || null,
        },
        usuario: user?.nome,
      });
      toast.success('Retirada confirmada com sucesso!');
      setAlvoRetirada(null);
    } catch (err) {
      toast.error(err.message || 'Erro ao confirmar retirada.');
    }
  }

  function avisar(registro) {
    abrirWhatsapp('', montarMensagemAviso(registro));
    if (!registro.mensagemGerada) {
      atualizarRegistro.mutate({ id: registro.id, campos: { mensagemGerada: true }, usuario: user?.nome });
    }
  }

  if (registrosQuery.isLoading) {
    return (
      <Card>
        <LoadingBlock label="Carregando envelopes..." />
      </Card>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Aberturas hoje" value={stats.abertosHoje} icon={PackageOpen} gradient="blue" />
        <StatCard label="Fechamentos hoje" value={stats.fechadosHoje} icon={CheckCircle2} gradient="emerald" />
        <StatCard label="Aguardando retirada" value={stats.pendentesQtd} icon={Clock} gradient="amber" />
        <StatCard label="Total em trânsito" value={formatBRL(stats.totalTransito)} icon={Wallet} gradient="rose" />
      </div>

      <Card>
        <CardHeader
          title="Envelopes"
          subtitle="Acompanhamento de todos os registros de caixa das lojas."
          action={
            <div className="flex flex-wrap gap-2">
              <Select value={filtroLoja} onChange={(e) => setFiltroLoja(e.target.value)} className="w-40">
                <option value="">Todas as lojas</option>
                {LOJAS_CACAU_SHOW.map((loja) => (
                  <option key={loja} value={loja}>
                    {loja}
                  </option>
                ))}
              </Select>
              <Select value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)} className="w-48">
                <option value="">Todos os status</option>
                {Object.entries(STATUS_LABELS).map(([valor, label]) => (
                  <option key={valor} value={valor}>
                    {label}
                  </option>
                ))}
              </Select>
            </div>
          }
        />

        {listaFiltrada.length === 0 ? (
          <EmptyState title="Nenhum envelope encontrado" description="Ajuste os filtros ou registre um novo envelope." />
        ) : (
          <Table columns={['Loja', 'Consultor', 'Data', 'Fundo', 'Envelope', 'Status', 'Dias', 'Ações']}>
            {listaFiltrada.map((r) => {
              const dias = r.status === 'aguardando_retirada' ? diffDias(r.dataOperacao) : null;
              const risco = dias !== null && dias >= RISCO_DIAS;
              return (
                <Tr key={r.id}>
                  <Td className="font-bold text-slate-800">{r.loja}</Td>
                  <Td>{r.consultor}</Td>
                  <Td>{formatDateTime(r.dataOperacao)}</Td>
                  <Td>{formatBRL(r.fundoCaixa)}</Td>
                  <Td>{r.valorEnvelope != null ? formatBRL(r.valorEnvelope) : '—'}</Td>
                  <Td>
                    <Badge status={STATUS_BADGE[r.status] || 'neutro'}>{STATUS_LABELS[r.status] || r.status}</Badge>
                  </Td>
                  <Td>
                    {dias !== null ? (
                      <span className={`text-xs font-bold ${risco ? 'text-rose-600' : 'text-slate-500'}`}>
                        {risco && <AlertTriangle size={12} className="inline mr-1 -mt-0.5" />}
                        {dias}d
                      </span>
                    ) : (
                      '—'
                    )}
                  </Td>
                  <Td>
                    <div className="flex items-center gap-2">
                      {r.tipoOperacao === 'Fechamento' && (
                        <Button variant="ghost" size="sm" onClick={() => avisar(r)} title="Avisar via WhatsApp">
                          <MessageCircleMore size={16} />
                        </Button>
                      )}
                      {r.status === 'aguardando_retirada' &&
                        (podeRetirar ? (
                          <Button variant="secondary" size="sm" onClick={() => abrirModalRetirada(r)}>
                            Confirmar retirada
                          </Button>
                        ) : (
                          <span className="text-xs text-slate-400 flex items-center gap-1">
                            <Lock size={12} /> restrito
                          </span>
                        ))}
                    </div>
                  </Td>
                </Tr>
              );
            })}
          </Table>
        )}
      </Card>

      <Modal
        open={!!alvoRetirada}
        onClose={() => setAlvoRetirada(null)}
        title="Confirmar Retirada"
        footer={
          <>
            <Button variant="outline" onClick={() => setAlvoRetirada(null)} disabled={atualizarRegistro.isPending}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={confirmarRetirada} disabled={atualizarRegistro.isPending}>
              {atualizarRegistro.isPending ? 'Confirmando...' : 'Confirmar'}
            </Button>
          </>
        }
      >
        {alvoRetirada && (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              {alvoRetirada.loja} — {alvoRetirada.consultor} — {formatBRL(alvoRetirada.valorEnvelope)}
            </p>
            <Field label="Data e hora da retirada *">
              <Input type="datetime-local" value={dataRetirada} onChange={(e) => setDataRetirada(e.target.value)} />
            </Field>
            <Field label="Responsável pela retirada *">
              <Input
                value={responsavelRetirada}
                onChange={(e) => setResponsavelRetirada(e.target.value)}
                placeholder="Nome de quem retirou o envelope"
              />
            </Field>
          </div>
        )}
      </Modal>
    </div>
  );
}
