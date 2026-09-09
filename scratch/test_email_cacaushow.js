require('dotenv').config();
const { enviarEmailGenerico } = require('../config/notifications');

async function testarEnvioEmailCacauShow() {
  console.log('--- Testando Envio de E-mail HTML Cacau Show (3 Lojas + Venda Direta) ---');
  
  const targetEmails = ['brunofreitasbm@gmail.com', 'isabella.vgoncalves@gmail.com'];
  const subject = '🧪 [TESTE] Abertura & Fechamento de Caixa - Cacau Show (3 Lojas & Venda Direta)';
  
  const htmlBody = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; max-width:580px; margin:0 auto; padding:24px; color:#111827; border:1px solid #e5e7eb; border-radius:12px; background-color:#ffffff;">
      
      <!-- HEADER -->
      <div style="background-color:#581c87; color:#ffffff; padding:16px 20px; border-radius:8px 8px 0 0; margin:-24px -24px 20px -24px;">
        <h2 style="margin:0; font-size:18px; font-weight:700;">🍫 Controle de Caixa — Cacau Show</h2>
        <p style="margin:4px 0 0; font-size:13px; opacity:0.9;">Relatório de Teste de Abertura, Fechamento & Conciliação</p>
      </div>

      <!-- LOJA 1: MARAMBAIA (9175) -->
      <div style="border:1px solid #e5e7eb; border-radius:8px; padding:16px; margin-bottom:16px; background:#fafafa;">
        <h3 style="margin:0 0 10px; font-size:15px; color:#111827;">📍 Loja 9175 - Marambaia</h3>
        <table style="width:100%; border-collapse:collapse; font-size:13px;">
          <tr style="border-bottom:1px solid #e5e7eb;">
            <td style="padding:4px 0; color:#6b7280;">Abertura por:</td>
            <td style="padding:4px 0; font-weight:600; text-align:right;">Alexandra</td>
          </tr>
          <tr style="border-bottom:1px solid #e5e7eb;">
            <td style="padding:4px 0; color:#6b7280;">Fundo Contado vs Previsto:</td>
            <td style="padding:4px 0; font-weight:600; text-align:right;">R$ 300,00 (Previsto R$ 300,00)</td>
          </tr>
          <tr style="border-bottom:1px solid #e5e7eb;">
            <td style="padding:4px 0; color:#6b7280;">Faturamento do Dia:</td>
            <td style="padding:4px 0; font-weight:600; color:#10b981; text-align:right;">R$ 4.250,00 (Meta 108% 🚀)</td>
          </tr>
          <tr>
            <td style="padding:4px 0; color:#6b7280;">Valor Sangria / Envelope:</td>
            <td style="padding:4px 0; font-weight:600; color:#2563eb; text-align:right;">R$ 3.950,00</td>
          </tr>
        </table>
        <div style="margin-top:8px; padding:6px 10px; background:#ecfdf5; border-radius:6px; font-size:12px; color:#047857; font-weight:600;">
          ✓ Abertura e Fechamento conferidos sem divergência
        </div>
      </div>

      <!-- LOJA 2: ICOARACI (4304) -->
      <div style="border:1px solid #e5e7eb; border-radius:8px; padding:16px; margin-bottom:16px; background:#fafafa;">
        <h3 style="margin:0 0 10px; font-size:15px; color:#111827;">📍 Loja 4304 - Icoaraci</h3>
        <table style="width:100%; border-collapse:collapse; font-size:13px;">
          <tr style="border-bottom:1px solid #e5e7eb;">
            <td style="padding:4px 0; color:#6b7280;">Abertura por:</td>
            <td style="padding:4px 0; font-weight:600; text-align:right;">Isabella</td>
          </tr>
          <tr style="border-bottom:1px solid #e5e7eb;">
            <td style="padding:4px 0; color:#6b7280;">Fundo Contado vs Previsto:</td>
            <td style="padding:4px 0; font-weight:600; text-align:right;">R$ 250,00 (Previsto R$ 250,00)</td>
          </tr>
          <tr style="border-bottom:1px solid #e5e7eb;">
            <td style="padding:4px 0; color:#6b7280;">Faturamento do Dia:</td>
            <td style="padding:4px 0; font-weight:600; color:#10b981; text-align:right;">R$ 3.890,00 (Meta 95%)</td>
          </tr>
          <tr>
            <td style="padding:4px 0; color:#6b7280;">Valor Sangria / Envelope:</td>
            <td style="padding:4px 0; font-weight:600; color:#2563eb; text-align:right;">R$ 3.640,00</td>
          </tr>
        </table>
        <div style="margin-top:8px; padding:6px 10px; background:#ecfdf5; border-radius:6px; font-size:12px; color:#047857; font-weight:600;">
          ✓ Caixa finalizado sem divergência
        </div>
      </div>

      <!-- LOJA 3: MÁRIO COVAS (9201) -->
      <div style="border:1px solid #e5e7eb; border-radius:8px; padding:16px; margin-bottom:16px; background:#fafafa;">
        <h3 style="margin:0 0 10px; font-size:15px; color:#111827;">📍 Loja 9201 - Mário Covas</h3>
        <table style="width:100%; border-collapse:collapse; font-size:13px;">
          <tr style="border-bottom:1px solid #e5e7eb;">
            <td style="padding:4px 0; color:#6b7280;">Abertura por:</td>
            <td style="padding:4px 0; font-weight:600; text-align:right;">Consultora</td>
          </tr>
          <tr style="border-bottom:1px solid #e5e7eb;">
            <td style="padding:4px 0; color:#6b7280;">Fundo Contado vs Previsto:</td>
            <td style="padding:4px 0; font-weight:600; text-align:right;">R$ 300,00 (Previsto R$ 280,00)</td>
          </tr>
          <tr style="border-bottom:1px solid #e5e7eb;">
            <td style="padding:4px 0; color:#6b7280;">Faturamento do Dia:</td>
            <td style="padding:4px 0; font-weight:600; color:#10b981; text-align:right;">R$ 2.980,00</td>
          </tr>
          <tr>
            <td style="padding:4px 0; color:#6b7280;">Valor Sangria / Envelope:</td>
            <td style="padding:4px 0; font-weight:600; color:#2563eb; text-align:right;">R$ 2.680,00</td>
          </tr>
        </table>
        <div style="margin-top:8px; padding:6px 10px; background:#fffbebe; border:1px solid #fde68a; border-radius:6px; font-size:12px; color:#b45309; font-weight:600;">
          ⚠️ SOBRA de R$ 20,00 na abertura (Investigar)
        </div>
      </div>

      <!-- OPERAÇÃO 4: VENDA DIRETA -->
      <div style="border:1px solid #e5e7eb; border-radius:8px; padding:16px; margin-bottom:16px; background:#f9fafb;">
        <h3 style="margin:0 0 10px; font-size:15px; color:#111827;">💼 Venda Direta / Corporativo</h3>
        <table style="width:100%; border-collapse:collapse; font-size:13px;">
          <tr style="border-bottom:1px solid #e5e7eb;">
            <td style="padding:4px 0; color:#6b7280;">Responsável:</td>
            <td style="padding:4px 0; font-weight:600; text-align:right;">Equipe Venda Direta</td>
          </tr>
          <tr style="border-bottom:1px solid #e5e7eb;">
            <td style="padding:4px 0; color:#6b7280;">Faturamento Acumulado:</td>
            <td style="padding:4px 0; font-weight:600; color:#10b981; text-align:right;">R$ 6.800,00</td>
          </tr>
          <tr>
            <td style="padding:4px 0; color:#6b7280;">Status de Pedidos / Entregas:</td>
            <td style="padding:4px 0; font-weight:600; color:#2563eb; text-align:right;">Concluído com NF-e</td>
          </tr>
        </table>
      </div>

      <!-- FOOTER -->
      <p style="margin:24px 0 0; font-size:12px; color:#9ca3af; text-align:center;">Hub de Operações Cacau Show — Validação de Notificação por E-mail</p>
    </div>
  `;

  try {
    const info = await enviarEmailGenerico(targetEmails, subject, 'Teste de Envio de E-mail Cacau Show', htmlBody);
    console.log('E-mail do Cacau Show enviado com sucesso! Resposta:', info.response);
  } catch (err) {
    console.error('Erro ao enviar e-mail de teste Cacau Show:', err.message);
  }
}

testarEnvioEmailCacauShow();
