import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ImageOff, ImageIcon, Trash2 } from 'lucide-react';
import Card, { CardHeader } from '../../components/ui/Card.jsx';
import Table, { Td, Tr } from '../../components/ui/Table.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Button from '../../components/ui/Button.jsx';
import Select from '../../components/ui/Select.jsx';
import Input from '../../components/ui/Input.jsx';
import Modal from '../../components/ui/Modal.jsx';
import ConfirmDialog from '../../components/ui/ConfirmDialog.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import { LoadingBlock } from '../../components/ui/Spinner.jsx';
import { getCurrentUser } from '../../lib/auth.js';
import { formatBRL, formatDateTime } from '../../lib/format.js';
import {
  LOJAS_FILTRO_HISTORICO,
  STATUS_BADGE,
  STATUS_LABELS,
  useExcluirRegistro,
  useFotoRegistro,
  useRegistros,
} from '../../hooks/useCaixa.js';

const POR_PAGINA = 20;

export default function HistoricoPage() {
  const user = getCurrentUser();
  const ehBruno = (user?.nome || '').trim().toLowerCase() === 'bruno';

  const registrosQuery = useRegistros();
  const excluirRegistro = useExcluirRegistro();
  const fotoRegistro = useFotoRegistro();

  const [busca, setBusca] = useState('');
  const [filtroLoja, setFiltroLoja] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('');
  const [filtroStatus, setFiltroStatus] = useState('');
  const [dataDe, setDataDe] = useState('');
  const [dataAte, setDataAte] = useState('');
  const [pagina, setPagina] = useState(1);

  const [fotoAberta, setFotoAberta] = useState(null); // { registroId, url } | null
  const [alvoExclusao, setAlvoExclusao] = useState(null);

  const registros = registrosQuery.data || [];

  const listaFiltrada = useMemo(() => {
    let lista = [...registros].sort((a, b) => new Date(b.dataOperacao) - new Date(a.dataOperacao));
    if (filtroLoja) lista = lista.filter((r) => r.loja === filtroLoja);
    if (filtroTipo) lista = lista.filter((r) => r.tipoOperacao === filtroTipo);
    if (filtroStatus) lista = lista.filter((r) => r.status === filtroStatus);
    if (dataDe) lista = lista.filter((r) => new Date(r.dataOperacao) >= new Date(`${dataDe}T00:00:00`));
    if (dataAte) lista = lista.filter((r) => new Date(r.dataOperacao) <= new Date(`${dataAte}T23:59:59`));
    if (busca.trim()) {
      const termo = busca.trim().toLowerCase();
      lista = lista.filter((r) =>
        [r.loja, r.consultor, r.observacoes].some((v) => (v || '').toLowerCase().includes(termo))
      );
    }
    return lista;
  }, [registros, filtroLoja, filtroTipo, filtroStatus, dataDe, dataAte, busca]);

  const totalPaginas = Math.max(1, Math.ceil(listaFiltrada.length / POR_PAGINA));
  const paginaAtual = Math.min(pagina, totalPaginas);
  const paginada = listaFiltrada.slice((paginaAtual - 1) * POR_PAGINA, paginaAtual * POR_PAGINA);

  function mudarFiltro(setter) {
    return (valor) => {
      setter(valor);
      setPagina(1);
    };
  }

  async function verFoto(registro) {
    if (!registro.fotoEnvelope && registro.temFoto === false) {
      toast.info('Este registro não possui foto.');
      return;
    }
    try {
      const res = await fotoRegistro.mutateAsync(registro.id);
      if (!res?.fotoEnvelope) {
        toast.info('Este registro não possui foto.');
        return;
      }
      setFotoAberta({ registroId: registro.id, url: res.fotoEnvelope });
    } catch (err) {
      toast.error(err.message || 'Erro ao carregar a foto.');
    }
  }

  async function confirmarExclusao() {
    if (!alvoExclusao) return;
    try {
      await excluirRegistro.mutateAsync({ id: alvoExclusao.id, usuario: user?.nome });
      toast.success('Registro excluído.');
      setAlvoExclusao(null);
    } catch (err) {
      toast.error(err.message || 'Erro ao excluir registro.');
    }
  }

  if (registrosQuery.isLoading) {
    return (
      <Card>
        <LoadingBlock label="Carregando histórico..." />
      </Card>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <Card>
        <CardHeader title="Histórico" subtitle="Todos os registros de abertura e fechamento de caixa." />

        <div className="flex flex-wrap gap-3 mb-4">
          <Input
            className="w-56"
            placeholder="Buscar loja, consultor..."
            value={busca}
            onChange={(e) => mudarFiltro(setBusca)(e.target.value)}
          />
          <Select className="w-40" value={filtroLoja} onChange={(e) => mudarFiltro(setFiltroLoja)(e.target.value)}>
            <option value="">Todas as lojas</option>
            {LOJAS_FILTRO_HISTORICO.map((loja) => (
              <option key={loja} value={loja}>
                {loja}
              </option>
            ))}
          </Select>
          <Select className="w-40" value={filtroTipo} onChange={(e) => mudarFiltro(setFiltroTipo)(e.target.value)}>
            <option value="">Todos os tipos</option>
            <option value="Abertura">Abertura</option>
            <option value="Fechamento">Fechamento</option>
          </Select>
          <Select className="w-48" value={filtroStatus} onChange={(e) => mudarFiltro(setFiltroStatus)(e.target.value)}>
            <option value="">Todos os status</option>
            {Object.entries(STATUS_LABELS).map(([valor, label]) => (
              <option key={valor} value={valor}>
                {label}
              </option>
            ))}
          </Select>
          <Input type="date" className="w-40" value={dataDe} onChange={(e) => mudarFiltro(setDataDe)(e.target.value)} />
          <Input type="date" className="w-40" value={dataAte} onChange={(e) => mudarFiltro(setDataAte)(e.target.value)} />
        </div>

        {listaFiltrada.length === 0 ? (
          <EmptyState title="Nenhum registro encontrado" description="Ajuste os filtros para ver outros registros." />
        ) : (
          <>
            <Table
              columns={[
                'Data',
                'Loja',
                'Consultor',
                'Tipo',
                'Fundo',
                'Envelope',
                'Status',
                'Retirada',
                'Foto',
                ...(ehBruno ? ['Ações'] : []),
              ]}
            >
              {paginada.map((r) => (
                <Tr key={r.id}>
                  <Td>{formatDateTime(r.dataOperacao)}</Td>
                  <Td className="font-bold text-slate-800">{r.loja}</Td>
                  <Td>{r.consultor}</Td>
                  <Td>{r.tipoOperacao}</Td>
                  <Td>{formatBRL(r.fundoCaixa)}</Td>
                  <Td>{r.valorEnvelope != null ? formatBRL(r.valorEnvelope) : '—'}</Td>
                  <Td>
                    <Badge status={STATUS_BADGE[r.status] || 'neutro'}>{STATUS_LABELS[r.status] || r.status}</Badge>
                  </Td>
                  <Td>
                    {r.dataRetirada ? (
                      <span className="text-xs">
                        {formatDateTime(r.dataRetirada)} · {r.retiradoPor}
                      </span>
                    ) : (
                      '—'
                    )}
                  </Td>
                  <Td>
                    <button
                      type="button"
                      onClick={() => verFoto(r)}
                      className="text-slate-500 hover:text-blue-600 transition-colors"
                      title="Ver foto do envelope"
                    >
                      {r.fotoEnvelope || r.temFoto ? <ImageIcon size={18} /> : <ImageOff size={18} className="text-slate-300" />}
                    </button>
                  </Td>
                  {ehBruno && (
                    <Td>
                      <Button variant="ghost" size="sm" onClick={() => setAlvoExclusao(r)} className="text-rose-600 hover:bg-rose-50">
                        <Trash2 size={16} />
                      </Button>
                    </Td>
                  )}
                </Tr>
              ))}
            </Table>

            <div className="flex items-center justify-between mt-4">
              <p className="text-xs text-slate-500">
                {listaFiltrada.length} registro(s) — página {paginaAtual} de {totalPaginas}
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={paginaAtual <= 1} onClick={() => setPagina((p) => p - 1)}>
                  Anterior
                </Button>
                <Button variant="outline" size="sm" disabled={paginaAtual >= totalPaginas} onClick={() => setPagina((p) => p + 1)}>
                  Próxima
                </Button>
              </div>
            </div>
          </>
        )}
      </Card>

      <Modal open={!!fotoAberta} onClose={() => setFotoAberta(null)} title="Foto do Envelope" size="md">
        {fotoAberta?.url && <img src={fotoAberta.url} alt="Foto do envelope" className="w-full rounded-xl" />}
      </Modal>

      <ConfirmDialog
        open={!!alvoExclusao}
        onClose={() => setAlvoExclusao(null)}
        onConfirm={confirmarExclusao}
        title="Excluir registro"
        description={
          alvoExclusao
            ? `Tem certeza que deseja excluir o registro de ${alvoExclusao.tipoOperacao} de ${alvoExclusao.loja} (${formatDateTime(
                alvoExclusao.dataOperacao
              )})? Esta ação não pode ser desfeita.`
            : ''
        }
        confirmLabel="Excluir"
        danger
        loading={excluirRegistro.isPending}
      />
    </div>
  );
}
