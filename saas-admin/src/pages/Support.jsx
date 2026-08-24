import React, { useState } from 'react';
import { 
  HelpCircle, 
  MessageSquare, 
  Clock, 
  CheckCircle, 
  User, 
  Send,
  Filter
} from 'lucide-react';
import './Support.css';

const initialTickets = [
  { id: 'TCK-1092', subject: 'Dúvida sobre fechamento de caixa mensal', franchise: 'Manaus - Adrianópolis', requester: 'Fernanda Rocha', date: 'Hoje às 14:20', priority: 'Alta', status: 'Aberto', message: 'Olá equipe master, estamos com uma divergência na conciliação dos relatórios da maquininha...' },
  { id: 'TCK-1091', subject: 'Solicitação de novo leitor de código de barras', franchise: 'Belém - Umarizal', requester: 'Mariana Silva', date: 'Hoje às 11:05', priority: 'Média', status: 'Em Atendimento', message: 'Nosso equipamento secundário parou de funcionar e precisamos de reposição homologada.' },
  { id: 'TCK-1090', subject: 'Atualização no cadastro de produtos da promoção', franchise: 'Castanhal - Centro', requester: 'Roberto Mendes', date: 'Ontem', priority: 'Baixa', status: 'Concluído', message: 'Tudo resolvido referente ao combo de Páscoa.' },
  { id: 'TCK-1089', subject: 'Inconsistência na fatura de royalties', franchise: 'Macapá - Shopping', requester: 'Lucas Pinheiro', date: '22/08', priority: 'Alta', status: 'Concluído', message: 'Valor cobrado recalculado conforme ajuste de faturamento.' },
];

export function Support() {
  const [tickets, setTickets] = useState(initialTickets);
  const [selectedTicket, setSelectedTicket] = useState(initialTickets[0]);
  const [replyText, setReplyText] = useState('');

  const handleSendReply = (e) => {
    e.preventDefault();
    if (!replyText.trim()) return;

    // Update status to 'Em Atendimento'
    const updated = tickets.map(t => t.id === selectedTicket.id ? { ...t, status: 'Em Atendimento' } : t);
    setTickets(updated);
    setSelectedTicket({ ...selectedTicket, status: 'Em Atendimento' });
    setReplyText('');
  };

  return (
    <div className="page-container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1>Central de Suporte & Chamados</h1>
          <p>Atendimento direto aos franqueados e solução de dúvidas operacionais.</p>
        </div>

        <span className="badge badge-info" style={{ fontSize: '0.875rem', padding: '0.5rem 0.875rem' }}>
          3 chamados aguardando resposta
        </span>
      </div>

      <div className="support-layout">
        {/* Ticket List */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '1.25rem', borderBottom: '1px solid var(--border-color)' }}>
            <h3>Chamados Recebidos</h3>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {tickets.map(ticket => (
              <div 
                key={ticket.id} 
                className="ticket-item"
                style={{ 
                  backgroundColor: selectedTicket?.id === ticket.id ? 'var(--brand-primary-light)' : 'transparent',
                  borderLeft: selectedTicket?.id === ticket.id ? '4px solid var(--brand-primary)' : 'none'
                }}
                onClick={() => setSelectedTicket(ticket)}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)' }}>{ticket.id}</span>
                    <span className={`priority-badge priority-${ticket.priority.toLowerCase()}`}>
                      {ticket.priority}
                    </span>
                  </div>
                  <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>{ticket.subject}</span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{ticket.franchise}</span>
                </div>

                <div style={{ textAlign: 'right' }}>
                  <span className={`badge ${
                    ticket.status === 'Aberto' ? 'badge-danger' :
                    ticket.status === 'Em Atendimento' ? 'badge-warning' : 'badge-success'
                  }`}>
                    {ticket.status}
                  </span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginTop: '0.25rem' }}>
                    {ticket.date}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Ticket Detail Panel */}
        {selectedTicket && (
          <div className="card" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--brand-primary)' }}>
                {selectedTicket.id}
              </span>
              <h2 style={{ fontSize: '1.125rem', marginTop: '0.25rem' }}>{selectedTicket.subject}</h2>
              <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginTop: '0.375rem' }}>
                Solicitante: <strong>{selectedTicket.requester}</strong> ({selectedTicket.franchise})
              </div>
            </div>

            <div style={{ flex: 1, padding: '1.25rem 0', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ backgroundColor: 'var(--bg-subtle)', padding: '1rem', borderRadius: 'var(--radius-sm)' }}>
                <p style={{ fontSize: '0.875rem', color: 'var(--text-primary)' }}>{selectedTicket.message}</p>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginTop: '0.5rem' }}>
                  Enviado em {selectedTicket.date}
                </span>
              </div>
            </div>

            <form onSubmit={handleSendReply} style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1rem' }}>
              <div className="input-group">
                <label className="input-label">Responder como Administrador Master</label>
                <textarea 
                  className="input-field" 
                  rows={3}
                  placeholder="Escreva sua resposta para o franqueado..."
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  style={{ resize: 'none' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.75rem', gap: '0.5rem' }}>
                <button type="submit" className="btn btn-primary btn-sm">
                  <Send size={14} />
                  <span>Enviar Resposta</span>
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
