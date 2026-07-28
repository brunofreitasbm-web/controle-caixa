import { useState } from 'react';
import { LogOut, X, ChevronDown } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { NAV_GROUPS } from '../../routes/navConfig.js';
import { clearCurrentUser, podeVerAuditoria } from '../../lib/auth.js';
import SidebarNavItem from './SidebarNavItem.jsx';

function filterItem(item, user) {
  if (item.auditoriaOnly) {
    if (!podeVerAuditoria(user)) return null;
  } else if (!item.roles.includes(user?.role)) {
    return null;
  }
  const children = (item.children || []).map((c) => filterItem(c, user)).filter(Boolean);
  return { ...item, children };
}

function filterGroup(group, user) {
  if (group.subgroups) {
    const subgroups = group.subgroups
      .map((sg) => ({ ...sg, items: sg.items.map((i) => filterItem(i, user)).filter(Boolean) }))
      .filter((sg) => sg.items.length > 0);
    return subgroups.length ? { ...group, subgroups } : null;
  }
  const items = (group.items || []).map((i) => filterItem(i, user)).filter(Boolean);
  return items.length ? { ...group, items } : null;
}

function NavItemWithChildren({ item, onClick }) {
  return (
    <div>
      <SidebarNavItem to={item.path} label={item.label} icon={item.icon} onClick={onClick} />
      {item.children?.length > 0 && (
        <div className="ml-5 mt-1 space-y-1 border-l border-slate-200 pl-2">
          {item.children.map((child) => (
            <SidebarNavItem key={child.path} to={child.path} label={child.label} icon={child.icon} onClick={onClick} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function Sidebar({ user, open, onClose }) {
  const navigate = useNavigate();
  const [openGroups, setOpenGroups] = useState(() =>
    Object.fromEntries(NAV_GROUPS.filter((g) => g.collapsible).map((g) => [g.title, g.defaultOpen ?? true]))
  );

  function sair() {
    clearCurrentUser();
    navigate('/login', { replace: true });
  }

  function toggleGroup(title) {
    setOpenGroups((s) => ({ ...s, [title]: !s[title] }));
  }

  const groups = NAV_GROUPS.map((group) => filterGroup(group, user)).filter(Boolean);

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
            <div key={group.title || 'top'}>
              {group.title &&
                (group.collapsible ? (
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.title)}
                    className="w-full flex items-center justify-between px-3 mb-2 text-xs font-bold uppercase tracking-wide text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    {group.title}
                    <ChevronDown
                      size={14}
                      className={`transition-transform ${openGroups[group.title] ? '' : '-rotate-90'}`}
                    />
                  </button>
                ) : (
                  <p className="px-3 mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">{group.title}</p>
                ))}

              {(!group.collapsible || openGroups[group.title]) && (
                <div className="space-y-1">
                  {group.subgroups
                    ? group.subgroups.map((sg) => (
                        <div key={sg.title} className="mb-3 last:mb-0">
                          <p className="px-3 mb-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-400/80">
                            {sg.title}
                          </p>
                          <div className="space-y-1">
                            {sg.items.map((item) => (
                              <NavItemWithChildren key={item.path} item={item} onClick={onClose} />
                            ))}
                          </div>
                        </div>
                      ))
                    : group.items.map((item) => <NavItemWithChildren key={item.path} item={item} onClick={onClose} />)}
                </div>
              )}
            </div>
          ))}
        </nav>

        <div className="p-3 border-t border-slate-200 space-y-1">
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
