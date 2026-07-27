import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { CheckCircle2, ClipboardList, Search } from 'lucide-react';
import Card, { CardHeader } from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import Select from '../../components/ui/Select.jsx';
import Input from '../../components/ui/Input.jsx';
import Modal from '../../components/ui/Modal.jsx';
import Table, { Tr, Td } from '../../components/ui/Table.jsx';
import Badge from '../../components/ui/Badge.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import { LoadingBlock } from '../../components/ui/Spinner.jsx';
import { formatBRL, formatDate } from '../../lib/format.js';
import { getCurrentUser } from '../../lib/auth.js';
import { useRealtimeEvent } from '../../lib/realtime.jsx';
import { useQueryClient } from '@tanstack/react-query';
import { LOJAS_CACAU_SHOW, getLojaNomePorCodigo, useNfs, useRegistrarItemNf, useConcluirNf } from '../../hooks/useFinanceiro.js';

function statusDaNota(info) {
  return info?.concluidaEm ? { status: 'concluido', label: 'Concluída' } : { status: 'pendente', label: 'Pendente' };
}

function contarConferidos(products) {
  const total = products.length;
  const conferidos = products.filter((p) => p.countedQty !== '' && p.countedQty !== null && p.countedQty !== undefined).length;
  return { conferidos, total };
}

export default function ConferenciaNfePage() {
  const usuario = getCurrentUser()?.nome;
  const qc = useQueryClient();
  const nfsQuery = useNfs();
  const [lojaFiltro, setLojaFiltro] = useState('all');
  const [statusFiltro, setStatusFiltro] = useState('all');
  const [busca, setBusca] = useState('');
  const [ativa, setAtiva] = useState(null); // linha da NF-e selecionada para conferência

  useRealtimeEvent('nf.item', () => qc.invalidateQueries({ queryKey: ['nfs'] }));
  useRealtimeEvent('nf.concluida', () => qc.invalidateQueries({ queryKey: ['nfs'] }));
  useRealtimeEvent('nf.importada', () => qc.invalidateQueries({ queryKey: ['nfs'] }));
  useRealtimeEvent('nf.excluida', () => qc.invalidateQueries({ queryKey: ['nfs'] }));

  const notas = nfsQuery.data || [];

  const filtradas = useMemo(() => {
    return notas.filter((nf) => {
      const loja = nf.info?.targetStore || '';
      const { status } = statusDaNota(nf.info);
      const matchLoja = lojaFiltro === 'all' || loja === lojaFiltro;
      const matchStatus = statusFiltro === 'all' || status === statusFiltro;
      const matchBusca = !busca || nf.numero?.toString().toLowerCase().includes(busca.toLowerCase());
      return matchLoja && matchStatus && matchBusca;
    });
  }, [notas, lojaFiltro, statusFiltro, busca]);

  // Mantém o modal sincronizado com o dado mais recente do servidor (o
  // realtime invalida a query, então basta reencontrar a linha por id).
  const notaAtiva = ativa ? notas.find((n) => n.id === ativa.id) || ativa : null;

  return (
    <div className="animate-fade-in space-y-6">
      <div>
        <h1 className="text-xl md:text-2xl font-bold text-slate-800">Conferência de NF-e</h1>
        <p className="text-sm text-slate-500 mt-1">Confira item a item as notas fiscais importadas.</p>
      </div>

      <Card>
        <div className="flex flex-col md:flex-row gap-3 mb-4">
          <div className="flex-1 relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input className="pl-9" placeholder="Buscar por número da NF-e..." value={busca} onChange={(e) => setBusca(e.target.value)} />
          </div>
          <Select className="md:w-52" value={lojaFiltro} onChange={(e) => setLojaFiltro(e.target.value)}>
            <option value="all">Todas as lojas</option>
            {LOJAS_CACAU_SHOW.map((l) => (
              <option key={l.codigo} value={l.codigo}>
                {l.nome}
              </option>
            ))}
          </Select>
          <Select className="md:w-48" value={statusFiltro} onChange={(e) => setStatusFiltro(e.target.value)}>
            <option value="all">Todos os status</option>
            <option value="pendente">Pendente</option>
            <option value="concluido">Concluída</option>
          </Select>
        </div>

        {nfsQuery.isLoading ? (
          <LoadingBlock label="Carregando notas fiscais..." />
        ) : filtradas.length === 0 ? (
          <EmptyState icon={ClipboardList} title="Nenhuma NF-e encontrada" description="Importe uma NF-e na tela de Importações." />
        ) : (
          <Table columns={[{ label: 'Número' }, { label: 'Loja' }, { label: 'Fornecedor' }, { label: 'Emissão' }, { label: 'Valor' }, { label: 'Itens' }, { label: 'Status' }, { label: '' }]}>
            {filtradas.map((nf) => {
              const { status, label } = statusDaNota(nf.info);
              const { conferidos, total } = contarConferidos(nf.products || []);
              return (
                <Tr key={nf.id}>
                  <Td className="font-bold text-slate-800">{nf.numero}</Td>
                  <Td>{getLojaNomePorCodigo(nf.info?.targetStore)}</Td>
                  <Td>{nf.info?.fornecedor || '—'}</Td>
                  <Td>{nf.info?.emissao || '—'}</Td>
                  <Td>{formatBRL(nf.info?.valorTotal)}</Td>
                  <Td>
                    {conferidos}/{total}
                  </Td>
                  <Td>
                    <Badge status={status}>{label}</Badge>
                  </Td>
                  <Td>
                    <Button size="sm" variant="outline" onClick={() => setAtiva(nf)}>
                      Conferir
                    </Button>
                  </Td>
                </Tr>
              );
            })}
          </Table>
        )}
      </Card>

      {notaAtiva && <ConferenciaModal nota={notaAtiva} usuario={usuario} onClose={() => setAtiva(null)} />}
    </div>
  );
}

function ConferenciaModal({ nota, usuario, onClose }) {
  const registrarItem = useRegistrarItemNf();
  const concluir = useConcluirNf();
  const { status } = statusDaNota(nota.info);
  const loja = nota.info?.targetStore || '';
  const [rascunho, setRascunho] = useState({});

  function valorAtual(p) {
    return rascunho[p.code] !== undefined ? rascunho[p.code] : p.countedQty ?? '';
  }

  function salvarItem(code, valor) {
    registrarItem.mutate(
      { numero: nota.numero, code, countedQty: valor, loja, usuario },
      { onError: (err) => toast.error(err.message || 'Erro ao registrar a contagem.') }
    );
  }

  function handleConcluir() {
    concluir.mutate(
      { numero: nota.numero, loja, usuario },
      {
        onSuccess: () => {
          toast.success(`NF-e Nº ${nota.numero} marcada como concluída!`);
          onClose();
        },
        onError: (err) => toast.error(err.message || 'Erro ao concluir a conferência.'),
      }
    );
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`NF-e Nº ${nota.numero} — ${getLojaNomePorCodigo(loja)}`}
      size="xl"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Fechar
          </Button>
          <Button variant="secondary" onClick={handleConcluir} disabled={concluir.isPending || status === 'concluido'}>
            <CheckCircle2 size={16} />
            {status === 'concluido' ? 'Já concluída' : concluir.isPending ? 'Concluindo...' : 'Concluir Conferência'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Badge status={status}>{status === 'concluido' ? 'Concluída' : 'Pendente'}</Badge>

        <Table columns={[{ label: 'Código' }, { label: 'Produto' }, { label: 'Qtd. Faturada' }, { label: 'Validade' }, { label: 'Contagem' }]}>
          {(nota.products || []).map((p) => {
            const diasRestantes = p.validade ? Math.ceil((new Date(p.validade).getTime() - Date.now()) / 86400000) : null;
            return (
              <Tr key={p.code}>
                <Td>{p.code}</Td>
                <Td className="whitespace-normal max-w-xs">{p.description}</Td>
                <Td>{p.nfQty ?? p.totalUnits}</Td>
                <Td>
                  {p.validade ? formatDate(p.validade) : '—'}
                  {diasRestantes !== null && diasRestantes <= 30 && (
                    <Badge status={diasRestantes < 0 ? 'urgente' : 'atencao'} className="ml-2">
                      {diasRestantes < 0 ? 'vencido' : `${diasRestantes}d`}
                    </Badge>
                  )}
                </Td>
                <Td>
                  <Input
                    type="number"
                    className="w-24"
                    value={valorAtual(p)}
                    onChange={(e) => setRascunho((prev) => ({ ...prev, [p.code]: e.target.value }))}
                    onBlur={(e) => salvarItem(p.code, e.target.value)}
                  />
                </Td>
              </Tr>
            );
          })}
        </Table>
      </div>
    </Modal>
  );
}
