# Contexto — Finanças das lojas Cacau Show (Bruno)

Documento de referência para colar em outra aplicação/IA. Consolida a análise financeira feita sobre 3 lojas franqueadas Cacau Show em Belém/PA. Dados levantados em agosto/2026. Atualizar antes de reusar se muito tempo tiver passado.

## Quem é o usuário
Franqueado (leigo em contabilidade/finanças) de 3 lojas Cacau Show ativas + 1 fechada (Havan). Opera com um sócio. Quer entender e organizar o fluxo de caixa, não apenas ver o DRE.

## As lojas (código no sistema ≠ nome usado pela família)

| Apelido | Código | Nome no sistema | Perfil | CNPJ (razão social) |
|---|---|---|---|---|
| Marambaia | 9175 | PA BELEM MARAMBAIA | loja de rua, maior faturamento | IB COMERCIO DE DOCES CACAU LTDA |
| Icoaraci | 4304 | PA BELEM CRUZEIRO | loja de rua, melhor margem | IB ICOARACI CRUZEIRO COMERCIO DE DOCES DE CACAU LTDA |
| Mário Covas | 9201 | PA ANANIDEUA SUPER MIX MATEUS COQ | dentro de supermercado, compra por impulso | CNPJ próprio |
| Havan | — | fechada | — | — |

Cada CNPJ tem despesa fixa, imposto, pró-labore e dívidas próprias — nunca tratar como caixa único de rede.

## Como funciona o ciclo financeiro (modelo validado com boletos reais)

Ciclo de uma nota de campanha (Páscoa, Natal etc.):
dia 0 nota fiscal → dia 22 mercadoria chega na loja → boleto vence entre D+2 e D+24 **contados da data da campanha/feriado**, não da NF (achado corrigido: o pressuposto inicial de "NF+76" estava errado).

Forma real de pagamento medida (Páscoa 2026, R$274.413): D+2 = 53% · D+8 = 4% · D+22 = 30% · D+24 = 11% · D+45 = 2% (cauda).

Royalties encarecem o pedido em ~42-48%: multiplicador pedido→boleto = **1,48×** nas três lojas (custo real de campanha = pedido de mercadoria × 1,48).

Recebimento das vendas: 60% entra no ato (débito/PIX/dinheiro), **40% no cartão de crédito, recebido em D+30** (dado confirmado pelo Bruno, aplicado às 3 lojas por falta de dado específico de Icoaraci/Mário Covas).

Janela útil de venda de uma nota de campanha (tempo entre a mercadoria chegar e ainda dar tempo do recebimento cobrir o boleto):
- cartão D+1: 53 dias de janela (98% do ciclo)
- cartão D+15: 39 dias (72%)
- cartão D+30 (caso real): **24 dias (44%)**
- cartão D+45: 9 dias (17%)
Agravante: 90% da venda de abril/2026 aconteceu nos 7 primeiros dias do mês — a concentração de venda fica fora da janela que ainda recebe a tempo.

Despesa fixa: paga todo dia 8. Imposto: pago todo dia 20, sobre o faturamento do **mês anterior** (~8,2% — achado por regressão, R² 0,49 contra mês anterior vs. 0,12 contra o mesmo mês; ainda não confirmado com contador).

## Sazonalidade (índice = venda do período ÷ venda de um dia comum da própria loja)

| Evento | Marambaia | Icoaraci | Mário Covas |
|---|---|---|---|
| Páscoa (pico) | 10,27× | 11,63× | 11,12× |
| Natal (15-24/dez) | 4,91× | 3,08× | 2,89× |
| Namorados | 1,40× | 1,59× | 1,84× |
| Dia das Mães | 1,07× | 1,09× | 1,27× |
| Dia dos Pais | 0,46× | 0,61× | 0,88× |
| Dia das Crianças | 0,59× | — | 0,67× |

Índice mensal médio (2023-2025, Marambaia): jan 0,46 · fev 0,56 · **mar 2,31** · **abr 2,20** · mai 0,64 · jun 0,72 · jul 0,37 · ago 0,41 · set 0,40 · out 0,55 · nov 0,74 · **dez 2,44**.

Só março, abril e dezembro cobrem o ponto de equilíbrio nas três lojas — os outros 9 meses ficam abaixo. Dia das Mães, Pais e Crianças rendem perto ou abaixo de um dia comum: não valem pedido extra de campanha.

Páscoa muda de mês ano a ano: 2027 = 28/mar · 2028 = 16/abr — recalcular o calendário de caixa a cada ano.

## Números por loja (10 meses comparáveis, set/2025-jun/2026; Mário Covas só a partir de set/2025 por instrução do Bruno)

| Métrica | Marambaia | Icoaraci | Mário Covas |
|---|---|---|---|
| Faturamento/mês | R$ 118.566 | R$ 71.775 | R$ 25.629 |
| Despesa fixa/mês | R$ 33.012 | R$ 18.163 | R$ 10.782 |
| CMV | 52,4% | 52,3% | 52,2% |
| Ponto de equilíbrio/mês | R$ 83.767 | R$ 46.018 | R$ 27.247 |
| Ponto de equilíbrio/dia | R$ 2.755 | R$ 1.514 | R$ 896 |
| Cobertura do equilíbrio | 142% | 156% | **94%** |
| Resultado acumulado (10m) | +R$ 137.401 | +R$ 100.375 | **−R$ 2.439** |
| Margem operacional | 11,6% | **14,0%** | −1,0% |
| Venda/dia (2026) | R$ 4.123 | R$ 2.969 | R$ 1.076 |
| Ticket médio | R$ 112,11 | R$ 123,53 | R$ 67,13 |
| Boletos pagos c/ atraso (180d) | 81% | 79% | 57% |
| Boletos com +10 dias de atraso | 13% | 22% | 27% |
| Títulos em aberto (09/08/2026) | R$ 101.028 | R$ 39.969 | R$ 41.615 |
| Vencido e não pago | R$ 25.449 | R$ 11.449 | R$ 11.379 |
| Acordo de renegociação aberto | R$ 26.707 (juro ~0,97%/mês, até 24/10/2026) | quitado (R$4.016, fev/2026) | nenhum |

**Icoaraci é a melhor loja da rede**: fatura 61% da Marambaia com 55% da despesa fixa dela.
**Mário Covas não se paga**: fatura R$25,6 mil contra equilíbrio de R$27,2 mil; fev, mar, mai e jun/2026 foram negativos.

### Erro de compra identificado (Páscoa 2026)

| Loja | Pedido feito | Com royalties (×1,48) | Faturamento de abril | Boleto ÷ faturamento | Pedido proporcional correto |
|---|---|---|---|---|---|
| Marambaia | R$ 178.011 | R$ 264.236 | R$ 400.897 | 79% | na medida |
| Icoaraci | R$ 104.572 | R$ 155.230 | R$ 269.835 | 78% | R$ 119.815 (13% menor) |
| Mário Covas | R$ 115.003 | R$ 170.704 | R$ 92.444 | **191%** | R$ 41.048 (comprou 180% a mais do que devia) |

Regra derivada: teto de pedido de campanha = 40-44% do faturamento que a própria loja fez no mesmo mês do ano anterior (mercadoria, sem contar royalties).

## O buraco de ~R$27 mil/mês (achado ainda não resolvido)

Simulação de caixa dia a dia da Marambaia (01/01 a 08/08/2026), partindo de saldo zero, com 60%/40%-D+30 real e boletos reais: o caixa simulado **nunca fica negativo** e termina em +R$196.886. Isso contradiz a realidade observada (81% pago com atraso, R$25.449 vencido, acordo de R$26.707 ativo).

Para o modelo bater com a realidade falta uma saída de **~R$27.242/mês que não aparece em nenhum arquivo analisado**. Hipóteses, em ordem de probabilidade:
1. **Retirada dos sócios / pró-labore não informada** — 2 sócios a R$13,5 mil cada fecharia a conta quase exatamente. (Lucro operacional real da Marambaia é só R$11.162/mês.)
2. Despesa fixa maior que os R$21.829/mês estimados por regressão (se for ~R$49 mil, o modelo fecha sozinho, mas o equilíbrio sobe para R$122.500/mês).
3. Saldo inicial de 01/01/2026 já negativo (o acordo pode ser dívida herdada de antes de 2026).
4. Empréstimo/financiamento com parcela fora do DRE analisado.

Testado e descartado: as outras duas lojas não sugam caixa da Marambaia (rede menos 9175, 2024-2026: +R$137.850 acumulado, pouco lucrativas mas não deficitárias).

## Se fosse injetar capital hoje (10/08/2026) para sanar o caixa

Simulação de projeção mensal (ago/2026 a mar/2027), com todo o vencido/acordo hoje jogado no primeiro mês projetado, campanhas futuras pelo teto de 40-44%, despesa fixa e imposto — valor mínimo = ponto mais baixo do caixa acumulado projetado (não é soma simples de vencido+acordo, isso dobraria a conta):

| Loja | Injeção mínima | Pior mês |
|---|---|---|
| Marambaia | R$ 97.317 | outubro/2026 |
| Icoaraci | R$ 23.841 | agosto/2026 |
| Mário Covas | R$ 39.286 | março/2027 |
| **Total** | **R$ 160.445** | — |

Com margem de segurança de 20%: R$192.534. Em cenário conservador (receita −20%): R$221.506.

Ressalvas dadas ao Bruno: são valores só operacionais, **não incluem retirada dos sócios**; se o vazamento de ~R$27 mil/mês continuar, a injeção dura só ~5,9 meses; não injetar em Mário Covas sem antes levantar custo de saída/distrato (ela não cobre o próprio equilíbrio mesmo capitalizada). Ordem recomendada: (1) ajustar retirada primeiro, (2) reperfilar o acordo da Marambaia para dez/jan, (3) antecipar recebíveis de dezembro, (4) só então considerar injeção real de capital — e esperar ~2 semanas para ter retirada e despesa fixa reais antes de decidir o valor.

## Veredito estratégico dado (não vender)

"O negócio é saudável. A gestão de caixa não é." Evidências de saúde: margem operacional de rede 12,9% no 1S2026 (R$1.550.096 faturado, R$199.738 de lucro operacional); Marambaia cresceu 19,4% no 1S2026 vs 1S2025; margem das outras 2 lojas foi de 4,2% (2025) para 12,6% (1S2026).

Evidências de doença financeira: acordo com juro, 81% de atraso, vencidos, buraco de R$27 mil/mês não mapeado, sem reserva para sazonalidade.

Critérios que mudariam a decisão para vender: margem operacional negativa por 4 trimestres seguidos; faturamento caindo 12 meses seguidos vs. mesmo mês do ano anterior; ou alternativa de capital com retorno e liquidez comprovadamente melhores. Nenhum se aplica hoje.

**Sinal amarelo em aberto, não investigado**: venda/dia da Marambaia caiu 18% em junho/2026 e 42% em julho/2026 vs. mesmos meses de 2025 (julho/2026 foi o pior mês de 4 anos de série). Hipóteses a checar: ruptura de estoque, mudança de equipe/escala, concorrência nova.

## Rotina recomendada (Coach Financeiro)

**5 regras de ouro:**
1. Todo dinheiro que entra é dividido no mesmo dia entre 3 contas (operação, imposto, reserva).
2. Nunca comprar campanha acima de 40% do que a loja vendeu no mesmo mês do ano anterior.
3. O dinheiro de março, abril e dezembro não é do sócio — vai para a reserva.
4. Retirada fixa: mesmo dia, mesmo valor, todo mês.
5. Boleto vencido é sintoma; o erro aconteceu ~60 dias antes, na hora da compra.

**Imposto diário a separar (8,2% de tudo que entra):** Marambaia R$9.722/mês · Icoaraci R$5.886/mês · Mário Covas R$2.102/mês.

**3 estações do ano:**
- Colheita (mar, abr, dez): geram R$404 mil na rede — não aumentar retirada nem gastar em reforma/equipamento.
- Travessia (mai a nov, 7 meses): consomem R$169 mil/ano — não aceitar campanha opcional (Namorados, Pais, Crianças).
- Preparação (jan, fev): fechar pedido de Páscoa pela regra dos 40%; pagar parcelas finais do Natal com a reserva.

**Teto de retirada sustentável:** lucro operacional de rede ~R$23.534/mês; guardando 40% para reserva, sobram R$14.120/mês = **R$7.060 por sócio**. (Se a retirada real estiver perto dos R$27 mil/mês somados — a hipótese nº1 do buraco — está em ~2× o sustentável.)

**Meta para 31/12/2026:** ter R$235.927 na conta de reserva (cobre o boleto de Natal + o déficit projetado de jan/fev/2027).

**7 armadilhas ensinadas:** confundir DRE com caixa · comprar pelo entusiasmo do mês anterior · achar que os ~76 dias de prazo são folga · tratar royalties como detalhe (são +48% do pedido) · comprar Mães/Pais/Crianças como campanha real · usar a régua da loja grande (Marambaia) na pequena (Mário Covas) · deixar tudo numa conta só.

## Dados que ainda faltam (perguntar ao Bruno / ao contador antes de fechar qualquer novo diagnóstico)

1. **Prioridade máxima**: quanto os 2 sócios retiram por mês, por CNPJ — pedido 3+ vezes, não respondido.
2. Despesa fixa real detalhada (aluguel, folha, energia, contador, software) por CNPJ — hoje é estimativa por regressão.
3. Saldo em conta em 31/12/2025, por CNPJ.
4. Confirmar a qual CNPJ pertence o acordo de R$26.707 (presumido Marambaia, pois apareceu no arquivo da 9175, mas nunca confirmado explicitamente).
5. % de venda no cartão de crédito e prazo de recebimento específicos de Icoaraci e Mário Covas (hoje assume-se igual à Marambaia: 40%/D+30).
6. Onde entram os royalties de campanha no DRE — R$86,2 mil de royalties de abril não batem nem com o CMV (R$207,9 mil) nem com Despesas (R$58,0 mil) da Marambaia. Perguntar ao contador.
7. Investigar queda de venda/dia em jun-jul/2026 na Marambaia.
8. Custo de saída/distrato de Mário Covas (aluguel dentro do Mateus, termo de franquia), caso a decisão de mantê-la seja revista.

## Onde estão os documentos gerados

Todos entregues e salvos em "01 - Financeiro/" no computador do Bruno:
- Calendario de Caixa - Marambaia 9175.html (dashboard interativo)
- Comparativo das 3 Lojas - Cacau Show.html (dashboard interativo)
- Manual do Franqueado - Como ler o caixa da sua loja.docx (14 páginas)
- Diagnostico Estrategico - Vender ou Consertar.docx (6 páginas)
- Coach Financeiro - A rotina que deixa o caixa saudavel.docx (9 páginas)
- Planilha de Controle Financeiro - Cacau Show.xlsx (4 abas: Painel, Diário do Caixa, Teto de Campanha, Referência — planilha viva, para preencher)
