import { useState } from 'react';
import { toast } from 'sonner';
import { Fingerprint, Plus, ScanFace, Trash2, UserPen } from 'lucide-react';
import Card, { CardHeader } from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Table, { Td, Tr } from '../../components/ui/Table.jsx';
import Modal from '../../components/ui/Modal.jsx';
import ConfirmDialog from '../../components/ui/ConfirmDialog.jsx';
import Input, { Field } from '../../components/ui/Input.jsx';
import Select from '../../components/ui/Select.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import { LoadingBlock } from '../../components/ui/Spinner.jsx';
import { formatDate } from '../../lib/format.js';
import { getCurrentUser, isOwner, ROLES } from '../../lib/auth.js';
import { OPERACOES_CACAU_SHOW, OPERACOES_FACA_AMIGOS } from '../../hooks/usePonto.js';
import { useColaboradores, useExcluirColaborador, useResetarBiometria, useSalvarColaborador } from '../../hooks/useColaboradores.js';

const ROLE_LABELS = {
  [ROLES.OWNER]: 'Owner',
  [ROLES.CONSULTORA]: 'Consultora',
  [ROLES.CONSULTORA_DASHBOARD]: 'Líder de Operações',
  [ROLES.CONSULTORA_FA]: 'Consultora Faça Amigos',
};

const UNIDADES = [...OPERACOES_CACAU_SHOW, ...OPERACOES_FACA_AMIGOS];

const FORM_VAZIO = { nome: '', role: ROLES.CONSULTORA, unidade: '', cpf: '', dataNascimento: '', telefone: '', dataAdmissao: '' };

export default function ColaboradoresPage() {
  const user = getCurrentUser();
  const podeGerenciarBiometria = isOwner(user);

  const colaboradoresQuery = useColaboradores();
  const salvarMutation = useSalvarColaborador();
  const excluirMutation = useExcluirColaborador();
  const resetBiometriaMutation = useResetarBiometria();

  const [modalAberto, setModalAberto] = useState(false);
  const [form, setForm] = useState(FORM_VAZIO);
  const [editandoNomeOriginal, setEditandoNomeOriginal] = useState(null);
  const [excluindo, setExcluindo] = useState(null);
  const [resetando, setResetando] = useState(null);

  function abrirNovo() {
    setForm(FORM_VAZIO);
    setEditandoNomeOriginal(null);
    setModalAberto(true);
  }

  function abrirEdicao(colaborador) {
    setForm({
      nome: colaborador.nome || '',
      role: colaborador.role || ROLES.CONSULTORA,
      unidade: colaborador.unidade || '',
      cpf: colaborador.cpf || '',
      dataNascimento: (colaborador.dataNascimento || '').slice(0, 10),
      telefone: colaborador.telefone || '',
      dataAdmissao: (colaborador.dataAdmissao || '').slice(0, 10),
    });
    setEditandoNomeOriginal(colaborador.nome);
    setModalAberto(true);
  }

  async function salvar(e) {
    e.preventDefault();
    if (!form.nome.trim() || !form.role) {
      toast.error('Nome e Perfil são obrigatórios.');
      return;
    }
    try {
      await salvarMutation.mutateAsync(form);
      toast.success(editandoNomeOriginal ? 'Colaborador(a) atualizado(a)!' : 'Colaborador(a) cadastrado(a)!');
      setModalAberto(false);
    } catch (err) {
      toast.error(err.message || 'Erro ao salvar colaborador(a).');
    }
  }

  async function confirmarExclusao() {
    if (!excluindo) return;
    try {
      await excluirMutation.mutateAsync(excluindo.nome);
      toast.success(`${excluindo.nome} removido(a).`);
      setExcluindo(null);
    } catch (err) {
      toast.error(err.message || 'Erro ao excluir colaborador(a).');
    }
  }

  async function confirmarResetBiometria() {
    if (!resetando) return;
    try {
      await resetBiometriaMutation.mutateAsync({ nome: resetando.nome, actorUsuario: user?.nome });
      toast.success(`Biometria de ${resetando.nome} redefinida.`);
      setResetando(null);
    } catch (err) {
      toast.error(err.message || 'Erro ao redefinir biometria.');
    }
  }

  const colaboradores = colaboradoresQuery.data || [];

  return (
    <div className="animate-fade-in space-y-4">
      <Card>
        <CardHeader
          title="Colaboradores"
          subtitle="Cadastro, edição e gestão de biometria da equipe."
          action={
            <Button onClick={abrirNovo}>
              <Plus size={16} /> Novo colaborador
            </Button>
          }
        />

        {colaboradoresQuery.isLoading ? (
          <LoadingBlock label="Carregando colaboradores..." />
        ) : colaboradores.length === 0 ? (
          <EmptyState title="Nenhum colaborador cadastrado" description="Clique em 'Novo colaborador' para começar." />
        ) : (
          <Table columns={['Nome', 'Perfil', 'Unidade', 'CPF', 'Admissão', 'Biometria', 'Ações']}>
            {colaboradores.map((c) => (
              <Tr key={c.nome}>
                <Td className="font-bold text-slate-800">{c.nome}</Td>
                <Td>
                  <Badge status="info">{ROLE_LABELS[c.role] || c.role}</Badge>
                </Td>
                <Td>{c.unidade || '—'}</Td>
                <Td>{c.cpf || '—'}</Td>
                <Td>{c.dataAdmissao ? formatDate(c.dataAdmissao) : '—'}</Td>
                <Td>
                  {c.hasBiometricEnrolled ? (
                    <Badge status="pago">
                      <Fingerprint size={12} className="inline mr-1" /> Cadastrada
                    </Badge>
                  ) : (
                    <Badge status="neutro">Pendente</Badge>
                  )}
                </Td>
                <Td>
                  <div className="flex items-center gap-1.5 justify-end">
                    <Button size="sm" variant="ghost" onClick={() => abrirEdicao(c)} title="Editar">
                      <UserPen size={15} />
                    </Button>
                    {podeGerenciarBiometria && c.hasBiometricEnrolled && (
                      <Button size="sm" variant="ghost" onClick={() => setResetando(c)} title="Redefinir biometria">
                        <ScanFace size={15} className="text-amber-500" />
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => setExcluindo(c)} title="Excluir">
                      <Trash2 size={15} className="text-rose-500" />
                    </Button>
                  </div>
                </Td>
              </Tr>
            ))}
          </Table>
        )}
      </Card>

      <Modal
        open={modalAberto}
        onClose={() => setModalAberto(false)}
        title={editandoNomeOriginal ? `Editar ${editandoNomeOriginal}` : 'Novo colaborador'}
        footer={
          <>
            <Button variant="outline" onClick={() => setModalAberto(false)} disabled={salvarMutation.isPending}>
              Cancelar
            </Button>
            <Button onClick={salvar} disabled={salvarMutation.isPending}>
              {salvarMutation.isPending ? 'Salvando...' : 'Salvar'}
            </Button>
          </>
        }
      >
        <form onSubmit={salvar} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Nome completo" className="md:col-span-2">
            <Input
              value={form.nome}
              onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
              disabled={!!editandoNomeOriginal}
              required
            />
          </Field>
          <Field label="Perfil de acesso">
            <Select value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))} required>
              {Object.entries(ROLE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Unidade">
            <Select value={form.unidade} onChange={(e) => setForm((f) => ({ ...f, unidade: e.target.value }))}>
              <option value="">Selecione...</option>
              {UNIDADES.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="CPF">
            <Input value={form.cpf} onChange={(e) => setForm((f) => ({ ...f, cpf: e.target.value }))} />
          </Field>
          <Field label="Telefone">
            <Input value={form.telefone} onChange={(e) => setForm((f) => ({ ...f, telefone: e.target.value }))} />
          </Field>
          <Field label="Data de nascimento">
            <Input
              type="date"
              value={form.dataNascimento}
              onChange={(e) => setForm((f) => ({ ...f, dataNascimento: e.target.value }))}
            />
          </Field>
          <Field label="Data de admissão">
            <Input
              type="date"
              value={form.dataAdmissao}
              onChange={(e) => setForm((f) => ({ ...f, dataAdmissao: e.target.value }))}
            />
          </Field>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!excluindo}
        onClose={() => setExcluindo(null)}
        onConfirm={confirmarExclusao}
        title="Excluir colaborador(a)"
        description={`Tem certeza que deseja excluir ${excluindo?.nome}? Esta ação também remove o PIN de acesso.`}
        confirmLabel="Excluir"
        danger
        loading={excluirMutation.isPending}
      />

      <ConfirmDialog
        open={!!resetando}
        onClose={() => setResetando(null)}
        onConfirm={confirmarResetBiometria}
        title="Redefinir biometria"
        description={`${resetando?.nome} perderá o cadastro biométrico atual e precisará fazer um novo self-enrollment na próxima marcação de ponto.`}
        confirmLabel="Redefinir"
        danger
        loading={resetBiometriaMutation.isPending}
      />
    </div>
  );
}
