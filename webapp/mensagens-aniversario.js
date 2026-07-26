// Mensagens de aniversário do Playground FaçaAmigos — combinação de 2 blocos
// (Bloco A: saudação e comemoração; Bloco B: gatilho de visita/festa) = 9
// combinações, sorteadas aleatoriamente a cada clique em "Enviar Parabéns".

const BLOCO_A = [
  "Olá, {nome_responsavel}! Hoje o dia está em festa no Espaço Faça Amigos! Desejamos um feliz aniversário para o(a) pequeno(a) {nome_crianca}! 🎉",
  "Oi, {nome_responsavel}! Toda a equipe do Faça Amigos passa por aqui para desejar um dia mágico para o(a) {nome_crianca} pelos seus {idade} anos! 🎈",
  "{nome_responsavel}, hoje é um dia super especial! O(A) {nome_crianca} está completando {idade} anos e nós do Faça Amigos comemoramos junto! 🎁"
];

const BLOCO_B = [
  "Que tal comemorar esse dia do jeito que eles mais amam: correndo, pulando e sorrindo? Esperamos vocês aqui hoje para gastar essa energia e, quem sabe, já começar a imaginar como seria incrível realizar a festa completa do(a) {nome_crianca} aqui no nosso playground!",
  "O melhor presente de aniversário é criar memórias inesquecíveis. Que tal dar uma passada no Faça Amigos hoje para uma rodada de diversão especial? Afinal, os aniversários mais marcantes e os sorrisos mais sinceros sempre acontecem aqui no nosso espaço!",
  "Aniversário combina com brincadeira! Traga o(a) {nome_crianca} para celebrar esse dia no nosso playground hoje. E lembre-se: a festa dos sonhos ganha vida quando comemorada junto com a gente no Espaço Faça Amigos!"
];

function preencherAniversario(texto, nomeResponsavel, nomeCrianca, idade) {
  return texto
    .split('{nome_responsavel}').join(nomeResponsavel)
    .split('{nome_crianca}').join(nomeCrianca)
    .split('{idade}').join(String(idade));
}

function gerarMensagemAniversario(nomeResponsavel, nomeCrianca, idade) {
  const blocoA = BLOCO_A[Math.floor(Math.random() * BLOCO_A.length)];
  const blocoB = BLOCO_B[Math.floor(Math.random() * BLOCO_B.length)];
  const bruto = `${blocoA} ${blocoB}`;
  return preencherAniversario(bruto, nomeResponsavel, nomeCrianca, idade);
}
