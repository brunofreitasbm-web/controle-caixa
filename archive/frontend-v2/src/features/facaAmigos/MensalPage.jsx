import { useMemo, useState } from 'react';
import { CalendarRange } from 'lucide-react';
import Card, { CardHeader } from '../../components/ui/Card.jsx';
import StatCard from '../../components/ui/StatCard.jsx';
import Input from '../../components/ui/Input.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import { LoadingBlock } from '../../components/ui/Spinner.jsx';
import SeriesBarChart from '../../components/charts/SeriesBarChart.jsx';
import SeriesLineChart from '../../components/charts/SeriesLineChart.jsx';
import { SERIES_COLORS } from '../../components/charts/palette.js';
import { formatBRL } from '../../lib/format.js';
import { useRegistrosFa } from '../../hooks/useFacaAmigos.js';
import { competenciaAtual, UNIDADES_FA } from './constants.js';

const GRADIENTE_UNIDADE = { 'Grão Pará': 'blue', ParqueShopping: 'emerald', 'Parque Circuito': 'amber' };

export default function MensalPage() {
  const [competencia, setCompetencia] = useState(competenciaAtual());
  const registrosQuery = useRegistrosFa();

  const fechamentosDoMes = useMemo(() => {
    return (registrosQuery.data || []).filter(
      (r) => r.tipoOperacao === 'Fechamento' && r.valorEnvelope != null && String(r.dataOperacao).startsWith(competencia)
    );
  }, [registrosQuery.data, competencia]);

  const totalPorUnidade = useMemo(() => {
    return UNIDADES_FA.map((u) => ({
      loja: u,
      total: fechamentosDoMes.filter((r) => r.loja === u).reduce((s, r) => s + (Number(r.valorEnvelope) || 0), 0),
    }));
  }, [fechamentosDoMes]);

  const totalGeral = totalPorUnidade.reduce((s, u) => s + u.total, 0);

  const serieDiaria = useMemo(() => {
    const diasNoMes = new Date(Number(competencia.slice(0, 4)), Number(competencia.slice(5, 7)), 0).getDate();
    const linhas = Array.from({ length: diasNoMes }, (_, i) => {
      const dia = String(i + 1).padStart(2, '0');
      const linha = { dia };
      UNIDADES_FA.forEach((u) => { linha[u] = 0; });
      return linha;
    });
    fechamentosDoMes.forEach((r) => {
      const dia = new Date(r.dataOperacao).getDate();
      if (linhas[dia - 1]) linhas[dia - 1][r.loja] = (linhas[dia - 1][r.loja] || 0) + (Number(r.valorEnvelope) || 0);
    });
    return linhas;
  }, [fechamentosDoMes, competencia]);

  const linhasChart = UNIDADES_FA.map((u, idx) => ({ dataKey: u, name: u, color: SERIES_COLORS[idx % SERIES_COLORS.length] }));

  if (registrosQuery.isLoading) {
    return <LoadingBlock label="Carregando dashboard mensal..." />;
  }

  return (
    <div className="animate-fade-in space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="rounded-full bg-emerald-100 text-emerald-600 p-2.5">
            <CalendarRange size={22} />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-800">Dashboard Mensal FaçaAmigos</h1>
            <p className="text-sm text-slate-500">Totais consolidados por unidade e por dia</p>
          </div>
        </div>
        <Input type="month" value={competencia} onChange={(e) => setCompetencia(e.target.value)} className="w-44" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total do mês" value={formatBRL(totalGeral)} gradient="rose" hint="envelopes fechados" />
        {totalPorUnidade.map((u) => (
          <StatCard key={u.loja} label={u.loja} value={formatBRL(u.total)} gradient={GRADIENTE_UNIDADE[u.loja] || 'blue'} hint="no mês" />
        ))}
      </div>

      {fechamentosDoMes.length === 0 ? (
        <Card>
          <EmptyState title="Sem envelopes neste mês" description="Nenhum fechamento registrado na competência selecionada." />
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader title="Comparativo entre lojas" subtitle="Total de envelopes fechados no mês" />
            <SeriesBarChart data={totalPorUnidade} dataKey="total" xKey="loja" formatter={(v) => formatBRL(v)} />
          </Card>

          <Card>
            <CardHeader title="Evolução diária por unidade" subtitle="Valor de envelope fechado por dia" />
            <SeriesLineChart data={serieDiaria} lines={linhasChart} xKey="dia" formatter={(v) => formatBRL(v)} />
          </Card>
        </>
      )}
    </div>
  );
}
