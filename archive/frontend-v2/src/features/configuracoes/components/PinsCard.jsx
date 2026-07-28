import { useState } from 'react';
import { KeyRound, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import Card, { CardHeader } from '../../../components/ui/Card.jsx';
import Select from '../../../components/ui/Select.jsx';
import Input, { Field } from '../../../components/ui/Input.jsx';
import Button from '../../../components/ui/Button.jsx';
import Badge from '../../../components/ui/Badge.jsx';
import ConfirmDialog from '../../../components/ui/ConfirmDialog.jsx';
import { LoadingBlock } from '../../../components/ui/Spinner.jsx';
import { useColaboradores, usePins, useSalvarPin, useRemoverPin } from '../../../hooks/useConfiguracoes.js';

export default function PinsCard() {
  const colaboradoresQuery = useColaboradores();
  const pinsQuery = usePins();
  const salvarPin = useSalvarPin();
  const removerPin = useRemoverPin();

  const [usuario, setUsuario] = useState('');
  const [pin, setPin] = useState('');
  const [removendo, setRemovendo] = useState(null);

  const colaboradores = colaboradoresQuery.data || [];
  const pins = pinsQuery.data || {};
  const usuariosComPin = Object.keys(pins);

  async function salvar() {
    if (!usuario) {
      toast.error('Selecione um colaborador(a).');
      return;
    }
    if (!/^\d{4,6}$/.test(pin)) {
      toast.error('O PIN deve ter entre 4 e 6 dígitos numéricos.');
      return;
    }
    try {
      await salvarPin.mutateAsync({ usuario, pin });
      toast.success(`PIN de ${usuario} salvo com sucesso.`);
      setPin('');
    } catch (err) {
      toast.error(err.message || 'Erro ao salvar PIN.');
    }
  }

  async function confirmarRemocao() {
    try {
      await removerPin.mutateAsync(removendo);
      toast.success(`PIN de ${removendo} removido.`);
      setRemovendo(null);
    } catch (err) {
      toast.error(err.message || 'Erro ao remover PIN.');
    }
  }

  if (colaboradoresQuery.isLoading || pinsQuery.isLoading) {
    return (
      <Card className="animate-fade-in">
        <CardHeader title="Gestão de PINs" subtitle="Acesso por PIN de cada colaborador(a)" />
        <LoadingBlock label="Carregando..." />
      </Card>
    );
  }

  return (
    <Card className="animate-fade-in">
      <CardHeader title="Gestão de PINs" subtitle="Acesso por PIN de cada colaborador(a) — visível somente para o Owner" />

      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-3 items-end mb-5">
        <Field label="Colaborador(a)">
          <Select value={usuario} onChange={(e) => setUsuario(e.target.value)}>
            <option value="">Selecione...</option>
            {colaboradores.map((c) => (
              <option key={c.nome} value={c.nome}>
                {c.nome}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Novo PIN">
          <Input
            type="password"
            inputMode="numeric"
            maxLength={6}
            className="w-32"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
            placeholder="****"
          />
        </Field>
        <Button onClick={salvar} disabled={salvarPin.isPending}>
          <KeyRound size={16} />
          {salvarPin.isPending ? 'Salvando...' : 'Definir PIN'}
        </Button>
      </div>

      {usuariosComPin.length === 0 ? (
        <p className="text-sm text-slate-500">Nenhum colaborador(a) tem PIN cadastrado ainda.</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {usuariosComPin.map((nome) => (
            <li key={nome} className="flex items-center justify-between py-2.5">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-slate-800">{nome}</span>
                <Badge status="pago">PIN definido</Badge>
              </div>
              <button
                type="button"
                onClick={() => setRemovendo(nome)}
                className="text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-lg p-1.5 transition-colors"
                title="Remover PIN"
              >
                <Trash2 size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={!!removendo}
        onClose={() => setRemovendo(null)}
        onConfirm={confirmarRemocao}
        title="Remover PIN"
        description={`Tem certeza que deseja remover o PIN de "${removendo}"? A pessoa não conseguirá mais entrar até que um novo PIN seja definido.`}
        confirmLabel="Remover"
        danger
        loading={removerPin.isPending}
      />
    </Card>
  );
}
