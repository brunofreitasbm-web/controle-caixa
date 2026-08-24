import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Store,
  Award,
  Settings,
  ShieldCheck,
  LogOut,
  Building2
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import './Sidebar.css';

export function Sidebar() {
  const { bootstrap, session, logout } = useAuth();

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="brand-icon"><ShieldCheck size={18} /></div>
        <div>
          <span className="brand-name">{bootstrap?.organizacao?.nome || 'Huboperações'}</span>
          <span className="brand-badge" style={{ marginLeft: '6px' }}>Painel da Plataforma</span>
        </div>
      </div>

      <nav className="sidebar-nav">
        <div className="nav-section-label">Geral</div>
        <NavLink to="/" end className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <LayoutDashboard />
          <span>Dashboard</span>
        </NavLink>

        <NavLink to="/unidades" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <Store />
          <span>Unidades</span>
        </NavLink>

        <div className="nav-section-label">Plataforma</div>
        <NavLink to="/plano" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <Award />
          <span>Plano</span>
        </NavLink>

        {session?.isPlatformAdmin && (
          <NavLink to="/organizacoes" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <Building2 />
            <span>Organizações</span>
          </NavLink>
        )}

        <div className="nav-section-label">Sistema</div>
        <NavLink to="/settings" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <Settings />
          <span>Configurações</span>
        </NavLink>
      </nav>

      <div className="sidebar-footer">
        <div className="user-profile-card">
          <div className="user-avatar">{(session?.usuario || '?').slice(0, 2).toUpperCase()}</div>
          <div className="user-info">
            <span className="user-name">{session?.usuario || '—'}</span>
            <span className="user-role">{session?.role || 'owner'}</span>
          </div>
          <button className="btn-icon" title="Sair" style={{ marginLeft: 'auto' }} onClick={logout}>
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </aside>
  );
}
