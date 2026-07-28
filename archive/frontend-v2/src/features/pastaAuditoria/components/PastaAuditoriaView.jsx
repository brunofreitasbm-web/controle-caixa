import { useState } from 'react';
import { toast } from 'sonner';
import { FolderLock, Upload, Download, Pencil, Trash2, Plus, Sparkles } from 'lucide-react';
import Card, { CardHeader } from '../../../components/ui/Card.jsx';
import Button from '../../../components/ui/Button.jsx';
import Badge from '../../../components/ui/Badge.jsx';
import Modal from '../../../components/ui/Modal.jsx';
import ConfirmDialog from '../../../components/ui/ConfirmDialog.jsx';
import EmptyState from '../../../components/ui/EmptyState.jsx';
import { LoadingBlock } from '../../../components/ui/Spinner.jsx';
import Table, { Tr, Td } from '../../../components/ui/Table.jsx';
import Select from '../../../components/ui/Select.jsx';
import Input, { Field, Textarea } from '../../../components/ui/Input.jsx';
import FileDropzone from '../../../components/FileDropzone.jsx';
import { getCurrentUser, isOwner } from '../../../lib/auth.js';
import { formatDate } from '../../../lib/format.js';
import {
  useAuditoriaDocs,
  useCriarDocumentoAuditoria,
  useEditarDocumentoAuditoria,
  useApagarDocumentoAuditoria,
  baixarDocumentoAuditoria,
  lerArquivoComoDataUrl,
} from '../../../hooks/useAuditoriaDocs.js';
import { PASTA_AUDITORIA_UNIDADES, CATEGORIAS_AUDITORIA } from '../unidades.js';

function situacaoVencimento(dataVencimento) {
  if (!dataVencimento) return null;
  const hoje = new Date().toISOString().slice(0, 10);
  const em30Dias = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  if (dataVencimento < hoje) return 'vencido';
  if (dataVencimento <= em30Dias) return 'atencao';
  return null;
}

const FORM_VAZIO = {
  unidade: '',
  categoria: 'CNPJ',
  categoriaOutro: '',
  dataVencimento: '',
  observacoes: '',
};

export default function PastaAuditoriaView({ negocio, title, subtitle }) {
  const user = getCurrentUser();
  const podeEditar = isOwner(user);
  const unidades = PASTA_AUDITORIA_UNIDADES[negocio] || [];

  const [filtros, setFiltros] = useState({ unidade: '', categoria: '', vencimento: '' });
  const [modalAberto, setModalAberto] = useState(false);
  const [editando, setEditando] = useState(null); // doc sendo editado, ou null = criando
  const [form, setForm] = useState(FORM_VAZIO);
  const [arquivo, setArquivo] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [paraApagar, setParaApagar] = useState(null);

  const docsQuery = useAuditoriaDocs(negocio, filtros);
  const criarMutation = useCriarDocumentoAuditoria(negocio);
  const editarMutation = useEditarDocumentoAuditoria(negocio);
  const apagarMutation = useApagarDocumentoAuditoria(negocio);

  const docs = docsQuery.data || [];

  function abrirModalNovo() {
    setEditando(null);
    setForm(FORM_VAZIO);
    setArquivo(null);
    setModalAberto(true);
  }

  function abrirModalEditar(doc) {
    setEditando(doc);
    setForm({
      unidade: doc.unidade || '',
      categoria: doc.categoria || 'CNPJ',
      categoriaOutro: doc.categoriaOutro || '',
      dataVencimento: doc.dataVencimento || '',
      observacoes: doc.observacoes || '',
    });
    setArquivo(null);
    setModalAberto(true);
  }

  function fecharModal() {
    setModalAberto(false);
    setEditando(null);
  }

  async function handleSalvar(e) {
    e.preventDefault();
    if (!editando && !arquivo) {
      toast.error('Selecione um arquivo para enviar.');
      return;
    }

    setEnviando(true);
    try {
      const payload = {
        actorUsuario: user?.nome,
        negocio,
        unidade: form.unidade || null,
        categoria: form.categoria,
        categoriaOutro: form.categoria === 'Outro' ? form.categoriaOutro : null,
        dataVencimento: form.dataVencimento || null,
        observacoes: form.observacoes || null,
      };

      if (arquivo) {
        payload.conteudo = await lerArquivoComoDataUrl(arquivo);
        payload.nomeArquivo = arquivo.name;
        payload.mimeType = arquivo.type;
      }

      if (editando) {
        await editarMutation.mutateAsync({ id: editando.id, ...payload });
        toast.success('Documento atualizado.');
      } else {
        payload.id = crypto.randomUUID();
        await criarMutation.mutateAsync(payload);
        toast.success('Documento enviado.');
      }
      fecharModal();
    } catch (err) {
      toast.error(err.message || 'Não foi possível salvar o documento.');
    } finally {
      setEnviando(false);
    }
  }

  async function handleBaixar(doc) {
    try {
      await baixarDocumentoAuditoria(doc);
    } catch (err) {
      toast.error(err.message || 'Não foi possível abrir o documento.');
    }
  }

  async function handleApagar() {
    if (!paraApagar) return;
    try {
      await apagarMutation.mutateAsync(paraApagar.id);
      toast.success('Documento apagado.');
      setParaApagar(null);
    } catch (err) {
      toast.error(err.message || 'Não foi possível apagar o documento.');
    }
  }

  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      <Card>
        <CardHeader
          title={title}
          subtitle={subtitle}
          action={
            <Button onClick={abrirModalNovo}>
              <Plus size={16} /> Enviar documento
            </Button>
          }
        />

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
          <Select value={filtros.unidade} onChange={(e) => setFiltros((f) => ({ ...f, unidade: e.target.value }))}>
            <option value="">Todas as unidades</option>
            {unidades.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </Select>
          <Select value={filtros.categoria} onChange={(e) => setFiltros((f) => ({ ...f, categoria: e.target.value }))}>
            <option value="">Todas as categorias</option>
            {CATEGORIAS_AUDITORIA.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
          <Select value={filtros.vencimento} onChange={(e) => setFiltros((f) => ({ ...f, vencimento: e.target.value }))}>
            <option value="">Qualquer vencimento</option>
            <option value="vencidos">Vencidos</option>
            <option value="30dias">Vencem em 30 dias</option>
          </Select>
        </div>

        {docsQuery.isLoading ? (
          <LoadingBlock label="Carregando documentos..." />
        ) : docs.length === 0 ? (
          <EmptyState icon={FolderLock} title="Nenhum documento nesta pasta ainda" description="Envie o primeiro documento para começar." />
        ) : (
          <Table columns={['Arquivo', 'Categoria', 'Unidade', 'Vencimento', 'Enviado por', 'Ações']}>
            {docs.map((doc) => {
              const situacao = situacaoVencimento(doc.dataVencimento);
              const categoriaLabel = doc.categoria === 'Outro' && doc.categoriaOutro ? doc.categoriaOutro : doc.categoria;
              return (
                <Tr key={doc.id}>
                  <Td className="max-w-[220px] truncate">{doc.nomeArquivo || '(sem nome)'}</Td>
                  <Td>{categoriaLabel}</Td>
                  <Td>{doc.unidade || 'Geral'}</Td>
                  <Td>
                    {doc.dataVencimento ? (
                      <span className="flex items-center gap-1">
                        <Badge status={situacao === 'vencido' ? 'vencido' : situacao === 'atencao' ? 'atencao' : 'neutro'}>
                          {formatDate(doc.dataVencimento)}
                        </Badge>
                        {!!doc.vencimentoSugeridoIA && (
                          <span title="Sugerido pela IA, confira a data">
                            <Sparkles size={13} className="text-violet-400" />
                          </span>
                        )}
                      </span>
                    ) : (
                      '—'
                    )}
                  </Td>
                  <Td>{doc.enviadoPor || '—'}</Td>
                  <Td>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        title="Baixar"
                        onClick={() => handleBaixar(doc)}
                        className="text-blue-600 hover:text-blue-700"
                      >
                        <Download size={16} />
                      </button>
                      {podeEditar && (
                        <>
                          <button
                            type="button"
                            title="Editar"
                            onClick={() => abrirModalEditar(doc)}
                            className="text-slate-500 hover:text-slate-700"
                          >
                            <Pencil size={16} />
                          </button>
                          <button
                            type="button"
                            title="Apagar"
                            onClick={() => setParaApagar(doc)}
                            className="text-rose-500 hover:text-rose-600"
                          >
                            <Trash2 size={16} />
                          </button>
                        </>
                      )}
                    </div>
                  </Td>
                </Tr>
              );
            })}
          </Table>
        )}
      </Card>

      <Modal
        open={modalAberto}
        onClose={fecharModal}
        title={editando ? 'Editar documento' : 'Enviar documento'}
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={fecharModal} disabled={enviando}>
              Cancelar
            </Button>
            <Button onClick={handleSalvar} disabled={enviando}>
              <Upload size={16} /> {enviando ? 'Enviando...' : editando ? 'Salvar alterações' : 'Enviar'}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <FileDropzone
            accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
            label={editando ? 'Substituir arquivo (opcional)' : 'Arraste o documento aqui ou clique para selecionar'}
            hint="PDF, imagem ou Word"
            onFile={setArquivo}
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Unidade">
              <Select value={form.unidade} onChange={(e) => setForm((f) => ({ ...f, unidade: e.target.value }))}>
                <option value="">Geral (não específico de uma unidade)</option>
                {unidades.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Categoria">
              <Select value={form.categoria} onChange={(e) => setForm((f) => ({ ...f, categoria: e.target.value }))}>
                {CATEGORIAS_AUDITORIA.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          {form.categoria === 'Outro' && (
            <Field label="Qual categoria?">
              <Input
                value={form.categoriaOutro}
                onChange={(e) => setForm((f) => ({ ...f, categoriaOutro: e.target.value }))}
                placeholder="Descreva a categoria do documento"
              />
            </Field>
          )}

          <Field label="Data de vencimento" hint="Deixe em branco se não houver vencimento. Para PDFs, a IA pode sugerir uma data.">
            <Input
              type="date"
              value={form.dataVencimento}
              onChange={(e) => setForm((f) => ({ ...f, dataVencimento: e.target.value }))}
            />
          </Field>

          <Field label="Observações">
            <Textarea
              rows={3}
              value={form.observacoes}
              onChange={(e) => setForm((f) => ({ ...f, observacoes: e.target.value }))}
            />
          </Field>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!paraApagar}
        onClose={() => setParaApagar(null)}
        onConfirm={handleApagar}
        title="Apagar documento"
        description={`Apagar "${paraApagar?.nomeArquivo || paraApagar?.categoria}" definitivamente? Esta ação não pode ser desfeita.`}
        confirmLabel="Apagar"
        danger
        loading={apagarMutation.isPending}
      />
    </div>
  );
}
