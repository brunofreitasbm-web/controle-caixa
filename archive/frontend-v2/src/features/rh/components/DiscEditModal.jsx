import { useEffect, useState } from 'react';
import Modal from '../../../components/ui/Modal.jsx';
import Button from '../../../components/ui/Button.jsx';
import { Field } from '../../../components/ui/Input.jsx';
import Input from '../../../components/ui/Input.jsx';
import Select from '../../../components/ui/Select.jsx';
import { LOJAS_RH, calcularPerfilPredominante } from '../discProfiles.js';

const VALORES_INICIAIS = { d: 25, i: 25, s: 25, c: 25, store: 'all' };

export default function DiscEditModal({ open, onClose, userName, profile, onSave, saving }) {
  const [valores, setValores] = useState(VALORES_INICIAIS);

  useEffect(() => {
    if (open) {
      setValores({
        d: profile?.d ?? 25,
        i: profile?.i ?? 25,
        s: profile?.s ?? 25,
        c: profile?.c ?? 25,
        store: profile?.store || 'all',
      });
    }
  }, [open, profile]);

  function atualizar(campo, valor) {
    setValores((v) => ({ ...v, [campo]: valor }));
  }

  function salvar() {
    const d = Number(valores.d) || 0;
    const i = Number(valores.i) || 0;
    const s = Number(valores.s) || 0;
    const c = Number(valores.c) || 0;
    onSave({
      userName,
      d,
      i,
      s,
      c,
      store: valores.store,
      perfilPredominante: calcularPerfilPredominante(d, i, s, c),
      dataAtualizacao: new Date().toISOString().split('T')[0],
    });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Ajustar perfil DISC — ${userName || ''}`}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={salvar} disabled={saving}>
            {saving ? 'Salvando...' : 'Salvar perfil'}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-4">
        <Field label="Dominância (D) %">
          <Input type="number" min={0} max={100} value={valores.d} onChange={(e) => atualizar('d', e.target.value)} />
        </Field>
        <Field label="Influência (I) %">
          <Input type="number" min={0} max={100} value={valores.i} onChange={(e) => atualizar('i', e.target.value)} />
        </Field>
        <Field label="Estabilidade (S) %">
          <Input type="number" min={0} max={100} value={valores.s} onChange={(e) => atualizar('s', e.target.value)} />
        </Field>
        <Field label="Conformidade (C) %">
          <Input type="number" min={0} max={100} value={valores.c} onChange={(e) => atualizar('c', e.target.value)} />
        </Field>
        <Field label="Unidade / Loja" className="col-span-2">
          <Select value={valores.store} onChange={(e) => atualizar('store', e.target.value)}>
            {Object.entries(LOJAS_RH).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
    </Modal>
  );
}
