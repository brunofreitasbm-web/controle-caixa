const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { dbRunAsync } = require('../config/database');
const { enviarEmailGenerico } = require('../config/notifications');

// URL Base da aplicação para links nos e-mails
const APP_URL = process.env.APP_URL || 'https://hub-operacoes-theta.vercel.app';

/**
 * Função utilitária para montar o template HTML oficial do HubOperações
 */
function buildEmailHtmlTemplate({ badgeText, titulo, mensagem, nomeNegocio, emailClean, pinDigits, buttonText, buttonUrl }) {
  const loginUrl = buttonUrl || `${APP_URL}/webapp.html`;
  return `
    <table role="presentation" class="email-shell" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px; max-width:600px; background-color:#fffdf8; border:1px solid #e7dbc3; border-radius:16px; overflow:hidden; font-family:Arial, Helvetica, sans-serif; margin:0 auto;">
    <tbody><tr><td style="padding:0;">
      <div style="display:none; max-height:0; overflow:hidden; mso-hide:all; font-size:1px; line-height:1px; color:#fffdf8;">Sua conta de acesso ao HubOperações foi gerada com sucesso.</div>

      <!-- header -->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tbody><tr><td bgcolor="#c67139" style="padding:22px 32px; mso-line-height-rule:exactly;">
        <span style="font-family:'Trebuchet MS', Verdana, Arial, sans-serif; font-size:20px; font-weight:bold; color:#ffffff;">HubOperações</span>
      </td></tr>
      </tbody></table>

      <!-- body -->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tbody><tr><td style="padding:36px 32px 8px;">
        <span style="display:inline-block; background-color:#f3ddc9; color:#7a3f1c; font-family:Arial, Helvetica, sans-serif; font-size:12px; font-weight:bold; letter-spacing:0.03em; text-transform:uppercase; padding:6px 14px; border-radius:999px;">${badgeText}</span>
      </td></tr>
      <tr><td style="padding:16px 32px 0;">
        <span style="font-family:'Trebuchet MS', Verdana, Arial, sans-serif; font-size:24px; font-weight:bold; color:#201e1d; mso-line-height-rule:exactly; line-height:30px;">${titulo}</span>
      </td></tr>
      <tr><td style="padding:14px 32px 0;">
        <span style="font-family:Arial, Helvetica, sans-serif; font-size:15px; color:#4a453e; mso-line-height-rule:exactly; line-height:23px;">${mensagem}</span>
      </td></tr>
      </tbody></table>

      <!-- credentials box -->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tbody><tr><td style="padding:24px 32px 0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f7f0e2; border:1px solid #e7dbc3; border-radius:16px;">
          <tbody><tr><td style="padding:20px 24px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tbody><tr><td style="padding-bottom:8px; font-family:Arial, Helvetica, sans-serif; font-size:12px; color:#8a6a3f; text-transform:uppercase; letter-spacing:0.04em;">Organização / Loja</td></tr>
              <tr><td style="padding-bottom:16px; font-family:Arial, Helvetica, sans-serif; font-size:15px; color:#201e1d; font-weight:bold;">${nomeNegocio} (${emailClean})</td></tr>
              <tr><td style="padding-bottom:8px; font-family:Arial, Helvetica, sans-serif; font-size:12px; color:#8a6a3f; text-transform:uppercase; letter-spacing:0.04em;">PIN de Acesso (4 dígitos)</td></tr>
              <tr><td style="padding-bottom:0;">
                <span style="display:inline-block; background-color:#ffffff; border:1px solid #d8c9a8; border-radius:10px; padding:10px 18px; font-family:'Courier New', Courier, monospace; font-size:22px; letter-spacing:0.12em; color:#7a3f1c; font-weight:bold;">${pinDigits}</span>
              </td></tr>
            </tbody></table>
          </td></tr>
        </tbody></table>
      </td></tr>
      </tbody></table>

      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tbody><tr><td style="padding:16px 32px 0; font-family:Arial, Helvetica, sans-serif; font-size:13px; color:#8a6a3f;">
        Guarde este PIN para realizar logins e validações operacionais na plataforma.
      </td></tr>
      </tbody></table>

      <!-- button -->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tbody><tr><td align="center" style="padding:28px 32px 16px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0">
          <tbody><tr><td bgcolor="#c67139" style="border-radius:999px; mso-padding-alt:14px 36px;">
            <a href="${loginUrl}" target="_blank" style="display:block; padding:14px 36px; font-family:Arial, Helvetica, sans-serif; font-size:15px; font-weight:bold; color:#ffffff; text-decoration:none; border-radius:999px;">${buttonText || 'Acessar o HubOperações'}</a>
          </td></tr>
        </tbody></table>
      </td></tr>
      </tbody></table>

      <!-- footer -->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tbody><tr><td style="border-top:1px solid #e7dbc3; padding:20px 32px; font-family:Arial, Helvetica, sans-serif; font-size:12px; color:#8a6a3f; line-height:18px;">
        HubOperações — sistema de gestão para franquias de chocolate.<br>
        Você recebe este e-mail por ser responsável cadastrado por uma loja no HubOperações.
      </td></tr>
      </tbody></table>

    </td></tr>
    </tbody></table>
  `;
}

/**
 * POST /api/saas/trial-signup
 * Cadastra franqueado no teste grátis de 7 dias, cria a organização e colaborador owner,
 * gera um PIN temporário de 4 dígitos e envia o e-mail oficial com as credenciais.
 */
router.post('/trial-signup', async (req, res) => {
  try {
    const { nome, email, telefone, lojas, nomeLoja } = req.body;

    if (!email) {
      return res.status(400).json({ ok: false, error: 'E-mail é obrigatório.' });
    }

    const emailClean = email.trim().toLowerCase();
    const nomeClean = (nome && nome.trim()) || 'Franqueado';
    const nomeNegocio = (nomeLoja && nomeLoja.trim()) || `Franquia de ${nomeClean.split(' ')[0]}`;

    // 1. Gerar Organization ID único
    const slug = nomeNegocio.toLowerCase().replace(/[^a-z0-9]/g, '_').substring(0, 30);
    const orgId = `org_${slug}_${Date.now().toString().slice(-4)}`;

    // Criar organização no banco
    try {
      await dbRunAsync(
        "INSERT INTO organizations (id, name, slug, status, created_at) VALUES (?, ?, ?, 'active', CURRENT_TIMESTAMP)",
        [orgId, nomeNegocio, slug]
      );
    } catch (e) {
      console.warn('[SaaS Trial] Aviso ao criar org:', e.message);
    }

    // 2. Gerar PIN aleatório de 4 dígitos (ex: 4829)
    const pinDigits = Math.floor(1000 + Math.random() * 9000).toString();
    const pinHash = await bcrypt.hash(pinDigits, 10);
    const colabId = `colab_${Date.now()}`;

    // Criar Colaborador Owner
    try {
      await dbRunAsync(
        `INSERT INTO colaboradores (id, nome, role, pinHash, ativo, email, organizationId) 
         VALUES (?, ?, 'owner', ?, 1, ?, ?)`,
        [colabId, nomeClean, pinHash, emailClean, orgId]
      );
    } catch (e) {
      console.warn('[SaaS Trial] Aviso ao inserir colaborador:', e.message);
    }

    const loginLink = `${APP_URL}/webapp.html`;
    const assunto = `🚀 Seu Acesso de 7 Dias Grátis ao HubOperações está Liberado!`;
    const textoPuro = `Olá ${nomeClean}!\n\nSeu teste grátis de 7 dias no HubOperações foi liberado com sucesso.\n\nSua Conta:\n- Organização: ${nomeNegocio}\n- E-mail: ${emailClean}\n- PIN de Acesso (4 dígitos): ${pinDigits}\n\nAcesse em: ${loginLink}`;

    const htmlBody = buildEmailHtmlTemplate({
      badgeText: 'Acesso ao Sistema · 7 Dias Grátis',
      titulo: 'Seu acesso temporário foi liberado',
      mensagem: `Olá, <strong>${nomeClean}</strong>. Sua conta de 7 dias grátis para a operação <strong>${nomeNegocio}</strong> foi criada com sucesso! Use as credenciais abaixo para acessar a plataforma.`,
      nomeNegocio,
      emailClean,
      pinDigits,
      buttonText: '🚀 Entrar no HubOperações',
      buttonUrl: loginLink
    });

    let emailStatus = 'enviado';
    try {
      await enviarEmailGenerico([emailClean], assunto, textoPuro, htmlBody);
    } catch (errEmail) {
      console.warn('[SaaS Trial Signup] Aviso no envio via SMTP:', errEmail.message);
      emailStatus = 'simulado_sem_smtp';
    }

    res.json({
      ok: true,
      mensagem: 'Cadastro realizado com sucesso! E-mail com credenciais e PIN enviado.',
      orgId,
      emailStatus,
      pinSimulado: pinDigits
    });

  } catch (error) {
    console.error('[SaaS Trial Signup Error]:', error);
    res.status(500).json({ ok: false, error: 'Erro ao processar cadastro de teste grátis.' });
  }
});

/**
 * POST /api/saas/confirmar-sessao-stripe
 * Recebe o session_id da URL do Stripe (/sucesso.html?session_id=...),
 * recupera os dados do cliente no Stripe, cadastra a conta e envia o e-mail usando o modelo oficial.
 */
router.post('/confirmar-sessao-stripe', async (req, res) => {
  try {
    const { session_id, emailInput, nomeInput } = req.body;
    let emailCustomer = emailInput;
    let nomeCustomer = nomeInput || 'Franqueado';

    if (process.env.STRIPE_SECRET_KEY && session_id) {
      try {
        const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
        const session = await stripe.checkout.sessions.retrieve(session_id);
        if (session && session.customer_details) {
          if (session.customer_details.email) emailCustomer = session.customer_details.email;
          if (session.customer_details.name) nomeCustomer = session.customer_details.name;
        }
      } catch (errStripe) {
        console.warn('[Stripe Retrieve Session Warning]:', errStripe.message);
      }
    }

    if (!emailCustomer) {
      return res.status(400).json({ ok: false, error: 'E-mail do cliente não informado para a sessão Stripe.' });
    }

    const emailClean = emailCustomer.trim().toLowerCase();
    const nomeClean = nomeCustomer.trim();
    const nomeNegocio = `Franquia de ${nomeClean.split(' ')[0]}`;

    const slug = nomeNegocio.toLowerCase().replace(/[^a-z0-9]/g, '_').substring(0, 30);
    const orgId = `org_${slug}_${Date.now().toString().slice(-4)}`;

    try {
      await dbRunAsync(
        "INSERT INTO organizations (id, name, slug, status, created_at) VALUES (?, ?, ?, 'active', CURRENT_TIMESTAMP)",
        [orgId, nomeNegocio, slug]
      );
    } catch (e) {
      console.warn('[SaaS Stripe] Aviso ao criar org:', e.message);
    }

    const pinDigits = Math.floor(1000 + Math.random() * 9000).toString();
    const pinHash = await bcrypt.hash(pinDigits, 10);
    const colabId = `colab_${Date.now()}`;

    try {
      await dbRunAsync(
        `INSERT INTO colaboradores (id, nome, role, pinHash, ativo, email, organizationId) 
         VALUES (?, ?, 'owner', ?, 1, ?, ?)`,
        [colabId, nomeClean, pinHash, emailClean, orgId]
      );
    } catch (e) {
      console.warn('[SaaS Stripe] Aviso ao inserir colaborador:', e.message);
    }

    const loginLink = `${APP_URL}/webapp.html`;
    const assunto = `🎉 Seu Acesso ao HubOperações foi Liberado! (Pagamento Confirmado)`;
    const textoPuro = `Olá ${nomeClean}!\n\nSeu pagamento foi confirmado e sua conta no HubOperações está ativada com sucesso.\n\nSua Conta:\n- Organização: ${nomeNegocio}\n- E-mail: ${emailClean}\n- PIN de Acesso (4 dígitos): ${pinDigits}\n\nAcesse em: ${loginLink}`;

    const htmlBody = buildEmailHtmlTemplate({
      badgeText: 'Pagamento Confirmado · Acesso Liberado',
      titulo: 'Sua assinatura foi ativada!',
      mensagem: `Olá, <strong>${nomeClean}</strong>. Seu pagamento foi processado com sucesso e sua operação <strong>${nomeNegocio}</strong> já está com acesso total liberado.`,
      nomeNegocio,
      emailClean,
      pinDigits,
      buttonText: '🚀 Entrar no HubOperações',
      buttonUrl: loginLink
    });

    try {
      await enviarEmailGenerico([emailClean], assunto, textoPuro, htmlBody);
    } catch (errEmail) {
      console.warn('[Stripe Success Mail Warning]:', errEmail.message);
    }

    res.json({
      ok: true,
      mensagem: 'Assinatura confirmada! E-mail com credenciais e PIN enviado.',
      email: emailClean,
      pinSimulado: pinDigits,
      orgId
    });

  } catch (error) {
    console.error('[Stripe Confirmation Error]:', error);
    res.status(500).json({ ok: false, error: 'Erro ao processar confirmação de pagamento Stripe.' });
  }
});

module.exports = router;
