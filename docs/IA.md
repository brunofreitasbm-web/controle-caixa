# Camada de IA

Documentação da integração de IA do sistema. Tudo passa por `services/ia.js`.

## Configuração

No `.env`:

```
IA_PROVIDER=gemini
GEMINI_API_KEY=<sua chave do AI Studio>
GEMINI_MODEL=gemini-3.5-flash-lite
IA_INTERVALO_MS=4000
IA_TIMEOUT_MS=30000
IA_DESATIVADA=false
```

`IA_DESATIVADA=true` desliga a IA em todo o sistema; todas as funcionalidades
passam a usar seus fallbacks, sem quebrar nada.

### Por que `gemini-3.5-flash-lite` e não `gemini-flash-latest`

O alias `flash-latest` aponta para o Flash de ponta, que é um modelo
*thinking*. Dois problemas concretos, ambos observados em teste:

1. **Cota**: a camada gratuita libera cerca de 20 requisições por janela. Um
   lote de mensagens de aniversário estoura no meio.
2. **Truncamento**: os tokens de raciocínio contam dentro de
   `maxOutputTokens`. O modelo gastava ~700 tokens pensando e devolvia o JSON
   cortado (`finishReason: MAX_TOKENS`).

O `flash-lite` não raciocina e tem cota bem mais folgada. `IA_THINKING_BUDGET`
existe para reativar o raciocínio se algum uso futuro precisar — mas note que
o parâmetro é uma sugestão, não um teto: o modelo pode ultrapassá-lo.

### Trocar de provedor

`services/ia.js` traz adaptadores para `gemini`, `groq` e `openrouter`. Basta
mudar `IA_PROVIDER` e informar a chave correspondente
(`GROQ_API_KEY` / `OPENROUTER_API_KEY`). Nenhuma rota conhece o provedor.

## As quatro regras

1. **A IA sugere, o humano aprova.** Nenhum endpoint de IA escreve em tabela
   de negócio. A auditoria de boletos não baixa boleto; o coach não altera
   bonificação; a escala não muda jornada.
2. **Todo uso tem fallback.** Se a API cair ou a cota estourar, a
   funcionalidade continua com o comportamento determinístico anterior.
3. **Cache no banco** (tabela `ia_cache`). Camada gratuita tem cota diária.
4. **Dados pessoais não saem do servidor.** O provedor recebe primeiro nome e
   números. Telefone, CPF, sobrenome e foto de envelope nunca são enviados.
   `anonimizar()` é a rede de segurança final.

> A camada gratuita dos provedores normalmente permite uso dos dados enviados
> para treinamento. Por isso a regra 4 não é opcional.

## Regra de ouro do cálculo

**Todo número é calculado em JavaScript. A IA só escreve o texto.**

Modelo de linguagem erra aritmética. Valor de bonificação, percentual de meta
e risco de duplicidade são apurados no código e entregues prontos ao prompt.
Quando o cálculo muda no frontend, precisa mudar no serviço correspondente —
senão a tela mostra um número e a IA diz outro.

Corolário prático: mande o contexto como **texto rotulado em português**, não
como JSON cru. Com JSON o modelo copia os nomes dos campos para dentro da
prosa ("sua conversaoAtualPercent de 36.4").

## Endpoints

| Item | Endpoint | Serviço |
|---|---|---|
| 1 | `GET /api/ia/coach?usuario&unidade&competencia` | `ia-coach.js` |
| 2 | `GET /api/ia/briefing?data` | `ia-briefing.js` |
| 3 | `GET /api/ia/boletos/auditoria?data` | `ia-boletos.js` |
| 4 | `GET /api/ia/escala?loja&data&janela` | `ia-escala.js` |
| 5 | `POST /api/ia/mensagem` | `ia-mensagens.js` |
| 6 | `GET /api/ia/copiloto?loja&horaSlot&data` | `ia-copiloto.js` |
| — | `GET /api/ia/status` | diagnóstico |

Todos aceitam `forcar=true` para ignorar o cache (exceto mensagem e copiloto,
que não usam cache por serem sempre únicos).

## Disparos automáticos

- **07:00** (`server.js`) — briefing diário por push e e-mail para Owner e
  Líder de Operação.
- **10 min antes de cada intervalo** (`server.js`) — copiloto de Meta Hora a
  Hora, substituindo o lembrete genérico. Falha volta ao lembrete original.

## Travas de qualidade

Cada serviço tem uma trava determinística que descarta saída ruim:

- **Mensagens**: rejeita flexão de gênero truncada (`dess(a) lind(a)`) e texto
  acima de 900 caracteres. Descartar faz o app usar o template sorteado —
  melhor uma mensagem genérica correta do que uma personalizada malfeita.
- **Copiloto**: rejeita texto acima de 200 caracteres, que a notificação push
  cortaria no meio.
- **Escala**: `MIN_DIAS_HISTORICO` (14 dias). Abaixo disso o serviço **se
  recusa a recomendar** e devolve o que está faltando. Recomendação de escala
  com histórico curto confunde dia atípico com padrão, e isso mexe com a
  jornada de pessoas. Não baixe esse limite em produção.

## Estado dos dados (julho/2026)

O item 4 (escala) está bloqueado pela trava porque:

- `ponto_registros` está **vazia** — não há marcações de ponto.
- `vendas_horarias` está **vazia**.
- `metas_vendas` tem apenas **2 dias** de histórico.

A funcionalidade passa a operar sozinha assim que o registro de Meta Hora a
Hora acumular duas semanas. O ponto é necessário para comparar demanda com
quadro escalado; sem ele, a análise cobre só a demanda e declara isso nas
ressalvas.
