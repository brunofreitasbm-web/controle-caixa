import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { CircleCheck, CircleX, Fingerprint, LogIn, LogOut, Mail, MapPin, PauseCircle, PlayCircle, RefreshCw } from 'lucide-react';
import Card, { CardHeader } from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Table, { Td, Tr } from '../../components/ui/Table.jsx';
import Select from '../../components/ui/Select.jsx';
import Modal from '../../components/ui/Modal.jsx';
import Input, { Field, Textarea } from '../../components/ui/Input.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import { LoadingBlock } from '../../components/ui/Spinner.jsx';
import { formatDateTime } from '../../lib/format.js';
import { getCurrentUser, isLiderOperacao, isOwner } from '../../lib/auth.js';
import { getPosition, dentroDaCerca } from '../../lib/geo.js';
import {
  useBiometriaSalva,
  useConfigGeral,
  useEnviarFolhaPontoEmail,
  useHistoricoPonto,
  useRelatorioPonto,
  useSincronizarPonto,
  useSolicitarAjustePonto,
  getOperacoesParaUsuario,
  parseConfigOperacoes,
  OPERACOES_CACAU_SHOW,
  OPERACOES_FACA_AMIGOS,
} from '../../hooks/usePonto.js';
import BiometriaCapture from './components/BiometriaCapture.jsx';
import { calcularHashSha256, gerarEspelhoPontoPdf } from './pdfEspelho.js';

const TIPOS = [
  { tipo: 'ENTRADA', label: 'Entrada', icon: LogIn, gradient: 'emerald' },
  { tipo: 'SAIDA_INTERVALO', label: 'Saída p/ Intervalo', icon: PauseCircle, gradient: 'amber' },
  { tipo: 'RETORNO_INTERVALO', label: 'Retorno do Intervalo', icon: PlayCircle, gradient: 'blue' },
  { tipo: 'SAIDA', label: 'Saída', icon: LogOut, gradient: 'rose' },
];

const TIPO_LABEL = {
  ENTRADA: 'Entrada',
  SAIDA_INTERVALO: 'Saída p/ Intervalo',
  RETORNO_INTERVALO: 'Retorno do Intervalo',
  SAIDA: 'Saída',
};

const AJUSTE_VAZIO = { data: '', tipo: 'ENTRADA', motivo: '', comprovante: null };

function comprimirImagem(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const MAX_WIDTH = 1200;
        let { width, height } = img;
        if (width > MAX_WIDTH) {
          height = Math.round((height * MAX_WIDTH) / width);
          width = MAX_WIDTH;
        }
        canvas.width = width;
        canvas.height = height;
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  });
}

export default function ControlePontoPage() {
  const user = getCurrentUser();
  const operacoesDisponiveis = getOperacoesParaUsuario(user);
  const podeVerRelatorio = isLiderOperacao(user) || isOwner(user);

  const [operacao, setOperacao] = useState(operacoesDisponiveis[0]);
  const [pos, setPos] = useState(null);
  const [posErro, setPosErro] = useState(null);
  const [buscandoPos, setBuscandoPos] = useState(false);
  const [capturaTipo, setCapturaTipo] = useState(null);
  const [ajusteForm, setAjusteForm] = useState(AJUSTE_VAZIO);
  const [relatorioOperacao, setRelatorioOperacao] = useState('todas');
  const [enviandoFolha, setEnviandoFolha] = useState(false);

  const configQuery = useConfigGeral();
  const biometriaQuery = useBiometriaSalva(user?.nome);
  const historicoQuery = useHistoricoPonto(user?.nome);
  const relatorioQuery = useRelatorioPonto(relatorioOperacao, podeVerRelatorio);
  const sincronizarMutation = useSincronizarPonto();
  const ajusteMutation = useSolicitarAjustePonto();
  const folhaEmailMutation = useEnviarFolhaPontoEmail();

  async function atualizarPosicao() {
    setBuscandoPos(true);
    setPosErro(null);
    try {
      const p = await getPosition();
      setPos(p);
    } catch (err) {
      setPosErro(err.message || 'Não foi possível obter sua localização.');
    } finally {
      setBuscandoPos(false);
    }
  }

  useEffect(() => {
    atualizarPosicao();
    const interval = setInterval(atualizarPosicao, 20000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [operacao]);

  const { raio, geoloc } = parseConfigOperacoes(configQuery.data || {});
  const storeLoc = geoloc[operacao] || geoloc.Marambaia;
  const cerca = pos && storeLoc ? dentroDaCerca(pos, { ...storeLoc, raio }) : null;
  const dentroDoPerimetro = cerca === true || cerca?.dentro;
  const precisaoOk = !pos || pos.accuracy <= 30;

  function iniciarMarcacao(tipo) {
    if (!pos) {
      toast.error('Aguarde a obtenção da localização GPS antes de bater ponto.');
      return;
    }
    if (!precisaoOk) {
      toast.error('Precisão do GPS insuficiente. Mova-se para um local aberto e tente novamente.');
      return;
    }
    if (!dentroDoPerimetro) {
      const distancia = cerca?.distancia ? Math.round(cerca.distancia) : '—';
      toast.error(`Marcação bloqueada: você está fora da cerca virtual (distância: ${distancia}m).`);
      return;
    }
    setCapturaTipo(tipo);
  }

  async function finalizarMarcacao({ descriptor: _descriptor, photoDataUrl }) {
    const tipo = capturaTipo;
    setCapturaTipo(null);
    try {
      const registros = (historicoQuery.data?.registros || []).slice().sort((a, b) => a.timestamp.localeCompare(b.timestamp));
      const prevHash = registros.at(-1)?.hash || '0'.repeat(64);
      const timestamp = new Date().toISOString();
      const rawString = `${user.nome}_${timestamp}_${tipo}_${pos.lat}_${pos.lng}_${prevHash}`;
      const hash = await calcularHashSha256(rawString);

      const record = {
        id: `${user.nome}_${Date.now()}`,
        usuario: user.nome,
        timestamp,
        tipo,
        operacao,
        gps: `${pos.lat.toFixed(5)},${pos.lng.toFixed(5)}`,
        accuracy: pos.accuracy,
        photo: photoDataUrl,
        hash,
      };
      await sincronizarMutation.mutateAsync(record);
      toast.success(`${TIPO_LABEL[tipo]} registrada às ${new Date(timestamp).toLocaleTimeString('pt-BR')}!`);
    } catch (err) {
      toast.error(err.message || 'Erro ao sincronizar marcação de ponto.');
    }
  }

  function biometriaCadastradaOuEnrolada() {
    biometriaQuery.refetch();
  }

  async function enviarAjuste(e) {
    e.preventDefault();
    if (!ajusteForm.data || !ajusteForm.tipo) {
      toast.error('Informe a data e o tipo da marcação a ajustar.');
      return;
    }
    try {
      await ajusteMutation.mutateAsync({
        id: `${user.nome}_ajuste_${Date.now()}`,
        usuario: user.nome,
        data: ajusteForm.data,
        tipo: ajusteForm.tipo,
        motivo: ajusteForm.motivo,
        comprovante: ajusteForm.comprovante,
      });
      toast.success('Solicitação de ajuste enviada com sucesso!');
      setAjusteForm(AJUSTE_VAZIO);
    } catch (err) {
      toast.error(err.message || 'Erro ao enviar solicitação de ajuste.');
    }
  }

  async function enviarFolhaPorEmail() {
    const emailContador = configQuery.data?.contadorEmail;
    if (!emailContador) {
      toast.error("Nenhum e-mail de contador cadastrado. Configure em Configurações → Dados do Contador.");
      return;
    }
    setEnviandoFolha(true);
    try {
      const registros = historicoQuery.data?.registros || [];
      const { doc, nomeArquivo } = await gerarEspelhoPontoPdf({ colaborador: user, registros });
      const pdfBase64 = doc.output('datauristring');
      const mesReferencia = new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
      await folhaEmailMutation.mutateAsync({
        email: emailContador,
        assunto: `Folha de Ponto — ${user.nome} — ${mesReferencia}`,
        mensagem: `Olá! Segue em anexo a folha de ponto de ${user.nome} referente a ${mesReferencia}.`,
        pdfBase64,
        nomeArquivo,
        remetente: user.nome,
      });
      toast.success(`Folha de ponto enviada para ${emailContador}!`);
    } catch (err) {
      toast.error(err.message || 'Não foi possível enviar a folha de ponto por e-mail.');
    } finally {
      setEnviandoFolha(false);
    }
  }

  const registros = (historicoQuery.data?.registros || []).slice().sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  const ajustes = historicoQuery.data?.ajustes || [];
  const temBiometria = !!biometriaQuery.data?.embedding;

  return (
    <div className="animate-fade-in space-y-4">
      <Card>
        <CardHeader
          title="Controle de Ponto"
          subtitle="Marcação com biometria facial e geolocalização."
          action={
            <Select value={operacao} onChange={(e) => setOperacao(e.target.value)} className="w-56">
              {operacoesDisponiveis.map((op) => (
                <option key={op} value={op}>
                  {op}
                </option>
              ))}
            </Select>
          }
        />

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
          <div className="rounded-xl bg-slate-50 p-3 flex items-center gap-3">
            <MapPin size={18} className={dentroDoPerimetro ? 'text-emerald-500' : 'text-rose-500'} />
            <div className="min-w-0">
              <p className="text-xs font-bold text-slate-500">Localização</p>
              <p className="text-xs text-slate-700 truncate">
                {buscandoPos && !pos
                  ? 'Obtendo GPS...'
                  : posErro
                    ? posErro
                    : cerca && typeof cerca === 'object'
                      ? `${Math.round(cerca.distancia)}m da loja (raio ${cerca.raio}m)`
                      : 'Sem restrição de área'}
              </p>
            </div>
          </div>
          <div className="rounded-xl bg-slate-50 p-3 flex items-center gap-3">
            {dentroDoPerimetro ? <CircleCheck size={18} className="text-emerald-500" /> : <CircleX size={18} className="text-rose-500" />}
            <div>
              <p className="text-xs font-bold text-slate-500">Cerca virtual</p>
              <p className="text-xs text-slate-700">{dentroDoPerimetro ? 'Dentro do perímetro' : 'Fora do perímetro'}</p>
            </div>
          </div>
          <div className="rounded-xl bg-slate-50 p-3 flex items-center gap-3">
            <Fingerprint size={18} className={temBiometria ? 'text-emerald-500' : 'text-amber-500'} />
            <div className="flex-1">
              <p className="text-xs font-bold text-slate-500">Biometria facial</p>
              <p className="text-xs text-slate-700">{temBiometria ? 'Cadastrada' : 'Será cadastrada na 1ª marcação'}</p>
            </div>
            <button type="button" onClick={atualizarPosicao} className="text-slate-400 hover:text-blue-600" title="Atualizar GPS">
              <RefreshCw size={14} className={buscandoPos ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {TIPOS.map(({ tipo, label, icon: Icon, gradient }) => (
            <Card key={tipo} gradient={gradient} className="cursor-pointer" onClick={() => iniciarMarcacao(tipo)}>
              <button type="button" className="w-full flex flex-col items-center gap-2 text-center">
                <Icon size={22} />
                <span className="text-sm font-bold">{label}</span>
              </button>
            </Card>
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader title="Meu histórico de marcações" />
        {historicoQuery.isLoading ? (
          <LoadingBlock label="Carregando histórico..." />
        ) : registros.length === 0 ? (
          <EmptyState title="Nenhuma marcação ainda" description="Suas marcações de ponto aparecerão aqui." />
        ) : (
          <Table columns={['Data/Hora', 'Tipo', 'Operação', 'Precisão GPS']}>
            {registros.map((r) => (
              <Tr key={r.id}>
                <Td>{formatDateTime(r.timestamp)}</Td>
                <Td>
                  <Badge status="info">{TIPO_LABEL[r.tipo] || r.tipo}</Badge>
                </Td>
                <Td>{r.operacao || '—'}</Td>
                <Td>{r.accuracy ? `${Math.round(r.accuracy)}m` : '—'}</Td>
              </Tr>
            ))}
          </Table>
        )}

        {ajustes.length > 0 && (
          <div className="mt-6">
            <h4 className="text-sm font-bold text-slate-700 mb-2">Ajustes solicitados</h4>
            <Table columns={['Data', 'Tipo', 'Motivo', 'Status']}>
              {ajustes.map((a) => (
                <Tr key={a.id}>
                  <Td>{a.data}</Td>
                  <Td>{TIPO_LABEL[a.tipo] || a.tipo}</Td>
                  <Td className="max-w-xs truncate">{a.motivo || '—'}</Td>
                  <Td>
                    <Badge status={a.status === 'APPROVED' ? 'pago' : a.status === 'REJECTED' ? 'urgente' : 'pendente'}>
                      {a.status === 'PENDING' ? 'Pendente' : a.status}
                    </Badge>
                  </Td>
                </Tr>
              ))}
            </Table>
          </div>
        )}
      </Card>

      <Card>
        <CardHeader title="Solicitar ajuste manual" subtitle="Esqueceu de bater um ponto? Solicite o ajuste com um comprovante." />
        <form onSubmit={enviarAjuste} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Data">
            <Input type="date" value={ajusteForm.data} onChange={(e) => setAjusteForm((f) => ({ ...f, data: e.target.value }))} required />
          </Field>
          <Field label="Tipo de marcação">
            <Select value={ajusteForm.tipo} onChange={(e) => setAjusteForm((f) => ({ ...f, tipo: e.target.value }))}>
              {TIPOS.map((t) => (
                <option key={t.tipo} value={t.tipo}>
                  {t.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Motivo" className="md:col-span-2">
            <Textarea
              rows={3}
              value={ajusteForm.motivo}
              onChange={(e) => setAjusteForm((f) => ({ ...f, motivo: e.target.value }))}
              placeholder="Explique o motivo do ajuste"
            />
          </Field>
          <Field label="Comprovante (opcional)" className="md:col-span-2">
            <Input
              type="file"
              accept="image/*"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const base64 = await comprimirImagem(file);
                setAjusteForm((f) => ({ ...f, comprovante: base64 }));
              }}
            />
          </Field>
          <div className="md:col-span-2">
            <Button type="submit" disabled={ajusteMutation.isPending}>
              {ajusteMutation.isPending ? 'Enviando...' : 'Enviar solicitação'}
            </Button>
          </div>
        </form>
      </Card>

      {podeVerRelatorio && (
        <Card>
          <CardHeader
            title="Relatório administrativo"
            subtitle="Marcações de todas as colaboradoras."
            action={
              <div className="flex items-center gap-2">
                <Select value={relatorioOperacao} onChange={(e) => setRelatorioOperacao(e.target.value)} className="w-48">
                  <option value="todas">Todas as operações</option>
                  {[...OPERACOES_CACAU_SHOW, ...OPERACOES_FACA_AMIGOS].map((op) => (
                    <option key={op} value={op}>
                      {op}
                    </option>
                  ))}
                </Select>
                <Button variant="outline" onClick={enviarFolhaPorEmail} disabled={enviandoFolha}>
                  <Mail size={16} /> {enviandoFolha ? 'Enviando...' : 'Enviar minha folha por e-mail'}
                </Button>
              </div>
            }
          />
          {relatorioQuery.isLoading ? (
            <LoadingBlock label="Carregando relatório..." />
          ) : (relatorioQuery.data?.registros || []).length === 0 ? (
            <EmptyState title="Nenhuma marcação encontrada" />
          ) : (
            <Table columns={['Colaborador(a)', 'Data/Hora', 'Tipo', 'Operação', 'Desvio (min)']}>
              {(relatorioQuery.data?.registros || []).map((r) => (
                <Tr key={r.id}>
                  <Td className="font-bold text-slate-800">{r.usuario}</Td>
                  <Td>{formatDateTime(r.timestamp)}</Td>
                  <Td>
                    <Badge status="info">{TIPO_LABEL[r.tipo] || r.tipo}</Badge>
                  </Td>
                  <Td>{r.operacao || '—'}</Td>
                  <Td>{r.audit_deviation !== undefined && r.audit_deviation !== null ? Math.round(r.audit_deviation) : '—'}</Td>
                </Tr>
              ))}
            </Table>
          )}
        </Card>
      )}

      <Modal
        open={!!capturaTipo}
        onClose={() => setCapturaTipo(null)}
        title={`${TIPO_LABEL[capturaTipo] || ''} — ${operacao}`}
        size="sm"
      >
        {capturaTipo && (
          <BiometriaCapture
            usuario={user.nome}
            savedEmbedding={biometriaQuery.data?.embedding}
            onEnrolled={(result) => {
              biometriaCadastradaOuEnrolada();
              finalizarMarcacao(result);
            }}
            onVerified={finalizarMarcacao}
            onCancel={() => setCapturaTipo(null)}
          />
        )}
      </Modal>
    </div>
  );
}
