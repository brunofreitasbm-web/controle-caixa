// ==========================================================================
// PAINEL DA PLATAFORMA — gestão das organizações (clientes) do SaaS
// ==========================================================================
// Diferente de routes/tenant.js (cada organização gerenciando os PRÓPRIOS
// dados), isto é o dono do Huboperações gerenciando QUAIS organizações
// existem — criar cliente novo, ver quantas unidades cada um usa, suspender
// acesso. Todo endpoint exige requirePlatformAdmin (ver o middleware).
// ==========================================================================

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { db, dbAllAsync, dbGetAsync, dbRunAsync, normalizeRow } = require('../config/database');
const requirePlatformAdmin = require('./middleware/requirePlatformAdmin');

router.use(requirePlatformAdmin);

const BCRYPT_ROUNDS = 10;

function calcularFaixa(unidadesAtivas, faixas) {
  return faixas.find(f =>
    unidadesAtivas >= f.unidadesMin && (f.unidadesMax === null || unidadesAtivas <= f.unidadesMax)
  ) || null;
}

// Lista todas as organizações com o essencial pra decidir o que fazer com
// cada uma: quantas unidades ativas, quantos colaboradores, e a faixa de
// preço que se aplica (planos_precificacao — ver routes/tenant.js).
router.get('/organizations', async (req, res) => {
  try {
    const [orgs, faixas] = await Promise.all([
      dbAllAsync('SELECT * FROM organizations ORDER BY criadoEm DESC'),
      dbAllAsync('SELECT * FROM planos_precificacao ORDER BY unidadesMin ASC')
    ]);
    const faixasNormalizadas = faixas.map(normalizeRow);

    const resultado = await Promise.all(orgs.map(normalizeRow).map(async (org) => {
      const [{ unidadesAtivas }] = await dbAllAsync(
        'SELECT COUNT(*) as unidadesAtivas FROM unidades WHERE organizationId = ? AND ativo = 1',
        [org.id]
      );
      const [{ colaboradores }] = await dbAllAsync(
        'SELECT COUNT(*) as colaboradores FROM colaboradores WHERE organizationId = ?',
        [org.id]
      );
      return {
        ...org,
        unidadesAtivas,
        colaboradores,
        faixaAtual: calcularFaixa(unidadesAtivas, faixasNormalizadas)
      };
    }));

    res.json(resultado);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Cria uma organização nova e, opcionalmente, o primeiro owner dela (nome +
// PIN) — sem isso, ninguém consegue logar na organização recém-criada
// (POST /auth/verify exige um colaborador já cadastrado, e o cadastro de
// colaborador via /api/colaboradores exige uma sessão daquela organização:
// sem um primeiro owner, é um impasse que só quem administra a plataforma
// pode resolver).
router.post('/organizations', async (req, res) => {
  const { slug, nome, plano, primeiroOwnerNome, primeiroOwnerPin } = req.body;
  if (!slug || !nome) {
    return res.status(400).json({ error: 'slug e nome são obrigatórios.' });
  }
  if (!/^[a-z0-9-]+$/.test(slug)) {
    return res.status(400).json({ error: 'slug deve conter só letras minúsculas, números e hífen.' });
  }

  const id = `org-${slug}`;
  const agora = new Date().toISOString();

  try {
    const existente = await dbGetAsync('SELECT id FROM organizations WHERE id = ? OR slug = ?', [id, slug]);
    if (existente) {
      return res.status(409).json({ error: 'Já existe uma organização com este slug.' });
    }

    await dbRunAsync(
      `INSERT INTO organizations (id, slug, nome, status, plano, criadoEm) VALUES (?, ?, ?, 'trial', ?, ?)`,
      [id, slug, nome.trim(), plano || null, agora]
    );

    let primeiroOwnerCriado = false;
    if (primeiroOwnerNome && primeiroOwnerPin) {
      if (!/^\d{4}$/.test(primeiroOwnerPin)) {
        return res.status(400).json({ error: 'PIN do primeiro owner deve ter 4 dígitos.' });
      }
      const hash = await bcrypt.hash(primeiroOwnerPin, BCRYPT_ROUNDS);
      await dbRunAsync(
        `INSERT INTO colaboradores (nome, role, criadoEm, organizationId) VALUES (?, 'owner', ?, ?)`,
        [primeiroOwnerNome.trim(), agora, id]
      );
      await dbRunAsync(
        `INSERT INTO pins (usuario, pin, organizationId) VALUES (?, ?, ?)`,
        [primeiroOwnerNome.trim(), hash, id]
      );
      primeiroOwnerCriado = true;
    }

    res.status(201).json({ success: true, id, primeiroOwnerCriado });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const CAMPOS_ORG_EDITAVEIS = new Set(['nome', 'status', 'plano']);

router.put('/organizations/:id', (req, res) => {
  const { id } = req.params;
  const campos = [];
  const valores = [];
  Object.keys(req.body || {}).forEach(chave => {
    if (!CAMPOS_ORG_EDITAVEIS.has(chave)) return;
    campos.push(`${chave} = ?`);
    valores.push(req.body[chave]);
  });
  if (campos.length === 0) {
    return res.status(400).json({ error: 'Nenhum campo para atualizar.' });
  }
  valores.push(id);

  db.run(`UPDATE organizations SET ${campos.join(', ')} WHERE id = ?`, valores, function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

module.exports = router;
