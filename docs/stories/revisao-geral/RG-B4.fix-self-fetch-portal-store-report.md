---
Prioridade: High
Sprint: 2 - Metricas & Bugs
Assignee: "@dev"
Revisao: "@qa"
Status: Ready for Dev
Epic: "Revisao Geral — Auditoria Completa"
Fase: "2 - Metricas & Bugs"
Esforco: HIGH
---

# Story RG-B4 — Fix Self-Fetch HTTP Anti-Pattern em Portal Store Report

## Story

**Como** engenheiro de infraestrutura,
**Quero** eliminar chamadas HTTP self-fetch no portal store report,
**Para que** nao consumamos slots extras de serverless function e nao arrisquemos deadlock.

## Contexto

### Problema

`/api/portal/stores/[id]/report/route.ts` faz `fetch()` para seus proprios endpoints:
- `fetch(baseUrl/api/integrations/klaviyo/report, ...)`
- `fetch(baseUrl/api/integrations/shopify/report, ...)`

Em Vercel serverless, cada request consome um slot de execucao. A funcao outer fica esperando a inner, que pode estar na fila atras dela. Sob carga, isso causa timeouts.

### Padrao correto

`portal/dashboard/route.ts` ja importa logica diretamente (ex: `syncShopifyForStore`). O mesmo deve ser feito aqui.

## Acceptance Criteria

### AC1: Eliminar self-fetch
- [ ] Importar a logica de report Klaviyo diretamente (extrair service se necessario)
- [ ] Importar a logica de report Shopify diretamente
- [ ] Nao fazer `fetch()` para endpoints do proprio server

### AC2: Manter comportamento identico
- [ ] Response format deve ser o mesmo
- [ ] Error handling deve ser equivalente

## Dependencias

- **FORTE dependencia com RG-A2** (extrair services). Se A2 for executada primeiro, B4 fica trivial (so trocar fetch por import do service).
- **Alternativa sem A2**: usar services EXISTENTES (`klaviyo-sync.service.ts`, `klaviyo-performance.service.ts`) em vez de extrair logica do report route (1433 linhas inline).
- Recomendacao: executar APOS RG-A2 ou usar a alternativa com services existentes.

## Arquivos Afetados

- `src/app/api/portal/stores/[id]/report/route.ts:72-81`
- Se sem RG-A2: reutilizar `src/lib/services/klaviyo-performance.service.ts` e `src/lib/integrations/shopify/report.ts`
