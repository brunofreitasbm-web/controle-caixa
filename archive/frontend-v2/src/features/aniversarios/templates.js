// Mensagens de aniversário do Playground FaçaAmigos.
//
// A mensagem é escrita PARA o responsável, celebrando o aniversário da
// criança. Tom sempre acolhedor, carinhoso e convidativo — nunca corporativo
// ou técnico. Sempre com emojis de festa e de brincadeira, e terminando com
// um convite sutil (subliminar) para voltar, junto do nosso site encaixado
// naturalmente na frase, como quem dá uma dica — não como propaganda.
//
// Porta fiel de webapp/mensagens-aniversario.js: a mensagem final é montada
// por 4 partes combinadas — abertura × voto × convite × fechamento —
// sorteadas aleatoriamente a cada chamada. Usado como fallback quando a IA
// (POST /api/ia/mensagem) não está disponível.

const A_ABERTURAS = [
  'Oi, {nome_responsavel}! 🎉 Hoje acordamos com aquela alegria gostosa aqui no Faça Amigos!',
  'Bom dia, {nome_responsavel}! 🥳 Tem data especial no ar e a gente não podia deixar passar!',
  '{nome_responsavel}, passamos aqui só pra espalhar um pouquinho de festa no seu dia! 🎊',
  'Oii, {nome_responsavel}! 🎂 Deu um friozinho gostoso na barriga quando vimos a data de hoje!',
  'Olá, {nome_responsavel}! 🎈 Hoje é daqueles dias que merecem bolo, abraço apertado e muito sorriso!',
  'Oi, {nome_responsavel}! ✨ A turminha daqui mandou um recadinho bem especial pra vocês hoje!',
  'Bom dia, {nome_responsavel}! 🎁 Guardamos esse carinho aqui só pra mandar hoje!',
  '{nome_responsavel}, hoje o dia amanheceu com cara de festa pra gente também! 🎪',
  'Oii, {nome_responsavel}! 💙 Não dava pra deixar essa data passar batido sem um abraço nosso!',
  'Olá, {nome_responsavel}! 🌈 Chegamos com confete, balão e muito carinho pra vocês hoje!',
];

const A_VOTOS = [
  'Um feliz aniversário enorme pro(a) {nome_crianca}, que hoje completa {idade} aninhos! 🎂💙',
  'Que os {idade} anos do(a) {nome_crianca} venham cheios de brincadeira, abraço e descoberta! 🎈✨',
  'Parabéns pro(a) {nome_crianca} pelos {idade} anos — e parabéns pra você também, que cuida com tanto amor! 🥰🎉',
  'Desejamos ao(à) {nome_crianca} um dia mágico nesses {idade} anos, do jeitinho que criança merece! 🎁🌟',
  'Que esse novo ano do(a) {nome_crianca}, agora com {idade} anos, seja recheado de alegria e imaginação! 🎊🧩',
];

const B_CONVITES = [
  'E que tal comemorar do jeito que eles mais amam? Correr, pular e rir sem parar! 🤸 Aqui no Faça Amigos cada brincadeira é pensada com carinho pra desenvolver os pequenos, longe das telinhas. 🛝',
  'Sabe o que combina demais com aniversário? Aquele dia de brincadeira solta! 🎠 No nosso espaço, cada canto foi pensado pra acolher e divertir de verdade — com gente cuidando de perto. 💙',
  'Bateu vontade de comemorar brincando? 🎪 A gente adora receber vocês! Aqui é acolhimento de verdade, com atividades que despertam a imaginação e nenhuma tela no caminho. ✨',
  'Que tal transformar esse dia numa aventura? 🧩 Nosso cantinho é feito pra criança ser criança — com brincadeiras que desenvolvem e uma equipe que acolhe cada uma do seu jeitinho. 🥰',
  'Aniversário pede festa, e festa pede brincadeira! 🎉 No Faça Amigos os pequenos gastam energia com atividades pensadas pra eles, num espaço que abraça todo mundo. 🌈',
  'Vem comemorar com a gente? 🎈 Nosso espaço é aquele lugar onde toda criança se sente em casa, brincando de verdade — sem telinha, só imaginação. 💫',
  'Já pensou em celebrar esse dia pulando e sorrindo? 🛝 Aqui a brincadeira tem propósito: cada atividade é feita pra desenvolver, acolher e encantar os pequenos. 🎨',
  'A gente adoraria fazer parte desse dia! 🎊 No nosso playground, cada criança é recebida com atenção de perto e brincadeiras que despertam o melhor delas. 💙',
  'Que tal um passeio pra fechar o dia com chave de ouro? 🎂 Nosso espaço acolhe cada criança do jeitinho que ela é, com atividades pensadas pra desenvolver brincando. 🤸',
  'Comemorar brincando é outra coisa, né? 🎁 Aqui no Faça Amigos tem espaço, cuidado e brincadeira de verdade esperando por vocês — do jeitinho que criança gosta. 🌟',
];

const B_FECHAMENTOS = [
  'Deixamos um cantinho quentinho esperando o(a) {nome_crianca} voltar — dá uma espiadinha por aqui: institutofacaamigos.com.br/playground/index.html 💙🎈',
  'Já estamos com saudade e contando os dias pra rever vocês! Passa aqui pra ver as novidades: institutofacaamigos.com.br/playground/index.html 🥳✨',
  'Fica o convite — a diversão continua esperando por vocês: institutofacaamigos.com.br/playground/index.html 🎉🛝',
];

function preencherAniversario(texto, nomeResponsavel, nomeCrianca, idade) {
  return texto
    .split('{nome_responsavel}').join(nomeResponsavel)
    .split('{nome_crianca}').join(nomeCrianca)
    .split('{idade}').join(String(idade));
}

const BLOCO_A = A_ABERTURAS.flatMap((abertura) => A_VOTOS.map((voto) => `${abertura} ${voto}`));
const BLOCO_B = B_CONVITES.flatMap((convite) => B_FECHAMENTOS.map((fechamento) => `${convite} ${fechamento}`));

export function gerarMensagemAniversario(nomeResponsavel, nomeCrianca, idade) {
  const blocoA = BLOCO_A[Math.floor(Math.random() * BLOCO_A.length)];
  const blocoB = BLOCO_B[Math.floor(Math.random() * BLOCO_B.length)];
  const bruto = `${blocoA}\n\n${blocoB}`;
  return preencherAniversario(bruto, nomeResponsavel, nomeCrianca, idade);
}
