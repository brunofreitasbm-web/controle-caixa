import React, { useEffect, useState } from 'react';
import { Sliders, Bot, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import './Settings.css';

const MODULOS_TOGGLE_LABELS = {
  'faca-amigos': 'Faça Amigos',
  nfe: 'Conferência/Faturamento de NF-e',
  inventario: 'Inventário de Estoque',
  ponto: 'Controle de Ponto',
  'metas-xlsx': 'Importação de Metas (XLSX)',
  'rh-modulo': 'Módulo RH'
};

export function Settings() {
  const { bootstrap, recarregar } = useAuth();
  const [activeTab, setActiveTab] = useState('modulos');
  const [iaConfig, setIaConfig] = useState({ iaSistemaBriefing: '', iaSistemaCopiloto: '' });
  const [erro, setErro] = useState('');
  const [salvo, setSalvo] = useState('');
  const [alternando, setAlternando] = useState(null);

  useEffect(() => {
    api.iaConfig().then(setIaConfig).catch((e) => setErro(e.message));
  }, []);

  const modulos = bootstrap?.modulos || {};

  const alternarModulo = async (chave) => {
    setAlternando(chave);
    setErro('');
    try {
      await api.alternarModulo(chave, !modulos[chave]);
      await recarregar();
    } catch (e) {
      setErro(e.message);
    } finally {
      setAlternando(null);
    }
  };

  const salvarIa = async (chave) => {
    setErro('');
    try {
      await api.salvarIaConfig(chave, iaConfig[chave]);
      setSalvo(chave);
      setTimeout(() => setSalvo(''), 2500);
    } catch (e) {
      setErro(e.message);
    }
  };

  return (
    <div className="page-container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1>Configurações da Organização</h1>
          <p>Feature flags e persona de IA reais — PUT /tenant/modules/:chave, PUT /tenant/ia-config.</p>
        </div>
      </div>

      {erro && <p className="login-error" style={{ maxWidth: '480px' }}>{erro}</p>}

      <div className="settings-grid">
        <div className="settings-nav">
          <button
            className={`settings-nav-btn ${activeTab === 'modulos' ? 'active' : ''}`}
            onClick={() => setActiveTab('modulos')}
          >
            <Sliders size={18} />
            <span>Módulos</span>
          </button>

          <button
            className={`settings-nav-btn ${activeTab === 'ia' ? 'active' : ''}`}
            onClick={() => setActiveTab('ia')}
          >
            <Bot size={18} />
            <span>Persona de IA</span>
          </button>
        </div>

        <div className="card">
          {activeTab === 'modulos' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <h3>Módulos habilitados nesta organização</h3>
                <p style={{ fontSize: '0.8125rem' }}>Desligar aqui esconde o módulo na sidebar do app principal (webapp/app.js) e o servidor passa a validar o toggle.</p>
              </div>

              {Object.keys(MODULOS_TOGGLE_LABELS).map((chave) => (
                <label key={chave} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer', fontSize: '0.875rem' }}>
                  <input
                    type="checkbox"
                    checked={!!modulos[chave]}
                    disabled={alternando === chave}
                    onChange={() => alternarModulo(chave)}
                  />
                  <span>{MODULOS_TOGGLE_LABELS[chave]}</span>
                  {alternando === chave && <span className="text-muted" style={{ fontSize: '0.75rem' }}>salvando...</span>}
                </label>
              ))}
            </div>
          )}

          {activeTab === 'ia' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <div>
                <h3>Persona de IA (briefing e copiloto)</h3>
                <p style={{ fontSize: '0.8125rem' }}>Texto livre que substitui o "sistema" padrão enviado ao provedor de IA. Vazio = usa o padrão de fábrica.</p>
              </div>

              {['iaSistemaBriefing', 'iaSistemaCopiloto'].map((chave) => (
                <div className="input-group" key={chave}>
                  <label className="input-label">{chave === 'iaSistemaBriefing' ? 'Sistema do Briefing' : 'Sistema do Copiloto'}</label>
                  <textarea
                    className="input-field"
                    rows={4}
                    value={iaConfig[chave] || ''}
                    onChange={(e) => setIaConfig({ ...iaConfig, [chave]: e.target.value })}
                  />
                  <button type="button" className="btn btn-primary btn-sm" style={{ alignSelf: 'flex-start', marginTop: '0.5rem' }} onClick={() => salvarIa(chave)}>
                    <span>Salvar</span>
                  </button>
                  {salvo === chave && (
                    <span className="badge badge-success" style={{ marginTop: '0.5rem', width: 'fit-content' }}>
                      <CheckCircle2 size={12} /> Salvo
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
