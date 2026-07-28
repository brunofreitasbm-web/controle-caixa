import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Flame, Target, TrendingUp } from 'lucide-react';
import Card, { CardHeader } from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Select from '../../components/ui/Select.jsx';
import Input, { Field } from '../../components/ui/Input.jsx';
import Table, { Td, Tr } from '../../components/ui/Table.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import StatCard from '../../components/ui/StatCard.jsx';
import { LoadingBlock } from '../../components/ui/Spinner.jsx';
import SeriesBarChart from '../../components/charts/SeriesBarChart.jsx';
import { formatBRL } from '../../lib/format.js';
import { getCurrentUser, isLiderOperacao, isOwner } from '../../lib/auth.js';
import { useConfigGeral, parseConfigOperacoes, OPERACOES_CACAU_SHOW } from '../../hooks/usePonto.js';
import {
  useConfirmarCheckIn,
  useDefinirMetaDoDia,
  useLancarVendaHoraria,
  useMetaDoDia,
  useVendasHoje,
  useVendasHorarias,
} from '../../hooks/useVendas.js';

const JANELA_ABERTURA_ANTES_MIN = 5;
const JANELA_FECHAMENTO_DEPOIS_MIN = 20;
const PARETO_CORTE_TEMPO = 0.8;
const PARETO_CORTE_VENDA = 0.2;
const METAS_VALIDAS = ['diaria', 'manual'];

function dataHojeStr() {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const obj = {};
  partes.forEach((p) => {
    obj[p.type] = p.value;
  });
  return `${obj.year}-${obj.month}-${obj.day}`;
}

function agoraMinutosBrasil() {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date());
  const obj = {};
  partes.forEach((p) => {
    obj[p.type] = p.value;
  });
  return parseInt(obj.hour, 10) * 60 + parseInt(obj.minute, 10);
}

function minutosDoDiaPorHora(horaStr) {
  const [h, m] = (horaStr || '09:00').split(':').map(Number);
  return h * 60 + (m || 0);
}

function horaStrPorMinutos(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function nomeDiaSemana(dataStr) {
  const d = new Date(`${dataStr}T12:00:00`);
  const nome = d.toLocaleDateString('pt-BR', { weekday: 'long' });
  return nome.charAt(0).toUpperCase() + nome.slice(1);
}

// Algoritmo de Desagregação Ponderada de Metas (Curva de Pareto + Sazonalidade
// Semanal) — mesma regra do app antigo: os últimos 20% do período de
// funcionamento respondem por 80% da venda do dia.
function obterPesoHoraMeta(slotMin, aberturaMin, fechamentoMin, diaSemana) {
  const duracaoTotal = fechamentoMin - aberturaMin;
  const posicao = duracaoTotal > 0 ? Math.min(1, Math.max(0, (slotMin - aberturaMin) / duracaoTotal)) : 0;
  const pesoBase = posicao < PARETO_CORTE_TEMPO ? PARETO_CORTE_VENDA / PARETO_CORTE_TEMPO : (1 - PARETO_CORTE_VENDA) / (1 - PARETO_CORTE_TEMPO);
  const diasPico = ['Sexta-feira', 'Sábado', 'Domingo'];
  const fatorSazonalidade = diasPico.includes(diaSemana) ? 1.6 : 1.0;
  return pesoBase * fatorSazonalidade;
}

function calcularMetaProporcionalSlot(slotMin, meta, checkpoints, aberturaMin, fechamentoMin, diaSemana) {
  if (meta <= 0 || checkpoints.length === 0) return 0;
  const pesos = checkpoints.map((s) => obterPesoHoraMeta(s, aberturaMin, fechamentoMin, diaSemana));
  const somaPesos = pesos.reduce((a, b) => a + b, 0);
  if (somaPesos <= 0) return meta / checkpoints.length;
  const pesoSlot = obterPesoHoraMeta(slotMin, aberturaMin, fechamentoMin, diaSemana);
  return (pesoSlot / somaPesos) * meta;
}

export default function MetaHoraHoraPage() {
  const user = getCurrentUser();
  const podeDefinirMeta = isOwner(user) || isLiderOperacao(user);
  const hoje = dataHojeStr();

  const [operacao, setOperacao] = useState(OPERACOES_CACAU_SHOW[0]);
  const [metaManualInput, setMetaManualInput] = useState('');
  const [horaLancamento, setHoraLancamento] = useState('');
  const [valorLancamento, setValorLancamento] = useState('');

  const configQuery = useConfigGeral();
  const metaQuery = useMetaDoDia(operacao, hoje);
  const vendasQuery = useVendasHoje(operacao, hoje);
  const vendasHorariasQuery = useVendasHorarias(operacao, hoje);
  const definirMetaMutation = useDefinirMetaDoDia();
  const confirmarMutation = useConfirmarCheckIn();
  const lancarHorariaMutation = useLancarVendaHoraria();

  const { horarios } = parseConfigOperacoes(configQuery.data || {});
  const cfgOperacao = horarios[operacao] || { abertura: '09:00', fechamento: '22:00' };
  const aberturaMin = minutosDoDiaPorHora(cfgOperacao.abertura);
  const fechamentoMin = minutosDoDiaPorHora(cfgOperacao.fechamento);

  const checkpoints = useMemo(() => {
    const lista = [];
    for (let slot = aberturaMin + 60; slot <= fechamentoMin; slot += 60) lista.push(slot);
    return lista;
  }, [aberturaMin, fechamentoMin]);

  const metaHoje = metaQuery.data?.meta;
  const metaValida = metaHoje && METAS_VALIDAS.includes(metaHoje.origem);
  const metaDiaria = metaValida ? metaHoje.valor || 0 : 0;
  const diaSemanaHoje = nomeDiaSemana(hoje);

  const vendas = vendasQuery.data?.vendas || [];
  const vendasPorSlot = useMemo(() => {
    const map = {};
    vendas.forEach((v) => {
      map[v.horaSlot] = v;
    });
    return map;
  }, [vendas]);
  const vendasOrdenadas = useMemo(
    () => [...vendas].sort((a, b) => minutosDoDiaPorHora(a.horaSlot) - minutosDoDiaPorHora(b.horaSlot)),
    [vendas]
  );
  const totalHoje = vendasOrdenadas.length > 0 ? vendasOrdenadas.at(-1).valor || 0 : 0;
  const agoraMin = agoraMinutosBrasil();

  const metaAcumuladaPorSlot = useMemo(() => {
    const mapa = {};
    let acumulado = 0;
    checkpoints.forEach((slotMin) => {
      acumulado += calcularMetaProporcionalSlot(slotMin, metaDiaria, checkpoints, aberturaMin, fechamentoMin, diaSemanaHoje);
      mapa[slotMin] = acumulado;
    });
    return mapa;
  }, [checkpoints, metaDiaria, aberturaMin, fechamentoMin, diaSemanaHoje]);

  const esperadoAteAgora = useMemo(() => {
    let esperado = 0;
    checkpoints.forEach((slotMin) => {
      const metaSlot = calcularMetaProporcionalSlot(slotMin, metaDiaria, checkpoints, aberturaMin, fechamentoMin, diaSemanaHoje);
      if (agoraMin >= slotMin) esperado += metaSlot;
      else if (agoraMin > slotMin - 60) esperado += metaSlot * ((agoraMin - (slotMin - 60)) / 60);
    });
    return esperado;
  }, [checkpoints, metaDiaria, aberturaMin, fechamentoMin, diaSemanaHoje, agoraMin]);

  const pct = metaDiaria > 0 ? Math.min(100, (totalHoje / metaDiaria) * 100) : 0;
  const noRitmo = totalHoje >= esperadoAteAgora;

  const streak = useMemo(() => {
    const encerrados = checkpoints.filter((slot) => agoraMin >= slot);
    let count = 0;
    for (let i = encerrados.length - 1; i >= 0; i -= 1) {
      const slotMin = encerrados[i];
      const venda = vendasPorSlot[horaStrPorMinutos(slotMin)];
      if (venda && venda.valor >= metaAcumuladaPorSlot[slotMin]) count += 1;
      else break;
    }
    return count;
  }, [checkpoints, agoraMin, vendasPorSlot, metaAcumuladaPorSlot]);

  async function confirmarIntervalo(slotStr, valorInput) {
    const valor = parseFloat(valorInput);
    if (Number.isNaN(valor) || valor < 0) {
      toast.error('Informe um valor válido de venda acumulada.');
      return;
    }
    try {
      await confirmarMutation.mutateAsync({ operacao, usuario: user.nome, data: hoje, horaSlot: slotStr, valor });
      toast.success(`Intervalo ${slotStr} confirmado!`);
    } catch (err) {
      toast.error(err.message || 'Falha ao confirmar intervalo.');
    }
  }

  async function salvarMetaManual() {
    const valor = parseFloat(metaManualInput);
    if (Number.isNaN(valor) || valor <= 0) {
      toast.error('Informe um valor de meta válido.');
      return;
    }
    try {
      await definirMetaMutation.mutateAsync({ loja: operacao, data: hoje, valor });
      toast.success('Meta de hoje definida!');
      setMetaManualInput('');
    } catch (err) {
      toast.error(err.message || 'Erro ao salvar a meta.');
    }
  }

  async function lancarVendaHoraria(e) {
    e.preventDefault();
    const valor = parseFloat(valorLancamento);
    if (!horaLancamento || Number.isNaN(valor) || valor < 0) {
      toast.error('Informe a hora e um valor válido.');
      return;
    }
    try {
      await lancarHorariaMutation.mutateAsync({ loja: operacao, data: hoje, hora: horaLancamento, vendaAcumulada: valor, registradoPor: user.nome });
      toast.success('Venda horária lançada!');
      setHoraLancamento('');
      setValorLancamento('');
    } catch (err) {
      toast.error(err.message || 'Erro ao lançar venda horária.');
    }
  }

  const chartData = vendasOrdenadas.map((v) => ({ horaSlot: v.horaSlot, valor: v.valor || 0 }));
  const vendasHorarias = (vendasHorariasQuery.data || []).slice().sort((a, b) => (a.hora || '').localeCompare(b.hora || ''));

  return (
    <div className="animate-fade-in space-y-4">
      <Card>
        <CardHeader
          title="Meta Hora a Hora"
          subtitle="Checkpoints de venda acumulada ao longo do dia."
          action={
            <Select value={operacao} onChange={(e) => setOperacao(e.target.value)} className="w-52">
              {OPERACOES_CACAU_SHOW.map((op) => (
                <option key={op} value={op}>
                  {op}
                </option>
              ))}
            </Select>
          }
        />

        {metaQuery.isLoading ? (
          <LoadingBlock label="Carregando meta do dia..." />
        ) : !metaValida ? (
          <EmptyState
            icon={Target}
            title="Nenhuma meta definida para hoje"
            description={
              podeDefinirMeta
                ? 'Digite a meta do dia abaixo para liberar os checkpoints.'
                : 'Aguarde o Líder de Operações ou Owner definir a meta de hoje.'
            }
            action={
              podeDefinirMeta && (
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    placeholder="Meta do dia (R$)"
                    value={metaManualInput}
                    onChange={(e) => setMetaManualInput(e.target.value)}
                    className="w-40"
                  />
                  <Button onClick={salvarMetaManual} disabled={definirMetaMutation.isPending}>
                    Definir meta
                  </Button>
                </div>
              )
            }
          />
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
              <StatCard label="Realizado hoje" value={formatBRL(totalHoje)} hint={`Meta: ${formatBRL(metaDiaria)}`} gradient={noRitmo ? 'emerald' : 'amber'} icon={TrendingUp} />
              <StatCard label="Esperado até agora" value={formatBRL(esperadoAteAgora)} gradient="blue" icon={Target} />
              <StatCard
                label="Progresso do dia"
                value={`${pct.toFixed(0)}%`}
                hint={streak >= 2 ? `${streak} intervalos seguidos na meta` : undefined}
                gradient="rose"
                icon={Flame}
              />
            </div>

            <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden mb-2">
              <div
                className={`h-full rounded-full transition-all duration-500 ${noRitmo ? 'bg-emerald-500' : 'bg-amber-500'}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className={`text-xs font-bold mb-6 ${noRitmo ? 'text-emerald-600' : 'text-amber-600'}`}>
              {totalHoje >= metaDiaria ? '🎉 Meta do dia batida!' : noRitmo ? '💪 No ritmo certo!' : '⏰ Um pouco atrás do esperado.'}
            </p>

            {podeDefinirMeta && (
              <div className="mb-6 flex items-center gap-2">
                <Input
                  type="number"
                  placeholder="Corrigir meta de hoje (R$)"
                  value={metaManualInput}
                  onChange={(e) => setMetaManualInput(e.target.value)}
                  className="w-52"
                />
                <Button variant="outline" onClick={salvarMetaManual} disabled={definirMetaMutation.isPending}>
                  Atualizar meta
                </Button>
              </div>
            )}

            <Table columns={['Intervalo', 'Meta acumulada', 'Status', 'Confirmar venda acumulada']}>
              {checkpoints.map((slotMin) => {
                const slotStr = horaStrPorMinutos(slotMin);
                const venda = vendasPorSlot[slotStr];
                const dentroDaJanela = agoraMin >= slotMin - JANELA_ABERTURA_ANTES_MIN && agoraMin <= slotMin + JANELA_FECHAMENTO_DEPOIS_MIN;
                return (
                  <CheckpointRow
                    key={slotMin}
                    slotStr={slotStr}
                    metaAcumulada={metaAcumuladaPorSlot[slotMin]}
                    venda={venda}
                    bloqueado={agoraMin < slotMin - JANELA_ABERTURA_ANTES_MIN}
                    aberto={dentroDaJanela}
                    onConfirmar={(valor) => confirmarIntervalo(slotStr, valor)}
                    confirmando={confirmarMutation.isPending}
                  />
                );
              })}
            </Table>

            {chartData.length > 0 && (
              <div className="mt-6">
                <h4 className="text-sm font-bold text-slate-700 mb-2">Progresso do dia (venda acumulada confirmada)</h4>
                <SeriesBarChart data={chartData} dataKey="valor" xKey="horaSlot" formatter={(v) => formatBRL(v)} />
              </div>
            )}
          </>
        )}
      </Card>

      <Card>
        <CardHeader title="Lançamento por hora" subtitle="Registro paralelo de venda acumulada por hora, para acompanhamento gerencial." />
        <form onSubmit={lancarVendaHoraria} className="flex flex-wrap items-end gap-3 mb-4">
          <Field label="Hora">
            <Input type="time" value={horaLancamento} onChange={(e) => setHoraLancamento(e.target.value)} className="w-32" required />
          </Field>
          <Field label="Venda acumulada (R$)">
            <Input type="number" step="0.01" value={valorLancamento} onChange={(e) => setValorLancamento(e.target.value)} className="w-40" required />
          </Field>
          <Button type="submit" disabled={lancarHorariaMutation.isPending}>
            {lancarHorariaMutation.isPending ? 'Salvando...' : 'Lançar'}
          </Button>
        </form>

        {vendasHorariasQuery.isLoading ? (
          <LoadingBlock label="Carregando lançamentos..." />
        ) : vendasHorarias.length === 0 ? (
          <EmptyState title="Nenhum lançamento por hora hoje" />
        ) : (
          <Table columns={['Hora', 'Venda acumulada', 'Registrado por']}>
            {vendasHorarias.map((v) => (
              <Tr key={v.id || `${v.hora}-${v.registradoPor}`}>
                <Td>{v.hora}</Td>
                <Td>{formatBRL(v.vendaAcumulada)}</Td>
                <Td>{v.registradoPor || '—'}</Td>
              </Tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}

function CheckpointRow({ slotStr, metaAcumulada, venda, bloqueado, aberto, onConfirmar, confirmando }) {
  const [valor, setValor] = useState('');

  return (
    <Tr>
      <Td className="font-bold text-slate-800">{slotStr}</Td>
      <Td>{formatBRL(metaAcumulada)}</Td>
      <Td>
        {venda ? (
          <Badge status="pago">Total do dia: {formatBRL(venda.valor)}</Badge>
        ) : bloqueado ? (
          <Badge status="neutro">Aguardando o horário</Badge>
        ) : aberto ? (
          <Badge status="pendente">Aberto</Badge>
        ) : (
          <Badge status="urgente">Intervalo perdido</Badge>
        )}
      </Td>
      <Td>
        {venda ? (
          '—'
        ) : aberto ? (
          <div className="flex items-center gap-2">
            <Input
              type="number"
              step="0.01"
              placeholder="Total do dia (R$)"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              className="w-36"
            />
            <Button size="sm" onClick={() => onConfirmar(valor)} disabled={confirmando}>
              Confirmar
            </Button>
          </div>
        ) : (
          '—'
        )}
      </Td>
    </Tr>
  );
}
