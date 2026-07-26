// Mensagens de pós-visita FaçaAmigos — disparadas para os responsáveis de
// toda criança que visitou o playground (sem filtro de tempo de permanência).
// Tom: carinhoso, acolhedor, nunca corporativo; reforça o benefício
// físico/emocional do gasto de energia saudável.
//
// Em vez de 240 strings fixas (redundantes e difíceis de manter), a mensagem
// final é composta por 3 blocos combinados: saudação (10) x pergunta sobre
// sono/energia (8) x fechamento (3) = 240 combinações diferentes, sorteadas
// aleatoriamente a cada clique em "Enviar mensagem".

const SAUDACOES = [
  "Bom dia, {{nome_responsavel}}! 🧩 Esperamos que você esteja tendo um ótimo dia.",
  "Oi, {{nome_responsavel}}! ✨ Passando aqui pra deixar um carinho hoje.",
  "Bom dia, {{nome_responsavel}}! 💙 Tudo bem por aí?",
  "Oii, {{nome_responsavel}}! 🧩 Chegando com uma perguntinha de mãe e pai pra você.",
  "Bom dia! ✨ Aqui é do FaçaAmigos, {{nome_responsavel}}, tudo certo hoje?",
  "Oi, {{nome_responsavel}}! 💙 Passando pra saber como estão as coisas por aí.",
  "Bom dia, {{nome_responsavel}}! 🧩 Esperamos que a semana esteja leve.",
  "Oi, tudo bem, {{nome_responsavel}}? ✨ Estamos com saudade da turminha por aqui.",
  "Bom dia! 💙 {{nome_responsavel}}, viemos com aquela pergunta clássica de todo dia.",
  "Oi, {{nome_responsavel}}! 🧩 Esperamos que você tenha descansado bem também."
];

const PERGUNTAS = [
  "Passando para fazer aquela perguntinha clássica de mãe e pai: o(a) {{nome_crianca}} dormiu bem essa noite? 😴",
  "Depois de tanta energia gasta brincando por aqui, o(a) {{nome_crianca}} caiu no sono rapidinho ontem? 😴",
  "Como foi a noite do(a) {{nome_crianca}}? Aposto que aquele gasto de energia saudável ajudou a dormir tranquilo(a). 💤",
  "Ficamos curiosos: o(a) {{nome_crianca}} acordou disposto(a) hoje, depois de brincar tanto por aqui? ☀️",
  "O(A) {{nome_crianca}} deu aquele sinal de sono cedinho ontem à noite? Brincadeira também cansa (no bom sentido!). 😴",
  "Será que o(a) {{nome_crianca}} teve uma noite tranquila depois de tanta diversão aqui no playground? 💤",
  "Aquela energia toda solta nos brinquedos rendeu uma noite de sono gostosa pro(a) {{nome_crianca}}? 😴",
  "Como está o(a) {{nome_crianca}} hoje? Esperamos que tenha descansado bem depois de brincar tanto com a gente. ☀️"
];

const FECHAMENTOS = [
  "Ficamos muito felizes em ver a energia e o sorriso dele(a) por aqui — isso faz toda a diferença no desenvolvimento e no bem-estar. Esperamos vocês de novo em breve! 💙",
  "Esses momentos de brincadeira livre fazem tão bem pro corpo e pra cabecinha das crianças. Contamos com a visita de vocês outra vez em breve! ✨",
  "Foi um prazer receber essa alegria toda no nosso espaço. Até a próxima aventura por aqui! 🧩💙"
];

function preencher(texto, nomeResponsavel, nomeCrianca) {
  return texto
    .split('{{nome_responsavel}}').join(nomeResponsavel)
    .split('{{nome_crianca}}').join(nomeCrianca);
}

function gerarMensagemPosVisita(nomeResponsavel, nomeCrianca) {
  const saudacao = SAUDACOES[Math.floor(Math.random() * SAUDACOES.length)];
  const pergunta = PERGUNTAS[Math.floor(Math.random() * PERGUNTAS.length)];
  const fechamento = FECHAMENTOS[Math.floor(Math.random() * FECHAMENTOS.length)];
  const bruto = `${saudacao} ${pergunta} ${fechamento}`;
  return preencher(bruto, nomeResponsavel, nomeCrianca);
}
