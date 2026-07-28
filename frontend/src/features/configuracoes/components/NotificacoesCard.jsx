import { useEffect, useState } from 'react';
import { Bell, BellOff, Send } from 'lucide-react';
import { toast } from 'sonner';
import Card, { CardHeader } from '../../../components/ui/Card.jsx';
import Input, { Field, Textarea } from '../../../components/ui/Input.jsx';
import Button from '../../../components/ui/Button.jsx';
import Badge from '../../../components/ui/Badge.jsx';
import { api } from '../../../lib/apiClient.js';
import { getCurrentUser } from '../../../lib/auth.js';
import { useNotificarGestao } from '../../../hooks/useConfiguracoes.js';

// Mesmos 4 destinatários que routes/auth.js#EMAIL_MAP conhece para o canal de
// e-mail de "/api/notificar-gestao" — os únicos nomes garantidamente mapeados
// lá. Para push a rota aceita qualquer nome de colaborador(a), mas o teste
// de gestão fica restrito a esse grupo por ser o alvo real do endpoint.
const DESTINATARIOS = [
  { valor: 'bruno', label: 'Bruno' },
  { valor: 'isabella', label: 'Isabella' },
  { valor: 'alexandra', label: 'Alexandra' },
  { valor: 'liderop', label: 'Líder de Operação' },
];

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

export default function NotificacoesCard() {
  const suportado =
    typeof window !== 'undefined' && 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;
  const [inscrito, setInscrito] = useState(false);
  const [ativando, setAtivando] = useState(false);
  const [assunto, setAssunto] = useState('');
  const [mensagem, setMensagem] = useState('');
  const [destinatarios, setDestinatarios] = useState([]);
  const notificarGestao = useNotificarGestao();

  useEffect(() => {
    if (!suportado) return;
    navigator.serviceWorker
      .getRegistration()
      .then(async (reg) => {
        if (!reg) return;
        const sub = await reg.pushManager.getSubscription();
        setInscrito(!!sub);
      })
      .catch(() => {});
  }, [suportado]);

  async function ativarPush() {
    if (!suportado) {
      toast.error('Este navegador não suporta notificações push.');
      return;
    }
    setAtivando(true);
    try {
      const permissao = await Notification.requestPermission();
      if (permissao !== 'granted') {
        toast.error('Permissão de notificações negada no navegador.');
        return;
      }
      const reg = await navigator.serviceWorker.register('/sw.js');
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        const vapidKey = await api.get('/api/vapidPublicKey');
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidKey),
        });
      }
      await api.post('/api/subscribe', { subscription: sub, usuario: getCurrentUser()?.nome });
      setInscrito(true);
      toast.success('Notificações push ativadas neste dispositivo.');
    } catch (err) {
      toast.error(err.message || 'Não foi possível ativar as notificações.');
    } finally {
      setAtivando(false);
    }
  }

  function alternarDestinatario(valor) {
    setDestinatarios((prev) => (prev.includes(valor) ? prev.filter((d) => d !== valor) : [...prev, valor]));
  }

  async function enviarTeste() {
    if (destinatarios.length === 0) {
      toast.error('Selecione ao menos um destinatário.');
      return;
    }
    if (!assunto.trim() || !mensagem.trim()) {
      toast.error('Preencha assunto e mensagem.');
      return;
    }
    try {
      await notificarGestao.mutateAsync({ destinatarios, assunto, mensagem });
      toast.success('Notificação de teste enviada para a gestão.');
      setAssunto('');
      setMensagem('');
    } catch (err) {
      toast.error(err.message || 'Erro ao enviar notificação.');
    }
  }

  return (
    <Card className="animate-fade-in">
      <CardHeader title="Notificações" subtitle="Push do navegador e aviso de teste para a gestão" />

      <div className="flex items-center justify-between gap-4 p-4 rounded-xl bg-slate-50 border border-slate-200 mb-5">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-full ${inscrito ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-200 text-slate-500'}`}>
            {inscrito ? <Bell size={18} /> : <BellOff size={18} />}
          </div>
          <div>
            <p className="text-sm font-bold text-slate-800">Notificações push neste dispositivo</p>
            <p className="text-xs text-slate-500">
              {!suportado ? 'Não suportado neste navegador.' : inscrito ? 'Ativadas.' : 'Ainda não ativadas.'}
            </p>
          </div>
        </div>
        {suportado && !inscrito && (
          <Button size="sm" onClick={ativarPush} disabled={ativando}>
            {ativando ? 'Ativando...' : 'Ativar'}
          </Button>
        )}
        {inscrito && <Badge status="pago">Ativas</Badge>}
      </div>

      <p className="text-xs font-bold uppercase text-slate-500 mb-2">Testar aviso para a gestão</p>
      <div className="flex flex-wrap gap-2 mb-3">
        {DESTINATARIOS.map((d) => (
          <button
            key={d.valor}
            type="button"
            onClick={() => alternarDestinatario(d.valor)}
            className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${
              destinatarios.includes(d.valor)
                ? 'bg-blue-600 border-blue-600 text-white'
                : 'bg-white border-slate-200 text-slate-600 hover:border-blue-300'
            }`}
          >
            {d.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3">
        <Field label="Assunto">
          <Input value={assunto} onChange={(e) => setAssunto(e.target.value)} placeholder="Ex.: Teste de notificação" />
        </Field>
        <Field label="Mensagem">
          <Textarea rows={3} value={mensagem} onChange={(e) => setMensagem(e.target.value)} placeholder="Escreva a mensagem de teste..." />
        </Field>
      </div>

      <div className="flex justify-end mt-3">
        <Button onClick={enviarTeste} disabled={notificarGestao.isPending}>
          <Send size={16} />
          {notificarGestao.isPending ? 'Enviando...' : 'Enviar aviso'}
        </Button>
      </div>
    </Card>
  );
}
