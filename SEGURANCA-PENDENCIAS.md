# Segurança: pendências da auditoria de 2026-11-10

Lista do que **não** foi resolvido pela Onda 1 neste repositório. Nenhum valor de
segredo aparece aqui, só onde está e o que fazer. Apague cada item ao concluir.

## Ações do dono (não dependem de código)

- [ ] Gerar novo par VAPID: a chave privada saía por `GET /api/config` e está em `Backup/` e `database.db.bak-*` no histórico do git.
- [ ] Confirmar `CRON_SECRET` definido na Vercel (sem ele os dois crons ficam abertos).
- [ ] Testar em produção se `/registros.json` e `/Backup/backup_hub_operacoes_2026-08-04.json` respondiam 200 antes do deploy deste PR. Se sim, tratar como dado vazado.

## Onda 2 (muda comportamento, aprovar item a item)

- [ ] **Sessão obrigatória em todas as rotas** (`CACAU_EXIGIR_SESSAO=1` + `sessao.js` global). Hoje caixa, financeiro, NF-e, inventário, metas, vendas, ponto e retiradas aceitam chamadas sem login. Exige o frontend mandar o token em todo fetch e reescrever os testes #1, #2, #4, #6, #7, #8, #10 de `hostile-qa` e os de "modo de transição".
- [ ] Papel e loja conferidos no servidor (hoje `?usuario=Bruno` basta para excluir registro; não há separação entre as lojas 9175/4304/9201).
- [ ] `PUT /registros/:id` ainda aceita `status`, `retiradoPor`, `autorizadoPor` sem login (o frontend usa essa rota).
- [ ] Criação de PIN inicial sem login (`routes/auth.js:364`): só owner logado.
- [ ] Pasta de Auditoria confia em `?actorUsuario=` (`routes/auditoria-docs.js:37`).
- [ ] `/subscribe`, SSE `/events`, `/ia/*`, `/ponto/*` (selfies, GPS e vetor facial) e `/ponto/folha-email` (envio de e-mail aberto) atrás de sessão.
- [ ] Trava de PIN e rate limit de login em banco, não em `Map` (zera a cada cold start na Vercel).
- [ ] CORS restrito à origem de produção; `rejectUnauthorized` ligado no Postgres (`config/database.js:128`).
- [ ] Escapar os demais `innerHTML` de `webapp/app.js` (157 usos; só as tabelas de registros foram cobertas) e adicionar CSP.
- [ ] Token de sessão fora do `localStorage`.
- [ ] Atualizar `pdfjs-dist` (2.16.105) e `xlsx` via CDN (0.18.5); SRI nos scripts de CDN.
- [ ] Trocar `err.message` por mensagem genérica nas respostas.
