// Mensagens de pós-visita do Playground FaçaAmigos — disparadas para os
// responsáveis de toda criança que visitou o espaço. Tom: carinhoso,
// acolhedor, cheio de emojis, nunca corporativo. Sempre pergunta o que a
// criança achou do espaço, agradece a visita, reforça que não somos "só
// mais um parquinho de shopping" (atividades lúdicas sem telas, pensadas
// pro desenvolvimento infantil, com um diferencial do FaçaAmigos citado) e
// termina com um convite sutil (subliminar) pra próxima visita + o link do
// site, encaixado como continuação natural da frase, não como propaganda.
//
// Porta fiel de webapp/mensagens-pos-visita.js: em vez de centenas de
// strings fixas, a mensagem final combina 4 blocos — saudação × pergunta ×
// diferencial × fechamento — sorteados aleatoriamente a cada chamada. Usado
// como fallback quando a IA (POST /api/ia/mensagem) não está disponível.

const SAUDACOES = [
  'Bom dia, {{nome_responsavel}}! 🧩💙 Passando aqui com o coração cheio depois da visita do(a) {{nome_crianca}} ontem.',
  'Oii, {{nome_responsavel}}! ✨ Ainda estamos sorrindo aqui de lembrar do(a) {{nome_crianca}} brincando com a gente.',
  'Bom dia! 🎈 {{nome_responsavel}}, que alegria receber o(a) {{nome_crianca}} no nosso espaço!',
  'Oi, {{nome_responsavel}}! 🥰 Só passando pra dizer o quanto foi bom ter o(a) {{nome_crianca}} por aqui.',
  'Bom dia, {{nome_responsavel}}! 🌈 A equipe do Playground ainda comenta do sorriso do(a) {{nome_crianca}}.',
  'Oii! 💙 {{nome_responsavel}}, viemos com todo carinho falar sobre a visitinha do(a) {{nome_crianca}}.',
  'Bom dia, {{nome_responsavel}}! 🎨 Foi um prazer enorme ter o(a) {{nome_crianca}} brincando com a gente.',
  'Oi, tudo bem, {{nome_responsavel}}? 🧸 Passando pra dar notícias frescas da diversão do(a) {{nome_crianca}} por aqui.',
  'Bom dia! 🦋 {{nome_responsavel}}, a turminha sentiu falta do(a) {{nome_crianca}} assim que a visita acabou!',
  'Oii, {{nome_responsavel}}! ✨💙 Chegando com carinho pra saber como está o(a) {{nome_crianca}} depois da nossa brincadeira.',
];

const PERGUNTAS = [
  'O que ele(a) achou do nosso espaço? Adoraríamos saber! 😊',
  'Ele(a) contou pra vocês como foi o dia por aqui? Ficamos curiosos pra saber o que mais marcou! 🌟',
  'Queremos muito saber: o que ele(a) mais curtiu na visita? 🎉',
  'Adoramos receber o(a) {{nome_crianca}} — será que ele(a) já contou o que achou por aqui? 💭',
  'Ficamos com aquela vontade de saber: qual foi a parte favorita dele(a) na visita? 🥰',
  'Nos conta: o que o(a) {{nome_crianca}} achou do nosso cantinho? Toda opinião da turminha vale ouro pra gente! 💛',
  'Será que rolou algum comentário em casa sobre a visita? Adoraríamos saber o que ficou marcado! 😄',
  'O(A) {{nome_crianca}} pareceu bem à vontade por aqui — o que vocês acharam da experiência? 🌼',
  'Ficamos na expectativa: o que ele(a) mais gostou de fazer com a gente? 🎈',
  'Adoramos ter recebido vocês — nos conta o que achou do nosso espaço, viu? 💙',
];

const DIFERENCIAIS = [
  'Sabia que, no tempo que passou aqui, nossos profissionais desenvolveram uma atividade lúdica especial, longe de telas? Aqui no Playground FaçaAmigos, cada brincadeira é pensada pro desenvolvimento da criança — a gente não é só mais um parquinho de shopping. 🧩✨',
  'Enquanto ele(a) brincava, nossa equipe conduzia atividades lúdicas sem telas, voltadas pro desenvolvimento infantil — esse é o nosso jeito de fazer diferente de um parquinho comum. 💙🎨',
  'No Playground FaçaAmigos cada minuto de brincadeira tem intenção: nossos profissionais criam atividades lúdicas, sem telas, pensadas pro desenvolvimento de cada criança. Não somos só um espacinho de shopping — somos muito mais que isso. 🌈',
  'Uma coisa que nos deixa orgulhosos: enquanto os pequenos brincam, a equipe conduz atividades lúdicas longe das telas, pensadas com carinho pro desenvolvimento deles. É esse o diferencial do FaçaAmigos. 🧸💛',
  'Cada visita ao FaçaAmigos é recheada de atividades lúdicas sem tela nenhuma, sempre com foco no desenvolvimento infantil — muito além do que um parquinho comum de shopping oferece. ✨🧩',
  'Aqui a brincadeira tem propósito: nossos profissionais desenvolvem atividades lúdicas, sem telas, voltadas pro desenvolvimento de cada criança que passa por nós. Esse é o coração do Playground FaçaAmigos. 💙',
  'Enquanto a turminha se diverte, a gente cuida de cada detalhe: atividades lúdicas, sem telas, pensadas pro desenvolvimento infantil. Não é só um parquinho — é um espaço feito com propósito. 🌟🎈',
];

const FECHAMENTOS = [
  'Já estamos com saudade e torcendo pela próxima visitinha! Se bater aquela vontade de matar a saudade da turminha, dá uma espiadinha aqui: sl1nk.com/facaamigosbelem 💙✨',
  'Guardamos um cantinho especial esperando pela volta do(a) {{nome_crianca}} — dá uma olhada nas novidades por aqui: institutofacaamigos.com.br/playground/index.html 🧩💛',
];

function preencher(texto, nomeResponsavel, nomeCrianca) {
  return texto.split('{{nome_responsavel}}').join(nomeResponsavel).split('{{nome_crianca}}').join(nomeCrianca);
}

export function gerarMensagemPosVisita(nomeResponsavel, nomeCrianca) {
  const saudacao = SAUDACOES[Math.floor(Math.random() * SAUDACOES.length)];
  const pergunta = PERGUNTAS[Math.floor(Math.random() * PERGUNTAS.length)];
  const diferencial = DIFERENCIAIS[Math.floor(Math.random() * DIFERENCIAIS.length)];
  const fechamento = FECHAMENTOS[Math.floor(Math.random() * FECHAMENTOS.length)];
  const bruto = `${saudacao} ${pergunta} ${diferencial} ${fechamento}`;
  return preencher(bruto, nomeResponsavel, nomeCrianca);
}
