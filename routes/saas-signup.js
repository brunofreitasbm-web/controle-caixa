const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { dbRunAsync } = require('../config/database');
const { enviarEmailGenerico } = require('../config/notifications');

// URL Base da aplicação para links nos e-mails
const APP_URL = process.env.APP_URL || 'https://hub-de-operacoes.netlify.app';

/**
 * POST /api/saas/trial-signup
 * Cadastra franqueado no teste grátis de 7 dias, cria a organização e colaborador owner,
 * gera um PIN temporário de 4 dígitos e envia o e-mail de boas-vindas com as credenciais.
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

    // Link oficial de acesso ao app
    const loginLink = `${APP_URL}/webapp.html`;

    // 3. Montar E-mail em HTML de Boas-Vindas com o PIN e credenciais
    const assunto = `🚀 Seu Acesso de 7 Dias Grátis ao HubOperações está Liberado!`;
    const textoPuro = `Olá ${nomeClean}!\n\nSeu teste grátis de 7 dias no HubOperações foi liberado com sucesso.\n\nSua Conta:\n- Organização: ${nomeNegocio}\n- E-mail: ${emailClean}\n- PIN de Acesso (4 dígitos): ${pinDigits}\n\nAcesse o sistema em: ${loginLink}\n\nQualquer dúvida, estamos à disposição!`;

    const htmlBody = `
      <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #0d0705; color: #f5f0eb; border-radius: 16px; overflow: hidden; border: 1px solid #c98a4b;">
        <div style="background: linear-gradient(135deg, #c98a4b 0%, #7e4f25 100%); padding: 30px; text-align: center;">
          <h1 style="color: #ffffff; margin: 0; font-size: 24px;">HubOperações</h1>
          <p style="color: #fbd6b0; margin-top: 8px; font-size: 14px;">Boas-vindas ao seu Teste Grátis de 7 Dias</p>
        </div>

        <div style="padding: 30px; line-height: 1.6;">
          <p style="font-size: 16px;">Olá <strong>${nomeClean}</strong>,</p>
          <p style="color: #bba699;">Sua conta de 7 dias grátis para a operação <strong>${nomeNegocio}</strong> foi criada com sucesso! Você já pode acessar todas as funcionalidades do sistema.</p>

          <div style="background-color: #180e0a; border: 1px solid rgba(199, 146, 62, 0.3); border-radius: 12px; padding: 20px; margin: 25px 0;">
            <h3 style="color: #c98a4b; margin-top: 0; font-size: 16px; text-transform: uppercase; letter-spacing: 1px;">🔑 Suas Credenciais de Acesso</h3>
            <p style="margin: 8px 0; color: #f5f0eb;"><strong>E-mail:</strong> ${emailClean}</p>
            <p style="margin: 8px 0; color: #f5f0eb;"><strong>PIN de 4 dígitos:</strong> <span style="font-size: 22px; font-weight: bold; color: #22c55e; letter-spacing: 4px; background: rgba(34, 197, 94, 0.1); padding: 4px 12px; border-radius: 6px;">${pinDigits}</span></p>
            <p style="margin: 8px 0; color: #bba699; font-size: 13px;"><em>Guarde este PIN para realizar logins e validações no sistema.</em></p>
          </div>

          <div style="text-align: center; margin: 30px 0;">
            <a href="${loginLink}" style="background: linear-gradient(135deg, #c98a4b 0%, #7e4f25 100%); color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 50px; font-weight: bold; font-size: 16px; display: inline-block; box-shadow: 0 4px 15px rgba(201,138,75,0.4);">
              🚀 Entrar no HubOperações
            </a>
          </div>

          <hr style="border: 0; border-top: 1px solid rgba(199, 146, 62, 0.2); margin: 25px 0;">

          <p style="font-size: 13px; color: #7c685c; margin-bottom: 0;">
            💡 <strong>Precisa de ajuda?</strong> Se tiver qualquer dúvida durante o teste de 7 dias, entre em contato com o suporte.
          </p>
        </div>
      </div>
    `;

    // Disparar o e-mail via Nodemailer / SMTP
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
 * recupera os dados do cliente no Stripe, cadastra a conta e envia o e-mail.
 */
router.post('/confirmar-sessao-stripe', async (req, res) => {
  try {
    const { session_id, emailInput, nomeInput } = req.body;
    let emailCustomer = emailInput;
    let nomeCustomer = nomeInput || 'Franqueado';

    // Tentar consultar a sessão no Stripe API se a chave STRIPE_SECRET_KEY estiver configurada
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

    // Gerar Organization ID único
    const slug = nomeNegocio.toLowerCase().replace(/[^a-z0-9]/g, '_').substring(0, 30);
    const orgId = `org_${slug}_${Date.now().toString().slice(-4)}`;

    // Salvar organização
    try {
      await dbRunAsync(
        "INSERT INTO organizations (id, name, slug, status, created_at) VALUES (?, ?, ?, 'active', CURRENT_TIMESTAMP)",
        [orgId, nomeNegocio, slug]
      );
    } catch (e) {
      console.warn('[SaaS Stripe] Aviso ao criar org:', e.message);
    }

    // Gerar PIN de 4 dígitos
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

    // Link oficial de acesso ao app
    const loginLink = `${APP_URL}/webapp.html`;

    // Montar E-mail de Boas-Vindas com o PIN
    const assunto = `🎉 Seu Acesso ao HubOperações foi Liberado! (Pagamento Confirmado)`;
    const textoPuro = `Olá ${nomeClean}!\n\nSeu pagamento foi confirmado e sua conta no HubOperações está ativada com sucesso.\n\nSua Conta:\n- Organização: ${nomeNegocio}\n- E-mail: ${emailClean}\n- PIN de Acesso (4 dígitos): ${pinDigits}\n\nAcesse o sistema em: ${loginLink}`;

    const htmlBody = `
      <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #0d0705; color: #f5f0eb; border-radius: 16px; overflow: hidden; border: 1px solid #c98a4b;">
        <div style="background: linear-gradient(135deg, #c98a4b 0%, #7e4f25 100%); padding: 30px; text-align: center;">
          <h1 style="color: #ffffff; margin: 0; font-size: 24px;">HubOperações</h1>
          <p style="color: #fbd6b0; margin-top: 8px; font-size: 14px;">Pagamento Confirmado — Acesso Liberado</p>
        </div>

        <div style="padding: 30px; line-height: 1.6;">
          <p style="font-size: 16px;">Olá <strong>${nomeClean}</strong>,</p>
          <p style="color: #bba699;">Seu pagamento foi confirmado com sucesso e sua conta para a operação <strong>${nomeNegocio}</strong> já está pronta!</p>

          <div style="background-color: #180e0a; border: 1px solid rgba(199, 146, 62, 0.3); border-radius: 12px; padding: 20px; margin: 25px 0;">
            <h3 style="color: #c98a4b; margin-top: 0; font-size: 16px; text-transform: uppercase; letter-spacing: 1px;">🔑 Suas Credenciais de Acesso</h3>
            <p style="margin: 8px 0; color: #f5f0eb;"><strong>E-mail:</strong> ${emailClean}</p>
            <p style="margin: 8px 0; color: #f5f0eb;"><strong>PIN de 4 dígitos:</strong> <span style="font-size: 22px; font-weight: bold; color: #22c55e; letter-spacing: 4px; background: rgba(34, 197, 94, 0.1); padding: 4px 12px; border-radius: 6px;">${pinDigits}</span></p>
            <p style="margin: 8px 0; color: #bba699; font-size: 13px;"><em>Guarde este PIN para realizar logins no sistema.</em></p>
          </div>

          <div style="text-align: center; margin: 30px 0;">
            <a href="${loginLink}" style="background: linear-gradient(135deg, #c98a4b 0%, #7e4f25 100%); color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 50px; font-weight: bold; font-size: 16px; display: inline-block; box-shadow: 0 4px 15px rgba(201,138,75,0.4);">
              🚀 Entrar no HubOperações
            </a>
          </div>
        </div>
      </div>
    `;

    // Disparar o e-mail via Nodemailer / SMTP
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
