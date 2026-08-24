import React, { useState } from 'react';
import { 
  DollarSign, 
  CreditCard, 
  AlertCircle, 
  CheckCircle2, 
  Clock, 
  Download, 
  FileText,
  Send,
  Calendar
} from 'lucide-react';
import './Financial.css';

const initialInvoices = [
  { id: 'FAT-2026-081', franchise: 'Ananindeua - Coqueiro', grossRevenue: 142500, royaltyRate: '6%', amount: 8550, dueDate: '2026-08-10', status: 'Pago', paidAt: '2026-08-08' },
  { id: 'FAT-2026-082', franchise: 'Belém - Umarizal', grossRevenue: 128900, royaltyRate: '6%', amount: 7734, dueDate: '2026-08-10', status: 'Pago', paidAt: '2026-08-09' },
  { id: 'FAT-2026-083', franchise: 'Castanhal - Centro', grossRevenue: 115000, royaltyRate: '6%', amount: 6900, dueDate: '2026-08-10', status: 'Pago', paidAt: '2026-08-10' },
  { id: 'FAT-2026-084', franchise: 'Manaus - Adrianópolis', grossRevenue: 98400, royaltyRate: '6.5%', amount: 6396, dueDate: '2026-08-10', status: 'Atrasado', paidAt: null },
  { id: 'FAT-2026-085', franchise: 'Macapá - Shopping', grossRevenue: 89200, royaltyRate: '6%', amount: 5352, dueDate: '2026-08-25', status: 'Pendente', paidAt: null },
];

export function Financial() {
  const [invoices, setInvoices] = useState(initialInvoices);

  return (
    <div className="page-container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1>Royalties & Faturamento SaaS</h1>
          <p>Cobrança de mensalidades e royalties calculados sobre o faturamento das franquias.</p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button className="btn btn-secondary">
            <Download size={18} />
            <span>Exportar Relatório</span>
          </button>
          <button className="btn btn-primary">
            <Send size={18} />
            <span>Gerar Faturas do Mês</span>
          </button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="financial-summary-grid">
        <div className="card">
          <div className="financial-card-header">
            <span className="kpi-title">Total Arrecadado (Mês)</span>
            <div className="kpi-icon" style={{ backgroundColor: 'var(--accent-success-bg)', color: 'var(--accent-success)' }}>
              <CheckCircle2 size={20} />
            </div>
          </div>
          <span className="kpi-value">R$ 23.184</span>
          <p className="text-muted" style={{ fontSize: '0.75rem', marginTop: '0.5rem' }}>3 de 5 faturas quitadas</p>
        </div>

        <div className="card">
          <div className="financial-card-header">
            <span className="kpi-title">Pendentes de Pagamento</span>
            <div className="kpi-icon" style={{ backgroundColor: 'var(--accent-warning-bg)', color: 'var(--accent-warning)' }}>
              <Clock size={20} />
            </div>
          </div>
          <span className="kpi-value">R$ 5.352</span>
          <p className="text-muted" style={{ fontSize: '0.75rem', marginTop: '0.5rem' }}>Vencimento em 25/08</p>
        </div>

        <div className="card">
          <div className="financial-card-header">
            <span className="kpi-title">Faturas em Atraso</span>
            <div className="kpi-icon" style={{ backgroundColor: 'var(--accent-danger-bg)', color: 'var(--accent-danger)' }}>
              <AlertCircle size={20} />
            </div>
          </div>
          <span className="kpi-value" style={{ color: 'var(--accent-danger-text)' }}>R$ 6.396</span>
          <p className="text-muted" style={{ fontSize: '0.75rem', marginTop: '0.5rem' }}>1 unidade inadimplente</p>
        </div>

        <div className="card">
          <div className="financial-card-header">
            <span className="kpi-title">Taxa Média de Royalties</span>
            <div className="kpi-icon" style={{ backgroundColor: 'var(--brand-primary-light)', color: 'var(--brand-primary)' }}>
              <CreditCard size={20} />
            </div>
          </div>
          <span className="kpi-value">6.1%</span>
          <p className="text-muted" style={{ fontSize: '0.75rem', marginTop: '0.5rem' }}>Contratual da rede</p>
        </div>
      </div>

      {/* Invoices Table */}
      <div className="table-container">
        <table className="custom-table">
          <thead>
            <tr>
              <th>Cód. Fatura</th>
              <th>Unidade Franquia</th>
              <th>Fat. Bruto Base</th>
              <th>Alíquota Royalties</th>
              <th>Valor Valor Royalties</th>
              <th>Vencimento</th>
              <th>Status</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map(inv => (
              <tr key={inv.id}>
                <td>
                  <span style={{ fontWeight: 700 }}>{inv.id}</span>
                </td>
                <td>
                  <span style={{ fontWeight: 500 }}>{inv.franchise}</span>
                </td>
                <td>
                  <span>R$ {inv.grossRevenue.toLocaleString()}</span>
                </td>
                <td>
                  <span style={{ fontWeight: 600, color: 'var(--brand-primary)' }}>{inv.royaltyRate}</span>
                </td>
                <td>
                  <span style={{ fontWeight: 700 }}>R$ {inv.amount.toLocaleString()}</span>
                </td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.8125rem' }}>
                    <Calendar size={14} className="text-muted" />
                    <span>{inv.dueDate}</span>
                  </div>
                </td>
                <td>
                  <span className={`badge ${
                    inv.status === 'Pago' ? 'badge-success' :
                    inv.status === 'Pendente' ? 'badge-warning' : 'badge-danger'
                  }`}>
                    {inv.status === 'Pago' && <CheckCircle2 size={12} />}
                    {inv.status === 'Pendente' && <Clock size={12} />}
                    {inv.status === 'Atrasado' && <AlertCircle size={12} />}
                    {inv.status}
                  </span>
                </td>
                <td>
                  <div style={{ display: 'flex', gap: '0.375rem' }}>
                    <button className="btn-icon" title="Baixar PDF Fatura">
                      <FileText size={16} />
                    </button>
                    {inv.status === 'Atrasado' && (
                      <button className="btn btn-sm btn-secondary" style={{ color: 'var(--accent-danger-text)' }}>
                        Reenviar Cobrança
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
