import React, { useState } from 'react';
import { 
  Plus, 
  Search, 
  Filter, 
  MapPin, 
  Building2, 
  MoreVertical, 
  CheckCircle2, 
  Clock, 
  X,
  Eye,
  Edit3
} from 'lucide-react';
import './Franchises.css';

const initialFranchises = [
  { id: 'FRQ-001', name: 'Ananindeua - Coqueiro', owner: 'Carlos Eduardo', city: 'Ananindeua', state: 'PA', status: 'Ativa', royalties: '6%', monthlyRevenue: 142500, contractEnd: '2028-11-15' },
  { id: 'FRQ-002', name: 'Belém - Umarizal', owner: 'Mariana Silva', city: 'Belém', state: 'PA', status: 'Ativa', royalties: '6%', monthlyRevenue: 128900, contractEnd: '2027-05-20' },
  { id: 'FRQ-003', name: 'Castanhal - Centro', owner: 'Roberto Mendes', city: 'Castanhal', state: 'PA', status: 'Ativa', royalties: '6%', monthlyRevenue: 115000, contractEnd: '2029-01-10' },
  { id: 'FRQ-004', name: 'Manaus - Adrianópolis', owner: 'Fernanda Rocha', city: 'Manaus', state: 'AM', status: 'Ativa', royalties: '6.5%', monthlyRevenue: 98400, contractEnd: '2026-09-30' },
  { id: 'FRQ-005', name: 'Macapá - Shopping', owner: 'Lucas Pinheiro', city: 'Macapá', state: 'AP', status: 'Em Expansão', royalties: '6%', monthlyRevenue: 89200, contractEnd: '2030-03-01' },
  { id: 'FRQ-006', name: 'Santarém - Orla', owner: 'Juliana Costa', city: 'Santarém', state: 'PA', status: 'Pendente', royalties: '6%', monthlyRevenue: 0, contractEnd: '2031-02-14' },
];

export function Franchises() {
  const [franchises, setFranchises] = useState(initialFranchises);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('Todos');
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Form state for new franchise
  const [newFranchise, setNewFranchise] = useState({
    name: '',
    owner: '',
    city: '',
    state: 'PA',
    royalties: '6%'
  });

  const handleCreate = (e) => {
    e.preventDefault();
    if (!newFranchise.name || !newFranchise.owner) return;

    const created = {
      id: `FRQ-0${franchises.length + 1}`,
      name: newFranchise.name,
      owner: newFranchise.owner,
      city: newFranchise.city || 'Belém',
      state: newFranchise.state,
      status: 'Ativa',
      royalties: newFranchise.royalties,
      monthlyRevenue: 0,
      contractEnd: '2031-12-31'
    };

    setFranchises([created, ...franchises]);
    setIsModalOpen(false);
    setNewFranchise({ name: '', owner: '', city: '', state: 'PA', royalties: '6%' });
  };

  const filtered = franchises.filter(item => {
    const matchesSearch = item.name.toLowerCase().includes(search.toLowerCase()) || 
                          item.owner.toLowerCase().includes(search.toLowerCase()) ||
                          item.city.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'Todos' || item.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="page-container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1>Franquias & Unidades</h1>
          <p>Gerencie o cadastro, status contratual e localização de cada franqueado.</p>
        </div>

        <button className="btn btn-primary" onClick={() => setIsModalOpen(true)}>
          <Plus size={18} />
          <span>Cadastrar Nova Franquia</span>
        </button>
      </div>

      {/* Filters & Actions Bar */}
      <div className="franchises-header-actions" style={{ marginTop: '1.5rem' }}>
        <div className="filters-bar" style={{ flex: 1 }}>
          <div className="search-input-container" style={{ width: '320px' }}>
            <Search size={16} />
            <input 
              type="text" 
              className="input-field" 
              placeholder="Buscar por nome, franqueado ou cidade..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <select 
            className="select-field"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="Todos">Todos os Status</option>
            <option value="Ativa">Ativas</option>
            <option value="Em Expansão">Em Expansão</option>
            <option value="Pendente">Pendentes</option>
          </select>
        </div>

        <span className="text-muted" style={{ fontSize: '0.875rem' }}>
          Exibindo <strong>{filtered.length}</strong> de {franchises.length} unidades
        </span>
      </div>

      {/* Table */}
      <div className="table-container">
        <table className="custom-table">
          <thead>
            <tr>
              <th>ID & Franquia</th>
              <th>Franqueado Responsável</th>
              <th>Localização</th>
              <th>Status</th>
              <th>Royalties SaaS</th>
              <th>Faturamento Mês</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(item => (
              <tr key={item.id}>
                <td>
                  <div>
                    <span style={{ fontWeight: 700, display: 'block' }}>{item.name}</span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{item.id}</span>
                  </div>
                </td>
                <td>
                  <span style={{ fontWeight: 500 }}>{item.owner}</span>
                </td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', color: 'var(--text-secondary)' }}>
                    <MapPin size={14} className="text-muted" />
                    <span>{item.city} - {item.state}</span>
                  </div>
                </td>
                <td>
                  <span className={`badge ${
                    item.status === 'Ativa' ? 'badge-success' : 
                    item.status === 'Em Expansão' ? 'badge-info' : 'badge-warning'
                  }`}>
                    {item.status === 'Ativa' && <CheckCircle2 size={12} />}
                    {item.status === 'Em Expansão' && <Building2 size={12} />}
                    {item.status === 'Pendente' && <Clock size={12} />}
                    {item.status}
                  </span>
                </td>
                <td>
                  <span style={{ fontWeight: 600, color: 'var(--brand-primary)' }}>{item.royalties}</span>
                </td>
                <td>
                  <span style={{ fontWeight: 700 }}>
                    {item.monthlyRevenue > 0 ? `R$ ${item.monthlyRevenue.toLocaleString()}` : '-'}
                  </span>
                </td>
                <td>
                  <div style={{ display: 'flex', gap: '0.25rem' }}>
                    <button className="btn-icon" title="Ver detalhes">
                      <Eye size={16} />
                    </button>
                    <button className="btn-icon" title="Editar">
                      <Edit3 size={16} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal - Cadastrar Nova Franquia */}
      {isModalOpen && (
        <div className="modal-overlay">
          <div className="modal-card">
            <div className="modal-header">
              <h3>Cadastrar Nova Franquia</h3>
              <button className="btn-icon" onClick={() => setIsModalOpen(false)}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreate}>
              <div className="modal-body">
                <div className="input-group">
                  <label className="input-label">Nome da Unidade / Franquia</label>
                  <input 
                    type="text" 
                    className="input-field" 
                    placeholder="Ex: Belém - Batista Campos"
                    required
                    value={newFranchise.name}
                    onChange={(e) => setNewFranchise({ ...newFranchise, name: e.target.value })}
                  />
                </div>

                <div className="input-group">
                  <label className="input-label">Franqueado Responsável</label>
                  <input 
                    type="text" 
                    className="input-field" 
                    placeholder="Ex: João da Silva"
                    required
                    value={newFranchise.owner}
                    onChange={(e) => setNewFranchise({ ...newFranchise, owner: e.target.value })}
                  />
                </div>

                <div className="form-grid-2">
                  <div className="input-group">
                    <label className="input-label">Cidade</label>
                    <input 
                      type="text" 
                      className="input-field" 
                      placeholder="Ex: Belém"
                      value={newFranchise.city}
                      onChange={(e) => setNewFranchise({ ...newFranchise, city: e.target.value })}
                    />
                  </div>

                  <div className="input-group">
                    <label className="input-label">Estado</label>
                    <select 
                      className="select-field"
                      value={newFranchise.state}
                      onChange={(e) => setNewFranchise({ ...newFranchise, state: e.target.value })}
                    >
                      <option value="PA">PA - Pará</option>
                      <option value="AM">AM - Amazonas</option>
                      <option value="AP">AP - Amapá</option>
                      <option value="MA">MA - Maranhão</option>
                      <option value="SP">SP - São Paulo</option>
                    </select>
                  </div>
                </div>

                <div className="input-group">
                  <label className="input-label">Taxa de Royalties (%)</label>
                  <input 
                    type="text" 
                    className="input-field" 
                    placeholder="6%"
                    value={newFranchise.royalties}
                    onChange={(e) => setNewFranchise({ ...newFranchise, royalties: e.target.value })}
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setIsModalOpen(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary">
                  Salvar Franquia
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
