import { useState } from 'react';
import { Zap, TriangleAlert, TrendingUp } from 'lucide-react';
import Card, { CardHeader } from '../../../components/ui/Card.jsx';
import Select from '../../../components/ui/Select.jsx';
import Input, { Field } from '../../../components/ui/Input.jsx';
import Button from '../../../components/ui/Button.jsx';
import EmptyState from '../../../components/ui/EmptyState.jsx';
import { LoadingBlock } from '../../../components/ui/Spinner.jsx';
import { formatBRL, formatPercent } from '../../../lib/format.js';
import { useIACopiloto } from '../../../hooks/useIA.js';
import FonteBadge from './FonteBadge.jsx';

const LOJAS_CS = ['Marambaia', 'Icoaraci', 'Mário Covas'];

export default function CopilotoCard() {
  const [loja, setLoja] = useState('');
  const [horaSlot, setHoraSlot] = useState('');

  const copilotoQuery = useIACopiloto({ loja, horaSlot });
  const ritmo = copilotoQuery.data?.ritmo;

  return (
    <Card className="animate-fade-in">
      <CardHeader title="Copiloto Meta Hora a Hora" subtitle="Aviso do próximo intervalo, com o ritmo necessário para bater a meta" />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
        <Field label="Loja">
          <Select value={loja} onChange={(e) => setLoja(e.target.value)}>
            <option value="">Selecione...</option>
            {LOJAS_CS.map((op) => (
              <option key={op} value={op}>
                {op}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Horário do intervalo" hint="Formato HH:MM">
          <Input type="time" value={horaSlot} onChange={(e) => setHoraSlot(e.target.value)} />
        </Field>
      </div>

      {!loja || !horaSlot ? (
        <EmptyState
          icon={Zap}
          title="Escolha a loja e o horário"
          description="Selecione a loja e o intervalo para ver o aviso do ritmo necessário até o fechamento."
        />
      ) : copilotoQuery.isLoading ? (
        <LoadingBlock label="Apurando o ritmo do dia..." />
      ) : copilotoQuery.isError ? (
        <EmptyState
          icon={TriangleAlert}
          title="Não foi possível gerar o aviso agora"
          description={copilotoQuery.error?.message || 'Tente novamente em instantes.'}
          action={
            <Button variant="outline" size="sm" onClick={() => copilotoQuery.refetch()}>
              Tentar novamente
            </Button>
          }
        />
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <FonteBadge fonte={copilotoQuery.data?.fonte} />
          </div>

          <p className="text-sm text-slate-700">{copilotoQuery.data?.texto}</p>

          {ritmo?.temMeta && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="rounded-xl bg-slate-50 border border-slate-200 p-3">
                <p className="text-xs font-bold uppercase text-slate-500 mb-1">Vendido</p>
                <p className="text-sm font-bold text-slate-800">{formatBRL(ritmo.vendido)}</p>
              </div>
              <div className="rounded-xl bg-slate-50 border border-slate-200 p-3">
                <p className="text-xs font-bold uppercase text-slate-500 mb-1">Meta do dia</p>
                <p className="text-sm font-bold text-slate-800">
                  {formatBRL(ritmo.meta)}
                  {ritmo.atingimento !== null && (
                    <span className="text-xs font-medium text-slate-500 ml-1">({formatPercent(ritmo.atingimento * 100)})</span>
                  )}
                </p>
              </div>
              <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-3">
                <p className="text-xs font-bold uppercase text-emerald-700 mb-1 flex items-center gap-1">
                  <TrendingUp size={12} /> Ritmo necessário
                </p>
                <p className="text-sm font-bold text-emerald-800">{formatBRL(ritmo.ritmoNecessario)}/h</p>
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
