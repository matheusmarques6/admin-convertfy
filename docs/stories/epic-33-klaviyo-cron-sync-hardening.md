# Epic 33 — Klaviyo Cron Sync Hardening

## Resumo

Conjunto de melhorias no cron `sync-reports` identificadas durante triage de logs de producao. Corrige bugs de dados (engagement rate >100%), adiciona protecoes no banco (CHECK constraints), otimiza uso de rate limits (agrupamento por API key), elimina chamadas desperdicadas (skip de lojas sem acesso), e fecha race condition no lock de concorrencia.

## Escopo

| Story | Titulo | Prioridade | Esforco | Dependencia |
|-------|--------|------------|---------|-------------|
| 33.1 | Fix Engagement Rate >100% | Critica | Baixo | - |
| 33.2 | Add DB CHECK Constraint for Engagement Rate | Alta | Baixo | 33.1 deployed |
| 33.3 | Group Cron Batching by API Key | Alta | Medio | - |
| 33.4 | Auto-Skip Stores Without Reporting Access | Alta | Baixo | - |
| 33.5 | Fix Cron Lock Race Condition | Media | Baixo | - |

## Dependencias

```
33.1 ──► 33.2 (33.1 MUST be deployed first)
33.3, 33.4, 33.5 — independentes entre si e de 33.1/33.2
```

## Arquivos Principais

- `src/lib/services/klaviyo-sync.service.ts` — audience fetching (cron)
- `src/lib/services/klaviyo-performance.service.ts` — audience fetching (portal)
- `src/app/api/cron/sync-reports/route.ts` — cron orchestration, batching, lock
- `supabase/migrations/` — CHECK constraints migration

## Contexto de Producao

Evidencias coletadas do log de producao (2026-03):
- Engagement rates: 129% (Almira), 135% (Vivazz), 324% (Karm)
- Rate limit 429: Karm/15d, Vivazz/15d, Blue Wolf/15d, Blue Wolf/90d — todas compartilham API keys
- Stores sem acesso: Almira (missing `accounts:read`), ToysLand (missing `metrics:read`) — falham every cycle
- Lock race: 2 invocacoes concorrentes do cron observadas em horarios de pico
