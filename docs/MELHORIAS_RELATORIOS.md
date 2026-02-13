# Análise Comparativa: admin-convertfy vs adtracked

## Resumo Executivo

O adtracked possui um sistema de relatórios mais completo, especialmente em:
1. **Rastreamento de Lucro Real** - Custos de produtos, taxas de gateway, margem de lucro
2. **Atribuição de Revenue** - Qual fonte (Facebook, Google, Klaviyo) gerou cada venda
3. **Desempenho Detalhado** - Métricas individuais de cada flow e campanha
4. **Customer Analytics Avançado** - Top customers, RFM, LTV

---

## Análise Detalhada: O Que Falta no admin-convertfy

### 1. CUSTOS E MARGEM DE LUCRO

#### ❌ O que NÃO temos:
- Custo de cada produto (COGS)
- Taxas de gateway de pagamento (Shopify Payments, Stripe, PagSeguro)
- Custo de frete real vs cobrado
- Custo operacional por pedido
- Cálculo de lucro líquido real

#### ✅ O que o adtracked tem:

```sql
-- Tabela de custos de produtos (multi-moeda)
CREATE TABLE products (
  id UUID PRIMARY KEY,
  price DECIMAL(10,2),
  cost_brl DECIMAL(10,2),
  cost_usd DECIMAL(10,2),
  cost_eur DECIMAL(10,2),
  cost_aed DECIMAL(10,2)
);

-- Taxas de gateway por loja
CREATE TABLE store_cost_settings (
  gateway_name TEXT,        -- 'Shopify Payments', 'Stripe'
  fee_percentage DECIMAL,   -- Ex: 3.49%
  fee_fixed DECIMAL         -- Ex: R$ 0.40
);
```

**Fórmula de Lucro do adtracked:**
```
Lucro = Revenue - Custo Produtos - Taxa Gateway - Marketing - Frete Real - Custos Operacionais - Impostos
```

#### 📋 O que precisamos implementar:
1. Tabela `product_costs` com custos em múltiplas moedas
2. Tabela `store_cost_settings` para taxas de gateway
3. Campo `default_cost_percentage` na loja (ex: 35% se não tiver custo cadastrado)
4. Cálculo de margem de lucro por pedido e por produto

---

### 2. DESEMPENHO DE FLOWS E CAMPANHAS

#### ❌ O que NÃO temos:
- Página dedicada para ver TODOS os flows com métricas completas
- Página dedicada para ver TODAS as campanhas com métricas completas
- Comparação de performance entre flows
- Trend histórico de cada flow/campanha
- Alertas de queda de performance

#### ✅ O que o adtracked tem:
- Dashboard Klaviyo com métricas detalhadas
- Recovery rate de carrinhos abandonados
- Comparação antes/depois do sistema

#### 📋 O que precisamos implementar:

**Página /klaviyo/flows:**
```typescript
// Métricas por flow individual
{
  flow_id: string,
  flow_name: string,
  status: 'live' | 'draft' | 'manual',
  trigger_type: string,

  // Métricas de envio
  recipients: number,
  delivered: number,
  delivery_rate: number,

  // Métricas de engajamento
  opened: number,
  open_rate: number,
  clicked: number,
  click_rate: number,

  // Métricas de conversão
  conversions: number,
  conversion_rate: number,
  conversion_value: number,    // Revenue atribuída
  revenue_per_recipient: number,

  // Métricas negativas
  bounced: number,
  bounce_rate: number,
  unsubscribed: number,
  unsubscribe_rate: number,

  // Comparação período anterior
  revenue_change: number,      // % vs período anterior
  conversion_change: number
}
```

**Página /klaviyo/campaigns:**
```typescript
// Métricas por campanha individual
{
  campaign_id: string,
  campaign_name: string,
  send_time: string,
  subject: string,

  // Mesmas métricas dos flows
  ...flowMetrics,

  // Específicas de campanha
  scheduled_at: string,
  status: 'sent' | 'scheduled' | 'draft' | 'cancelled'
}
```

---

### 3. CUSTOMER ANALYTICS AVANÇADO

#### ❌ O que NÃO temos:
- Cliente que MAIS comprou (total histórico)
- Revenue atribuída à Convertfy por cliente
- LTV (Lifetime Value) calculado
- RFM Score (Recency, Frequency, Monetary)
- Segmentação de clientes por comportamento
- Churn prediction

#### ✅ O que o adtracked tem:

```typescript
interface Customer {
  // Métricas básicas
  total_orders: number,
  total_spent: number,
  first_order_at: string,
  last_order_at: string,

  // RFM Scoring
  rfm_recency: number,      // Dias desde última compra
  rfm_frequency: number,    // Frequência de compras
  rfm_monetary: number,     // Valor total gasto
  rfm_score: string,        // Ex: "555" (melhor), "111" (pior)
  rfm_segment: string       // "Champions", "At Risk", "Lost", etc.
}
```

#### 📋 O que precisamos implementar:

**Top Customers com Atribuição:**
```typescript
interface TopCustomer {
  email: string,
  name: string,
  total_orders: number,
  total_spent: number,
  average_order_value: number,
  first_order_date: string,
  last_order_date: string,

  // NOVO: Atribuição Klaviyo
  klaviyo_attributed_orders: number,
  klaviyo_attributed_revenue: number,
  klaviyo_percentage: number,  // % do total que veio via Klaviyo

  // NOVO: Lucro
  total_profit: number,        // Baseado na margem dos produtos
  average_profit_per_order: number
}
```

---

### 4. ATRIBUIÇÃO DE REVENUE

#### ❌ O que NÃO temos:
- Qual flow/campanha gerou cada venda
- Atribuição multi-touch
- Revenue breakdown por fonte (Facebook, Google, Email, Direto)
- Cálculo de ROI por canal

#### ✅ O que o adtracked tem:

```typescript
interface Order {
  // Atribuição
  attributed_source: string,      // 'facebook', 'google', 'email', 'direct'
  attributed_campaign_id: string,
  attributed_ad_set_id: string,

  // UTM tracking
  utm_source: string,
  utm_medium: string,
  utm_campaign: string
}

// Query de atribuição
const attribution = {
  facebook: { orders: 150, revenue: 45000 },
  google: { orders: 80, revenue: 28000 },
  email: { orders: 200, revenue: 65000 },    // Klaviyo
  direct: { orders: 100, revenue: 30000 }
}
```

#### 📋 O que precisamos implementar:

1. **Extrair UTM do Shopify:**
   - `order.landing_site` contém UTM parameters
   - `order.referring_site` contém a origem
   - `order.note_attributes` pode conter UTM custom

2. **Criar tabela de atribuição:**
```sql
CREATE TABLE order_attribution (
  order_id UUID REFERENCES orders(id),
  attributed_source TEXT,        -- 'klaviyo', 'facebook', 'google', 'direct'
  attributed_flow_id TEXT,
  attributed_campaign_id TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT
);
```

---

### 5. DASHBOARD DE LUCRO

#### ❌ O que NÃO temos:
- Lucro líquido no dashboard
- ROI real (considerando custos)
- ROAS (Return on Ad Spend)
- CPA (Cost per Acquisition)

#### ✅ O que o adtracked tem:

```typescript
interface DashboardStats {
  lucroLiquido: number,          // Net profit
  receitaAprovada: number,       // Approved revenue
  custoMarketing: number,        // Ad spend
  custoProdutos: number,         // Product costs
  margem: number,                // Profit margin %
  roi: number,                   // Return on investment %
  roas: number,                  // Return on ad spend
  ticketMedio: number,           // Average order value
  cpa: number,                   // Cost per acquisition
}
```

---

## Plano de Implementação Priorizado

### Fase 1: Fundação (Crítico)
**Objetivo:** Adicionar estrutura para custos e atribuição

1. **Criar tabelas de custos:**
   - `product_costs` - Custo de cada produto
   - `store_cost_settings` - Taxas de gateway, custos operacionais

2. **Adicionar campos de atribuição:**
   - Extrair UTM dos pedidos Shopify
   - Criar view de atribuição por fonte

3. **Estimativa de esforço:** 2-3 dias

### Fase 2: Flows e Campanhas Detalhadas (Alta Prioridade)
**Objetivo:** Mostrar performance individual de cada flow/campanha

1. **Página /klaviyo/flows:**
   - Listar todos os flows com métricas completas
   - Ordenar por revenue
   - Filtrar por período

2. **Página /klaviyo/campaigns:**
   - Listar todas as campanhas com métricas completas
   - Mostrar trend vs período anterior

3. **Estimativa de esforço:** 2-3 dias

### Fase 3: Customer Analytics (Média Prioridade)
**Objetivo:** Análise avançada de clientes

1. **Top Customers melhorado:**
   - Top 20 clientes por gasto total
   - Revenue atribuída à Klaviyo por cliente
   - Lucro por cliente (baseado em margem)

2. **Segmentação básica:**
   - Clientes recorrentes vs novos
   - Clientes VIP (top 10%)

3. **Estimativa de esforço:** 2-3 dias

### Fase 4: Relatório de Lucro (Média Prioridade)
**Objetivo:** Calcular e mostrar lucro real

1. **Permitir cadastro de custos:**
   - Interface para cadastrar custo de produtos
   - Default percentage se não tiver custo

2. **Calcular lucro no relatório:**
   - Revenue - Custos - Taxas
   - Mostrar margem de lucro %

3. **Estimativa de esforço:** 3-4 dias

---

## Estrutura de Dados Proposta

### Novas Tabelas Necessárias

```sql
-- Custos de produtos
CREATE TABLE product_costs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID REFERENCES stores(id),
  product_id TEXT NOT NULL,           -- Shopify product_id
  variant_id TEXT,                    -- Shopify variant_id (opcional)
  product_name TEXT,
  sku TEXT,

  -- Custos em múltiplas moedas
  cost_brl DECIMAL(10,2),
  cost_usd DECIMAL(10,2),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(store_id, product_id, variant_id)
);

-- Configurações de custo por loja
CREATE TABLE store_cost_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID REFERENCES stores(id),

  -- Custo padrão se produto não tiver custo cadastrado
  default_cost_percentage DECIMAL(5,2) DEFAULT 35,

  -- Taxas de gateway
  gateway_name TEXT,                  -- 'Shopify Payments', 'PagSeguro', etc
  gateway_percentage DECIMAL(5,2),    -- Ex: 3.49
  gateway_fixed DECIMAL(10,2),        -- Ex: 0.40

  -- Custos operacionais
  operational_cost_per_order DECIMAL(10,2) DEFAULT 0,
  shipping_cost_average DECIMAL(10,2) DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(store_id, gateway_name)
);

-- Atribuição de pedidos
CREATE TABLE order_attribution (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID REFERENCES stores(id),
  order_id TEXT NOT NULL,             -- Shopify order_id
  order_number TEXT,
  order_date TIMESTAMPTZ,
  order_total DECIMAL(10,2),

  -- Fonte de atribuição
  attributed_source TEXT,             -- 'klaviyo', 'facebook', 'google', 'direct', 'organic'
  attributed_medium TEXT,             -- 'email', 'cpc', 'social', etc

  -- Klaviyo específico
  klaviyo_flow_id TEXT,
  klaviyo_campaign_id TEXT,
  klaviyo_message_id TEXT,

  -- UTM parameters
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_content TEXT,
  utm_term TEXT,

  -- Landing/referring
  landing_site TEXT,
  referring_site TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(store_id, order_id)
);

-- Métricas de flows (cache para performance)
CREATE TABLE klaviyo_flow_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID REFERENCES stores(id),
  flow_id TEXT NOT NULL,
  flow_name TEXT,
  flow_status TEXT,                   -- 'live', 'draft', 'manual'
  trigger_type TEXT,

  -- Período da métrica
  period_start TIMESTAMPTZ,
  period_end TIMESTAMPTZ,

  -- Métricas
  recipients INTEGER DEFAULT 0,
  delivered INTEGER DEFAULT 0,
  delivery_rate DECIMAL(5,2) DEFAULT 0,
  opened INTEGER DEFAULT 0,
  open_rate DECIMAL(5,2) DEFAULT 0,
  clicked INTEGER DEFAULT 0,
  click_rate DECIMAL(5,2) DEFAULT 0,
  conversions INTEGER DEFAULT 0,
  conversion_rate DECIMAL(5,2) DEFAULT 0,
  conversion_value DECIMAL(12,2) DEFAULT 0,
  revenue_per_recipient DECIMAL(10,2) DEFAULT 0,
  bounced INTEGER DEFAULT 0,
  bounce_rate DECIMAL(5,2) DEFAULT 0,
  unsubscribed INTEGER DEFAULT 0,
  unsubscribe_rate DECIMAL(5,2) DEFAULT 0,

  fetched_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(store_id, flow_id, period_start, period_end)
);

-- Métricas de campanhas (cache para performance)
CREATE TABLE klaviyo_campaign_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID REFERENCES stores(id),
  campaign_id TEXT NOT NULL,
  campaign_name TEXT,
  campaign_status TEXT,               -- 'sent', 'scheduled', 'draft', 'cancelled'
  send_time TIMESTAMPTZ,
  subject TEXT,

  -- Período da métrica
  period_start TIMESTAMPTZ,
  period_end TIMESTAMPTZ,

  -- Mesmas métricas dos flows
  recipients INTEGER DEFAULT 0,
  delivered INTEGER DEFAULT 0,
  delivery_rate DECIMAL(5,2) DEFAULT 0,
  opened INTEGER DEFAULT 0,
  open_rate DECIMAL(5,2) DEFAULT 0,
  clicked INTEGER DEFAULT 0,
  click_rate DECIMAL(5,2) DEFAULT 0,
  conversions INTEGER DEFAULT 0,
  conversion_rate DECIMAL(5,2) DEFAULT 0,
  conversion_value DECIMAL(12,2) DEFAULT 0,
  revenue_per_recipient DECIMAL(10,2) DEFAULT 0,
  bounced INTEGER DEFAULT 0,
  bounce_rate DECIMAL(5,2) DEFAULT 0,
  unsubscribed INTEGER DEFAULT 0,
  unsubscribe_rate DECIMAL(5,2) DEFAULT 0,

  fetched_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(store_id, campaign_id, period_start, period_end)
);
```

---

## Mockup das Novas Páginas

### Página: /klaviyo/flows

```
┌─────────────────────────────────────────────────────────────────────┐
│  Flows do Klaviyo                                    [Período: 30d] │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐   │
│  │ Total Flows │ │ Live Flows  │ │ Total Rev.  │ │ Avg Conv.   │   │
│  │     12      │ │      8      │ │ R$ 45.230   │ │   3.2%      │   │
│  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘   │
│                                                                     │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │ Flow Name          │ Status │ Revenue  │ Open  │ Click │ Conv │ │
│  ├────────────────────┼────────┼──────────┼───────┼───────┼──────┤ │
│  │ Abandoned Cart     │ 🟢 Live│ R$18.500 │ 42.3% │ 8.5%  │ 4.2% │ │
│  │ Welcome Series     │ 🟢 Live│ R$12.300 │ 55.1% │ 12.3% │ 5.1% │ │
│  │ Post-Purchase      │ 🟢 Live│ R$ 8.200 │ 38.7% │ 6.2%  │ 2.8% │ │
│  │ Win-Back           │ 🟢 Live│ R$ 4.100 │ 28.5% │ 4.1%  │ 1.5% │ │
│  │ Browse Abandonment │ 🟡 Draft│ R$     0 │   -   │   -   │   -  │ │
│  └───────────────────────────────────────────────────────────────┘ │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Página: /klaviyo/campaigns

```
┌─────────────────────────────────────────────────────────────────────┐
│  Campanhas do Klaviyo                                [Período: 30d] │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐   │
│  │ Total Camp. │ │   Enviadas  │ │ Total Rev.  │ │ Avg Open    │   │
│  │     24      │ │     18      │ │ R$ 32.150   │ │   35.2%     │   │
│  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘   │
│                                                                     │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │ Campaign Name      │ Sent At  │ Revenue  │ Open  │ Click│ Conv│ │
│  ├────────────────────┼──────────┼──────────┼───────┼──────┼─────┤ │
│  │ Black Friday       │ Nov 24   │ R$15.200 │ 48.2% │ 12.5%│ 5.8%│ │
│  │ Natal - Última...  │ Dec 20   │ R$ 8.300 │ 42.1% │ 9.8% │ 4.2%│ │
│  │ Promoção Relâm...  │ Dec 15   │ R$ 4.100 │ 35.5% │ 7.2% │ 2.9%│ │
│  │ Newsletter Jan     │ Jan 05   │ R$ 2.800 │ 32.8% │ 5.5% │ 1.8%│ │
│  └───────────────────────────────────────────────────────────────┘ │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Seção: Top Customers (no relatório)

```
┌─────────────────────────────────────────────────────────────────────┐
│  Top Customers - Atribuição Convertfy                               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │ Cliente            │ Total    │ Klaviyo  │ %Klav │ Lucro Est.│ │
│  ├────────────────────┼──────────┼──────────┼───────┼───────────┤ │
│  │ maria@email.com    │ R$12.500 │ R$ 8.200 │  66%  │ R$ 4.125  │ │
│  │ joao@email.com     │ R$ 9.800 │ R$ 6.100 │  62%  │ R$ 3.234  │ │
│  │ ana@email.com      │ R$ 8.200 │ R$ 5.500 │  67%  │ R$ 2.706  │ │
│  │ pedro@email.com    │ R$ 7.100 │ R$ 3.200 │  45%  │ R$ 2.343  │ │
│  │ carla@email.com    │ R$ 6.500 │ R$ 4.800 │  74%  │ R$ 2.145  │ │
│  └───────────────────────────────────────────────────────────────┘ │
│                                                                     │
│  Total Atribuído à Convertfy: R$ 45.230 (58% do total)              │
│  Lucro Estimado via Convertfy: R$ 14.925                            │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Próximos Passos Recomendados

1. **Validar prioridades** com o time/stakeholders
2. **Começar pela Fase 1** (tabelas de custos e atribuição)
3. **Implementar páginas de flows/campanhas** - Alta visibilidade
4. **Adicionar customer analytics** ao relatório existente
5. **Criar interface para cadastro de custos** (opcional, pode ser via CSV)

---

*Documento criado em: Fevereiro 2025*
*Baseado na análise do repositório adtracked*
