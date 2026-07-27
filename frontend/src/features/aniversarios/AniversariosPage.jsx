import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Cake, Gift, Sparkles, Send, CheckCircle2, Search, Users } from 'lucide-react';
import Card, { CardHeader } from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Modal from '../../components/ui/Modal.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import { LoadingBlock } from '../../components/ui/Spinner.jsx';
import Tabs from '../../components/ui/Tabs.jsx';
import Table, { Tr, Td } from '../../components/ui/Table.jsx';
import Input, { Textarea } from '../../components/ui/Input.jsx';
import FileDropzone from '../../components/FileDropzone.jsx';
import { abrirWhatsapp } from '../../lib/whatsapp.js';
import { formatDate } from '../../lib/format.js';
import {
  useHojeAniversarios,
  useCadastradosAniversarios,
  useImportarPdfAniversarios,
  useMarcarEnviadoAniversario,
  gerarMensagemAniversarioComIA,
} from '../../hooks/useAniversarios.js';

const LISTA_VAZIA = [];

export default function AniversariosPage() {
  const [aba, setAba] = useState('hoje');
  const [busca, setBusca] = useState('');
  const [modal, setModal] = useState(null); // { registro, texto, fonte, carregando }

  const hojeQuery = useHojeAniversarios();
  const cadastradosQuery = useCadastradosAniversarios();
  const importarMutation = useImportarPdfAniversarios();
  const marcarEnviadoMutation = useMarcarEnviadoAniversario();

  const registrosHoje = hojeQuery.data?.registros || LISTA_VAZIA;
  const cadastrados = cadastradosQuery.data || LISTA_VAZIA;
  const cadastradosFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return cadastrados;
    return cadastrados.filter(
      (r) =>
        (r.nomeCrianca || '').toLowerCase().includes(termo) ||
        (r.nomeResponsavel || '').toLowerCase().includes(termo)
    );
  }, [cadastrados, busca]);

  function handleImportarPdf(arquivo) {
    importarMutation.mutate(arquivo, {
      onSuccess: (res) => {
        toast.success(`${res.importados} aniversariante(s) importado(s) de ${res.arquivosProcessados} arquivo(s).`);
        if (res.arquivosComErro?.length) {
          toast.error(`${res.arquivosComErro.length} arquivo(s) com erro na leitura.`);
        }
      },
      onError: (err) => toast.error(err.message || 'Erro ao importar o PDF.'),
    });
  }

  async function abrirGerarMensagem(registro) {
    setModal({ registro, texto: '', fonte: null, carregando: true });
    const { texto, fonte } = await gerarMensagemAniversarioComIA({
      nomeResponsavel: registro.nomeResponsavel,
      nomeCrianca: registro.nomeCrianca,
      idade: registro.idade,
    });
    setModal((atual) => (atual && atual.registro.id === registro.id ? { ...atual, texto, fonte, carregando: false } : atual));
  }

  function handleAbrirWhatsapp() {
    if (!modal) return;
    abrirWhatsapp(modal.registro.telefone, modal.texto);
  }

  function handleMarcarEnviado() {
    if (!modal) return;
    marcarEnviadoMutation.mutate(modal.registro.id, {
      onSuccess: () => {
        toast.success('Parabéns marcado como enviado!');
        setModal(null);
      },
      onError: (err) => toast.error(err.message || 'Erro ao marcar como enviado.'),
    });
  }

  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      <Card>
        <CardHeader title="Aniversários" subtitle="Parabéns para as crianças cadastradas no Playground FaçaAmigos" />
        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-4 items-start">
          <FileDropzone
            accept=".pdf"
            label="Arraste o PDF do cadastro de aniversariantes ou clique para selecionar"
            hint={importarMutation.isPending ? 'Importando...' : 'Pode importar mais de uma vez, o cadastro é atualizado'}
            onFile={handleImportarPdf}
          />
          <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 text-sm text-slate-500 self-stretch flex flex-col justify-center">
            <p className="font-bold text-slate-700">{hojeQuery.data?.totalCadastrados ?? '—'}</p>
            <p>cadastrados no total</p>
          </div>
        </div>
      </Card>

      <Card>
        <Tabs
          tabs={[
            { key: 'hoje', label: `Aniversariantes de hoje${registrosHoje.length ? ` (${registrosHoje.length})` : ''}` },
            { key: 'cadastrados', label: `Todos os cadastrados (${cadastrados.length})` },
          ]}
          active={aba}
          onChange={setAba}
        />

        {aba === 'hoje' && (
          <>
            {hojeQuery.isLoading ? (
              <LoadingBlock label="Carregando aniversariantes..." />
            ) : registrosHoje.length === 0 ? (
              <EmptyState icon={Cake} title="Ninguém faz aniversário hoje" description="Volte amanhã para conferir a próxima lista." />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {registrosHoje.map((registro) => {
                  const enviado = registro.jaEnviadoEsteAno;
                  return (
                    <div
                      key={registro.id}
                      className={`flex flex-col gap-3 rounded-xl border p-4 ${
                        enviado ? 'border-emerald-200 bg-emerald-50' : 'border-gray-200'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-bold text-slate-800 flex items-center gap-1.5">
                            <Gift size={16} className="text-rose-500" /> {registro.nomeCrianca}
                          </p>
                          <p className="text-sm text-slate-500">Completa {registro.idade} anos hoje</p>
                          <p className="text-xs text-slate-400 mt-0.5">Responsável: {registro.nomeResponsavel}</p>
                        </div>
                        {enviado && <Badge status="pago">Enviado</Badge>}
                      </div>
                      <Button onClick={() => abrirGerarMensagem(registro)} disabled={enviado} className="w-full">
                        <Cake size={16} /> {enviado ? 'Parabéns já enviado' : 'Gerar mensagem'}
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {aba === 'cadastrados' && (
          <>
            <div className="mb-4 max-w-sm">
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <Input
                  placeholder="Buscar por criança ou responsável..."
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
            {cadastradosQuery.isLoading ? (
              <LoadingBlock label="Carregando cadastrados..." />
            ) : cadastradosFiltrados.length === 0 ? (
              <EmptyState icon={Users} title="Nenhum cadastro encontrado" description="Importe o PDF de aniversariantes para começar." />
            ) : (
              <Table columns={['Criança', 'Nascimento', 'Responsável', 'Telefone', 'Documento']}>
                {cadastradosFiltrados.map((r) => (
                  <Tr key={r.id}>
                    <Td>{r.nomeCrianca}</Td>
                    <Td>{formatDate(r.dataNascimento)}</Td>
                    <Td>{r.nomeResponsavel}</Td>
                    <Td>{r.telefone || '—'}</Td>
                    <Td>{r.documento || '—'}</Td>
                  </Tr>
                ))}
              </Table>
            )}
          </>
        )}
      </Card>

      <Modal
        open={!!modal}
        onClose={() => setModal(null)}
        title={modal ? `Parabéns para ${modal.registro.nomeCrianca}` : ''}
        size="lg"
        footer={
          modal && (
            <>
              <Button variant="outline" onClick={() => setModal(null)}>
                Cancelar
              </Button>
              <Button variant="secondary" onClick={handleAbrirWhatsapp} disabled={modal.carregando}>
                <Send size={16} /> Abrir WhatsApp
              </Button>
              <Button onClick={handleMarcarEnviado} disabled={marcarEnviadoMutation.isPending}>
                <CheckCircle2 size={16} /> {marcarEnviadoMutation.isPending ? 'Aguarde...' : 'Marcar como enviado'}
              </Button>
            </>
          )
        }
      >
        {modal && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              {modal.carregando ? (
                <Badge status="info">Gerando mensagem...</Badge>
              ) : (
                <Badge status={modal.fonte === 'ia' ? 'info' : 'neutro'}>
                  <span className="flex items-center gap-1">
                    <Sparkles size={12} /> {modal.fonte === 'ia' ? 'Personalizada por IA' : 'Modelo padrão'}
                  </span>
                </Badge>
              )}
            </div>
            <Textarea
              rows={10}
              value={modal.texto}
              onChange={(e) => setModal((atual) => ({ ...atual, texto: e.target.value }))}
              disabled={modal.carregando}
            />
          </div>
        )}
      </Modal>
    </div>
  );
}
