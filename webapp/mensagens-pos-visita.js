// Mensagens de pós-visita do Playground FaçaAmigos — disparadas no dia
// seguinte para os responsáveis de toda criança que visitou o espaço.
//
// Desde a "Ação 2 — Pós-Venda Multiplicador" (ver acao_2_pos_venda.md), a
// mensagem tem dois objetivos, nessa ordem: perguntar como a criança ficou
// depois da visita (sono/experiência) e convidar o responsável a indicar
// 2 amigos NOVOS — quem nunca esteve no espaço. Fechando os dois, a criança
// ganha 15 minutos VIP no FaçaAmigos Circuito, à escolha entre a LandRover
// Branca, a Lamborghini Amarela e o Caminhão de Bombeiro.
//
// Tom: carinhoso, acolhedor, cheio de emojis, nunca corporativo.
//
// Em vez de centenas de strings fixas (repetitivas e difíceis de manter), a
// mensagem final combina 4 blocos — saudação/sono (10) × convite de
// indicação (8) × prêmio (6) × fechamento (4) = 1.920 combinações possíveis,
// sorteadas aleatoriamente a cada clique em "Enviar mensagem".
//
// Regra de escrita: o cadastro NÃO informa o gênero da criança. Nos blocos
// novos, repetimos o NOME em vez de usar "o(a)" / "ele(a)".

const SAUDACOES = [
  "Bom dia, {{nome_responsavel}}! 🧩💙 Aqui é da equipe do Playground FaçaAmigos. Como {{nome_crianca}} dormiu depois da visita de ontem?",
  "Oii, {{nome_responsavel}}! ✨ Passando pra saber como {{nome_crianca}} ficou depois de brincar com a gente ontem — o sono costuma vir bem tranquilo!",
  "Bom dia, {{nome_responsavel}}! 🌈 Ficamos pensando aqui: como foi a noite de {{nome_crianca}} depois de tanta brincadeira boa?",
  "Oi, {{nome_responsavel}}, tudo bem? 🥰 A equipe do FaçaAmigos queria saber como {{nome_crianca}} ficou depois da visita de ontem.",
  "Bom dia! 🎈 {{nome_responsavel}}, aqui é do Playground FaçaAmigos — nos conta, como {{nome_crianca}} dormiu hoje?",
  "Oii, {{nome_responsavel}}! 💙 Depois de brincar com a nossa equipe especializada, a criançada costuma relaxar de verdade. Como {{nome_crianca}} passou a noite?",
  "Bom dia, {{nome_responsavel}}! 🧸 Foi uma alegria receber {{nome_crianca}} ontem. Como ficou o sono depois de tanta energia gasta aqui?",
  "Oi, {{nome_responsavel}}! 🦋 Passando com carinho pra saber como {{nome_crianca}} está hoje, depois da visitinha de ontem.",
  "Bom dia, {{nome_responsavel}}! 🎨 A equipe ainda comenta do sorriso de {{nome_crianca}} por aqui. Como foi o resto do dia de vocês?",
  "Oii! ✨💙 {{nome_responsavel}}, chegando pra saber como {{nome_crianca}} ficou depois de brincar com a nossa turminha ontem."
];

const CONVITES = [
  "Aproveitando, temos um presente bem especial pra vocês! 🎁 Se você indicar 2 amiguinhos que ainda não conhecem o nosso espaço, {{nome_crianca}} ganha um prêmio incrível.",
  "E olha só, separamos uma surpresa pra vocês! 🎁 Indicando 2 amiguinhos que nunca vieram ao FaçaAmigos, {{nome_crianca}} sai ganhando.",
  "Ah, e temos uma novidade que é a cara de vocês! ✨ Basta indicar 2 amiguinhos que ainda não conhecem o nosso espaço pra {{nome_crianca}} ganhar um presente especial.",
  "Já que você faz parte da nossa turminha, queremos te dar um mimo! 💛 Indique 2 famílias que ainda não vieram ao FaçaAmigos e {{nome_crianca}} ganha um prêmio.",
  "E temos um convite carinhoso: 💙 se você indicar 2 amiguinhos que nunca visitaram o nosso espaço, tem presente esperando por {{nome_crianca}}.",
  "Aproveitando a conversa, olha que legal! 🌟 Indicando 2 amiguinhos novinhos aqui no FaçaAmigos, {{nome_crianca}} ganha uma recompensa especial.",
  "E antes que a gente esqueça: temos um agrado pra vocês! 🎉 É só indicar 2 amiguinhos que ainda não conhecem o espaço pra {{nome_crianca}} ser premiado.",
  "Ah! E como vocês já fazem parte da nossa família, um presente: 🥰 indique 2 amiguinhos que nunca vieram ao FaçaAmigos e {{nome_crianca}} ganha uma surpresa."
];

const PREMIOS = [
  "São 15 minutos VIP gratuitos no nosso FaçaAmigos Circuito! 🏎️🚒 {{nome_crianca}} escolhe entre pilotar a exclusiva LandRover Branca, a Lamborghini Amarela ou o super Caminhão de Bombeiro.",
  "O prêmio são 15 minutos VIP no FaçaAmigos Circuito, de graça! 🚗✨ E quem escolhe é {{nome_crianca}}: LandRover Branca, Lamborghini Amarela ou Caminhão de Bombeiro.",
  "15 Minutos VIP gratuitos no FaçaAmigos Circuito 🏎️💨 — com direito a escolher entre a LandRover Branca, a Lamborghini Amarela e o Caminhão de Bombeiro!",
  "Falamos de 15 minutos VIP, por nossa conta, no FaçaAmigos Circuito! 🚒🏎️ {{nome_crianca}} decide qual leva pra pista: LandRover Branca, Lamborghini Amarela ou Caminhão de Bombeiro.",
  "O presente são 15 minutinhos VIP gratuitos no nosso Circuito! ✨🚗 Dá pra escolher a LandRover Branca, a Lamborghini Amarela ou o Caminhão de Bombeiro — os queridinhos da turma.",
  "Reservamos 15 minutos VIP gratuitos no FaçaAmigos Circuito pra {{nome_crianca}}! 🏎️🚒 A escolha do veículo é toda dela: LandRover Branca, Lamborghini Amarela ou Caminhão de Bombeiro."
];

const FECHAMENTOS = [
  "Pra participar, é só pedir aos amiguinhos que avisem na recepção que vieram pela sua indicação. 💙 Qualquer dúvida, me chama por aqui! institutofacaamigos.com.br/playground/index.html",
  "Pra valer, basta que os amigos digam na chegada que vieram por sua indicação. 🧩 Se quiser mostrar o espaço pra eles, manda esse link: institutofacaamigos.com.br/playground/index.html",
  "É bem simples: os amiguinhos só precisam informar na recepção que vieram por sua indicação. ✨ Já deixo aqui o nosso cantinho pra você compartilhar: institutofacaamigos.com.br/playground/index.html",
  "Combinado assim: quando os amiguinhos chegarem, é só avisarem que a indicação foi sua. 💛 Estamos te esperando de volta — dá uma espiadinha nas novidades: institutofacaamigos.com.br/playground/index.html"
];

// Enviada quando a segunda indicação fecha o pacote (submenu "Indicações").
const PARABENS_VOUCHER = [
  "Parabéns, {{nome_responsavel}}! 🎉💙 Seus dois amiguinhos indicados já vieram nos visitar! O Voucher VIP de 15 minutos de {{nome_crianca}} no FaçaAmigos Circuito está liberado aqui no nosso quiosque — é só passar aqui e escolher entre a LandRover Branca, a Lamborghini Amarela e o Caminhão de Bombeiro. 🏎️🚒✨",
  "Deu certo, {{nome_responsavel}}! 🥳 As duas indicações fecharam e o Voucher VIP de {{nome_crianca}} está liberado: 15 minutos gratuitos no FaçaAmigos Circuito! 🏎️ É só vir ao quiosque escolher a LandRover Branca, a Lamborghini Amarela ou o Caminhão de Bombeiro. 💙",
  "Oba, {{nome_responsavel}}! ✨ Seus dois amiguinhos indicados já brincaram com a gente, e por isso {{nome_crianca}} ganhou 15 Minutos VIP no nosso Circuito! 🚒 Passe no quiosque pra retirar o voucher e escolher entre LandRover Branca, Lamborghini Amarela e Caminhão de Bombeiro. 🎉"
];

function preencher(texto, nomeResponsavel, nomeCrianca) {
  return texto
    .split('{{nome_responsavel}}').join(nomeResponsavel)
    .split('{{nome_crianca}}').join(nomeCrianca);
}

function sortear(lista) {
  return lista[Math.floor(Math.random() * lista.length)];
}

function gerarMensagemPosVisita(nomeResponsavel, nomeCrianca) {
  const bruto = [
    sortear(SAUDACOES),
    sortear(CONVITES),
    sortear(PREMIOS),
    sortear(FECHAMENTOS)
  ].join(' ');
  return preencher(bruto, nomeResponsavel, nomeCrianca);
}

// Quem chega ao balcão informa o nome e o WhatsApp de quem indicou — o nome
// da criança quase nunca vem junto. Sem ele, usamos uma redação que fala do
// prêmio sem citar ninguém, em vez de deixar um "undefined" na mensagem.
const PARABENS_VOUCHER_SEM_CRIANCA = [
  "Parabéns, {{nome_responsavel}}! 🎉💙 Seus dois amiguinhos indicados já vieram nos visitar! Por isso o Voucher VIP de 15 minutos no FaçaAmigos Circuito está liberado aqui no nosso quiosque — é só passar aqui e escolher entre a LandRover Branca, a Lamborghini Amarela e o Caminhão de Bombeiro. 🏎️🚒✨",
  "Deu certo, {{nome_responsavel}}! 🥳 As duas indicações fecharam e o Voucher VIP está liberado: 15 minutos gratuitos no FaçaAmigos Circuito! 🏎️ É só vir ao quiosque escolher a LandRover Branca, a Lamborghini Amarela ou o Caminhão de Bombeiro. 💙",
  "Oba, {{nome_responsavel}}! ✨ Seus dois amiguinhos indicados já brincaram com a gente, e o prêmio saiu: 15 Minutos VIP no nosso Circuito! 🚒 Passe no quiosque pra retirar o voucher e escolher entre LandRover Branca, Lamborghini Amarela e Caminhão de Bombeiro. 🎉"
];

function gerarMensagemVoucherLiberado(nomeResponsavel, nomeCrianca) {
  const crianca = (nomeCrianca || '').trim();
  if (!crianca) return preencher(sortear(PARABENS_VOUCHER_SEM_CRIANCA), nomeResponsavel, '');
  return preencher(sortear(PARABENS_VOUCHER), nomeResponsavel, crianca);
}
