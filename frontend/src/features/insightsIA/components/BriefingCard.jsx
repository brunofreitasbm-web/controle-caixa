import { useState } from 'react';
import { Loader2, RefreshCw, TriangleAlert, ListChecks, CircleAlert } from 'lucide-react';
import Card from '../../../components/ui/Card.jsx';
import Button from '../../../components/ui/Button.jsx';
import { formatBRL, formatPercent } from '../../../lib/format.js';
import { useIABriefing, useIABriefingRefresh } from '../../../hooks/useIA.js';
import FonteBadge from './FonteBadge.jsx';

function formatDiaBR(iso) {
  if (!iso) return '';
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' });
}

export default function BriefingCard() {
  const [data, setData] = useState('');
  const briefingQuery = useIABriefing({ data });
  const refresh = useIABriefingRefresh();

  const dados = briefingQuery.data?.dados;
  const briefing = briefingQuery.data?.briefing;

  return (
    <Card gradient="blue" className="animate-fade-in">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-white/70">Briefing diário do gestor</p>
          <h2 className="text-xl font-bold mt-1">
            {dados?.ontem ? `Resumo de ${formatDiaBR(dados.ontem)}` : 'Resumo do dia anterior'}
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={data}
            onChange={(e) => setData(e.target.value)}
            className="rounded-xl border border-white/30 bg-white/10 px-3 py-2 text-sm text-white placeholder:text-white/60 focus:outline-none focus:ring-2 focus:ring-white/50 [color-scheme:dark]"
            title="Data de referência (opcional, padrão hoje)"
          />
          <Button
            size="sm"
            className="!bg-white/15 hover:!bg-white/25 !text-white !shadow-none"
            onClick={() => refresh.mutate(data)}
            disabled={refresh.isPending}
          >
            <RefreshCw size={14} className={refresh.isPending ? 'animate-spin' : ''} />
            Gerar novamente
          </Button>
        </div>
      </div>

      {briefingQuery.isLoading ? (
        <div className="flex items-center gap-3 py-8 text-white/85">
          <Loader2 size={22} className="animate-spin" />
          <span className="text-sm">Apurando o dia anterior...</span>
        </div>
      ) : briefingQuery.isError ? (
        <div className="flex items-start gap-3 py-6 text-white/90">
          <TriangleAlert size={22} className="shrink-0 mt-0.5" />
          <div>
            <p className="font-bold">Não foi possível apurar o briefing agora.</p>
            <p className="text-sm text-white/70 mt-1">{briefingQuery.error?.message || 'Tente novamente em instantes.'}</p>
            <Button
              size="sm"
              className="!bg-white/15 hover:!bg-white/25 !text-white !shadow-none mt-3"
              onClick={() => briefingQuery.refetch()}
            >
              Tentar novamente
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            <FonteBadge fonte={briefing?._fonte} className="!bg-white/20 !text-white" />
          </div>

          <p className="text-lg font-bold leading-snug">{briefing?.manchete}</p>
          <p className="text-sm text-white/90">{briefing?.vendas}</p>

          {dados && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-xl bg-white/10 p-3">
                <p className="text-[11px] uppercase text-white/70 font-bold">Faturado</p>
                <p className="text-base font-bold mt-0.5">{formatBRL(dados.totalFaturado)}</p>
              </div>
              <div className="rounded-xl bg-white/10 p-3">
                <p className="text-[11px] uppercase text-white/70 font-bold">Meta do dia</p>
                <p className="text-base font-bold mt-0.5">
                  {dados.totalMeta > 0 ? formatBRL(dados.totalMeta) : '—'}
                  {dados.atingimentoGeral !== null && dados.atingimentoGeral !== undefined && (
                    <span className="text-xs font-medium text-white/70 ml-1">
                      ({formatPercent(dados.atingimentoGeral * 100)})
                    </span>
                  )}
                </p>
              </div>
              <div className="rounded-xl bg-white/10 p-3">
                <p className="text-[11px] uppercase text-white/70 font-bold">Boletos vencidos</p>
                <p className="text-base font-bold mt-0.5">{formatBRL(dados.valorBoletosVencidos)}</p>
              </div>
              <div className="rounded-xl bg-white/10 p-3">
                <p className="text-[11px] uppercase text-white/70 font-bold">Envelopes pendentes</p>
                <p className="text-base font-bold mt-0.5">{dados.envelopesPendentes?.length || 0}</p>
              </div>
            </div>
          )}

          {briefing?.alertas?.length > 0 && (
            <div>
              <p className="text-xs font-bold uppercase text-white/70 mb-1.5 flex items-center gap-1.5">
                <CircleAlert size={14} /> Alertas
              </p>
              <ul className="space-y-1">
                {briefing.alertas.map((a, i) => (
                  <li key={i} className="text-sm text-white/90">
                    • {a}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {briefing?.prioridades?.length > 0 && (
            <div>
              <p className="text-xs font-bold uppercase text-white/70 mb-1.5 flex items-center gap-1.5">
                <ListChecks size={14} /> Prioridades de hoje
              </p>
              <ol className="space-y-1 list-decimal list-inside">
                {briefing.prioridades.map((p, i) => (
                  <li key={i} className="text-sm text-white/90">
                    {p}
                  </li>
                ))}
              </ol>
            </div>
          )}

          {briefing?.fechamento && <p className="text-sm text-white/75 italic border-t border-white/15 pt-3">{briefing.fechamento}</p>}
        </div>
      )}
    </Card>
  );
}
