# Notificações via Telegram

Canal adicional (não substitui e-mail/push) para o grupo do owner.

## Configurar
1. No Telegram, fale com `@BotFather` → `/newbot` → guarde o token.
2. Crie o grupo (restrito ao owner: todos os membros verão faturamento e divergências) e adicione o bot.
3. Mande uma mensagem no grupo e abra `https://api.telegram.org/bot<TOKEN>/getUpdates`; o `chat.id` do grupo é negativo (ex.: `-100123…`).
4. Defina `TELEGRAM_BOT_TOKEN` e `TELEGRAM_CHAT_ID` no ambiente (Vercel/Render). Nunca no repositório.
5. Para pausar sem remover o bot: `configuracoes.telegram_ativo = '0'`.

## O que vai ao grupo
Abertura, divergência na abertura, NFE conferida/divergente (`PUT /api/nfe/:id/status`), fechamento (com foto do envelope), envelopes acumulados ≥ R$ 1.000, NFE pendente, retirada solicitada, `/notificar-gestao` (inventário), briefing 7h, visão 19h, resumo de atraso 22h.

Ficam de fora: lembrete de meta hora a hora (é da colaboradora), backup mensal e folha de ponto (e-mail).

## Implementação
`services/telegram.js` (no-op sem env, nunca lança, timeout 8s). O gancho central é `enviarNotificacaoPushInterno` em `config/notifications.js`; divergência e fechamento chamam `enviarTelegramEvento` diretamente.

## Instância dormindo (Render/Vercel)
`/api/cron/ia-tick` também dispara a visão das 19h (janela 19:00–21:59) e o resumo de atraso (a partir de 22:05), com dedup diária (`marcarSeNovo`) compartilhada com os crons internos: não duplica. O pingador externo precisa continuar chamando o endpoint a cada ~10 min.
