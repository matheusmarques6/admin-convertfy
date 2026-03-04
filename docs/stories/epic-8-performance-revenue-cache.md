# Epic 8 - Otimizacao de Performance: Cache de Revenue

**Prioridade:** Critica
**Status:** Planning
**PRD:** `docs/prd/performance-optimization.md`
**Objetivo:** Eliminar 100% das chamadas a APIs externas (Klaviyo/Shopify) durante carregamento de paginas. Tempo de carregamento de 30-90s para < 2s (P95).

---

## Contexto

O dashboard e a pagina de lojas fazem chamadas em tempo real para Klaviyo e Shopify a cada carregamento. Com 30+ lojas, sao ~120 requisicoes a API da Klaviyo por carregamento de dashboard. O sistema ja possui um cron que popula tabelas de metricas, mas os endpoints de revenue ignoram esses dados e chamam as APIs diretamente. Alem disso, o cache in-memory (`Map`) eh volatil em ambiente Vercel serverless.

---

## Fases e Stories

### Fase 0 - Correcoes de Seguranca (Pre-requisito)

| Story | Titulo | Status |
|-------|--------|--------|
| 8.1 | Remover debug de credenciais e corrigir cache keys de isolamento | Pending |
| 8.2 | Migration dashboard_cache: adicionar org_id, backfill e corrigir RLS | Pending |

### Fase 1 - Quick Wins de Performance

| Story | Titulo | Status |
|-------|--------|--------|
| 8.3 | Deduplicar query de meetings e cachear metadados Klaviyo | Pending |
| 8.4 | Migrar TotalRevenueBanner para SWR | Pending |

### Fase 2 - Expandir Cron para Multiplos Periodos

| Story | Titulo | Status |
|-------|--------|--------|
| 8.5 | Expandir sync-reports para multiplos periodos com batching | Pending |

### Fase 3 - Tabela + Endpoints

| Story | Titulo | Status |
|-------|--------|--------|
| 8.6 | Criar tabela store_revenue_summary com migration | Pending |
| 8.7 | Modificar cron para popular store_revenue_summary | Pending |
| 8.8 | Reescrever endpoints de revenue para ler de store_revenue_summary | Pending |

### Fase 4 - Testes, Monitoramento e UX

| Story | Titulo | Status |
|-------|--------|--------|
| 8.9 | Instrumentacao: X-Response-Time, logging hit/miss e testes de isolamento | Pending |
| 8.10 | UX de transparencia: fetched_at e indicador de sync_status | Pending |

---

## Dependencias entre Stories

```
Fase 0: 8.1 e 8.2 (paralelas, sem dependencias)
  |
  v
Fase 1: 8.3 e 8.4 (paralelas, independentes de Fase 2/3)
  |
  v
Fase 2: 8.5 (depende de Fase 0 concluida)
  |
  v
Fase 3: 8.6 -> 8.7 -> 8.8 (sequenciais, dependem de 8.5)
  |
  v
Fase 4: 8.9 e 8.10 (dependem de 8.8)
```

---

## Criterios de Aceite do Epic

| Criterio | Metrica |
|----------|---------|
| Dashboard carrega rapido | < 2 segundos (P95) |
| Pagina de Lojas carrega rapido | < 2 segundos (P95) |
| Zero calls externas em request | 0 API calls Klaviyo/Shopify durante carregamento |
| Isolamento entre tenants | Teste com 2 orgs simultaneas passa |
| Dados atualizados | Maximo 30 minutos de defasagem |
| Consistencia numerica | Divergencia < 1% vs Klaviyo API direta |
| Sem campos sensiveis em logs | Zero ocorrencias de API keys |
| Transparencia para usuario | `fetched_at` visivel na UI |

---

## Changelog

| Data | Mudanca | Autor |
|------|---------|-------|
| 2026-02-28 | Epic criado com 10 stories | @sm (River) |
