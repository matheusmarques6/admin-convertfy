# Epic 41 — Portal Campaign Calendar Metrics

## Objetivo

Enriquecer o calendario de campanhas do portal do cliente com metricas de performance Klaviyo (open rate, click rate, bounce rate, RPR, AOV) que ja existem na tabela cache `klaviyo_campaign_metrics`, eliminando chamadas diretas a API Klaviyo.

## Problema

O portal do cliente (`src/app/client/campaigns/page.tsx`) exibe apenas contagens brutas (recipients, opened, clicked, converted, revenue) da tabela `campaigns`. Os dados ricos do Klaviyo ja existem na tabela `klaviyo_campaign_metrics` — populada pelo cron — mas nao estao expostos ao portal. O dashboard da agencia ja mostra esses dados ricos.

## Decisoes Arquiteturais

- **RPC SQL** (nao query builder) — `DISTINCT ON` nao e expressavel no Supabase JS
- **Deduplicacao**: `DISTINCT ON (store_id, campaign_id) ORDER BY fetched_at DESC` — mais recente ganha
- **2 endpoints separados** (lista + detalhe) — evita over-fetching no carregamento do calendario
- **ZERO chamadas Klaviyo do portal** — read-only sobre cache
- **Isolamento tenant via `store_id`** (nao `org_id`) — clientes do mesmo org sao separados
- **Helper `resolvePortalClient()`** — extraido para reuso por todos endpoints portal

## Stories

| # | Story | Prioridade | Fase | Status |
|---|-------|------------|------|--------|
| 41.1 | DB Migration + RPC | Critical | 1 - Backend | Draft |
| 41.2 | API Routes + Auth Helper | Critical | 1 - Backend | Draft |
| 41.3 | Hook + Tipos Frontend | High | 2 - Frontend | Draft |
| 41.4 | UI — Modal, Cards, Stats | High | 3 - UI | Draft |

## Dependencias

```
41.1 (migration + RPC) ──> 41.2 (API routes usam RPC)
                            │
                            ├──> 41.3 (hook consome API)
                            │     │
                            │     └──> 41.4 (UI usa hook + tipos)
                            │
                            └──────────────────┘
```

- 41.1 DEVE ser deployed antes de 41.2
- 41.2 DEVE estar merged antes de 41.3
- 41.3 e 41.4 podem ser desenvolvidas em paralelo se tipos forem definidos primeiro (41.3)

## Seguranca (cross-cutting)

- JOIN filtra por `store_id` E `campaign_id` (nunca so `campaign_id`)
- `store_id` validado contra `clientStoreIds` ANTES de acessar cache
- Campos internos (`org_id`, `period_start`, `period_end`) NAO expostos na resposta
- Portal user com `is_active = false` retorna 401 antes de qualquer query
- Passar `store_id` de outro cliente retorna array vazio (nao 403)

## Referencias

- Dashboard campanhas: `src/app/admin/campaigns/page.tsx`, `calendar-grid.tsx`
- CampaignsTab com metricas: `src/components/stores/store-detail-tabs.tsx` (linhas 534-646)
- Cache Klaviyo: `src/app/api/integrations/klaviyo/campaigns/route.ts`
- Schema `klaviyo_campaign_metrics`: `supabase/migrations/20250213_advanced_reporting.sql`
- Portal campaigns atual: `src/app/client/campaigns/page.tsx`, `src/app/api/portal/campaigns/route.ts`

## Change Log

| Data | Autor | Mudanca |
|------|-------|---------|
| 2026-03-13 | @sm | Epic criado a partir de spec de upgrade do calendario portal |
