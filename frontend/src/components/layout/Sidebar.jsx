import { LogOut, X, Grid2x2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { NAV_GROUPS } from '../../routes/navConfig.js';
import { clearCurrentUser, podeVerAuditoria } from '../../lib/auth.js';
import SidebarNavItem from './SidebarNavItem.jsx';

export default function Sidebar({ user, open, onClose }) {
  const navigate = useNavigate();

  function sair() {
    clearCurrentUser();
    navigate('/login', { replace: true });
  }

  function trocarModulo() {
    navigate('/modulos');
    onClose?.();
  }

  const groups = NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => {
      if (item.auditoriaOnly) return podeVerAuditoria(user);
      return item.roles.includes(user?.role);
    }),
  })).filter((group) => group.items.length > 0);

  return (
    <>
      {open && (
        <button
          type="button"
          aria-label="Fechar menu"
          onClick={onClose}
          className="fixed inset-0 z-30 bg-slate-900/40 md:hidden"
        />
      )}
      <aside
        className={`fixed md:sticky top-0 z-40 h-screen w-72 md:w-64 bg-slate-50 border-r border-slate-200 shadow-sm flex flex-col transition-transform duration-300 md:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between gap-3 p-4 border-b border-slate-200">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 shrink-0 rounded-lg bg-gradient-to-tr from-blue-600 to-emerald-500 shadow-lg shadow-blue-500/30" />
            <div className="min-w-0">
              <p className="font-serif font-bold text-slate-800 truncate">HuB Operações</p>
              <p className="text-slate-500 text-xs truncate">Cacau Show · Faça Amigos</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="md:hidden text-slate-400 hover:text-slate-600">
            <X size={20} />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
          {groups.map((group) => (
            <div key={group.title}>
              <p className="px-3 mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">{group.title}</p>
              <div className="space-y-1">
                {group.items.map((item) => (
                  <SidebarNavItem key={item.path} to={item.path} label={item.label} icon={item.icon} onClick={onClose} />
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="p-3 border-t border-slate-200 space-y-1">
          <button
            type="button"
            onClick={trocarModulo}
            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm text-slate-600 hover:bg-slate-200/60 transition-colors"
          >
            <Grid2x2 size={18} />
            Trocar módulo
          </button>
          <div className="flex items-center justify-between gap-2 px-3 py-2">
            <div className="min-w-0">
              <p className="text-sm font-bold text-slate-800 truncate">{user?.nome}</p>
              <p className="text-xs text-slate-500 truncate">{user?.role}</p>
            </div>
            <button
              type="button"
              onClick={sair}
              title="Sair"
              className="text-slate-400 hover:text-rose-600 rounded-full p-1.5 hover:bg-rose-50 transition-colors"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
