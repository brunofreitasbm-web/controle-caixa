const { dbAllAsync, dbRunAsync } = require('../config/database');
const { atualizarStatusLote } = require('./ifood');

// Implementação simples de Levenshtein Distance
function levenshteinDistance(a, b) {
  const matrix = [];
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }
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

// Tokenização e extração de características (gramatura, sabor, tipo)
function extractFeatures(text) {
  if (!text) return { gramatura: null, tokens: [] };
  const lower = text.toLowerCase();
  
  // Extrair gramatura (ex: 30g, 100g)
  const gramaMatch = lower.match(/(\d+)\s*g/);
  const gramatura = gramaMatch ? gramaMatch[1] : null;

  // Extrair tokens de palavras limpas
  const tokens = lower
    .replace(/[^\w\s]/gi, '')
    .split(' ')
    .filter(t => t.length > 2 && t !== 'com' && t !== 'sem' && t !== 'para');
  
  return { gramatura, tokens };
}

// Avalia a similaridade entre duas descrições e retorna um score (0 a 100)
function calculateSimilarityScore(desc1, desc2) {
  const feat1 = extractFeatures(desc1);
  const feat2 = extractFeatures(desc2);
  
  let score = 0;
  
  // Se gramatura for detectada em ambas e não bater, penalidade alta
  if (feat1.gramatura && feat2.gramatura) {
    if (feat1.gramatura === feat2.gramatura) {
      score += 30; // Peso alto para mesma gramatura
    } else {
      return 0; // Se a gramatura difere, não é o mesmo produto
    }
  }

  // Compara tokens
  let matches = 0;
  for (const t1 of feat1.tokens) {
    for (const t2 of feat2.tokens) {
      // Aceita correspondência exata ou distância pequena (1 erro)
      if (t1 === t2 || (t1.length > 4 && levenshteinDistance(t1, t2) <= 1)) {
        matches++;
        break;
      }
    }
  }
  
  const totalTokens = Math.max(feat1.tokens.length, feat2.tokens.length);
  if (totalTokens > 0) {
    const tokenScore = (matches / totalTokens) * 70; // 70% do peso nos tokens
    score += tokenScore;
  }
  
  return score;
}

/**
 * Função para mockar itens do iFood (Simulação)
 * Como não temos endpoint nativo de listagem no iFood API v1 sem auth explícita de catálogo,
 * essa função retorna um catálogo falso ou consultado do banco local
 */
async function getIfoodCatalog(loja) {
  // Simulando catálogo do iFood que buscaríamos via GET /catalog/v1.0/...
  return [
    { id: "IF-1002345", name: "Trufa LaNut 30g", externalCode: "1002345" },
    { id: "IF-1005678", name: "Caixa Presente Especial", externalCode: "1005678" },
    { id: "IF-1003421", name: "Tablete 70% Cacau 100g", externalCode: "" },
    { id: "IF-9999999", name: "Trufa Tradicional 30g", externalCode: "TR-TRAD-30" }
  ];
}

/**
 * Rotina Principal de Sincronização
 */
async function syncIfoodInventory(loja) {
  console.log(`[iFood Sync] Iniciando sincronização para loja ${loja}...`);
  const dataSincronizacao = new Date().toISOString();

  try {
    // 1. Busca estoque local contado
    const inventarioLocal = await dbAllAsync(
      "SELECT codProduto, descricao, countedQty FROM inventario_itens WHERE loja = ? AND countedQty IS NOT NULL AND countedQty != ''", 
      [String(loja)]
    );
    
    // 2. Busca catálogo do iFood
    const catalogoIfood = await getIfoodCatalog(loja);
    
    const itemsToEnable = [];
    const itemsToDisable = [];
    const historico = [];
    
    // 3. Processamento e Matching
    for (const local of inventarioLocal) {
      const qtd = parseInt(local.countedQty, 10) || 0;
      let matchedIfoodItem = null;

      // Prioridade 1: Match por externalCode (código oficial)
      matchedIfoodItem = catalogoIfood.find(ifItem => ifItem.externalCode === local.codProduto);

      // Prioridade 2: Similaridade de Descrição
      if (!matchedIfoodItem) {
        let bestScore = 0;
        let bestMatch = null;
        for (const ifItem of catalogoIfood) {
          const score = calculateSimilarityScore(local.descricao, ifItem.name);
          if (score > 60 && score > bestScore) { // Limiar mínimo de 60%
            bestScore = score;
            bestMatch = ifItem;
          }
        }
        matchedIfoodItem = bestMatch;
      }

      if (matchedIfoodItem) {
        const statusEnviado = qtd > 0 ? "AVAILABLE" : "UNAVAILABLE";
        
        if (statusEnviado === "AVAILABLE") {
          itemsToEnable.push(matchedIfoodItem.id);
        } else {
          itemsToDisable.push(matchedIfoodItem.id);
        }
        
        historico.push({
          loja,
          codProdutoLocal: local.codProduto,
          codProdutoIfood: matchedIfoodItem.id,
          descricao: matchedIfoodItem.name || local.descricao,
          status_enviado: statusEnviado,
          data_sincronizacao: dataSincronizacao
        });
      }
    }
    
    // 4. Envia atualizações em massa (Lotes limitados, mas aqui juntamos)
    // Usamos o módulo ifood existente. Mesmo se falhar, gravaremos no banco para debug.
    if (itemsToEnable.length > 0) {
      await atualizarStatusLote(loja, itemsToEnable, "AVAILABLE");
    }
    if (itemsToDisable.length > 0) {
      await atualizarStatusLote(loja, itemsToDisable, "UNAVAILABLE");
    }
    
    // 5. Salva histórico (Limpa anterior da loja e insere o novo)
    await dbRunAsync("DELETE FROM ifood_sync_history WHERE loja = ?", [String(loja)]);
    
    for (const h of historico) {
      await dbRunAsync(
        `INSERT INTO ifood_sync_history (loja, codProdutoLocal, codProdutoIfood, descricao, status_enviado, data_sincronizacao) 
         VALUES (?, ?, ?, ?, ?, ?)`,
        [h.loja, h.codProdutoLocal, h.codProdutoIfood, h.descricao, h.status_enviado, h.data_sincronizacao]
      );
    }
    
    console.log(`[iFood Sync] Sincronização concluída para loja ${loja}. Items pareados: ${historico.length}`);
    return { success: true, count: historico.length };

  } catch (err) {
    console.error(`[iFood Sync] Erro geral na sincronização da loja ${loja}:`, err);
    return { success: false, error: err.message };
  }
}

/**
 * Função chamada via Cron para sincronizar todas as lojas
 */
async function syncAllIfoodStores() {
  console.log('[iFood Sync] CRON: Iniciando varredura diária...');
  try {
    const lojasConfiguradas = await dbAllAsync("SELECT loja FROM ifood_config");
    for (const config of lojasConfiguradas) {
      await syncIfoodInventory(config.loja);
    }
    console.log('[iFood Sync] CRON: Varredura diária finalizada.');
  } catch (err) {
    console.error('[iFood Sync] CRON Erro:', err);
  }
}

module.exports = {
  syncIfoodInventory,
  syncAllIfoodStores,
  calculateSimilarityScore // exportado para possíveis testes
};
