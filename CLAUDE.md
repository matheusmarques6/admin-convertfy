# Claude Memory - API Integration Knowledge

Este arquivo contém conhecimento detalhado sobre as APIs da Shopify e Klaviyo para uso nas integrações do admin-convertfy.

---

## Shopify Admin API

### Status Atual (2024-2025)
- **REST API**: API legada desde 1 de Outubro de 2024
- **GraphQL API**: Recomendada para novas integrações
- **Deadline**: A partir de 1 de Abril de 2025, novos apps públicos devem usar exclusivamente GraphQL
- **Versão atual**: `2024-10` / `2025-01`

### Versionamento
- Formato: `YYYY-MM` (ex: `2024-10`)
- Endpoint REST: `https://{store}.myshopify.com/admin/api/2024-10/`
- Endpoint GraphQL: `https://{store}.myshopify.com/admin/api/2024-10/graphql.json`

### Autenticação
- **Access Token**: Header `X-Shopify-Access-Token: {token}`
- **Scopes necessários para Orders**: `read_orders`, `read_all_orders` (para histórico > 60 dias)
- **Scopes necessários para Customers**: `read_customers` + Protected Customer Data permission

### Rate Limits (REST)
- **Standard**: 40 requests/minuto por app/loja
- **Shopify Plus**: 400 requests/minuto (10x)
- **Replenish rate**: 2 requests/segundo
- **Bucket**: Leaky bucket algorithm

### Rate Limits (GraphQL)
- Baseado em **query cost points**
- Cada campo tem custo específico
- Queries complexas custam mais

---

## Shopify Orders API

### REST Endpoint
```
GET /admin/api/2024-10/orders.json
```

### Parâmetros de Filtro
| Parâmetro | Descrição | Exemplo |
|-----------|-----------|---------|
| `created_at_min` | Data mínima de criação (ISO 8601) | `2024-01-01T00:00:00-03:00` |
| `created_at_max` | Data máxima de criação (ISO 8601) | `2024-12-31T23:59:59-03:00` |
| `updated_at_min` | Data mínima de atualização | `2024-01-01T00:00:00-03:00` |
| `updated_at_max` | Data máxima de atualização | `2024-12-31T23:59:59-03:00` |
| `status` | Status do pedido | `any`, `open`, `closed`, `cancelled` |
| `financial_status` | Status financeiro | `paid`, `pending`, `refunded`, `authorized` |
| `fulfillment_status` | Status de fulfillment | `shipped`, `partial`, `unshipped`, `unfulfilled` |
| `since_id` | Pedidos após ID específico | `123456789` |
| `limit` | Máximo de resultados (max 250) | `50` |
| `fields` | Campos específicos | `id,created_at,total_price` |

### Paginação (Cursor-based)
```typescript
// Primeira requisição
const response = await fetch(`/admin/api/2024-10/orders.json?limit=250&created_at_min=${startDate}`)
const linkHeader = response.headers.get('Link')
// Link header contém: <url?page_info=xxx>; rel="next"

// Próximas requisições usam page_info
const nextUrl = `/admin/api/2024-10/orders.json?page_info=xxx&limit=250`
// IMPORTANTE: page_info não pode ser combinado com outros filtros exceto limit e fields
```

### Campos do Order Object
```typescript
interface ShopifyOrder {
  id: number
  name: string                    // "#1001"
  email: string
  created_at: string              // ISO 8601
  updated_at: string
  total_price: string             // "199.00"
  subtotal_price: string
  total_tax: string
  currency: string                // "BRL"
  financial_status: string        // "paid"
  fulfillment_status: string | null
  order_number: number
  customer: {
    id: number
    email: string
    first_name: string
    last_name: string
    orders_count: number
    total_spent: string
    tags: string
    created_at: string
  }
  line_items: Array<{
    id: number
    product_id: number
    variant_id: number
    title: string
    quantity: number
    price: string
    sku: string
  }>
  shipping_address: {
    first_name: string
    last_name: string
    city: string
    province: string
    country: string
    zip: string
  }
  billing_address: { /* same structure */ }
  discount_codes: Array<{ code: string, amount: string }>
  note: string
  tags: string
  source_name: string             // "web", "pos", "api"
  referring_site: string
  landing_site: string
  cancelled_at: string | null
  cancel_reason: string | null
  refunds: Array<{
    id: number
    created_at: string
    transactions: Array<{
      amount: string
    }>
  }>
}
```

### GraphQL Orders Query
```graphql
query GetOrders($first: Int!, $query: String, $after: String) {
  orders(first: $first, query: $query, after: $after) {
    pageInfo {
      hasNextPage
      endCursor
    }
    edges {
      node {
        id
        name
        createdAt
        updatedAt
        totalPriceSet {
          shopMoney {
            amount
            currencyCode
          }
        }
        customer {
          id
          email
          firstName
          lastName
          ordersCount
          totalSpentV2 {
            amount
          }
        }
        lineItems(first: 50) {
          edges {
            node {
              title
              quantity
              originalUnitPriceSet {
                shopMoney {
                  amount
                }
              }
            }
          }
        }
      }
    }
  }
}
```

### Filtros GraphQL
```graphql
# Filtrar por data
query: "created_at:>2024-01-01 created_at:<2024-12-31"

# Filtrar por status
query: "financial_status:paid fulfillment_status:shipped"

# Combinar filtros
query: "created_at:>2024-01-01 financial_status:paid"
```

### Performance Tips
1. **Especificar sort order**: Se filtrar por `created_at`, adicionar `order=created_at`
2. **Usar fields**: Solicitar apenas campos necessários reduz payload
3. **Paginação correta**: Usar `page_info` para iteração, não offset

---

## Shopify Customers API

### REST Endpoint
```
GET /admin/api/2024-10/customers.json
GET /admin/api/2024-10/customers/search.json?query=
```

### Campos do Customer Object
```typescript
interface ShopifyCustomer {
  id: number
  email: string
  first_name: string
  last_name: string
  phone: string
  orders_count: number
  total_spent: string              // "1500.00"
  currency: string
  state: string                    // "enabled", "disabled", "invited", "declined"
  tags: string                     // "vip, subscriber"
  created_at: string
  updated_at: string
  verified_email: boolean
  tax_exempt: boolean
  email_marketing_consent: {
    state: string                  // "subscribed", "not_subscribed", "unsubscribed"
    opt_in_level: string
    consent_updated_at: string
  }
  sms_marketing_consent: {
    state: string
    opt_in_level: string
    consent_updated_at: string
    consent_collected_from: string
  }
  addresses: Array<{
    id: number
    customer_id: number
    first_name: string
    last_name: string
    company: string
    address1: string
    address2: string
    city: string
    province: string
    country: string
    zip: string
    phone: string
    default: boolean
  }>
  default_address: { /* same structure */ }
}
```

### Filtros de Busca
- `email`, `phone`, `first_name`, `last_name`
- `orders_count`, `total_spent`
- `customer_tag`, `state`
- `created_at`, `updated_at`

---

## Shopify Webhooks

### Topics Disponíveis
| Topic | Descrição | Scope Requerido |
|-------|-----------|-----------------|
| `orders/create` | Novo pedido criado | `read_orders` |
| `orders/updated` | Pedido atualizado | `read_orders` |
| `orders/cancelled` | Pedido cancelado | `read_orders` |
| `orders/paid` | Pedido pago | `read_orders` |
| `orders/fulfilled` | Pedido enviado | `read_orders` |
| `customers/create` | Novo cliente | `read_customers` |
| `customers/update` | Cliente atualizado | `read_customers` |
| `products/create` | Novo produto | `read_products` |
| `products/update` | Produto atualizado | `read_products` |
| `refunds/create` | Reembolso criado | `read_orders` |

### Mandatory Webhooks (App Store)
- `app/uninstalled` - Cleanup quando desinstalado
- `customers/data_request` - GDPR data request
- `customers/redact` - Deletar dados do cliente
- `shop/redact` - Deletar dados da loja

### Headers do Webhook
- `X-Shopify-Topic`: Topic do webhook
- `X-Shopify-Shop-Domain`: Domínio da loja
- `X-Shopify-API-Version`: Versão da API
- `X-Shopify-Webhook-Id`: ID único do webhook
- `X-Shopify-Event-Id`: ID do evento (para deduplicação)
- `X-Shopify-Triggered-At`: Timestamp do trigger
- `X-Shopify-Hmac-SHA256`: Assinatura para validação

### Validação de Webhook
```typescript
import crypto from 'crypto'

function verifyShopifyWebhook(
  body: string,
  hmacHeader: string,
  secret: string
): boolean {
  const hash = crypto
    .createHmac('sha256', secret)
    .update(body, 'utf8')
    .digest('base64')
  return crypto.timingSafeEqual(
    Buffer.from(hash),
    Buffer.from(hmacHeader)
  )
}
```

### Best Practices
1. Responder com 2xx em até 5 segundos
2. Processar assincronamente (queue)
3. Implementar idempotência (usar `X-Shopify-Event-Id`)
4. Webhooks podem chegar fora de ordem
5. Webhooks podem ser duplicados

---

## Klaviyo API

### Versionamento
- Formato: ISO 8601 date (ex: `2025-10-15`)
- Header: `revision: 2025-10-15`
- Suporte: 2 anos após release
- Recomendação: Atualizar a cada 12-18 meses

### Base URL
```
https://a.klaviyo.com/api/
```

### Autenticação
```typescript
headers: {
  'Authorization': `Klaviyo-API-Key ${privateApiKey}`,
  'revision': '2025-10-15',
  'Content-Type': 'application/json',
  'Accept': 'application/json'
}
```

### Rate Limits
- **Burst limit**: Curto prazo (segundos)
- **Steady limit**: Longo prazo (minutos)
- Fixed-window rate limiting
- Retorna HTTP 429 quando excedido
- Similar a Google (2-20 calls/s) e Shopify (2-4 calls/s)

### Paginação
```typescript
// Cursor-based pagination
// Resposta inclui links para navegação:
{
  "links": {
    "self": "https://a.klaviyo.com/api/...",
    "next": "https://a.klaviyo.com/api/...?page[cursor]=xxx",
    "prev": null
  }
}

// Usar page[cursor] para próxima página
// Cursor é um GUID, não integer
// Cursors expiram após ~3 dias
```

---

## Klaviyo Reporting API

### Endpoints de Reports
| Endpoint | Descrição |
|----------|-----------|
| `POST /api/campaign-values-reports/` | Valores totais de campanha |
| `POST /api/campaign-series-reports/` | Série temporal de campanha |
| `POST /api/flow-values-reports/` | Valores totais de flow |
| `POST /api/flow-series-reports/` | Série temporal de flow |
| `POST /api/segment-values-reports/` | Valores de segmento |
| `POST /api/segment-series-reports/` | Série temporal de segmento |
| `POST /api/form-values-reports/` | Valores de formulário |
| `POST /api/form-series-reports/` | Série temporal de formulário |

### Statistics Disponíveis
```typescript
// Email Statistics
const emailStats = [
  'average_order_value',
  'bounce_rate',
  'bounced',
  'bounced_or_failed',
  'bounced_or_failed_unique',
  'bounced_unique',
  'click_rate',
  'click_to_open_rate',
  'clicked',
  'clicked_unique',
  'conversion_rate',
  'conversion_uniques',
  'conversion_value',
  'conversions',
  'delivered',
  'delivered_unique',
  'delivery_rate',
  'failed',
  'failed_unique',
  'open_rate',
  'opened',
  'opened_unique',
  'recipients',
  'revenue_per_recipient',
  'spam_complaint_rate',
  'spam_complaints',
  'spam_complaints_unique',
  'unsubscribe_rate',
  'unsubscribed',
  'unsubscribed_unique'
]

// SMS Statistics
const smsStats = [
  'clicked_sms',
  'clicked_sms_unique',
  'click_rate_sms',
  'conversion_rate_sms',
  'conversion_uniques_sms',
  'conversion_value_sms',
  'conversions_sms',
  'delivered_sms',
  'delivered_sms_unique',
  'delivery_rate_sms',
  'failed_sms',
  'failed_sms_unique',
  'recipients_sms',
  'revenue_per_recipient_sms',
  'text_message_roi',
  'message_segment_count_sum',
  'text_message_credit_usage_amount',
  'text_message_spend',
  'unsubscribed_sms',
  'unsubscribed_sms_unique',
  'unsubscribe_rate_sms'
]
```

### Request Format (Flow Values Report)
```typescript
const requestBody = {
  data: {
    type: 'flow-values-report',
    attributes: {
      statistics: [
        'recipients',
        'delivered',
        'opened',
        'open_rate',
        'clicked',
        'click_rate',
        'conversion_rate',
        'conversion_value',
        'revenue_per_recipient'
      ],
      timeframe: {
        start: '2024-01-01T00:00:00+00:00',
        end: '2024-12-31T23:59:59+00:00'
      },
      // Opcional: conversion_metric_id para métricas específicas
      conversion_metric_id: 'PLACED_ORDER_METRIC_ID',
      filter: `equals(flow_id,"FLOW_ID")`
    }
  }
}
```

### Request Format (Campaign Values Report)
```typescript
const requestBody = {
  data: {
    type: 'campaign-values-report',
    attributes: {
      statistics: [
        'recipients',
        'delivered',
        'open_rate',
        'click_rate',
        'conversion_rate',
        'conversion_value',
        'bounced',
        'unsubscribed'
      ],
      timeframe: {
        start: '2024-01-01T00:00:00+00:00',
        end: '2024-12-31T23:59:59+00:00'
      },
      filter: `equals(campaign_id,"CAMPAIGN_ID")`
    }
  }
}
```

### Series Report (Dados temporais)
```typescript
const requestBody = {
  data: {
    type: 'flow-series-report',
    attributes: {
      statistics: ['open_rate', 'click_rate', 'conversion_value'],
      timeframe: {
        start: '2024-01-01T00:00:00+00:00',
        end: '2024-12-31T23:59:59+00:00'
      },
      interval: 'weekly'  // 'daily', 'weekly', 'monthly'
    }
  }
}
```

---

## Klaviyo Query Metric Aggregates

### Endpoint
```
POST /api/metric-aggregates/
```

### Use Cases
- Extrair engagement data para data warehouse
- Revenue attribution por flow/campaign
- Crescimento de lista por mês
- Contagem de métricas por período
- Recriar reports do Klaviyo UI

### Request Format
```typescript
const requestBody = {
  data: {
    type: 'metric-aggregate',
    attributes: {
      metric_id: 'PLACED_ORDER_METRIC_ID',
      measurements: ['value', 'count', 'unique'],
      filter: [
        'greater-or-equal(datetime,2024-01-01T00:00:00)',
        'less-than(datetime,2025-01-01T00:00:00)'
      ],
      interval: 'month',
      page_size: 100,
      by: ['$attributed_flow', '$attributed_message'],
      timezone: 'America/Sao_Paulo'
    }
  }
}
```

### Measurements Disponíveis
- `count` - Contagem total de eventos
- `unique` - Contagem única (por profile)
- `value` - Valor ($value do evento, ex: revenue)
- `sum` - Soma de valores

### Filtros By
- `$attributed_flow` - Agrupar por flow
- `$attributed_message` - Agrupar por mensagem
- `$attributed_campaign` - Agrupar por campanha
- `Campaign Name` - Nome da campanha
- `$flow` - ID do flow
- `$message` - ID da mensagem

---

## Klaviyo Profiles API

### Endpoints
```
GET /api/profiles/                    # Listar profiles
GET /api/profiles/{id}/               # Buscar profile
POST /api/profiles/                   # Criar profile
PATCH /api/profiles/{id}/             # Atualizar profile
POST /api/profile-bulk-import-jobs/   # Importação em massa
```

### Profile Object
```typescript
interface KlaviyoProfile {
  type: 'profile'
  id: string
  attributes: {
    email: string
    phone_number: string
    external_id: string
    first_name: string
    last_name: string
    organization: string
    title: string
    image: string
    location: {
      address1: string
      address2: string
      city: string
      country: string
      region: string
      zip: string
      timezone: string
    }
    properties: Record<string, any>  // Custom properties
    created: string
    updated: string
    subscriptions: {
      email: {
        marketing: {
          consent: 'SUBSCRIBED' | 'NOT_SUBSCRIBED' | 'UNSUBSCRIBED'
          timestamp: string
          method: string
          method_detail: string
        }
      }
      sms: {
        marketing: {
          consent: 'SUBSCRIBED' | 'NOT_SUBSCRIBED' | 'UNSUBSCRIBED'
          timestamp: string
        }
      }
    }
    predictive_analytics: {
      historic_clv: number
      predicted_clv: number
      total_clv: number
      historic_number_of_orders: number
      predicted_number_of_orders: number
      average_days_between_orders: number
      average_order_value: number
      churn_probability: number
      expected_date_of_next_order: string
    }
  }
}
```

### Bulk Import (até 10,000 profiles)
```typescript
const requestBody = {
  data: {
    type: 'profile-bulk-import-job',
    attributes: {
      profiles: {
        data: [
          {
            type: 'profile',
            attributes: {
              email: 'customer@example.com',
              first_name: 'John',
              last_name: 'Doe',
              properties: {
                custom_field: 'value'
              }
            }
          }
          // ... até 10,000 profiles
        ]
      }
    }
  }
}

// Verificar status do job
// GET /api/profile-bulk-import-jobs/{job_id}/
// GET /api/profile-bulk-import-jobs/{job_id}/import-errors/
```

---

## Klaviyo Segments API

### Endpoints
```
GET /api/segments/                       # Listar segments
GET /api/segments/{id}/                  # Buscar segment
GET /api/segments/{id}/profiles/         # Profiles do segment
POST /api/segments/                      # Criar segment
PATCH /api/segments/{id}/                # Atualizar segment
DELETE /api/segments/{id}/               # Deletar segment
```

### Segment Object
```typescript
interface KlaviyoSegment {
  type: 'segment'
  id: string
  attributes: {
    name: string
    definition: {
      // Definição do segmento em JSON
      condition_group: {
        conditions: Array<{
          dimension: string
          operator: string
          value: any
        }>
        operator: 'and' | 'or'
      }
    }
    created: string
    updated: string
    is_active: boolean
    is_starred: boolean
  }
}
```

### Identificando Engaged 90d
```typescript
// Buscar segment por nome
const response = await fetch(
  'https://a.klaviyo.com/api/segments/?filter=contains(name,"Engaged")',
  { headers }
)

// Ou buscar segment específico e contar profiles
const profilesResponse = await fetch(
  `https://a.klaviyo.com/api/segments/${segmentId}/profiles/`,
  { headers }
)
```

---

## Klaviyo Events API

### Endpoints
```
GET /api/events/                   # Listar eventos
GET /api/events/{id}/              # Buscar evento
POST /api/events/                  # Criar evento
```

### Métricas Nativas Klaviyo
| Métrica | Descrição |
|---------|-----------|
| `Opened Email` | Email aberto |
| `Clicked Email` | Clique em email |
| `Received Email` | Email recebido |
| `Bounced Email` | Email bounced |
| `Marked Email as Spam` | Marcado como spam |
| `Unsubscribed` | Descadastramento |
| `Received SMS` | SMS recebido |
| `Clicked SMS` | Clique em SMS |
| `Subscribed to List` | Inscrito em lista |
| `Placed Order` | Pedido realizado |
| `Ordered Product` | Produto comprado |
| `Viewed Product` | Produto visualizado |
| `Added to Cart` | Adicionado ao carrinho |
| `Started Checkout` | Checkout iniciado |
| `Fulfilled Order` | Pedido enviado |
| `Cancelled Order` | Pedido cancelado |
| `Refunded Order` | Pedido reembolsado |

### Event Properties para Placed Order
```typescript
interface PlacedOrderEvent {
  $event_id: string
  $value: number                    // Valor do pedido
  $extra: {
    order_id: string
    order_name: string
    customer_id: number
    items: Array<{
      product_id: number
      sku: string
      product_name: string
      quantity: number
      item_price: number
    }>
    shipping_total: number
    tax_total: number
    discount_total: number
  }
}
```

---

## Klaviyo Attribution Model

### Como Funciona
- **Multi-channel cooperativo**: Cada canal tem janela própria
- **Janelas configuráveis**: Email e SMS têm janelas separadas
- **Default window**: 5 dias para email, 1 dia para SMS
- **Last-touch attribution**: Última mensagem na janela recebe crédito

### Importante
- Revenue é atribuída à data de ENVIO da mensagem
- Não à data da conversão
- API Query Metric Aggregates usa data do evento
- Reporting API usa data de envio (igual ao UI)

### Obter Revenue por Flow/Campaign
```typescript
// Via Query Metric Aggregates
const requestBody = {
  data: {
    type: 'metric-aggregate',
    attributes: {
      metric_id: 'PLACED_ORDER_METRIC_ID',
      measurements: ['value'],
      filter: [
        'greater-or-equal(datetime,2024-01-01)',
        'less-than(datetime,2025-01-01)'
      ],
      by: ['$attributed_flow'],
      timezone: 'America/Sao_Paulo'
    }
  }
}
```

---

## Implementação de Referência

### Buscar Métricas de Flow
```typescript
async function getFlowMetrics(
  flowId: string,
  apiKey: string,
  startDate: string,
  endDate: string
) {
  const response = await fetch(
    'https://a.klaviyo.com/api/flow-values-reports/',
    {
      method: 'POST',
      headers: {
        'Authorization': `Klaviyo-API-Key ${apiKey}`,
        'revision': '2025-10-15',
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        data: {
          type: 'flow-values-report',
          attributes: {
            statistics: [
              'recipients',
              'delivered',
              'delivery_rate',
              'opened',
              'open_rate',
              'clicked',
              'click_rate',
              'conversion_rate',
              'conversion_value',
              'revenue_per_recipient',
              'bounced',
              'unsubscribed'
            ],
            timeframe: {
              start: startDate,
              end: endDate
            },
            filter: `equals(flow_id,"${flowId}")`
          }
        }
      })
    }
  )

  return response.json()
}
```

### Buscar Pedidos Shopify com Paginação
```typescript
async function getAllOrders(
  shop: string,
  accessToken: string,
  startDate: string,
  endDate: string
): Promise<ShopifyOrder[]> {
  const allOrders: ShopifyOrder[] = []
  let pageInfo: string | null = null

  while (true) {
    const url = pageInfo
      ? `https://${shop}/admin/api/2024-10/orders.json?page_info=${pageInfo}&limit=250`
      : `https://${shop}/admin/api/2024-10/orders.json?limit=250&status=any&created_at_min=${startDate}&created_at_max=${endDate}`

    const response = await fetch(url, {
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json'
      }
    })

    const data = await response.json()
    allOrders.push(...data.orders)

    // Parse Link header for pagination
    const linkHeader = response.headers.get('Link')
    if (!linkHeader || !linkHeader.includes('rel="next"')) {
      break
    }

    const match = linkHeader.match(/page_info=([^>&]+).*rel="next"/)
    pageInfo = match ? match[1] : null

    if (!pageInfo) break

    // Rate limiting: aguardar 500ms entre requests
    await new Promise(resolve => setTimeout(resolve, 500))
  }

  return allOrders
}
```

### Calcular Taxa de Clientes Recorrentes
```typescript
function calculateRecurringCustomerRate(orders: ShopifyOrder[]) {
  // Agrupar pedidos por email do cliente
  const customerOrders = new Map<string, number>()

  for (const order of orders) {
    const email = order.email?.toLowerCase()
    if (!email) continue

    customerOrders.set(
      email,
      (customerOrders.get(email) || 0) + 1
    )
  }

  const totalCustomers = customerOrders.size
  const recurringCustomers = Array.from(customerOrders.values())
    .filter(count => count > 1).length

  return {
    totalCustomers,
    recurringCustomers,
    rate: totalCustomers > 0
      ? (recurringCustomers / totalCustomers) * 100
      : 0
  }
}
```

---

## Links de Referência

### Shopify
- [GraphQL Admin API](https://shopify.dev/docs/api/admin-graphql/latest)
- [REST Admin API](https://shopify.dev/docs/api/admin-rest)
- [Orders Endpoint](https://shopify.dev/docs/api/admin-rest/2024-10/resources/order)
- [Customers Endpoint](https://shopify.dev/docs/api/admin-rest/latest/resources/customer)
- [Webhooks](https://shopify.dev/docs/api/webhooks)
- [Migration Guide](https://shopify.dev/docs/apps/build/graphql/migrate)
- [Pagination](https://shopify.dev/docs/api/admin-rest/usage/pagination)

### Klaviyo
- [API Overview](https://developers.klaviyo.com/en/reference/api_overview)
- [Reporting API](https://developers.klaviyo.com/en/reference/reporting_api_overview)
- [Flows API](https://developers.klaviyo.com/en/reference/flows_api_overview)
- [Metrics API](https://developers.klaviyo.com/en/reference/metrics_api_overview)
- [Events API](https://developers.klaviyo.com/en/reference/events_api_overview)
- [Segments API](https://developers.klaviyo.com/en/reference/segments_api_overview)
- [Profiles API](https://developers.klaviyo.com/en/docs/use_klaviyos_bulk_profile_import_api)
- [Query Metric Aggregates](https://developers.klaviyo.com/en/docs/using_the_query_metric_aggregates_endpoint)
- [Rate Limits](https://developers.klaviyo.com/en/docs/rate_limits_and_error_handling)
- [Versioning Policy](https://developers.klaviyo.com/en/docs/api_versioning_and_deprecation_policy)
- [Changelog](https://developers.klaviyo.com/en/docs/changelog_)

---

## Decisao: Receita Total via Klaviyo (Epic AK, Marco 2026)

### Fontes de Dados

| | Reporting API | Metric Aggregates |
|---|---|---|
| **Endpoints** | `*-values-reports`, `*-series-reports` | `/metric-aggregates/` |
| **Atribuicao** | Data de **envio** da mensagem | Data do **evento** (Placed Order) |
| **Match Klaviyo UI** | Sim (identico ao dashboard) | Nao |
| **Usado para** | Flow/campaign breakdown | Receita total da loja |
| **Rate limit tier** | XS (muito restritivo) | Mais flexivel |

### Decisao

- **Receita total da loja** (`storeRevenue`) = Metric Aggregates (`Placed Order` metric, sem `by`)
- **Receita atribuida** (per-flow, per-campaign) = Reporting API (`flow-values-reports`, `campaign-values-reports`)
- **% atribuicao** = `receita_atribuida / receita_total * 100`

### Diferenca Semantica Esperada

Para o mesmo periodo, `sum(flow_revenue + campaign_revenue)` via Reporting API **nao sera igual** a `storeRevenue` via Metric Aggregates. Isso e **esperado** porque:

1. Reporting API atribui revenue na data de ENVIO da mensagem
2. Metric Aggregates atribui revenue na data do EVENTO (pedido)
3. A janela de atribuicao (5d email, 1d SMS) causa deslocamento temporal

**Threshold aceitavel:** <5% de divergencia para periodos >= 7 dias. Para periodos curtos (1-3 dias), divergencia pode chegar a ~20%.

### Razao da Decisao

- Clientes comparam nosso admin com o dashboard do Klaviyo — Reporting API garante numeros identicos
- Metric Aggregates nao tem cap diario e e mais barato em rate limits para receita total
- Substituir Reporting API por Metric Aggregates foi avaliado e REJEITADO (divergencia inaceitavel)

**Referencia:** `docs/architecture/adr-klaviyo-revenue-source.md`

---

## CRM Convertfy (Fases 1-7 completas)

CRM **nativo** integrado ao admin. Deals referenciam `clients`/`client_stores`
via FK; nada e duplicado. Dois escopos: `sales` (aquisicao) e `cs` (customer
success). Tabelas estendidas: `pipelines`, `pipeline_stages`, `deals`. Tabelas
novas: `crm_leads`, `crm_contacts`, `crm_partners`, `crm_deal_history`,
`crm_deal_activities`, `crm_deal_tags`, `crm_health_history`.

Design tokens em `src/styles/crm-tokens.css` com prefixo `--crm-*`. Regras
nao-negociaveis: border-radius 4-6px (nunca 8px), brand PRETO (#1F1F1F)
nunca azul/roxo, densidade alta (cards 280px, rows 36px), cinzas dominam
(80% da UI), sem sombras grandes (cards usam border).

APIs em `/api/crm/*` seguem o padrao do projeto: `createAdminClient` + Zod
+ `errorResponse/successResponse`. Tipos em `src/types/crm.ts`.

**Mensageria**: WhatsApp Cloud API oficial (v20.0) — webhook em
`/api/webhooks/whatsapp` com HMAC SHA-256, send via channel config,
inbox unificado em `/admin/crm/inbox`.

**Automacao**: DAG em JSON versionado em `automations.dag`. Executor em
`crm-automation-executor.service.ts` com 9 node types (trigger, condition,
wait, send_whatsapp, create_activity, assign_owner, move_stage,
update_deal, ai_action). Builder visual ReactFlow em
`/admin/crm/automations/[id]`. Triggers disparados em deal_created,
deal_stage_change, lead_created (fire-and-forget via dispatcher).

**AI Actions**: prompts versionados (Anthropic Messages API direto, sem
SDK), output validado por JSON Schema antes de aplicar no entity-target.
Telemetria de tokens/cost em `crm_ai_action_runs`.

**BI snapshot-first**: cron diario `/api/cron/crm-snapshot` (06h UTC)
popula `crm_pipeline_snapshots`, `crm_org_snapshots` e
`crm_lead_funnel_snapshots`. Reports em `/admin/crm/reports` leem direto
sem agregacao (recharts + export CSV). Health score em
`/api/cron/crm-health-compute` (05h UTC) com componentes email 35% +
revenue 30% + tickets 20% + NPS 15%.

**Atalhos**: Cmd+K (palette global) + sequencia "g+letra" no scope
/admin/crm/* (g+l=leads, g+p=pipelines, g+c=CS, g+i=inbox, g+a=
automacoes, g+r=reports, g+d=dashboard).

Documentacao completa em `docs/crm/`.

---

## Status canônico Epic AE (Agent Email Generation)

A partir da migration `20260530_agent_email_generation.sql`, `email_flow_emails.status` aceita:

| Status | Significado | Terminal? |
|--------|-------------|-----------|
| `draft` | Email criado, ainda não enfileirado | Não |
| `pending` | Agendado para gerar (na fila) | Não |
| `copy_generating` | N8N processando copy | Não |
| `copy_generating_recovery` | Fallback in-process após watchdog | Não |
| `copy_ready` | Copy gerada, aguardando fase 2 | Não |
| `rendering` | Gerando imagem + HTML | Não |
| `qa_running` | QA agent validando | Não |
| `ready` | Pronto para o designer | Sim |
| `failed` | Erro irrecuperável (ver `failure_reason`) | Sim |
| `in_progress`, `approved`, `live` | Status LEGACY (Epic 8/9 Klaviyo) — não use em código novo | — |

Tabelas novas do epic: `email_generation_queue_signals` (sinal de fila — trigger
`fn_on_briefing_confirmed` insere quando `store_briefings.status='confirmed'`)
e `email_status_events` (audit log + SSE bus — trigger
`fn_log_email_status_change` insere a cada transicao de status).

Sistema de tags em `profiles.tags TEXT[]`: rota `cto` para alertas de falha
do pipeline AE. Marcar via SQL/Supabase Studio até existir UI de gestão.

**Tag `dev` (Story AE-8)**: profiles com `tags @> ARRAY['dev']` podem
gerenciar prompts em `/admin/agents/prompts` (API `/api/admin/agents/prompts/*`
aceita admin/owner OR tag `dev`). A sidebar mostra o link apenas para
admin/owner — devs com a tag acessam por URL direta. Comportamento intencional
para reduzir poluição da nav para devs ad-hoc.

Tipos canônicos:
- `EmailStatus` em `src/types/email-workspace.ts`
- `QaIssue` em `src/types/email-generation.ts`
- Perfil/tags: usar os tipos de `src/types/index.ts` (o antigo `src/types/profile.ts`
  foi removido na limpeza de jul/2026 — nunca chegou a ter importadores)

Referência: `docs/architecture/adr-agent-email-generation.md`.

---

## Pipeline de Geração de Emails do Onboarding (8 agentes)

Ordem real de execução. Os 2 primeiros montam o CONTEXTO (marca/pesquisa);
os 6 últimos rodam por email (fase 2).

```
Briefing → [Pesquisa & Diagnóstico] → Montador → Blueprint → Copy(n8n) → Imagem → HTML → QA
```

Modelos vivem em `email_agent_configs` (agent_type, model, system_prompt,
user_template, temperature, max_tokens, is_active). Carregados via
`loadActiveAgentConfig(agent_type)`; UI em `/admin/settings/email-generation?tab=agents`.
Migrations fazem `UPDATE` in-place da linha ativa. Model id com "/" roteia via
OpenRouter; sem "/" usa Anthropic SDK direto.

| # | Agente | Arquivo | Modelo (config) | INPUT | OUTPUT |
|---|--------|---------|-----------------|-------|--------|
| 1 | **Briefing** | `briefing-generation.service.ts` | cascata `claude-sonnet-4-6` → `openai/gpt-5.3-chat` → template | `form_responses` + pesquisa (`pesquisaToFullText`) | `onboardings.briefing` (JSON BriefingContent) |
| 2 | **Pesquisa & Diagnóstico** | n8n callbacks `/api/webhooks/n8n/{brand,competitors,icp,tone,ads-analyzer}` | n8n + agentes | URL da loja | 5 pilares em `client_stores` (`brand_*`,`store_*`,`icp_*`,`tone_*`,`ads_*`) |
| 3 | **Montador** (Component Assembler) | `architect/component-assembler.service.ts` | **`anthropic/claude-opus-4.8`** (OpenRouter) · T=0.3 · max 16384 | briefing+pesquisa+outline+`structure`+`reference_template_html`+biblioteca | HTML de ARQUITETURA → `store_email_references` (só persiste se `usedLlm`) |
| 4 | **Blueprint** | `architect/blueprint-generator.service.ts` | `anthropic/claude-sonnet-4.6` (OpenRouter) · T=0.4 · max 8192 | o HTML do Montador + contexto | JSON `{objective,messaging,subject_hint,blocks[]}` → `store_email_blueprints` (só persiste se `source='ai'`) |
| 5 | **Copy** | `email-copy-webhook.service.ts` + callback `/api/webhooks/n8n/email-copy` | n8n (externo) | store+blueprint+blocos vazios | `email_flow_emails.subject/preheader` + `email_blocks.content`; status `copy_ready` |
| 6 | **Imagem** | `phase2-runner.service.ts` + `chains/image.chain.ts` | **`openai/gpt-5.4-image-2`** (OpenRouter) · 90s | blocos `needs_image` + `image_brief` | `email_blocks.content.image_url`/`image_alt`; status `image_done` |
| 7a | **Hero Section** | `chains/hero.chain.ts` + `html/format-context.ts` | `z-ai/glm-5.2` (seed 20261039) · 240s | Montador HTML + região da hero + `html`/`rendered_html` da variante escolhida (cascata slot_map→blueprint→choices) + copy/imagem da hero + fontes/cores + logos clara/escura | fragmento da hero, splice por código (sentinelas `cfy:hero`); modos marker/tag/full-doc |
| 7b | **Formatação de Texto** | `chains/text-format.chain.ts` | `z-ai/glm-5.2` · 540s | HTML do 7a + copy do n8n (sem hero) + fields do blueprint + fontes/cores | documento completo; guards (tabelas, shrink, tags de imagem sobrevivem, hero re-spliced se mexer) |
| 7c | **Formatação de Imagem** | `chains/image-format.chain.ts` + `html/apply-patches.ts` | `z-ai/glm-5.2` · 180s | HTML do 7b + image_map (sem hero) + logos | JSON de ops (img/remove_slot/replace) aplicado por código; hero proibida |
| 7d | **Cores & Botões** | `chains/color-format.chain.ts` (substitui o Refinador) | `z-ai/glm-5.2` · 240s | HTML do 7c + paleta com papéis + nicho/tons/pesquisa | JSON de ops replace (só cores; pode tocar a hero); **FAIL-OPEN** |
| 8 | **QA** | `chains/qa.chain.ts` | `claude-sonnet-4-6` (config) · 60s | HTML final + blocks + briefing + brand | `email_flow_emails.qa_issues` + `passed`; status `ready`/`failed` |

**Split do HTML agent (migration 20261039, jul/2026 — corte seco)**: o agente
`html` monolítico e o `refiner` foram DESATIVADOS (configs `is_active=false`,
chains deletados) e substituídos pela cadeia 7a→7d, que roda inteira no status
`rendering` com: resume por `email_flow_emails.html_pipeline_stage`
('hero'|'text'|'image' = último step concluído; watchdog re-entra do ponto),
retry 1x por step (2º erro → `failed` com `hero_failed`/`text_format_failed`/
`image_format_failed`; 7d é fail-open), budget dinâmico da rota
(`PHASE2_CHAIN_BUDGET_MS`, default 760s) e telemetria por step em
`email_generation_runs` com sha8 encadeado (output de um step = input do
próximo) + custo real do OpenRouter. O Montador agora persiste a escolha POR
PARTE em `store_email_references.slot_map` e envolve cada bloco com
marcadores `<!-- cfy:block:{i}:{section}:start/end -->` (hero-locator modo
marker; legado cai no modo tag; irrecuperável → full-doc). O strip de
placeholders + lang rodam UMA vez no fim da cadeia (após 7c). Executor legado
`generateEmail` + rotas `generate-flow`/`test-generate` removidos. Nos logs, a
linha sintética "Montagem HTML" soma os 4 agentes + legados.

**Papel-chave**: o Montador (#3) GERA a arquitetura HTML (esqueleto, ordem dos
blocos, CSS variables, placeholders `{{HEADLINE}}`) UMA vez por loja×email; a
cadeia 7a-7d só FINALIZA (hero, copy, imagens, cores) — nunca redesenha.

**Fallback por email**: Montador e Blueprint só gravam quando geram de verdade
(`if usedLlm` / `if source==='ai'`). No fallback NÃO gravam → consumidor cai no
template global (`email_reference_templates` / `email_blueprints` / `DEFAULT_BLUEPRINTS`).

**Dispatch NÃO roda o Montador inline** (timeout 504): `dispatchEmailCopyWebhook`
usa o que existir em `store_email_references`/`store_email_blueprints` + fallback
global. No fluxo NATURAL o Architect roda via fila: o callback
`/api/webhooks/n8n/pesquisa-completa` ENFILEIRA um job em `email_dispatch_jobs`
(`enqueueDispatchJob` — dedup de job ativo, skip de reference existente, bypass
se Architect não configurado) e o cron `/api/cron/email-dispatch-queue` (every
minute, maxDuration 300) roda Montador+Blueprint por email em lotes; o dispatch
pro n8n só sai quando TODOS os emails estão settled (done = reference
persistida; failed = tentativas esgotadas → fallback global por email). O
disparo de copy na aprovação do briefing (`confirmBriefing`) foi REMOVIDO — o
payload saía sem pesquisa e o guard `batch_in_progress` pulava o re-dispatch.
O botão manual "Gerar copies" continua disparando direto (sem Architect).
Gerar/regenerar reference por loja = `POST /api/admin/stores/[id]/generate-blueprints`
(`maxDuration=300`).

Status machine (INTOCADA pelo split): `draft → pending → copy_generating →
copy_ready → rendering → image_done → qa_running → ready/failed`. A cadeia
7a-7d roda inteira dentro de `rendering`; a granularidade vem da telemetria
(`email_generation_runs`) e de `html_pipeline_stage` (não é status).

---

## Hub de Geração de Emails (redesign jul/2026 — maquete EG)

O hub `/admin/settings/email-generation` (8 abas) foi redesenhado conforme a
maquete "Geração de Emails" (Convertfy DS v3, light-only — precedente
logs-workspace). Átomos compartilhados em
`src/components/email-generation/ui/{eg-theme.ts,eg-atoms.tsx}` (EGCard,
EGInput, EGToggle, EGBadge, EGCatPills, EGRenderFrame...). O workspace virou
shell fino; Settings/References/Test vivem em arquivos próprios.

**Dimensões de matching NOVAS** (migration 20261003): variantes de
`email_component_variants` usam `objectives TEXT[]` (9 rótulos PT: Promoção,
Boas-vindas...) e `tones TEXT[]` (6: Urgente, Premium...) no lugar de
`niche_affinity/positioning/mood` (DEPRECADAS — drop futuro via
`APPLY_MANUALLY_drop_component_legacy_dims.sql`). Fonte única:
`src/lib/agents/shared/component-dimensions.ts` (`flowTypeToObjective`,
`deriveToneKeys`). O deriver (`component-deriver.ts`) pontua
objective=3/tones×2/density=1; o Curador recebe também
`quando_usar/quando_nao_usar/product_slots` no JSON de candidatos
(prompt atualizado na migration 20261004).

**Variantes enriquecidas**: `when_use`, `when_not_use`, `copy_guidance`,
`long_description`, `product_slots`, `output_schema JSONB`
([{key,label,type∈text_short|text_long|number|url|image|boolean,max_len,
required,example,guidance}]). Teste ad-hoc por variante: `POST
/api/admin/components/[id]/test` (agente `component_test`, migration
20261006, telemetria em email_generation_runs quando há loja).

**Settings do pipeline** (migration 20261005, aba Configurações):
`qa_vision_enabled` (NULL=env), `refiner_enabled`, `max_blocks_per_email`
(clamp no generate.service), `default_model` (fallback sem config ativa),
`usd_brl_rate` (override do câmbio nos gen-logs), `cost_alert_usd`
(notifyCostAlert in-app após rollup).

**Aba Geradas**: tabela global via `GET /api/admin/generated-emails`
(email_flow_emails com generation_batch_id, índice parcial
idx_efe_generated_recent) + drill-down no GeneratedInspector.

**Teste com contexto livre**: `test_context` no POST generate-email vai
APENAS pro payload de copy do n8n (chave aditiva `test_context`) — NÃO pro
Architect, porque a arquitetura/blueprint/variantes são persistidos em
store_email_references/store_email_blueprints (linha de produção reusada
pelo dispatch) e enviesá-los com contexto de teste vazaria pra copies de
produção. O payload de copy também leva `component_variants` por email
(variant_id, name, copy_guidance, output_schema — aditivo; n8n ignora até
consumir).

**Autorização das rotas do hub**: todas as rotas novas/alteradas
(`/api/admin/components*`, `generated-emails`, `email-generation-settings`)
usam `assertCanManagePrompts` (admin/owner OU tag `dev`) — mesmo gate das
rotas de prompts/logs, via helper em `prompt-management.service.ts`.

---

## Blueprint híbrido + payload n8n v2 (jul/2026)

O agente Blueprint virou **determinístico-primeiro com LLM fallback
normalizado** (migrations 20261022-24). Router em
`blueprint-generator.service.ts`:

- **Rota A (determinística)**: `mode='auto'` + skeleton OK
  (`extractStructureFromReference`) + cobertura 100% dos blocos de copy —
  ou `mode='deterministic'`. Builder puro em
  `deterministic-blueprint.builder.ts`: casa variantes do Curador com o
  skeleton (FIFO por categoria via `blockTypeToCategory`), purpose ←
  `copy_guidance`, image_brief ← campos type=image do `output_schema`.
  Subject via mini-LLM `subject` (Haiku, config própria). Persiste com
  `model='deterministic'`, custo ~zero.
- **Rota B (LLM fallback)**: skeleton null, cobertura <100% ou
  `mode='llm'` — fluxo LLM de antes, intacto.
- **AS DUAS rotas terminam em `packageBlueprint`** (normalizador único):
  todo bloco sai com `variant_id/variant_name` + `fields` v2
  (`{key,label,type,max_len,min_len,required,example,guidance,tag,source}`,
  source ∈ schema|tag_registry|llm). Tipo canônico `BlueprintBlockField`
  em `src/types/email-generation.ts`. O n8n nunca percebe qual rota rodou.
- Kill-switch sem deploy: `email_generation_settings.blueprint_mode`
  ('auto'|'llm'|'deterministic', aba Configurações). Telemetria: run
  `agent='blueprint'` com `parsed_output.blueprint_path`
  ('deterministic'|'llm_fallback') + coverage + fallback_reason.

**Payload n8n v2** (`docs/email-copy-payload-v2.md`): `fields` v2 é a
ÚNICA fonte por bloco (snapshot do blueprint → tag_registry → conversão
do copy_spec); `copy_spec` REMOVIDO do payload; `variant_id/variant_name`
por bloco; `objective` + `tones` canônicos por email; `estrutura_geral`
para TODOS os emails. O flow do n8n deve ser atualizado na MESMA janela
do deploy (rollback = revert do admin). Callback audita a copy contra o
snapshot de fields (`findFieldDeviations` em copy-spec.ts) —
observabilidade, nunca rejeita.

**Agentes downstream com dados das variantes**: QA valida
`output_schema` (`runSchemaChecks` — issues `copy_excede_max_len`/
`campo_obrigatorio_vazio`, não-bloqueantes); Montador recebe
`notas_implementacao` (long_description); Refiner recebe `{{tones}}`;
editor de variantes avisa incoerência key↔tag
(`validateSchemaTagCoherence`, warning não-bloqueante).

---

## Épico Taguedor (jul/2026 — migration 20261040)

Paradigma: variante da biblioteca é um **exemplo PRONTO** (HTML com frases/
URLs reais); o `output_schema.key` É o nome do placeholder (`UPPER(key)`)
e o `example` referencia a frase que está no HTML. O agente
`component_tagger` (z-ai/glm-5.2, roda 1x por variante — cadastro/batch,
NUNCA por geração) converte exemplo→`{{PLACEHOLDER}}` e salva em
`email_component_variants.html_tagged` como proposta `tagging_status=
'pending'` com relatório por campo em `tagging_meta` (âncoras: exact/
fuzzy/inference/existing_tag/not_found). Aprovação é HUMANA (aba
Componentes: card Taguedor — relatório, revisão lado a lado editável,
preview, aprovar/rejeitar; botão "Sincronizar biblioteca" roda 1 variante
por chamada via `/api/admin/components/tag-batch` com `exclude_ids`
anti-poison — progresso feitas/total atualiza a cada variante).

**Consumo**: `effectiveVariantHtml` (shared/component-dimensions) =
`html_tagged` quando `approved`, senão `html` — usado pelo Montador
(chosen_html_json + fallback), pelo builder do blueprint e pelo guard
`variantHasPlaceholders` (elegível com {{TAG}} no html OU tagged
aprovado). O `html` original segue como gold reference do agente de hero.
`fields.tag` resolve também por match literal `{{UPPER(key)}}` no HTML
efetivo (além de copyKey/nome do tag-registry); o skeleton
(`extractStructureFromReference`) aceita `opts.schemaTags`
(`schemaTagsFromSlots`) — placeholders schema-backed contam no threshold
canônico e entram nas `tags[]` do bloco sem mexer em copy_spec.

**Naturezas** (`ComponentOutputField.nature`, seletor na aba Componentes;
ausente → deriva: `image`→`imagem_gerada`, resto→`copy`): payload de copy
do n8n leva SÓ `copy` (filtro no dispatch); `IMAGE_SLOTS`/`image_brief`/
`needs_image` só consideram `imagem_gerada` (schema com imagem gerada
liga needs_image mesmo sem tag canônica); `asset_fixo` = arte intacta —
fora de tudo (QA `runSchemaChecks` e `findFieldDeviations` só cobram
`copy`). Snapshot `BlueprintBlockField` carrega `nature` explícita;
snapshots antigos derivam por tipo (zero breaking).

**Fase A — arquitetura por slots (migration 20261042,
`docs/email-generation/arquitetura-slots.md`)**: o Integrador
(`apply-patches.ts`) tem protocolo único `{"ops":[...]}` com `set_text`
(todas as ocorrências, MSO; `<>` neutralizados; imune a `$`) e
`remove_row`, + matriz de posse `allowedTags` (op fora da alçada →
`ownership_rejected`). Estágio `copy_merge` (`html/copy-merge.ts`, run
`agent='copy_merge'`, custo zero) roda entre Hero e texto: campo `copy`
com `fields.tag` + valor do n8n é trocado por CÓDIGO; merge resolveu
tudo → text_format é PULADO (run `skipped`). Métricas por run:
slots_total/ops_built/merged/left_for_llm/unanchored_keys/ops_skipped +
len/sha8. Steps de JSON (image_format/color_format) rodam com
`reasoning: {enabled:false}` no OpenRouter (`FORMAT_OPS_REASONING=on`
re-liga). Pendente: A3b (view por slot no agente de exceção) e Fases B-D.

---

*Última atualização: Julho 2026*
*Versões: Shopify 2024-10, Klaviyo revision 2025-10-15*
