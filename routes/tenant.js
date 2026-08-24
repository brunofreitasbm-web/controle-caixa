// ==========================================================================
// ROTAS DE TENANT (Fase 2/3 do plano de arquitetura SaaS)
// ==========================================================================
// Substitui os dados hoje hardcoded em webapp/app.js (USERS, LOJAS,
// OPERACOES_INFO, OPERACOES_ALIASES, WHATSAPP_GRUPOS, LOJAS_GEOLOC) por dado
// vindo do banco, escopado por organização. O frontend chama
// GET /tenant/bootstrap antes/depois do login e usa a resposta pra
// popular esses mesmos objetos — se a chamada falhar, o app cai de volta
// para os valores hardcoded (ver aplicarBootstrapTenant em webapp/app.js),
// então este endpoint nunca é um ponto único de falha do login.
//
// Faça Amigos fica de fora de propósito: é um módulo em descontinuação para
// o produto SaaS (decisão do dono). `unidades` devolve tudo, MENOS o negócio
// "faca-amigos" — uma exclusão pontual, não uma allowlist de "cacau-show":
// um tenant novo pode nomear o próprio negócio como quiser, e não deve
// precisar copiar literalmente o nome do negócio do dono para aparecer aqui.
// ==========================================================================

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { db, dbAllAsync, normalizeRow, TENANT_ZERO_ID } = require('../config/database');
const { organizationIdDe } = require('./middleware/tenantContext');
const requireOwner = require('./middleware/requireOwner');

router.get('/bootstrap', async (req, res) => {
  const organizationId = organizationIdDe(req);

  try {
    const [org, unidades, modulos, colaboradores] = await Promise.all([
      new Promise((resolve, reject) => {
        db.get('SELECT id, slug, nome FROM organizations WHERE id = ?', [organizationId], (err, row) => err ? reject(err) : resolve(row));
      }),
      new Promise((resolve, reject) => {
        db.all(
          `SELECT id, negocioChave, nome, codigoExterno, lat, lng, abertura, fechamento, whatsappGrupoUrl, corEmoji
           FROM unidades WHERE organizationId = ? AND negocioChave <> 'faca-amigos' AND ativo = 1 ORDER BY nome`,
          [organizationId],
          (err, rows) => err ? reject(err) : resolve(rows || [])
        );
      }),
      new Promise((resolve, reject) => {
        db.all('SELECT moduloChave, habilitado FROM tenant_modules WHERE organizationId = ?', [organizationId], (err, rows) => err ? reject(err) : resolve(rows || []));
      }),
      new Promise((resolve, reject) => {
        db.all('SELECT nome, role FROM colaboradores WHERE organizationId = ? ORDER BY nome', [organizationId], (err, rows) => err ? reject(err) : resolve(rows || []));
      })
    ]);

    const modulosMap = {};
    modulos.map(normalizeRow).forEach(m => { modulosMap[m.moduloChave] = !!m.habilitado; });

    res.json({
      organizationId,
      organizacao: org ? { nome: org.nome, slug: org.slug } : null,
      unidades: unidades.map(normalizeRow),
      modulos: modulosMap,
      colaboradoresLogin: colaboradores.map(normalizeRow)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Liga/desliga um módulo para a organização do request — só o owner altera.
// A UI de Configurações (Fase 3) chama isto para os toggles de feature flag;
// o efeito imediato é a barra lateral esconder o grupo de abas do módulo
// (ver aplicarModulosTenant em webapp/app.js).
router.put('/modules/:chave', requireOwner, (req, res) => {
  const organizationId = organizationIdDe(req);
  const { chave } = req.params;
  const habilitado = req.body.habilitado ? 1 : 0;
  const agora = new Date().toISOString();

  db.run(
    `INSERT INTO tenant_modules (id, organizationId, moduloChave, habilitado, criadoEm)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(organizationId, moduloChave) DO UPDATE SET habilitado = excluded.habilitado`,
    [`tm-${organizationId}-${chave}`, organizationId, chave, habilitado, agora],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true, chave, habilitado: !!habilitado });
    }
  );
});

// ==========================================================================
// CRUD DE UNIDADES (cadastro de lojas/unidades da organização)
// ==========================================================================
// Substitui a edição manual do objeto LOJAS/OPERACOES_INFO hardcoded em
// webapp/app.js: um tenant novo cadastra as próprias unidades por aqui, sem
// precisar de deploy. Todos os endpoints são owner-only e escopados por
// organizationId — nunca aceitam o id de uma unidade de outra organização.

// Lista TODAS as unidades da organização (inclusive inativas) — usada pela
// tela de gestão; GET /bootstrap continua sendo a versão "só ativas" que a
// operação do dia a dia consome.
router.get('/unidades', requireOwner, (req, res) => {
  const organizationId = organizationIdDe(req);
  db.all(
    `SELECT * FROM unidades WHERE organizationId = ? ORDER BY negocioChave, nome`,
    [organizationId],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json((rows || []).map(normalizeRow));
    }
  );
});

router.post('/unidades', requireOwner, (req, res) => {
  const organizationId = organizationIdDe(req);
  const { negocioChave, nome, codigoExterno, lat, lng, abertura, fechamento, whatsappGrupoUrl, corEmoji } = req.body;
  if (!negocioChave || !nome) {
    return res.status(400).json({ error: 'negocioChave e nome são obrigatórios.' });
  }
  const id = `un-${crypto.randomUUID()}`;
  const agora = new Date().toISOString();

  db.run(
    `INSERT INTO unidades (id, organizationId, negocioChave, nome, codigoExterno, lat, lng, abertura, fechamento, whatsappGrupoUrl, corEmoji, ativo, criadoEm)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
    [id, organizationId, negocioChave, nome.trim(), codigoExterno || null, lat ?? null, lng ?? null, abertura || null, fechamento || null, whatsappGrupoUrl || null, corEmoji || null, agora],
    (err) => {
      if (err) {
        // UNIQUE(organizationId, negocioChave, nome): mensagem específica em
        // vez do erro cru do SQLite, pro formulário mostrar algo legível.
        if (String(err.message).includes('UNIQUE')) {
          return res.status(409).json({ error: 'Já existe uma unidade com este nome para este negócio.' });
        }
        return res.status(500).json({ error: err.message });
      }
      res.status(201).json({ success: true, id });
    }
  );
});

const COLUNAS_UNIDADE_EDITAVEIS = new Set([
  'negocioChave', 'nome', 'codigoExterno', 'lat', 'lng', 'abertura', 'fechamento', 'whatsappGrupoUrl', 'corEmoji', 'ativo'
]);

router.put('/unidades/:id', requireOwner, (req, res) => {
  const organizationId = organizationIdDe(req);
  const { id } = req.params;

  const campos = [];
  const valores = [];
  Object.keys(req.body || {}).forEach(chave => {
    if (!COLUNAS_UNIDADE_EDITAVEIS.has(chave)) return;
    campos.push(`${chave} = ?`);
    valores.push(chave === 'ativo' ? (req.body[chave] ? 1 : 0) : req.body[chave]);
  });
  if (campos.length === 0) {
    return res.status(400).json({ error: 'Nenhum campo para atualizar.' });
  }
  valores.push(id, organizationId);

  db.run(
    `UPDATE unidades SET ${campos.join(', ')} WHERE id = ? AND organizationId = ?`,
    valores,
    function(err) {
      if (err) {
        if (String(err.message).includes('UNIQUE')) {
          return res.status(409).json({ error: 'Já existe uma unidade com este nome para este negócio.' });
        }
        return res.status(500).json({ error: err.message });
      }
      res.json({ success: true });
    }
  );
});

// Soft delete (ativo=0): o nome da unidade continua referenciado em registros
// históricos de caixa/ponto/metas — apagar a linha de verdade quebraria esse
// histórico. Some da operação do dia a dia (bootstrap só lista ativo=1) mas
// continua na tela de gestão pra poder reativar.
router.delete('/unidades/:id', requireOwner, (req, res) => {
  const organizationId = organizationIdDe(req);
  const { id } = req.params;
  db.run(
    `UPDATE unidades SET ativo = 0 WHERE id = ? AND organizationId = ?`,
    [id, organizationId],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    }
  );
});

// ==========================================================================
// PLANO / PRECIFICAÇÃO POR QUANTIDADE DE UNIDADES
// ==========================================================================
// Catálogo de preços é da PLATAFORMA (não por tenant) — um único conjunto de
// faixas vale para todo mundo que aluga o SaaS. Cadastro/edição das faixas
// fica fora deste endpoint de propósito (é operação do dono da plataforma,
// não de quem administra uma organização cliente).
router.get('/plano', requireOwner, async (req, res) => {
  const organizationId = organizationIdDe(req);
  try {
    const [{ total }] = await dbAllAsync(
      `SELECT COUNT(*) as total FROM unidades WHERE organizationId = ? AND ativo = 1`,
      [organizationId]
    );
    const faixas = await dbAllAsync(
      `SELECT * FROM planos_precificacao ORDER BY unidadesMin ASC`
    );
    const faixaAtual = faixas.map(normalizeRow).find(f =>
      total >= f.unidadesMin && (f.unidadesMax === null || total <= f.unidadesMax)
    ) || null;

    res.json({ unidadesAtivas: total, faixaAtual, faixas: faixas.map(normalizeRow) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================================================
// PERSONA DE IA (brand voice do briefing/copiloto) POR ORGANIZAÇÃO
// ==========================================================================
// configuracoes.iaSistemaBriefing / iaSistemaCopiloto — texto livre que vira
// o "sistema" enviado ao provedor (ver services/ia-briefing.js e
// services/ia-copiloto.js). Sem override cadastrado, cada função usa seu
// próprio texto padrão de fábrica.
router.get('/ia-config', requireOwner, async (req, res) => {
  const organizationId = organizationIdDe(req);
  try {
    const rows = await dbAllAsync(
      `SELECT chave, valor FROM configuracoes WHERE organizationId = ? AND chave IN ('iaSistemaBriefing', 'iaSistemaCopiloto')`,
      [organizationId]
    );
    const config = {};
    rows.forEach(r => { config[r.chave] = r.valor; });
    res.json(config);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/ia-config', requireOwner, (req, res) => {
  const organizationId = organizationIdDe(req);
  const { chave, valor } = req.body;
  if (!['iaSistemaBriefing', 'iaSistemaCopiloto'].includes(chave)) {
    return res.status(400).json({ error: 'chave deve ser "iaSistemaBriefing" ou "iaSistemaCopiloto".' });
  }
  db.run(
    `INSERT INTO configuracoes (chave, valor, organizationId) VALUES (?, ?, ?)
     ON CONFLICT(organizationId, chave) DO UPDATE SET valor = excluded.valor`,
    [chave, valor || null, organizationId],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    }
  );
});

module.exports = router;
