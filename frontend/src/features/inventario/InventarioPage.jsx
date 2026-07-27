import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { Boxes, Plus, ScanBarcode, Trash2 } from 'lucide-react';
import Card, { CardHeader } from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import Select from '../../components/ui/Select.jsx';
import Input, { Field } from '../../components/ui/Input.jsx';
import Table, { Tr, Td } from '../../components/ui/Table.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import ConfirmDialog from '../../components/ui/ConfirmDialog.jsx';
import { LoadingBlock } from '../../components/ui/Spinner.jsx';
import { formatDate } from '../../lib/format.js';
import { getCurrentUser } from '../../lib/auth.js';
import { useRealtimeEvent } from '../../lib/realtime.jsx';
import { LOJAS_CACAU_SHOW } from '../../hooks/useFinanceiro.js';
import { useInventarioLoja, useSalvarItemInventario, useExcluirItemInventario, useCodBarraConsulta } from '../../hooks/useInventario.js';

const NOVO_ITEM = { barras: '', code: '', description: '', countedQty: '', validade: '' };

export default function InventarioPage() {
  const usuario = getCurrentUser()?.nome;
  const qc = useQueryClient();
  const [loja, setLoja] = useState(LOJAS_CACAU_SHOW[0].codigo);
  const [novo, setNovo] = useState(NOVO_ITEM);
  const [rascunho, setRascunho] = useState({});
  const [paraExcluir, setParaExcluir] = useState(null);

  const inventarioQuery = useInventarioLoja(loja);
  const codbarraQuery = useCodBarraConsulta();
  const salvarItem = useSalvarItemInventario();
  const excluirItem = useExcluirItemInventario();

  useRealtimeEvent('inventario.item', () => qc.invalidateQueries({ queryKey: ['inventario', loja] }));
  useRealtimeEvent('inventario.bulk', () => qc.invalidateQueries({ queryKey: ['inventario', loja] }));
  useRealtimeEvent('inventario.recarregar', () => qc.invalidateQueries({ queryKey: ['inventario', loja] }));
  useRealtimeEvent('inventario.excluido', () => qc.invalidateQueries({ queryKey: ['inventario', loja] }));

  const itens = useMemo(() => (inventarioQuery.data || []).slice().sort((a, b) => a.code.localeCompare(b.code)), [inventarioQuery.data]);

  function valorRascunho(item, campo) {
    const chave = `${item.code}:${campo}`;
    return rascunho[chave] !== undefined ? rascunho[chave] : item[campo] ?? '';
  }

  function editarCampo(item, campo, valor) {
    setRascunho((prev) => ({ ...prev, [`${item.code}:${campo}`]: valor }));
  }

  function salvarLinha(item) {
    salvarItem.mutate(
      {
        loja,
        cod: item.code,
        usuario,
        item: {
          barras: item.barras,
          description: item.description,
          validade: valorRascunho(item, 'validade') || null,
          countedQty: valorRascunho(item, 'countedQty'),
          dataEntrada: item.dataEntrada,
          qtdEntradaUnidades: item.qtdEntradaUnidades,
        },
      },
      { onError: (err) => toast.error(err.message || 'Erro ao salvar o item.') }
    );
  }

  function buscarPorBarras() {
    if (!novo.barras) return;
    const mapa = codbarraQuery.data || {};
    const encontrado = mapa[novo.barras.trim()];
    if (encontrado) {
      setNovo((prev) => ({ ...prev, code: encontrado.codProd, description: encontrado.descricao }));
      toast.success(`Produto localizado: ${encontrado.descricao}`);
    } else {
      toast.warning('Código de barras não encontrado na tabela de consulta.');
    }
  }

  function adicionarItem() {
    if (!novo.code) {
      toast.error('Informe pelo menos o código do produto.');
      return;
    }
    salvarItem.mutate(
      {
        loja,
        cod: novo.code,
        usuario,
        item: {
          barras: novo.barras,
          description: novo.description,
          validade: novo.validade || null,
          countedQty: novo.countedQty,
        },
      },
      {
        onSuccess: () => {
          toast.success('Item adicionado ao inventário.');
          setNovo(NOVO_ITEM);
        },
        onError: (err) => toast.error(err.message || 'Erro ao adicionar o item.'),
      }
    );
  }

  function confirmarExclusao() {
    if (!paraExcluir) return;
    excluirItem.mutate(
      { loja, cod: paraExcluir.code, usuario },
      {
        onSuccess: () => {
          toast.success('Item removido do inventário.');
          setParaExcluir(null);
        },
        onError: (err) => toast.error(err.message || 'Erro ao remover o item.'),
      }
    );
  }

  return (
    <div className="animate-fade-in space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-slate-800">Inventário de Estoque</h1>
          <p className="text-sm text-slate-500 mt-1">Contagem física compartilhada em tempo real entre a equipe da loja.</p>
        </div>
        <Select className="md:w-56" value={loja} onChange={(e) => setLoja(e.target.value)}>
          {LOJAS_CACAU_SHOW.map((l) => (
            <option key={l.codigo} value={l.codigo}>
              {l.nome}
            </option>
          ))}
        </Select>
      </div>

      <Card>
        <CardHeader title="Adicionar item" subtitle="Busque pelo código de barras ou digite os dados manualmente." />
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
          <Field label="Código de barras">
            <div className="flex gap-2">
              <Input value={novo.barras} onChange={(e) => setNovo((p) => ({ ...p, barras: e.target.value }))} placeholder="Escaneie ou digite" />
              <Button type="button" variant="outline" onClick={buscarPorBarras} disabled={codbarraQuery.isLoading}>
                <ScanBarcode size={16} />
              </Button>
            </div>
          </Field>
          <Field label="Código">
            <Input value={novo.code} onChange={(e) => setNovo((p) => ({ ...p, code: e.target.value }))} />
          </Field>
          <Field label="Descrição">
            <Input value={novo.description} onChange={(e) => setNovo((p) => ({ ...p, description: e.target.value }))} />
          </Field>
          <Field label="Validade">
            <Input type="date" value={novo.validade} onChange={(e) => setNovo((p) => ({ ...p, validade: e.target.value }))} />
          </Field>
          <Field label="Quantidade">
            <div className="flex gap-2">
              <Input type="number" value={novo.countedQty} onChange={(e) => setNovo((p) => ({ ...p, countedQty: e.target.value }))} />
              <Button type="button" onClick={adicionarItem} disabled={salvarItem.isPending}>
                <Plus size={16} />
              </Button>
            </div>
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader title="Itens contados" subtitle={`${itens.length} item(ns)`} />
        {inventarioQuery.isLoading ? (
          <LoadingBlock label="Carregando inventário..." />
        ) : itens.length === 0 ? (
          <EmptyState icon={Boxes} title="Nenhum item contado ainda" description="Adicione um item acima ou aguarde a importação de uma NF-e conferida." />
        ) : (
          <Table columns={[{ label: 'Código' }, { label: 'Descrição' }, { label: 'Validade' }, { label: 'Quantidade' }, { label: 'Atualizado por' }, { label: '' }]}>
            {itens.map((item) => (
              <Tr key={item.code}>
                <Td>{item.code}</Td>
                <Td className="whitespace-normal max-w-xs">{item.description}</Td>
                <Td>
                  <Input
                    type="date"
                    className="w-40"
                    value={valorRascunho(item, 'validade')}
                    onChange={(e) => editarCampo(item, 'validade', e.target.value)}
                    onBlur={() => salvarLinha(item)}
                  />
                </Td>
                <Td>
                  <Input
                    type="number"
                    className="w-24"
                    value={valorRascunho(item, 'countedQty')}
                    onChange={(e) => editarCampo(item, 'countedQty', e.target.value)}
                    onBlur={() => salvarLinha(item)}
                  />
                </Td>
                <Td>
                  {item.atualizadoPor || '—'}
                  {item.lastUpdated && <span className="block text-xs text-slate-400">{formatDate(item.lastUpdated)}</span>}
                </Td>
                <Td>
                  <Button size="sm" variant="danger" onClick={() => setParaExcluir(item)}>
                    <Trash2 size={14} />
                  </Button>
                </Td>
              </Tr>
            ))}
          </Table>
        )}
      </Card>

      <ConfirmDialog
        open={!!paraExcluir}
        onClose={() => setParaExcluir(null)}
        onConfirm={confirmarExclusao}
        title="Remover item"
        description={paraExcluir ? `Remover "${paraExcluir.description || paraExcluir.code}" do inventário?` : ''}
        confirmLabel="Remover"
        danger
        loading={excluirItem.isPending}
      />
    </div>
  );
}
