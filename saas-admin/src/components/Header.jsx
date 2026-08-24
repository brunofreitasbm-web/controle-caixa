import React from 'react';
import { Search, ShieldCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import './Header.css';

export function Header() {
  const { bootstrap } = useAuth();
  const unidadesAtivas = bootstrap?.unidades?.length ?? null;

  return (
    <header className="header">
      <div className="header-left">
        <div className="search-input-container header-search">
          <Search size={16} />
          <input
            type="text"
            className="input-field"
            placeholder="Buscar unidades..."
          />
        </div>
      </div>

      <div className="header-right">
        <div className="status-pill">
          <span className="status-dot"></span>
          <span>{unidadesAtivas === null ? 'Sem sessão' : `${unidadesAtivas} unidade(s) ativa(s)`}</span>
        </div>

        <button className="icon-button" title="Segurança & Compliance">
          <ShieldCheck size={18} />
        </button>
      </div>
    </header>
  );
}
