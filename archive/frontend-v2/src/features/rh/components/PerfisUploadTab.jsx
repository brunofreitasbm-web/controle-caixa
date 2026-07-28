import { useState } from 'react';
import { toast } from 'sonner';
import { ChartSpline, Pencil, RotateCcw, Trash2 } from 'lucide-react';
import Card, { CardHeader } from '../../../components/ui/Card.jsx';
import Button from '../../../components/ui/Button.jsx';
import Badge from '../../../components/ui/Badge.jsx';
import Table, { Td, Tr } from '../../../components/ui/Table.jsx';
import Select from '../../../components/ui/Select.jsx';
import EmptyState from '../../../components/ui/EmptyState.jsx';
import Modal from '../../../components/ui/Modal.jsx';
import { LoadingBlock } from '../../../components/ui/Spinner.jsx';
import FileDropzone from '../../../components/FileDropzone.jsx';
import { api } from '../../../lib/apiClient.js';
import { abrirWhatsapp } from '../../../lib/whatsapp.js';
import DiscRadar from './DiscRadar.jsx';
import DiscEditModal from './DiscEditModal.jsx';
import CadastroViaDiscModal from './CadastroViaDiscModal.jsx';
import {
  DISC_COLORS,
  LOJAS_RH,
  calcularAptidaoVendas,
  processarLaudoPdf,
} from '../discProfiles.js';

const BADGE_POR_PERFIL = {
  Dominante: 'erro',
  Influenciador: 'atencao',
  Estável: 'pago',
  Conforme: 'info',
};

const WA_TEXTO_CONVITE = encodeURIComponent(
  'Você foi convidado para preencher o seu inventário comportamental, é só clicar no link a seguir:'
);
const WA_LINK_DISC = `https://disc.etalent.com.br/grpqlPC5VYC50_7gFdn8f5W9w`;

export default function PerfisUploadTab({ profiles, colaboradores, filterStore, onFilterStoreChange, onSaveProfiles }) {
  const [processando, setProcessando] = useState(false);
  const [progresso, setProgresso] = useState(null);
  const [editando, setEditando] = useState(null); // nome do colaborador
  const [verificando, setVerificando] = useState(null); // nome (modal de perfil individual)
  const [cadastroPendente, setCadastroPendente] = useState(null); // { valoresDisc, nomeDetectado }
  const [salvandoCadastro, setSalvandoCadastro] = useState(false);

  const colabsVisiveis = colaboradores.filter((c) => !(profiles[c.nome] && profiles[c.nome].excludedFromRh));
  const colabsFiltrados = colabsVisiveis.filter((c) => {
    if (filterStore === 'all') return true;
    const store = profiles[c.nome]?.store || 'all';
    return store === 'all' || store === filterStore;
  });
  const excluidos = colaboradores.filter((c) => profiles[c.nome]?.excludedFromRh);

  function getProfile(nome) {
    return profiles[nome] || { d: 25, i: 25, s: 25, c: 25, perfilPredominante: 'Equilibrado', store: 'all' };
  }

  async function processarArquivo(file) {
    setProcessando(true);
    setProgresso(`Lendo ${file.name}...`);
    try {
      const { d, i, s, c, perfilPredominante, nomeDetectado } = await processarLaudoPdf(file);

      const colabEncontrado = colaboradores.find((col) => file.name.toUpperCase().includes(col.nome.toUpperCase()));
      const targetUser = colabEncontrado?.nome;

      if (targetUser) {
        const lojaExistente = profiles[targetUser]?.store || 'all';
        const novosPerfis = {
          ...profiles,
          [targetUser]: {
            userName: targetUser,
            d,
            i,
            s,
            c,
            perfilPredominante,
            store: lojaExistente,
            dataAtualizacao: new Date().toISOString().split('T')[0],
          },
        };
        await onSaveProfiles(novosPerfis);
        toast.success(`Laudo DISC de ${targetUser} atualizado!`);
      } else {
        setCadastroPendente({ valoresDisc: { d, i, s, c }, valoresCompletos: { d, i, s, c, perfilPredominante }, nomeDetectado });
      }
    } catch (err) {
      console.error('Erro ao processar laudo PDF:', err);
      toast.error('Não foi possível ler este PDF. Verifique se é um laudo DISC válido.');
    } finally {
      setProcessando(false);
      setProgresso(null);
    }
  }

  async function confirmarCadastroViaDisc({ nome, unidade, role }) {
    setSalvandoCadastro(true);
    try {
      const resp = await api.post('/api/colaboradores', { nome, role, unidade });
      if (resp?.error) throw new Error(resp.error);
      await api.post('/api/pins', { usuario: nome, pin: '0000' }).catch(() => {});

      const novosPerfis = {
        ...profiles,
        [nome]: {
          userName: nome,
          ...cadastroPendente.valoresCompletos,
          store: unidade,
          dataAtualizacao: new Date().toISOString().split('T')[0],
        },
      };
      await onSaveProfiles(novosPerfis);
      toast.success(`${nome} cadastrado(a) com sucesso! PIN inicial: 0000.`);
      setCadastroPendente(null);
    } catch (err) {
      toast.error(err.message || 'Erro ao cadastrar colaborador(a).');
    } finally {
      setSalvandoCadastro(false);
    }
  }

  async function salvarEdicao(payload) {
    const novosPerfis = { ...profiles, [payload.userName]: payload };
    await onSaveProfiles(novosPerfis);
    toast.success(`Perfil DISC de ${payload.userName} atualizado!`);
    setEditando(null);
  }

  async function removerDoRh(nome) {
    const novosPerfis = { ...profiles, [nome]: { ...getProfile(nome), userName: nome, excludedFromRh: true } };
    await onSaveProfiles(novosPerfis);
    toast.success(`${nome} desconsiderado(a) do Módulo RH.`);
  }

  async function restaurarNoRh(nome) {
    const novosPerfis = { ...profiles, [nome]: { ...getProfile(nome), userName: nome, excludedFromRh: false } };
    await onSaveProfiles(novosPerfis);
    toast.success(`${nome} restaurado(a) no Módulo RH!`);
  }

  async function alterarLoja(nome, store) {
    const novosPerfis = { ...profiles, [nome]: { ...getProfile(nome), userName: nome, store } };
    await onSaveProfiles(novosPerfis);
  }

  const perfilVerificando = verificando ? getProfile(verificando) : null;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="Upload de laudo DISC (PDF)"
          subtitle="Envie o laudo em PDF de um(a) colaborador(a) — o sistema tenta identificar quem é pelo nome no arquivo/texto e preenche o perfil automaticamente."
        />
        <FileDropzone
          accept="application/pdf"
          label="Arraste o laudo em PDF ou clique para selecionar"
          hint="Um arquivo por vez — para outro laudo, basta enviar novamente."
          onFile={processarArquivo}
        />
        {processando && (
          <div className="mt-4">
            <LoadingBlock label={progresso || 'Processando...'} />
          </div>
        )}
      </Card>

      <Card>
        <CardHeader
          title="Colaboradores no Módulo RH"
          subtitle="Perfis DISC cadastrados manualmente ou via upload."
          action={
            <Select value={filterStore} onChange={(e) => onFilterStoreChange(e.target.value)} className="w-56">
              {Object.entries(LOJAS_RH).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </Select>
          }
        />
        {colabsFiltrados.length === 0 ? (
          <EmptyState title="Nenhum colaborador nesta seleção" description="Ajuste o filtro de loja ou envie um laudo em PDF." />
        ) : (
          <Table columns={['Nome', 'Loja', 'Perfil', 'D', 'I', 'S', 'C', 'Ações']}>
            {colabsFiltrados.map((col) => {
              const prof = getProfile(col.nome);
              return (
                <Tr key={col.nome}>
                  <Td className="font-bold text-slate-800">{col.nome}</Td>
                  <Td>
                    <Select
                      value={prof.store || 'all'}
                      onChange={(e) => alterarLoja(col.nome, e.target.value)}
                      className="text-xs py-1.5 w-44"
                    >
                      {Object.entries(LOJAS_RH).map(([key, label]) => (
                        <option key={key} value={key}>
                          {label}
                        </option>
                      ))}
                    </Select>
                  </Td>
                  <Td>
                    <Badge status={BADGE_POR_PERFIL[prof.perfilPredominante] || 'neutro'}>{prof.perfilPredominante}</Badge>
                  </Td>
                  <Td className="font-mono font-bold">
                    <span style={{ color: DISC_COLORS.d }}>{prof.d}%</span>
                  </Td>
                  <Td className="font-mono font-bold">
                    <span style={{ color: DISC_COLORS.i }}>{prof.i}%</span>
                  </Td>
                  <Td className="font-mono font-bold">
                    <span style={{ color: DISC_COLORS.s }}>{prof.s}%</span>
                  </Td>
                  <Td className="font-mono font-bold">
                    <span style={{ color: DISC_COLORS.c }}>{prof.c}%</span>
                  </Td>
                  <Td>
                    <div className="flex items-center gap-1.5 justify-end">
                      <Button size="sm" variant="ghost" onClick={() => abrirWhatsapp('', `${WA_TEXTO_CONVITE} ${WA_LINK_DISC}`)} title="Convidar via WhatsApp">
                        Convidar
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setVerificando(col.nome)} title="Ver perfil">
                        <ChartSpline size={15} />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditando(col.nome)} title="Ajustar valores">
                        <Pencil size={15} />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => removerDoRh(col.nome)} title="Desconsiderar do RH">
                        <Trash2 size={15} className="text-rose-500" />
                      </Button>
                    </div>
                  </Td>
                </Tr>
              );
            })}
          </Table>
        )}

        {excluidos.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {excluidos.map((c) => (
              <Button key={c.nome} size="sm" variant="outline" onClick={() => restaurarNoRh(c.nome)}>
                <RotateCcw size={14} /> Restaurar {c.nome}
              </Button>
            ))}
          </div>
        )}
      </Card>

      <DiscEditModal
        open={!!editando}
        onClose={() => setEditando(null)}
        userName={editando}
        profile={editando ? getProfile(editando) : null}
        onSave={salvarEdicao}
      />

      <CadastroViaDiscModal
        open={!!cadastroPendente}
        onClose={() => setCadastroPendente(null)}
        valoresDisc={cadastroPendente?.valoresDisc}
        nomeDetectado={cadastroPendente?.nomeDetectado}
        onConfirm={confirmarCadastroViaDisc}
        saving={salvandoCadastro}
      />

      <Modal open={!!verificando} onClose={() => setVerificando(null)} title={`Perfil DISC — ${verificando || ''}`} size="sm">
        {perfilVerificando && (
          <div className="space-y-4">
            <DiscRadar d={perfilVerificando.d} i={perfilVerificando.i} s={perfilVerificando.s} c={perfilVerificando.c} height={220} />
            <div className="rounded-xl bg-slate-50 p-3 flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500">Aptidão Comercial (heurística DISC)</span>
              <Badge status="info">
                {calcularAptidaoVendas(perfilVerificando).label} · {calcularAptidaoVendas(perfilVerificando).score}%
              </Badge>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Estimativa com base no perfil DISC (peso maior para Influência e Dominância, típico de vendas consultivas de
              varejo). Não substitui avaliação de desempenho real.
            </p>
          </div>
        )}
      </Modal>
    </div>
  );
}
