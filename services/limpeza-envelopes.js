const { dbAllAsync, dbRunAsync } = require('../config/database');
const { registrarLog } = require('../config/logger');
const { publish } = require('../config/realtime');

const DIAS_PADRAO = 5;

/**
 * Retorna a data de referência para contagem dos dias.
 * Prioridade: dataRetirada (momento do recolhimento).
 * Fallback: criadoEm ou dataOperacao (para registros antigos onde dataRetirada não foi gravada).
 */
function obterDataReferencia(row) {
  const rawDate = row.dataRetirada || row.criadoEm || row.dataOperacao;
  if (!rawDate) return null;
  const d = new Date(rawDate);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Atualiza registros em lote para setar fotoEnvelope = NULL.
 */
async function limparLoteNoBanco(tabela, ids) {
  if (!ids || ids.length === 0) return 0;
  const TAMANHO_LOTE = 50;
  let total = 0;

  for (let i = 0; i < ids.length; i += TAMANHO_LOTE) {
    const lote = ids.slice(i, i + TAMANHO_LOTE);
    const placeholders = lote.map(() => '?').join(',');
    await dbRunAsync(
      `UPDATE ${tabela} SET fotoEnvelope = NULL WHERE id IN (${placeholders})`,
      lote
    );
    total += lote.length;
  }

  return total;
}

/**
 * Exclui do banco de dados as fotos de envelopes recolhidos (status 'retirado' ou 'recolhido')
 * após o período estipulado (padrão: 5 dias a partir da data de retirada).
 *
 * @param {Object} options
 * @param {number} [options.dias=5] Quantidade de dias após o recolhimento para expirar a foto.
 * @param {Date} [options.agora=new Date()] Data base para o cálculo de corte.
 * @returns {Promise<Object>} Resumo das fotos excluídas por tabela.
 */
async function limparFotosEnvelopesRecolhidosAntigos({ dias = DIAS_PADRAO, agora = new Date() } = {}) {
  const cutoffTime = agora.getTime() - dias * 24 * 60 * 60 * 1000;
  const cutoffIso = new Date(cutoffTime).toISOString();

  // 1. Processar tabela 'registros' (Cacau Show)
  const candidatosCacau = await dbAllAsync(
    `SELECT id, loja, consultor, dataRetirada, dataOperacao, criadoEm
     FROM registros
     WHERE (status = 'retirado' OR status = 'recolhido')
       AND fotoEnvelope IS NOT NULL
       AND fotoEnvelope != ''`
  );

  const idsCacauParaLimpar = [];
  for (const r of candidatosCacau) {
    const dt = obterDataReferencia(r);
    if (dt && dt.getTime() <= cutoffTime) {
      idsCacauParaLimpar.push(r.id);
    }
  }

  let cacauLimpos = 0;
  if (idsCacauParaLimpar.length > 0) {
    cacauLimpos = await limparLoteNoBanco('registros', idsCacauParaLimpar);
    idsCacauParaLimpar.forEach(id => {
      registrarLog(
        id,
        'CLEANUP_FOTO',
        `Foto do envelope excluída automaticamente após ${dias} dias do recolhimento.`,
        'Sistema'
      );
      try {
        publish(
          'registro.alterado',
          { id, campos: { temFoto: false, fotoEnvelope: null } },
          { origem: 'sistema', usuario: 'Sistema' }
        );
      } catch (e) {
        // SSE é melhor esforço
      }
    });
  }

  // 2. Processar tabela 'registros_fa' (Faça Amigos)
  const candidatosFA = await dbAllAsync(
    `SELECT id, loja, consultor, dataRetirada, dataOperacao, criadoEm
     FROM registros_fa
     WHERE (status = 'retirado' OR status = 'recolhido')
       AND fotoEnvelope IS NOT NULL
       AND fotoEnvelope != ''`
  );

  const idsFAParaLimpar = [];
  for (const r of candidatosFA) {
    const dt = obterDataReferencia(r);
    if (dt && dt.getTime() <= cutoffTime) {
      idsFAParaLimpar.push(r.id);
    }
  }

  let faLimpos = 0;
  if (idsFAParaLimpar.length > 0) {
    faLimpos = await limparLoteNoBanco('registros_fa', idsFAParaLimpar);
    idsFAParaLimpar.forEach(id => {
      registrarLog(
        id,
        'CLEANUP_FOTO_FA',
        `Foto do envelope Faça Amigos excluída automaticamente após ${dias} dias do recolhimento.`,
        'Sistema'
      );
      try {
        publish(
          'registroFa.alterado',
          { id, campos: { temFoto: false, fotoEnvelope: null } },
          { origem: 'sistema', usuario: 'Sistema' }
        );
      } catch (e) {
        // SSE é melhor esforço
      }
    });
  }

  const totalLimpos = cacauLimpos + faLimpos;
  if (totalLimpos > 0) {
    console.log(
      `[Limpeza Envelopes] ${totalLimpos} foto(s) de envelopes recolhidos há mais de ${dias} dias foram excluídas (Cacau Show: ${cacauLimpos}, Faça Amigos: ${faLimpos}).`
    );
  }

  return {
    sucesso: true,
    diasLimite: dias,
    dataCorte: cutoffIso,
    cacauShow: {
      encontrados: candidatosCacau.length,
      limpos: cacauLimpos,
      ids: idsCacauParaLimpar
    },
    facaAmigos: {
      encontrados: candidatosFA.length,
      limpos: faLimpos,
      ids: idsFAParaLimpar
    },
    totalLimpos
  };
}

module.exports = {
  limparFotosEnvelopesRecolhidosAntigos,
  obterDataReferencia
};
