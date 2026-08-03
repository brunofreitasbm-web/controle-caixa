# 🔄 Ação 2: O Pós-Venda Multiplicador (Indique 2 Amigos Novos)

**Objetivo:** Transformar clientes satisfeitos em promotores ativos da marca, focando na atração de um público totalmente novo (famílias que ainda não conhecem o espaço).

**Mecânica:** No dia seguinte à visita, o cliente recebe uma mensagem perguntando sobre a experiência/sono da criança. Junto, vai o convite: se ele indicar **2 pessoas novas (que nunca foram ao Faça Amigos)** e elas fecharem um pacote no playground, o indicador ganha **15 minutos gratuitos no Circuito**, podendo escolher entre a LandRover Branca, a Lamborghini Amarela ou o Caminhão de Bombeiro.

---

## 📱 Script da Mensagem de WhatsApp (Dia Seguinte)

A mensagem é montada pelo app (aba **PÓS-VISITA → Fila de mensagens**) e nunca sai igual duas vezes: são 4 blocos sorteados — saudação/sono × convite de indicação × prêmio × fechamento — em `webapp/mensagens-pos-visita.js`, com uma versão escrita por IA quando disponível (`services/ia-mensagens.js`). Um exemplo do resultado:

> "Bom dia, [Nome do Responsável]! 🧩💙 Aqui é da equipe do Playground FaçaAmigos. Como [Nome da Criança] dormiu depois da visita de ontem?
>
> Aproveitando, temos um presente bem especial pra vocês! 🎁 Se você indicar **2 amiguinhos que ainda não conhecem** o nosso espaço, [Nome da Criança] ganha um prêmio incrível.
>
> São **15 minutos VIP gratuitos** no nosso FaçaAmigos Circuito! 🏎️🚒 [Nome da Criança] escolhe entre pilotar a exclusiva LandRover Branca, a Lamborghini Amarela ou o super Caminhão de Bombeiro.
>
> Pra participar, é só pedir aos amiguinhos que avisem na recepção que vieram pela sua indicação. 💙 Qualquer dúvida, me chama por aqui! institutofacaamigos.com.br/playground/index.html"

**Regras de escrita (valem para o banco de blocos e para a IA):** nada de `o(a)` ou `ele(a)` — o cadastro não informa o gênero da criança, então repetimos o **nome** dela. Nenhum valor, preço ou desconto aparece; o único benefício citado é o Voucher VIP, sempre com os termos exatos acima.

---

## 📊 Como Controlar e Garantir o Sucesso dessa Ação

O controle não é mais uma caderneta: está no app, na aba **PÓS-VISITA → sub-aba "Indicações"**. Fluxo da operadora:

1. **Entrar no controle:** logo depois de disparar a mensagem, clique em **"Acompanhar indicações"** no card da família (ou cadastre manualmente em *Novo indicador*, com responsável, criança e WhatsApp). O card nasce com o placar **0/2**.
2. **A "tag" de quem indicou quem:** quando o amigo novo chegar e disser *"Vim por indicação do Enzo"*, abra o card do Enzo e clique em **"Registrar amigo indicado"**, digitando o nome de quem chegou. O placar vira **1/2**; no segundo amigo, **2/2** — e o app guarda nome e data de cada indicação.
3. **O Voucher VIP:** ao bater 2/2, o card fica destacado e aparece o botão **"Enviar parabéns do voucher"**, que abre o WhatsApp já com a mensagem pronta: *"Parabéns! Seus dois amiguinhos indicados já vieram nos visitar! O Voucher VIP de 15 minutos no FaçaAmigos Circuito está liberado aqui no nosso quiosque…"*. O menu mostra um **badge âmbar** com quantos vouchers ainda estão à espera dessa liberação — nenhum cliente fica sem resposta.
4. **A baixa no quiosque:** quando a criança usar os 15 minutos, escolha o veículo no seletor do card (LandRover Branca / Lamborghini Amarela / Caminhão de Bombeiro) e clique em **"Usou"**. Isso fecha o ciclo e ainda revela qual carrinho mais puxa indicação.
5. **Acompanhamento da ação:** o painel da sub-aba mostra, em tempo real, quantos indicadores existem, quantos estão em andamento, quantos vouchers aguardam liberação, quantos já foram usados e — o número que mais importa — **quantos clientes novos entraram por indicação**.
6. **Destaque os Carrinhos Premium:** mantenha a LandRover, a Lamborghini e o Caminhão de Bombeiro sempre bem polidos e em destaque visual no corredor. Eles agora não são apenas produtos para alugar, são os **prêmios aspiracionais** que farão as mães e pais indicarem novos clientes para você!
