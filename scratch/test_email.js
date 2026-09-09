require('dotenv').config();
const { enviarEmailGenerico } = require('../config/notifications');

async function testarEnvioEmail() {
  console.log('--- Testando Envio de E-mail HTML Faça Amigos ---');
  
  const targetEmails = ['brunofreitasbm@gmail.com'];
  const subject = '🧪 [TESTE] Abertura & Fechamento de Caixa Faça Amigos';
  
  const htmlBody = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; max-width:540px; margin:0 auto; padding:24px; color:#111827; border:1px solid #e5e7eb; border-radius:12px; background-color:#ffffff;">
      <h2 style="margin:0 0 16px; font-size:18px; font-weight:700; color:#111827;">🟢 TESTE: Abertura e Conciliação de Caixa — Faça Amigos (Parque Circuito)</h2>
      <p style="margin:0 0 16px; font-size:14px; color:#4b5563;"><strong>Bruno Freitas</strong> abriu o caixa com sucesso. Este é um e-mail de teste de validação do sistema.</p>
      
      <table style="width:100%; border-collapse:collapse; font-size:14px; margin-bottom:16px;">
        <tr style="border-bottom:1px solid #f3f4f6;">
          <td style="padding:6px 12px 6px 0; color:#6b7280;">Operação:</td>
          <td style="padding:6px 0; font-weight:600; color:#111827;">Faça Amigos Playground</td>
        </tr>
        <tr style="border-bottom:1px solid #f3f4f6;">
          <td style="padding:6px 12px 6px 0; color:#6b7280;">Fundo de Caixa Contado:</td>
          <td style="padding:6px 0; font-weight:600; color:#111827;">R$ 200,00</td>
        </tr>
        <tr style="border-bottom:1px solid #f3f4f6;">
          <td style="padding:6px 12px 6px 0; color:#6b7280;">Fundo Previsto (Fechamento Anterior):</td>
          <td style="padding:6px 0; font-weight:600; color:#111827;">R$ 200,00</td>
        </tr>
      </table>

      <div style="padding:10px 14px; background-color:#ecfdf5; border:1px solid #a7f3d0; border-radius:8px; font-size:13px; color:#065f46; margin-bottom:16px;">
        ✓ Fundo de caixa conferido sem divergência entre o fechamento anterior e a abertura atual.
      </div>

      <hr style="border:none; border-top:1px solid #e5e7eb; margin:20px 0;" />

      <h3 style="margin:0 0 12px; font-size:16px; font-weight:700; color:#111827;">🔒 Simulação de Fechamento & Foto do Envelope</h3>
      <table style="width:100%; border-collapse:collapse; font-size:14px; margin-bottom:16px;">
        <tr style="border-bottom:1px solid #f3f4f6;">
          <td style="padding:6px 12px 6px 0; color:#6b7280;">Valor Total Faturado:</td>
          <td style="padding:6px 0; font-weight:600; color:#10b981; font-size:16px;">R$ 1.450,00</td>
        </tr>
        <tr style="border-bottom:1px solid #f3f4f6;">
          <td style="padding:6px 12px 6px 0; color:#6b7280;">Fundo para Próximo Dia:</td>
          <td style="padding:6px 0; font-weight:600; color:#111827;">R$ 200,00</td>
        </tr>
        <tr style="border-bottom:1px solid #f3f4f6;">
          <td style="padding:6px 12px 6px 0; color:#6b7280;">Valor Retirado em Envelope (Sangria):</td>
          <td style="padding:6px 0; font-weight:600; color:#3b82f6;">R$ 1.250,00</td>
        </tr>
      </table>

      <p style="margin:20px 0 0; font-size:12px; color:#9ca3af; text-align:center;">Hub de Operações — E-mail de Teste do Desenvolvedor</p>
    </div>
  `;

  try {
    const info = await enviarEmailGenerico(targetEmails, subject, 'Teste de Envio de E-mail Faça Amigos', htmlBody);
    console.log('E-mail enviado com sucesso! Resposta do servidor:', info.response);
  } catch (err) {
    console.error('Erro ao enviar e-mail de teste:', err.message);
  }
}

testarEnvioEmail();
