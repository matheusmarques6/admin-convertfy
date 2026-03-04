# PRD — Otimização de Performance: Cache de Revenue

**Projeto:** Admin Convertfy
**Data:** 28/02/2026
**Versão:** 2.0 (revisado após análise de Arquiteto, Dev, QA e DBA)
**Prioridade:** Crítica
**Autor:** Equipe de Engenharia

---

## 1. Contexto e Problema

O Admin Convertfy apresenta tempos de carregamento entre 30 e 90 segundos nas páginas de Dashboard, Controle de Lojas e Clientes. A causa raiz é que os endpoints `/api/dashboard/total-revenue` e `/api/stores/control` fazem chamadas em tempo real para as APIs da Klaviyo e Shopify durante o carregamento de cada página.

Com 30+ lojas ativas, cada carregamento de dashboard dispara aproximadamente 120 requisições à API da Klaviyo (4 calls por loja × 30 lojas), processadas com intervalo de 1.2s entre elas pelo rate limiter.

O sistema já possui um cron (`/api/cron/sync-reports`) que roda a cada 2 horas e popula as tabelas `klaviyo_flow_metrics` e `klaviyo_campaign_metrics`. Porém, os endpoints de revenue **não leem dessas tabelas** — fazem chamadas diretamente à API do Klaviyo, ignorando os dados já persistidos.

Adicionalmente, os endpoints usam cache in-memory (`Map<string, ...>` no escopo do módulo) que é **volátil em ambiente Vercel serverless** — cada cold start cria uma nova instância, resultando em hit rate próximo de zero em produção.

---

## 2. Objetivo

Eliminar 100% das chamadas a APIs externas (Klaviyo/Shopify) durante o carregamento de páginas, fazendo os endpoints lerem de dados pré-computados. O tempo de carregamento deve cair de 30-90s para menos de 2s (P95).

---

## 3. Decisão Arquitetural: Opção B — Tabela Dedicada

### 3.1 Por que a Opção A (tabelas existentes) foi descartada

A análise técnica dos 4 especialistas (Arquiteto, Dev, QA, DBA) validou contra o código real que usar `klaviyo_flow_metrics` e `klaviyo_campaign_metrics` como fonte para o dashboard é **inviável**:

**Risco 1 — Períodos incompatíveis (CONFIRMADO):** O cron usa `parseDateRange("30d")` hardcoded na linha 74 de `sync-reports/route.ts`. As tabelas só contêm dados de 30d. Para 7d, 15d ou 90d, não há dados — e os agregados de 30d não podem ser recortados porque a Klaviyo retorna totais do período, não eventos diários.

**Risco 2 — Shopify não coberto (CONFIRMADO):** Não existe nenhuma tabela de revenue Shopify sincronizado. A tabela `order_attribution` existe mas está vazia — nenhum job a popula.

**Risco 3 — Complexidade e dupla contagem (CONFIRMADO e AGRAVADO):** A unique constraint `(store_id, flow_id, period_start, period_end)` permite registros com períodos sobrepostos. Um `SUM(conversion_value)` pode contar o mesmo intervalo duas vezes. Sem índice composto `(store_id, period_start, period_end)`, a query com 250 lojas varreria ~187.500 rows. O campo `org_id` nas tabelas de métricas foi adicionado por backfill sem `NOT NULL`, podendo ser NULL.

### 3.2 Solução: Tabela `store_revenue_summary`

Uma tabela dedicada que armazena revenue pré-agregado por loja e período, populada pelo cron:

```sql
CREATE TABLE IF NOT EXISTS store_revenue_summary (
  -- Chave primária composta — suporta UPSERT direto
  store_id       UUID         NOT NULL REFERENCES client_stores(id) ON DELETE CASCADE,
  period_label   VARCHAR(10)  NOT NULL,

  -- Isolamento multi-tenant — NOT NULL obrigatório
  org_id         UUID         NOT NULL REFERENCES organizations(id),

  -- Intervalo real que o período representa (para debug e reconciliação)
  period_start   TIMESTAMPTZ  NOT NULL,
  period_end     TIMESTAMPTZ  NOT NULL,

  -- Revenue Klaviyo (decomposto por canal)
  klaviyo_total_revenue     NUMERIC(15, 2) NOT NULL DEFAULT 0,
  klaviyo_campaign_revenue  NUMERIC(15, 2) NOT NULL DEFAULT 0,
  klaviyo_flow_revenue      NUMERIC(15, 2) NOT NULL DEFAULT 0,

  -- Revenue Shopify (ground truth)
  shopify_total_revenue     NUMERIC(15, 2) NOT NULL DEFAULT 0,

  -- Controle de qualidade do sync
  sync_status    VARCHAR(20)  NOT NULL DEFAULT 'pending'
                              CHECK (sync_status IN ('ok', 'partial', 'error', 'pending')),
  sync_error     TEXT,

  -- TTL explícito para invalidação
  expires_at     TIMESTAMPTZ  NOT NULL,

  -- Timestamps
  fetched_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  -- Constraints de validação
  CONSTRAINT valid_period_label CHECK (
    period_label IN ('7d', '15d', '30d', '90d')
  ),
  CONSTRAINT valid_period_range CHECK (period_end > period_start),
  CONSTRAINT klaviyo_revenue_non_negative CHECK (
    klaviyo_total_revenue >= 0
    AND klaviyo_campaign_revenue >= 0
    AND klaviyo_flow_revenue >= 0
  ),

  PRIMARY KEY (store_id, period_label)
);

-- Índice para RLS e queries de overview por org
CREATE INDEX idx_revenue_summary_org
  ON store_revenue_summary(org_id, period_label);

-- Índice para cleanup job (parcial, mantém tamanho pequeno)
CREATE INDEX idx_revenue_summary_expires
  ON store_revenue_summary(expires_at)
  WHERE expires_at IS NOT NULL;

-- Índice para health check de sync
CREATE INDEX idx_revenue_summary_sync_status
  ON store_revenue_summary(sync_status)
  WHERE sync_status IN ('error', 'partial');

-- RLS
ALTER TABLE store_revenue_summary ENABLE ROW LEVEL SECURITY;

-- Leitura: org member com acesso à loja
CREATE POLICY "org_revenue_summary_select" ON store_revenue_summary
  FOR SELECT TO authenticated
  USING (
    org_id = current_org_id()
    OR can_access_store(store_id)
  );

-- Escrita: apenas service_role (sync jobs)
CREATE POLICY "service_revenue_summary_all" ON store_revenue_summary
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Cleanup function
CREATE OR REPLACE FUNCTION clean_expired_revenue_summaries()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  DELETE FROM store_revenue_summary
  WHERE expires_at < NOW() - INTERVAL '1 hour';
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

COMMENT ON TABLE store_revenue_summary IS
  'Cache de receita agregada por loja e período. Atualizado pelo sync job. '
  'Fonte única para dashboard de overview e comparativos de revenue.';
```

### 3.3 Estratégia de Upsert (para o Sync Job)

```sql
INSERT INTO store_revenue_summary (
  store_id, org_id, period_label,
  period_start, period_end,
  klaviyo_total_revenue, klaviyo_campaign_revenue, klaviyo_flow_revenue,
  shopify_total_revenue,
  sync_status, sync_error,
  expires_at, fetched_at
)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'ok', NULL, NOW() + INTERVAL '6 hours', NOW())
ON CONFLICT (store_id, period_label)
DO UPDATE SET
  org_id                   = EXCLUDED.org_id,
  period_start             = EXCLUDED.period_start,
  period_end               = EXCLUDED.period_end,
  klaviyo_total_revenue    = EXCLUDED.klaviyo_total_revenue,
  klaviyo_campaign_revenue = EXCLUDED.klaviyo_campaign_revenue,
  klaviyo_flow_revenue     = EXCLUDED.klaviyo_flow_revenue,
  shopify_total_revenue    = EXCLUDED.shopify_total_revenue,
  sync_status              = EXCLUDED.sync_status,
  sync_error               = EXCLUDED.sync_error,
  expires_at               = EXCLUDED.expires_at,
  fetched_at               = NOW();
```

### 3.4 Query do Endpoint (substituindo as 120 API calls)

```typescript
// ANTES: 30 lojas × 4 API calls = 120 requests, ~72 segundos
// DEPOIS: 1 query Supabase, ~50ms

const { data: stores } = await supabase
  .from("store_revenue_summary")
  .select(`
    store_id,
    klaviyo_total_revenue,
    klaviyo_campaign_revenue,
    klaviyo_flow_revenue,
    shopify_total_revenue,
    sync_status,
    fetched_at,
    client_stores!inner(store_name, client_id, clients(name))
  `)
  .eq("period_label", period)
  .eq("org_id", orgId)
  .gt("expires_at", new Date().toISOString())
```

### 3.5 Modelo de Atribuição — Documentação Obrigatória

**Shopify `total_revenue`** = receita total de todos os pedidos da loja no período (ground truth).

**Klaviyo `total_revenue`** = receita atribuída ao Klaviyo (subconjunto do Shopify). Uma loja com R$100k no Shopify pode ter R$40k atribuídos ao Klaviyo — os R$100k já incluem esses R$40k.

**O `klaviyo_revenue_percentage` deve ser calculado no frontend:** `(klaviyo_total / shopify_total) * 100`. Nunca deve exceder 100% em condições normais. Se exceder, indica problema de atribuição que deve ser investigado.

---

## 4. Requisito Crítico: Isolamento de Dados Entre Tenants

**Este é o requisito mais importante deste PRD. Nenhuma otimização de performance justifica comprometer o isolamento de dados.**

### 4.1 Como o isolamento funciona hoje

O sistema opera com 3 camadas de isolamento:

**Camada 1 — Código (application layer):** Todo endpoint resolve o `org_id` do usuário autenticado via `resolveOrgId(userId)` e filtra queries com `.eq('org_id', orgId)`.

**Camada 2 — RLS do Supabase (database layer):** Tabelas possuem Row Level Security com policies como `org_id = current_org_id()`.

**Camada 3 — Acesso granular por loja (agent_store_access):** Agentes só veem lojas atribuídas a eles via `can_access_store(store_id)`. Admins e owners veem tudo da sua org.

### 4.2 Requisitos obrigatórios para qualquer solução implementada

1. **`org_id NOT NULL` em toda tabela de cache:** Qualquer tabela que armazene dados de revenue DEVE ter coluna `org_id NOT NULL`.

2. **Filtro duplo obrigatório:** Todo endpoint DEVE filtrar por `org_id` tanto no código (application layer) quanto via RLS (database layer). Nunca depender de apenas uma camada.

3. **Proibição de admin client para leitura:** O `createAdminClient()` (service_role) bypassa RLS. Ele só deve ser usado pelo cron para escrita. Endpoints que respondem a usuários DEVEM usar `createClient()` (authenticated), que respeita RLS.

4. **Cache keys devem incluir `org_id`:** O cache in-memory atual em `total-revenue/route.ts` usa `user.id` como chave (linha 113). Dois usuários da mesma org duplicam chamadas. A cache key deve ser `${orgId}:${period}`.

5. **Proibição de joins inseguros:** Queries de agregação NUNCA devem fazer join com `client_stores` sem filtro de `org_id`.

6. **Testes de isolamento obrigatórios:** Antes de deploy, testar com 2 usuários de orgs diferentes acessando a mesma página simultaneamente.

7. **Escrita exclusiva via service_role:** A tabela `store_revenue_summary` não deve ter policies de INSERT/UPDATE para `authenticated`. Dados são sempre escritos pelo backend via `service_role`.

### 4.3 Vulnerabilidades atuais que devem ser corrigidas

| Problema | Local | Risco | Ação |
|----------|-------|-------|------|
| `dashboard_cache` sem `org_id` | `20250123_dashboard_cache.sql` | RLS usa `is_org_member()` — qualquer membro de qualquer org pode ler qualquer cache entry | Adicionar `org_id`, backfill, atualizar RLS |
| `stores/control` cache sem prefixo de org | `stores/control/route.ts:13-17` | Cache key usa apenas `store_id` — em single-process, dados de uma org podem ser servidos para outra | Adicionar `orgId` à cache key ou remover cache in-memory |
| Query de debug vaza campos sensíveis | `total-revenue/route.ts:129-153` | `allStoresDebug` lê `klaviyo_private_key` e loga nos registros de produção | Remover imediatamente |
| `client_performance` usa `clientId` como `store_id` | `clients/[id]/performance/route.ts` | `setCache(adminClient, clientId, ...)` passa `clientId` para FK de `client_stores.id` — cache nunca é salvo | Corrigir o parâmetro ou criar cache_type dedicado |
| Portal duplica lógica de cache | `portal/dashboard/route.ts:235-331` | Implementa `getCachedData`/`saveToCache` localmente em vez de usar `src/lib/cache.ts` — TTL diverge | Consolidar na lib central |
| Meetings sem filtro `org_id` | `stores/control/route.ts:169-174` | Query retorna meetings de todas as orgs, filtra em memória por `client_id` | Adicionar filtro de `org_id` na query |

### 4.4 Migration de correção do `dashboard_cache` (pré-requisito)

```sql
-- CORREÇÃO URGENTE: adicionar org_id ao dashboard_cache
ALTER TABLE dashboard_cache
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id);

-- Backfill via client_stores
UPDATE dashboard_cache dc
SET org_id = cs.org_id
FROM client_stores cs
WHERE dc.store_id = cs.id
  AND cs.org_id IS NOT NULL
  AND dc.org_id IS NULL;

-- Índice para a nova coluna
CREATE INDEX IF NOT EXISTS idx_dashboard_cache_org
  ON dashboard_cache(org_id, cache_type, period);

-- Política corrigida: restringir ao org do usuário
DROP POLICY IF EXISTS "Users can view dashboard_cache" ON dashboard_cache;
CREATE POLICY "org_dashboard_cache_select" ON dashboard_cache
  FOR SELECT TO authenticated
  USING (
    org_id = current_org_id()
    OR can_access_store(store_id)
  );
```

---

## 5. Escopo de Implementação

### Fase 0 — Correção de Segurança (Pré-requisito, Dia 1)

> Estas correções são obrigatórias ANTES de qualquer otimização de performance.

1. Remover query `allStoresDebug` e seus logs de debug em `total-revenue/route.ts`
2. Migration de `dashboard_cache`: adicionar `org_id`, backfill, corrigir RLS policy
3. Corrigir cache key de `user.id` para `orgId` em `total-revenue/route.ts`
4. Corrigir cache key em `stores/control/route.ts` para incluir `orgId`

### Fase 1 — Quick Wins de Performance (Dia 1-2)

1. Deduplicar query de meetings em `stores/control/route.ts` (mesma query feita 2x nas linhas 169-179 e 287-299)
2. Cache de metadados Klaviyo: `getAccountInfo()` e `findPlacedOrderMetric()` com TTL de 30min (metadados que mudam rarissimamente, eliminam 2 calls por loja por request)
3. Migrar `TotalRevenueBanner` de `useState/useEffect/fetch` para SWR (padronizar com `useStorePerformance` que já usa SWR)

### Fase 2 — Expandir Cron para Múltiplos Períodos (Semana 1)

> A expansão do cron DEVE acontecer ANTES de conectar os endpoints à nova tabela, pois a tabela precisa de dados para todos os períodos.

1. Expandir `sync-reports/route.ts` para sincronizar 4 períodos: 7d, 15d, 30d, 90d
2. Priorizar: 30d primeiro (mais usado), depois 7d, 15d, 90d por último
3. Adicionar lock de idempotência: registro em `klaviyo_sync_config` com `is_running: boolean` e `started_at` para evitar execuções paralelas
4. Aumentar frequência do cron de 2h para 30min no `vercel.json`

**Tratamento de escala (250+ lojas):**

O `maxDuration=300` do Vercel Functions comporta no máximo ~50 lojas com 4 períodos. Para escalar:

- **Fase 2a (imediato):** Processar lojas em batches de 10 com `Promise.allSettled`, rate limiter por API key (já existente). Priorizar 30d para todas as lojas antes de iniciar 7d.
- **Fase 2b (se necessário):** Dividir o cron em sub-jobs por período (`/api/cron/sync-revenue?period=30d`), cada um com seu próprio schedule. 30d a cada 30min, 7d a cada 1h, 90d a cada 6h.
- **Fase 2c (escala futura):** Se 300s continuar insuficiente, mover o sync para worker dedicado (Railway/Fly.io) fora do Vercel Functions.

### Fase 3 — Tabela + Endpoints (Semana 1-2)

1. Criar migration `store_revenue_summary` (schema da Seção 3.2)
2. Modificar o cron para popular a nova tabela via upsert após cada sync
3. Reescrever `/api/dashboard/total-revenue` para ler de `store_revenue_summary`
4. Reescrever `/api/stores/control` para ler revenue de `store_revenue_summary`
5. Remover cache in-memory (`Map`) de ambos os endpoints
6. Garantir que ambos usam `createClient()` (não `createAdminClient()`) para leitura

### Fase 4 — Testes, Monitoramento e UX (Semana 2)

1. Teste de isolamento cross-tenant (2 orgs simultâneas, verificar zero data leakage)
2. Teste de consistência numérica (comparar revenue da tabela vs chamada direta Klaviyo, tolerância < 1% — ver Seção 8)
3. Adicionar header `X-Response-Time` nos endpoints de revenue
4. Adicionar logging de cache hit/miss com nível `info` (não `debug`) para métricas em produção
5. Mostrar `fetched_at` na UI do dashboard (transparência: "Dados atualizados há X minutos")
6. Mostrar indicador visual quando `sync_status = 'partial'` ou `'error'`

---

## 6. Critérios de Aceite

| Critério | Métrica | Como Medir |
|----------|---------|------------|
| Dashboard carrega rápido | < 2 segundos (P95) | Header `X-Response-Time` + Vercel Analytics |
| Página de Lojas carrega rápido | < 2 segundos (P95) | Header `X-Response-Time` + Vercel Analytics |
| Zero calls Klaviyo/Shopify em request | 0 API calls externas durante carregamento | Logs: zero `[Klaviyo API]` durante requests de dashboard |
| Isolamento entre tenants | Teste automatizado passa com 2 orgs | Teste de integração: org A não vê dados de org B |
| Dados atualizados | Máximo 30 minutos de defasagem | `fetched_at` + frequência do cron |
| Consistência numérica | Divergência < 1% vs Klaviyo API direta | Teste de reconciliação (ver Seção 8) |
| Sem regressão funcional | Todos os períodos (7d, 15d, 30d, 90d) retornam dados | Teste E2E por período |
| Sem campos sensíveis em logs | Zero ocorrências de API keys | `grep` em logs de produção |
| Cache hit rate | > 80% em uso normal | Logging de hit/miss com métrica agregada |
| Transparência para o usuário | `fetched_at` visível na UI | Inspeção visual + teste de componente |

---

## 7. Riscos e Mitigações

| Risco | Prob. | Impacto | Mitigação |
|-------|-------|---------|-----------|
| Cron excede `maxDuration=300` com escala | Alta | Dados desatualizados | Processar em batches, dividir por período, plano de migração para worker externo (Fase 2b/2c) |
| CACHE_VERSION bump causa thundering herd | Alta | Pico de 429s na Klaviyo | Invalidação gradual: incrementar version por loja individual, não global |
| `klaviyoRequest()` retorna `null` silenciosamente | Alta | Dados incompletos sem indicação | Campo `sync_status` + `sync_error` na tabela; indicador visual na UI |
| Vercel Hobby timeout de 10s no endpoint | Alta (já ocorre) | Endpoint falha com 6+ lojas | Solução elimina o problema — leitura do banco é < 1s |
| `withConcurrencyLimit` não propaga erros | Média | Lojas após a falha ficam sem dados | Usar `Promise.allSettled` em vez de `Promise.all` no processamento de chunks |
| Divergência numérica entre cache e real-time | Baixa | Desconfiança do usuário | Mostrar timestamp + indicador de staleness na UI |
| Portal calcula datas sem timezone awareness | Média | Divergência de até 1 dia | Unificar com `parseDateRangeInTimezone()` da lib central |
| Sem dados históricos no dia 1 | Certa | Dashboard vazio até primeiro sync | Job de backfill retroativo na primeira execução do cron |

---

## 8. Definição de "Divergência Numérica < 1%"

O PRD original mencionava "tolerância < 1%" sem especificar qual métrica. Esta seção define com precisão:

### 8.1 O que comparar

A métrica-alvo é `conversion_value` (revenue) agregada por loja. A comparação é:

```
valor_cache = SUM(klaviyo_total_revenue) da store_revenue_summary
valor_real  = chamada direta à Klaviyo Reporting API (campaign-values-reports + flow-values-reports)
divergência = |valor_cache - valor_real| / valor_real
```

### 8.2 Por que pode divergir

1. **Janela temporal deslizante:** "30d" calculado às 02:00 pelo cron é diferente de "30d" calculado às 14:00 pelo request. A divergência esperada é proporcional à atividade nas últimas 12h.
2. **Arredondamento de cliques derivados:** O `click_count` é calculado como `Math.round(click_rate * delivered)`, com erro acumulativo de até 1 click por campanha. Isso não afeta `conversion_value` diretamente.
3. **Reprocessamento de atribuição pela Klaviyo:** A Klaviyo pode reatribuir revenue retroativamente dentro de sua janela de lookback (5 dias para email, 1 dia para SMS).

### 8.3 Como testar

```typescript
it("revenue em cache diverge menos de 1% do valor real", async () => {
  // 1. Buscar revenue de uma loja de teste via API direta
  const realRevenue = await getKlaviyoRevenueForStore(testStoreId, testApiKey, "30d")

  // 2. Buscar da tabela de cache
  const { data } = await supabase
    .from("store_revenue_summary")
    .select("klaviyo_total_revenue")
    .eq("store_id", testStoreId)
    .eq("period_label", "30d")
    .single()

  // 3. Comparar (ignorar se real é zero)
  if (realRevenue.total > 0) {
    const divergence = Math.abs(data.klaviyo_total_revenue - realRevenue.total) / realRevenue.total
    expect(divergence).toBeLessThan(0.01)
  }
})
```

### 8.4 O que NÃO é divergência

`shopify_total_revenue ≠ klaviyo_total_revenue` **não é divergência** — é modelo de atribuição. O Shopify mostra receita total; o Klaviyo mostra apenas receita atribuída ao email/SMS marketing. A razão `klaviyo/shopify` é sempre < 100% em condições normais.

---

## 9. Dependências entre Fases

```
Fase 0 (segurança)
  ↓
  Nenhuma dependência — executar primeiro, independente de tudo

Fase 1 (quick wins)
  ↓
  Independente da Fase 2/3 — pode ser feita em paralelo

Fase 2 (expandir cron) ← DEVE preceder Fase 3
  ↓
  A tabela precisa de dados para funcionar.
  O cron deve popular 7d/15d/30d/90d antes dos endpoints lerem dela.

Fase 3 (tabela + endpoints) ← DEPENDE de Fase 0 + Fase 2
  ↓
  Só faz sentido quando:
  a) As correções de segurança estão aplicadas (Fase 0)
  b) O cron já está populando múltiplos períodos (Fase 2)

Fase 4 (testes + monitoramento) ← DEPENDE de Fase 3
  ↓
  Baseline ANTES de Fase 3: instrumentar X-Response-Time nos endpoints atuais
  para ter comparação antes/depois.
```

**Nota sobre baseline:** Antes de iniciar a Fase 3, instrumentar os endpoints atuais com `X-Response-Time` header para capturar latência P50/P95 pré-otimização. Sem baseline, não é possível validar o critério "< 2 segundos P95".

---

## 10. Fora de Escopo

- Migração para Redis/Upstash (pode ser avaliada futuramente se o `dashboard_cache` no Supabase apresentar gargalos de connection pool)
- Conversão de `TotalRevenueBanner` de Client para Server Component (pré-requisito para Suspense/Streaming — avaliar após este PRD)
- Otimização do `getShopifyReportForStore` (carrega até 12.500 pedidos em memória para obter `totalRevenue` — problema separado que merece seu próprio PRD)
- Refatoração do sistema de permissões/RLS além das correções listadas na Seção 4.3
- Migração de SWR para TanStack Query (SWR já está no projeto em `swr@^2.4.0` com configuração adequada; migrar não é prioridade)
- Suporte a períodos customizados (date range picker) na tabela de cache — períodos fixos (7d/15d/30d/90d) cobrem 95% do uso

---

## Changelog

| Versão | Data | Alteração |
|--------|------|-----------|
| 1.0 | 28/02/2026 | PRD original |
| 2.0 | 28/02/2026 | Revisão pós-análise de 4 especialistas: descartada Opção A, schema completo para Opção B, correções de segurança como Fase 0, reordenação de fases (cron antes de endpoints), seção de divergência numérica, vulnerabilidades do `dashboard_cache`, dependências entre fases, modelo de atribuição documentado, riscos adicionais (thundering herd, falha silenciosa, timezone) |
