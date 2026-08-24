# CLAUDE.md

Contexto para trabalhar neste repositório.

## O que é

Ferramenta interna de controle operacional para duas operações reais do dono: **Cacau Show** (3 lojas físicas — Marambaia/9175, Icoaraci/4304, Mário Covas/9201) e **Faça Amigos**. Processa caixa, ponto e fluxo financeiro reais, todos os dias — trate qualquer mudança em `routes/`, `config/database.js` ou `webapp/app.js` com o cuidado correspondente.

## Arquitetura atual (single-tenant)

- `webapp/app.js` (~15.500 linhas): frontend inteiro, vanilla JS, sem build. SPA por toggle de `<div class="tab-panel">`. Gate central de módulo em `iniciarModuloBase()`. Dados de loja/pessoa hoje são objetos literais hardcoded no topo do arquivo — não uma config carregada do backend.
- `routes/*.js` + `services/*.js`: backend Express. Cacau Show e Faça Amigos convivem no mesmo processo/rotas, diferenciados por paths separados (`/registros` vs `/registros-fa`) ou por convenção, não por um campo de negócio consistente — exceção é `routes/auditoria-docs.js`, que usa `NEGOCIOS_VALIDOS` + campo `negocio` validado no servidor.
- `config/database.js`: schema completo (27 tabelas), dual-mode Postgres/SQLite conforme `DATABASE_URL` estar definida.
- Auth: PIN de 4 dígitos, sem sessão/token — o servidor confia no `usuario` enviado pelo cliente em cada request. Não tratar isso como autenticação real ao adicionar novos endpoints sensíveis.

Há um plano de arquitetura em avaliação para transformar isto em SaaS multi-tenant (ver conversa/plano salvo em `C:\Users\bruno\.claude\plans\`). Não iniciar trabalho nessa direção sem confirmar com o dono qual fase está em execução.

## Convenções

- Sem build step no frontend — `webapp/app.js` é servido direto.
- Testes: `npm test` roda `tests/hostile-qa.test.js` (`node --test`).
- Nunca commitar `.env` (já no `.gitignore`); usar `.env.example` como referência de quais chaves existem.
- SQLite local (`database.db`) é o fallback automático de desenvolvimento quando `DATABASE_URL` não está setada — não é necessário Supabase local para rodar o app.
