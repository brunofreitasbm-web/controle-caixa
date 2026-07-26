# Automação Make.com — Pós-Visita FaçaAmigos (1h/2h)

Este documento descreve o cenário **já construído e ativo** na sua conta Make (`Integration Gmail`, id 5764127, time "My Team"). Ele lê o "RELATÓRIO DE VENDAS" recebido por e-mail todo dia (~21h30-22h30), baixa a planilha, e envia pro Controle-Caixa — que filtra quem ficou mais de 1h e monta a fila de disparo de WhatsApp que o operador usa entre 10h-12h no dia seguinte.

## O cenário (4 módulos)

1. **Gmail → Watch emails**: filtra `from: suporte@safeplay.com.br`, `subject: RELATÓRIO DE VENDAS`, label "Safeplay". Agendado para checar a cada 15 min, só na janela 21h30-22h30 (todo dia).
2. **RegExp → Match pattern (Advanced)**: extrai a primeira URL (`https?://...`) do corpo do e-mail.
3. **HTTP → Get a file**: baixa o arquivo apontado pela URL extraída.
4. **HTTP → Make a request**: `POST` do arquivo baixado (corpo bruto, `Content-Type: application/octet-stream`) para `https://controle-caixa-4u0w.onrender.com/api/pos-visita/importar-planilha-raw`, com header `Authorization: Bearer 5d6ec1c08b2465d6f1f1f521fb6c159e87dbf046691a99d7`.

O parse da planilha (colunas `data`/`cliente`/`numero_cliente`/`tempo_total_session`/`crianca`, tolerante a variação de nome/formato) e o filtro de `>60 min` acontecem **no servidor**, não no Make — não existe módulo nativo de XLSX no Make, então é mais simples e mais barato (em operações) deixar o Make só repassar o arquivo bruto.

## ⚠️ Risco conhecido: o link expira em 10 minutos

O link do relatório é uma URL assinada da AWS S3 com `X-Amz-Expires=600` (10 minutos) a partir do momento em que é gerado. O plano **Free** do Make só permite checar a caixa de entrada a cada **15 minutos** (não existe gatilho instantâneo/webhook para Gmail no Make) — então existe uma janela real em que o link pode expirar antes do Make conseguir baixá-lo.

Decisão do Bruno (25/07/2026): manter assim por enquanto e monitorar pelo histórico de execuções do Make. Se as importações começarem a falhar com frequência, a solução mais confiável é o upgrade para o plano **Core** do Make (~US$9/mês), que libera checagem a cada 1 minuto — folga suficiente dentro da janela de 10 minutos.

## Como conferir se rodou certo

1. No Make, abra o cenário "Integration Gmail" → aba **History**.
2. Depois das 22h30, confira se teve uma execução com sucesso (bolinha verde).
3. Se der erro, abra a execução e veja em qual módulo parou — geralmente será no módulo 3 (Get a file) se o link já tiver expirado.
4. No Controle-Caixa, abra o menu **Pós-visita 1h/2h** no dia seguinte de manhã e confira se a fila foi populada.

## Secret configurado

- `.env` local do Controle-Caixa já tem `POS_VISITA_IMPORT_SECRET=5d6ec1c08b2465d6f1f1f521fb6c159e87dbf046691a99d7`.
- **Falta confirmar** se essa mesma variável está configurada no Render (dashboard.render.com → serviço `controle-caixa-4u0w` → Environment → `POS_VISITA_IMPORT_SECRET`). Sem ela lá, o endpoint aceita chamadas sem autenticação (funciona, mas sem a proteção do secret).
