import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { History, ImageOff, Search, Trash2 } from 'lucide-react';
import Card, { CardHeader } from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import Select from '../../components/ui/Select.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Table, { Td, Tr } from '../../components/ui/Table.jsx';
import Input from '../../components/ui/Input.jsx';
import Modal from '../../components/ui/Modal.jsx';
import ConfirmDialog from '../../components/ui/ConfirmDialog.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import { LoadingBlock, default as Spinner } from '../../components/ui/Spinner.jsx';
import { formatBRL, formatDateTime } from '../../lib/format.js';
import { getCurrentUser, isOwner } from '../../lib/auth.js';
import { useExcluirRegistroFa, useFotoRegistroFa, useRegistrosFa } from '../../hooks/useFacaAmigos.js';
import { STATUS_BADGE_FA, STATUS_LABEL_FA, UNIDADES_FA } from './constants.js';

const PAGE_SIZE = 15;

export default function HistoricoPage() {
  const usuarioAtual = getCurrentUser();
  const podeExcluir = isOwner(usuarioAtual);

  const registrosQuery = useRegistrosFa();
  const excluirMutation = useExcluirRegistroFa();

  const [busca, setBusca] = useState('');
  const [filtroUnidade, setFiltroUnidade] = useState('');
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [pagina, setPagina] = useState(1);
  const [fotoAlvoId, setFotoAlvoId] = useState(null);
  const [excluirAlvo, setExcluirAlvo] = useState(null);

  const fotoQuery = useFotoRegistroFa(fotoAlvoId, !!fotoAlvoId);

  const linhasFiltradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return (registrosQuery.data || [])
      .filter((r) => (filtroUnidade ? r.loja === filtroUnidade : true))
      .filter((r) => {
        if (!dataInicio && !dataFim) return true;
        const data = new Date(r.dataOperacao);
        if (dataInicio && data < new Date(`${dataInicio}T00:00:00`)) return false;
        if (dataFim && data > new Date(`${dataFim}T23:59:59`)) return false;
        return true;
      })
      .filter((r) => (termo ? `${r.loja} ${r.consultor}`.toLowerCase().includes(termo) : true))
      .sort((a, b) => new Date(b.dataOperacao) - new Date(a.dataOperacao));
  }, [registrosQuery.data, busca, filtroUnidade, dataInicio, dataFim]);

  const totalPaginas = Math.max(1, Math.ceil(linhasFiltradas.length / PAGE_SIZE));
  const paginaAtual = Math.min(pagina, totalPaginas);
  const linhasPagina = linhasFiltradas.slice((paginaAtual - 1) * PAGE_SIZE, paginaAtual * PAGE_SIZE);

  function atualizarFiltro(setter) {
    return (valor) => {
      setter(valor);
      setPagina(1);
    };
  }

  async function confirmarExclusao() {
    try {
      await excluirMutation.mutateAsync(excluirAlvo.id);
      toast.success('Registro excluído.');
      setExcluirAlvo(null);
    } catch (err) {
      toast.error(err.message || 'Erro ao excluir registro.');
    }
  }

  if (registrosQuery.isLoading) {
    return <LoadingBlock label="Carregando histórico..." />;
  }

  return (
    <div className="animate-fade-in space-y-6">
      <div className="flex items-center gap-3">
        <div className="rounded-full bg-emerald-100 text-emerald-600 p-2.5">
          <History size={22} />
        </div>
        <div>
          <h1 className="text-lg font-bold text-slate-800">Histórico FaçaAmigos</h1>
          <p className="text-sm text-slate-500">Todos os envelopes registrados</p>
        </div>
      </div>

      <Card>
        <CardHeader
          title="Filtros"
          action={
            <div className="flex flex-wrap gap-2">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <Input
                  className="pl-8 w-44"
                  placeholder="Buscar loja, consultora..."
                  value={busca}
                  onChange={(e) => atualizarFiltro(setBusca)(e.target.value)}
                />
              </div>
              <Select className="w-40" value={filtroUnidade} onChange={(e) => atualizarFiltro(setFiltroUnidade)(e.target.value)}>
                <option value="">Todas as lojas</option>
                {UNIDADES_FA.map((u) => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </Select>
              <Input type="date" className="w-40" value={dataInicio} onChange={(e) => atualizarFiltro(setDataInicio)(e.target.value)} />
              <Input type="date" className="w-40" value={dataFim} onChange={(e) => atualizarFiltro(setDataFim)(e.target.value)} />
            </div>
          }
        />

        {linhasFiltradas.length === 0 ? (
          <EmptyState title="Nenhum registro encontrado" description="Ajuste os filtros para ver outros resultados." />
        ) : (
          <>
            <Table columns={['Data', 'Loja', 'Consultora', 'Fundo Caixa', 'Valor Envelope', 'Status', 'Retirada', 'Foto', podeExcluir ? 'Ações' : null].filter(Boolean)}>
              {linhasPagina.map((r) => (
                <Tr key={r.id}>
                  <Td>{formatDateTime(r.dataOperacao)}</Td>
                  <Td>{r.loja}</Td>
                  <Td>{r.consultor}</Td>
                  <Td>{formatBRL(r.fundoCaixa)}</Td>
                  <Td>{r.valorEnvelope != null ? formatBRL(r.valorEnvelope) : '—'}</Td>
                  <Td>
                    <Badge status={STATUS_BADGE_FA[r.status] || 'neutro'}>{STATUS_LABEL_FA[r.status] || r.status}</Badge>
                  </Td>
                  <Td>{r.dataRetirada ? `${formatDateTime(r.dataRetirada)} · ${r.retiradoPor || ''}` : '—'}</Td>
                  <Td>
                    {r.temFoto ? (
                      <Button size="sm" variant="outline" onClick={() => setFotoAlvoId(r.id)}>Ver foto</Button>
                    ) : (
                      <span className="text-slate-400 flex items-center gap-1 text-xs"><ImageOff size={14} /> sem foto</span>
                    )}
                  </Td>
                  {podeExcluir && (
                    <Td>
                      <Button size="sm" variant="danger" onClick={() => setExcluirAlvo(r)}>
                        <Trash2 size={14} />
                      </Button>
                    </Td>
                  )}
                </Tr>
              ))}
            </Table>

            <div className="flex items-center justify-between mt-4 text-sm text-slate-500">
              <span>Página {paginaAtual} de {totalPaginas} · {linhasFiltradas.length} registros</span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" disabled={paginaAtual <= 1} onClick={() => setPagina((p) => p - 1)}>Anterior</Button>
                <Button size="sm" variant="outline" disabled={paginaAtual >= totalPaginas} onClick={() => setPagina((p) => p + 1)}>Próxima</Button>
              </div>
            </div>
          </>
        )}
      </Card>

      <Modal open={!!fotoAlvoId} onClose={() => setFotoAlvoId(null)} title="Foto do Envelope" size="md">
        {fotoQuery.isLoading ? (
          <div className="flex justify-center py-8"><Spinner /></div>
        ) : fotoQuery.data?.fotoEnvelope ? (
          <img src={fotoQuery.data.fotoEnvelope} alt="Envelope" className="w-full rounded-xl" />
        ) : (
          <EmptyState icon={ImageOff} title="Sem foto disponível" />
        )}
      </Modal>

      <ConfirmDialog
        open={!!excluirAlvo}
        onClose={() => setExcluirAlvo(null)}
        onConfirm={confirmarExclusao}
        title="Excluir registro"
        description={excluirAlvo ? `Excluir o registro de ${excluirAlvo.tipoOperacao} de ${excluirAlvo.loja} (${formatDateTime(excluirAlvo.dataOperacao)})? Esta ação não pode ser desfeita.` : ''}
        confirmLabel="Excluir"
        danger
        loading={excluirMutation.isPending}
      />
    </div>
  );
}
