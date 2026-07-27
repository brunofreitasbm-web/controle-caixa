import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Save, Target, Trash2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import Card, { CardHeader } from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import Select from '../../components/ui/Select.jsx';
import Input, { Field } from '../../components/ui/Input.jsx';
import Table, { Tr, Td } from '../../components/ui/Table.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import ConfirmDialog from '../../components/ui/ConfirmDialog.jsx';
import { LoadingBlock } from '../../components/ui/Spinner.jsx';
import SeriesBarChart from '../../components/charts/SeriesBarChart.jsx';
import { formatBRL } from '../../lib/format.js';
import { getCurrentUser } from '../../lib/auth.js';
import { useRealtimeEvent } from '../../lib/realtime.jsx';
import { LOJAS_CACAU_SHOW } from '../../hooks/useFinanceiro.js';
import { useMetas, useImportarMeta, useExcluirMeta } from '../../hooks/useMetasLojas.js';

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

function metaMensalVazia() {
  return MESES.reduce((acc, _m, idx) => {
    acc[String(idx + 1).padStart(2, '0')] = '';
    return acc;
  }, {});
}

export default function MetaDoAnoPage() {
  const usuario = getCurrentUser()?.nome;
  const qc = useQueryClient();
  const anoAtual = new Date().getFullYear();

  const [anoFiltro, setAnoFiltro] = useState(anoAtual);
  const [form, setForm] = useState({ ano: anoAtual, loja: LOJAS_CACAU_SHOW[0].nome, metaAnual: '', metaMensal: metaMensalVazia() });
  const [selecionada, setSelecionada] = useState(null);
  const [paraExcluir, setParaExcluir] = useState(null);

  const metasQuery = useMetas({ ano: anoFiltro });
  const importarMeta = useImportarMeta();
  const excluirMeta = useExcluirMeta();

  useRealtimeEvent('meta.importada', () => qc.invalidateQueries({ queryKey: ['metas'] }));
  useRealtimeEvent('meta.excluida', () => qc.invalidateQueries({ queryKey: ['metas'] }));

  const metas = metasQuery.data || [];

  const dadosGrafico = useMemo(() => {
    const alvo = selecionada || metas[0];
    if (!alvo?.metaMensal) return [];
    return MESES.map((label, idx) => ({
      mes: label,
      meta: Number(alvo.metaMensal[String(idx + 1).padStart(2, '0')] || 0),
    }));
  }, [selecionada, metas]);

  function salvar(e) {
    e.preventDefault();
    if (!form.ano || !form.loja) {
      toast.error('Ano e loja são obrigatórios.');
      return;
    }
    const metaMensalLimpa = Object.fromEntries(
      Object.entries(form.metaMensal).filter(([, v]) => v !== '' && v !== null && v !== undefined)
    );
    importarMeta.mutate(
      {
        ano: Number(form.ano),
        loja: form.loja,
        metaAnual: form.metaAnual === '' ? null : Number(form.metaAnual),
        metaMensal: Object.keys(metaMensalLimpa).length > 0 ? metaMensalLimpa : null,
        origem: 'importacao_manual',
        usuario,
      },
      {
        onSuccess: () => {
          toast.success(`Meta de ${form.loja} (${form.ano}) salva!`);
          setForm({ ano: anoAtual, loja: LOJAS_CACAU_SHOW[0].nome, metaAnual: '', metaMensal: metaMensalVazia() });
        },
        onError: (err) => toast.error(err.message || 'Erro ao salvar a meta.'),
      }
    );
  }

  function confirmarExclusao() {
    if (!paraExcluir) return;
    excluirMeta.mutate(
      { id: paraExcluir.id, usuario },
      {
        onSuccess: () => {
          toast.success('Meta removida.');
          setParaExcluir(null);
          if (selecionada?.id === paraExcluir.id) setSelecionada(null);
        },
        onError: (err) => toast.error(err.message || 'Erro ao remover a meta.'),
      }
    );
  }

  return (
    <div className="animate-fade-in space-y-6">
      <div>
        <h1 className="text-xl md:text-2xl font-bold text-slate-800">Meta do Ano</h1>
        <p className="text-sm text-slate-500 mt-1">Cadastre a meta anual e o detalhamento mensal por loja.</p>
      </div>

      <Card>
        <CardHeader title="Nova Meta" subtitle="Preencha a meta anual e, se quiser, o detalhamento por mês." />
        <form onSubmit={salvar} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Field label="Ano">
              <Input type="number" value={form.ano} onChange={(e) => setForm((f) => ({ ...f, ano: e.target.value }))} required />
            </Field>
            <Field label="Loja">
              <Select value={form.loja} onChange={(e) => setForm((f) => ({ ...f, loja: e.target.value }))}>
                {LOJAS_CACAU_SHOW.map((l) => (
                  <option key={l.codigo} value={l.nome}>
                    {l.nome}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Meta Anual (R$)">
              <Input
                type="number"
                step="0.01"
                value={form.metaAnual}
                onChange={(e) => setForm((f) => ({ ...f, metaAnual: e.target.value }))}
                placeholder="Opcional"
              />
            </Field>
          </div>

          <div>
            <p className="text-sm font-bold text-slate-700 mb-2">Meta mensal (opcional)</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
              {MESES.map((label, idx) => {
                const key = String(idx + 1).padStart(2, '0');
                return (
                  <Field key={key} label={label}>
                    <Input
                      type="number"
                      step="0.01"
                      value={form.metaMensal[key]}
                      onChange={(e) => setForm((f) => ({ ...f, metaMensal: { ...f.metaMensal, [key]: e.target.value } }))}
                    />
                  </Field>
                );
              })}
            </div>
          </div>

          <div className="flex justify-end">
            <Button type="submit" disabled={importarMeta.isPending}>
              <Save size={16} />
              {importarMeta.isPending ? 'Salvando...' : 'Salvar Meta'}
            </Button>
          </div>
        </form>
      </Card>

      <Card>
        <CardHeader
          title="Metas Cadastradas"
          action={
            <Input type="number" className="w-28" value={anoFiltro} onChange={(e) => setAnoFiltro(Number(e.target.value) || anoAtual)} />
          }
        />

        {metasQuery.isLoading ? (
          <LoadingBlock label="Carregando metas..." />
        ) : metas.length === 0 ? (
          <EmptyState icon={Target} title="Nenhuma meta cadastrada" description={`Nenhuma meta encontrada para ${anoFiltro}.`} />
        ) : (
          <Table columns={['Loja', 'Ano', 'Meta Anual', 'Origem', '']}>
            {metas.map((m) => (
              <Tr key={m.id} className={selecionada?.id === m.id ? 'bg-blue-50' : ''}>
                <Td className="font-bold cursor-pointer" onClick={() => setSelecionada(m)}>
                  {m.loja}
                </Td>
                <Td>{m.ano}</Td>
                <Td>{formatBRL(m.metaAnual)}</Td>
                <Td>{m.origem || '—'}</Td>
                <Td>
                  <Button size="sm" variant="outline" onClick={() => setSelecionada(m)}>
                    Ver Gráfico
                  </Button>
                  <Button size="sm" variant="danger" className="ml-2" onClick={() => setParaExcluir(m)}>
                    <Trash2 size={14} />
                  </Button>
                </Td>
              </Tr>
            ))}
          </Table>
        )}
      </Card>

      {dadosGrafico.length > 0 && (
        <Card>
          <CardHeader title="Progresso Mensal" subtitle={`${(selecionada || metas[0])?.loja} — ${(selecionada || metas[0])?.ano}`} />
          <SeriesBarChart data={dadosGrafico} dataKey="meta" xKey="mes" formatter={(v) => formatBRL(v)} />
        </Card>
      )}

      <ConfirmDialog
        open={!!paraExcluir}
        onClose={() => setParaExcluir(null)}
        onConfirm={confirmarExclusao}
        title="Remover meta"
        description={paraExcluir ? `Remover a meta de ${paraExcluir.loja} (${paraExcluir.ano})?` : ''}
        confirmLabel="Remover"
        danger
        loading={excluirMeta.isPending}
      />
    </div>
  );
}
