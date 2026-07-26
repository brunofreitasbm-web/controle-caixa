# Roteiro Make.com — Pós-Visita FaçaAmigos (1h/2h)

Automação que lê o "RELATÓRIO DE VENDAS" recebido por e-mail todo dia (entre ~21h30 e 22h30), extrai as sessões em que a criança ficou mais de 1h no playground, e envia esses registros para o Controle-Caixa, onde o operador dispara as mensagens de WhatsApp no dia seguinte (10h-12h).

Monte um cenário no Make.com com os módulos abaixo, na ordem indicada.

## 1. Trigger — Watch e-mails (Gmail)

- Módulo: **Gmail → Watch emails** (ou o app de e-mail que a caixa `brunofreitasbm@gmail.com` usa).
- Pasta/label: Inbox.
- Filtro do próprio módulo (ou um filtro logo depois, no Router/Filter do Make):
  - `From` contém `suporte@safeplay.com.br`
  - `Subject` contém `RELATÓRIO DE VENDAS`
- Agendamento do cenário: como o e-mail chega historicamente entre 21h30 e 22h30, configure o schedule do cenário para rodar a cada 15 minutos **apenas nessa janela** (ex. das 21h15 às 23h00). Não precisa rodar o dia inteiro — isso economiza operações do Make.

## 2. Extrair o link de download

- Módulo: **Tools → Set variable** (ou direto num campo de texto do módulo seguinte) usando uma função regex sobre o corpo do e-mail (`{{1.textPlain}}` ou `{{1.textHtml}}`), por exemplo:
  ```
  {{match(1.textPlain; "https?://[^\s\"']+")}}
  ```
- Guarde o resultado numa variável, ex. `link_planilha`.

## 3. Baixar o arquivo .xlsx

- Módulo: **HTTP → Get a file**.
- URL: `{{link_planilha}}`.
- Método: GET.
- Isso retorna o arquivo binário `sales-xxxxxx.xlsx` para o próximo módulo.

## 4. Ler as linhas da planilha

Duas alternativas (use a que estiver disponível na sua conta Make):

**Opção A — módulo nativo de planilha do Make**, se disponível na sua conta (ex. um módulo de "Spreadsheet"/"Excel" que aceita um arquivo binário e devolve linhas). Aponte a saída do HTTP (passo 3) como entrada.

**Opção B — upload temporário + leitura**, se a conta não tiver um módulo direto de XLSX:
1. **Google Sheets → Upload a file** (ou OneDrive/Google Drive), convertendo o .xlsx enviado no passo 3 para uma planilha do Google.
2. **Google Sheets → Search Rows**, lendo a planilha recém-criada e devolvendo as linhas como um array de objetos.
3. Opcional: um módulo para excluir o arquivo temporário depois de processado, mantendo o Drive limpo.

Cada linha deve expor os campos: `data`, `cliente`, `numero_cliente`, `tempo_total_session` (em minutos), `crianca`.

## 5. Filtrar por tempo > 60 minutos

- Módulo: **Filter** (ou a condição de filtro logo na saída do iterador do passo 4).
- Condição: `tempo_total_session` **Maior que** `60`.

## 6. Agregar as linhas filtradas num array

- Módulo: **Array Aggregator**, agregando a saída filtrada do passo 5 num único array JSON, no formato:
  ```json
  [
    {
      "dataSessao": "2026-07-25",
      "cliente": "Nome do Responsável",
      "numeroCliente": "5591999998888",
      "crianca": "Nome da Criança",
      "tempoTotalMinutos": 95
    }
  ]
  ```
- Atenção ao campo `numeroCliente`: deve conter só dígitos, no formato internacional `55` + DDD + número (sem espaços, traços ou parênteses), porque o Controle-Caixa usa esse valor direto para montar o link do WhatsApp (`wa.me/<numero>`). Se a planilha vier com o telefone formatado (ex. `(91) 99999-8888`), normalize com uma função `replace`/regex antes de agregar.

## 7. Enviar para o Controle-Caixa

- Módulo: **HTTP → Make a request**.
- Método: `POST`.
- URL: `https://controle-caixa-4u0w.onrender.com/api/pos-visita/importar`
- Headers:
  - `Content-Type: application/json`
  - `Authorization: Bearer 5d6ec1c08b2465d6f1f1f521fb6c159e87dbf046691a99d7`

  *(esse é o valor de `POS_VISITA_IMPORT_SECRET` — já está configurado no `.env` local; falta adicionar essa mesma variável no Render, veja a seção 9 abaixo)*
- Body (raw JSON):
  ```json
  { "registros": {{7.array}} }
  ```
  (referenciando o array agregado no passo 6)

O endpoint já faz a deduplicação (não duplica registro se o cenário rodar de novo para o mesmo dia/cliente/criança) e um filtro extra de segurança (só aceita `tempoTotalMinutos > 60`).

## 8. Configurar o secret no Render (passo a passo)

O servidor só aceita o `POST /importar` se o header `Authorization` bater com a variável de ambiente `POS_VISITA_IMPORT_SECRET` — sem isso configurado no Render, o endpoint aceita qualquer chamada (menos seguro, mas não quebra nada). Pra ativar a proteção:

1. Acesse [dashboard.render.com](https://dashboard.render.com) e entre no serviço `controle-caixa-4u0w`.
2. No menu lateral do serviço, clique em **Environment**.
3. Clique em **Add Environment Variable**.
4. Key: `POS_VISITA_IMPORT_SECRET` / Value: `5d6ec1c08b2465d6f1f1f521fb6c159e87dbf046691a99d7` (mesmo valor já usado no header do Make e salvo no `.env` local).
5. Salve — o Render reinicia o serviço sozinho aplicando a variável nova.
6. Confirme que voltou a responder acessando `https://controle-caixa-4u0w.onrender.com` normalmente depois do restart.

## 9. Tratamento de erro / observações

- Adicione um **Error Handler** no módulo HTTP do passo 3 e do passo 7: se o download falhar ou o Controle-Caixa não responder 200, envie uma notificação (e-mail ou Slack) para o Bruno avisando que a importação do dia falhou.
- Se o e-mail não chegar na janela esperada (21h30-22h30), o cenário simplesmente não encontra nada para processar nessa execução — não é necessário tratamento especial, mas vale um alerta caso o Bruno queira ser avisado quando 2-3 dias seguidos não chegar relatório nenhum.
- Teste o cenário rodando manualmente ("Run once") com um e-mail antigo antes de deixar o agendamento automático ativo, para confirmar que o parsing do XLSX e o POST final estão funcionando.
