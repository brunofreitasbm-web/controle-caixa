import React, { useEffect, useState } from 'react';
import {
  Plus,
  Search,
  MapPin,
  CheckCircle2,
  XCircle,
  X,
  Edit3,
  Trash2
} from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import './Unidades.css';

const NEGOCIO_VAZIO = { negocioChave: '', nome: '', codigoExterno: '', abertura: '', fechamento: '', whatsappGrupoUrl: '', corEmoji: '' };

export function Unidades() {
  const { recarregar } = useAuth();
  const [unidades, setUnidades] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [busca, setBusca] = useState('');
  const [modalAberto, setModalAberto] = useState(false);
  const [editando, setEditando] = useState(null);
  const [form, setForm] = useState(NEGOCIO_VAZIO);
  const [salvando, setSalvando] = useState(false);

  const carregar = async () => {
    setCarregando(true);
    setErro('');
    try {
      const dados = await api.unidades();
      setUnidades(dados);
    } catch (e) {
      setErro(e.message);
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => { carregar(); }, []);

  const abrirNova = () => {
    setEditando(null);
    setForm(NEGOCIO_VAZIO);
    setModalAberto(true);
  };

  const abrirEdicao = (u) => {
    setEditando(u);
    setForm({
      negocioChave: u.negocioChave,
      nome: u.nome,
      codigoExterno: u.codigoExterno || '',
      abertura: u.abertura || '',
      fechamento: u.fechamento || '',
      whatsappGrupoUrl: u.whatsappGrupoUrl || '',
      corEmoji: u.corEmoji || ''
    });
    setModalAberto(true);
  };

  const salvar = async (e) => {
    e.preventDefault();
    setSalvando(true);
    setErro('');
    try {
      if (editando) {
        await api.atualizarUnidade(editando.id, form);
      } else {
        await api.criarUnidade(form);
      }
      setModalAberto(false);
      await carregar();
      await recarregar();
    } catch (e) {
      setErro(e.message);
    } finally {
      setSalvando(false);
    }
  };

  const desativar = async (u) => {
    if (!window.confirm(`Desativar "${u.nome}"? Fica fora do dia a dia mas o histórico é preservado.`)) return;
    try {
      await api.desativarUnidade(u.id);
      await carregar();
      await recarregar();
    } catch (e) {
      setErro(e.message);
    }
  };

  const filtradas = unidades.filter(u =>
    u.nome.toLowerCase().includes(busca.toLowerCase()) ||
    u.negocioChave.toLowerCase().includes(busca.toLowerCase())
  );

  return (
    <div className="page-container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1>Unidades</h1>
          <p>Cadastro real da organização — GET/POST/PUT/DELETE /tenant/unidades.</p>
        </div>
        <button className="btn btn-primary" onClick={abrirNova}>
          <Plus size={18} />
          <span>Cadastrar Unidade</span>
        </button>
      </div>

      {erro && <p className="login-error" style={{ maxWidth: '480px' }}>{erro}</p>}

      <div className="filters-bar" style={{ marginTop: '1rem' }}>
        <div className="search-input-container" style={{ width: '320px' }}>
          <Search size={16} />
          <input
            type="text"
            className="input-field"
            placeholder="Buscar por nome ou negócio..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>
        <span className="text-muted" style={{ fontSize: '0.875rem' }}>
          Exibindo <strong>{filtradas.length}</strong> de {unidades.length} unidades
        </span>
      </div>

      <div className="table-container">
        <table className="custom-table">
          <thead>
            <tr>
              <th>Unidade</th>
              <th>Negócio</th>
              <th>Código</th>
              <th>Horário</th>
              <th>Status</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {carregando && <tr><td colSpan={6} className="text-muted">Carregando...</td></tr>}
            {!carregando && filtradas.length === 0 && <tr><td colSpan={6} className="text-muted">Nenhuma unidade encontrada.</td></tr>}
            {filtradas.map(u => (
              <tr key={u.id}>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                    <MapPin size={14} className="text-muted" />
                    <span style={{ fontWeight: 700 }}>{u.corEmoji ? `${u.corEmoji} ` : ''}{u.nome}</span>
                  </div>
                </td>
                <td>{u.negocioChave}</td>
                <td>{u.codigoExterno || '—'}</td>
                <td>{u.abertura || '—'}–{u.fechamento || '—'}</td>
                <td>
                  <span className={`badge ${u.ativo ? 'badge-success' : 'badge-warning'}`}>
                    {u.ativo ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                    {u.ativo ? 'Ativa' : 'Inativa'}
                  </span>
                </td>
                <td>
                  <div style={{ display: 'flex', gap: '0.25rem' }}>
                    <button className="btn-icon" title="Editar" onClick={() => abrirEdicao(u)}>
                      <Edit3 size={16} />
                    </button>
                    {u.ativo === 1 && (
                      <button className="btn-icon" title="Desativar" onClick={() => desativar(u)}>
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modalAberto && (
        <div className="modal-overlay">
          <div className="modal-card">
            <div className="modal-header">
              <h3>{editando ? 'Editar Unidade' : 'Cadastrar Unidade'}</h3>
              <button className="btn-icon" onClick={() => setModalAberto(false)}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={salvar}>
              <div className="modal-body">
                <div className="input-group">
                  <label className="input-label">Chave do Negócio</label>
                  <input
                    type="text"
                    className="input-field"
                    placeholder="Ex: cacau-show"
                    required
                    value={form.negocioChave}
                    onChange={(e) => setForm({ ...form, negocioChave: e.target.value })}
                  />
                </div>

                <div className="input-group">
                  <label className="input-label">Nome da Unidade</label>
                  <input
                    type="text"
                    className="input-field"
                    placeholder="Ex: Marambaia"
                    required
                    value={form.nome}
                    onChange={(e) => setForm({ ...form, nome: e.target.value })}
                  />
                </div>

                <div className="form-grid-2">
                  <div className="input-group">
                    <label className="input-label">Código Externo</label>
                    <input
                      type="text"
                      className="input-field"
                      placeholder="Ex: 9175"
                      value={form.codigoExterno}
                      onChange={(e) => setForm({ ...form, codigoExterno: e.target.value })}
                    />
                  </div>
                  <div className="input-group">
                    <label className="input-label">Emoji/Cor</label>
                    <input
                      type="text"
                      className="input-field"
                      placeholder="🟣"
                      value={form.corEmoji}
                      onChange={(e) => setForm({ ...form, corEmoji: e.target.value })}
                    />
                  </div>
                </div>

                <div className="form-grid-2">
                  <div className="input-group">
                    <label className="input-label">Abertura</label>
                    <input
                      type="text"
                      className="input-field"
                      placeholder="09:00"
                      value={form.abertura}
                      onChange={(e) => setForm({ ...form, abertura: e.target.value })}
                    />
                  </div>
                  <div className="input-group">
                    <label className="input-label">Fechamento</label>
                    <input
                      type="text"
                      className="input-field"
                      placeholder="22:00"
                      value={form.fechamento}
                      onChange={(e) => setForm({ ...form, fechamento: e.target.value })}
                    />
                  </div>
                </div>

                <div className="input-group">
                  <label className="input-label">Grupo WhatsApp (URL)</label>
                  <input
                    type="text"
                    className="input-field"
                    value={form.whatsappGrupoUrl}
                    onChange={(e) => setForm({ ...form, whatsappGrupoUrl: e.target.value })}
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setModalAberto(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" disabled={salvando}>
                  {salvando ? 'Salvando...' : 'Salvar Unidade'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
