const fs = require('fs');
const path = require('path');
const { dbAllAsync, dbRunAsync } = require('../config/database');
const { atualizarStatusLote, fetchIfood } = require('./ifood');

// Implementação de Levenshtein Distance para busca por aproximação
function levenshteinDistance(a, b) {
  const matrix = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          Math.min(matrix[i][j - 1] + 1, matrix[i - 1][j] + 1)
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

// Extração de características para matching inteligente
function extractFeatures(text) {
  if (!text) return { gramatura: null, tokens: [] };
  const lower = text.toLowerCase();
  const gramaMatch = lower.match(/(\d+)\s*g/);
  const gramatura = gramaMatch ? gramaMatch[1] : null;

  const tokens = lower
    .replace(/[^\w\s]/gi, '')
    .split(' ')
    .filter(t => t.length > 2 && t !== 'com' && t !== 'sem' && t !== 'para');

  return { gramatura, tokens };
}

function calculateSimilarityScore(desc1, desc2) {
  const feat1 = extractFeatures(desc1);
  const feat2 = extractFeatures(desc2);
  let score = 0;

  if (feat1.gramatura && feat2.gramatura) {
    if (feat1.gramatura === feat2.gramatura) {
      score += 30;
    } else {
      return 0;
    }
  }

  let matches = 0;
  for (const t1 of feat1.tokens) {
    for (const t2 of feat2.tokens) {
      if (t1 === t2 || (t1.length > 4 && levenshteinDistance(t1, t2) <= 1)) {
        matches++;
        break;
      }
    }
  }

  const totalTokens = Math.max(feat1.tokens.length, feat2.tokens.length);
  if (totalTokens > 0) {
    score += (matches / totalTokens) * 70;
  }

  return score;
}

/**
 * Consulta o catálogo do iFood se configurado
 */
async function getIfoodCatalog(loja) {
  try {
    const result = await fetchIfood(loja, '/catalog/v1.0/merchants/{merchantId}/catalogs', 'GET');
    if (result && result.success && Array.isArray(result.data)) {
      return result.data;
    }
  } catch (e) {
    console.warn(`[iFood Sync] Não foi possível consultar catálogo remoto do iFood para ${loja}, usando mapeamento interno.`);
  }
  return null;
}

/**
 * Regra Estrita de Estoque por Loja:
 * - Se tiver quantidade contada > 0 no estoque da loja -> Ativo (AVAILABLE)
 * - Se a quantidade for <= 0, vazia ou o produto não estiver no estoque da loja -> Desativado (UNAVAILABLE)
 */
async function obterProdutosLocais(loja) {
  const MAPA_LOJA_CODIGO = {
    'marambaia': ['marambaia', '4304'],
    'icoaraci': ['icoaraci', '9175'],
    'mario-covas': ['mario-covas', '9201', 'mario_covas'],
    '4304': ['marambaia', '4304'],
    '9175': ['icoaraci', '9175'],
    '9201': ['mario-covas', '9201', 'mario_covas']
  };

  const codigosLoja = MAPA_LOJA_CODIGO[String(loja).toLowerCase()] || [String(loja)];

  // 1. Mapeia quantidades reais no estoque da loja específica
  const contagensLojaMap = new Map();

  try {
    const placeholdersLoja = codigosLoja.map(() => '?').join(', ');
    const inventarioLoja = await dbAllAsync(
      `SELECT codProduto, descricao, barras AS codBarras, countedQty FROM inventario_itens WHERE LOWER(loja) IN (${placeholdersLoja})`,
      codigosLoja.map(c => String(c).toLowerCase())
    );

    if (Array.isArray(inventarioLoja)) {
      for (const item of inventarioLoja) {
        const cod = String(item.codProduto ?? item.codproduto ?? '').trim();
        if (cod) {
          const rawQty = item.countedQty ?? item.countedqty;
          const numQty = (rawQty === null || rawQty === undefined || rawQty === '') ? 0 : parseInt(rawQty, 10);
          contagensLojaMap.set(cod, Number.isNaN(numQty) ? 0 : numQty);
        }
      }
    }
  } catch (err) {
    console.error(`[iFood Sync] Erro ao consultar inventário da loja ${loja}:`, err);
  }

  // 2. Coleção mestre de produtos cadastrados
  const produtosMestreMap = new Map();

  try {
    const catalogoGeral = await dbAllAsync("SELECT codProduto, descricao, codBarras FROM catalogo_produtos LIMIT 3000");
    if (Array.isArray(catalogoGeral)) {
      for (const item of catalogoGeral) {
        const cod = String(item.codProduto ?? item.codproduto ?? '').trim();
        if (cod && !produtosMestreMap.has(cod)) {
          produtosMestreMap.set(cod, {
            descricao: item.descricao || `Produto ${cod}`,
            codBarras: (item.codBarras ?? item.codbarras) || ''
          });
        }
      }
    }
  } catch (err) {
    console.error('[iFood Sync] Erro ao consultar catálogo geral:', err);
  }

  // Fallback se catálogo de banco estiver indisponível
  if (produtosMestreMap.size === 0) {
    try {
      const csvPath = path.join(__dirname, '..', 'Codbarra_Consulta.csv');
      if (fs.existsSync(csvPath)) {
        const lines = fs.readFileSync(csvPath, 'utf8').split('\n');
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;
          const parts = line.split(',');
          if (parts.length >= 2) {
            const cod = parts[0].trim();
            const desc = parts[1].trim();
            const bar = parts[2] ? parts[2].trim() : '';
            if (cod && !produtosMestreMap.has(cod)) {
              produtosMestreMap.set(cod, { descricao: desc, codBarras: bar });
            }
          }
        }
      }
    } catch (csvErr) {
      console.error('[iFood Sync] Erro ao ler CSV fallback:', csvErr);
    }
  }

  // Se mesmo assim houver produtos no estoque da loja que não estavam no catálogo mestre, adiciona-os
  for (const [cod, qty] of contagensLojaMap.entries()) {
    if (!produtosMestreMap.has(cod)) {
      produtosMestreMap.set(cod, { descricao: `Produto ${cod}`, codBarras: '' });
    }
  }

  // 3. Constrói a lista com o status exato por loja
  const itens = [];
  for (const [cod, info] of produtosMestreMap.entries()) {
    const qtyEstoque = contagensLojaMap.has(cod) ? contagensLojaMap.get(cod) : 0;
    const disponivel = qtyEstoque > 0;

    itens.push({
      codProduto: cod,
      descricao: info.descricao,
      codBarras: info.codBarras,
      countedQty: qtyEstoque,
      isAvailable: disponivel
    });
  }

  return itens;
}

/**
 * Rotina Principal de Sincronização
 */
async function syncIfoodInventory(loja) {
  console.log(`[iFood Sync] Iniciando sincronização por regras de estoque da loja ${loja}...`);
  const dataSincronizacao = new Date().toISOString();

  try {
    // 1. Obter todos os produtos avaliados no estoque da loja
    const inventarioLocal = await obterProdutosLocais(loja);
    if (inventarioLocal.length === 0) {
      console.warn(`[iFood Sync] Nenhum produto local encontrado para a loja ${loja}`);
      return { success: true, count: 0, disponiveis: 0, indisponiveis: 0 };
    }

    // 2. Tenta obter o catálogo de produtos do iFood
    const catalogoIfood = await getIfoodCatalog(loja);

    const itemsToEnable = [];
    const itemsToDisable = [];
    const historico = [];

    let totalDisponiveis = 0;
    let totalIndisponiveis = 0;

    // 3. Processamento e Avaliação de Estoque
    for (const local of inventarioLocal) {
      const isAvailable = local.isAvailable === true;
      const statusEnviado = isAvailable ? "AVAILABLE" : "UNAVAILABLE";

      if (isAvailable) {
        totalDisponiveis++;
      } else {
        totalIndisponiveis++;
      }

      let matchedIfoodId = `IF-${local.codProduto}`;
      let matchedDescricao = local.descricao;

      if (Array.isArray(catalogoIfood) && catalogoIfood.length > 0) {
        const matchCode = catalogoIfood.find(ifItem => 
          ifItem.externalCode === local.codProduto || ifItem.id === local.codProduto || ifItem.ean === local.codBarras
        );
        if (matchCode) {
          matchedIfoodId = matchCode.id;
          matchedDescricao = matchCode.name || local.descricao;
        } else {
          let bestScore = 0;
          let bestMatch = null;
          for (const ifItem of catalogoIfood) {
            const score = calculateSimilarityScore(local.descricao, ifItem.name || '');
            if (score > 60 && score > bestScore) {
              bestScore = score;
              bestMatch = ifItem;
            }
          }
          if (bestMatch) {
            matchedIfoodId = bestMatch.id;
            matchedDescricao = bestMatch.name || local.descricao;
          }
        }
      }

      if (isAvailable) {
        itemsToEnable.push(matchedIfoodId);
      } else {
        itemsToDisable.push(matchedIfoodId);
      }

      historico.push({
        loja,
        codProdutoLocal: local.codProduto,
        codProdutoIfood: matchedIfoodId,
        descricao: matchedDescricao,
        status_enviado: statusEnviado,
        data_sincronizacao: dataSincronizacao
      });
    }

    // 4. Envia atualizações via API Merchant iFood (se autenticado)
    if (itemsToEnable.length > 0) {
      await atualizarStatusLote(loja, itemsToEnable, "AVAILABLE");
    }
    if (itemsToDisable.length > 0) {
      await atualizarStatusLote(loja, itemsToDisable, "UNAVAILABLE");
    }

    // 5. Atualiza histórico no banco de dados em lotes (alta performance)
    await dbRunAsync("DELETE FROM ifood_sync_history WHERE loja = ?", [String(loja)]);

    const CHUNK_SIZE = 400;
    for (let i = 0; i < historico.length; i += CHUNK_SIZE) {
      const chunk = historico.slice(i, i + CHUNK_SIZE);
      const placeholders = chunk.map(() => "(?, ?, ?, ?, ?, ?)").join(", ");
      const values = [];
      chunk.forEach(h => {
        values.push(h.loja, h.codProdutoLocal, h.codProdutoIfood, h.descricao, h.status_enviado, h.data_sincronizacao);
      });
      await dbRunAsync(
        `INSERT INTO ifood_sync_history (loja, codProdutoLocal, codProdutoIfood, descricao, status_enviado, data_sincronizacao) VALUES ${placeholders}`,
        values
      );
    }

    console.log(`[iFood Sync] Loja ${loja}: ${totalDisponiveis} itens ATIVOS (AVAILABLE) e ${totalIndisponiveis} DESATIVADOS (UNAVAILABLE). Total: ${historico.length}.`);
    return {
      success: true,
      count: historico.length,
      disponiveis: totalDisponiveis,
      indisponiveis: totalIndisponiveis
    };

  } catch (err) {
    console.error(`[iFood Sync] Erro na sincronização da loja ${loja}:`, err);
    return { success: false, error: err.message };
  }
}

/**
 * Função chamada via Cron para sincronizar todas as lojas
 */
async function syncAllIfoodStores() {
  console.log('[iFood Sync] CRON: Iniciando varredura por regras de estoque...');
  try {
    const lojasConfiguradas = await dbAllAsync("SELECT loja FROM ifood_config");
    for (const config of lojasConfiguradas) {
      await syncIfoodInventory(config.loja);
    }
    console.log('[iFood Sync] CRON: Varredura finalizada.');
  } catch (err) {
    console.error('[iFood Sync] CRON Erro:', err);
  }
}

module.exports = {
  syncIfoodInventory,
  syncAllIfoodStores,
  calculateSimilarityScore
};
