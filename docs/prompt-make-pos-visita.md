# [DESCONTINUADO] Automação Make.com — Pós-Visita

**Status (26/07/2026): descartado a pedido do Bruno.** O cenário `Integration Gmail` (id 5764127) foi **desativado** no Make. A importação do relatório operacional deixou de ser automática por e-mail/Make e passou a ser **manual, via CSV**, direto na tela **PÓS-VISITA** do Controle-Caixa (módulo FaçaAmigos).

Motivo: o link de download do SafePlay expirava em 10 minutos e o polling do Make (mínimo de 15 min no plano Free) não garantia captura a tempo — ver histórico desta conversa. Em vez de resolver isso, o fluxo mudou de vez para upload manual do relatório do dia anterior (CSV), sem depender de e-mail nem de terceiros.

Este arquivo fica só como registro histórico. A documentação viva do fluxo atual está no próprio código (`routes/pos-visita.js`, endpoint `POST /api/pos-visita/importar-csv`) e na tela PÓS-VISITA do app.
