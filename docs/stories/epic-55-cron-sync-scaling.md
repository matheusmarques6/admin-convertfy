# Epic 55 — Cron Sync Scaling (42 Lojas em <240s)

## Resumo do Problema

O cron `sync-reports` roda a cada 30 minutos com limite de 240s (Vercel Pro max 300s). Com 42 lojas com credenciais Klaviyo e 4 periodos por loja (7d, 15d, 30d, 90d), o cron so consegue processar ~20 lojas antes do timeout. As 22 restantes ficam **sem cache de receita**, causando dados desatualizados no dashboard.

### Causas Raiz

1. **Sem freshness check**: Periodos que ja tem dados frescos sao re-sincronizados desnecessariamente (4 periodos x 42 lojas = 168 syncs por run)
2. **Dados redundantes por API key**: Lojas que compartilham a mesma API key Klaviyo fazem `fetchFlowNames` e `fetchCampaignNames` individualmente, desperdicando ~38 API calls
3. **Double-throttling**: `syncKlaviyoForPeriod` tem sleeps manuais (1000ms + 1500ms) alem do rate limiter global (1200ms) — ~4.5s extras por periodo
4. **Metadata re-fetched**: `accountInfo` e `placedOrderMetricId` tem TTL de 30min no DB cache, mas quase nunca mudam — desperdicam ~24 API calls
5. **Sem priorizacao**: Lojas sao processadas sem considerar quais precisam mais de refresh

### Metricas de Sucesso

- **Cobertura**: 42/42 lojas com dados no cache apos 1-2 runs consecutivos (vs 20/42 atual)
- **Tempo total**: <240s para completar um run completo
- **API calls por run**: Reducao de ~60% no total de chamadas Klaviyo
- **Zero regressao**: Dados existentes continuam corretos

## Stories

| # | Titulo | Prioridade | Esforco | Status | Dependencia |
|---|--------|------------|---------|--------|-------------|
| 55.1 | Period Rotation: Skip Fresh Periods | Critical | Low | Ready for Dev | - |
| 55.2 | Cache flowNames/campNames por API Key Group | High | Low | Ready for Dev | - |
| 55.3 | Eliminar Double-Throttling nos Sleeps | High | Low | Ready for Dev | - |
| 55.4 | Aumentar Metadata Cache TTL | High | Low | Ready for Dev | - |
| 55.5 | Round-Robin por Freshness (Lojas Mais Velhas Primeiro) | Critical | Low-Medium | Ready for Dev | 55.1 |

## Ordem de Implementacao Recomendada

```
55.4 (metadata TTL) ──► menor risco, ganho imediato
55.3 (remove sleeps) ──► maior ganho de tempo por loja
55.2 (cache names)   ──► elimina redundancia por grupo
55.1 (skip fresh)    ──► maior reducao de API calls
55.5 (round-robin)   ──► depende de 55.1, garante cobertura 100%
```

### Justificativa da Ordem

1. **55.4** primeiro porque e a menor mudanca (1 linha de config) com zero risco
2. **55.3** segundo porque remove idle time puro (~18s/loja) sem alterar logica de dados
3. **55.2** terceiro porque compartilha dados entre lojas do mesmo grupo (ja agrupados desde Epic 33)
4. **55.1** quarto porque precisa de query no DB para verificar freshness (mais complexa)
5. **55.5** ultimo porque depende de 55.1 (freshness check) para ordenar corretamente

## Dependencias entre Stories

```
55.4 ─┐
55.3 ─┤── independentes (podem rodar em paralelo)
55.2 ─┘
55.1 ──────► 55.5 (55.5 precisa do freshness check de 55.1 para ordenar)
```

## Arquivos Principais

| Arquivo | Stories |
|---------|---------|
| `src/app/api/cron/sync-reports/route.ts` | 55.1, 55.2, 55.3, 55.5 |
| `src/lib/services/klaviyo-sync.service.ts` | 55.3 |
| `src/lib/cache.ts` | 55.4 |
| `src/lib/integrations/klaviyo/cached-metadata.ts` | 55.4 |
| `src/lib/shared/data-status.ts` | 55.1 (constantes de freshness) |

## Estimativa de Impacto Cumulativo

| Metrica | Antes | Apos 55.4+55.3 | Apos todas |
|---------|-------|-----------------|------------|
| API calls/run | ~168 periodos | ~168 (sem mudanca) | ~65 periodos |
| Tempo/loja | ~25s | ~7s | ~4s |
| Lojas processadas | ~20 | ~34 | 42+ |
| Cobertura | 48% | ~81% | 100% |

## Change Log

| Data | Autor | Mudanca |
|------|-------|---------|
| 2026-03-17 | @sm | Epic e 5 stories criadas |
