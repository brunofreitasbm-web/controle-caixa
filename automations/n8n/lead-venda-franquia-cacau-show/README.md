# Lead — Venda de Franquia Cacau Show (n8n)

Automação n8n que monitora `gestaomarambaia@gmail.com`, extrai os dados de um lead recebido por e-mail, enriquece com dados públicos (CNPJ na Receita Federal via BrasilAPI) e gera um briefing pronto de venda direcionado às franquias Cacau Show (Marambaia, Icoaraci, Mário Covas), com sugestão de abordagem e rascunho de resposta.

Arquivo do workflow: [`workflow.json`](./workflow.json) — pronto para importar em **Workflows → Import from File** no n8n.

## O que o workflow faz, passo a passo

1. **Gatilho: Novo E-mail de Lead** (Gmail Trigger) — verifica a caixa a cada minuto por e-mails não lidos que casem com o filtro configurado (por padrão: assunto contendo "lead" ou "franquia", ou com o label `leads-franquia`).
2. **Preparar Dados do E-mail** — extrai remetente, assunto, data e corpo (texto puro, removendo HTML se necessário).
3. **Prompt: Extração de Lead** + **IA: Extrair Dados do Lead** — chama a API da Anthropic (Claude) para transformar o e-mail em JSON estruturado: nome, e-mail, telefone, cidade/UF, empresa, CNPJ, capital disponível, experiência prévia, motivação, origem provável, resumo da mensagem e urgência percebida.
4. **Tem CNPJ?** → se o lead mencionou CNPJ ou nome de empresa identificável, consulta a **BrasilAPI** (`https://brasilapi.com.br/api/cnpj/v1/{cnpj}`), que é um espelho público e gratuito da base de CNPJ da Receita Federal — não exige chave de API. Traz razão social, nome fantasia, situação cadastral, atividade principal, município/UF, data de abertura e capital social.
5. **Consolidar Dados Enriquecidos** — junta os dados do lead com os dados públicos da empresa (se houver).
6. **Prompt: Briefing de Venda** + **IA: Gerar Briefing de Venda** — segunda chamada à IA, agora com o perfil resumido das 3 lojas à venda embutido no prompt (ver abaixo), pedindo: score do lead (quente/morno/frio), perfil provável do comprador, qual loja recomendar, argumentos de venda específicos, pontos de atenção/objeções prováveis, próximo passo recomendado e um rascunho de resposta ao lead.
7. **Montar E-mail Interno (HTML)** + **Enviar Briefing Interno** — envia para `gestaomarambaia@gmail.com` um e-mail formatado com todo o briefing, pronto para leitura rápida antes de responder ao lead.
8. **Tem E-mail do Lead?** → se o lead informou e-mail, cria automaticamente um **rascunho** (não envia sozinho) de resposta na caixa do Gmail, usando o texto sugerido pela IA — para você revisar e enviar com um clique.

## Por que esse desenho

- **Dois nodes de IA em vez de um só**: o primeiro só extrai dados (tarefa objetiva, prompt curto); o segundo já recebe dados limpos + contexto de negócio para gerar a recomendação de venda. Isso deixa cada prompt mais confiável e fácil de ajustar sem mexer no outro.
- **BrasilAPI em vez de scraping**: é a única fonte de "base de dados aberta" usada aqui que é realmente pública, gratuita e sem risco de bloqueio/CAPTCHA — cobre o pedido de "todas as informações que tiver em base de dados aberta" quando o lead é uma empresa/CNPJ. Se o lead for pessoa física sem CNPJ, esse enriquecimento é pulado (o workflow segue normalmente).
- **Rascunho, não envio automático para o lead**: a IA nunca manda e-mail direto para um estranho sem revisão — ela prepara o rascunho, você aprova.

## Perfil das lojas usado no prompt de briefing (ajustar conforme necessário)

Resumo tirado de `contexto_cacau_show.md` (dados de agosto/2026 — **atualize se muito tempo tiver passado**):

| Loja | Código | Perfil | Ângulo de venda no prompt |
|---|---|---|---|
| Marambaia | 9175 | Maior faturamento da rede, mas com acordo de dívida em renegociação e histórico de atraso | Maior receita/ativo mais valioso; comprador precisa negociar a dívida |
| Icoaraci | 4304 | Melhor margem da rede, sem dívida em aberto | Loja mais saudável e eficiente; menor risco, boa porta de entrada |
| Mário Covas | 9201 | Menor loja, único resultado negativo hoje | Ticket de entrada mais baixo; só faz sentido para quem topa investir em giro/tráfego |

Para editar esse texto, abra o node **Prompt: Briefing de Venda** e edite a constante `systemPrompt`. É o único lugar onde essas informações vivem — mantenha-o atualizado à medida que a situação financeira das lojas mudar (ex.: se a dívida da Marambaia for quitada, ou se decidir não vender a Mário Covas).

**Importante:** o prompt já instrui a IA a nunca citar valores financeiros exatos ao lead sem sua confirmação — o rascunho de resposta gerado é propositalmente genérico nesse ponto.

## Como configurar no n8n

### 1. Importar o workflow
`Workflows → Import from File` → selecione `workflow.json`.

### 2. Credencial do Gmail (`gmailOAuth2`)
Usada em 3 nodes: **Gatilho: Novo E-mail de Lead**, **Enviar Briefing Interno**, **Criar Rascunho de Resposta ao Lead**.
- Crie uma credencial OAuth2 do Gmail autenticada com `gestaomarambaia@gmail.com` (Settings → Credentials → New → Gmail OAuth2 API). Siga o passo a passo do próprio n8n para criar o OAuth Client no Google Cloud Console e autorizar.
- Selecione essa credencial nos 3 nodes acima (o import deixa o campo vazio, é normal).

### 3. Credencial da IA (`httpHeaderAuth` — Anthropic)
Usada em **IA: Extrair Dados do Lead** e **IA: Gerar Briefing de Venda**.
- Crie uma credencial do tipo **Header Auth**: nome do header `x-api-key`, valor = sua chave da API da Anthropic (`console.anthropic.com`).
- Selecione essa credencial nos 2 nodes de IA.
- Custo aproximado: poucos centavos de dólar por lead (dois calls curtos ao modelo `claude-sonnet-5`). Se preferir outro modelo, troque a string `'claude-sonnet-5'` dentro dos nodes **Prompt: Extração de Lead**... na verdade essa string fica nos nodes **IA: Extrair Dados do Lead** e **IA: Gerar Briefing de Venda** (campo `Body` → JSON).

### 4. Ajustar o filtro de quais e-mails contam como lead
No node **Gatilho: Novo E-mail de Lead**, campo `Filters → Search`, o padrão é:
```
is:unread (subject:lead OR subject:franquia OR label:leads-franquia)
```
Isso é uma busca do Gmail. Recomendo criar um **filtro do Gmail** que aplique automaticamente o label `leads-franquia` em e-mails de fontes conhecidas (ex.: notificações de anúncios do Facebook/Instagram, formulário do site, portais de franquia) e trocar a busca para simplesmente:
```
is:unread label:leads-franquia
```
Isso evita que a automação dispare para e-mails que não são leads.

### 5. Testar
- Envie (ou encaminhe) para `gestaomarambaia@gmail.com` um e-mail de teste simulando um lead, com nome, telefone, cidade e uma mensagem de interesse.
- Rode o workflow manualmente (`Execute Workflow`) ou aguarde o polling.
- Confira o e-mail de briefing recebido e o rascunho criado na aba de rascunhos do Gmail.

### 6. Ativar
Depois de validar, ligue o toggle **Active** no canto superior do workflow.

## Extensões fáceis (não incluídas no workflow para manter simples)

- **Log em planilha/CRM**: adicione um node do Google Sheets, Airtable ou HubSpot logo depois de **Parsear Briefing da IA**, gravando `lead` + `briefing` — cria um histórico/funil de leads.
- **Notificação no WhatsApp/Slack** além do e-mail: duplique a conexão saindo de **Parsear Briefing da IA** para um node de WhatsApp Business API ou Slack.
- **Enriquecimento adicional**: se quiser buscar presença do lead/empresa no Google (site, redes sociais), adicione um node HTTP Request para uma API de busca (ex.: SerpAPI, Google Custom Search) entre **Consolidar Dados Enriquecidos** e **Prompt: Briefing de Venda**, incluindo o resultado no JSON consolidado.

## Limitações conhecidas

- O parser de JSON da resposta da IA (`Parsear JSON da IA (Extração)` e `Parsear Briefing da IA`) é tolerante a blocos ```json mas não corrige um JSON realmente malformado — nesse caso o campo `erro_parse: true` aparece no resultado e o texto bruto da IA fica em `raw_resposta_ia`, para você identificar e reenviar/ajustar o prompt.
- A consulta à BrasilAPI só roda quando a IA extraiu um CNPJ do e-mail; ela não tenta adivinhar o CNPJ a partir do nome da empresa.
- Nomes de campos dos nodes do Gmail podem variar ligeiramente entre versões do n8n. Se o import reclamar de algum parâmetro, abra o node manualmente — a lógica e os textos de prompt acima continuam valendo, só a UI de configuração muda.
