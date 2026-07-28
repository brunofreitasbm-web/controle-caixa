import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import Card, { CardHeader } from '../../../components/ui/Card.jsx';
import Button from '../../../components/ui/Button.jsx';
import Input, { Field } from '../../../components/ui/Input.jsx';
import { LoadingBlock } from '../../../components/ui/Spinner.jsx';
import { useRegraLocacoes, useSalvarRegrasLocacoes } from '../../../hooks/useFaBonificacao.js';

const CAMPOS_META = [
  ['metaSegQui', 'Segunda a Quinta'],
  ['metaSexta', 'Sexta-feira'],
  ['metaSabado', 'Sábado'],
  ['metaDomingo', 'Domingo'],
];

export default function RegrasLocacoesForm({ competencia }) {
  const regraQuery = useRegraLocacoes(competencia);
  const salvarMutation = useSalvarRegrasLocacoes();

  const [form, setForm] = useState({
    metaSegQui: '20', metaSexta: '38', metaSabado: '45', metaDomingo: '40',
    ticketMedio: '48', pisoMes: '480', metaMes: '840', superMetaMes: '1110',
    farolVerde: '100', farolAmarelo: '80',
  });

  useEffect(() => {
    const regra = regraQuery.data?.regra;
    if (!regra) return;
    setForm({
      metaSegQui: String(regra.metaSegQui ?? 0),
      metaSexta: String(regra.metaSexta ?? 0),
      metaSabado: String(regra.metaSabado ?? 0),
      metaDomingo: String(regra.metaDomingo ?? 0),
      ticketMedio: String(regra.ticketMedio ?? 0),
      pisoMes: String(regra.pisoMes ?? 0),
      metaMes: String(regra.metaMes ?? 0),
      superMetaMes: String(regra.superMetaMes ?? 0),
      farolVerde: String(Math.round((Number(regra.farolVerde) || 0) * 100)),
      farolAmarelo: String(Math.round((Number(regra.farolAmarelo) || 0) * 100)),
    });
  }, [regraQuery.data]);

  function setField(campo, valor) {
    setForm((f) => ({ ...f, [campo]: valor }));
  }

  async function salvar() {
    try {
      await salvarMutation.mutateAsync({
        competencia,
        metaSegQui: Number(form.metaSegQui) || 0,
        metaSexta: Number(form.metaSexta) || 0,
        metaSabado: Number(form.metaSabado) || 0,
        metaDomingo: Number(form.metaDomingo) || 0,
        ticketMedio: Number(form.ticketMedio) || 0,
        pisoMes: Number(form.pisoMes) || 0,
        metaMes: Number(form.metaMes) || 0,
        superMetaMes: Number(form.superMetaMes) || 0,
        farolVerde: (Number(form.farolVerde) || 0) / 100,
        farolAmarelo: (Number(form.farolAmarelo) || 0) / 100,
      });
      toast.success(`Regras de locações salvas para ${competencia}!`);
    } catch (err) {
      toast.error(err.message || 'Erro ao salvar regras.');
    }
  }

  if (regraQuery.isLoading) return <LoadingBlock label="Carregando regras..." />;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title="Meta de Locações por Dia da Semana" subtitle="Parque Circuito (quiosque de carrinhos)" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {CAMPOS_META.map(([campo, label]) => (
            <Field key={campo} label={label}>
              <Input type="number" min="0" step="1" value={form[campo]} onChange={(e) => setField(campo, e.target.value)} />
            </Field>
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader title="Metas do Mês e Ticket" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Ticket médio (R$)">
            <Input type="number" min="0" step="0.01" value={form.ticketMedio} onChange={(e) => setField('ticketMedio', e.target.value)} />
          </Field>
          <Field label="Piso do mês (locações)">
            <Input type="number" min="0" step="1" value={form.pisoMes} onChange={(e) => setField('pisoMes', e.target.value)} />
          </Field>
          <Field label="Meta do mês (locações)">
            <Input type="number" min="0" step="1" value={form.metaMes} onChange={(e) => setField('metaMes', e.target.value)} />
          </Field>
          <Field label="Super-meta do mês (locações)">
            <Input type="number" min="0" step="1" value={form.superMetaMes} onChange={(e) => setField('superMetaMes', e.target.value)} />
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader title="Farol (percentual da meta do dia)" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="🟢 Verde a partir de (%)">
            <Input type="number" min="0" max="200" step="1" value={form.farolVerde} onChange={(e) => setField('farolVerde', e.target.value)} />
          </Field>
          <Field label="🟡 Amarelo a partir de (%)">
            <Input type="number" min="0" max="200" step="1" value={form.farolAmarelo} onChange={(e) => setField('farolAmarelo', e.target.value)} />
          </Field>
        </div>
      </Card>

      <Button variant="secondary" onClick={salvar} disabled={salvarMutation.isPending}>
        {salvarMutation.isPending ? 'Salvando...' : 'Salvar Regras deste Mês'}
      </Button>
    </div>
  );
}
