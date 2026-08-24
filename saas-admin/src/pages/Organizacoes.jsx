import React, { useEffect, useState } from 'react';
import {
  Plus,
  Search,
  Building2,
  CheckCircle2,
  XCircle,
  Clock,
  X,
  Store,
  Users
} from 'lucide-react';
import { api } from '../lib/api';
import './Unidades.css';

const ORG_VAZIA = { slug: '', nome: '', plano: '', primeiroOwnerNome: '', primeiroOwnerPin: '' };

const STATUS_BADGE = {
  ativo: { classe: 'badge-success', icone: CheckCircle2, texto: 'Ativo' },
  trial: { classe: 'badge-warning', icone: Clock, texto: 'Trial' },
  suspenso: { classe: 'badge-danger', icone: XCircle, texto: 'Suspenso' }
};

export function Organizacoes() {
  const [orgs, setOrgs] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [busca, setBusca] = useState('');
  const [modalAberto, setModalAberto] = useState(false);
  const [form, setForm] = useState(ORG_VAZIA);
  const [salvando, setSalvando] = useState(false);

  const carregar = async () => {
    setCarregando(true);
    setErro('');
    try {
      setOrgs(await api.organizacoes());
    } catch (e) {
      setErro(e.message);
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => { carregar(); }, []);

  const abrirNova = () => {
    setForm(ORG_VAZIA);
    setModalAberto(true);
  };

  const salvar = async (e) => {
    e.preventDefault();
    setSalvando(true);
    setErro('');
    try {
      const payload = { slug: form.slug.trim(), nome: form.nome.trim(), plano: form.plano.trim() || null };
      if (form.primeiroOwnerNome.trim() && form.primeiroOwnerPin.trim()) {
        payload.primeiroOwnerNome = form.primeiroOwnerNome.trim();
        payload.primeiroOwnerPin = form.primeiroOwnerPin.trim();
      }
      await api.criarOrganizacao(payload);
      setModalAberto(false);
      await carregar();
    } catch (e) {
      setErro(e.message);
    } finally {
      setSalvando(false);
    }
  };

  const alternarStatus = async (org, novoStatus) => {
    try {
      await api.atualizarOrganizacao(org.id, { status: novoStatus });
      await carregar();
    } catch (e) {
      setErro(e.message);
    }
  };

  const filtradas = orgs.filter(o =>
    o.nome.toLowerCase().includes(busca.toLowerCase()) ||
    o.slug.toLowerCase().includes(busca.toLowerCase())
  );

  return (
    <div className="page-container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1>Organizações (clientes do SaaS)</h1>
          <p>Quem aluga o Huboperações — GET/POST/PUT /api/platform/organizations.</p>
        </div>
        <button className="btn btn-primary" onClick={abrirNova}>
          <Plus size={18} />
          <span>Nova Organização</span>
        </button>
      </div>

      {erro && <p className="login-error" style={{ maxWidth: '480px' }}>{erro}</p>}

      <div className="filters-bar" style={{ marginTop: '1rem' }}>
        <div className="search-input-container" style={{ width: '320px' }}>
          <Search size={16} />
          <input
            type="text"
            className="input-field"
            placeholder="Buscar por nome ou slug..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>
        <span className="text-muted" style={{ fontSize: '0.875rem' }}>
          Exibindo <strong>{filtradas.length}</strong> de {orgs.length} organizações
        </span>
      </div>

      <div className="table-container">
        <table className="custom-table">
          <thead>
            <tr>
              <th>Organização</th>
              <th>Plano</th>
              <th>Unidades</th>
              <th>Colaboradores</th>
              <th>Faixa de preço</th>
              <th>Status</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {carregando && <tr><td colSpan={7} className="text-muted">Carregando...</td></tr>}
            {!carregando && filtradas.length === 0 && <tr><td colSpan={7} className="text-muted">Nenhuma organização encontrada.</td></tr>}
            {filtradas.map(org => {
              const statusInfo = STATUS_BADGE[org.status] || { classe: 'badge-warning', icone: Clock, texto: org.status };
              const StatusIcone = statusInfo.icone;
              return (
                <tr key={org.id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                      <Building2 size={14} className="text-muted" />
                      <div>
                        <div style={{ fontWeight: 700 }}>{org.nome}</div>
                        <div className="text-muted" style={{ fontSize: '0.75rem' }}>{org.slug}</div>
                      </div>
                    </div>
                  </td>
                  <td>{org.plano || '—'}</td>
                  <td>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                      <Store size={13} className="text-muted" />{org.unidadesAtivas}
                    </span>
                  </td>
                  <td>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                      <Users size={13} className="text-muted" />{org.colaboradores}
                    </span>
                  </td>
                  <td>
                    {org.faixaAtual
                      ? `${org.faixaAtual.nome || ''} — R$ ${Number(org.faixaAtual.valorMensal).toLocaleString('pt-BR')}/mês`
                      : <span className="text-muted">Sem faixa cadastrada</span>}
                  </td>
                  <td>
                    <span className={`badge ${statusInfo.classe}`}>
                      <StatusIcone size={12} />{statusInfo.texto}
                    </span>
                  </td>
                  <td>
                    <select
                      className="select-field"
                      value={org.status}
                      onChange={(e) => alternarStatus(org, e.target.value)}
                    >
                      <option value="trial">trial</option>
                      <option value="ativo">ativo</option>
                      <option value="suspenso">suspenso</option>
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {modalAberto && (
        <div className="modal-overlay">
          <div className="modal-card">
            <div className="modal-header">
              <h3>Nova Organização</h3>
              <button className="btn-icon" onClick={() => setModalAberto(false)}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={salvar}>
              <div className="modal-body">
                <div className="form-grid-2">
                  <div className="input-group">
                    <label className="input-label">Slug</label>
                    <input
                      type="text"
                      className="input-field"
                      placeholder="loja-do-joao"
                      required
                      pattern="[a-z0-9-]+"
                      title="Só letras minúsculas, números e hífen"
                      value={form.slug}
                      onChange={(e) => setForm({ ...form, slug: e.target.value })}
                    />
                  </div>
                  <div className="input-group">
                    <label className="input-label">Plano</label>
                    <input
                      type="text"
                      className="input-field"
                      placeholder="opcional"
                      value={form.plano}
                      onChange={(e) => setForm({ ...form, plano: e.target.value })}
                    />
                  </div>
                </div>

                <div className="input-group">
                  <label className="input-label">Nome da Organização</label>
                  <input
                    type="text"
                    className="input-field"
                    placeholder="Ex.: Loja do João LTDA"
                    required
                    value={form.nome}
                    onChange={(e) => setForm({ ...form, nome: e.target.value })}
                  />
                </div>

                <p className="text-muted" style={{ fontSize: '0.8rem', marginTop: '0.5rem' }}>
                  Opcional: já cadastrar o primeiro owner, pra essa organização conseguir logar sozinha assim que for criada.
                </p>

                <div className="form-grid-2">
                  <div className="input-group">
                    <label className="input-label">Nome do primeiro owner</label>
                    <input
                      type="text"
                      className="input-field"
                      placeholder="opcional"
                      value={form.primeiroOwnerNome}
                      onChange={(e) => setForm({ ...form, primeiroOwnerNome: e.target.value })}
                    />
                  </div>
                  <div className="input-group">
                    <label className="input-label">PIN (4 dígitos)</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="\d{4}"
                      maxLength={4}
                      className="input-field"
                      placeholder="opcional"
                      value={form.primeiroOwnerPin}
                      onChange={(e) => setForm({ ...form, primeiroOwnerPin: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setModalAberto(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" disabled={salvando}>
                  {salvando ? 'Criando...' : 'Criar Organização'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
