# Epic 22 -- Tracking Provider Ranking (17track Last)

## Objetivo

Reordenar os providers de rastreamento para que 17track seja SEMPRE a ultima opcao, adicionar freshness check para evitar chamadas desnecessarias, e corrigir bugs defensivos existentes. Abordagem minimalista: maximo resultado com minima mudanca.

## Contexto

O sistema atual (`trackWithBestProvider` em `carriers.ts`) tem ordem hardcoded:
1. PostNL (se carrier=postnl + key)
2. Cainiao (se carrier chinesa, free)
3. **17track** (se key) -- PROBLEMA: posicao 3, antes do TrackingMore
4. TrackingMore (se key)

Isso causa consumo desnecessario de creditos 17track quando providers mais baratos resolveriam.

## Problemas Resolvidos

| # | Problema | Severidade | Solucao |
|---|----------|-----------|---------|
| 1 | 17track na posicao 3 de 4 (antes do TrackingMore) | HIGH | Reordenar para posicao 4 (ultima) |
| 2 | Cainiao so tenta se carrier chinesa | MEDIUM | Cainiao tenta SEMPRE (e gratis) |
| 3 | Sem freshness check no sync | MEDIUM | Guard antes do cascade |
| 4 | Sem timeout/AbortController nos fetches | MEDIUM | AbortController inline |
| 5 | `decrypt()` sem try/catch em `resolveCarrierKeys()` | MEDIUM | Wrap defensivo |
| 6 | `trackNumber()` fallback retenta 17track | LOW | Remover fallback orfao |
| 7 | Indexes faltando no DB | MEDIUM | Migration com indexes otimizados |

## Stories

| Story | Titulo | Dependencia |
|-------|--------|-------------|
| **22.2** | Migration DB: indexes + provider_used + HTTP cache | -- (implementar PRIMEIRO) |
| **22.1** | Reordenar providers + freshness + fixes | 22.2 Task 1 (migration) |

> **Ordem de implementacao:** 22.2 Task 1 (migration SQL) ANTES de 22.1.
> O campo `provider_used` usado em 22.1.7 depende da coluna criada em 22.2.1.
> 22.2 Task 2 (Cache-Control) pode rodar em paralelo com 22.1.
>
> **Ordem de rollback:** Reverter 22.1 ANTES de 22.2.
> Se reverter 22.2 com 22.1 ativa, o codigo tentara gravar em `provider_used` que nao existe.

## Decisoes Arquiteturais

### Porque NAO usar Strategy Pattern / Scoring / Orchestrator

A revisao de Dev, QA e Arquiteto convergiu em que:
- Strategy pattern com registry para 5 providers e 1 caller = YAGNI
- Scoring dinamico quando ordem fixa e suficiente = premature abstraction
- Circuit breaker in-memory em serverless Vercel = invalido (cold starts)
- "Local provider" como abstraction = um `if` resolve sem query extra

A ordem fixa reordenada resolve ~90% do problema com ~10% do esforco. Se no futuro precisarmos de configuracao por loja ou novos providers, refatoramos em ~2h.

### Nova ordem dos providers

```
1. PostNL      (se carrier=postnl + key postnl) -- carrier-specific
2. Cainiao     (SEMPRE, gratis)                  -- universal free fallback
3. TrackingMore (se key trackingmore)            -- paid, 1500+ carriers
4. 17track     (se key seventeen_track)          -- SEMPRE ULTIMO, mais caro
```

### Freshness thresholds

```
pending / info_received  -> 6h
in_transit               -> 4h
out_for_delivery         -> 30min
delivered                -> 30 dias
exception / expired      -> 24h
```
