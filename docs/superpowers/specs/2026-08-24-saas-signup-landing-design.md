# HUB OPERAÇÕES SaaS — Landing page, diagnóstico grátis e assinatura via Stripe

Data: 2026-08-24
Status: proposto, aguardando revisão do Bruno antes de virar plano de implementação

## Contexto

Huboperacoes é hoje uma ferramenta interna real, usada todo dia pelas 3 lojas Cacau Show do Bruno (Marambaia/9175, Icoaraci/4304, Mário Covas/9201) + Faça Amigos (em descontinuação para o produto SaaS). Uma outra sessão de IA já vinha trabalhando, no mesmo repositório, numa fundação de arquitetura multi-tenant (organizations, colaboradores/pins escopados por organizationId, sessions com token real, tenant_modules, unidades, planos_precificacao) — commits "Fase 2/3/4" mergeados via PR #63 em 2026-08-24. Essa sessão foi pausada pelo Bruno para este trabalho poder avançar sem colidir.

Achado crítico: `routes/middleware/resolveTenantSession.js` roda em modo "soft" — sem token de sessão, toda requisição cai no `TENANT_ZERO_ID` (hoje, os dados reais do Bruno). Isso é intencional e documentado no código: o frontend legado (`webapp/app.js`, ~16 mil linhas) ainda não sabe mandar token em cada requisição — essa reescrita (Fase 2 do frontend) é trabalho da outra sessão, não deste projeto.

Consequência direta para este design: é seguro automatizar a CRIAÇÃO de uma organização nova (paga, via Stripe), mas não é seguro liberar login real nela até a Fase 2 do frontend estar confirmada — um franqueado novo logando hoje, sem essa reescrita pronta, corre risco de cair nos dados do tenant zero (dados reais do Bruno) em vez dos dele.

## Escopo deste projeto

Dentro do escopo:
- Landing page de conversão para franqueados Cacau Show com até 5 lojas (quem tem mais já usa sistema próprio — fora do público-alvo).
- Diagnóstico financeiro grátis como isca de conversão (mesma lógica de ciclo de boleto / teto de campanha / ponto de equilíbrio que o Bruno já validou nas próprias 3 lojas — ver `contexto_cacau_show.md`), rodado com dados que o próprio franqueado sobe/informa.
- Checkout de assinatura via Stripe (cartão, modo teste primeiro).
- Provisionamento automático de organização (`organizations` + `colaboradores` owner + `pins`) disparado pelo webhook de pagamento aprovado.
- Gate de liberação: conta criada e paga fica em `provisionado_aguardando_liberacao` até o Bruno confirmar (manualmente, por ora) que a Fase 2 do frontend da outra sessão está pronta; só então o PIN e o link de acesso são enviados ao franqueado.

Fora do escopo (pertence à outra sessão / fica para depois):
- Reescrever `webapp/app.js` para mandar token de sessão em cada requisição.
- Franqueados com mais de 5 lojas (não é o público-alvo do produto).
- Pix/boleto no Stripe (exige configuração adicional no Brasil — cartão primeiro).

## Regra de isolamento (não negociável)

Nenhum arquivo já modificado pela outra sessão é editado por este trabalho, com uma única exceção mínima e comunicada antes de aplicar: uma linha em `server.js` registrando a rota nova (`app.use('/api/saas', require('./routes/saas-signup'))`). Todo o resto vive em arquivos novos:
- `webapp/saas-landing/` — landing page + diagnóstico (HTML/CSS/JS puro, sem build, mesma convenção do projeto).
- `routes/saas-signup.js` — endpoints públicos de checkout/webhook/diagnóstico.
- `services/stripe.js` — encapsula chamadas à API do Stripe.
- `scripts/stripe-setup-planos.js` — script de uso único para criar os 3 produtos/preços no Stripe (roda local, lê a secret key do `.env`, nunca imprime a chave, só os price IDs resultantes).
- Uma tabela nova, aditiva, em `config/database.js`: `assinaturas` (ver schema abaixo) — só adiciona uma entrada ao array `initQueries`, não altera nenhuma tabela existente.

## Modelo de preços (validado com o Bruno)

Foco: franqueados Cacau Show com 1 a 5 lojas. Preço "fundador" trava vitalício para os primeiros 10-30 assinantes (gancho de conversão: vagas limitadas); preço público entra depois.

| Faixa | Preço fundador | Preço público |
|---|---|---|
| 1 loja | R$ 149 | R$ 197 |
| 2 lojas | R$ 249 | R$ 347 |
| 3–5 lojas | R$ 399 | R$ 597 |

Sem faixa acima de 5 lojas — decisão do Bruno: quem tem mais já resolveu isso com sistema próprio.

## Funil de conversão

1. Franqueado chega na landing page (`webapp/saas-landing/index.html`).
2. Em vez de abrir com preço, abre com **diagnóstico grátis**: formulário curto pedindo alguns dados operacionais da loja dele (faturamento médio, valor de boletos de campanha recentes, data). Roda a mesma lógica de teto de campanha (40-44% do faturamento do mesmo mês do ano anterior) e ponto de equilíbrio já validada nas 3 lojas do Bruno — mostra pro franqueado, na hora, se ele está comprando acima do teto ou perto do ponto de equilíbrio.
3. Depois do número aparecer, oferece a assinatura, já com a faixa de preço certa pro número de lojas dele.
4. Ele escolhe o plano, é redirecionado para o Stripe Checkout (hospedado, modo teste por enquanto).
5. Stripe processa e manda webhook `checkout.session.completed` para `POST /api/saas/webhook`.
6. Webhook cria `organizations` (novo id/slug a partir do nome do negócio informado), `colaboradores` (owner), `pins` (PIN aleatório de 4 dígitos, hash bcrypt), grava `assinaturas` com status `provisionado_aguardando_liberacao`, e notifica o Bruno (push/e-mail, reaproveitando `config/notifications.js` só de leitura, sem modificar o arquivo).
7. Bruno confirma manualmente (endpoint `POST /api/saas/liberar/:organizationId`, owner-only) quando a Fase 2 do frontend estiver pronta — só então o e-mail com PIN e link de acesso sai para o franqueado.

## Schema novo (aditivo)

```sql
CREATE TABLE IF NOT EXISTS assinaturas (
  id TEXT PRIMARY KEY,
  organizationId TEXT NOT NULL,
  stripeCustomerId TEXT,
  stripeSubscriptionId TEXT,
  stripeCheckoutSessionId TEXT,
  planoChave TEXT NOT NULL,           -- '1-loja' | '2-lojas' | '3-5-lojas'
  valorMensal DOUBLE PRECISION NOT NULL,
  ehFundador INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'provisionado_aguardando_liberacao',
  -- status: provisionado_aguardando_liberacao | liberado | cancelado | inadimplente
  criadoEm TEXT,
  liberadoEm TEXT
)
```

## Stripe — o que falta configurar (Bruno, modo teste)

1. No painel do Stripe, em modo **Test**: Developers → API keys → copiar a "Secret key" (`sk_test_...`).
2. Adicionar no `.env` local (nunca colar a chave no chat): `STRIPE_SECRET_KEY=sk_test_...`.
3. Eu escrevo `scripts/stripe-setup-planos.js`, que lê essa variável e cria os 3 produtos/preços via API — você roda uma vez (`node scripts/stripe-setup-planos.js`), ele imprime só os `price_...` de cada faixa (não a chave).
4. Depois, configuro o endpoint de webhook no Stripe apontando para `/api/saas/webhook` — o Stripe me dá um `STRIPE_WEBHOOK_SECRET` (`whsec_...`), que também vai só no `.env`, nunca no chat.

## Testes

- `tests/saas-signup.test.js` (novo arquivo, `node --test`): cria organização a partir de um payload de webhook simulado (sem chamar Stripe de verdade), confere isolamento (nenhuma tabela existente é tocada), confere que o PIN só é enviado depois de `/liberar`.
- Teste manual ponta a ponta em modo Stripe teste: checkout completo com cartão de teste (4242 4242 4242 4242) → confirma criação da organização → confirma que login não é liberado até o endpoint de liberação ser chamado.

## Riscos residuais assumidos pelo Bruno

- Franqueado pagante fica em espera (sem PIN) até liberação manual — pode gerar atrito se demorar; mitigação: notificação imediata pro Bruno a cada novo pagamento.
- Stripe cartão-only no Brasil por enquanto — perde quem só usa Pix/boleto; decisão consciente do Bruno.
- Preço de fundador trava vitalício — se a demanda for muito maior que 10-30, o Bruno perde receita potencial dos primeiros clientes; é o trade-off aceito pela estratégia "poucos e certos".
