import { useState } from 'react';
import { RefreshCw, CalendarClock, TriangleAlert, ArrowRightLeft } from 'lucide-react';
import Card, { CardHeader } from '../../../components/ui/Card.jsx';
import Select from '../../../components/ui/Select.jsx';
import Input, { Field } from '../../../components/ui/Input.jsx';
import Button from '../../../components/ui/Button.jsx';
import EmptyState from '../../../components/ui/EmptyState.jsx';
import { LoadingBlock } from '../../../components/ui/Spinner.jsx';
import { useIAEscala, useIAEscalaRefresh } from '../../../hooks/useIA.js';
import FonteBadge from './FonteBadge.jsx';

// As 6 operações que têm horário/venda por hora cadastrados (Cacau Show +
// FaçaAmigos) — mesmo conjunto de config/notifications.js#OPERACOES_CONFIG_META.
const OPERACOES = ['Marambaia', 'Icoaraci', 'Mário Covas', 'Grão Pará', 'ParqueShopping', 'Parque Circuito'];

export default function EscalaCard() {
  const [loja, setLoja] = useState('');
  const [data, setData] = useState('');
  const [janela, setJanela] = useState(60);

  const escalaQuery = useIAEscala({ loja, data, janela });
  const refresh = useIAEscalaRefresh();

  const escala = escalaQuery.data?.escala;
  const analise = escalaQuery.data?.analise;
  const semLastro = escala?._fonte === 'dados-insuficientes';

  return (
    <Card className="animate-fade-in">
      <CardHeader title="Escala inteligente" subtitle="Demanda por hora x cobertura de ponto, por operação" />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <Field label="Operação">
          <Select value={loja} onChange={(e) => setLoja(e.target.value)}>
            <option value="">Selecione...</option>
            {OPERACOES.map((op) => (
              <option key={op} value={op}>
                {op}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Data de referência" hint="Opcional — padrão hoje">
          <Input type="date" value={data} onChange={(e) => setData(e.target.value)} />
        </Field>
        <Field label="Janela (dias)" hint="Entre 7 e 365">
          <Input
            type="number"
            min={7}
            max={365}
            value={janela}
            onChange={(e) => setJanela(e.target.value)}
          />
        </Field>
      </div>

      {!loja ? (
        <EmptyState
          icon={CalendarClock}
          title="Escolha uma operação"
          description="Selecione a loja para cruzar a demanda por hora com a presença registrada no ponto."
        />
      ) : escalaQuery.isLoading ? (
        <LoadingBlock label="Analisando histórico..." />
      ) : escalaQuery.isError ? (
        <EmptyState
          icon={TriangleAlert}
          title="Não foi possível analisar agora"
          description={escalaQuery.error?.message || 'Tente novamente em instantes.'}
          action={
            <Button variant="outline" size="sm" onClick={() => escalaQuery.refetch()}>
              Tentar novamente
            </Button>
          }
        />
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm text-slate-500">
              {analise?.diasComDados || 0} dia(s) de histórico analisados
              {analise?.pontoDisponivel === false && ' — sem marcações de ponto no período'}
            </span>
            <div className="flex items-center gap-2">
              <FonteBadge fonte={escala?._fonte} />
              {!semLastro && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => refresh.mutate({ loja, data, janela })}
                  disabled={refresh.isPending}
                >
                  <RefreshCw size={14} className={refresh.isPending ? 'animate-spin' : ''} />
                  Gerar novamente
                </Button>
              )}
            </div>
          </div>

          <p className="text-sm text-slate-700">{escala?.resumo}</p>

          {!semLastro && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-3">
                <p className="text-xs font-bold uppercase text-emerald-700 mb-1">Picos</p>
                <p className="text-sm text-emerald-800">{escala?.picos}</p>
              </div>
              <div className="rounded-xl bg-slate-50 border border-slate-200 p-3">
                <p className="text-xs font-bold uppercase text-slate-500 mb-1">Horários ociosos</p>
                <p className="text-sm text-slate-700">{escala?.ociosos}</p>
              </div>
            </div>
          )}

          {escala?.recomendacoes?.length > 0 && (
            <div>
              <p className="text-xs font-bold uppercase text-slate-500 mb-1.5">Recomendações</p>
              <ul className="space-y-1.5">
                {escala.recomendacoes.map((r, i) => (
                  <li key={i} className="text-sm text-slate-700 flex gap-2">
                    <ArrowRightLeft size={14} className="shrink-0 mt-1 text-blue-600" />
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {escala?.ressalvas && <p className="text-xs text-slate-500 italic">{escala.ressalvas}</p>}
        </div>
      )}
    </Card>
  );
}
