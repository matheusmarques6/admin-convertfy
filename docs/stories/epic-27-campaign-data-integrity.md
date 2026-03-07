# Epic 27 — Campaign Data Integrity: Dados Zerados e Cache Inconsistente

## Contexto

Todos os consumidores de dados de campanha Klaviyo (admin dashboard, portal dashboard, store detail, client detail, calendar) mostram dados **zerados** ou **antigos/errados**. A investigacao cruzada (DBM, Arquiteto, QA) identificou 4 causas raiz criticas e 6 contribuidores.

## Causas Raiz Identificadas

| ID | Bug | Severidade | Impacto |
|----|-----|-----------|---------|
| R1 | Cache key mismatch: endpoints leem por `period_start/period_end`, cron escreve por `period_label` | CRITICO | Cache miss 100% nos endpoints de campaigns/flows |
| R2 | Timezone mismatch: `parseDateRange()` (UTC) vs `parseDateRangeInTimezone()` (Sao Paulo) | CRITICO | Datas diferem 1 dia, cache nunca casa |
| R3 | Campaign report retorna null por rate limit, revenue escrita como 0 | CRITICO | $0 campaign revenue em todas as lojas |
| R4 | Live endpoint nao escreve `period_label` nem `org_id` no cache | CRITICO | Portal nunca encontra dados escritos pelo live |
| C1 | `upsertSyncError` sobrescreve dados validos com zeros apos expiracao | ALTO | Revenue vai para $0 quando cron falha |
| C2 | Rate limiting impede sync completo (60+ calls, ~1 req/s) | ALTO | Periodos 15d e 90d quase nunca completam |
| C3 | 3 fetches paralelos no frontend causam rate limit cascata | MEDIO | Erro em cascata nas 3 chamadas |
| C4 | `opens` (total) no cron vs `opens_unique` no live | MEDIO | Open/click rates inconsistentes |
| C5 | Expired summaries deletadas, criando buracos de dados | MEDIO | Ciclo de perda de dados |
| C6 | Calendar mostra tudo como "draft" com metricas zero | MEDIO | Calendar inutilizavel |

## Stories

| Story | Titulo | Resolve | Prioridade |
|-------|--------|---------|------------|
| 27.1 | Unificar cache lookup por `period_label` | R1, R4 | P0 |
| 27.2 | Serializar chamadas API no cron | R3, C2 | P0 |
| 27.3 | Padronizar timezone em todos os endpoints Klaviyo | R2 | P0 |
| 27.4 | Padronizar `opens_unique` vs `opens` em cron e live | C4 | P0 |
| 27.5 | Proteger dados validos de sobrescrita no cron | C1, C5 | P1 |
| 27.6 | Fix calendar status mapping + metricas | C6 | P1 |
| 27.7 | Reduzir fetches paralelos no frontend | C3 | P2 |

## Arquivos Criticos

```
src/app/api/cron/sync-reports/route.ts
src/lib/services/klaviyo-sync.service.ts
src/lib/services/sync-persistence.service.ts
src/app/api/integrations/klaviyo/campaigns/route.ts
src/app/api/integrations/klaviyo/flows/route.ts
src/app/api/dashboard/total-revenue/route.ts
src/app/api/portal/dashboard/route.ts
src/app/api/clients/[id]/performance/route.ts
src/lib/hooks/use-store-performance.ts
src/lib/shared/data-status.ts
```

## Ordem de Execucao

```
P0 (paralelo): 27.1 (cache key) + 27.2 (serialize) + 27.3 (timezone) + 27.4 (opens unique)
  |
  v
P1 (sequencial): 27.5 (proteger dados) → 27.6 (calendar)
  |
  v
P2: 27.7 (frontend fetches)
```

As 4 stories P0 podem ser implementadas em paralelo (arquivos diferentes). As P1 dependem das P0. A P2 e independente mas menos urgente.

## QA Review Notes

- **27.2**: Preservacao de revenue quando `campaignDataAvailable === false` ja existe em `sync-persistence.service.ts` (linhas 91-125). Story simplificada para focar na serializacao do `Promise.all`.
- **27.4**: Promovida a P0 — sem dependencia funcional de 27.1/27.2 (arquivos diferentes).
- **27.5**: `upsertSyncError()` esta em `src/app/api/cron/sync-reports/route.ts`, NAO em `sync-persistence.service.ts`.
- **27.3**: Adicionado `report-summary.ts` ao scope (tambem usa `parseDateRange`).
- **27.6**: Tipo `KlaviyoCampaignItem` definido em `klaviyo-performance.service.ts`, nao em `types/`.
