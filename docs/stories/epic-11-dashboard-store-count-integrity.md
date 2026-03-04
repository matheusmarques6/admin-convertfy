# Epic 11 - Dashboard Store Count Integrity

**Prioridade:** Alta
**Status:** Planning
**Objetivo:** Corrigir inconsistencia na contagem de lojas com receita no dashboard (mostra 2 vs 4 reais) eliminando 6 root causes + 3 bugs adicionais encontrados na investigacao.

---

## Contexto

O dashboard de revenue mostra numero inconsistente de lojas gerando receita. A investigacao identificou que o problema e multi-causal: o cache ignora lojas com revenue zero, filtros de credenciais divergem entre cron e live fetch, falhas de API sao mascaradas como revenue zero, e `storesCount` tem semantica diferente dependendo do path (cache vs live).

### Root Causes Identificados

**CRITICOS:**
- RC1: Cache so grava lojas com `revenue > 0` — lojas com receita zero nunca entram no `store_revenue_summary`
- RC2: Filtro de credenciais divergente entre cron (`OR(klaviyo_private_key, klaviyo_api_key)`) e live fetch (apenas `klaviyo_private_key`)

**ALTO:**
- RC3: `getKlaviyoRevenueForStore` nao distingue "zero real" de "falha API" — catch retorna `{totalRevenue: 0, currency: "BRL"}`

**MEDIO:**
- RC4: `storesCount` tem semantica diferente em cache path (rows no cache) vs live path (total de lojas com Klaviyo)

**POLISH/DB:**
- RC5: Falta `sync_source` (cron vs live), `updated_at` com trigger, indice composto otimizado
- RC6: Live fetch upsert pode destruir campos de audience do cron (race condition) + timeout 50s descarta lojas silenciosamente

---

## Fases e Stories

### Fase 1 - Integridade (elimina o problema principal)

| Story | Titulo | Prioridade | Complexidade | RC |
|-------|--------|------------|-------------|-----|
| 11.1 | Cache All Stores Including Zero Revenue | P0 | M | RC1 |
| 11.2 | Unify Credential Filter Cron vs Live | P0 | S | RC2 |

### Fase 2 - Resiliencia

| Story | Titulo | Prioridade | Complexidade | RC |
|-------|--------|------------|-------------|-----|
| 11.3 | Distinguish Zero Revenue from API Failure | P1 | M | RC3 |
| 11.4 | Fix storesCount Semantic Divergence | P1 | S | RC4 |

### Fase 3 - Polish + DB

| Story | Titulo | Prioridade | Complexidade | RC |
|-------|--------|------------|-------------|-----|
| 11.5 | DB Migration: sync_source, updated_at, Composite Index | P2 | S | RC5 |
| 11.6 | Race Condition Protection + Timeout Handling | P2 | M | RC6 |

---

## Dependencias

```
11.1 ──> 11.3 ──> 11.5
  │                 │
11.2 ──────────> 11.4 ──> 11.6
```

- 11.1 e 11.2 sao independentes entre si (Fase 1, podem ser paralelas)
- 11.3 depende de 11.1 (precisa do campo sync_status ja preenchido para lojas zero)
- 11.4 depende de 11.2 (filtro unificado garante mesma lista de lojas em ambos paths)
- 11.5 depende de 11.3 (migration adiciona sync_source que 11.3 prepara para usar)
- 11.6 depende de 11.4 e 11.5 (race condition fix usa sync_source + storesCount correto)

---

## Metricas de Sucesso

- Dashboard mostra contagem correta de lojas (4/4, nao 2/4)
- Lojas com revenue zero aparecem no cache com `sync_status: 'ok'`
- Falhas de API aparecem com `sync_status: 'error'` (nao mascaradas como zero)
- `storesCount` identico entre cache hit e live fetch para mesma org

---

## Change Log

| Data | Mudanca | Autor |
|------|---------|-------|
| 2026-03-03 | Epic criado com 6 stories em 3 fases | @sm (River) |
