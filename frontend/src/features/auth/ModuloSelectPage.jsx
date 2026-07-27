import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { MODULOS } from '../../routes/navConfig.js';
import { clearCurrentUser, getCurrentUser, setModuloAtual } from '../../lib/auth.js';

export default function ModuloSelectPage() {
  const navigate = useNavigate();
  const user = getCurrentUser();

  useEffect(() => {
    if (!user) navigate('/login', { replace: true });
  }, [user, navigate]);

  if (!user) return null;

  const disponiveis = MODULOS.filter((m) => m.roles.includes(user.role));

  function escolher(modulo) {
    setModuloAtual(modulo.key);
    navigate(modulo.home);
  }

  function sair() {
    clearCurrentUser();
    navigate('/login', { replace: true });
  }

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        <div className="flex items-center justify-between mb-8">
          <div>
            <p className="text-slate-500 text-sm">Olá, {user.nome}</p>
            <h1 className="font-serif text-2xl font-bold text-slate-800">Escolha um módulo</h1>
          </div>
          <button
            type="button"
            onClick={sair}
            className="flex items-center gap-2 text-sm text-slate-500 hover:text-rose-600 font-bold"
          >
            <LogOut size={16} /> Sair
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {disponiveis.map((modulo) => {
            const Icon = modulo.icon;
            const gradients = {
              blue: 'from-blue-600 to-indigo-700 shadow-blue-500/10',
              emerald: 'from-emerald-500 to-teal-600 shadow-emerald-500/10',
              amber: 'from-amber-500 to-orange-600 shadow-amber-500/10',
              rose: 'from-rose-500 to-red-600 shadow-rose-500/10',
            };
            return (
              <button
                key={modulo.key}
                type="button"
                onClick={() => escolher(modulo)}
                className={`text-left rounded-2xl p-6 text-white bg-gradient-to-br shadow-lg transition-all duration-300 hover:scale-[1.02] ${gradients[modulo.gradient]}`}
              >
                <div className="w-11 h-11 rounded-xl bg-white/15 flex items-center justify-center mb-4">
                  <Icon size={22} />
                </div>
                <p className="text-lg font-bold">{modulo.label}</p>
                <p className="text-sm text-white/80 mt-1">{modulo.description}</p>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
