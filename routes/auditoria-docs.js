// ==========================================================================
// Pasta de Auditoria — repositório de documentos legais/societários
// (CNPJ, contrato social, alvará, habite-se, seguro, contratos trabalhistas
// etc.), separado por negócio: Cacau Show e Faça Amigos.
//
// `conteudo` guarda o arquivo como data URL base64 (mesmo padrão de
// registros.fotoEnvelope) e nunca vai na listagem — só no endpoint dedicado
// de download, sob demanda.
// ==========================================================================

const express = require('express');
const router = express.Router();
const { dbGetAsync, dbAllAsync, dbRunAsync, normalizeRow } = require('../config/database');
const { registrarLog } = require('../config/logger');
const requireOwner = require('./middleware/requireOwner');
const { sugerirVencimento } = require('../services/ia-doc-vencimento');

const NEGOCIOS_VALIDOS = ['cacau-show', 'faca-amigos'];
const CATEGORIAS_VALIDAS = ['CNPJ', 'Contrato Social', 'Alvará', 'Habite-se', 'Seguro', 'Contrato Trabalhista', 'Outro'];

// Papéis restritos a um único negócio; owner não aparece aqui (sem restrição).
const NEGOCIO_POR_ROLE = {
  consultora: 'cacau-show',
  consultora_dashboard: 'cacau-show',
  consultora_fa: 'faca-amigos'
};

function semConteudo(doc) {
  if (!doc || typeof doc !== 'object') return doc;
  const { conteudo, ...resto } = doc;
  return resto;
}

// Resolve o papel do ator e o negócio ao qual ele está restrito (null = owner,
// sem restrição). Lança { status, error } para os handlers responderem.
async function resolverAcesso(actorUsuario) {
  const nome = (actorUsuario || '').trim();
  if (!nome) throw { status: 400, error: 'actorUsuario é obrigatório.' };

  const colaborador = await dbGetAsync('SELECT role FROM colaboradores WHERE nome = ?', [nome]);
  if (!colaborador) throw { status: 403, error: 'Usuário não encontrado.' };

  if (colaborador.role === 'owner') return { role: 'owner', negocioForcado: null };

  const negocioForcado = NEGOCIO_POR_ROLE[colaborador.role];
  if (!negocioForcado) throw { status: 403, error: 'Este perfil não tem acesso à Pasta de Auditoria.' };

  return { role: colaborador.role, negocioForcado };
}

function decodificarDataUrl(dataUrl) {
  const match = /^data:([^;]+);base64,(.+)$/s.exec(dataUrl || '');
  if (!match) return null;
  return { mimeType: match[1], buffer: Buffer.from(match[2], 'base64') };
}

// --------------------------------------------------------------------------
// GET / — lista documentos (sem o conteúdo) filtrados por negócio/unidade/
// categoria/vencimento. Consultoras só enxergam o negócio da própria unidade.
// --------------------------------------------------------------------------
router.get('/', async (req, res) => {
  try {
    const { actorUsuario, unidade, categoria, vencimento } = req.query;
    const { negocioForcado } = await resolverAcesso(actorUsuario);

    const negocioSolicitado = req.query.negocio;
    if (negocioForcado && negocioSolicitado && negocioSolicitado !== negocioForcado) {
      return res.status(403).json({ error: 'Acesso negado a este negócio.' });
    }

    const negocio = negocioForcado || negocioSolicitado;
    if (!negocio) return res.status(400).json({ error: 'negocio é obrigatório.' });
    if (!NEGOCIOS_VALIDOS.includes(negocio)) {
      return res.status(400).json({ error: 'negocio inválido.' });
    }

    const condicoes = ['negocio = ?'];
    const params = [negocio];

    if (unidade) { condicoes.push('unidade = ?'); params.push(unidade); }
    if (categoria) { condicoes.push('categoria = ?'); params.push(categoria); }

    const hoje = new Date().toISOString().slice(0, 10);
    if (vencimento === 'vencidos') {
      condicoes.push('dataVencimento IS NOT NULL', 'dataVencimento <> \'\'', 'dataVencimento < ?');
      params.push(hoje);
    } else if (vencimento === '30dias') {
      const em30Dias = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      condicoes.push('dataVencimento IS NOT NULL', 'dataVencimento <> \'\'', 'dataVencimento BETWEEN ? AND ?');
      params.push(hoje, em30Dias);
    }

    const linhas = await dbAllAsync(
      `SELECT * FROM documentos_auditoria WHERE ${condicoes.join(' AND ')} ORDER BY criadoEm DESC`,
      params
    );
    res.json(linhas.map(normalizeRow).map(semConteudo));
  } catch (erro) {
    if (erro && erro.status) return res.status(erro.status).json({ error: erro.error });
    res.status(500).json({ error: erro.message });
  }
});

// --------------------------------------------------------------------------
// GET /:id/arquivo — devolve o arquivo (data URL base64) de um documento.
// Só busca o conteúdo pesado sob demanda, nunca na listagem.
// --------------------------------------------------------------------------
router.get('/:id/arquivo', async (req, res) => {
  try {
    const { negocioForcado } = await resolverAcesso(req.query.actorUsuario);

    const linha = await dbGetAsync('SELECT * FROM documentos_auditoria WHERE id = ?', [req.params.id]);
    if (!linha) return res.status(404).json({ error: 'Documento não encontrado.' });

    const doc = normalizeRow(linha);
    if (negocioForcado && doc.negocio !== negocioForcado) {
      return res.status(403).json({ error: 'Acesso negado a este documento.' });
    }

    res.json({ conteudo: doc.conteudo, nomeArquivo: doc.nomeArquivo, mimeType: doc.mimeType });
  } catch (erro) {
    if (erro && erro.status) return res.status(erro.status).json({ error: erro.error });
    res.status(500).json({ error: erro.message });
  }
});

// --------------------------------------------------------------------------
// POST / — envia um documento novo. Owner e consultoras da própria unidade
// podem enviar; se vier PDF sem dataVencimento, a IA tenta sugerir uma data
// (o humano confirma/edita depois — nunca é gravado como definitivo).
// --------------------------------------------------------------------------
router.post('/', async (req, res) => {
  try {
    const r = req.body || {};
    const { negocioForcado } = await resolverAcesso(r.actorUsuario);

    if (negocioForcado && r.negocio && r.negocio !== negocioForcado) {
      return res.status(403).json({ error: 'Acesso negado a este negócio.' });
    }
    const negocio = negocioForcado || r.negocio;
    if (!NEGOCIOS_VALIDOS.includes(negocio)) {
      return res.status(400).json({ error: 'negocio inválido.' });
    }
    if (!CATEGORIAS_VALIDAS.includes(r.categoria)) {
      return res.status(400).json({ error: 'categoria inválida.' });
    }
    if (!r.id || !r.conteudo) {
      return res.status(400).json({ error: 'id e conteudo são obrigatórios.' });
    }

    let dataVencimento = r.dataVencimento || null;
    let vencimentoSugeridoIA = 0;

    if (!dataVencimento) {
      const decodificado = decodificarDataUrl(r.conteudo);
      if (decodificado && decodificado.mimeType === 'application/pdf') {
        const sugestao = await sugerirVencimento(decodificado.buffer);
        if (sugestao) {
          dataVencimento = sugestao;
          vencimentoSugeridoIA = 1;
        }
      }
    }

    const agora = new Date().toISOString();
    await dbRunAsync(
      `INSERT INTO documentos_auditoria (
        id, negocio, unidade, categoria, categoriaOutro, nomeArquivo, mimeType,
        conteudo, dataVencimento, vencimentoSugeridoIA, observacoes, enviadoPor,
        criadoEm, atualizadoEm
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        r.id, negocio, r.unidade || null, r.categoria, r.categoriaOutro || null,
        r.nomeArquivo || null, r.mimeType || null, r.conteudo, dataVencimento,
        vencimentoSugeridoIA, r.observacoes || null, r.actorUsuario,
        agora, agora
      ]
    );

    registrarLog(r.id, 'enviar_documento_auditoria', `Enviou "${r.nomeArquivo || r.categoria}" na Pasta de Auditoria (${negocio}).`, r.actorUsuario);

    const linha = await dbGetAsync('SELECT * FROM documentos_auditoria WHERE id = ?', [r.id]);
    res.status(201).json(semConteudo(normalizeRow(linha)));
  } catch (erro) {
    if (erro && erro.status) return res.status(erro.status).json({ error: erro.error });
    res.status(500).json({ error: erro.message });
  }
});

// --------------------------------------------------------------------------
// PUT /:id — edita metadados (e opcionalmente o arquivo). Só Owner.
// --------------------------------------------------------------------------
router.put('/:id', requireOwner, async (req, res) => {
  try {
    const r = req.body || {};
    const linha = await dbGetAsync('SELECT * FROM documentos_auditoria WHERE id = ?', [req.params.id]);
    if (!linha) return res.status(404).json({ error: 'Documento não encontrado.' });
    const atual = normalizeRow(linha);

    if (r.categoria && !CATEGORIAS_VALIDAS.includes(r.categoria)) {
      return res.status(400).json({ error: 'categoria inválida.' });
    }

    const atualizado = {
      unidade: r.unidade !== undefined ? r.unidade : atual.unidade,
      categoria: r.categoria || atual.categoria,
      categoriaOutro: r.categoriaOutro !== undefined ? r.categoriaOutro : atual.categoriaOutro,
      dataVencimento: r.dataVencimento !== undefined ? r.dataVencimento : atual.dataVencimento,
      observacoes: r.observacoes !== undefined ? r.observacoes : atual.observacoes,
      nomeArquivo: r.nomeArquivo || atual.nomeArquivo,
      mimeType: r.mimeType || atual.mimeType,
      conteudo: r.conteudo || atual.conteudo
    };

    await dbRunAsync(
      `UPDATE documentos_auditoria SET
        unidade = ?, categoria = ?, categoriaOutro = ?, dataVencimento = ?,
        observacoes = ?, nomeArquivo = ?, mimeType = ?, conteudo = ?, atualizadoEm = ?
      WHERE id = ?`,
      [
        atualizado.unidade, atualizado.categoria, atualizado.categoriaOutro, atualizado.dataVencimento,
        atualizado.observacoes, atualizado.nomeArquivo, atualizado.mimeType, atualizado.conteudo,
        new Date().toISOString(), req.params.id
      ]
    );

    registrarLog(req.params.id, 'editar_documento_auditoria', `Editou "${atualizado.nomeArquivo || atualizado.categoria}" na Pasta de Auditoria.`, r.actorUsuario);

    const linhaAtualizada = await dbGetAsync('SELECT * FROM documentos_auditoria WHERE id = ?', [req.params.id]);
    res.json(semConteudo(normalizeRow(linhaAtualizada)));
  } catch (erro) {
    res.status(500).json({ error: erro.message });
  }
});

// --------------------------------------------------------------------------
// DELETE /:id — só Owner.
// --------------------------------------------------------------------------
router.delete('/:id', requireOwner, async (req, res) => {
  try {
    const linha = await dbGetAsync('SELECT * FROM documentos_auditoria WHERE id = ?', [req.params.id]);
    if (!linha) return res.status(404).json({ error: 'Documento não encontrado.' });
    const doc = normalizeRow(linha);

    await dbRunAsync('DELETE FROM documentos_auditoria WHERE id = ?', [req.params.id]);
    registrarLog(req.params.id, 'apagar_documento_auditoria', `Apagou "${doc.nomeArquivo || doc.categoria}" da Pasta de Auditoria.`, req.body.actorUsuario);
    res.json({ ok: true });
  } catch (erro) {
    res.status(500).json({ error: erro.message });
  }
});

module.exports = router;
