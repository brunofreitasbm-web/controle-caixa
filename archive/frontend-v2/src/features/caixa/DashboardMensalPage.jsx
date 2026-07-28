import { useMemo, useState } from 'react';
import { CalendarRange, PackageCheck, Wallet } from 'lucide-react';
import Card, { CardHeader } from '../../components/ui/Card.jsx';
import StatCard from '../../components/ui/StatCard.jsx';
import Table, { Td, Tr } from '../../components/ui/Table.jsx';
import Input from '../../components/ui/Input.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import { LoadingBlock } from '../../components/ui/Spinner.jsx';
import SeriesBarChart from '../../components/charts/SeriesBarChart.jsx';
import SeriesLineChart from '../../components/charts/SeriesLineChart.jsx';
import { formatBRL } from '../../lib/format.js';
import { LOJAS_CACAU_SHOW, mesKey, mesLabel, useRegistros } from '../../hooks/useCaixa.js';

function competenciaAtual() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export default function DashboardMensalPage() {
  const registrosQuery = useRegistros();
  const [competencia, setCompetencia] = useState(competenciaAtual);

  const registros = registrosQuery.data || [];

  const fechamentosDoMes = useMemo(
    () => registros.filter((r) => r.tipoOperacao === 'Fechamento' && mesKey(r.dataOperacao) === competencia),
    [registros, competencia]
  );

  const totalMes = useMemo(
    () => fechamentosDoMes.reduce((s, r) => s + (Number(r.valorEnvelope) || 0), 0),
    [fechamentosDoMes]
  );

  const porLoja = useMemo(() => {
    return LOJAS_CACAU_SHOW.map((loja) => {
      const doLoja = fechamentosDoMes.filter((r) => r.loja === loja);
      return {
        loja,
        total: doLoja.reduce((s, r) => s + (Number(r.valorEnvelope) || 0), 0),
        qtd: doLoja.length,
      };
    });
  }, [fechamentosDoMes]);

  const porDia = useMemo(() => {
    const somaPorDia = {};
    fechamentosDoMes.forEach((r) => {
      const dia = String(new Date(r.dataOperacao).getDate()).padStart(2, '0');
      somaPorDia[dia] = (somaPorDia[dia] || 0) + (Number(r.valorEnvelope) || 0);
    });
    return Object.entries(somaPorDia)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([dia, total]) => ({ dia, total }));
  }, [fechamentosDoMes]);

  if (registrosQuery.isLoading) {
    return (
      <Card>
        <LoadingBlock label="Carregando dashboard mensal..." />
      </Card>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <Card>
        <CardHeader
          title="Dashboard Mensal"
          subtitle={`Fechamentos de caixa consolidados por competência — ${mesLabel(competencia)}`}
          action={
            <div className="flex items-center gap-2">
              <CalendarRange size={18} className="text-slate-400" />
              <Input type="month" value={competencia} onChange={(e) => setCompetencia(e.target.value)} className="w-40" />
            </div>
          }
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <StatCard label={`Total em envelopes — ${mesLabel(competencia)}`} value={formatBRL(totalMes)} icon={Wallet} gradient="blue" />
          <StatCard label="Fechamentos no mês" value={fechamentosDoMes.length} icon={PackageCheck} gradient="emerald" />
        </div>
      </Card>

      {fechamentosDoMes.length === 0 ? (
        <Card>
          <EmptyState title="Sem fechamentos nessa competência" description="Escolha outro mês ou aguarde novos registros." />
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader title="Total por loja" subtitle="Soma do valor de envelope em fechamentos, no mês selecionado." />
            <SeriesBarChart data={porLoja} dataKey="total" xKey="loja" formatter={(v) => formatBRL(v)} />
          </Card>

          <Card>
            <CardHeader title="Evolução por dia" subtitle="Valor total de envelopes fechados por dia do mês." />
            <SeriesLineChart
              data={porDia}
              xKey="dia"
              lines={[{ dataKey: 'total', name: 'Valor em envelopes' }]}
              formatter={(v) => formatBRL(v)}
            />
          </Card>

          <Card>
            <CardHeader title="Resumo por loja" />
            <Table columns={['Loja', 'Total', 'Fechamentos']}>
              {porLoja.map((l) => (
                <Tr key={l.loja}>
                  <Td className="font-bold text-slate-800">{l.loja}</Td>
                  <Td>{formatBRL(l.total)}</Td>
                  <Td>{l.qtd}</Td>
                </Tr>
              ))}
            </Table>
          </Card>
        </>
      )}
    </div>
  );
}
