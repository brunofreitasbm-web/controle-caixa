# HUB OPERAÇÕES SaaS — Handoff para Claude Code

Data: 2026-08-25
Origem: sessão Cowork (Claude Design + auditoria de código + negociação de preço com o Bruno)
Status: contexto consolidado, com decisões tomadas E decisões pendentes claramente marcadas

Este arquivo existe pra alguém (Claude Code, ou o Bruno lendo) retomar o trabalho sem perder o que já foi decidido nem repetir descobertas já feitas. Ver também a spec técnica anterior, mais detalhada em arquitetura: `docs/superpowers/specs/2026-08-24-saas-signup-landing-design.md` (este arquivo complementa aquele, não substitui — o funil de pagamento mudou desde então, ver seção "Funil de conversão" abaixo).

## 1. Contexto do repositório — leia antes de editar qualquer coisa

Huboperacoes é uma ferramenta interna REAL, usada todo dia pelas 3 lojas Cacau Show do Bruno (Marambaia/9175, Icoaraci/4304, Mário Covas/9201) + Faça Amigos (em descontinuação para o produto SaaS). Não é ambiente de teste.

Uma outra sessão de IA trabalhou no mesmo repositório numa fundação multi-tenant (commits "Fase 2/3/4", PR #63, branch `worktree-saas-multitenant-fase1`) — foi pausada pelo Bruno para o trabalho de landing page avançar sem colidir. **Antes de editar `server.js`, `config/database.js`, `webapp/app.js` ou qualquer arquivo dentro de `routes/`, confirme com o Bruno se aquela sessão está mesmo parada e se o estado do git ainda bate com o que está descrito aqui** (rodar `git log -1` e comparar timestamp).

Regra de isolamento que valeu até aqui: só arquivos NOVOS foram tocados (nada de `routes/*.js`, `server.js`, `webapp/app.js`, `config/database.js` existentes foram editados). Recomendo manter essa disciplina até a outra sessão ser formalmente encerrada ou até o Bruno confirmar que pode mexer nos arquivos compartilhados.

## 2. Achados técnicos importantes (verificados no código, não suposição)

- **Multi-tenant backend já existe e é sério**: `organizations`, `colaboradores`/`pins` escopados por `organizationId`, `sessions` com token real (bcrypt + rate limit de 10 tentativas/min), `tenant_modules` (feature flags), `unidades` (CRUD de lojas), `planos_precificacao` (faixas de preço por quantidade de unidades — schema já existe, sem dado seedado). Ver `routes/auth.js`, `routes/tenant.js`, `config/database.js`.
- **Bloqueador real de login multi-tenant**: `routes/middleware/resolveTenantSession.js` roda em modo "soft" — sem token de sessão, cai no `TENANT_ZERO_ID` (hoje, dados reais do Bruno). O frontend legado (`webapp/app.js`, ~16 mil linhas) ainda não manda token em cada requisição. **Não é seguro liberar login real de franqueado pagante até essa reescrita do frontend (Fase 2, trabalho da outra sessão) estar confirmada pronta.**
- **Backup é mensal, não diário**: `vercel.json` + `server.js` mostram cron `/api/cron/backup-mensal` — um e-mail com dump JSON uma vez por mês. Qualquer copy que diga "backup diário automático" é falsa.
- **Sem evidência de conformidade LGPD**: nenhuma política de privacidade, base legal documentada, ou DPO/encarregado identificado no projeto. Selo "Conforme LGPD" na landing page não tem lastro.
- **Sem evidência de conformidade com a portaria de ponto eletrônico (671/2021)**: nenhuma referência a AFD, REP-P, ou portaria do Ministério do Trabalho em `routes/ponto*.js` ou `services/`. Alegar conformidade trabalhista é risco jurídico sem essa implementação.
- **"Escala de equipe" não existe no sistema**: só aparece "escala" no código como escala numérica de cálculo de bônus (0-100%), nunca como escalação de turno/equipe. Se a landing page menciona isso como feature, é invenção.
- **`nfe.js` hoje é status manual** (pendente/conferido/divergente marcado por humano), não comparação automática bipagem-vs-NF-e. A bipagem em si (scanner de código de barras batendo contra itens, com aviso de "não localizado") é real — confirmada em `webapp/app.js` e `routes/inventario.js`. O Bruno confirmou que o modo "cego" (quem conta não vê a quantidade esperada) é real hoje, mas eu não consegui localizar essa lógica especificamente no código que revisei — vale um teste manual antes de apostar a copy nisso.

## 3. Escopo do produto SaaS — confirmado pelo Bruno

Só 4 recursos vão para o franqueado pagante:
1. Bipagem cega para conferência de NF-e
2. Inventário mensal (mais controle de validade, extensão natural)
3. Controle de ponto (GPS + biometria facial)
4. Concentrador de perfis DISC para formar equipe de vendas

**Fora do escopo, de propósito**: controle de caixa, metas/bonificação, copiloto de IA — ficam só no uso interno do Bruno por enquanto.

**Público-alvo**: franqueados com até 5 lojas. Quem tem mais de 5 já resolveu isso com sistema próprio — não é o cliente-alvo, não deve nem aparecer como opção de plano.

**Sem integração automática com a franqueadora**: o franqueado/gerente exporta NF-e, metas e dados de RH da intranet da rede e importa manualmente no Hub de Operações. Isso é decisão deliberada (preserva uso da marca/sistemas próprios da franqueadora) — já está documentado assim na landing page atual e deve continuar.

## 4. Precificação — DECISÃO PENDENTE, duas opções em aberto

Historico da negociação com o Bruno (contexto, não é só chute): TAM real é 1.200 franqueados / 4.713 lojas Cacau Show (~3,9 lojas/franqueado em média, confirmado via busca). Franqueado já paga R$540/mês num PDV homologado obrigatório — o Hub de Operações é complemento, não substituto, o que sustenta preço mais alto que "software genérico grátis". Meta do Bruno pro ano 1: 10-30 clientes ("poucos e certos"), não land-grab de volume.

**Opção A — combinada em conversa (preço fixo por faixa, com "fundador")**:

| Faixa | Preço fundador (primeiros 10-30) | Preço público |
|---|---|---|
| 1 loja | R$ 89 | R$ 119 |
| 2 lojas | R$ 149 | R$ 199 |
| 3–5 lojas | R$ 239 | R$ 359 |

Sem faixa acima de 5 lojas. Mecânica de conversão: primeiros 10-30 assinantes travam o preço fundador vitalício — gancho de urgência/escassez.

**Opção B — como está hoje no protótipo da landing page (por loja, 2 faixas)**:
- Essencial (1-3 lojas): R$197/loja/mês
- Rede (4+ lojas): R$149/loja/mês

Problemas na Opção B, não resolvidos: inclui explicitamente o segmento "4+ lojas" que o Bruno disse não ser o público-alvo; os valores (R$197, R$149) não foram validados na conversa de precificação (que chegou a R$89/149/239); não tem o mecanismo de preço fundador.

**Isso precisa ser decidido antes de fechar a landing page e antes de criar os produtos/preços no Stripe** — os dois caminhos exigem estrutura de produto Stripe diferente (3 preços fixos vs. preço unitário × quantidade de lojas).

## 5. Funil de conversão — MUDOU desde a spec técnica anterior

A spec de 2026-08-24 assumia checkout Stripe no momento do cadastro. **O protótipo da landing page (aprovado nessa parte) usa outro fluxo**: trial de 7 dias, self-serve, só e-mail — sem cartão de crédito no cadastro. O pagamento via Stripe só entra depois do trial, na conversão pra plano pago.

Isso muda o desenho técnico: precisa de um endpoint de "iniciar trial" (cria organização provisória, sem tocar Stripe) separado do endpoint de "converter pra pago" (aí sim cria Stripe Checkout Session). O gate de liberação de acesso real (esperar a Fase 2 do frontend da outra sessão) descrito na spec anterior continua valendo — só muda quando o Stripe entra no fluxo.

**Stripe — estado atual**: Bruno já tem conta Stripe. Ainda não colocou a `STRIPE_SECRET_KEY` (modo teste) no `.env` local. Ainda não criou os produtos/preços no painel Stripe — depende da decisão de precificação (seção 4) antes de criar.

## 6. Auditoria do protótipo da landing page (Claude Design) — 3 decisões pendentes

Protótipo em: projeto Claude Design "Landing Franqueados" (arquivo `Landing Franqueados.dc.html`), também salvo localmente pelo Bruno como `Hub de Operações - Landing.html`. Cópia de referência (HTML decodificado, sem os assets de imagem embutidos) salva junto com este handoff em `docs/superpowers/specs/2026-08-25-landing-prototype-referencia.html`.

Pontos fortes confirmados: estrutura de seções sólida (hero, dores vs. solução, funcionalidades, notificações, simulador interativo funcional de bipagem, seção DISC com seletor interativo, segurança, independência de sistemas da franqueadora, preços, escassez regional, FAQ interativo, CTA final com captura de e-mail). Tecnicamente bem construído.

**Pendência 1 — pricing**: ver seção 4. A página usa a Opção B; decisão de qual opção usar ainda não foi tomada pelo Bruno.

**Pendência 2 — simulador de "Meta hora a hora"**: a seção Simulador mostra, com o mesmo destaque da bipagem, um simulador interativo de "meta hora a hora" (meta de vendas, registro de venda simulada). Isso contradiz a seção 3 (metas está fora do escopo do SaaS). Decisão pendente: remover e substituir por outro demo dos 4 recursos reais, ou o Bruno mudou de ideia e quer metas de volta no produto.

**Pendência 3 — três frases de risco legal/factual**, sugestões de substituição dadas ao Bruno, aguardando aprovação:
- "Backup diário automático" → sugestão: "Backup mensal automático" (ou implementar backup diário de verdade antes de prometer)
- "Conforme LGPD" (selo) → sugestão: tirar o selo, manter só "dados sob seu controle, acesso restrito por conta"
- "Seguindo a portaria do Ministério do Trabalho" (ponto) → sugestão: "registro por GPS e biometria facial, com histórico auditável" (sem citar a portaria, a menos que a conformidade técnica seja implementada de verdade)
- Também vale revisar/remover "escala de equipe" do hero (feature que não existe no sistema).

## 7. Próximos passos sugeridos, em ordem

1. Bruno decide: Opção A ou B de precificação (seção 4).
2. Bruno decide: tira ou mantém o simulador de meta (seção 6, pendência 2).
3. Bruno aprova (ou ajusta) as substituições de texto de risco legal (seção 6, pendência 3).
4. Atualizar o `.dc.html` do Claude Design com as decisões acima.
5. Bruno coloca `STRIPE_SECRET_KEY` (modo teste) no `.env` local — nunca compartilhar o valor em chat/contexto.
6. Criar script `scripts/stripe-setup-planos.js` pra gerar os produtos/preços no Stripe, alinhado com a decisão da seção 4.
7. Implementar backend do funil corrigido (seção 5): endpoint de início de trial (sem Stripe) + endpoint de conversão pós-trial (Stripe Checkout) + webhook de provisionamento automático de organização + gate de liberação de acesso real.
8. Antes de liberar login real de qualquer franqueado pagante: confirmar com a outra sessão (ou verificar diretamente no código) se a Fase 2 do frontend (`webapp/app.js` mandando token de sessão em cada requisição) está de fato concluída.
