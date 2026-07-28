import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import Card, { CardHeader } from '../../../components/ui/Card.jsx';
import Button from '../../../components/ui/Button.jsx';
import Input, { Field } from '../../../components/ui/Input.jsx';
import { LoadingBlock } from '../../../components/ui/Spinner.jsx';
import { useRegraBonificacao, useSalvarRegrasBonificacao } from '../../../hooks/useFaBonificacao.js';

const DIAS = ['Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado', 'Domingo'];
const DIAS_LABEL = { 'Segunda-feira': 'Segunda', 'Terça-feira': 'Terça', 'Quarta-feira': 'Quarta', 'Quinta-feira': 'Quinta', 'Sexta-feira': 'Sexta', 'Sábado': 'Sábado', 'Domingo': 'Domingo' };

export default function RegrasConversaoForm({ competencia }) {
  const regraQuery = useRegraBonificacao(competencia);
  const salvarMutation = useSalvarRegrasBonificacao();

  const [form, setForm] = useState({
    ouroPercent: '50', ouroValor: '100', diamantePercent: '60', diamanteValor: '150',
    pixMinVendas2h: '5', pixValor: '20', pixDiasSemana: ['Sexta-feira', 'Sábado', 'Domingo'],
  });

  useEffect(() => {
    const regra = regraQuery.data?.regra;
    if (!regra) return;
    setForm({
      ouroPercent: String((Number(regra.ouroPercentMin) || 0) * 100),
      ouroValor: String(regra.ouroValor ?? 0),
      diamantePercent: String((Number(regra.diamantePercentMin) || 0) * 100),
      diamanteValor: String(regra.diamanteValor ?? 0),
      pixMinVendas2h: String(regra.pixMinVendas2h ?? 0),
      pixValor: String(regra.pixValor ?? 0),
      pixDiasSemana: regra.pixDiasSemana || [],
    });
  }, [regraQuery.data]);

  function setField(campo, valor) {
    setForm((f) => ({ ...f, [campo]: valor }));
  }

  function toggleDia(dia) {
    setForm((f) => ({
      ...f,
      pixDiasSemana: f.pixDiasSemana.includes(dia) ? f.pixDiasSemana.filter((d) => d !== dia) : [...f.pixDiasSemana, dia],
    }));
  }

  async function salvar() {
    try {
      await salvarMutation.mutateAsync({
        competencia,
        ouroPercentMin: (Number(form.ouroPercent) || 0) / 100,
        ouroValor: Number(form.ouroValor) || 0,
        diamantePercentMin: (Number(form.diamantePercent) || 0) / 100,
        diamanteValor: Number(form.diamanteValor) || 0,
        pixMinVendas2h: Number(form.pixMinVendas2h) || 0,
        pixValor: Number(form.pixValor) || 0,
        pixDiasSemana: form.pixDiasSemana,
      });
      toast.success(`Regras de conversão salvas para ${competencia}!`);
    } catch (err) {
      toast.error(err.message || 'Erro ao salvar regras.');
    }
  }

  if (regraQuery.isLoading) return <LoadingBlock label="Carregando regras..." />;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title="Bônus por Faixa de Conversão Mensal" subtitle="ParqueShopping (Playground) e Grão Pará" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="% mínimo — Bônus Ouro">
            <Input type="number" min="0" max="100" step="0.1" value={form.ouroPercent} onChange={(e) => setField('ouroPercent', e.target.value)} />
          </Field>
          <Field label="R$ — Bônus Ouro">
            <Input type="number" min="0" step="0.01" value={form.ouroValor} onChange={(e) => setField('ouroValor', e.target.value)} />
          </Field>
          <Field label="% mínimo — Bônus Diamante">
            <Input type="number" min="0" max="100" step="0.1" value={form.diamantePercent} onChange={(e) => setField('diamantePercent', e.target.value)} />
          </Field>
          <Field label="R$ — Bônus Diamante">
            <Input type="number" min="0" step="0.01" value={form.diamanteValor} onChange={(e) => setField('diamanteValor', e.target.value)} />
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader title="Pix Guardião de Fim de Semana" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Qtd. mínima de vendas 2h no dia">
            <Input type="number" min="0" step="1" value={form.pixMinVendas2h} onChange={(e) => setField('pixMinVendas2h', e.target.value)} />
          </Field>
          <Field label="R$ do Pix por dia qualificado">
            <Input type="number" min="0" step="0.01" value={form.pixValor} onChange={(e) => setField('pixValor', e.target.value)} />
          </Field>
        </div>
        <div className="mt-3">
          <p className="text-sm font-bold text-slate-700 mb-2">Dias da semana considerados "Fim de Semana"</p>
          <div className="flex flex-wrap gap-3">
            {DIAS.map((dia) => (
              <label key={dia} className="flex items-center gap-1.5 text-sm text-slate-600 font-medium">
                <input type="checkbox" checked={form.pixDiasSemana.includes(dia)} onChange={() => toggleDia(dia)} className="rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                {DIAS_LABEL[dia]}
              </label>
            ))}
          </div>
        </div>
      </Card>

      <Button variant="secondary" onClick={salvar} disabled={salvarMutation.isPending}>
        {salvarMutation.isPending ? 'Salvando...' : 'Salvar Regras deste Mês'}
      </Button>
    </div>
  );
}
