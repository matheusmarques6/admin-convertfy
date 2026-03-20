# Epic 58 — Custom Period Report Data Fixes

## Contexto

Investigacao multi-agente (QA, Data Engineer, Arquiteto) revelou que relatorios de periodo personalizado no admin mostram dados de **flow incorretos** enquanto dados de **campanha estao corretos**.

## Causa-Raiz

Tres bugs interligados formam uma cadeia de falha:

1. **Quota Race Condition** — O rate limiter diario (220 calls XS/dia) descarta silenciosamente a chamada de flow quando a campanha consome a ultima vaga de quota
2. **Cache Poisonado** — Dados parciais (flow=0, campaign=correto) sao escritos no cache com `sync_status='ok'`, servidos por ate 30 dias
3. **Falha Silenciosa** — A funcao retorna `success: true` mesmo quando o flow report falha, sem indicador visual

## Diagnostico Detalhado

| Aspecto | Cron (funciona) | Report Custom (bugado) |
|---------|-----------------|----------------------|
| Quota consumida | 6-12 XS calls/ciclo | N×3 calls/invocacao |
| Deteccao parcial | `flowOk` flag + `sync_status: partial` | Nenhum |
| Cache write | Condicional (`flowDataAvailable`) | Incondicional |
| Quota bypass | `XS_BUDGET_PER_CYCLE` | Sem `force`, sem budget |

## Stories

| Story | Titulo | Prioridade | Esforco | Dependencias |
|-------|--------|-----------|---------|--------------|
| 58.1 | Force quota bypass para reports user-triggered | CRITICAL | LOW | Nenhuma |
| 58.2 | Nao cachear dados parciais em custom ranges | CRITICAL | LOW | Nenhuma |
| 58.3 | Propagar falha parcial ao processador e UI | HIGH | LOW | 58.1, 58.2 |
| 58.4 | Adicionar store_total_revenue ao RPC custom cache | MEDIUM | LOW | Nenhuma |
| 58.5 | Impedir mesmo dia no date picker personalizado | LOW | LOW | Nenhuma |

## Ordem de Execucao

```
Fase 1 (paralelo): 58.1 + 58.2 + 58.5
Fase 2: 58.3 (depende de 58.1 e 58.2)
Fase 3: 58.4 (independente, mas menor prioridade)
```

## Arquivos Criticos

- `src/lib/integrations/klaviyo/report-summary.ts` — funcao principal com os bugs (58.1, 58.2, 58.3)
- `src/lib/integrations/klaviyo/rate-limiter.ts` — quota race condition (58.1)
- `src/app/api/reports/process/route.ts` — processador de reports ignora `flowReportAvailable` (58.3)
- `supabase/migrations/` — RPC `upsert_custom_range_cache` (58.4)
- `src/components/ui/period-picker.tsx` — validacao de data (58.5)
- `src/components/ui/date-range-picker.tsx` — validacao de data (58.5)

## Referencia

- Investigacao: QA (Quinn), Data Engineer, Arquiteto (Aria) — 2026-03-20
- ADR receita: `docs/architecture/adr-klaviyo-revenue-source.md`
- Rate limiter: Epic AK (Marco 2026)
