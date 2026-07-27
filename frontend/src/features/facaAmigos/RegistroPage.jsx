import { useState } from 'react';
import { toast } from 'sonner';
import { Camera, ImageOff, Wallet } from 'lucide-react';
import Card from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import Select from '../../components/ui/Select.jsx';
import Input, { Field, Textarea } from '../../components/ui/Input.jsx';
import Modal from '../../components/ui/Modal.jsx';
import { LoadingBlock } from '../../components/ui/Spinner.jsx';
import CameraCapture from '../../components/CameraCapture.jsx';
import { getCurrentUser } from '../../lib/auth.js';
import { useColaboradoresFa, useCriarRegistroFa, useRegistrosFa } from '../../hooks/useFacaAmigos.js';
import { UNIDADES_FA } from './constants.js';

function agoraDatetimeLocal() {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 16);
}

function mesmoDia(isoA, datetimeLocalB) {
  if (!isoA || !datetimeLocalB) return false;
  return new Date(isoA).toDateString() === new Date(datetimeLocalB).toDateString();
}

const formInicial = (usuario) => ({
  consultor: usuario || '',
  loja: '',
  tipoOperacao: '',
  dataOperacao: agoraDatetimeLocal(),
  fundoCaixa: '',
  valorEnvelope: '',
  valorFaturado: '',
  sangria: '',
  observacoes: '',
});

export default function RegistroPage() {
  const usuarioAtual = getCurrentUser();
  const consultoraDefault = usuarioAtual?.role === 'consultora_fa' ? usuarioAtual.nome : '';
  const colaboradorasQuery = useColaboradoresFa();
  const registrosQuery = useRegistrosFa();
  const criarMutation = useCriarRegistroFa();

  const [form, setForm] = useState(() => formInicial(consultoraDefault));
  const [fotoEnvelope, setFotoEnvelope] = useState(null);
  const [showCamera, setShowCamera] = useState(false);

  const ehFechamento = form.tipoOperacao === 'Fechamento';
  const consultoras = colaboradorasQuery.data || [];

  function setField(campo, valor) {
    setForm((f) => ({ ...f, [campo]: valor }));
  }

  function validar() {
    if (!form.consultor) return 'Selecione a consultora.';
    if (!form.loja) return 'Selecione a loja.';
    if (!form.tipoOperacao) return 'Selecione o tipo de operação.';
    if (!form.dataOperacao) return 'Informe a data e hora.';
    if (form.fundoCaixa === '' || Number.isNaN(Number(form.fundoCaixa))) return 'Informe o fundo de caixa.';
    if (ehFechamento) {
      if (form.valorEnvelope === '' || Number.isNaN(Number(form.valorEnvelope))) return 'Informe o valor do envelope.';
      if (form.valorFaturado === '' || Number.isNaN(Number(form.valorFaturado))) return 'Informe o valor faturado.';
      if (!fotoEnvelope) return 'A foto do envelope é obrigatória no fechamento.';
    }
    const duplicado = (registrosQuery.data || []).some(
      (r) => r.loja === form.loja && r.tipoOperacao === form.tipoOperacao && mesmoDia(r.dataOperacao, form.dataOperacao)
    );
    if (duplicado) return `Já existe um registro de ${form.tipoOperacao} para ${form.loja} nesse dia.`;
    return null;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const erro = validar();
    if (erro) {
      toast.error(erro);
      return;
    }

    const registro = {
      id: crypto.randomUUID(),
      consultor: form.consultor,
      loja: form.loja,
      tipoOperacao: form.tipoOperacao,
      dataOperacao: new Date(form.dataOperacao).toISOString(),
      fundoCaixa: Number(form.fundoCaixa) || 0,
      valorEnvelope: ehFechamento ? Number(form.valorEnvelope) || 0 : null,
      valorFaturado: ehFechamento ? Number(form.valorFaturado) || 0 : null,
      sangria: ehFechamento && form.sangria !== '' ? Number(form.sangria) || 0 : null,
      observacoes: form.observacoes || null,
      fotoEnvelope: ehFechamento ? fotoEnvelope : null,
      status: ehFechamento ? 'aguardando_retirada' : 'aberto',
      dataRetirada: null,
      retiradoPor: null,
      confirmadoPorApp: null,
      autorizadoPor: null,
      mensagemGerada: false,
      criadoEm: new Date().toISOString(),
    };

    try {
      await criarMutation.mutateAsync(registro);
      toast.success(`Registro de ${form.tipoOperacao} salvo com sucesso!`);
      setForm(formInicial(consultoraDefault));
      setFotoEnvelope(null);
    } catch (err) {
      toast.error(err.message || 'Erro ao salvar registro.');
    }
  }

  return (
    <div className="animate-fade-in space-y-6 max-w-3xl">
      <Card gradient="emerald">
        <div className="flex items-center gap-3">
          <div className="rounded-full bg-white/15 p-2.5">
            <Wallet size={22} />
          </div>
          <div>
            <h1 className="text-lg font-bold">Registrar Movimento FaçaAmigos</h1>
            <p className="text-sm text-white/80">Playground Inclusivo e Circuito</p>
          </div>
        </div>
      </Card>

      <Card>
        {colaboradorasQuery.isLoading ? (
          <LoadingBlock label="Carregando consultoras..." />
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Consultora *">
                <Select value={form.consultor} onChange={(e) => setField('consultor', e.target.value)} required>
                  <option value="" disabled>Selecione</option>
                  {consultoras.map((c) => (
                    <option key={c.nome} value={c.nome}>{c.nome}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Loja *">
                <Select value={form.loja} onChange={(e) => setField('loja', e.target.value)} required>
                  <option value="" disabled>Selecione</option>
                  {UNIDADES_FA.map((u) => (
                    <option key={u} value={u}>{u}</option>
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
                      onClick={() => setField('tipoOperacao', tipo)}
                      className={`flex-1 rounded-xl border px-4 py-2.5 text-sm font-bold transition-all duration-300 ${
                        form.tipoOperacao === tipo
                          ? 'bg-emerald-500 border-emerald-500 text-white shadow-lg shadow-emerald-500/20'
                          : 'bg-white border-slate-200 text-slate-600 hover:border-emerald-300'
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
                  onChange={(e) => setField('dataOperacao', e.target.value)}
                  required
                />
              </Field>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Fundo de Caixa (R$) *">
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  placeholder="0,00"
                  value={form.fundoCaixa}
                  onChange={(e) => setField('fundoCaixa', e.target.value)}
                  required
                />
              </Field>
              {ehFechamento && (
                <Field label="Valor do Envelope (R$) *">
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    placeholder="0,00"
                    value={form.valorEnvelope}
                    onChange={(e) => setField('valorEnvelope', e.target.value)}
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
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    placeholder="0,00"
                    value={form.valorFaturado}
                    onChange={(e) => setField('valorFaturado', e.target.value)}
                    required
                  />
                </Field>
                <Field label="Sangria (R$)">
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    placeholder="0,00"
                    value={form.sangria}
                    onChange={(e) => setField('sangria', e.target.value)}
                  />
                </Field>
              </div>
            )}

            <Field label="Observações">
              <Textarea
                rows={2}
                placeholder="Alguma divergência ou observação?"
                value={form.observacoes}
                onChange={(e) => setField('observacoes', e.target.value)}
              />
            </Field>

            {ehFechamento && (
              <Field label="Foto do Envelope * (obrigatório no fechamento)">
                {fotoEnvelope ? (
                  <div className="flex items-center gap-4">
                    <img src={fotoEnvelope} alt="Envelope" className="w-28 h-28 object-cover rounded-xl border border-slate-200" />
                    <div className="flex flex-col gap-2">
                      <Button type="button" variant="outline" size="sm" onClick={() => setShowCamera(true)}>
                        <Camera size={16} /> Refazer foto
                      </Button>
                      <Button type="button" variant="ghost" size="sm" onClick={() => setFotoEnvelope(null)}>
                        <ImageOff size={16} /> Remover
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button type="button" variant="outline" onClick={() => setShowCamera(true)}>
                    <Camera size={16} /> Tirar foto do envelope
                  </Button>
                )}
              </Field>
            )}

            <div className="flex items-center gap-3 pt-2">
              <Button type="submit" variant="secondary" disabled={criarMutation.isPending}>
                {criarMutation.isPending ? 'Salvando...' : 'Salvar Registro'}
              </Button>
            </div>
          </form>
        )}
      </Card>

      <Modal open={showCamera} onClose={() => setShowCamera(false)} title="Foto do Envelope" size="md">
        <CameraCapture
          onCapture={(dataUrl) => {
            setFotoEnvelope(dataUrl);
            setShowCamera(false);
          }}
          onCancel={() => setShowCamera(false)}
        />
      </Modal>
    </div>
  );
}
