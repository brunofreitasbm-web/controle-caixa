import { useMemo, useState } from 'react';
import { RefreshCw, TrendingUp, TriangleAlert, Target, Users } from 'lucide-react';
import Card, { CardHeader } from '../../../components/ui/Card.jsx';
import Select from '../../../components/ui/Select.jsx';
import { Field } from '../../../components/ui/Input.jsx';
import Button from '../../../components/ui/Button.jsx';
import Badge from '../../../components/ui/Badge.jsx';
import EmptyState from '../../../components/ui/EmptyState.jsx';
import { LoadingBlock } from '../../../components/ui/Spinner.jsx';
import { formatPercent } from '../../../lib/format.js';
import { useColaboradores } from '../../../hooks/useConfiguracoes.js';
import { useIACoach, useIACoachRefresh } from '../../../hooks/useIA.js';
import FonteBadge from './FonteBadge.jsx';

const UNIDADES_FA = ['Grão Pará', 'ParqueShopping', 'Parque Circuito'];

function mesAtual() {
  return new Date().toISOString().slice(0, 7);
}

export default function CoachCard() {
  const colaboradoresQuery = useColaboradores();
  const colaboradorasFa = useMemo(
    () => (colaboradoresQuery.data || []).filter((c) => c.role === 'consultora_fa'),
    [colaboradoresQuery.data]
  );

  const [usuario, setUsuario] = useState('');
  const [unidade, setUnidade] = useState('');
  const [competencia, setCompetencia] = useState(mesAtual());

  const coachQuery = useIACoach({ usuario, unidade, competencia });
  const refresh = useIACoachRefresh();

  const metricas = coachQuery.data?.metricas;
  const coach = coachQuery.data?.coach;

  return (
    <Card className="animate-fade-in">
      <CardHeader title="Coach de conversão" subtitle="FaçaAmigos — desempenho individual por competência" />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <Field label="Colaboradora">
          <Select value={usuario} onChange={(e) => setUsuario(e.target.value)} disabled={colaboradoresQuery.isLoading}>
            <option value="">Selecione...</option>
            {colaboradorasFa.map((c) => (
              <option key={c.nome} value={c.nome}>
                {c.nome}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Unidade">
          <Select value={unidade} onChange={(e) => setUnidade(e.target.value)}>
            <option value="">Todas</option>
            {UNIDADES_FA.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Competência">
          <input
            type="month"
            value={competencia}
            onChange={(e) => setCompetencia(e.target.value)}
            className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-shadow"
          />
        </Field>
      </div>

      {!usuario ? (
        <EmptyState
          icon={Users}
          title="Escolha uma colaboradora"
          description="Selecione a colaboradora do FaçaAmigos para ver o coaching de conversão da competência."
        />
      ) : coachQuery.isLoading ? (
        <LoadingBlock label="Calculando conversão..." />
      ) : coachQuery.isError ? (
        <EmptyState
          icon={TriangleAlert}
          title="Não foi possível calcular agora"
          description={coachQuery.error?.message || 'Tente novamente em instantes.'}
          action={
            <Button variant="outline" size="sm" onClick={() => coachQuery.refetch()}>
              Tentar novamente
            </Button>
          }
        />
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              {metricas?.tierNome && (
                <Badge status="pago">{metricas.tierNome === 'diamante' ? 'Diamante' : 'Ouro'}</Badge>
              )}
              <span className="text-sm text-slate-500">
                Conversão: <strong className="text-slate-800">{formatPercent((metricas?.pctConversaoMensal || 0) * 100)}</strong>{' '}
                em {metricas?.diasLancados || 0} dia(s) lançados
              </span>
            </div>
            <div className="flex items-center gap-2">
              <FonteBadge fonte={coach?._fonte} />
              <Button
                variant="outline"
                size="sm"
                onClick={() => refresh.mutate({ usuario, unidade, competencia })}
                disabled={refresh.isPending}
              >
                <RefreshCw size={14} className={refresh.isPending ? 'animate-spin' : ''} />
                Gerar novamente
              </Button>
            </div>
          </div>

          <p className="text-sm text-slate-700">{coach?.resumo}</p>

          {coach?.destaque && (
            <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-3 text-sm text-emerald-800 flex gap-2">
              <TrendingUp size={16} className="shrink-0 mt-0.5" />
              <span>{coach.destaque}</span>
            </div>
          )}

          {coach?.atencao && (
            <div className="rounded-xl bg-amber-50 border border-amber-100 p-3 text-sm text-amber-800 flex gap-2">
              <TriangleAlert size={16} className="shrink-0 mt-0.5" />
              <span>{coach.atencao}</span>
            </div>
          )}

          {coach?.acoes?.length > 0 && (
            <div>
              <p className="text-xs font-bold uppercase text-slate-500 mb-1.5">Ações recomendadas</p>
              <ul className="space-y-1.5">
                {coach.acoes.map((a, i) => (
                  <li key={i} className="text-sm text-slate-700 flex gap-2">
                    <Target size={14} className="shrink-0 mt-1 text-blue-600" />
                    <span>{a}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {coach?.fechamento && <p className="text-sm text-slate-500 italic">{coach.fechamento}</p>}
        </div>
      )}
    </Card>
  );
}
