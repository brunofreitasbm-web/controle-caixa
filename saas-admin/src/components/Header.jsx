import React from 'react';
import { Search, Bell, Moon, Sun, ShieldCheck } from 'lucide-react';
import './Header.css';

export function Header() {
  return (
    <header className="header">
      <div className="header-left">
        <div className="search-input-container header-search">
          <Search size={16} />
          <input 
            type="text" 
            className="input-field" 
            placeholder="Buscar franquias, franqueados ou faturas..." 
          />
        </div>
      </div>

      <div className="header-right">
        <div className="status-pill">
          <span className="status-dot"></span>
          <span>Rede Online (42 Unidades)</span>
        </div>

        <button className="icon-button" title="Notificações">
          <Bell size={18} />
          <span className="notification-badge"></span>
        </button>

        <button className="icon-button" title="Segurança & Compliance">
          <ShieldCheck size={18} />
        </button>
      </div>
    </header>
  );
}
