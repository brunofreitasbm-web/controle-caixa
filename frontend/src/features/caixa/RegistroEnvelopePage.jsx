import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Camera, Loader2, MessageCircleMore, RotateCcw, Send } from 'lucide-react';
import Card, { CardHeader } from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import Input, { Field, Textarea } from '../../components/ui/Input.jsx';
import Select from '../../components/ui/Select.jsx';
import Modal from '../../components/ui/Modal.jsx';
import CameraCapture from '../../components/CameraCapture.jsx';
import { getCurrentUser } from '../../lib/auth.js';
import { formatBRL } from '../../lib/format.js';
import { abrirWhatsapp } from '../../lib/whatsapp.js';
import {
  LOJAS_CACAU_SHOW,
  mesmoDia,
  montarMensagemAviso,
  toDatetimeLocal,
  useAtualizarRegistro,
  useColaboradores,
  useCriarRegistro,
  useEnviarDivergencia,
  useRegistros,
} from '../../hooks/useCaixa.js';

const CACAU_SHOW_ROLES = ['owner', 'consultora', 'consultora_dashboard'];

function formInicial() {
  return {
    loja: '',
    tipoOperacao: '',
    dataOperacao: toDatetimeLocal(),
    fundoCaixa: '',
    valorEnvelope: '',
    valorFaturado: '',
    sangria: '',
    observacoes: '',
    autorizadoPor: '',
  };
}

function gerarId() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return `r-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function RegistroEnvelopePage() {
  const user = getCurrentUser();
  const isOwnerUser = user?.role === 'owner';

  const registrosQuery = useRegistros();
  const colaboradoresQuery = useColaboradores();
  const criarRegistro = useCriarRegistro();
  const atualizarRegistro = useAtualizarRegistro();
  const enviarDivergencia = useEnviarDivergencia();

  const [consultor, setConsultor] = useState(isOwnerUser ? '' : user?.nome || '');
  const [form, setForm] = useState(formInicial);
  const [foto, setFoto] = useState(null);
  const [cameraAberta, setCameraAberta] = useState(false);
  const [ultimoRegistro, setUltimoRegistro] = useState(null);

  const consultoresDisponiveis = useMemo(
    () => (colaboradoresQuery.data || []).filter((c) => CACAU_SHOW_ROLES.includes(c.role)),
    [colaboradoresQuery.data]
  );

  const ehFechamento = form.tipoOperacao === 'Fechamento';

  function setCampo(campo, valor) {
    setForm((f) => ({ ...f, [campo]: valor }));
  }

  function resetForm() {
    setForm(formInicial());
    setFoto(null);
    if (isOwnerUser) setConsultor('');
  }

  async function handleSubmit(e) {
    e.preventDefault();

    if (!consultor || !form.loja || !form.tipoOperacao || !form.dataOperacao) {
      toast.error('Preencha todos os campos obrigatórios.');
      return;
    }

    const fundoCaixa = Number(form.fundoCaixa);
    if (form.fundoCaixa === '' || Number.isNaN(fundoCaixa)) {
      toast.error('Informe um fundo de caixa válido.');
      return;
    }

    let valorEnvelope = null;
    let valorFaturado = null;
    let sangria = null;
    if (ehFechamento) {
      valorEnvelope = Number(form.valorEnvelope);
      valorFaturado = Number(form.valorFaturado);
      if (form.valorEnvelope === '' || Number.isNaN(valorEnvelope)) {
        toast.error('Informe o valor do envelope.');
        return;
      }
      if (form.valorFaturado === '' || Number.isNaN(valorFaturado)) {
        toast.error('Informe o valor faturado.');
        return;
      }
      if (form.sangria !== '') {
        sangria = Number(form.sangria);
        if (Number.isNaN(sangria)) {
          toast.error('Sangria inválida.');
          return;
        }
      }
      if (!foto) {
        toast.error('A foto do envelope é obrigatória no fechamento.');
        return;
      }
    }

    const dataOperacaoIso = new Date(form.dataOperacao).toISOString();

    const duplicado =
      form.loja !== 'Venda Direta' &&
      (registrosQuery.data || []).some(
        (r) =>
          r.loja === form.loja &&
          r.tipoOperacao === form.tipoOperacao &&
          mesmoDia(r.dataOperacao, dataOperacaoIso)
      );
    if (duplicado) {
      toast.error(`Já existe um registro de ${form.tipoOperacao} para ${form.loja} nesse dia.`);
      return;
    }

    const registro = {
      id: gerarId(),
      consultor,
      loja: form.loja,
      tipoOperacao: form.tipoOperacao,
      dataOperacao: dataOperacaoIso,
      fundoCaixa,
      valorEnvelope: ehFechamento ? valorEnvelope : null,
      valorFaturado: ehFechamento ? valorFaturado : null,
      sangria: ehFechamento ? sangria : null,
      observacoes: form.observacoes || null,
      fotoEnvelope: ehFechamento ? foto : null,
      status: ehFechamento ? 'aguardando_retirada' : 'aberto',
      dataRetirada: null,
      retiradoPor: null,
      confirmadoPorApp: null,
      autorizadoPor: form.autorizadoPor || null,
      mensagemGerada: false,
      criadoEm: new Date().toISOString(),
    };

    try {
      await criarRegistro.mutateAsync({ registro, usuario: user?.nome });
      toast.success(`Registro de ${form.tipoOperacao} salvo para ${form.loja}.`);
      setUltimoRegistro(ehFechamento ? registro : null);

      if (form.tipoOperacao === 'Abertura') {
        const ultimoFechamento = (registrosQuery.data || [])
          .filter((r) => r.loja === form.loja && r.tipoOperacao === 'Fechamento')
          .sort((a, b) => new Date(b.dataOperacao) - new Date(a.dataOperacao))[0];

        if (ultimoFechamento && ultimoFechamento.fundoCaixa !== undefined && ultimoFechamento.fundoCaixa !== null) {
          const diferenca = fundoCaixa - ultimoFechamento.fundoCaixa;
          if (Math.abs(diferenca) > 0.01) {
            toast.warning(
              `Divergência de fundo de caixa em ${form.loja}: abertura ${formatBRL(fundoCaixa)} × último fechamento ${formatBRL(
                ultimoFechamento.fundoCaixa
              )} (diferença de ${formatBRL(Math.abs(diferenca))} ${diferenca > 0 ? 'a mais' : 'a menos'}).`,
              { duration: 8000 }
            );
            enviarDivergencia.mutate({
              loja: form.loja,
              consultor,
              fundoAbertura: fundoCaixa,
              fundoUltimoFechamento: ultimoFechamento.fundoCaixa,
              diferenca,
            });
          }
        }
      }

      resetForm();
    } catch (err) {
      toast.error(err.message || 'Erro ao salvar registro.');
    }
  }

  async function marcarMensagemGerada() {
    if (!ultimoRegistro) return;
    try {
      await atualizarRegistro.mutateAsync({
        id: ultimoRegistro.id,
        campos: { mensagemGerada: true },
        usuario: user?.nome,
      });
      setUltimoRegistro((r) => (r ? { ...r, mensagemGerada: true } : r));
    } catch {
      // não bloqueia o fluxo de aviso caso o marcador falhe
    }
  }

  async function copiarMensagem() {
    try {
      await navigator.clipboard.writeText(montarMensagemAviso(ultimoRegistro));
      toast.success('Mensagem copiada.');
    } catch {
      toast.error('Não foi possível copiar automaticamente. Selecione o texto manualmente.');
    }
    marcarMensagemGerada();
  }

  function abrirNoWhatsapp() {
    abrirWhatsapp('', montarMensagemAviso(ultimoRegistro));
    marcarMensagemGerada();
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <Card>
        <CardHeader title="Registrar Envelope" subtitle="Abertura ou fechamento de caixa das lojas Cacau Show" />

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Consultor *">
              {isOwnerUser ? (
                <Select value={consultor} onChange={(e) => setConsultor(e.target.value)} required>
                  <option value="">Selecione</option>
                  {consultoresDisponiveis.map((c) => (
                    <option key={c.nome} value={c.nome}>
                      {c.nome}
                    </option>
                  ))}
                </Select>
              ) : (
                <Input value={consultor} disabled />
              )}
            </Field>

            <Field label="Loja *">
              <Select value={form.loja} onChange={(e) => setCampo('loja', e.target.value)} required>
                <option value="">Selecione</option>
                {LOJAS_CACAU_SHOW.map((loja) => (
                  <option key={loja} value={loja}>
                    {loja}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Tipo de Operação *">
              <div className="flex gap-2">
                {['Abertura', 'Fechamento'].map((tipo) => (
                  <button
                    key={tipo}
                    type="button"
                    onClick={() => setCampo('tipoOperacao', tipo)}
                    className={`flex-1 rounded-xl border px-3.5 py-2.5 text-sm font-bold transition-all duration-300 ${
                      form.tipoOperacao === tipo
                        ? 'bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-600/20'
                        : 'bg-white border-slate-200 text-slate-600 hover:border-blue-300'
                    }`}
                  >
                    {tipo}
                  </button>
                ))}
              </div>
            </Field>

            <Field label="Data e Hora *">
              <Input
                type="datetime-local"
                value={form.dataOperacao}
                onChange={(e) => setCampo('dataOperacao', e.target.value)}
                required
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Fundo de Caixa (R$) *">
              <Input
                type="number"
                step="0.01"
                inputMode="decimal"
                placeholder="0,00"
                value={form.fundoCaixa}
                onChange={(e) => setCampo('fundoCaixa', e.target.value)}
                required
              />
            </Field>

            {ehFechamento && (
              <Field label="Valor do Envelope (R$) *">
                <Input
                  type="number"
                  step="0.01"
                  inputMode="decimal"
                  placeholder="0,00"
                  value={form.valorEnvelope}
                  onChange={(e) => setCampo('valorEnvelope', e.target.value)}
                  required
                />
              </Field>
            )}
          </div>

          {ehFechamento && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Valor Faturado (R$) *">
                <Input
                  type="number"
                  step="0.01"
                  inputMode="decimal"
                  placeholder="0,00"
                  value={form.valorFaturado}
                  onChange={(e) => setCampo('valorFaturado', e.target.value)}
                  required
                />
              </Field>
              <Field label="Sangria (R$)">
                <Input
                  type="number"
                  step="0.01"
                  inputMode="decimal"
                  placeholder="0,00"
                  value={form.sangria}
                  onChange={(e) => setCampo('sangria', e.target.value)}
                />
              </Field>
            </div>
          )}

          <Field label="Autorizado por (opcional)" hint="Preencha se esta operação precisou de autorização de um gestor.">
            <Input
              value={form.autorizadoPor}
              onChange={(e) => setCampo('autorizadoPor', e.target.value)}
              placeholder="Nome de quem autorizou"
            />
          </Field>

          <Field label="Observações">
            <Textarea
              rows={3}
              value={form.observacoes}
              onChange={(e) => setCampo('observacoes', e.target.value)}
              placeholder="Alguma divergência ou observação?"
            />
          </Field>

          {ehFechamento && (
            <Field label="Foto do Envelope *" hint="Obrigatória no fechamento.">
              {foto ? (
                <div className="flex items-center gap-4">
                  <img src={foto} alt="Foto do envelope" className="w-28 h-28 object-cover rounded-xl border border-slate-200" />
                  <Button type="button" variant="outline" size="sm" onClick={() => setCameraAberta(true)}>
                    <RotateCcw size={14} /> Refazer foto
                  </Button>
                </div>
              ) : (
                <Button type="button" variant="outline" onClick={() => setCameraAberta(true)}>
                  <Camera size={16} /> Tirar foto do envelope
                </Button>
              )}
            </Field>
          )}

          <div className="pt-2">
            <Button type="submit" disabled={criarRegistro.isPending}>
              {criarRegistro.isPending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              {criarRegistro.isPending ? 'Salvando...' : 'Salvar Registro'}
            </Button>
          </div>
        </form>
      </Card>

      {ultimoRegistro && (
        <Card className="border-emerald-200">
          <CardHeader
            title="Gerador de Mensagem WhatsApp"
            subtitle="Copie a mensagem ou abra o WhatsApp direto com o aviso pronto para colar no grupo da loja."
          />
          <Textarea readOnly rows={7} value={montarMensagemAviso(ultimoRegistro)} className="mb-4 font-mono text-xs" />
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" variant="outline" onClick={copiarMensagem}>
              Copiar mensagem
            </Button>
            <Button type="button" variant="secondary" onClick={abrirNoWhatsapp}>
              <MessageCircleMore size={16} /> Abrir no WhatsApp
            </Button>
            {ultimoRegistro.mensagemGerada && (
              <span className="text-xs font-bold text-emerald-600">Mensagem já marcada como enviada ✓</span>
            )}
          </div>
        </Card>
      )}

      <Modal open={cameraAberta} onClose={() => setCameraAberta(false)} title="Foto do Envelope" size="lg">
        <CameraCapture
          onCapture={(dataUrl) => {
            setFoto(dataUrl);
            setCameraAberta(false);
          }}
          onCancel={() => setCameraAberta(false)}
        />
      </Modal>
    </div>
  );
}
