import { Menu } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { NAV_GROUPS } from '../../routes/navConfig.js';
import RealtimeIndicator from './RealtimeIndicator.jsx';

const FLAT_ITEMS = NAV_GROUPS.flatMap((g) => g.items);

function tituloAtual(pathname) {
  const item = FLAT_ITEMS.find((i) => pathname.startsWith(i.path));
  return item?.label || 'HuB Operações';
}

export default function Topbar({ onMenuClick }) {
  const location = useLocation();

  return (
    <header className="sticky top-0 z-20 bg-white/90 backdrop-blur-sm border-b border-gray-200 px-4 md:px-8 py-3 flex items-center justify-between gap-4">
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          onClick={onMenuClick}
          className="md:hidden text-slate-500 hover:text-slate-700 rounded-lg p-1.5 hover:bg-slate-100"
        >
          <Menu size={22} />
        </button>
        <h1 className="text-base md:text-lg font-bold text-slate-800 truncate">{tituloAtual(location.pathname)}</h1>
      </div>
      <RealtimeIndicator />
    </header>
  );
}
