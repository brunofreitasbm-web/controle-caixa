import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { CheckCircle2, LayoutDashboard, PackageCheck } from 'lucide-react';
import Card, { CardHeader } from '../../components/ui/Card.jsx';
import StatCard from '../../components/ui/StatCard.jsx';
import Button from '../../components/ui/Button.jsx';
import Select from '../../components/ui/Select.jsx';
import Table, { Td, Tr } from '../../components/ui/Table.jsx';
import Input, { Field } from '../../components/ui/Input.jsx';
import Modal from '../../components/ui/Modal.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import { LoadingBlock } from '../../components/ui/Spinner.jsx';
import { formatBRL, formatDate } from '../../lib/format.js';
import { getCurrentUser } from '../../lib/auth.js';
import { useAtualizarRegistroFa, useRegistrosFa } from '../../hooks/useFacaAmigos.js';
import { UNIDADES_FA } from './constants.js';

const GRADIENTE_UNIDADE = { 'Grão Pará': 'blue', ParqueShopping: 'emerald', 'Parque Circuito': 'amber' };

function diasAguardando(dataOperacao) {
  const dias = Math.floor((Date.now() - new Date(dataOperacao).getTime()) / 86400000);
  return Math.max(0, dias);
}

export default function DashboardPage() {
  const usuarioAtual = getCurrentUser();
  const registrosQuery = useRegistrosFa();
  const atualizarMutation = useAtualizarRegistroFa();

  const [filtroUnidade, setFiltroUnidade] = useState('');
  const [alvoRetirada, setAlvoRetirada] = useState(null);
  const [responsavel, setResponsavel] = useState('');

  const pendentes = useMemo(
    () => (registrosQuery.data || []).filter((r) => r.status === 'aguardando_retirada' && (Number(r.valorEnvelope) || 0) > 0),
    [registrosQuery.data]
  );

  const totalGeral = pendentes.reduce((s, r) => s + (Number(r.valorEnvelope) || 0), 0);

  const totaisPorUnidade = useMemo(() => {
    const mapa = {};
    UNIDADES_FA.forEach((u) => {
      mapa[u] = pendentes.filter((r) => r.loja === u).reduce((s, r) => s + (Number(r.valorEnvelope) || 0), 0);
    });
    return mapa;
  }, [pendentes]);

  const linhasTabela = useMemo(() => {
    const filtradas = filtroUnidade ? pendentes.filter((r) => r.loja === filtroUnidade) : pendentes;
    return [...filtradas].sort((a, b) => new Date(a.dataOperacao) - new Date(b.dataOperacao));
  }, [pendentes, filtroUnidade]);

  function abrirModalRetirada(registro) {
    setAlvoRetirada(registro);
    setResponsavel('');
  }

  async function confirmarRetirada() {
    if (!responsavel.trim()) {
      toast.error('Informe o responsável pela retirada.');
      return;
    }
    try {
      await atualizarMutation.mutateAsync({
        id: alvoRetirada.id,
        dados: {
          status: 'retirado',
          dataRetirada: new Date().toISOString(),
          retiradoPor: responsavel.trim(),
          confirmadoPorApp: usuarioAtual?.nome || null,
          autorizadoPor: null,
        },
      });
      toast.success('Retirada confirmada com sucesso!');
      setAlvoRetirada(null);
    } catch (err) {
      toast.error(err.message || 'Erro ao confirmar retirada.');
    }
  }

  if (registrosQuery.isLoading) {
    return <LoadingBlock label="Carregando dashboard..." />;
  }

  return (
    <div className="animate-fade-in space-y-6">
      <div className="flex items-center gap-3">
        <div className="rounded-full bg-emerald-100 text-emerald-600 p-2.5">
          <LayoutDashboard size={22} />
        </div>
        <div>
          <h1 className="text-lg font-bold text-slate-800">Envelopes FaçaAmigos</h1>
          <p className="text-sm text-slate-500">Visão geral por unidade e retiradas pendentes</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total em trânsito" value={formatBRL(totalGeral)} icon={PackageCheck} gradient="rose" />
        {UNIDADES_FA.map((u) => (
          <StatCard
            key={u}
            label={u}
            value={formatBRL(totaisPorUnidade[u] || 0)}
            hint="aguardando retirada"
            gradient={GRADIENTE_UNIDADE[u] || 'blue'}
          />
        ))}
      </div>

      <Card>
        <CardHeader
          title="Envelopes Aguardando Retirada"
          action={
            <Select value={filtroUnidade} onChange={(e) => setFiltroUnidade(e.target.value)} className="w-48">
              <option value="">Todas as lojas</option>
              {UNIDADES_FA.map((u) => (
                <option key={u} value={u}>{u}</option>
              ))}
            </Select>
          }
        />
        {linhasTabela.length === 0 ? (
          <EmptyState icon={CheckCircle2} title="Nenhum envelope pendente" description="Todos os envelopes já foram retirados." />
        ) : (
          <Table columns={['Loja', 'Consultora', 'Data Fechamento', 'Valor Envelope', 'Dias Aguardando', 'Ação']}>
            {linhasTabela.map((r) => (
              <Tr key={r.id}>
                <Td>{r.loja}</Td>
                <Td>{r.consultor}</Td>
                <Td>{formatDate(r.dataOperacao)}</Td>
                <Td className="font-bold text-slate-800">{formatBRL(r.valorEnvelope)}</Td>
                <Td>{diasAguardando(r.dataOperacao)}</Td>
                <Td>
                  <Button size="sm" variant="secondary" onClick={() => abrirModalRetirada(r)}>
                    Confirmar retirada
                  </Button>
                </Td>
              </Tr>
            ))}
          </Table>
        )}
      </Card>

      <Modal
        open={!!alvoRetirada}
        onClose={() => setAlvoRetirada(null)}
        title="Confirmar Retirada"
        footer={
          <>
            <Button variant="outline" onClick={() => setAlvoRetirada(null)}>Cancelar</Button>
            <Button variant="secondary" onClick={confirmarRetirada} disabled={atualizarMutation.isPending}>
              {atualizarMutation.isPending ? 'Confirmando...' : 'Confirmar'}
            </Button>
          </>
        }
      >
        {alvoRetirada && (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              Envelope de <strong>{formatBRL(alvoRetirada.valorEnvelope)}</strong> — {alvoRetirada.loja} ({alvoRetirada.consultor})
            </p>
            <Field label="Retirado por *">
              <Input value={responsavel} onChange={(e) => setResponsavel(e.target.value)} placeholder="Nome do responsável" autoFocus />
            </Field>
          </div>
        )}
      </Modal>
    </div>
  );
}
