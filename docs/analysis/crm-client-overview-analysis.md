# Analise Completa: CRM - Visao Geral do Cliente

**Data:** 2026-02-18
**Modulo:** CRM > Clientes > Visao Geral
**Objetivos:** (1) Reorganizar layout para Performance ficar visivel sem scroll, (2) Corrigir metricas que nao estao sendo populadas

---

## 1. Estado Atual do Layout

### Hierarquia de Componentes (tab "Visao Geral")

```
page.tsx (Server Component)
  |
  +-- Header (nome, status, health score, tags, botoes)
  |
  +-- Tabs
       +-- TabContent "Visao Geral"
            |
            +-- [1] ClientOverview       <-- OCUPA TELA INTEIRA (3 cols + custom fields)
            |     +-- GlowCard: Informacoes de Contato
            |     +-- GlowCard: Resumo Financeiro
            |     +-- GlowCard: Gestao
            |     +-- GlowCard: Campos Personalizados (full-width, condicional)
            |
            +-- [2] ClientPerformanceReview  <-- SO APARECE COM SCROLL
                  +-- Header + Period Selector
                  +-- KPI Cards (4 cols): Klaviyo Rev, Shopify Rev, Campanhas, Faturamento
                  +-- Email Performance (2 cols): Open Rate, Click Rate
                  +-- Tabela: Campanhas Recentes
                  +-- Tabela: Top Flows
```

### Problema de Layout

O `ClientOverview` (grid 3 colunas) ocupa ~400-500px de altura. Com o header da pagina (~150px) e as tabs (~40px), o `ClientPerformanceReview` fica abaixo da dobra (fold) em telas 1080p. O usuario precisa fazer scroll para ver as metricas mais importantes.

### Arquivos Envolvidos

| Arquivo | Papel |
|---------|-------|
| `src/app/(dashboard)/clients/[id]/page.tsx` | Page server component, monta as tabs |
| `src/components/clients/client-overview.tsx` | Grid 3 cols com info contato/financeiro/gestao |
| `src/components/clients/client-performance-review.tsx` | KPIs, taxas email, tabelas campanhas/flows |
| `src/app/api/clients/[id]/performance/route.ts` | API que agrega dados Klaviyo + Shopify + Billing |
| `src/app/api/integrations/shopify/report/route.ts` | API Shopify report (chamada internamente) |
| `src/lib/integrations/klaviyo/` | Client Klaviyo (request, account, metrics) |
| `src/lib/services/credentials.service.ts` | Descriptografa credenciais das lojas |
| `src/lib/hooks/use-api-data.ts` | Hooks SWR (Asaas payments/subscriptions) |

---

## 2. Analise: Layout - Proposta de Reorganizacao

### Objetivo
Trazer os KPIs de Performance para cima, junto com as informacoes do cliente, sem baguncar o layout.

### Opcao A: KPIs no Topo + Info do Cliente Abaixo (RECOMENDADA)

```
TabContent "Visao Geral"
  |
  +-- [1] ClientPerformanceReview (APENAS KPI Cards - 4 cols)
  |     +-- Header com Period Selector
  |     +-- GlowCard: Klaviyo Rev | Shopify Rev | Campanhas | Faturamento
  |     +-- (Open Rate + Click Rate inline nos KPIs, nao cards separados)
  |
  +-- [2] ClientOverview (Info + Financeiro + Gestao - 3 cols)
  |     +-- GlowCard: Contato | Financeiro | Gestao
  |     +-- Campos Personalizados (se existirem)
  |
  +-- [3] Tabelas detalhadas (Campanhas + Flows)
       +-- Campanhas Recentes (tabela)
       +-- Top Flows (tabela)
```

**Vantagens:**
- KPIs ficam imediatamente visiveis ao abrir a tab
- Info do cliente fica logo abaixo (2a prioridade visual)
- Tabelas detalhadas ficam por ultimo (exploracao)
- Sem mudanca de logica, apenas reordenacao

**Implementacao:**
1. Separar `ClientPerformanceReview` em dois sub-componentes:
   - `ClientPerformanceKPIs` - apenas os 4 cards KPI + email rates (compacto)
   - `ClientPerformanceTables` - tabelas de campanhas e flows
2. Na `page.tsx`, reordenar: KPIs > Overview > Tables
3. Integrar Open Rate e Click Rate como sub-metricas dentro dos KPI cards (ao inves de cards separados) para economizar espaco vertical

### Opcao B: Layout Side-by-Side

```
TabContent "Visao Geral"
  |
  +-- Grid 2 colunas:
  |   +-- [Col Esquerda - 60%] ClientPerformanceReview (KPIs + mini-tabelas)
  |   +-- [Col Direita - 40%] ClientOverview (contato + financeiro + gestao empilhados)
```

**Vantagens:** Tudo visivel sem scroll
**Desvantagens:** Cards ficam mais estreitos, pode ficar apertado em telas menores

### Opcao C: Performance Inline no Header

```
Header (nome, status, health) + KPI badges inline
  |
TabContent "Visao Geral"
  +-- ClientOverview (3 cols)
  +-- Tabelas detalhadas
```

**Vantagens:** KPIs sempre visiveis em qualquer tab
**Desvantagens:** Header fica sobrecarregado, mistura concerns

### Recomendacao: Opcao A

A Opcao A e a mais limpa. Mover KPIs para cima e tabelas para baixo. Integrar Open/Click rates nos KPI cards reduz 1 row inteira (~120px).

---

## 3. Analise: Metricas Nao Populadas - Diagnostico

### Fluxo de Dados Completo

```
Frontend (ClientPerformanceReview)
  |
  +-- fetch(/api/clients/[id]/performance?period=30d)
       |
       +-- [API Route] GET handler
            |
            +-- 1. Auth check (requireAuth)
            +-- 2. RLS check (client access)
            +-- 3. Query client_stores (adminClient)
            |     +-- Filtra: client_id + is_active = true
            |     +-- Seleciona: id, store_name, klaviyo_api_key, klaviyo_private_key,
            |                     shopify_store_domain, shopify_access_token
            |
            +-- 4. Para cada loja com Klaviyo:
            |     +-- getStoreCredentials(store.id) -> descriptografa
            |     +-- Verifica: apiKey existente
            |     +-- fetchKlaviyoPerformance(apiKey, startDate, endDate)
            |         +-- getAccountInfo(apiKey) -> timezone
            |         +-- findPlacedOrderMetric(apiKey) -> metric ID para revenue
            |         +-- POST /campaign-values-reports/ (Klaviyo API)
            |         +-- POST /flow-values-reports/ (Klaviyo API)
            |
            +-- 5. Para cada loja com Shopify:
            |     +-- fetch interno /api/integrations/shopify/report
            |         +-- getStoreCredentials -> descriptografa
            |         +-- fetchAllOrders (paginacao cursor-based)
            |         +-- Calcula metricas
            |
            +-- 6. fetchBillingData (invoices + client_charges)
            +-- 7. aggregateTotals (soma todas as lojas)
            +-- 8. Return response
```

### Pontos de Falha Identificados

#### PF-1: Credenciais Nao Configuradas
**Arquivo:** `route.ts:120-121`
```typescript
const hasKlaviyo = !!(store.klaviyo_private_key || store.klaviyo_api_key)
const hasShopify = !!(store.shopify_store_domain && store.shopify_access_token)
```
- Se a loja nao tem credenciais, os flags sao `false` e os dados nao sao buscados
- **Como verificar:** Checar tabela `client_stores` se as colunas de credenciais estao preenchidas
- **Nota:** Credenciais sao encriptadas com prefixo `enc:v1:` - campos com esse prefixo indicam que estao configuradas

#### PF-2: Credenciais Encriptadas mas Chave de Descriptografia Ausente
**Arquivo:** `credentials.service.ts`
- `getStoreCredentials()` descriptografa usando AES-256-GCM
- Se `ENCRYPTION_KEY` nao estiver no `.env`, descriptografia falha silenciosamente
- **Como verificar:** `process.env.ENCRYPTION_KEY` esta definida?

#### PF-3: Query adminClient Retorna Campos Encriptados
**Arquivo:** `route.ts:97-101`
```typescript
const { data: stores } = await adminClient
  .from("client_stores")
  .select("id, store_name, klaviyo_api_key, klaviyo_private_key, shopify_store_domain, shopify_access_token")
  .eq("client_id", clientId)
  .eq("is_active", true)
```
- Aqui o `adminClient` (service role) busca os campos encriptados diretamente
- Os valores retornados sao `enc:v1:...` (encriptados)
- Na verificacao `!!(store.klaviyo_private_key)` o valor e truthy (`"enc:v1:..."` e uma string nao vazia)
- **Isso nao deveria ser problema** - a verificacao deveria funcionar
- Porem, `getStoreCredentials()` e chamada depois para descriptografar - se falhar, cai no catch silencioso

#### PF-4: Catch Silencioso - Erros Klaviyo Engolidos
**Arquivo:** `route.ts:134-136`
```typescript
} catch (err) {
  log.warn("Failed to fetch Klaviyo data for store", { storeId: store.id, error: err })
}
```
- Se a API Klaviyo retorna erro (401, 429, etc.), o erro e logado mas o store fica com `klaviyo: null`
- O frontend mostra KPIs com valor 0 (parece que "nao tem dados")
- **Isso e a causa mais provavel das metricas zeradas**

#### PF-5: Catch Silencioso - Erros Shopify Engolidos
**Arquivo:** `route.ts:160-162`
```typescript
} catch (err) {
  log.warn("Failed to fetch Shopify data for store", { storeId: store.id, error: err })
}
```
- Mesmo problema: erros de Shopify sao engolidos

#### PF-6: Shopify Report Chamado via fetch Interno
**Arquivo:** `route.ts:143-146`
```typescript
const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
const shopifyRes = await fetch(
  `${baseUrl}/api/integrations/shopify/report?store_id=${store.id}&period=${period}`,
  { headers: { cookie: request.headers.get("cookie") || "" } }
)
```
- Chamada interna via HTTP (fetch para si mesmo)
- Se `NEXT_PUBLIC_APP_URL` nao esta configurado e nao esta rodando em localhost:3000, falha
- Em producao/preview, se o URL nao resolve ou o cookie nao e repassado corretamente, retorna 401
- **Risco alto em deploy** - self-fetch pode nao funcionar em serverless (Vercel)

#### PF-7: Loja sem `is_active = true`
- Se lojas estao no banco mas `is_active = false`, nao sao retornadas na query

#### PF-8: Billing Data com Filtro de Data
**Arquivo:** `route.ts:329-345`
- Billing filtra por `due_date` no range do periodo
- Se faturas nao tem `due_date` preenchido ou estao fora do range, somam zero
- Para "today" ou "yesterday", muito improvavel ter faturas

### Diagnostico Resumido

| # | Problema | Probabilidade | Impacto |
|---|----------|---------------|---------|
| PF-1 | Credenciais nao configuradas na loja | Alta | Todas metricas zeradas |
| PF-2 | ENCRYPTION_KEY ausente | Media | Todas metricas zeradas |
| PF-3 | Query retorna campos encriptados | Baixa | N/A (funciona) |
| PF-4 | Erros Klaviyo engolidos | Alta | Metricas Klaviyo zeradas sem feedback |
| PF-5 | Erros Shopify engolidos | Alta | Metricas Shopify zeradas sem feedback |
| PF-6 | Self-fetch Shopify report | Alta | Shopify falha em serverless |
| PF-7 | Loja inativa | Media | Nenhuma loja retornada |
| PF-8 | Billing com filtro de data restritivo | Baixa | Faturamento zerado em periodos curtos |

---

## 4. Plano de Acao

### Fase 1: Diagnostico e Visibilidade de Erros

**Objetivo:** Entender exatamente POR QUE as metricas estao zeradas antes de mexer no layout.

| # | Tarefa | Arquivo | Descricao |
|---|--------|---------|-----------|
| 1.1 | Adicionar error surfacing na API | `route.ts` | Retornar `errors[]` por loja no response (nao engolir) |
| 1.2 | Adicionar error display no frontend | `client-performance-review.tsx` | Mostrar badge de erro por integracao que falhou |
| 1.3 | Verificar credenciais | DB + `.env` | Confirmar que ENCRYPTION_KEY existe e lojas tem credenciais |
| 1.4 | Testar API direto | Browser/curl | Chamar `/api/clients/[id]/performance?period=30d` e inspecionar response |
| 1.5 | Eliminar self-fetch Shopify | `route.ts` | Chamar funcoes do Shopify report diretamente ao inves de fetch HTTP |

### Fase 2: Reorganizacao do Layout

**Objetivo:** KPIs visiveis sem scroll.

| # | Tarefa | Arquivo | Descricao |
|---|--------|---------|-----------|
| 2.1 | Criar `ClientPerformanceKPIs` | Novo componente | Extrair KPI cards + email rates do performance-review |
| 2.2 | Criar `ClientPerformanceTables` | Novo componente | Extrair tabelas de campanhas + flows |
| 2.3 | Reordenar na page | `page.tsx` | KPIs > Overview > Tables |
| 2.4 | Integrar Open/Click Rate nos KPIs | `ClientPerformanceKPIs` | Sub-metricas dentro do card Campanhas/Flows |
| 2.5 | Testar responsividade | Manual | Verificar em 1080p, 1440p, mobile |

### Fase 3: Melhorias de Robustez

| # | Tarefa | Arquivo | Descricao |
|---|--------|---------|-----------|
| 3.1 | Eliminar self-fetch Shopify | `route.ts` | Importar funcoes diretamente (evitar HTTP round-trip) |
| 3.2 | Adicionar cache na performance API | `route.ts` | Cache de 5min para evitar re-fetch constante |
| 3.3 | Retry com backoff no Klaviyo | `route.ts` | 1 retry em caso de 429/500 |

---

## 5. Detalhamento Tecnico por Mudanca

### 5.1 Error Surfacing (Fase 1.1)

**Antes** (erros engolidos):
```typescript
} catch (err) {
  log.warn("Failed to fetch Klaviyo data for store", { storeId: store.id, error: err })
}
```

**Depois** (erros retornados):
```typescript
// Adicionar campo errors no StorePerformance
interface StorePerformance {
  // ... campos existentes
  errors?: Array<{ integration: string; message: string }>
}

// No catch:
} catch (err) {
  log.warn("Failed to fetch Klaviyo data", { storeId: store.id, error: err })
  errors.push({
    integration: "klaviyo",
    message: err instanceof Error ? err.message : "Erro desconhecido"
  })
}
```

### 5.2 Eliminar Self-Fetch Shopify (Fase 1.5 / 3.1)

**Antes:**
```typescript
const shopifyRes = await fetch(
  `${baseUrl}/api/integrations/shopify/report?store_id=${store.id}&period=${period}`,
  { headers: { cookie: request.headers.get("cookie") || "" } }
)
```

**Depois:**
```typescript
// Importar funcoes diretamente do modulo shopify report
import { getShopifyReportData } from "@/lib/integrations/shopify/report"

const shopifyData = await getShopifyReportData(store.id, period)
```

Isso requer extrair a logica do `route.ts` do Shopify para um modulo reutilizavel em `src/lib/integrations/shopify/report.ts`.

### 5.3 Reorganizacao do Layout (Fase 2)

**page.tsx - Antes:**
```tsx
<TabsContent value="overview">
  <div className="space-y-6">
    <ClientOverview client={client} />
    <ClientPerformanceReview clientId={client.id} />
  </div>
</TabsContent>
```

**page.tsx - Depois:**
```tsx
<TabsContent value="overview">
  <div className="space-y-6">
    <ClientPerformanceKPIs clientId={client.id} />
    <ClientOverview client={client} />
    <ClientPerformanceTables clientId={client.id} />
  </div>
</TabsContent>
```

**Nota:** `ClientPerformanceKPIs` e `ClientPerformanceTables` compartilham o mesmo state de dados. Opcoes:
- **Opcao A:** Lift state up - criar um provider/context que faz o fetch e compartilha
- **Opcao B (simples):** Manter tudo em um componente so, mas reorganizar a ordem de renderizacao interna (KPIs primeiro, tabelas depois, com o ClientOverview passado como children ou slot)
- **Opcao C (recomendada):** Usar um hook customizado `useClientPerformance(clientId)` que faz o fetch e retorna os dados. Ambos componentes consomem o mesmo hook (SWR dedup garante 1 fetch so).

### 5.4 Compactar Email Rates nos KPIs

**Antes:** 2 GlowCards separados para Open Rate e Click Rate (ocupam ~120px)

**Depois:** Adicionar como sub-metrica no card "Campanhas & Flows":
```tsx
<GlowCard color="primary" intensity="intense" surfaceClassName="p-6">
  <div className="flex items-center justify-between pb-2">
    <span className="text-sm font-medium text-muted-foreground">Campanhas & Flows</span>
    <Mail className="h-4 w-4 text-primary" />
  </div>
  <p className="text-2xl font-bold">{totalCampaigns + totalFlows}</p>
  <div className="flex gap-3 mt-1">
    <span className="text-xs text-muted-foreground">
      {totalCampaigns} campanhas | {totalFlows} flows
    </span>
  </div>
  <div className="flex gap-3 mt-2 pt-2 border-t border-border/50">
    <span className="text-xs">
      Open: <span className="font-medium text-foreground">{(avgOpenRate * 100).toFixed(1)}%</span>
    </span>
    <span className="text-xs">
      Click: <span className="font-medium text-foreground">{(avgClickRate * 100).toFixed(1)}%</span>
    </span>
  </div>
</GlowCard>
```

---

## 6. Ordem de Execucao Recomendada

```
[Fase 1] Diagnostico (PRIMEIRO - entender o problema real)
  1.1  Verificar .env (ENCRYPTION_KEY)
  1.2  Verificar client_stores no banco (credenciais existem?)
  1.3  Testar API /api/clients/[id]/performance no browser
  1.4  Adicionar error surfacing na API response
  1.5  Mostrar erros no frontend (badges por integracao)

[Fase 2] Layout (DEPOIS de entender os dados)
  2.1  Criar hook useClientPerformance(clientId)
  2.2  Separar KPIs e Tables em componentes
  2.3  Reordenar: KPIs > Overview > Tables
  2.4  Compactar Open/Click Rate nos KPIs
  2.5  Testar responsividade

[Fase 3] Robustez (APOS layout ok)
  3.1  Extrair logica Shopify report para modulo
  3.2  Eliminar self-fetch HTTP
  3.3  Adicionar cache + retry
```

---

## 7. Estimativa de Impacto

### Arquivos que Serao Modificados

| Arquivo | Tipo de Mudanca |
|---------|----------------|
| `src/app/(dashboard)/clients/[id]/page.tsx` | Reordenar componentes |
| `src/components/clients/client-performance-review.tsx` | Refatorar em sub-componentes |
| `src/app/api/clients/[id]/performance/route.ts` | Error surfacing + eliminar self-fetch |
| `src/lib/integrations/shopify/report.ts` | NOVO - logica extraida do route |

### Arquivos que NAO Serao Modificados

| Arquivo | Motivo |
|---------|--------|
| `client-overview.tsx` | Layout continua o mesmo, so muda posicao |
| `credentials.service.ts` | Funciona corretamente |
| `use-api-data.ts` | Hooks existentes continuam |
| `glow-card.tsx` | Design system nao muda |

---

## 8. Riscos e Mitigacoes

| Risco | Mitigacao |
|-------|-----------|
| Metricas zeradas por credenciais ausentes | Fase 1 de diagnostico antes de tudo |
| Self-fetch falha em producao (serverless) | Eliminar self-fetch (Fase 3.1) |
| Layout fica apertado em mobile | Testar responsividade (grid responsivo ja existe) |
| Performance de 2 componentes fazendo mesmo fetch | Hook SWR com dedup (1 fetch compartilhado) |
| Erros Klaviyo 429 (rate limit) | Retry com backoff exponencial |

---

*Documento gerado por Orion (AIOS Master) com analise dos agentes Explore (codebase mapping) + Architect (decisoes de layout) + Dev (implementacao tecnica)*
