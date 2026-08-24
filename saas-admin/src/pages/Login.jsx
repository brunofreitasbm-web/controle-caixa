import React, { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import './Login.css';

export function Login() {
  const { login } = useAuth();
  const [usuario, setUsuario] = useState('');
  const [pin, setPin] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErro('');
    setEnviando(true);
    try {
      await login(usuario.trim(), pin.trim());
    } catch (err) {
      setErro(err.message || 'Não foi possível entrar.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="login-screen">
      <form className="login-card" onSubmit={handleSubmit}>
        <div className="login-brand">
          <div className="brand-icon"><ShieldCheck size={20} /></div>
          <div>
            <span className="brand-name">Huboperações</span>
            <span className="brand-badge">Painel da Plataforma</span>
          </div>
        </div>

        <p className="login-hint">Entre com o mesmo usuário e PIN da operação (papel owner necessário para as telas de gestão).</p>

        <div className="input-group">
          <label className="input-label">Usuário</label>
          <input
            className="input-field"
            type="text"
            autoFocus
            value={usuario}
            onChange={(e) => setUsuario(e.target.value)}
            placeholder="Nome cadastrado em Colaboradores"
            required
          />
        </div>

        <div className="input-group">
          <label className="input-label">PIN</label>
          <input
            className="input-field"
            type="password"
            inputMode="numeric"
            maxLength={4}
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            placeholder="4 dígitos"
            required
          />
        </div>

        {erro && <p className="login-error">{erro}</p>}

        <button className="btn btn-primary" type="submit" disabled={enviando}>
          {enviando ? 'Entrando...' : 'Entrar'}
        </button>
      </form>
    </div>
  );
}
