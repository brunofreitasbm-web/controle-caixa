# Huboperacoes — Controle de Caixa e Gestão Operacional

Backend + webapp (vanilla JS, sem build step) para controle operacional integrado das lojas **Cacau Show** (3 lojas: Marambaia, Icoaraci, Mário Covas). Inclui fluxo unificado de controle de caixa, ponto/biometria, acompanhamento de metas, auditoria documental, importação de NF-e/inventário e copiloto operacional por IA.

## Stack

- Backend: Node.js + Express (`server.js`, `routes/*.js`, `services/*.js`)
- Banco: Postgres via Supabase (`DATABASE_URL`) com fallback automático para SQLite local (`database.db`) quando `DATABASE_URL` não está definida — ver `config/database.js`
- Frontend: `webapp/app.js`, vanilla JS sem framework, SPA por toggle de painéis
- Deploy: Vercel (API serverless + estático) para o app principal; worker no Render para crons — ver `docs/IA.md`
- IA: multi-provider (Gemini/Groq/OpenRouter) via `IA_PROVIDER`, ver `services/ia.js` e `docs/IA.md`

## Rodando localmente

```bash
npm install
cp .env.example .env   # preencher com credenciais reais (nunca commitar .env)
npm run dev             # ou: npm start
npm test                # tests/hostile-qa.test.js
```

Sem `DATABASE_URL` definida, o app sobe com SQLite local automaticamente — não é necessário Postgres/Supabase para desenvolvimento.

## Documentação adicional

- `docs/IA.md` — regras e comportamento da camada de IA (briefing, copiloto, fallbacks)
- `contexto_cacau_show.md` — dados financeiros de referência das 3 lojas Cacau Show
