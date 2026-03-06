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

| Story | Titulo | Dependencia | Status |
|-------|--------|-------------|--------|
| **22.2** | Migration DB: indexes + provider_used + HTTP cache | -- (implementar PRIMEIRO) | Done |
| **22.1** | Reordenar providers + freshness + fixes | 22.2 Task 1 (migration) | Done |
| **22.3** | Sync real-time no lookup (tracking sem eventos) | 22.1, 22.2 | Done |
| **22.4** | Integracao Correios (API Rastro) como provider direto | 22.1 | Done |
| **22.5** | Refatorar cascade para Provider Registry | 22.1, 22.2, 22.4 | Done |

> **Ordem de implementacao:**
> 1. 22.2 Task 1 (migration SQL) — ja implementado
> 2. 22.1 (reorder + freshness) — ja implementado
> 3. 22.3 (sync real-time) — independente de 22.4/22.5
> 4. 22.4 (Correios) — independente de 22.3/22.5
> 5. 22.5 (provider order configuravel) — depende de 22.4 (Correios como opcao)
>
> **Ordem de rollback:** Reverter na ordem inversa: 22.5 → 22.4 → 22.3 → 22.1 → 22.2.

## Decisoes Arquiteturais

### Porque NAO usar Strategy Pattern / Scoring / Orchestrator

A revisao de Dev, QA e Arquiteto convergiu em que:
- Strategy pattern com registry para 5 providers e 1 caller = YAGNI
- Scoring dinamico quando ordem fixa e suficiente = premature abstraction
- Circuit breaker in-memory em serverless Vercel = invalido (cold starts)
- "Local provider" como abstraction = um `if` resolve sem query extra

A ordem fixa reordenada resolve ~90% do problema com ~10% do esforco. Se no futuro precisarmos de configuracao por loja ou novos providers, refatoramos em ~2h.

### Nova ordem dos providers (apos 22.4)

```
1. Correios    (se tracking BR, gratis, direto)  -- TOP 1 para lojas BR (22.4)
2. PostNL      (se carrier=postnl + key postnl)  -- carrier-specific
3. Cainiao     (SEMPRE, gratis)                   -- universal free fallback
4. TrackingMore (se key trackingmore)             -- paid, 1500+ carriers
5. 17track     (se key seventeen_track)           -- SEMPRE ULTIMO, mais caro
```

> Apos 22.5, o cascade usa `PROVIDER_REGISTRY` com loop dinamico. A ordem e configuravel via `providerOrder` param (default hardcoded). 17track permanece SEMPRE ultimo via `resolveProviderOrder()` (regra de negocio). Migration/API/UI para config por loja adiados para demanda futura.

### Freshness thresholds

```
pending / info_received  -> 6h
in_transit               -> 4h
out_for_delivery         -> 30min
delivered                -> 30 dias
exception / expired      -> 24h
```
