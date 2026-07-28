import { useMemo } from 'react';
import { AlertTriangle, Award, Target, TrendingUp } from 'lucide-react';
import Card, { CardHeader } from '../../../components/ui/Card.jsx';
import StatCard from '../../../components/ui/StatCard.jsx';
import EmptyState from '../../../components/ui/EmptyState.jsx';
import SeriesPieChart from '../../../components/charts/SeriesPieChart.jsx';
import DiscRadar from './DiscRadar.jsx';
import { DISC_COLORS, DISC_LABELS, DISC_PERFIL_POR_LETRA, calcularAptidaoVendas, obterPessoasFiltradas } from '../discProfiles.js';

export default function DashboardGerencialTab({ profiles, colaboradores, filterStore }) {
  const pessoas = useMemo(() => obterPessoasFiltradas(profiles, colaboradores, filterStore), [profiles, colaboradores, filterStore]);
  const total = pessoas.length;

  const medias = useMemo(() => {
    if (!total) return { d: 0, i: 0, s: 0, c: 0 };
    return {
      d: Math.round(pessoas.reduce((s, p) => s + p.d, 0) / total),
      i: Math.round(pessoas.reduce((s, p) => s + p.i, 0) / total),
      s: Math.round(pessoas.reduce((s, p) => s + p.s, 0) / total),
      c: Math.round(pessoas.reduce((s, p) => s + p.c, 0) / total),
    };
  }, [pessoas, total]);

  const distribuicao = useMemo(() => {
    const counts = { d: 0, i: 0, s: 0, c: 0 };
    pessoas.forEach((p) => {
      if (p.dominante) counts[p.dominante] += 1;
    });
    return Object.entries(counts)
      .filter(([, v]) => v > 0)
      .map(([letra, value]) => ({ name: DISC_PERFIL_POR_LETRA[letra], value, letra }));
  }, [pessoas]);

  const ranking = useMemo(
    () => pessoas.map((p) => ({ ...p, aptidao: calcularAptidaoVendas(p) })).sort((a, b) => b.aptidao.score - a.aptidao.score),
    [pessoas]
  );

  if (!total) {
    return (
      <Card>
        <EmptyState
          title="Nenhum colaborador com perfil DISC nesta seleção"
          description="Importe um laudo em PDF ou ajuste manualmente na aba 'Perfis & Upload' para começar a ver os insights aqui."
        />
      </Card>
    );
  }

  const letraMaisComum = Object.keys(medias).reduce((a, b) => (distribuicaoCount(distribuicao, b) > distribuicaoCount(distribuicao, a) ? b : a), 'd');
  const letraMenosComum = Object.keys(medias).reduce((a, b) => (medias[b] < medias[a] ? b : a), 'd');
  const mediaAptidao = Math.round(ranking.reduce((s, p) => s + p.aptidao.score, 0) / total);
  const topVendas = ranking[0];
  const precisaCoaching = ranking.filter((p) => p.aptidao.nivel === 'baixo');

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Dominância (média)" value={`${medias.d}%`} gradient="rose" icon={Target} />
        <StatCard label="Influência (média)" value={`${medias.i}%`} gradient="amber" icon={TrendingUp} />
        <StatCard label="Estabilidade (média)" value={`${medias.s}%`} gradient="emerald" icon={Award} />
        <StatCard label="Conformidade (média)" value={`${medias.c}%`} gradient="blue" icon={AlertTriangle} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader title="Perfil médio da equipe" subtitle={`${total} pessoa${total > 1 ? 's' : ''} nesta seleção`} />
          <DiscRadar d={medias.d} i={medias.i} s={medias.s} c={medias.c} />
        </Card>
        <Card>
          <CardHeader title="Distribuição de perfis predominantes" />
          {distribuicao.length ? (
            <SeriesPieChart data={distribuicao} />
          ) : (
            <EmptyState title="Sem perfis suficientes" />
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <div className="flex items-center gap-2 font-bold text-sm mb-2" style={{ color: DISC_COLORS[letraMaisComum] }}>
            <Target size={16} /> Diagnóstico de Composição
          </div>
          <p className="text-xs text-slate-500 leading-relaxed">
            O traço predominante da equipe é{' '}
            <strong style={{ color: DISC_COLORS[letraMaisComum] }}>
              {DISC_LABELS[letraMaisComum]} ({letraMaisComum.toUpperCase()})
            </strong>
            . A média geral é D {medias.d}% · I {medias.i}% · S {medias.s}% · C {medias.c}%.
          </p>
          <div className="mt-3 p-2.5 rounded-lg bg-emerald-50 border border-emerald-100 text-emerald-700 text-[11px]">
            Equipe com perfil predominante bem definido facilita treinamentos direcionados em vez de genéricos.
          </div>
        </Card>

        <Card>
          <div className="flex items-center gap-2 font-bold text-sm mb-2" style={{ color: DISC_COLORS[letraMenosComum] }}>
            <AlertTriangle size={16} /> Lacuna de Perfil
          </div>
          <p className="text-xs text-slate-500 leading-relaxed">
            Traço menos presente:{' '}
            <strong style={{ color: DISC_COLORS[letraMenosComum] }}>
              {DISC_LABELS[letraMenosComum]} ({letraMenosComum.toUpperCase()})
            </strong>{' '}
            — média de {Math.round(medias[letraMenosComum])}%.
          </p>
          <div className="mt-3 p-2.5 rounded-lg bg-amber-50 border border-amber-100 text-amber-700 text-[11px]">
            Priorize esse traço na próxima contratação, ou reforce com treinamento situacional quem já está na equipe.
          </div>
        </Card>

        <Card>
          <div className="flex items-center gap-2 font-bold text-sm mb-2 text-emerald-600">
            <TrendingUp size={16} /> Prontidão Comercial
          </div>
          <p className="text-xs text-slate-500 leading-relaxed">
            Aptidão comercial média: <strong>{mediaAptidao}%</strong>.{' '}
            {topVendas && (
              <>
                <strong style={{ color: DISC_COLORS[topVendas.dominante] || '#334155' }}>{topVendas.nome}</strong> lidera o
                ranking ({topVendas.aptidao.score}%).{' '}
              </>
            )}
            {precisaCoaching.length > 0 &&
              `${precisaCoaching.length} pessoa(s) com perfil mais voltado a suporte/backoffice do que abordagem comercial direta.`}
          </p>
          <div className="mt-3 p-2.5 rounded-lg bg-indigo-50 border border-indigo-100 text-indigo-700 text-[11px]">
            Fit ideal p/ próxima vaga de vendas: priorize candidatos com Influência alta e Dominância moderada.
          </div>
        </Card>
      </div>
    </div>
  );
}

function distribuicaoCount(distribuicao, letra) {
  return distribuicao.find((d) => d.letra === letra)?.value || 0;
}
