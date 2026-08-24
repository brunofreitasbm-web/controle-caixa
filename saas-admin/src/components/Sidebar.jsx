import React from 'react';
import { NavLink } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Store, 
  DollarSign, 
  Users, 
  HelpCircle, 
  Settings, 
  Building2,
  PieChart,
  FileText
} from 'lucide-react';
import './Sidebar.css';

export function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="brand-icon">F</div>
        <div>
          <span className="brand-name">FranqHub</span>
          <span className="brand-badge" style={{ marginLeft: '6px' }}>SaaS Master</span>
        </div>
      </div>

      <nav className="sidebar-nav">
        <div className="nav-section-label">Geral</div>
        <NavLink to="/" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <LayoutDashboard />
          <span>Dashboard Master</span>
        </NavLink>

        <NavLink to="/franchises" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <Store />
          <span>Franquias & Unidades</span>
        </NavLink>

        <div className="nav-section-label">Gestão Financeira</div>
        <NavLink to="/financial" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <DollarSign />
          <span>Royalties & Faturamento</span>
        </NavLink>

        <NavLink to="/users" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <Users />
          <span>Gestores & Franqueados</span>
        </NavLink>

        <div className="nav-section-label">Operação & Suporte</div>
        <NavLink to="/support" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <HelpCircle />
          <span>Central de Suporte</span>
        </NavLink>

        <div className="nav-section-label">Sistema</div>
        <NavLink to="/settings" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <Settings />
          <span>Configurações SaaS</span>
        </NavLink>
      </nav>

      <div className="sidebar-footer">
        <div className="user-profile-card">
          <div className="user-avatar">BF</div>
          <div className="user-info">
            <span className="user-name">Bruno Freitas</span>
            <span className="user-role">Administrador Master</span>
          </div>
        </div>
      </div>
    </aside>
  );
}
