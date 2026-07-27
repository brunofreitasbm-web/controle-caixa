// ==========================================================================
// Sugestão de data de vencimento para documentos da Pasta de Auditoria.
// A IA sugere, o humano aprova (mesma regra de services/ia.js) — o valor
// aqui devolvido é sempre editável antes de salvar, nunca gravado direto.
//
// Por privacidade (regra 4 de services/ia.js: nunca enviar CPF/CNPJ/nome
// completo ao provedor), não mandamos o PDF inteiro para a IA. Extraímos só
// as linhas perto de palavras-chave de validade/vencimento e ainda passamos
// por anonimizar() antes de sair do servidor.
// ==========================================================================

const pdfjsLib = require('pdfjs-dist');
const { gerarJSON, anonimizar, IAIndisponivelError } = require('./ia');

const PALAVRA_CHAVE_VENCIMENTO = /valid(ade|o|a)|vencimento|vence\b|vig[eê]ncia|expira/i;

async function extrairLinhasPDF(buffer) {
  const data = new Uint8Array(buffer);
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  const linhas = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    textContent.items.forEach(item => {
      const texto = (item.str || '').trim();
      if (texto) linhas.push(texto);
    });
  }

  return linhas;
}

// Só o entorno das linhas com palavra-chave de validade — nunca o documento
// inteiro (que em contratos trabalhistas traz nome completo e CPF).
function trechoDeValidade(linhas) {
  const relevantes = [];
  linhas.forEach((linha, i) => {
    if (PALAVRA_CHAVE_VENCIMENTO.test(linha)) {
      relevantes.push(...linhas.slice(Math.max(0, i - 1), i + 2));
    }
  });
  return relevantes.length ? relevantes.join('\n') : null;
}

async function sugerirVencimento(buffer) {
  try {
    const linhas = await extrairLinhasPDF(buffer);
    const trecho = trechoDeValidade(linhas);
    if (!trecho) return null;

    const resultado = await gerarJSON(
      `Trecho de um documento legal/societário (contrato, alvará, seguro, licença etc). ` +
      `Identifique a data de validade/vencimento do documento, se houver alguma explícita neste trecho:\n\n${anonimizar(trecho)}`,
      {
        formato: { dataVencimento: 'YYYY-MM-DD ou null se não encontrar nenhuma data de validade/vencimento' },
        maxTokens: 200,
        temperatura: 0.1
      }
    );

    return (resultado && resultado.dataVencimento) || null;
  } catch (erro) {
    if (erro instanceof IAIndisponivelError) return null;
    console.error('Erro ao sugerir vencimento de documento via IA:', erro.message);
    return null;
  }
}

module.exports = { sugerirVencimento };
