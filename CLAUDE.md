# CLAUDE.md

Contexto para trabalhar neste repositório.

## O que é

Ferramenta interna de controle operacional para as operações reais das 3 lojas físicas **Cacau Show** (Marambaia/9175, Icoaraci/4304, Mário Covas/9201). Processa caixa, ponto, metas e fluxo financeiro integrados diariamente.

## Arquitetura atual

- `webapp/app.js`: frontend em vanilla JS, sem build step. SPA por toggle de `<div class="tab-panel">`.
- `routes/*.js` + `services/*.js`: backend Express modularizado por domínio (caixa, metas, financeiro, auditoria, nfe, ponto).
- `config/database.js`: schema dual-mode Postgres/SQLite conforme `DATABASE_URL`.
- Auth: PIN de 4 dígitos — o servidor valida `usuario` enviado pelo cliente.

## Convenções

- Sem build step no frontend — `webapp/app.js` é servido direto.
- Testes: `npm test` roda `tests/hostile-qa.test.js` (`node --test`).
- Nunca commitar `.env` (já no `.gitignore`); usar `.env.example` como referência.
- SQLite local (`database.db`) é o fallback automático de desenvolvimento quando `DATABASE_URL` não está setada.
