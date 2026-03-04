# PRD: Fix Portal Client Metrics - List Size, Opt-in Rate, Engagement

**Data:** 2026-02-28
**Status:** Draft
**Prioridade:** Alta
**Impacto:** Portal do cliente exibe 3 metricas zeradas, comprometendo a credibilidade do dashboard

---

## 1. Resumo Executivo

Tres metricas do portal do cliente estao permanentemente zeradas: **Tamanho da Lista**, **Taxa de Opt-in** e **Engajamento**. A causa raiz e unica: o servico compartilhado `klaviyo-performance.service.ts` nao busca dados de listas/segmentos do Klaviyo, e o mapeamento no dashboard hardcoda esses valores como `0`.

---

## 2. Diagnostico Detalhado

### 2.1 Fluxo Atual (Quebrado)

```
UI Components                    API Route                         Service
---------------------           --------------------------        ---------------------------
list-health-metrics.tsx  --->   /api/portal/dashboard (GET)  ---> fetchKlaviyoPerformance()
audience-metrics.tsx     --->   mapPerfToPortalKlaviyo()     ---> (NAO busca lists/segments)
analytics/page.tsx       --->   retorna totalLeads=0
footer-stats.tsx         --->   retorna engagedLeads=0
                                retorna engagementRate=0
```

### 2.2 Causa Raiz Unica

No arquivo `src/app/api/portal/dashboard/route.ts`, funcao `mapPerfToPortalKlaviyo()` (linhas 414-467):

```typescript
const mapPerfToPortalKlaviyo = (perf: KlaviyoPerformanceData) => {
  return {
    // ...
    totalLeads: 0,        // <-- HARDCODED ZERO
    engagedLeads: 0,       // <-- HARDCODED ZERO
    engagementRate: 0,     // <-- HARDCODED ZERO
    // ...
  }
}
```

O tipo `KlaviyoPerformanceData` (definido em `klaviyo-performance.service.ts`) nao inclui campos para `totalLeads`, `engagedLeads` ou `engagementRate`. O servico nunca faz chamadas para os endpoints `/lists/`, `/segments/` ou `/profiles/` do Klaviyo.

### 2.3 Contraste com o Report Route (Funciona)

O endpoint `/api/integrations/klaviyo/report/route.ts` JA busca esses dados corretamente usando:

- `getLists(apiKey)` - busca todas as listas com `profile_count`
- `getSegments(apiKey)` - busca todos os segmentos, encontra "Engaged 90d"
- `findEngagedSegmentFromList()` - localiza segmento de engajamento por nome

Essas funcoes estao definidas localmente no report route (nao sao exportadas/compartilhadas).

### 2.4 Metricas Afetadas - Detalhe

| Metrica | Componente UI | Campo no KlaviyoData | Valor Atual | Fonte Necessaria |
|---------|--------------|---------------------|-------------|------------------|
| Tamanho da Lista | `list-health-metrics.tsx:117` | `totalLeads` | `0` | Klaviyo Lists API (`profile_count` da maior lista) |
| Taxa de Opt-in | `list-health-metrics.tsx:123` | `engagementRate` | `0.0%` | Calculado: `engagedLeads / totalLeads * 100` |
| Engajamento | `analytics/page.tsx:171`, `audience-metrics.tsx:80` | `engagementRate` | `0%` | Klaviyo Segments API (segmento "Engaged 90d") |

**Nota sobre "Taxa de Opt-in":** O componente `list-health-metrics.tsx` rotula `engagementRate` como "Taxa de Opt-in" (linha 122-123). Semanticamente isso esta incorreto - opt-in rate seria a taxa de novos inscritos, nao engajamento. Porem, o valor fonte e o mesmo (`engagementRate`), entao a correcao do dado resolve ambos.

---

## 3. Componentes Afetados

### 3.1 Arquivos que EXIBEM as metricas (somente leitura, nao precisam mudar)

| Arquivo | Metricas Usadas |
|---------|----------------|
| `src/app/portal/analytics/list-health-metrics.tsx` | `totalLeads`, `engagementRate`, `openRate`, `clickRate`, `unsubscribeRate`, `delivered`, `emailsSent` |
| `src/app/portal/analytics/audience-metrics.tsx` | `totalLeads`, `engagedLeads`, `engagementRate` |
| `src/app/portal/analytics/page.tsx` | `engagementRate` (KPI card) |
| `src/app/portal/dashboard/page.tsx` | `engagedLeads` (receita por lead) |
| `src/app/portal/dashboard/footer-stats.tsx` | `totalLeads` |
| `src/app/portal/stores/[id]/page.tsx` | `totalLeads`, `engagedLeads`, `engagementRate` |

### 3.2 Arquivos que PRODUZEM os dados (precisam ser alterados)

| Arquivo | Alteracao Necessaria |
|---------|---------------------|
| `src/lib/services/klaviyo-performance.service.ts` | Adicionar busca de lists + segments (totalLeads, engagedLeads) |
| `src/app/api/portal/dashboard/route.ts` | Atualizar `mapPerfToPortalKlaviyo()` para usar novos campos |

### 3.3 Codigo existente reutilizavel

| Funcao | Localizada em | O que faz |
|--------|--------------|-----------|
| `getLists()` | `src/app/api/integrations/klaviyo/report/route.ts:89` | Busca listas com profile_count, fallback individual |
| `getSegments()` | `src/app/api/integrations/klaviyo/report/route.ts:258` | Busca segmentos com profile_count |
| `findEngagedSegmentFromList()` | `src/app/api/integrations/klaviyo/report/route.ts:224` | Encontra segmento "Engaged 90d" por nome |

---

## 4. Solucao Proposta

### 4.1 Abordagem: Enriquecer o KlaviyoPerformanceData

Adicionar campos ao tipo `KlaviyoPerformanceData` e buscar dados de lists/segments dentro de `fetchKlaviyoPerformance()`.

### 4.2 Alteracoes no `klaviyo-performance.service.ts`

1. **Novo tipo** - Adicionar ao `KlaviyoPerformanceData`:
   ```typescript
   // Audience
   totalLeads: number
   engagedLeads: number
   engagementRate: number
   ```

2. **Nova funcao** - Extrair `getLists()`, `getSegments()` e `findEngagedSegmentFromList()` do report route para funcoes exportaveis (ou duplicar simplificadas no service):
   ```typescript
   async function fetchAudienceMetrics(apiKey: string): Promise<{
     totalLeads: number
     engagedLeads: number
     engagementRate: number
   }>
   ```

3. **Chamar** `fetchAudienceMetrics()` dentro de `fetchKlaviyoPerformance()` em paralelo com as outras chamadas (metric-aggregates, campaign/flow reports).

### 4.3 Alteracoes no `dashboard/route.ts`

Atualizar `mapPerfToPortalKlaviyo()`:

```typescript
// ANTES:
totalLeads: 0,
engagedLeads: 0,
engagementRate: 0,

// DEPOIS:
totalLeads: perf.totalLeads,
engagedLeads: perf.engagedLeads,
engagementRate: perf.engagementRate,
```

Atualizar agregacao "all stores" (linhas 580-582):
```typescript
// ANTES:
totalLeads: 0,
engagedLeads: 0,
engagementRate: 0,

// DEPOIS:
totalLeads: klaviyoDataList.reduce((sum, k) => sum + (k.totalLeads || 0), 0),
engagedLeads: klaviyoDataList.reduce((sum, k) => sum + (k.engagedLeads || 0), 0),
// engagementRate recalculado: totalEngaged / totalLeads * 100
```

### 4.4 Estrategia de API Calls

Chamadas adicionais necessarias por store (na pior hipotese):

| Endpoint | Calls | Rate Impact |
|----------|-------|-------------|
| `GET /lists/` | 1-2 (paginado) | Baixo |
| `GET /lists/{id}/?additional-fields[list]=profile_count` | 0-5 (fallback) | Baixo |
| `GET /segments/` | 1-2 (paginado) | Baixo |

Total: ~3-9 chamadas adicionais por store. O rate limiter global (`rate-limiter.ts`) ja serializa chamadas por API key, entao o impacto e controlado.

### 4.5 Cache

Os dados de audience (totalLeads, engagedLeads) sao incluidos no cache `dashboard_cache` existente como parte do `KlaviyoPerformanceData`. Nao e necessario cache adicional.

---

## 5. Dependencias

### 5.1 APIs Externas

| API | Endpoint | Limitacao Conhecida |
|-----|----------|-------------------|
| Klaviyo Lists | `GET /api/lists/` | `page[size]` NAO funciona; `additional-fields` NAO funciona em collection |
| Klaviyo Lists (individual) | `GET /api/lists/{id}/?additional-fields[list]=profile_count` | Funciona para profile_count individual |
| Klaviyo Segments | `GET /api/segments/` | `page[size]` NAO funciona |
| Klaviyo API revision | `2024-10-15` | Header obrigatorio |

### 5.2 Tabelas Supabase

| Tabela | Uso | Alteracao |
|--------|-----|----------|
| `dashboard_cache` | Cache dos dados Klaviyo | Nenhuma (dados novos entram no JSON existente) |
| `client_stores` | Credenciais Klaviyo | Nenhuma |

### 5.3 Funcoes Internas

| Funcao | Modulo | Uso |
|--------|--------|-----|
| `klaviyoRequest()` | `src/lib/integrations/klaviyo.ts` | Todas as chamadas Klaviyo |
| `withConcurrencyLimit()` | `src/lib/integrations/klaviyo.ts` | Limita concorrencia entre stores |
| Rate limiter global | `src/lib/integrations/rate-limiter.ts` | Serializa chamadas por API key |

---

## 6. Riscos e Mitigacoes

| Risco | Probabilidade | Impacto | Mitigacao |
|-------|--------------|---------|-----------|
| Rate limiting ao buscar lists+segments | Media | Metricas zeradas temporariamente | Usar stale cache fallback (ja implementado) |
| `profile_count` retorna 0 em bulk | Alta (comportamento conhecido) | totalLeads = 0 | Fallback individual por lista (ja implementado no report route) |
| Segmento "Engaged 90d" nao existe | Baixa | engagementRate = 0 | Fallback para qualquer segmento com "engaged" no nome |
| Aumento de latencia do dashboard | Baixa | UX mais lento | Chamadas em paralelo + cache existente |
| Cache desatualizado com novos campos | Baixa | Dados antigos sem audience | Cache version bump invalida automaticamente |

---

## 7. Priorizacao e Sequencia de Implementacao

### Fase 1: Extrair funcoes de audience (prereq)
**Estimativa:** 30min
1. Criar funcoes `fetchListsMetrics()` e `fetchSegmentMetrics()` em `klaviyo-performance.service.ts` (baseadas nas funcoes do report route)
2. Adicionar campos `totalLeads`, `engagedLeads`, `engagementRate` ao tipo `KlaviyoPerformanceData`
3. Atualizar `emptyPerformanceData()` com novos campos

### Fase 2: Integrar no fetchKlaviyoPerformance
**Estimativa:** 30min
1. Chamar `fetchListsMetrics()` e `fetchSegmentMetrics()` dentro de `fetchKlaviyoPerformance()`
2. Calcular `engagementRate = engagedLeads / totalLeads * 100`
3. Retornar novos campos no resultado

### Fase 3: Atualizar mapeamento no dashboard
**Estimativa:** 15min
1. Atualizar `mapPerfToPortalKlaviyo()` para usar `perf.totalLeads`, `perf.engagedLeads`, `perf.engagementRate`
2. Atualizar agregacao "all stores" para somar totalLeads/engagedLeads e recalcular engagementRate
3. Incrementar `CACHE_VERSION` para invalidar caches antigos

### Fase 4: Validacao
**Estimativa:** 15min
1. Verificar typecheck (`npm run typecheck`)
2. Verificar lint (`npm run lint`)
3. Testar com um store real via portal
4. Verificar que cache e populado corretamente

**Total estimado:** ~1h30

---

## 8. Criterios de Aceitacao

- [ ] "Tamanho da Lista" exibe o numero real de profiles da maior lista Klaviyo
- [ ] "Taxa de Opt-in" / "Engajamento" exibe a porcentagem de leads engajados (segmento "Engaged 90d" / total leads)
- [ ] Dados aparecem tanto na view de loja individual quanto na view "Todas as Lojas"
- [ ] Dados sao cacheados no `dashboard_cache` e invalidados quando `CACHE_VERSION` incrementa
- [ ] Nenhuma regressao nos demais dados do dashboard (revenue, campaigns, flows)
- [ ] `npm run typecheck` e `npm run lint` passam sem erros

---

## 9. Metricas de Sucesso

| Metrica | Antes | Depois |
|---------|-------|--------|
| Tamanho da Lista no portal | `0` | Valor real (ex: 42,000) |
| Taxa de Opt-in/Engajamento | `0.0%` | Valor real (ex: 28.5%) |
| Leads Engajados (90d) | `0` | Valor real (ex: 12,000) |
| Saude da Lista (score) | Artificialmente baixo (engageScore=0) | Score real baseado em dados reais |

---

*PRD gerado em 2026-02-28 por Orion (aios-master)*
