import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import Modal from '../../../components/ui/Modal.jsx';
import Button from '../../../components/ui/Button.jsx';
import Input, { Field } from '../../../components/ui/Input.jsx';
import Select from '../../../components/ui/Select.jsx';
import { LOJAS_RH, DISC_COLORS, DISC_LABELS } from '../discProfiles.js';
import { ROLES } from '../../../lib/auth.js';

const ROLE_OPTIONS = [
  { value: ROLES.CONSULTORA, label: 'Consultora' },
  { value: ROLES.CONSULTORA_DASHBOARD, label: 'Líder de Operações' },
  { value: ROLES.CONSULTORA_FA, label: 'Consultora Faça Amigos' },
  { value: ROLES.OWNER, label: 'Owner' },
];

// Cadastro de um(a) novo(a) colaborador(a) a partir de um laudo DISC em PDF
// que não bateu com ninguém já cadastrado — pede nome, unidade e perfil de
// acesso antes de criar o registro (mesmo fluxo do app antigo).
export default function CadastroViaDiscModal({ open, onClose, valoresDisc, nomeDetectado, onConfirm, saving }) {
  const [nome, setNome] = useState('');
  const [unidade, setUnidade] = useState('');
  const [role, setRole] = useState('');

  useEffect(() => {
    if (open) {
      setNome(nomeDetectado || '');
      setUnidade('');
      setRole('');
    }
  }, [open, nomeDetectado]);

  function confirmar() {
    if (!nome.trim()) {
      toast.error('Informe o nome do colaborador.');
      return;
    }
    if (!unidade) {
      toast.error('Selecione a unidade/loja.');
      return;
    }
    if (!role) {
      toast.error('Selecione o perfil de acesso.');
      return;
    }
    onConfirm({ nome: nome.trim(), unidade, role });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Cadastrar colaborador(a) a partir do laudo DISC"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={confirmar} disabled={saving}>
            {saving ? 'Cadastrando...' : 'Confirmar cadastro'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="rounded-xl bg-slate-50 p-3 flex flex-wrap gap-3 text-xs font-bold">
          {['d', 'i', 's', 'c'].map((k) => (
            <span key={k} style={{ color: DISC_COLORS[k] }}>
              {DISC_LABELS[k]}: {valoresDisc?.[k] ?? 0}%
            </span>
          ))}
        </div>
        <Field label="Nome completo">
          <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome detectado no laudo" />
        </Field>
        <Field label="Unidade / Loja">
          <Select value={unidade} onChange={(e) => setUnidade(e.target.value)}>
            <option value="">Selecione...</option>
            {Object.entries(LOJAS_RH).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Perfil de acesso">
          <Select value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="">Selecione...</option>
            {ROLE_OPTIONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
    </Modal>
  );
}
