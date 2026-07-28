import { useMemo, useState } from 'react';
import { Cell, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from 'recharts';
import { Trophy } from 'lucide-react';
import Card, { CardHeader } from '../../../components/ui/Card.jsx';
import EmptyState from '../../../components/ui/EmptyState.jsx';
import Modal from '../../../components/ui/Modal.jsx';
import Badge from '../../../components/ui/Badge.jsx';
import DiscRadar from './DiscRadar.jsx';
import { DISC_COLORS, calcularAptidaoVendas, obterPessoasFiltradas } from '../discProfiles.js';

const NIVEL_COR = { alto: 'bg-emerald-500', moderado: 'bg-amber-500', baixo: 'bg-slate-400' };

// Mapa de Talentos: cada pessoa plotada por ritmo (Y: rápido/assertivo D+I no
// topo × cauteloso/reflexivo S+C embaixo) e foco (X: tarefa D+C à esquerda ×
// pessoas I+S à direita) — os 4 quadrantes resultam nas 4 letras do DISC.
// Mesma lógica do mapa de talentos do app antigo, portada para um
// ScatterChart do recharts.
function montarPontosTalento(pessoas) {
  return pessoas.map((p) => ({
    nome: p.nome,
    x: p.i + p.s - (p.d + p.c),
    y: p.d + p.i - (p.s + p.c),
    dominante: p.dominante,
    ...p,
  }));
}

export default function FormacaoEquipeTab({ profiles, colaboradores, filterStore }) {
  const [selecionado, setSelecionado] = useState(null);
  const pessoas = useMemo(() => obterPessoasFiltradas(profiles, colaboradores, filterStore), [profiles, colaboradores, filterStore]);
  const pontos = useMemo(() => montarPontosTalento(pessoas), [pessoas]);
  const ranking = useMemo(
    () => pessoas.map((p) => ({ ...p, aptidao: calcularAptidaoVendas(p) })).sort((a, b) => b.aptidao.score - a.aptidao.score),
    [pessoas]
  );

  if (!pessoas.length) {
    return (
      <Card>
        <EmptyState title="Nenhum colaborador com perfil DISC nesta seleção" description="Cadastre perfis na aba 'Perfis & Upload' para montar o mapa de talentos." />
      </Card>
    );
  }

  const perfilSelecionado = selecionado ? pessoas.find((p) => p.nome === selecionado) : null;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="Mapa de Talentos"
          subtitle="Foco em tarefa × pessoas (eixo X) e ritmo cauteloso × assertivo (eixo Y). Clique num ponto para ver o perfil."
        />
        <ResponsiveContainer width="100%" height={340}>
          <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 0 }}>
            <XAxis type="number" dataKey="x" domain={[-200, 200]} tick={false} axisLine={{ stroke: '#e2e8f0' }} label={{ value: 'Tarefa ← → Pessoas', position: 'insideBottom', offset: -5, fontSize: 11, fill: '#94a3b8' }} />
            <YAxis type="number" dataKey="y" domain={[-200, 200]} tick={false} axisLine={{ stroke: '#e2e8f0' }} label={{ value: 'Reflexivo ↑ Assertivo', angle: -90, position: 'insideLeft', fontSize: 11, fill: '#94a3b8' }} />
            <ZAxis range={[120, 120]} />
            <Tooltip
              cursor={{ strokeDasharray: '3 3' }}
              contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }}
              formatter={(_v, _n, item) => [`D${item.payload.d} I${item.payload.i} S${item.payload.s} C${item.payload.c}`, item.payload.nome]}
            />
            <Scatter
              data={pontos}
              onClick={(pt) => setSelecionado(pt.nome)}
              cursor="pointer"
            >
              {pontos.map((p) => (
                <Cell key={p.nome} fill={DISC_COLORS[p.dominante] || '#94a3b8'} />
              ))}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </Card>

      <Card>
        <CardHeader title="Ranking de Aptidão Comercial" subtitle="Heurística DISC (peso maior para Influência e Dominância) — não substitui avaliação real de desempenho." />
        <div className="space-y-2">
          {ranking.map((p, idx) => (
            <button
              type="button"
              key={p.nome}
              onClick={() => setSelecionado(p.nome)}
              className="w-full flex items-center gap-3 p-2.5 rounded-xl bg-slate-50 hover:bg-slate-100 transition-colors text-left"
            >
              <span className="w-6 text-center text-xs font-bold text-slate-400">{idx + 1}º</span>
              <span
                className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                style={{ backgroundColor: DISC_COLORS[p.dominante] || '#94a3b8' }}
              >
                {(p.dominante || '?').toUpperCase()}
              </span>
              <span className="flex-1 min-w-0 text-sm font-bold text-slate-700 truncate">{p.nome}</span>
              <div className="flex-1 hidden sm:block">
                <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                  <div className={`h-full rounded-full ${NIVEL_COR[p.aptidao.nivel]}`} style={{ width: `${p.aptidao.score}%` }} />
                </div>
              </div>
              <Badge status={p.aptidao.nivel === 'alto' ? 'pago' : p.aptidao.nivel === 'moderado' ? 'atencao' : 'neutro'}>
                {p.aptidao.score}%
              </Badge>
            </button>
          ))}
        </div>
        {ranking[0] && (
          <div className="mt-4 p-3 rounded-xl bg-indigo-50 border border-indigo-100 text-indigo-700 text-xs flex items-center gap-2">
            <Trophy size={16} />
            <span>
              <strong>{ranking[0].nome}</strong> lidera o ranking de aptidão comercial — boa referência de mentoria para venda de
              adicionais.
            </span>
          </div>
        )}
      </Card>

      <Modal open={!!selecionado} onClose={() => setSelecionado(null)} title={selecionado || ''} size="sm">
        {perfilSelecionado && (
          <div className="space-y-4">
            <DiscRadar d={perfilSelecionado.d} i={perfilSelecionado.i} s={perfilSelecionado.s} c={perfilSelecionado.c} height={220} />
            <div className="rounded-xl bg-slate-50 p-3 flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500">Aptidão Comercial</span>
              <Badge status="info">
                {calcularAptidaoVendas(perfilSelecionado).label} · {calcularAptidaoVendas(perfilSelecionado).score}%
              </Badge>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
