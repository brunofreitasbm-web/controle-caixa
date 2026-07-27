// ==========================================================================
// ITEM 5 — MENSAGENS PERSONALIZADAS (aniversário e pós-visita)
// ==========================================================================
// Hoje a mensagem é sorteada de um banco de combinações fixas
// (webapp/mensagens-aniversario.js e webapp/mensagens-pos-visita.js). Aqui a
// IA escreve uma mensagem única usando o contexto real da família — idade,
// tempo de permanência, se já visitou antes — mantendo exatamente a mesma
// voz da marca.
//
// PRIVACIDADE (regra 4 de services/ia.js): o provedor recebe SOMENTE o
// primeiro nome e números. Telefone, sobrenome, CPF e documento nunca saem
// do servidor — quem monta o link do WhatsApp é o app, depois da resposta.
//
// FALLBACK: qualquer falha devolve `null`, e o frontend segue usando o
// sorteio de template que já existe. A funcionalidade nunca fica sem saída.
// ==========================================================================

const { gerarTexto, iaHabilitada, anonimizar, primeiroNome, IAIndisponivelError } = require('./ia');

const SITE_PLAYGROUND = 'institutofacaamigos.com.br/playground/index.html';

// A voz da marca é a mesma dos templates existentes — se mudar lá, muda aqui.
const VOZ_MARCA = `Você escreve as mensagens de WhatsApp do Playground FaçaAmigos, um espaço infantil inclusivo dentro de um shopping em Belém do Pará.

Voz da marca, obrigatória:
- Carinhosa, acolhedora e calorosa. NUNCA corporativa, formal ou publicitária.
- Escrita para o RESPONSÁVEL, falando sobre a criança.
- Emojis espalhados naturalmente pelo texto (entre 4 e 7), nunca enfileirados.
- Português do Brasil, com naturalidade de conversa de WhatsApp.
- O cadastro NÃO informa o gênero da criança, e errar isso ofende a família. A solução é repetir o NOME da criança no lugar de artigo, pronome ou adjetivo marcado: escreva "o Theo adorou", "que o Theo aproveite", "um abraço no Theo". Não escreva "o(a)", "ele(a)", "querido(a)", "lind(a)" nem nada com parênteses no meio da palavra — isso quebra a leitura e soa como formulário. Prefira também verbos e substantivos sem gênero ("a criançada", "a turminha", "quem faz aniversário").
- O diferencial do FaçaAmigos aparece de forma leve, nunca como propaganda: atividades lúdicas conduzidas por profissionais, longe de telas, pensadas para o desenvolvimento infantil — não é "só mais um parquinho de shopping".
- Termine com um convite SUTIL para voltar, com o link ${SITE_PLAYGROUND} encaixado como continuação natural da frase, como quem dá uma dica — jamais como anúncio.

Restrições absolutas:
- Nunca invente fatos sobre a visita que não foram informados (não diga de que a criança brincou, com quem falou, nem o que ela disse).
- Nunca mencione valores, promoções, descontos ou pacotes.
- Nunca peça dados pessoais.
- Não use asteriscos de markdown, títulos, listas nem aspas ao redor da mensagem.
- Responda APENAS com o texto da mensagem, pronto para enviar.`;

// --------------------------------------------------------------------------
// Aniversário
// --------------------------------------------------------------------------
async function mensagemAniversario({ nomeResponsavel, nomeCrianca, idade }) {
  if (!iaHabilitada()) return null;

  const resp = primeiroNome(nomeResponsavel);
  const crianca = primeiroNome(nomeCrianca);
  if (!resp || !crianca) return null;

  const idadeNum = parseInt(idade);
  const temIdade = Number.isFinite(idadeNum) && idadeNum > 0 && idadeNum < 18;

  // Uma criança de 3 anos e uma de 10 não recebem a mesma mensagem — é
  // justamente esse ajuste que o sorteio de template não consegue fazer.
  let faixa = '';
  if (temIdade) {
    if (idadeNum <= 3) faixa = 'É bem pequenininho(a): fale de descoberta, colo e primeiras aventuras.';
    else if (idadeNum <= 6) faixa = 'Está na fase da imaginação a mil: fale de faz de conta, energia e amiguinhos.';
    else if (idadeNum <= 9) faixa = 'Já é criança grande: fale de aventura, desafio e autonomia.';
    else faixa = 'Está entrando na pré-adolescência: evite tom infantilizado, fale de diversão com os amigos.';
  }

  const prompt = `Escreva a mensagem de aniversário.

- Nome do responsável: ${resp}
- Nome da criança: ${crianca}
${temIdade ? `- Idade que completa hoje: ${idadeNum} anos\n- Sobre a fase: ${faixa}` : '- A idade não foi informada: NÃO cite idade nenhuma na mensagem.'}

A mensagem deve parabenizar a criança, reconhecer o responsável com carinho, e fechar com o convite sutil e o link.
Entre 3 e 5 linhas. Não use saudação de horário (nada de "bom dia" ou "boa tarde"), porque não sabemos quando será lida.`;

  const texto = await gerarTexto(prompt, {
    sistema: VOZ_MARCA,
    temperatura: 0.85,
    maxTokens: 3000
  });

  return limpar(texto);
}

// --------------------------------------------------------------------------
// Pós-visita
// --------------------------------------------------------------------------
async function mensagemPosVisita({ nomeResponsavel, nomeCrianca, tempoTotalMinutos, jaContactadoAntes = false }) {
  if (!iaHabilitada()) return null;

  const resp = primeiroNome(nomeResponsavel);
  const crianca = primeiroNome(nomeCrianca);
  if (!resp || !crianca) return null;

  const min = parseInt(tempoTotalMinutos);
  const temTempo = Number.isFinite(min) && min > 0;

  // O tempo de permanência é o sinal mais rico que temos e o template fixo
  // simplesmente ignora. Quem ficou 20 minutos e quem ficou 3 horas teve
  // experiências diferentes e não deve receber o mesmo texto.
  let sobreTempo = '';
  if (temTempo) {
    const horas = Math.floor(min / 60);
    const resto = min % 60;
    const legivel = horas > 0 ? `${horas}h${resto > 0 ? String(resto).padStart(2, '0') : ''}` : `${min} minutos`;
    if (min < 45) {
      sobreTempo = `A visita foi curtinha (${legivel}). Não trate como se tivesse sido um dia inteiro; deixe no ar que da próxima vez dá pra aproveitar com mais calma.`;
    } else if (min < 120) {
      sobreTempo = `A visita durou ${legivel}, um tempo bem aproveitado. Pode comentar que deu pra curtir bastante.`;
    } else {
      sobreTempo = `A visita foi longa: ${legivel}. Comente com carinho que ele(a) aproveitou de verdade e que foi uma alegria ter a companhia por tanto tempo.`;
    }
  }

  const prompt = `Escreva a mensagem de pós-visita, enviada no dia seguinte à visita.

- Nome do responsável: ${resp}
- Nome da criança: ${crianca}
${temTempo ? `- Tempo de permanência: ${min} minutos\n- Sobre isso: ${sobreTempo}` : '- O tempo de permanência não foi informado: não cite duração.'}
- ${jaContactadoAntes ? 'Esta família JÁ visitou o espaço outras vezes: demonstre que reconhece a presença recorrente.' : 'Esta parece ser a primeira visita: acolha como quem recebe alguém novo.'}

A mensagem deve agradecer a visita, perguntar o que a criança achou do espaço, citar o diferencial de forma leve, e fechar com o convite sutil e o link.
Entre 3 e 5 linhas.`;

  const texto = await gerarTexto(prompt, {
    sistema: VOZ_MARCA,
    temperatura: 0.85,
    maxTokens: 3000
  });

  return limpar(texto);
}

// --------------------------------------------------------------------------
// Saneamento da saída. Duas preocupações:
//   1. O modelo às vezes embrulha a resposta em aspas ou markdown.
//   2. Rede de segurança de privacidade: se algum dado pessoal escapou para
//      o prompt e voltou no texto, ele não pode seguir para o WhatsApp.
// --------------------------------------------------------------------------
function limpar(texto) {
  if (!texto) return null;
  let t = String(texto).trim();
  t = t.replace(/^```[a-z]*\s*/i, '').replace(/```\s*$/, '').trim();
  if (t.startsWith('"') && t.endsWith('"')) t = t.slice(1, -1).trim();
  t = t.replace(/\*\*(.+?)\*\*/g, '$1').replace(/^#{1,6}\s*/gm, '');
  t = anonimizar(t);

  if (t.length === 0) return null;

  // Trava de qualidade: mesmo instruído, o modelo às vezes produz flexão de
  // gênero truncada ("dess(a) lind(a)", "o(a) querido(a)"). Isso é português
  // quebrado e não pode chegar ao cliente. Descartar aqui faz o chamador cair
  // no sorteio de template, que é um texto revisado — melhor uma mensagem
  // genérica correta do que uma personalizada malfeita.
  if (/\w\([ao]s?\)/i.test(t)) {
    console.warn('[IA Mensagens] Texto descartado: flexão de gênero truncada.');
    return null;
  }

  // Mensagem de WhatsApp muito longa não é lida. O template atual tem ~500
  // caracteres; acima de 900 o modelo claramente se estendeu demais.
  if (t.length > 900) {
    console.warn(`[IA Mensagens] Texto descartado: ${t.length} caracteres, acima do limite.`);
    return null;
  }

  return t;
}

module.exports = { mensagemAniversario, mensagemPosVisita };
