import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Delete, User } from 'lucide-react';
import { api } from '../../lib/apiClient.js';
import { getCurrentUser, setCurrentUser, rotaPadraoPorRole } from '../../lib/auth.js';
import Spinner from '../../components/ui/Spinner.jsx';

export default function LoginPage() {
  const navigate = useNavigate();
  const [selected, setSelected] = useState(null);
  const [pin, setPin] = useState('');
  const [enviando, setEnviando] = useState(false);

  const colaboradoresQuery = useQuery({
    queryKey: ['colaboradores'],
    queryFn: () => api.get('/api/colaboradores'),
  });
  const pinsQuery = useQuery({
    queryKey: ['pins'],
    queryFn: () => api.get('/api/pins'),
  });

  useEffect(() => {
    const user = getCurrentUser();
    if (user) navigate(rotaPadraoPorRole(user.role), { replace: true });
  }, [navigate]);

  const usuarios = useMemo(() => {
    const colaboradores = colaboradoresQuery.data || [];
    const pins = pinsQuery.data || {};
    return colaboradores.filter((c) => Object.prototype.hasOwnProperty.call(pins, c.nome));
  }, [colaboradoresQuery.data, pinsQuery.data]);

  async function confirmarPin(valor) {
    if (!selected || valor.length < 4) return;
    setEnviando(true);
    try {
      const res = await api.post('/api/auth/verify', { usuario: selected.nome, pin: valor });
      if (res?.valid) {
        setCurrentUser({ nome: selected.nome, role: selected.role });
        toast.success(`Bem-vindo(a), ${selected.nome}!`);
        navigate(rotaPadraoPorRole(selected.role), { replace: true });
      } else {
        toast.error('PIN incorreto.');
        setPin('');
      }
    } catch (err) {
      toast.error(err.message || 'Erro ao entrar.');
      setPin('');
    } finally {
      setEnviando(false);
    }
  }

  function digitar(d) {
    if (enviando) return;
    const novo = (pin + d).slice(0, 4);
    setPin(novo);
    if (novo.length === 4) confirmarPin(novo);
  }

  function apagar() {
    setPin((p) => p.slice(0, -1));
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-100/50 via-slate-50 to-white">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-blue-600 to-emerald-500 shadow-lg shadow-blue-500/30 mb-4" />
          <h1 className="font-serif text-2xl font-bold bg-gradient-to-r from-blue-700 to-slate-800 bg-clip-text text-transparent">
            HuB Operações
          </h1>
          <p className="text-slate-500 text-sm mt-1">Entre com seu usuário e PIN</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-6 animate-fade-in">
          {!selected ? (
            <>
              <p className="text-sm font-bold text-slate-700 mb-3">Quem é você?</p>
              {colaboradoresQuery.isLoading || pinsQuery.isLoading ? (
                <div className="flex justify-center py-8">
                  <Spinner />
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-3 max-h-72 overflow-y-auto">
                  {usuarios.map((u) => (
                    <button
                      key={u.nome}
                      type="button"
                      onClick={() => {
                        setSelected(u);
                        setPin('');
                      }}
                      className="flex flex-col items-center gap-2 p-3 rounded-xl border border-slate-200 hover:border-blue-300 hover:bg-blue-50 transition-all duration-300"
                    >
                      <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-blue-600 to-emerald-500 flex items-center justify-center text-white">
                        <User size={18} />
                      </div>
                      <span className="text-xs font-bold text-slate-700 text-center truncate w-full">{u.nome}</span>
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : (
            <>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-sm text-slate-500">Olá,</p>
                  <p className="font-bold text-slate-800">{selected.nome}</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSelected(null);
                    setPin('');
                  }}
                  className="text-xs font-bold text-blue-600 hover:text-blue-700"
                >
                  Trocar
                </button>
              </div>

              <div className="flex justify-center gap-3 mb-6">
                {[0, 1, 2, 3].map((i) => (
                  <span
                    key={i}
                    className={`w-3.5 h-3.5 rounded-full border-2 ${
                      pin.length > i ? 'bg-blue-600 border-blue-600' : 'border-slate-300'
                    }`}
                  />
                ))}
              </div>

              <div className="grid grid-cols-3 gap-3">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => digitar(d)}
                    disabled={enviando}
                    className="py-3 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-800 font-bold text-lg transition-colors disabled:opacity-50"
                  >
                    {d}
                  </button>
                ))}
                <div />
                <button
                  type="button"
                  onClick={() => digitar('0')}
                  disabled={enviando}
                  className="py-3 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-800 font-bold text-lg transition-colors disabled:opacity-50"
                >
                  0
                </button>
                <button
                  type="button"
                  onClick={apagar}
                  disabled={enviando}
                  className="py-3 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-500 flex items-center justify-center transition-colors disabled:opacity-50"
                >
                  <Delete size={18} />
                </button>
              </div>
              {enviando && (
                <div className="flex justify-center mt-4">
                  <Spinner />
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
