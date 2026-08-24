# Huboperacoes — Controle de Caixa

Backend + webapp (vanilla JS, sem build step) para controle operacional de duas operações: **Cacau Show** (3 lojas: Marambaia, Icoaraci, Mário Covas) e **Faça Amigos**. Inclui controle de caixa, ponto/biometria, metas, fluxo de caixa, importação de NF-e/inventário e briefing/copiloto por IA.

Hoje é uma ferramenta **single-tenant** — todos os dados de loja, funcionários e regras de negócio estão hardcoded no código. Está em avaliação uma rearquitetura para SaaS multi-tenant; ver o plano de arquitetura em andamento antes de propor mudanças estruturais nessa direção.

## Stack

- Backend: Node.js + Express (`server.js`, `routes/*.js`, `services/*.js`)
- Banco: Postgres via Supabase (`DATABASE_URL`) com fallback automático para SQLite local (`database.db`) quando `DATABASE_URL` não está definida — ver `config/database.js`
- Frontend: `webapp/app.js`, vanilla JS sem framework, SPA por toggle de painéis
- Deploy: Vercel (API serverless + estático) para o app principal; um worker separado no Render (free tier) roda os crons de IA — ver `docs/IA.md` para o motivo e o workaround do pinger externo
- IA: multi-provider (Gemini/Groq/OpenRouter) via `IA_PROVIDER`, ver `services/ia.js` e `docs/IA.md`

## Rodando localmente

```bash
npm install
cp .env.example .env   # preencher com credenciais reais (nunca commitar .env)
npm run dev             # ou: npm start
npm test                # tests/hostile-qa.test.js
```

Sem `DATABASE_URL` definida, o app sobe com SQLite local automaticamente — não é necessário Postgres/Supabase para desenvolvimento.

## Variáveis de ambiente

Ver `.env.example` para a lista completa. Nunca commitar `.env` — já está no `.gitignore`.

## Documentação adicional

- `docs/IA.md` — regras e comportamento da camada de IA (briefing, copiloto, fallbacks)
- `contexto_cacau_show.md` — dados financeiros de referência das 3 lojas Cacau Show (ciclos de boleto, sazonalidade)
