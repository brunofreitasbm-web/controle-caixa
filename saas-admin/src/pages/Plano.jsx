import React, { useEffect, useState } from 'react';
import { CheckCircle2, Award, Layers } from 'lucide-react';
import { api } from '../lib/api';
import './Plano.css';

export function Plano() {
  const [plano, setPlano] = useState(null);
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    api.plano()
      .then(setPlano)
      .catch((e) => setErro(e.message))
      .finally(() => setCarregando(false));
  }, []);

  return (
    <div className="page-container">
      <div>
        <h1>Plano da Organização</h1>
        <p>Catálogo real de precificação por quantidade de unidades ativas — GET /tenant/plano.</p>
      </div>

      {carregando && <p className="text-muted">Carregando...</p>}
      {erro && <p className="login-error" style={{ maxWidth: '480px' }}>{erro}</p>}

      {plano && (
        <>
          <div className="financial-summary-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
            <div className="card">
              <div className="financial-card-header">
                <span className="kpi-title">Unidades Ativas</span>
                <div className="kpi-icon"><Layers size={20} /></div>
              </div>
              <span className="kpi-value">{plano.unidadesAtivas}</span>
            </div>

            <div className="card">
              <div className="financial-card-header">
                <span className="kpi-title">Faixa Atual</span>
                <div className="kpi-icon" style={{ backgroundColor: 'var(--brand-primary-light)', color: 'var(--brand-primary)' }}><Award size={20} /></div>
              </div>
              <span className="kpi-value" style={{ fontSize: '1.25rem' }}>{plano.faixaAtual?.nome || 'Sem faixa cadastrada'}</span>
            </div>

            <div className="card">
              <div className="financial-card-header">
                <span className="kpi-title">Mensalidade da Faixa</span>
                <div className="kpi-icon" style={{ backgroundColor: 'var(--accent-success-bg)', color: 'var(--accent-success)' }}><CheckCircle2 size={20} /></div>
              </div>
              <span className="kpi-value">
                {plano.faixaAtual ? `R$ ${Number(plano.faixaAtual.valorMensal).toLocaleString('pt-BR')}` : '—'}
              </span>
            </div>
          </div>

          <div className="table-container">
            <table className="custom-table">
              <thead>
                <tr>
                  <th>Faixa</th>
                  <th>Unidades</th>
                  <th>Mensalidade</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {plano.faixas.map((f) => (
                  <tr key={f.id}>
                    <td style={{ fontWeight: 700 }}>{f.nome}</td>
                    <td>{f.unidadesMin}–{f.unidadesMax ?? '∞'}</td>
                    <td>R$ {Number(f.valorMensal).toLocaleString('pt-BR')}/mês</td>
                    <td>
                      {plano.faixaAtual?.id === f.id
                        ? <span className="badge badge-success"><CheckCircle2 size={12} />Faixa atual</span>
                        : <span className="text-muted">—</span>}
                    </td>
                  </tr>
                ))}
                {plano.faixas.length === 0 && (
                  <tr><td colSpan={4} className="text-muted">Nenhuma faixa de precificação cadastrada em planos_precificacao.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
