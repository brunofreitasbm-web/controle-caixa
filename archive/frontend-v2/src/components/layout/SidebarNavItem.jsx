import { NavLink } from 'react-router-dom';

export default function SidebarNavItem({ to, label, icon: Icon, badge, onClick }) {
  return (
    <NavLink
      to={to}
      onClick={onClick}
      className={({ isActive }) =>
        `flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm transition-colors ${
          isActive
            ? 'bg-blue-50 text-blue-700 font-bold border border-blue-200/80'
            : 'text-slate-600 hover:bg-slate-200/60 border border-transparent'
        }`
      }
    >
      {Icon && <Icon size={18} className="shrink-0" />}
      <span className="flex-1 truncate">{label}</span>
      {badge}
    </NavLink>
  );
}
