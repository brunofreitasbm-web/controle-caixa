import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Receipt, Trash2 } from 'lucide-react';
import Card, { CardHeader } from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import Select from '../../components/ui/Select.jsx';
import Table, { Tr, Td } from '../../components/ui/Table.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Tabs from '../../components/ui/Tabs.jsx';
import StatCard from '../../components/ui/StatCard.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import ConfirmDialog from '../../components/ui/ConfirmDialog.jsx';
import { LoadingBlock } from '../../components/ui/Spinner.jsx';
import { formatBRL } from '../../lib/format.js';
import { getCurrentUser } from '../../lib/auth.js';
import { useRealtimeEvent } from '../../lib/realtime.jsx';
import { LOJAS_CACAU_SHOW, getLojaNomePorCodigo, useBoletos, useMarcarBoletoPago, useExcluirBoleto } from '../../hooks/useFinanceiro.js';

function parseVencimento(str) {
  if (!str) return null;
  const partes = str.split('/');
  if (partes.length === 3) return new Date(Number(partes[2]), Number(partes[1]) - 1, Number(partes[0]));
  const d = new Date(str);
  return Number.isNaN(d.getTime()) ? null : d;
}

const TABS = [
  { key: 'all', label: 'Todos' },
  { key: 'Aberto', label: 'Aberto' },
  { key: 'Pago', label: 'Pago' },
];

export default function BoletosPage() {
  const usuario = getCurrentUser()?.nome;
  const qc = useQueryClient();
  const [statusFiltro, setStatusFiltro] = useState('all');
  const [lojaFiltro, setLojaFiltro] = useState('all');
  const [paraExcluir, setParaExcluir] = useState(null);

  const boletosQuery = useBoletos();
  const marcarPago = useMarcarBoletoPago();
  const excluirBoleto = useExcluirBoleto();

  useRealtimeEvent('boleto.importados', () => qc.invalidateQueries({ queryKey: ['boletos'] }));
  useRealtimeEvent('boleto.pago', () => qc.invalidateQueries({ queryKey: ['boletos'] }));
  useRealtimeEvent('boleto.excluido', () => qc.invalidateQueries({ queryKey: ['boletos'] }));

  const boletos = boletosQuery.data || [];

  const filtrados = useMemo(() => {
    return boletos
      .filter((b) => (statusFiltro === 'all' ? true : b.status === statusFiltro))
      .filter((b) => (lojaFiltro === 'all' ? true : b.loja === lojaFiltro))
      .sort((a, b) => (parseVencimento(a.vencimento)?.getTime() || 0) - (parseVencimento(b.vencimento)?.getTime() || 0));
  }, [boletos, statusFiltro, lojaFiltro]);

  const totais = useMemo(() => {
    const aberto = boletos.filter((b) => b.status === 'Aberto').reduce((acc, b) => acc + Number(b.valor || 0), 0);
    const pago = boletos.filter((b) => b.status === 'Pago').reduce((acc, b) => acc + Number(b.valor || 0), 0);
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const vencidos = boletos.filter((b) => b.status === 'Aberto' && parseVencimento(b.vencimento) && parseVencimento(b.vencimento) < hoje).length;
    return { aberto, pago, vencidos };
  }, [boletos]);

  function pagar(boleto) {
    marcarPago.mutate(
      { id: boleto.id, usuario },
      {
        onSuccess: () => toast.success(`Boleto ${boleto.documento} marcado como pago.`),
        onError: (err) => toast.error(err.message || 'Erro ao marcar boleto como pago.'),
      }
    );
  }

  function confirmarExclusao() {
    if (!paraExcluir) return;
    excluirBoleto.mutate(
      { id: paraExcluir.id, usuario },
      {
        onSuccess: () => {
          toast.success('Boleto excluído.');
          setParaExcluir(null);
        },
        onError: (err) => toast.error(err.message || 'Erro ao excluir boleto.'),
      }
    );
  }

  return (
    <div className="animate-fade-in space-y-6">
      <div>
        <h1 className="text-xl md:text-2xl font-bold text-slate-800">Boletos</h1>
        <p className="text-sm text-slate-500 mt-1">Duplicatas importadas do relatório de títulos.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard label="Em aberto" value={formatBRL(totais.aberto)} icon={Receipt} gradient="amber" />
        <StatCard label="Pago" value={formatBRL(totais.pago)} icon={CheckCircle2} gradient="emerald" />
        <StatCard label="Vencidos" value={totais.vencidos} icon={Receipt} gradient="rose" hint="boletos em aberto com vencimento no passado" />
      </div>

      <Card>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-2">
          <Tabs tabs={TABS} active={statusFiltro} onChange={setStatusFiltro} className="mb-0 flex-1" />
          <Select className="md:w-56" value={lojaFiltro} onChange={(e) => setLojaFiltro(e.target.value)}>
            <option value="all">Todas as lojas</option>
            {LOJAS_CACAU_SHOW.map((l) => (
              <option key={l.codigo} value={l.codigo}>
                {l.nome}
              </option>
            ))}
          </Select>
        </div>

        {boletosQuery.isLoading ? (
          <LoadingBlock label="Carregando boletos..." />
        ) : filtrados.length === 0 ? (
          <EmptyState icon={Receipt} title="Nenhum boleto encontrado" description="Importe um relatório de títulos na tela de Importações." />
        ) : (
          <Table columns={[{ label: 'Documento' }, { label: 'Loja' }, { label: 'Descrição' }, { label: 'Vencimento' }, { label: 'Valor' }, { label: 'Status' }, { label: '' }]}>
            {filtrados.map((b) => (
              <Tr key={b.id}>
                <Td>{b.documento}</Td>
                <Td>{getLojaNomePorCodigo(b.loja)}</Td>
                <Td className="whitespace-normal max-w-xs">{b.descricao}</Td>
                <Td>{b.vencimento}</Td>
                <Td>{formatBRL(b.valor)}</Td>
                <Td>
                  <Badge status={b.status === 'Pago' ? 'pago' : 'aberto'}>{b.status}</Badge>
                </Td>
                <Td>
                  <div className="flex gap-2">
                    {b.status !== 'Pago' && (
                      <Button size="sm" variant="secondary" onClick={() => pagar(b)} disabled={marcarPago.isPending}>
                        Marcar Pago
                      </Button>
                    )}
                    <Button size="sm" variant="danger" onClick={() => setParaExcluir(b)}>
                      <Trash2 size={14} />
                    </Button>
                  </div>
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
        title="Excluir boleto"
        description={paraExcluir ? `Excluir o boleto ${paraExcluir.documento}?` : ''}
        confirmLabel="Excluir"
        danger
        loading={excluirBoleto.isPending}
      />
    </div>
  );
}
