import { useState } from 'react';
import { toast } from 'sonner';
import { MessageCircleHeart, Users, CheckCircle2, Percent, AlertTriangle, Sparkles, Send } from 'lucide-react';
import Card, { CardHeader } from '../../components/ui/Card.jsx';
import StatCard from '../../components/ui/StatCard.jsx';
import Button from '../../components/ui/Button.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Modal from '../../components/ui/Modal.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import { LoadingBlock } from '../../components/ui/Spinner.jsx';
import Input, { Field, Textarea } from '../../components/ui/Input.jsx';
import FileDropzone from '../../components/FileDropzone.jsx';
import { abrirWhatsapp } from '../../lib/whatsapp.js';
import { formatDate } from '../../lib/format.js';
import {
  usePendentesPosVisita,
  useRelatorioPosVisita,
  useImportarCsvPosVisita,
  useMarcarEnviadaPosVisita,
  gerarMensagemPosVisitaComIA,
} from '../../hooks/usePosVisita.js';

function ontemISO() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

export default function PosVisitaPage() {
  const [dataSessao, setDataSessao] = useState(ontemISO());
  const [modal, setModal] = useState(null); // { registro, texto, fonte, carregando }

  const pendentesQuery = usePendentesPosVisita();
  const relatorioQuery = useRelatorioPosVisita();
  const importarMutation = useImportarCsvPosVisita();
  const marcarEnviadaMutation = useMarcarEnviadaPosVisita();

  const registros = pendentesQuery.data || [];
  const relatorio = relatorioQuery.data;
  const pendentesNoMes = relatorio ? Math.max(0, relatorio.importados - relatorio.enviados) : 0;
  const taxaEnvio = relatorio && relatorio.importados > 0 ? (relatorio.enviados / relatorio.importados) * 100 : 0;

  function handleImportarCsv(arquivo) {
    if (!dataSessao) {
      toast.error('Informe a data do relatório antes de escolher o arquivo.');
      return;
    }
    importarMutation.mutate(
      { arquivo, dataSessao },
      {
        onSuccess: (res) => {
          toast.success(`${res.inseridos} de ${res.linhasNoArquivo} linha(s) importada(s).`);
        },
        onError: (err) => toast.error(err.message || 'Erro ao importar o CSV.'),
      }
    );
  }

  async function abrirGerarMensagem(registro) {
    setModal({ registro, texto: '', fonte: null, carregando: true });
    const { texto, fonte } = await gerarMensagemPosVisitaComIA({
      nomeResponsavel: registro.cliente,
      nomeCrianca: registro.crianca,
      tempoTotalMinutos: registro.tempoTotalMinutos,
      jaContactadoAntes: registro.jaContactadoAntes,
    });
    setModal((atual) => (atual && atual.registro.id === registro.id ? { ...atual, texto, fonte, carregando: false } : atual));
  }

  function handleAbrirWhatsapp() {
    if (!modal) return;
    abrirWhatsapp(modal.registro.numeroCliente, modal.texto);
  }

  function handleMarcarEnviada() {
    if (!modal) return;
    marcarEnviadaMutation.mutate(modal.registro.id, {
      onSuccess: () => {
        toast.success('Marcado como enviada.');
        setModal(null);
      },
      onError: (err) => toast.error(err.message || 'Erro ao marcar como enviada.'),
    });
  }

  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      <Card>
        <CardHeader
          title="Pós-Visita"
          subtitle="Mensagem de acompanhamento pra quem visitou o Playground FaçaAmigos"
        />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <StatCard label="Importados no mês" value={relatorio?.importados ?? '—'} icon={Users} gradient="blue" />
          <StatCard label="Enviados no mês" value={relatorio?.enviados ?? '—'} icon={CheckCircle2} gradient="emerald" />
          <StatCard
            label="Taxa de envio"
            value={relatorio ? `${taxaEnvio.toFixed(0)}%` : '—'}
            icon={Percent}
            gradient="amber"
            hint={relatorio ? `${pendentesNoMes} ainda pendente(s)` : undefined}
          />
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Importar relatório do dia anterior"
          subtitle="Relatório Operacional do Dia (CSV) exportado do sistema do playground"
        />
        <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-4 items-start">
          <Field label="Data do relatório">
            <Input type="date" value={dataSessao} onChange={(e) => setDataSessao(e.target.value)} />
          </Field>
          <FileDropzone
            accept=".csv"
            label="Arraste o CSV aqui ou clique para selecionar"
            hint={importarMutation.isPending ? 'Importando...' : 'Um arquivo por dia'}
            onFile={handleImportarCsv}
          />
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Fila de mensagens pendentes"
          subtitle="Visitas importadas que ainda não receberam mensagem"
          action={registros.length > 0 && <Badge status="atencao">{registros.length} pendente(s)</Badge>}
        />

        {pendentesQuery.isLoading ? (
          <LoadingBlock label="Carregando fila..." />
        ) : registros.length === 0 ? (
          <EmptyState
            icon={MessageCircleHeart}
            title="Nenhuma mensagem pendente"
            description="Importe o relatório do dia para gerar a fila de envio."
          />
        ) : (
          <div className="flex flex-col gap-3">
            {registros.map((registro) => (
              <div
                key={registro.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-gray-200 p-4"
              >
                <div>
                  <p className="font-bold text-slate-800">{registro.crianca}</p>
                  <p className="text-sm text-slate-500">Responsável: {registro.cliente}</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {formatDate(registro.dataSessao)} · {registro.tempoTotalMinutos} min no playground
                  </p>
                  {registro.jaContactadoAntes && (
                    <p className="flex items-center gap-1 text-xs text-amber-600 font-bold mt-1">
                      <AlertTriangle size={13} /> Já contactado(a) anteriormente
                    </p>
                  )}
                </div>
                <Button onClick={() => abrirGerarMensagem(registro)}>
                  <MessageCircleHeart size={16} /> Gerar mensagem
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Modal
        open={!!modal}
        onClose={() => setModal(null)}
        title={modal ? `Mensagem para ${modal.registro.cliente}` : ''}
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
              <Button onClick={handleMarcarEnviada} disabled={marcarEnviadaMutation.isPending}>
                <CheckCircle2 size={16} /> {marcarEnviadaMutation.isPending ? 'Aguarde...' : 'Marcar como enviada'}
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
