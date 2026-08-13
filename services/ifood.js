const { dbGetAsync, dbRunAsync } = require('../config/database');
const { registrarLog } = require('../config/logger');

const IFOOD_BASE_URL = 'https://merchant-api.ifood.com.br';

/**
 * Obtém o token de acesso do iFood para uma loja específica.
 * Utiliza cache no banco e renova automaticamente se expirado.
 */
async function getIfoodToken(loja) {
  try {
    const config = await dbGetAsync("SELECT * FROM ifood_config WHERE loja = ?", [String(loja)]);
    if (!config || !config.clientId || !config.clientSecret || !config.merchantId) {
      return null;
    }

    // Retorna o token em cache se ainda for válido (com 60s de folga)
    const agora = Date.now();
    if (config.token && config.tokenExpiraEm && config.tokenExpiraEm > (agora + 60000)) {
      return { token: config.token, merchantId: config.merchantId };
    }

    // Solicita novo token
    const url = `${IFOOD_BASE_URL}/authentication/v1.0/oauth/token`;
    const params = new URLSearchParams();
    params.append('grant_type', 'client_credentials');
    params.append('clientId', config.clientId);
    params.append('clientSecret', config.clientSecret);

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[iFood] Erro de autenticação para a loja ${loja}:`, errText);
      return null;
    }

    const data = await response.json();
    const token = data.accessToken;
    // data.expiresIn é em segundos
    const tokenExpiraEm = agora + (data.expiresIn * 1000);

    // Salva no banco
    await dbRunAsync("UPDATE ifood_config SET token = ?, tokenExpiraEm = ? WHERE loja = ?", [token, tokenExpiraEm, String(loja)]);

    return { token, merchantId: config.merchantId };
  } catch (err) {
    console.error(`[iFood] Erro ao obter token para a loja ${loja}:`, err);
    return null;
  }
}

/**
 * Helper para requisições genéricas do iFood
 */
async function fetchIfood(loja, endpoint, method, body = null) {
  const auth = await getIfoodToken(loja);
  if (!auth) return null; // Loja não configurada ou erro de auth

  const url = `${IFOOD_BASE_URL}${endpoint.replace('{merchantId}', auth.merchantId)}`;
  
  const options = {
    method,
    headers: {
      'Authorization': `Bearer ${auth.token}`,
      'Content-Type': 'application/json'
    }
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  try {
    const response = await fetch(url, options);
    if (!response.ok) {
      const errText = await response.text();
      console.error(`[iFood] Falha na API (${method} ${url}):`, errText);
      return { success: false, status: response.status, error: errText };
    }
    // Muitas requisições (como PATCH) retornam 202 Accepted sem corpo, ou 200 OK
    const text = await response.text();
    const data = text ? JSON.parse(text) : {};
    return { success: true, data };
  } catch (err) {
    console.error(`[iFood] Erro de requisição (${method} ${url}):`, err);
    return { success: false, error: err.message };
  }
}

/**
 * 1. Controle de Quantidade (Estoque)
 * POST /inventory/v1.0/merchants/{merchantId}/inventory
 */
async function atualizarEstoque(loja, codProduto, quantidade) {
  // O endpoint pode variar dependendo da versão oficial, vamos usar o padrão para Inventory
  const endpoint = `/inventory/v1.0/merchants/{merchantId}/inventory`;
  const body = [{
    productId: String(codProduto),
    amount: Number(quantidade)
  }];
  
  return fetchIfood(loja, endpoint, 'POST', body);
}

/**
 * 2. Pausar/Ativar Itens
 * PATCH /catalog/v1.0/merchants/{merchantId}/items/{itemId}
 * Podemos usar esse endpoint para mudar propriedades específicas (ex: status)
 */
async function atualizarStatusItem(loja, codProduto, status) {
  // status: "AVAILABLE" ou "UNAVAILABLE"
  const endpoint = `/catalog/v1.0/merchants/{merchantId}/items/${codProduto}`;
  const body = {
    status: status
  };
  
  return fetchIfood(loja, endpoint, 'PATCH', body);
}

/**
 * 3. Atualização em Massa (Status)
 * PATCH /catalog/v1.0/merchants/{merchantId}/products/status
 */
async function atualizarStatusLote(loja, produtosCodigos, status) {
  const endpoint = `/catalog/v1.0/merchants/{merchantId}/products/status`;
  const body = {
    status: status, // "AVAILABLE" ou "UNAVAILABLE"
    productIds: produtosCodigos.map(String)
  };
  
  return fetchIfood(loja, endpoint, 'PATCH', body);
}

/**
 * 4. Atualização em Massa (Preços)
 * PATCH /catalog/v1.0/merchants/{merchantId}/products/price
 */
async function atualizarPrecoLote(loja, produtosPrecos) {
  // produtosPrecos: array de { productId: string, price: number }
  const endpoint = `/catalog/v1.0/merchants/{merchantId}/products/price`;
  // Converte para a estrutura esperada
  const body = produtosPrecos.map(p => ({
    productId: String(p.productId),
    price: Number(p.price)
  }));
  
  return fetchIfood(loja, endpoint, 'PATCH', body);
}

module.exports = {
  getIfoodToken,
  atualizarEstoque,
  atualizarStatusItem,
  atualizarStatusLote,
  atualizarPrecoLote
};
