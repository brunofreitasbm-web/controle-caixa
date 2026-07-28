import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Award, Gem } from 'lucide-react';
import Card, { CardHeader } from '../../../components/ui/Card.jsx';
import StatCard from '../../../components/ui/StatCard.jsx';
import Badge from '../../../components/ui/Badge.jsx';
import Button from '../../../components/ui/Button.jsx';
import Table, { Td, Tr } from '../../../components/ui/Table.jsx';
import Input, { Field } from '../../../components/ui/Input.jsx';
import { LoadingBlock } from '../../../components/ui/Spinner.jsx';
import { formatBRL, formatPercent } from '../../../lib/format.js';
import { useLancamentosMes, useLancamentosMesTodas } from '../../../hooks/useFaBonificacao.js';
import { useRegraBonificacao, useSalvarDiaria } from '../../../hooks/useFaBonificacao.js';
import { calcularBonificacaoFa, calcularLinhaBonificacaoFa, dataHojeStr, nomeDiaSemanaPorData } from '../constants.js';

export default function MetaConversaoBloco({ unidade, usuarioAlvo, competencia }) {
  const hoje = dataHojeStr();
  const regraQuery = useRegraBonificacao(competencia);
  const lancamentosQuery = useLancamentosMes(usuarioAlvo, unidade, competencia);
  const lancamentosTodasQuery = useLancamentosMesTodas(unidade, competencia);
  const salvarMutation = useSalvarDiaria();

  const [vendas30, setVendas30] = useState('0');
  const [vendas1h, setVendas1h] = useState('0');
  const [vendas2h, setVendas2h] = useState('0');

  useEffect(() => {
    const lancamentoHoje = (lancamentosQuery.data || []).find((l) => l.data === hoje);
    setVendas30(String(lancamentoHoje?.vendas30 || 0));
    setVendas1h(String(lancamentoHoje?.vendas1h || 0));
    setVendas2h(String(lancamentoHoje?.vendas2h || 0));
  }, [lancamentosQuery.data, hoje]);

  const totalHoje = (Number(vendas30) || 0) + (Number(vendas1h) || 0) + (Number(vendas2h) || 0);
  const pctHoje = totalHoje > 0 ? ((Number(vendas1h) || 0) + (Number(vendas2h) || 0)) / totalHoje * 100 : 0;

  const regra = regraQuery.data?.regra;
  const resultado = useMemo(() => {
    if (!regra) return null;
    return calcularBonificacaoFa(lancamentosQuery.data || [], regra);
  }, [lancamentosQuery.data, regra]);

  const linhasTodas = useMemo(() => {
    if (!regra) return [];
    return (lancamentosTodasQuery.data || [])
      .map((l) => calcularLinhaBonificacaoFa(l, regra))
      .sort((a, b) => b.data.localeCompare(a.data) || a.usuario.localeCompare(b.usuario));
  }, [lancamentosTodasQuery.data, regra]);

  async function salvarHoje() {
    try {
      await salvarMutation.mutateAsync({
        usuario: usuarioAlvo,
        unidade,
        data: hoje,
        vendas30: Number(vendas30) || 0,
        vendas1h: Number(vendas1h) || 0,
        vendas2h: Number(vendas2h) || 0,
      });
      toast.success('Vendas de hoje salvas!');
    } catch (err) {
      toast.error(err.message || 'Erro ao salvar. Tente novamente.');
    }
  }

  if (regraQuery.isLoading || lancamentosQuery.isLoading) {
    return <LoadingBlock label="Carregando meta..." />;
  }

  const pctMensal = (resultado?.pctConversaoMensal || 0) * 100;
  const tier = resultado?.tierNome;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title={`Lançar Vendas de Hoje (${nomeDiaSemanaPorData(hoje)}, ${hoje.split('-').reverse().join('/')})`} />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Field label="Vendas 30min (Qtd)">
            <Input type="number" min="0" value={vendas30} onChange={(e) => setVendas30(e.target.value)} />
          </Field>
          <Field label="Vendas 1h (Qtd)">
            <Input type="number" min="0" value={vendas1h} onChange={(e) => setVendas1h(e.target.value)} />
          </Field>
          <Field label="Vendas 2h (Qtd)">
            <Input type="number" min="0" value={vendas2h} onChange={(e) => setVendas2h(e.target.value)} />
          </Field>
        </div>
        <p className="text-sm text-slate-500 mt-3">
          Total de atendimentos hoje: <strong className="text-slate-800">{totalHoje}</strong> &middot; % Conversão hoje: <strong className="text-slate-800">{pctHoje.toFixed(1)}%</strong>
        </p>
        <Button className="mt-4" variant="secondary" onClick={salvarHoje} disabled={salvarMutation.isPending}>
          {salvarMutation.isPending ? 'Salvando...' : 'Salvar Vendas de Hoje'}
        </Button>
      </Card>

      <Card>
        <CardHeader
          title="Progresso da Meta Mensal"
          action={tier ? (
            <Badge status={tier === 'diamante' ? 'info' : 'pago'} className="flex items-center gap-1">
              {tier === 'diamante' ? <Gem size={12} /> : <Award size={12} />} {tier === 'diamante' ? 'Diamante' : 'Ouro'}
            </Badge>
          ) : null}
        />
        <div className="flex justify-between text-xs font-bold text-slate-500 mb-1.5">
          <span>Conversão de Planos Longos (1h + 2h)</span>
          <span>{formatPercent(pctMensal)}</span>
        </div>
        <div className="relative w-full h-4 bg-slate-100 rounded-full border border-slate-200 overflow-hidden">
          <div
            className={`h-full transition-all duration-500 ${tier === 'diamante' ? 'bg-blue-600' : tier === 'ouro' ? 'bg-amber-400' : 'bg-slate-400'}`}
            style={{ width: `${Math.min(100, pctMensal)}%` }}
          />
          {regra && (
            <>
              <div className="absolute top-0 bottom-0 w-0.5 bg-amber-600" style={{ left: `${(regra.ouroPercentMin || 0) * 100}%` }} title="Meta Ouro" />
              <div className="absolute top-0 bottom-0 w-0.5 bg-blue-700" style={{ left: `${(regra.diamantePercentMin || 0) * 100}%` }} title="Meta Diamante" />
            </>
          )}
        </div>
        {regra && (
          <p className="mt-3 text-sm font-bold text-center">
            {tier === 'diamante' && <span className="text-blue-700">💎 Bônus Diamante conquistado! Você é fera!</span>}
            {tier === 'ouro' && (
              <span className="text-amber-600">
                🥇 Bônus Ouro garantido! Faltam {((regra.diamantePercentMin - resultado.pctConversaoMensal) * 100).toFixed(1)} pontos percentuais para o Diamante 💎
              </span>
            )}
            {!tier && (
              <span className="text-slate-500">
                Continue vendendo planos de 1h e 2h! Faltam {((regra.ouroPercentMin - (resultado?.pctConversaoMensal || 0)) * 100).toFixed(1)} pontos percentuais para o Bônus Ouro 🥉
              </span>
            )}
          </p>
        )}
      </Card>

      {resultado && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <StatCard label="Total de Atendimentos" value={resultado.totalAtend} hint="no mês" gradient="blue" />
          <StatCard label="Vendas 30min" value={resultado.totalV30} hint="no mês" gradient="blue" />
          <StatCard label="Vendas 1h" value={resultado.totalV1h} hint="no mês" gradient="emerald" />
          <StatCard label="Vendas 2h" value={resultado.totalV2h} hint="no mês" gradient="emerald" />
          <StatCard label="Pix Guardião Acumulado" value={formatBRL(resultado.totalPix)} hint="fins de semana qualificados" gradient="amber" />
          <StatCard label="Total Estimado no Mês" value={formatBRL(resultado.totalEstimado)} hint="bônus + pix" gradient="rose" />
        </div>
      )}

      <Card>
        <CardHeader title="Lançamentos do Mês" subtitle="Todas as colaboradoras da unidade" />
        {linhasTodas.length === 0 ? (
          <p className="text-sm text-slate-500">Nenhum lançamento este mês ainda.</p>
        ) : (
          <Table columns={['Data', 'Colaboradora', 'Dia da Semana', '30min', '1h', '2h', 'Total', '% Conversão', 'Pix']}>
            {linhasTodas.map((l) => (
              <Tr key={`${l.usuario}-${l.data}`}>
                <Td>{l.data.split('-').reverse().join('/')}</Td>
                <Td>{l.usuario}</Td>
                <Td>{l.diaSemana}</Td>
                <Td>{l.vendas30 || 0}</Td>
                <Td>{l.vendas1h || 0}</Td>
                <Td>{l.vendas2h || 0}</Td>
                <Td>{l.total}</Td>
                <Td>{(l.pctConversao * 100).toFixed(1)}%</Td>
                <Td>{l.pixHoje > 0 ? formatBRL(l.pixHoje) : '—'}</Td>
              </Tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}
