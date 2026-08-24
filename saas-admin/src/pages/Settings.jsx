import React, { useState } from 'react';
import { 
  Sliders, 
  CreditCard, 
  Globe, 
  Bell, 
  ShieldCheck, 
  Save, 
  CheckCircle2 
} from 'lucide-react';
import './Settings.css';

export function Settings() {
  const [activeTab, setActiveTab] = useState('general');
  const [saved, setSaved] = useState(false);

  const [form, setForm] = useState({
    saasName: 'FranqHub',
    defaultRoyaltyRate: '6.0',
    currency: 'BRL (R$)',
    gatewayKey: 'pk_live_8392104829104812',
    whatsappApiToken: 'wa_token_941041920491024',
    enableNotifications: true,
    require2FA: true
  });

  const handleSave = (e) => {
    e.preventDefault();
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <div className="page-container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1>Configurações SaaS</h1>
          <p>Ajustes globais do sistema, integrações financeiras e regras de negócio.</p>
        </div>

        {saved && (
          <div className="badge badge-success" style={{ fontSize: '0.875rem', padding: '0.5rem 0.875rem' }}>
            <CheckCircle2 size={16} />
            <span>Configurações salvas com sucesso!</span>
          </div>
        )}
      </div>

      <div className="settings-grid">
        {/* Navigation */}
        <div className="settings-nav">
          <button 
            className={`settings-nav-btn ${activeTab === 'general' ? 'active' : ''}`}
            onClick={() => setActiveTab('general')}
          >
            <Sliders size={18} />
            <span>Geral & Parâmetros</span>
          </button>

          <button 
            className={`settings-nav-btn ${activeTab === 'integrations' ? 'active' : ''}`}
            onClick={() => setActiveTab('integrations')}
          >
            <CreditCard size={18} />
            <span>Gateways & Pagamento</span>
          </button>

          <button 
            className={`settings-nav-btn ${activeTab === 'security' ? 'active' : ''}`}
            onClick={() => setActiveTab('security')}
          >
            <ShieldCheck size={18} />
            <span>Segurança & Acesso</span>
          </button>
        </div>

        {/* Content Panel */}
        <div className="card">
          <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {activeTab === 'general' && (
              <>
                <div>
                  <h3>Parâmetros da Franqueadora</h3>
                  <p style={{ fontSize: '0.8125rem' }}>Defina o nome da plataforma e as alíquotas padrão.</p>
                </div>

                <div className="input-group">
                  <label className="input-label">Nome da Plataforma SaaS</label>
                  <input 
                    type="text" 
                    className="input-field" 
                    value={form.saasName}
                    onChange={(e) => setForm({ ...form, saasName: e.target.value })}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div className="input-group">
                    <label className="input-label">Alíquota Padrão de Royalties (%)</label>
                    <input 
                      type="text" 
                      className="input-field" 
                      value={form.defaultRoyaltyRate}
                      onChange={(e) => setForm({ ...form, defaultRoyaltyRate: e.target.value })}
                    />
                  </div>

                  <div className="input-group">
                    <label className="input-label">Moeda Padrão</label>
                    <input 
                      type="text" 
                      className="input-field" 
                      value={form.currency}
                      disabled
                    />
                  </div>
                </div>
              </>
            )}

            {activeTab === 'integrations' && (
              <>
                <div>
                  <h3>Integração com Gateway de Pagamento</h3>
                  <p style={{ fontSize: '0.8125rem' }}>Conecte seu gateway para cobrança automática dos royalties via PIX/Boleto.</p>
                </div>

                <div className="input-group">
                  <label className="input-label">Chave de API do Gateway (Asaas / MercadoPago)</label>
                  <input 
                    type="password" 
                    className="input-field" 
                    value={form.gatewayKey}
                    onChange={(e) => setForm({ ...form, gatewayKey: e.target.value })}
                  />
                </div>

                <div className="input-group">
                  <label className="input-label">Token API de Notificações WhatsApp</label>
                  <input 
                    type="password" 
                    className="input-field" 
                    value={form.whatsappApiToken}
                    onChange={(e) => setForm({ ...form, whatsappApiToken: e.target.value })}
                  />
                </div>
              </>
            )}

            {activeTab === 'security' && (
              <>
                <div>
                  <h3>Segurança e Políticas de Acesso</h3>
                  <p style={{ fontSize: '0.8125rem' }}>Proteção da conta Master e autenticação dos franqueados.</p>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer', fontSize: '0.875rem' }}>
                    <input 
                      type="checkbox" 
                      checked={form.require2FA}
                      onChange={(e) => setForm({ ...form, require2FA: e.target.checked })}
                    />
                    <span>Exigir Autenticação de Dois Fatores (2FA) para Administradores</span>
                  </label>

                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer', fontSize: '0.875rem' }}>
                    <input 
                      type="checkbox" 
                      checked={form.enableNotifications}
                      onChange={(e) => setForm({ ...form, enableNotifications: e.target.checked })}
                    />
                    <span>Enviar alertas por e-mail quando houver faturas atrasadas</span>
                  </label>
                </div>
              </>
            )}

            <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1.25rem', display: 'flex', justifyContent: 'flex-end' }}>
              <button type="submit" className="btn btn-primary">
                <Save size={16} />
                <span>Salvar Configurações</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
