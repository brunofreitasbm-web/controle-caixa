require('dotenv').config();
const { enviarEmailGenerico } = require('../config/notifications');

async function test() {
  console.log('Testando envio de e-mail via SMTP...');
  console.log('Host:', process.env.SMTP_HOST);
  console.log('Port:', process.env.SMTP_PORT);
  console.log('User:', process.env.SMTP_USER);
  console.log('Pass length:', process.env.SMTP_PASS ? process.env.SMTP_PASS.length : 0);
  console.log('APP_URL:', process.env.APP_URL);

  const testEmail = process.env.SMTP_USER; // Envia para o próprio e-mail do sistema
  try {
    const info = await enviarEmailGenerico(
      [testEmail],
      '🚀 Teste de Envio — Trial 7 Dias',
      'Testando envio de e-mail de teste do HubOperações',
      '<p>Teste de envio com HTML</p>'
    );
    console.log('RESULTADO SUCESSO:', info);
  } catch (err) {
    console.error('ERRO NO ENVIO SMTP:', err);
  }
}

test();
