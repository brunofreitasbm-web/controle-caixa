import React, { useEffect, useState } from 'react';
import { Store, Users as UsersIcon, Layers, Award, MapPin } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import './Dashboard.css';

export function Dashboard() {
  const { bootstrap } = useAuth();
  const [plano, setPlano] = useState(null);
  const [erro, setErro] = useState('');

  useEffect(() => {
    api.plano().then(setPlano).catch((e) => setErro(e.message));
  }, []);

  const unidades = bootstrap?.unidades || [];
  const modulosAtivos = Object.values(bootstrap?.modulos || {}).filter(Boolean).length;
  const totalModulos = Object.keys(bootstrap?.modulos || {}).length;

  return (
    <div className="page-container">
      <div>
        <h1>Painel da Organização</h1>
        <p>{bootstrap?.organizacao?.nome || 'Organização'} — dados ao vivo, direto do backend multi-tenant.</p>
      </div>

      <div className="dashboard-grid">
        <div className="card kpi-card">
          <div className="kpi-header">
            <span className="kpi-title">Unidades Ativas</span>
            <div className="kpi-icon"><Store size={20} /></div>
          </div>
          <div className="kpi-value-row">
            <span className="kpi-value">{unidades.length}</span>
          </div>
          <p className="text-muted" style={{ fontSize: '0.75rem' }}>Cadastradas em Unidades (exclui Faça Amigos)</p>
        </div>

        <div className="card kpi-card">
          <div className="kpi-header">
            <span className="kpi-title">Colaboradores com Login</span>
            <div className="kpi-icon" style={{ backgroundColor: 'var(--brand-primary-light)' }}><UsersIcon size={20} /></div>
          </div>
          <div className="kpi-value-row">
            <span className="kpi-value">{bootstrap?.colaboradoresLogin?.length ?? '—'}</span>
          </div>
          <p className="text-muted" style={{ fontSize: '0.75rem' }}>Cadastrados em Colaboradores</p>
        </div>

        <div className="card kpi-card">
          <div className="kpi-header">
            <span className="kpi-title">Módulos Habilitados</span>
            <div className="kpi-icon" style={{ backgroundColor: 'var(--accent-success-bg)', color: 'var(--accent-success)' }}><Layers size={20} /></div>
          </div>
          <div className="kpi-value-row">
            <span className="kpi-value">{modulosAtivos}/{totalModulos || '—'}</span>
          </div>
          <p className="text-muted" style={{ fontSize: '0.75rem' }}>Feature flags desta organização</p>
        </div>

        <div className="card kpi-card">
          <div className="kpi-header">
            <span className="kpi-title">Plano Atual</span>
            <div className="kpi-icon" style={{ backgroundColor: 'var(--accent-purple-bg)', color: 'var(--accent-purple)' }}><Award size={20} /></div>
          </div>
          <div className="kpi-value-row">
            <span className="kpi-value" style={{ fontSize: '1.25rem' }}>{plano?.faixaAtual?.nome || (erro ? 'indisponível' : '...')}</span>
          </div>
          <p className="text-muted" style={{ fontSize: '0.75rem' }}>
            {plano ? `${plano.unidadesAtivas} unidade(s) ativa(s)` : erro}
          </p>
        </div>
      </div>

      <div className="dashboard-charts-grid">
        <div className="card">
          <div className="chart-card-header">
            <div>
              <h3>Unidades cadastradas</h3>
              <p style={{ fontSize: '0.8125rem' }}>Vindo de GET /tenant/bootstrap — mesma fonte usada pela operação do dia a dia.</p>
            </div>
          </div>

          <div className="top-franchises-list">
            {unidades.length === 0 && <p className="text-muted" style={{ fontSize: '0.875rem' }}>Nenhuma unidade ativa cadastrada ainda.</p>}
            {unidades.map((u) => (
              <div key={u.id} className="franchise-rank-item">
                <div className="franchise-rank-info">
                  <div className="rank-badge">{u.corEmoji || <MapPin size={14} />}</div>
                  <div>
                    <span style={{ fontSize: '0.875rem', fontWeight: 600, display: 'block' }}>{u.nome}</span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{u.negocioChave}{u.codigoExterno ? ` · ${u.codigoExterno}` : ''}</span>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{u.abertura || '—'}–{u.fechamento || '—'}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="chart-card-header">
            <div>
              <h3>Faixas de precificação</h3>
              <p style={{ fontSize: '0.8125rem' }}>Catálogo real da plataforma (GET /tenant/plano).</p>
            </div>
          </div>
          <div className="top-franchises-list">
            {!plano && !erro && <p className="text-muted" style={{ fontSize: '0.875rem' }}>Carregando...</p>}
            {erro && <p className="text-muted" style={{ fontSize: '0.875rem' }}>{erro}</p>}
            {plano?.faixas?.map((f) => (
              <div key={f.id} className={`franchise-rank-item ${plano.faixaAtual?.id === f.id ? 'rank-current' : ''}`}>
                <div className="franchise-rank-info">
                  <div>
                    <span style={{ fontSize: '0.875rem', fontWeight: 600, display: 'block' }}>{f.nome}</span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      {f.unidadesMin}–{f.unidadesMax ?? '∞'} unidade(s)
                    </span>
                  </div>
                </div>
                <span style={{ fontSize: '0.875rem', fontWeight: 700 }}>R$ {Number(f.valorMensal).toLocaleString('pt-BR')}/mês</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
