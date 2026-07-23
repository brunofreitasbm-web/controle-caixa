const express = require('express');
const router = express.Router();
const nodemailer = require('nodemailer');
const { db, normalizeRow } = require('../config/database');
const { registrarLog } = require('../config/logger');
const { notificacoesEventosAtivas, obterEmailsDestinatarios, enviarEmailNotificacao, enviarNotificacaoPush } = require('../config/notifications');

// Notificação de divergência de fundo de caixa (#8 Reconciliação)
router.post('/divergencia', (req, res) => {
  const { loja, consultor, fundoAbertura, fundoUltimoFechamento, diferenca } = req.body;

  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) {
    return res.json({ sent: false, reason: 'SMTP não configurado' });
  }

  notificacoesEventosAtivas((ativas) => {
   if (!ativas) {
     console.log('Notificação de divergência ignorada: notificações de eventos estão desativadas em Configurações.');
     return res.json({ sent: false, reason: 'Notificações desativadas' });
   }

   obterEmailsDestinatarios('divergencia_caixa', (targetEmails) => {
    if (targetEmails.length === 0) {
      console.log('Notificação de divergência por e-mail ignorada (nenhum destinatário configurado).');
      return res.json({ sent: false, reason: 'Nenhum destinatário configurado' });
    }
    
    const transporter = nodemailer.createTransport({
      host,
      port: parseInt(process.env.SMTP_PORT) || 465,
      secure: process.env.SMTP_SECURE === 'true',
      auth: { user, pass }
    });
    
    transporter.sendMail({
      from: `"Controle de Caixa Cacau Show" <${user}>`,
      to: targetEmails.join(', '),
      subject: `⚠️ Divergência de Fundo de Caixa - Loja ${loja}`,
      html: `<p>Olá,</p>
<p>Foi detectada uma <strong>divergência no fundo de caixa</strong> na loja <strong>${loja}</strong>.</p>
<h3>Detalhes:</h3>
<ul>
  <li><strong>Consultor(a):</strong> ${consultor}</li>
  <li><strong>Fundo de caixa na abertura:</strong> R$ ${fundoAbertura.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</li>
  <li><strong>Fundo no último fechamento:</strong> R$ ${fundoUltimoFechamento.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</li>
  <li><strong>Diferença:</strong> R$ ${Math.abs(diferenca).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} (${diferenca > 0 ? 'a mais' : 'a menos'})</li>
</ul>
<p>Por favor, investigue a divergência.</p>
<p><em>Atenciosamente,<br>Sistema de Controle de Caixa</em></p>`
    }, (error) => {
      if (error) {
        console.error('Erro ao enviar e-mail de divergência:', error);
        return res.json({ sent: false, reason: error.message });
      }
      res.json({ sent: true });
    });
   });
  });
});

// 3. Obter todos os registros
router.get('/registros', (req, res) => {
  db.all('SELECT * FROM registros WHERE deletadoEm IS NULL ORDER BY dataOperacao DESC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    const normalized = (rows || []).map(normalizeRow);
    const result = normalized.map(r => ({
      ...r,
      mensagemGerada: !!r.mensagemGerada
    }));
    res.json(result);
  });
});

// FA-1. Obter todos os registros FaçaAmigos
router.get('/registros-fa', (req, res) => {
  db.all('SELECT * FROM registros_fa WHERE deletadoEm IS NULL ORDER BY dataOperacao DESC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    const normalized = (rows || []).map(normalizeRow);
    const result = normalized.map(r => ({
      ...r,
      mensagemGerada: !!r.mensagemGerada
    }));
    res.json(result);
  });
});

// FA-2. Inserir registro FaçaAmigos
router.post('/registros-fa', (req, res) => {
  const r = req.body;
  db.run(
    `INSERT INTO registros_fa (
      id, consultor, loja, tipoOperacao, dataOperacao, fundoCaixa, valorEnvelope,
      observacoes, fotoEnvelope, status, dataRetirada, retiradoPor, confirmadoPorApp,
      autorizadoPor, mensagemGerada, criadoEm
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      r.id, r.consultor, r.loja, r.tipoOperacao, r.dataOperacao, r.fundoCaixa, r.valorEnvelope,
      r.observacoes, r.fotoEnvelope, r.status, r.dataRetirada, r.retiradoPor, r.confirmadoPorApp,
      r.autorizadoPor, r.mensagemGerada ? 1 : 0, r.criadoEm
    ],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });

      // Envio de e-mail silencioso se for Fechamento e o acumulado for >= 1000
      if (r.tipoOperacao === 'Fechamento' && r.valorEnvelope) {
        db.get(
          `SELECT SUM(valorEnvelope) as total FROM registros_fa WHERE loja = ? AND status = 'aguardando_retirada'`,
          [r.loja],
          (sumErr, row) => {
            if (!sumErr && row && row.total >= 1000) {
              enviarEmailNotificacao(r.loja, r.valorEnvelope, row.total, r.consultor);
              enviarNotificacaoPush(
                `🚨 ${r.loja}-FaçaAmigos`,
                `R$ ${row.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} em dinheiro, recomendo retirar!`
              );
            }
          }
        );
      }

      const usuarioLog = req.query.usuario || r.consultor || 'Desconhecido';
      registrarLog(r.id, 'CREATE_FA', `[FaçaAmigos] Registro criado: ${r.tipoOperacao} (${r.loja}) - R$ ${r.fundoCaixa}`, usuarioLog);

      res.json({ success: true, id: r.id });
    }
  );
});

// FA-3. Atualizar registro FaçaAmigos
router.put('/registros-fa/:id', (req, res) => {
  const { id } = req.params;
  const r = req.body;

  const fields = [];
  const values = [];

  Object.keys(r).forEach(key => {
    if (key === 'id') return;
    fields.push(`${key} = ?`);
    if (key === 'mensagemGerada') {
      values.push(r[key] ? 1 : 0);
    } else {
      values.push(r[key]);
    }
  });

  if (fields.length === 0) {
    return res.status(400).json({ error: 'Nenhum campo para atualizar' });
  }

  values.push(id);

  const sql = `UPDATE registros_fa SET ${fields.join(', ')} WHERE id = ?`;

  db.run(sql, values, function(err) {
    if (err) return res.status(500).json({ error: err.message });

    const usuarioLog = req.query.usuario || 'Desconhecido';
    registrarLog(id, 'UPDATE_FA', `[FaçaAmigos] Registro atualizado: ${Object.keys(r).join(', ')}`, usuarioLog);

    res.json({ success: true });
  });
});

// FA-4. Excluir registro FaçaAmigos (Soft delete — somente Bruno)
router.delete('/registros-fa/:id', (req, res) => {
  const { id } = req.params;
  const { usuario } = req.query;

  if (usuario !== 'Bruno') {
    return res.status(403).json({ error: 'Permissão negada. Somente o Bruno pode excluir registros do FaçaAmigos.' });
  }

  const agora = new Date().toISOString();
  db.run('UPDATE registros_fa SET deletadoEm = ? WHERE id = ?', [agora, id], function(err) {
    if (err) return res.status(500).json({ error: err.message });

    registrarLog(id, 'DELETE_FA', `[FaçaAmigos] Registro removido logicamente.`, usuario);

    res.json({ success: true });
  });
});

// Inserir registro
router.post('/registros', (req, res) => {
  const r = req.body;
  db.run(
    `INSERT INTO registros (
      id, consultor, loja, tipoOperacao, dataOperacao, fundoCaixa, valorEnvelope, 
      observacoes, fotoEnvelope, status, dataRetirada, retiradoPor, confirmadoPorApp, 
      autorizadoPor, mensagemGerada, criadoEm
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      r.id, r.consultor, r.loja, r.tipoOperacao, r.dataOperacao, r.fundoCaixa, r.valorEnvelope,
      r.observacoes, r.fotoEnvelope, r.status, r.dataRetirada, r.retiradoPor, r.confirmadoPorApp,
      r.autorizadoPor, r.mensagemGerada ? 1 : 0, r.criadoEm
    ],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      
      // Envio de e-mail silencioso se for Fechamento e o acumulado for >= 1000
      if (r.tipoOperacao === 'Fechamento' && r.valorEnvelope) {
        db.get(
          `SELECT SUM(valorEnvelope) as total FROM registros WHERE loja = ? AND status = 'aguardando_retirada'`,
          [r.loja],
          (sumErr, row) => {
            if (!sumErr && row && row.total >= 1000) {
              enviarEmailNotificacao(r.loja, r.valorEnvelope, row.total, r.consultor);
              enviarNotificacaoPush(
                `🚨 ${r.loja}-Cacau Show`,
                `R$ ${row.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} em dinheiro, recomendo retirar!`
              );
            }
          }
        );
      }

      const usuarioLog = req.query.usuario || r.consultor || 'Desconhecido';
      registrarLog(r.id, 'CREATE', `Registro criado: ${r.tipoOperacao} (${r.loja}) - R$ ${r.fundoCaixa}`, usuarioLog);

      res.json({ success: true, id: r.id });
    }
  );
});

// Atualizar registro
router.put('/registros/:id', (req, res) => {
  const { id } = req.params;
  const r = req.body;
  
  const fields = [];
  const values = [];
  
  Object.keys(r).forEach(key => {
    if (key === 'id') return;
    fields.push(`${key} = ?`);
    if (key === 'mensagemGerada') {
      values.push(r[key] ? 1 : 0);
    } else {
      values.push(r[key]);
    }
  });
  
  if (fields.length === 0) {
    return res.status(400).json({ error: 'Nenhum campo para atualizar' });
  }
  
  values.push(id);
  
  const sql = `UPDATE registros SET ${fields.join(', ')} WHERE id = ?`;
  
  db.run(sql, values, function(err) {
    if (err) return res.status(500).json({ error: err.message });
    
    const usuarioLog = req.query.usuario || 'Desconhecido';
    registrarLog(id, 'UPDATE', `Registro atualizado: ${Object.keys(r).join(', ')}`, usuarioLog);
    
    res.json({ success: true });
  });
});

// Excluir registro
router.delete('/registros/:id', (req, res) => {
  const { id } = req.params;
  const { usuario } = req.query;
  
  if (usuario !== 'Bruno') {
    return res.status(403).json({ error: 'Permissão negada. Somente o Bruno pode excluir registros.' });
  }

  const agora = new Date().toISOString();
  db.run('UPDATE registros SET deletadoEm = ? WHERE id = ?', [agora, id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    
    registrarLog(id, 'DELETE', `Registro removido logicamente.`, usuario);
    
    res.json({ success: true });
  });
});

module.exports = router;
