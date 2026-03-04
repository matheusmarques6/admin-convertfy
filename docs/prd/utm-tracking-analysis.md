# UTM Tracking - Analise Completa de Implementacao

## Status: ANALISE (nao implementar)

---

## 1. DESCOBERTAS - O QUE JA EXISTE

### 1.1 Extracao de UTM dos Pedidos Shopify (JA IMPLEMENTADO)

A logica de extracao de UTM **ja existe** no codebase:

**Arquivo:** `src/lib/integrations/shopify/report.ts`
- Funcao `extractUtmParams(url)` (linha 297-319) - extrai utm_source, utm_medium, utm_campaign, utm_content, utm_term de uma URL
- Secao "UTM Analysis" (linhas 543-598) - ja processa `landing_site` e `referring_site` dos pedidos Shopify
- Resultado incluido em `OrdersSummary.utmConversions` com bySource, byMedium, byCampaign
- Usado na funcao `getOrdersSummary()` que gera o relatorio completo Shopify

**Interface existente (linha 107-113):**
```typescript
utmConversions: {
  totalOrdersWithUtm: number
  utmTrackingRate: number
  bySource: Array<{ source: string; orders: number; revenue: number }>
  byMedium: Array<{ medium: string; orders: number; revenue: number }>
  byCampaign: Array<{ campaign: string; orders: number; revenue: number }>
}
```

### 1.2 Exibicao no Portal do Cliente (JA IMPLEMENTADO)

**Arquivo:** `src/app/portal/dashboard/conversions-section.tsx`
- Card "Conversoes por UTM" ja existe no portal dashboard
- Exibe totalOrdersWithUtm, utmTrackingRate, e bySource (top 5)

**Arquivo:** `src/app/portal/dashboard/types.ts` (linhas 67-108)
- `UtmSourceData` interface definida
- `ShopifyData.utmConversions` ja tipado com bySource, byMedium, byCampaign

### 1.3 Recovery Analysis (JA IMPLEMENTADO)

**Arquivo:** `src/app/api/integrations/shopify/recovery-analysis/route.ts`
- Aceita `utm_sources` como parametro de filtro
- Usa `extractUtmParams()` para analisar pedidos por fonte UTM

### 1.4 Tipo ShopifyOrder (INCOMPLETO)

**Arquivo:** `src/lib/integrations/types.ts` (linhas 220-236)
- O tipo `ShopifyOrder` exportado **NAO inclui** `landing_site`, `referring_site`, `source_name`, `tags`, `discount_codes`
- Porem, o tipo interno em `shopify/report.ts` (linhas 160-192) **JA INCLUI** esses campos
- Isso significa que a funcao `listOrders()` da `ShopifyService` nao retorna esses campos no tipo, mas a API Shopify os envia

---

## 2. O QUE FALTA IMPLEMENTAR

### 2.1 Aba UTM na pagina da loja (/stores/[id])

**Objetivo:** Nova tab "UTM" em `store-detail-tabs.tsx` para:
- Visualizar dados de UTM dos pedidos da loja (ja calculados pelo report)
- Configurar templates de UTM customizadas para a loja

**Localizacao:** Adicionar entre as tabs existentes (sugestao: apos "Relatorio" e antes de "Formulario")

### 2.2 Configuracao de UTM Templates

**Objetivo:** Permitir que a agencia configure templates de UTM para cada loja, gerando links prontos para campanhas.

**Exemplos de templates:**
- Campanha Black Friday: `?utm_source=klaviyo&utm_medium=email&utm_campaign=black-friday-2025`
- Flow Abandono: `?utm_source=klaviyo&utm_medium=email&utm_campaign=abandoned-cart&utm_content=reminder-1`

### 2.3 Dados UTM mais ricos no portal

**Objetivo:** Expandir o card existente de UTM no portal com:
- Breakdown por medium e campaign (alem de source)
- Visualizacao temporal (tendencia)
- Detalhamento por pedido individual com UTM

---

## 3. MAPEAMENTO DE ARQUIVOS IMPACTADOS

### 3.1 Arquivos a MODIFICAR

| Arquivo | Alteracao | Impacto |
|---------|-----------|---------|
| `src/components/stores/store-detail-tabs.tsx` | Adicionar tab "UTM" | Baixo - apenas nova tab |
| `src/lib/integrations/types.ts` | Adicionar `landing_site`, `referring_site`, `source_name`, `tags` ao `ShopifyOrder` | Baixo - extensao de tipo |
| `src/app/portal/dashboard/conversions-section.tsx` | Expandir card UTM com tabs source/medium/campaign | Medio |
| `src/app/portal/dashboard/types.ts` | Sem alteracao necessaria (tipos ja existem) | Nenhum |
| `src/app/portal/stores/[id]/page.tsx` | Adicionar secao UTM ao relatorio da loja no portal | Medio |
| `src/app/api/portal/stores/[id]/report/route.ts` | Passar dados UTM do shopifyReport para o response | Baixo |

### 3.2 Arquivos NOVOS a criar

| Arquivo | Descricao |
|---------|-----------|
| `src/components/stores/store-utm-tab.tsx` | Componente da tab UTM dentro de /stores/[id] |
| `src/app/api/stores/[id]/utm-templates/route.ts` | API CRUD de templates UTM por loja |
| `supabase/migrations/YYYYMMDD_utm_templates.sql` | Tabela de templates UTM |

### 3.3 Arquivos que NAO precisam mudar

| Arquivo | Motivo |
|---------|--------|
| `src/lib/integrations/shopify/report.ts` | Logica de extracao UTM ja completa |
| `src/lib/integrations/shopify.ts` | ShopifyService ja busca orders com todos os campos |
| `src/app/api/integrations/shopify/report/route.ts` | Ja retorna utmConversions no report |
| `src/app/api/integrations/shopify/recovery-analysis/route.ts` | Ja suporta filtro por UTM |

---

## 4. SCHEMA DE BANCO DE DADOS

### 4.1 Nova Tabela: `utm_templates`

```sql
CREATE TABLE IF NOT EXISTS utm_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES client_stores(id) ON DELETE CASCADE,

  -- Template info
  name TEXT NOT NULL,                    -- "Black Friday 2025 - Email"
  description TEXT,                      -- Descricao livre

  -- UTM params
  utm_source TEXT NOT NULL,              -- "klaviyo"
  utm_medium TEXT NOT NULL,              -- "email"
  utm_campaign TEXT NOT NULL,            -- "black-friday-2025"
  utm_content TEXT,                      -- "hero-banner"
  utm_term TEXT,                         -- "desconto"

  -- Meta
  is_active BOOLEAN DEFAULT true,
  usage_count INTEGER DEFAULT 0,         -- Quantas vezes foi copiado/usado
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX idx_utm_templates_store ON utm_templates(store_id);
CREATE INDEX idx_utm_templates_org ON utm_templates(org_id);

-- RLS
ALTER TABLE utm_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "utm_templates_select"
  ON utm_templates FOR SELECT TO authenticated
  USING (can_access_store(store_id));

CREATE POLICY "utm_templates_insert"
  ON utm_templates FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM org_members om
      WHERE om.profile_id = auth.uid()
        AND om.org_id = utm_templates.org_id
        AND om.is_active = true
    )
  );

CREATE POLICY "utm_templates_update"
  ON utm_templates FOR UPDATE TO authenticated
  USING (can_access_store(store_id));

CREATE POLICY "utm_templates_delete"
  ON utm_templates FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM org_members om
      WHERE om.profile_id = auth.uid()
        AND om.org_id = utm_templates.org_id
        AND om.is_active = true
        AND om.role IN ('owner', 'manager')
    )
  );

-- Trigger updated_at
CREATE TRIGGER set_utm_templates_updated_at
  BEFORE UPDATE ON utm_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

### 4.2 Tabelas existentes - SEM ALTERACAO necessaria

- `client_stores` - nao precisa de novos campos (UTM vem da API Shopify em tempo real)
- `order_tracking_cache` - nao precisa de UTM (cache de rastreio)
- `tracking_orders` - nao precisa de UTM (foco em fulfillment/shipping)

---

## 5. NOVAS ROTAS API

### 5.1 `GET /api/stores/[id]/utm-templates`

Retorna todos os templates UTM de uma loja.

```typescript
// Response
{
  success: true,
  templates: [
    {
      id: "uuid",
      name: "Black Friday 2025",
      utm_source: "klaviyo",
      utm_medium: "email",
      utm_campaign: "black-friday-2025",
      utm_content: "hero-banner",
      utm_term: null,
      is_active: true,
      usage_count: 12,
      created_at: "2025-01-01T...",
      generatedUrl: "https://loja.com.br?utm_source=klaviyo&utm_medium=email&utm_campaign=black-friday-2025&utm_content=hero-banner"
    }
  ]
}
```

### 5.2 `POST /api/stores/[id]/utm-templates`

Cria um novo template UTM.

```typescript
// Body
{
  name: "Black Friday 2025",
  description: "Campanha principal de BF",
  utm_source: "klaviyo",
  utm_medium: "email",
  utm_campaign: "black-friday-2025",
  utm_content: "hero-banner"
}
```

### 5.3 `PATCH /api/stores/[id]/utm-templates/[templateId]`

Atualiza um template existente.

### 5.4 `DELETE /api/stores/[id]/utm-templates/[templateId]`

Remove um template.

---

## 6. NOVOS COMPONENTES UI

### 6.1 `StoreUtmTab` (tab dentro de /stores/[id])

**Secoes:**
1. **Resumo de UTM** - Cards com metricas (totalOrdersWithUtm, utmTrackingRate)
2. **Breakdown por Dimensao** - Sub-tabs: Source | Medium | Campaign
   - Tabela com ranking, pedidos, receita por dimensao
3. **Templates de UTM** - Lista de templates configurados
   - Formulario para criar novo template
   - Botao "Copiar Link" para cada template
   - Gerador de URL baseado na store_url

**Dados:** Consome o endpoint existente `/api/integrations/shopify/report?store_id=X`
que ja retorna `orders.utmConversions` com tudo necessario.

### 6.2 Expansao do card UTM no portal

**Melhoria:** Adicionar tabs dentro do card existente em `conversions-section.tsx`:
- Tab "Source" (atual)
- Tab "Medium"
- Tab "Campaign"

---

## 7. FLUXO DE DADOS END-TO-END

### 7.1 Visualizacao de UTM (leitura)

```
1. Usuario acessa /stores/[id] > tab UTM
2. Frontend chama GET /api/integrations/shopify/report?store_id=X&period=30d
3. Backend (report.ts) usa getStoreCredentials(storeId) para pegar token Shopify
4. Backend chama Shopify REST API: GET /admin/api/2024-10/orders.json?status=any&...
5. Para cada pedido, extractUtmParams(order.landing_site || order.referring_site)
6. Agrega em utmConversions.bySource / byMedium / byCampaign
7. Retorna para o frontend
8. StoreUtmTab renderiza os dados
```

### 7.2 Templates de UTM (CRUD)

```
1. Agencia acessa /stores/[id] > tab UTM > secao Templates
2. Preenche formulario: name, utm_source, utm_medium, utm_campaign, utm_content, utm_term
3. Frontend chama POST /api/stores/[id]/utm-templates
4. Backend valida acesso, insere na tabela utm_templates
5. Frontend exibe template com URL gerada: store_url + "?" + UTM params
6. Botao "Copiar" copia a URL completa para clipboard
```

### 7.3 Portal do Cliente (leitura expandida)

```
1. Cliente acessa portal > dashboard
2. Frontend chama GET /api/portal/dashboard?period=30d
3. Backend ja inclui shopify.utmConversions no response
4. ConversionsSection renderiza com tabs source/medium/campaign
```

---

## 8. PLANO DE IMPLEMENTACAO EM FASES

### FASE 1: Tab UTM na loja (exibicao de dados) [~2-3h]

**Objetivo:** Mostrar os dados UTM que ja sao calculados pelo report.

**Tarefas:**
1. Criar `src/components/stores/store-utm-tab.tsx`
   - Cards: total pedidos com UTM, taxa de rastreio UTM
   - Tabela por source com ranking, pedidos, receita
   - Sub-tabs: Source | Medium | Campaign
2. Modificar `src/components/stores/store-detail-tabs.tsx`
   - Adicionar TabsTrigger "UTM" com icone Link2
   - Adicionar TabsContent com `<StoreUtmTab storeId={storeId} />`
3. Atualizar `src/lib/integrations/types.ts`
   - Adicionar `landing_site`, `referring_site`, `source_name`, `tags` ao tipo `ShopifyOrder`

**Zero alteracoes em backend** - tudo ja vem do report existente.

### FASE 2: Templates de UTM (CRUD) [~3-4h]

**Objetivo:** Configurar templates de UTM por loja.

**Tarefas:**
1. Criar migration `supabase/migrations/YYYYMMDD_utm_templates.sql`
2. Criar API routes:
   - `src/app/api/stores/[id]/utm-templates/route.ts` (GET, POST)
   - `src/app/api/stores/[id]/utm-templates/[templateId]/route.ts` (PATCH, DELETE)
3. Expandir `store-utm-tab.tsx` com secao de templates:
   - Formulario de criacao
   - Lista com acoes (editar, copiar link, excluir)
   - Gerador de URL completa

### FASE 3: Expansao do portal (UTM detalhado) [~1-2h]

**Objetivo:** Melhorar o card UTM no portal do cliente.

**Tarefas:**
1. Modificar `src/app/portal/dashboard/conversions-section.tsx`
   - Adicionar sub-tabs (Source | Medium | Campaign) dentro do card
   - Mostrar dados de byMedium e byCampaign (ja disponiveis no tipo)
2. Modificar `src/app/portal/stores/[id]/page.tsx`
   - Adicionar secao UTM na tab E-commerce do relatorio da loja no portal

### FASE 4 (OPCIONAL): Persistencia de UTM por pedido [~4-5h]

**Objetivo:** Salvar dados UTM extraidos no banco para queries historicas rapidas.

**NOTA:** Esta fase so e necessaria se performance for um problema (cada visualizacao chama a API Shopify em tempo real). Para a maioria dos casos, a extracao em tempo real e suficiente.

**Tarefas:**
1. Adicionar colunas UTM na tabela `order_tracking_cache` ou criar nova tabela `order_utm_data`
2. Modificar o sync de pedidos (cron/webhook) para extrair e salvar UTM
3. Criar endpoint de query local (sem chamar Shopify)

---

## 9. RISCOS E CONSIDERACOES

### 9.1 Performance
- **Extracao em tempo real** dos pedidos Shopify funciona bem para periodos curtos (7d, 30d)
- Para 90d/all, pode ser lento com muitos pedidos (ja paginado com limite de 50 paginas)
- Cache ja implementado via `getCache/setCache` no report endpoint
- **Recomendacao:** Fase 4 so se necessario por volume de pedidos

### 9.2 Limitacoes da Shopify
- `landing_site` e `referring_site` so sao preenchidos quando o pedido vem de um link com UTM
- Pedidos feitos diretamente na loja (checkout manual, POS) nao terao UTM
- Isso e esperado - a "taxa de rastreio UTM" indica a cobertura

### 9.3 Campos UTM na Shopify
- `landing_site`: URL completa da primeira pagina acessada (contem UTM params)
- `referring_site`: URL do site de referencia (pode conter UTM params)
- A funcao `extractUtmParams()` ja trata ambos com fallback

### 9.4 Multi-tenant
- Templates de UTM sao isolados por `org_id` + `store_id`
- RLS policies usam `can_access_store(store_id)` (funcao helper existente)
- Consistente com o padrao de isolamento do sistema

---

## 10. RESUMO EXECUTIVO

| Item | Status |
|------|--------|
| Extracao UTM da Shopify | JA IMPLEMENTADO |
| Logica de agregacao UTM | JA IMPLEMENTADO |
| Tipo interno com landing_site/referring_site | JA IMPLEMENTADO |
| Endpoint de report com utmConversions | JA IMPLEMENTADO |
| Card UTM no portal dashboard | JA IMPLEMENTADO |
| Recovery analysis com filtro UTM | JA IMPLEMENTADO |
| Tab UTM em /stores/[id] | A IMPLEMENTAR (Fase 1) |
| Tipo exportado ShopifyOrder completo | A CORRIGIR (Fase 1) |
| Templates de UTM por loja | A IMPLEMENTAR (Fase 2) |
| Portal com UTM detalhado (medium/campaign) | A IMPLEMENTAR (Fase 3) |
| Persistencia local de UTM | OPCIONAL (Fase 4) |

**Estimativa total (Fases 1-3):** 6-9 horas de desenvolvimento
**Fase 4 (opcional):** +4-5 horas adicionais
