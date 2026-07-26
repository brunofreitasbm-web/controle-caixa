// Mensagens de aniversário do Playground FaçaAmigos — combinação de 2 blocos
// (Bloco A: saudação e comemoração; Bloco B: gatilho de visita/festa).
//
// Em vez de escrever 50+50 linhas soltas (repetitivas e difíceis de manter),
// cada bloco é montado por 10 aberturas × 5 complementos = 50 combinações
// fixas, geradas uma única vez ao carregar o arquivo. O sorteio final ainda
// escolhe 1 de cada bloco (50 × 50 = 2.500 combinações possíveis) a cada
// clique em "Enviar Parabéns".

const BLOCO_A_ABERTURAS = [
  "Olá, {nome_responsavel}! Hoje o dia está em festa no Espaço Faça Amigos!",
  "Oi, {nome_responsavel}! Toda a equipe do Faça Amigos passa por aqui com muito carinho!",
  "{nome_responsavel}, hoje é um dia super especial pra gente também!",
  "Bom dia, {nome_responsavel}! 🎊 A turminha do Faça Amigos está toda animada hoje!",
  "Oii, {nome_responsavel}! Passando aqui pra dar um alô cheio de festa!",
  "{nome_responsavel}, preparamos esse recadinho especial só pra hoje!",
  "Oi, tudo bem, {nome_responsavel}? Hoje pedimos licença pra invadir seu WhatsApp com festa!",
  "Bom dia! {nome_responsavel}, esse é daqueles dias que a gente adora comemorar junto!",
  "Olá, {nome_responsavel}! A equipe inteira do Faça Amigos manda um abraço apertado hoje!",
  "Oi, {nome_responsavel}! Hoje o clima aqui é de confete e alegria por causa de vocês!"
];

const BLOCO_A_COMPLEMENTOS = [
  "Desejamos um feliz aniversário para o(a) pequeno(a) {nome_crianca}! 🎉",
  "Toda a equipe deseja um dia mágico para o(a) {nome_crianca} pelos seus {idade} anos! 🎈",
  "O(A) {nome_crianca} está completando {idade} anos e nós comemoramos junto! 🎁",
  "Parabéns pro(a) {nome_crianca}, que hoje celebra {idade} aninhos com muito carinho! 🥳",
  "Que os {idade} anos do(a) {nome_crianca} sejam recheados de alegria e brincadeira! 🎂"
];

const BLOCO_B_CONVITES = [
  "Que tal comemorar esse dia do jeito que eles mais amam: correndo, pulando e sorrindo?",
  "Nada melhor que soltar toda essa energia boa em um dia tão especial, não acha?",
  "Um aniversário pede aquela dose extra de diversão — que tal aproveitar hoje mesmo?",
  "Separamos um cantinho cheio de brincadeiras esperando por essa comemoração especial.",
  "Todo aniversário merece uma boa dose de pular, correr e gargalhar à vontade.",
  "Achamos que hoje é o dia perfeito pra gastar energia rindo à toa com a gente.",
  "Que tal fazer desse aniversário um dia inesquecível de brincadeiras por aqui?",
  "Aniversário combina com brincadeira, sorriso solto e muita energia boa!",
  "Pensamos em vocês hoje e imaginamos a alegria de comemorar esse dia brincando à vontade.",
  "Um dia assim pede aquele passeio cheio de risada — esperamos vocês por aqui!"
];

const BLOCO_B_FECHAMENTOS = [
  "Esperamos vocês aqui hoje e, quem sabe, já começar a imaginar como seria incrível realizar a festa completa do(a) {nome_crianca} aqui no nosso playground!",
  "O melhor presente de aniversário é criar memórias inesquecíveis — os sorrisos mais sinceros sempre acontecem aqui no nosso espaço!",
  "Traga o(a) {nome_crianca} para celebrar esse dia com a gente. A festa dos sonhos ganha vida quando comemorada junto no Espaço Faça Amigos!",
  "Nossa equipe está de portas abertas pra receber essa comemoração com todo o carinho do Faça Amigos!",
  "Fica o convite: venha comemorar com a gente e deixe a gente fazer parte dessa data tão especial!"
];

function preencherAniversario(texto, nomeResponsavel, nomeCrianca, idade) {
  return texto
    .split('{nome_responsavel}').join(nomeResponsavel)
    .split('{nome_crianca}').join(nomeCrianca)
    .split('{idade}').join(String(idade));
}

// Monta as 50 combinações fixas de cada bloco (com os placeholders ainda
// presentes — o preenchimento das variáveis acontece só na hora do envio).
const BLOCO_A = BLOCO_A_ABERTURAS.flatMap(abertura =>
  BLOCO_A_COMPLEMENTOS.map(complemento => `${abertura} ${complemento}`)
);

const BLOCO_B = BLOCO_B_CONVITES.flatMap(convite =>
  BLOCO_B_FECHAMENTOS.map(fechamento => `${convite} ${fechamento}`)
);

function gerarMensagemAniversario(nomeResponsavel, nomeCrianca, idade) {
  const blocoA = BLOCO_A[Math.floor(Math.random() * BLOCO_A.length)];
  const blocoB = BLOCO_B[Math.floor(Math.random() * BLOCO_B.length)];
  const bruto = `${blocoA} ${blocoB}`;
  return preencherAniversario(bruto, nomeResponsavel, nomeCrianca, idade);
}
