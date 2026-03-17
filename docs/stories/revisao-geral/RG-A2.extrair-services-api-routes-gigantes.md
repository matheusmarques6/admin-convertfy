---
Prioridade: High
Sprint: 3 - Refatoracao
Assignee: "@dev"
Revisao: "@architect, @qa"
Status: Ready for Dev
Epic: "Revisao Geral — Auditoria Completa"
Fase: "3 - Refatoracao & Tech Debt"
Esforco: HIGH
---

# Story RG-A2 — Extrair Services das API Routes Gigantes

## Story

**Como** desenvolvedor,
**Quero** que API routes contenham apenas auth → validation → service call → response,
**Para que** a logica de negocio seja testavel e reutilizavel.

## Contexto

### Problema

3 API routes concentram logica excessiva:

| Route | Linhas | Conteudo |
|-------|--------|----------|
| `portal/dashboard/route.ts` | 1117 | Cache read, staleness check, synthetic summary, Klaviyo sync, Shopify sync, formatting |
| `integrations/klaviyo/report/route.ts` | 1433 | Report fetching, aggregation, summary, rates calculation |
| `cron/sync-reports/route.ts` | 627 | Lock management, store iteration, credential fetching, sync orchestration |

Estas routes nao sao testaveis unitariamente, definem tipos inline que poderiam estar em `types/`, e misturam orchestration com business logic.

### Padrao existente a seguir

`klaviyo-sync.service.ts` e `klaviyo-performance.service.ts` ja sao bons exemplos de services extraidos.

## Acceptance Criteria

### AC1: Portal dashboard service
- [ ] Criar `src/lib/services/portal-dashboard.service.ts`
- [ ] Extrair: `fetchKlaviyoFromCache()`, `mapCacheToPortalKlaviyo()`, tipos inline
- [ ] Route file deve ficar com ~100-150 linhas (auth + orchestration + response)

### AC2: Klaviyo report service
- [ ] Criar `src/lib/services/klaviyo-report.service.ts`
- [ ] Extrair: logica de aggregation, summary generation, rate calculations
- [ ] Route file deve ficar com ~100-200 linhas

### AC3: Tipos compartilhados
- [ ] Mover tipos inline (`CachedCampaignRow`, `CachedFlowRow`, etc.) para `src/types/`
- [ ] Reutilizar entre services

### AC4: Sem mudanca de comportamento
- [ ] Response format identico antes e apos refatoracao
- [ ] Testes de integracao (se existirem) devem continuar passando

## Notas Tecnicas

NAO refatorar tudo de uma vez. Priorizar:
1. Portal dashboard (mais complexo, mais impacto no portal)
2. Klaviyo report (mais longo, mais reutilizavel)
3. Cron sync (ja bem estruturado, menor prioridade)

## Arquivos Afetados

- `src/lib/services/portal-dashboard.service.ts` — NOVO
- `src/lib/services/klaviyo-report.service.ts` — NOVO
- `src/app/api/portal/dashboard/route.ts` — simplificar
- `src/app/api/integrations/klaviyo/report/route.ts` — simplificar
- `src/types/` — novos type files
