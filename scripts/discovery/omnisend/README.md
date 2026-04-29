# Omnisend API Discovery — Scripts

> **Status: ARQUIVADO.** Estes scripts foram **endpoints Next.js temporários** (em `src/app/api/dev/omnisend-discovery-*`) usados para mapear a API pública do Omnisend em 2026-04. Foram preservados aqui como referência histórica e ferramenta de re-descoberta.

## Por que arquivar em vez de deletar

1. **Mudanças futuras na API**: a Omnisend pode lançar novas dimensions ou metrics no `/api/analytics/{statistics,reports}`. Quando isso acontecer, esses scripts permitem revalidar em minutos em vez de reconstruir do zero.
2. **Lojas com comportamento diferente**: Azzurro Milano foi a loja-base de discovery. Se uma nova loja (ex: e-commerce que use SMS pesado) apresentar comportamento de API diferente, esses scripts diagnosticam.
3. **Onboarding de devs**: novos contribuidores entendem rapidamente *o que foi tentado* e *por que rejeitamos certas hipóteses*.

## Histórico (cronológico)

| Round | Foco | Resultado-chave |
|-------|------|-----------------|
| **R1** (`r1-full.ts.bak`) | ~140 testes em paralelo cobrindo statistics dimensions/filters/metrics, reports paths, analytics paths, campaign/automation detail | Confirmou 56 paths 404 em `/api/reports/*` e `/api/analytics/*`. Bug: `detailedErrors.slice(0, 40)` cortou os erros mais reveladores. |
| **R2** (`r2-detail-completo.ts.bak`) | Detail individual `/api/campaigns/{id}` + sub-recursos | `/api/campaigns/{id}` retorna apenas config (sem stats, sem revenue). Sub-recursos todos 404. |
| **R3** (`r3-v3-legacy.ts.bak`) | `/v3/campaigns/{id}` com X-API-KEY puro + lista `/v3/campaigns?limit=N` | **Achado importante**: lista `/v3/campaigns` retorna stats inline (sent/opened/clicked/bounced) — substitui N×detail. Mas SEM revenue. |
| **R4** (`r4-analytics-reports.ts.bak`) | Endpoint NOVO `/api/analytics/reports` | 13× 400 mas as mensagens revelaram lista oficial de metrics + schema correto do dateRange (`interval: "custom"` obrigatório). |
| **R5** (`r5-schema-correto.ts.bak`) | `/api/analytics/reports` com schema correto | **JACKPOT**: retornou 200 com `attributedRevenue: 19591.11` + 12 metrics em UMA chamada. Confirmou que dimensions de breakdown (`campaign`, `workflow`, `automation`, `messageType`, `message`, `channel`, `activity`) são todas REJEITADAS. |
| **R6** (`r6-engagement-filter.ts.bak`) | Engagement metrics + filter syntax | 8× 429 (rate limit). Inconclusivo. Mas a doc oficial deixa claro: dimensions disponíveis são apenas `timestamp, channel, activity`, e R5 já provou que `channel`/`activity` rejeitam revenue. |

## O que descobrimos definitivamente (250+ requests)

### ✅ Funciona
- `POST /api/analytics/reports` com `Authorization: Omnisend-API-Key` + `Omnisend-Version: 2026-preview` (sem X-API-KEY)
- 21 metrics aceitos: `sent, sentCost, opened, openedUnique, openRate, clicked, clickedUnique, clickRate, failed, failRate, markedAsSpamUnique, markedAsSpamRate, unsubscribedUnique, unsubscribeRate, attributedOrders, attributedOrdersUnique, attributedOrderRate, attributedRevenue, attributedRevenuePerOrder, attributedRevenuePerSent`
- 10 intervals nomeados: `last7Days, last30Days, last90Days, custom, thisWeek, lastWeek, thisMonth, lastMonth, lastYear, thisYear`
- `GET /v3/campaigns?limit=250` (lista) com `X-API-KEY` retorna stats inline por campanha
- `GET /api/campaigns?limit=N` (preview) retorna config das campanhas
- `GET /api/automations?limit=N` (preview) retorna config das automations

### ❌ NÃO existe (confirmado)
- `/api/reports/*` (sales, revenue, campaigns, etc) — todos 404
- `/api/analytics/*` exceto statistics e reports — todos 404
- `/api/events`, `/api/orders`, `/api/conversions`, `/api/revenue` — 404
- Sub-recursos `/api/campaigns/{id}/{statistics,stats,analytics,revenue,...}` — todos 404
- Sub-recursos `/api/automations/{id}/{...}` — todos 404
- Endpoint `/v3/automations/{id}` — 404 (apenas /v3/campaigns existe no legacy)
- Dimensions: `campaign`, `workflow`, `automation`, `messageType`, `messageID`, `campaignID`, `automationID`, `message`, `type`, `messageSource`, `attribution`, `attributedMessage`, `attributedChannel`, `attributedSource`, `platform`, `source`, `sourceType`, `flow`, `trigger` — todas rejeitadas para revenue metrics
- Parâmetros `?expand=`, `?include=`, `?fields=` — todos "Unknown parameter"

### ⚠️ Limitação crítica

A API pública do Omnisend NÃO expõe **revenue por campanha individual nem revenue por automation individual**. O endpoint `/api/analytics/reports` retorna apenas TOTAIS AGREGADOS (revenue + engagement). Para breakdown, o Omnisend usa endpoints internos privados (não públicos) no painel `app.omnisend.com/reports/sales`.

Por isso a UI do admin-convertfy mostra `—` (não €0,00) nas colunas de receita por linha individual quando a loja usa Omnisend. Klaviyo continua mostrando os valores reais porque lá o breakdown existe via `flow-values-reports` e `campaign-values-reports`.

## Como reativar um round

Se precisar rodar de novo:

1. Copie o conteúdo de `r{N}-*.ts.bak` para `src/app/api/dev/omnisend-discovery-r{N}/route.ts`
2. Renomeie a extensão removendo `.bak`
3. Deploy
4. Acesse `GET /api/dev/omnisend-discovery-r{N}?store_id=<uuid>` autenticado no admin
5. Após análise, mover de volta para `scripts/discovery/omnisend/` e remover o endpoint

## Referências externas

- [Omnisend API docs (2026-preview)](https://api-docs.omnisend.com/v2026-preview/reference)
- Endpoint Reports: `https://api-docs.omnisend.com/v2026-preview/reference/post_analytics-reports`
- Endpoint Statistics: `https://api-docs.omnisend.com/v2026-preview/reference/statistics`

## Sessão de discovery

Discovery realizado entre 2026-04-22 e 2026-04-29.
Loja-base: Azzurro Milano (e-commerce de moda Italiana, ~14k contatos, 9 flows ativos).
