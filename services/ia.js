// ==========================================================================
// CAMADA DE IA — agnóstica de provedor
// ==========================================================================
// Todo acesso a modelo de linguagem do sistema passa por aqui. O objetivo é
// que nenhuma rota conheça o provedor: se a cota gratuita do Gemini apertar,
// troca-se IA_PROVIDER no .env e mais nada muda no app.
//
// Regras que valem para TODOS os usos (ver docs/IA.md):
//   1. A IA sugere, o humano aprova. Nada aqui escreve em tabela de negócio.
//   2. Toda funcionalidade precisa de fallback — se a API cair ou a cota
//      estourar, o app continua funcionando com o comportamento anterior.
//   3. Cache no banco. Camada gratuita tem cota diária, não infinita.
//   4. Nunca enviar telefone, CPF, nome completo ou foto de envelope ao
//      provedor. Quem monta o prompt é responsável por isso; ver anonimizar().
// ==========================================================================

const { dbGetAsync, dbRunAsync } = require('../config/database');

const PROVEDOR = (process.env.IA_PROVIDER || 'gemini').toLowerCase();

// Intervalo mínimo entre duas chamadas ao provedor. A camada gratuita do
// Gemini limita requisições por minuto; disparar 200 aniversariantes de uma
// vez estouraria a cota e derrubaria o lote inteiro. A fila abaixo serializa
// as chamadas com esse espaçamento.
const INTERVALO_MIN_MS = parseInt(process.env.IA_INTERVALO_MS) || 4000;
const TIMEOUT_MS = parseInt(process.env.IA_TIMEOUT_MS) || 30000;
const MAX_TENTATIVAS = 3;

// Orçamento de raciocínio dos modelos "thinking" do Gemini. Ver comentário no
// adaptador. IA_THINKING_BUDGET=-1 reativa o modo automático, caso algum uso
// futuro precise de raciocínio de verdade.
const THINKING_BUDGET = Number.isFinite(parseInt(process.env.IA_THINKING_BUDGET))
  ? parseInt(process.env.IA_THINKING_BUDGET)
  : 128;

// --------------------------------------------------------------------------
// Erro dedicado: sinaliza ao chamador que ele deve cair no fallback, em vez
// de propagar um 500 para o usuário. Toda rota que usa IA trata este erro.
// --------------------------------------------------------------------------
class IAIndisponivelError extends Error {
  constructor(motivo, causa) {
    super(`IA indisponível: ${motivo}`);
    this.name = 'IAIndisponivelError';
    this.motivo = motivo;
    this.causa = causa;
  }
}

// --------------------------------------------------------------------------
// Configuração por provedor. Cada adaptador expõe a mesma assinatura:
// montar(prompt, sistema, opcoes) -> { url, headers, body } e
// extrair(resposta) -> string.
// --------------------------------------------------------------------------
const PROVEDORES = {
  gemini: {
    chave: () => process.env.GEMINI_API_KEY,
    // flash-lite, e não o "flash-latest": o alias latest aponta para o Flash
    // de ponta, que é um modelo "thinking" e tem cota gratuita muito baixa
    // (~20 requisições por janela) — um lote de mensagens de aniversário
    // estouraria no meio. O lite não raciocina (nada de resposta truncada
    // por tokens de pensamento) e tem cota bem mais folgada, que é o que
    // importa para o nosso volume.
    modelo: () => process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite',
    montar(prompt, sistema, { json, maxTokens, temperatura }) {
      const modelo = this.modelo();
      const generationConfig = {
        temperature: temperatura,
        maxOutputTokens: maxTokens,
        // Os modelos Flash atuais são "thinking" por padrão, e os tokens de
        // raciocínio contam dentro de maxOutputTokens — sem isto, o modelo
        // gastava ~700 tokens pensando e devolvia o JSON truncado
        // (finishReason MAX_TOKENS), quebrando o parse.
        // Nos nossos usos toda a matemática já vem calculada em JS e o modelo
        // só redige, então raciocínio extra é custo sem retorno.
        // thinkingBudget: 0 é rejeitado por este modelo; um valor baixo é
        // aceito e zera os thoughts na prática. -1 devolve o modo automático.
        thinkingConfig: { thinkingBudget: THINKING_BUDGET }
      };
      // O Gemini garante JSON sintaticamente válido nativamente — isso evita
      // o parser frágil de "extrair o JSON do meio do texto".
      if (json) generationConfig.responseMimeType = 'application/json';

      return {
        url: `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`,
        headers: {
          'Content-Type': 'application/json',
          'X-goog-api-key': this.chave()
        },
        body: {
          contents: [{ parts: [{ text: prompt }] }],
          ...(sistema ? { systemInstruction: { parts: [{ text: sistema }] } } : {}),
          generationConfig
        }
      };
    },
    extrair(resposta) {
      const partes = resposta?.candidates?.[0]?.content?.parts;
      if (!Array.isArray(partes)) return null;
      return partes.map(p => p.text || '').join('').trim() || null;
    },
    truncado(resposta) {
      return resposta?.candidates?.[0]?.finishReason === 'MAX_TOKENS';
    }
  },

  groq: {
    chave: () => process.env.GROQ_API_KEY,
    modelo: () => process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
    montar(prompt, sistema, { json, maxTokens, temperatura }) {
      return {
        url: 'https://api.groq.com/openai/v1/chat/completions',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.chave()}`
        },
        body: {
          model: this.modelo(),
          messages: [
            ...(sistema ? [{ role: 'system', content: sistema }] : []),
            { role: 'user', content: prompt }
          ],
          temperature: temperatura,
          max_tokens: maxTokens,
          ...(json ? { response_format: { type: 'json_object' } } : {})
        }
      };
    },
    extrair(resposta) {
      return resposta?.choices?.[0]?.message?.content?.trim() || null;
    }
  },

  openrouter: {
    chave: () => process.env.OPENROUTER_API_KEY,
    modelo: () => process.env.OPENROUTER_MODEL || 'meta-llama/llama-3.3-70b-instruct:free',
    montar(prompt, sistema, { json, maxTokens, temperatura }) {
      return {
        url: 'https://openrouter.ai/api/v1/chat/completions',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.chave()}`
        },
        body: {
          model: this.modelo(),
          messages: [
            ...(sistema ? [{ role: 'system', content: sistema }] : []),
            { role: 'user', content: prompt }
          ],
          temperature: temperatura,
          max_tokens: maxTokens,
          ...(json ? { response_format: { type: 'json_object' } } : {})
        }
      };
    },
    extrair(resposta) {
      return resposta?.choices?.[0]?.message?.content?.trim() || null;
    }
  }
};

function adaptador() {
  const a = PROVEDORES[PROVEDOR];
  if (!a) throw new IAIndisponivelError(`provedor "${PROVEDOR}" desconhecido`);
  return a;
}

// IA está configurada? Usado pelas rotas para decidir entre o caminho com IA
// e o fallback, sem precisar tentar a chamada e falhar.
function iaHabilitada() {
  if (process.env.IA_DESATIVADA === 'true') return false;
  try {
    return !!adaptador().chave();
  } catch {
    return false;
  }
}

// --------------------------------------------------------------------------
// Fila serial com espaçamento mínimo. Não é um rate limiter sofisticado: é o
// suficiente para um sistema de 6 lojas onde o pico é um lote de mensagens.
// --------------------------------------------------------------------------
let ultimaChamada = 0;
let filaAtual = Promise.resolve();

function enfileirar(tarefa) {
  const resultado = filaAtual.then(async () => {
    const espera = INTERVALO_MIN_MS - (Date.now() - ultimaChamada);
    if (espera > 0) await new Promise(r => setTimeout(r, espera));
    ultimaChamada = Date.now();
    return tarefa();
  });
  // A fila não pode quebrar quando uma tarefa falha — senão a primeira
  // exceção travaria todas as chamadas seguintes do processo.
  filaAtual = resultado.catch(() => {});
  return resultado;
}

// --------------------------------------------------------------------------
// Chamada de baixo nível, com retry exponencial. 429 (cota) e 5xx são
// retentáveis; 4xx de payload/credencial não são — retentar só queimaria cota.
// --------------------------------------------------------------------------
async function chamarProvedor(prompt, { sistema, json, maxTokens, temperatura }) {
  const a = adaptador();
  if (!a.chave()) throw new IAIndisponivelError(`chave de API não configurada para "${PROVEDOR}"`);

  const { url, headers, body } = a.montar(prompt, sistema, { json, maxTokens, temperatura });
  let ultimoErro;

  for (let tentativa = 1; tentativa <= MAX_TENTATIVAS; tentativa++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

      let resposta;
      try {
        resposta = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
          signal: controller.signal
        });
      } finally {
        clearTimeout(timer);
      }

      if (resposta.status === 429 || resposta.status >= 500) {
        const texto = await resposta.text().catch(() => '');
        ultimoErro = new Error(`HTTP ${resposta.status}: ${texto.slice(0, 200)}`);
        if (tentativa < MAX_TENTATIVAS) {
          await new Promise(r => setTimeout(r, 2000 * Math.pow(2, tentativa - 1)));
          continue;
        }
        break;
      }

      if (!resposta.ok) {
        const texto = await resposta.text().catch(() => '');
        throw new IAIndisponivelError(`HTTP ${resposta.status}`, texto.slice(0, 300));
      }

      const dados = await resposta.json();

      // Truncamento tem que falhar alto: um JSON cortado ao meio vira erro de
      // parse genérico e esconde a causa real (orçamento de tokens curto).
      if (a.truncado && a.truncado(dados)) {
        throw new IAIndisponivelError(
          'resposta truncada por limite de tokens — aumente maxTokens na chamada'
        );
      }

      const conteudo = a.extrair(dados);
      if (!conteudo) throw new IAIndisponivelError('resposta vazia do provedor');
      return conteudo;

    } catch (err) {
      if (err instanceof IAIndisponivelError) throw err;
      ultimoErro = err;
      if (err.name === 'AbortError' && tentativa < MAX_TENTATIVAS) {
        await new Promise(r => setTimeout(r, 2000 * Math.pow(2, tentativa - 1)));
        continue;
      }
      if (tentativa >= MAX_TENTATIVAS) break;
    }
  }

  throw new IAIndisponivelError('falha após múltiplas tentativas', ultimoErro?.message);
}

// --------------------------------------------------------------------------
// API pública: texto livre.
// --------------------------------------------------------------------------
async function gerarTexto(prompt, opcoes = {}) {
  const {
    sistema = null,
    maxTokens = 1024,
    temperatura = 0.7
  } = opcoes;
  return enfileirar(() => chamarProvedor(prompt, { sistema, json: false, maxTokens, temperatura }));
}

// --------------------------------------------------------------------------
// API pública: JSON estruturado. `exemplo` descreve o formato esperado e é
// embutido no prompt — mesmo com responseMimeType, dizer o formato melhora
// muito a aderência, e é o que faz o adaptador do Groq/OpenRouter funcionar.
// --------------------------------------------------------------------------
async function gerarJSON(prompt, opcoes = {}) {
  const {
    sistema = null,
    maxTokens = 2048,
    temperatura = 0.3,
    formato = null
  } = opcoes;

  const promptFinal = formato
    ? `${prompt}\n\nResponda EXCLUSIVAMENTE com um JSON válido neste formato, sem texto antes ou depois, sem blocos de markdown:\n${JSON.stringify(formato, null, 2)}`
    : prompt;

  const bruto = await enfileirar(() =>
    chamarProvedor(promptFinal, { sistema, json: true, maxTokens, temperatura })
  );

  try {
    return JSON.parse(bruto);
  } catch {
    // Provedores sem modo JSON nativo às vezes embrulham em ```json ... ```.
    const limpo = bruto.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
    const inicio = Math.min(
      ...[limpo.indexOf('{'), limpo.indexOf('[')].filter(i => i >= 0)
    );
    const fim = Math.max(limpo.lastIndexOf('}'), limpo.lastIndexOf(']'));
    if (Number.isFinite(inicio) && fim > inicio) {
      try {
        return JSON.parse(limpo.slice(inicio, fim + 1));
      } catch {}
    }
    throw new IAIndisponivelError('resposta não é JSON válido', bruto.slice(0, 300));
  }
}

// --------------------------------------------------------------------------
// Cache em banco. Briefing do dia, coach da semana e auditoria de boletos são
// caros e mudam pouco dentro da janela — gerar uma vez e reusar preserva a
// cota gratuita. A chave deve incluir tudo que muda o resultado (data, loja,
// usuário), senão dois contextos diferentes compartilham a mesma resposta.
// --------------------------------------------------------------------------
async function comCache(chave, ttlSegundos, produtor) {
  const agora = Date.now();

  try {
    const linha = await dbGetAsync('SELECT valor, expiraem FROM ia_cache WHERE chave = ?', [chave]);
    if (linha && linha.valor) {
      const expiraEm = Number(linha.expiraem ?? linha.expiraEm);
      if (Number.isFinite(expiraEm) && expiraEm > agora) {
        return { ...JSON.parse(linha.valor), _cache: true };
      }
    }
  } catch (err) {
    // Cache é otimização, não requisito: falha de leitura não pode derrubar
    // a funcionalidade — segue e gera do zero.
    console.warn('[IA] Falha ao ler cache:', err.message);
  }

  const resultado = await produtor();

  try {
    const expiraEm = agora + ttlSegundos * 1000;
    await dbRunAsync(
      `INSERT INTO ia_cache (chave, valor, criadoEm, expiraEm) VALUES (?, ?, ?, ?)
       ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor, criadoEm = excluded.criadoEm, expiraEm = excluded.expiraEm`,
      [chave, JSON.stringify(resultado), new Date().toISOString(), expiraEm]
    );
  } catch (err) {
    console.warn('[IA] Falha ao gravar cache:', err.message);
  }

  return { ...resultado, _cache: false };
}

// --------------------------------------------------------------------------
// Marcador "já disparado", reaproveitando a tabela ia_cache. Existe por causa
// do plano gratuito do Render: a instância hiberna sem tráfego, então os
// cron.schedule internos (briefing das 7h, copiloto pré-intervalo) não
// disparam sozinhos. A saída é um pingador externo batendo num endpoint a
// cada poucos minutos — mas isso significa que o mesmo disparo pode ser
// verificado várias vezes no mesmo dia/intervalo, e não pode sair duplicado.
//
// `marcarSeNovo` verifica-então-grava — não é atômico contra duas chamadas
// no mesmíssimo instante, mas isso não é um risco real com um único
// pingador externo rodando a cada alguns minutos.
// Ver server.js (rota /api/cron/ia-tick) e docs/IA.md.
// --------------------------------------------------------------------------
async function marcarSeNovo(chave, ttlSegundos) {
  const agora = Date.now();
  try {
    const existente = await dbGetAsync('SELECT expiraem FROM ia_cache WHERE chave = ?', [chave]);
    if (existente) {
      const expiraEm = Number(existente.expiraem ?? existente.expiraEm);
      if (Number.isFinite(expiraEm) && expiraEm > agora) return false; // já marcado e ainda válido
    }
    await dbRunAsync(
      `INSERT INTO ia_cache (chave, valor, criadoEm, expiraEm) VALUES (?, ?, ?, ?)
       ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor, criadoEm = excluded.criadoEm, expiraEm = excluded.expiraEm`,
      [chave, '"marcado"', new Date().toISOString(), agora + ttlSegundos * 1000]
    );
    return true;
  } catch (err) {
    // Falha ao marcar não pode travar o disparo — pior um envio repetido
    // ocasional do que nenhum envio.
    console.warn('[IA] Falha ao marcar disparo:', err.message);
    return true;
  }
}

// --------------------------------------------------------------------------
// Higiene de dado pessoal. A camada gratuita dos provedores normalmente
// permite uso dos dados enviados para treinamento, então o prompt leva o
// mínimo necessário: primeiro nome e números. Telefone, CPF, e-mail e
// sobrenome ficam no servidor e são recombinados depois da resposta.
// --------------------------------------------------------------------------
function primeiroNome(nomeCompleto) {
  if (!nomeCompleto) return '';
  return String(nomeCompleto).trim().split(/\s+/)[0];
}

const PADROES_SENSIVEIS = [
  /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g,              // CPF
  /\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g,      // CNPJ
  /\(?\d{2}\)?\s?9?\d{4}[-\s]?\d{4}/g,              // telefone
  /[\w.+-]+@[\w-]+\.[\w.]+/g                        // e-mail
];

// Rede de segurança: mesmo que um prompt monte errado, isso remove o que
// nunca deveria sair do servidor.
function anonimizar(texto) {
  if (!texto) return texto;
  return PADROES_SENSIVEIS.reduce((t, p) => t.replace(p, '[removido]'), String(texto));
}

module.exports = {
  gerarTexto,
  gerarJSON,
  comCache,
  marcarSeNovo,
  iaHabilitada,
  anonimizar,
  primeiroNome,
  IAIndisponivelError,
  PROVEDOR
};
