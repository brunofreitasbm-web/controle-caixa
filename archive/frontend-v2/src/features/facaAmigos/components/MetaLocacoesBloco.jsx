import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import Card, { CardHeader } from '../../../components/ui/Card.jsx';
import Badge from '../../../components/ui/Badge.jsx';
import Button from '../../../components/ui/Button.jsx';
import Table, { Td, Tr } from '../../../components/ui/Table.jsx';
import Input, { Field } from '../../../components/ui/Input.jsx';
import { LoadingBlock } from '../../../components/ui/Spinner.jsx';
import { useLancamentosMes, useRegraLocacoes, useSalvarDiaria } from '../../../hooks/useFaBonificacao.js';
import { dataHojeStr, farolLocacoes, metaLocacoesDoDia, nomeDiaSemanaPorData } from '../constants.js';

export default function MetaLocacoesBloco({ unidade, usuarioAlvo, competencia }) {
  const hoje = dataHojeStr();
  const regraQuery = useRegraLocacoes(competencia);
  const lancamentosQuery = useLancamentosMes(usuarioAlvo, unidade, competencia);
  const salvarMutation = useSalvarDiaria();

  const [locacoes, setLocacoes] = useState('0');

  useEffect(() => {
    const lancamentoHoje = (lancamentosQuery.data || []).find((l) => l.data === hoje);
    setLocacoes(String(lancamentoHoje?.locacoes || 0));
  }, [lancamentosQuery.data, hoje]);

  const regra = regraQuery.data?.regra;
  const metaHoje = regra ? metaLocacoesDoDia(hoje, regra) : 0;
  const farolHoje = regra ? farolLocacoes(Number(locacoes) || 0, metaHoje, regra) : null;

  const linhas = useMemo(() => {
    if (!regra) return [];
    return [...(lancamentosQuery.data || [])]
      .sort((a, b) => b.data.localeCompare(a.data))
      .map((l) => {
        const meta = metaLocacoesDoDia(l.data, regra);
        const realizado = l.locacoes || 0;
        return { ...l, meta, realizado, farol: farolLocacoes(realizado, meta, regra) };
      });
  }, [lancamentosQuery.data, regra]);

  const totalMes = (lancamentosQuery.data || []).reduce((s, l) => s + (l.locacoes || 0), 0);
  const metaMes = regra?.metaMes || 0;
  const pisoMes = regra?.pisoMes || 0;
  const superMetaMes = regra?.superMetaMes || 0;
  const pctMes = metaMes > 0 ? Math.min(100, (totalMes / metaMes) * 100) : 0;

  async function salvarHoje() {
    try {
      await salvarMutation.mutateAsync({ usuario: usuarioAlvo, unidade, data: hoje, locacoes: Number(locacoes) || 0 });
      toast.success('Locações de hoje salvas!');
    } catch (err) {
      toast.error(err.message || 'Erro ao salvar. Tente novamente.');
    }
  }

  if (regraQuery.isLoading || lancamentosQuery.isLoading) {
    return <LoadingBlock label="Carregando meta de locações..." />;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title={`Registrar Locações de Hoje (${nomeDiaSemanaPorData(hoje)}, ${hoje.split('-').reverse().join('/')})`} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Total de locações no dia">
            <Input type="number" min="0" value={locacoes} onChange={(e) => setLocacoes(e.target.value)} />
          </Field>
          <Field label="Meta de hoje">
            <Input value={`${metaHoje} locações`} disabled />
          </Field>
        </div>
        {farolHoje && (
          <p className="mt-3 text-sm font-bold flex items-center gap-2">
            <Badge status={farolHoje.badge}>{farolHoje.emoji} {farolHoje.texto}</Badge>
            <span className="text-slate-600">{locacoes || 0} de {metaHoje} locações</span>
          </p>
        )}
        <Button className="mt-4" variant="secondary" onClick={salvarHoje} disabled={salvarMutation.isPending}>
          {salvarMutation.isPending ? 'Salvando...' : 'Salvar Locações de Hoje'}
        </Button>
      </Card>

      <Card>
        <CardHeader title="Progresso do Mês (Locações)" />
        <div className="flex justify-between text-xs font-bold text-slate-500 mb-1.5">
          <span>Locações acumuladas</span>
          <span>{totalMes} / {metaMes}</span>
        </div>
        <div className="relative w-full h-4 bg-slate-100 rounded-full border border-slate-200 overflow-hidden">
          <div
            className={`h-full transition-all duration-500 ${totalMes >= metaMes ? 'bg-emerald-500' : totalMes >= pisoMes ? 'bg-amber-400' : 'bg-rose-500'}`}
            style={{ width: `${pctMes}%` }}
          />
          {metaMes > 0 && (
            <>
              <div className="absolute top-0 bottom-0 w-0.5 bg-rose-600" style={{ left: `${Math.min(100, (pisoMes / metaMes) * 100)}%` }} title="Piso" />
              <div className="absolute top-0 bottom-0 w-0.5 bg-emerald-700" style={{ left: `${Math.min(100, (superMetaMes / metaMes) * 100)}%` }} title="Super-meta" />
            </>
          )}
        </div>
        <p className="mt-3 text-sm font-bold text-center text-slate-600">
          {totalMes >= superMetaMes && superMetaMes > 0
            ? '🏆 Super-meta batida! Desempenho excelente no mês!'
            : totalMes >= metaMes
              ? '🎯 Meta do mês batida! Continue assim!'
              : totalMes >= pisoMes
                ? '🟡 Piso alcançado — vamos em direção à meta!'
                : 'Registre as locações para acompanhar a meta do mês!'}
        </p>
      </Card>

      <Card>
        <CardHeader title="Locações do Mês" />
        {linhas.length === 0 ? (
          <p className="text-sm text-slate-500">Nenhuma locação registrada este mês ainda.</p>
        ) : (
          <Table columns={['Data', 'Dia da Semana', 'Meta', 'Realizado', '% Meta', 'Farol']}>
            {linhas.map((l) => (
              <Tr key={l.data}>
                <Td>{l.data.split('-').reverse().join('/')}</Td>
                <Td>{nomeDiaSemanaPorData(l.data)}</Td>
                <Td>{l.meta}</Td>
                <Td>{l.realizado}</Td>
                <Td>{l.meta > 0 ? `${((l.realizado / l.meta) * 100).toFixed(0)}%` : '—'}</Td>
                <Td>
                  <Badge status={l.farol.badge}>{l.farol.emoji} {l.farol.texto}</Badge>
                </Td>
              </Tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}
