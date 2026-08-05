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

**Gestão de canais** (`/admin/comercial/canais`, jul/2026): o inbox lista
threads por org — NUNCA por canal — então trocar de número deixa as
conversas antigas na caixa para sempre, e "Remover" só desativa
(`is_active=false`). Ações no card: `purge-threads` (GET = prévia
contada, POST `mode: archive|delete`) limpa as conversas de um canal
ativo; `DELETE /api/crm/channels/[id]` exclui o canal desativado de vez
(CASCADE leva threads, mensagens e templates). Os dois limpam as
notificações in-app das threads — elas se ligam por
`metadata->>thread_id`, sem FK, e sobreviveriam ao CASCADE.

**Importação de histórico do WhatsApp** (migration 20261065): o WhatsApp
só entrega conversas antigas NO PAREAMENTO (`syncFullHistory`), e o
risco de banimento está concentrado nesse momento — depois, ler o banco
da Evolution é HTTP entre servidores nossos. Daí o modelo PULL: o
webhook NÃO assina `MESSAGES_SET` (um POST único de milhares de
mensagens estoura o limite de 4,5 MB do Vercel e toma 413 antes do nosso
código, sem log nem retry); em vez disso, job em `crm_history_import_jobs`
com cursor (conversa + página), processado pelo cron
`/api/cron/crm-history-import` (a cada minuto, budget 240s, claim
atômico contra execuções concorrentes). Modo `dry_run` mede sem gravar.
`crm_messages.is_historical` marca o importado: não conta como não-lida
e permite rollback seletivo. O trigger da thread passou a usar
`GREATEST` no `last_message_at` — antes sobrescrevia sem comparar e
qualquer mensagem fora de ordem afundava a conversa no inbox.
Riscos e plano em `docs/crm/whatsapp-history-sync-{riscos,plano}.md`.

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

## Inbox e leads: automação por mensagem, duplicados, fila SLA (ago/2026)

**Gatilho `thread_message_received` agora DISPARA** (era fantasma desde a
fase 5 — estava no builder mas nenhum webhook o emitia). Ponte em
`crm-thread-trigger.service.ts`, chamada pelos webhooks de Instagram
(DM + comentário) e WhatsApp após persistir a mensagem. Filtros do
gatilho: `channel_type`, `event_kind` (message|comment) e
`first_message` (só a 1ª do contato — sem isso, fluxo que cria negócio
criaria um por resposta). Fire-and-forget: falha de automação nunca
derruba a ingestão. Idempotência por `external_message_id` (a Meta
reenvia webhooks; o executor já deduplicava por `idempotency_key`).

**Ação `action_create_deal` implementada** (também era fantasma: tinha
tipo mas não tinha case no executor nem entrada na palette). Config:
pipeline/etapa/dono/título. Idempotente por conversa (thread com
`deal_id` reusa); vincula `crm_threads.deal_id`; dono em cascata
(config → quem atende → default do pipeline → 1º membro ativo, porque
`deals.owner_id` é NOT NULL). É o "respondeu direct → entra na pipeline".

**Duplicados + merge** (`crm-lead-merge.ts`, 18 testes): duplicado =
mesmo email OU mesmo telefone (variantes BR do 9º dígito via
`phoneKeys`); nome igual NÃO é chave. Merge preenche-vazio (sobrevivente
nunca perde dado), tags união, notas concatenam, herda status mais
avançado. Rota `GET/POST /api/crm/leads/duplicates` re-aponta FKs
(deals, threads, activities, submissions, automation_runs,
conversion_events) ANTES de apagar — as FKs são SET NULL e apagar
primeiro desligaria o histórico. UI: botão "Duplicados" na página de
Leads → dialog com radio de sobrevivente (sugestão: mais dados;
convertido é âncora).

**Fila com SLA no inbox** (`crm-inbox-sla.ts`, 11 testes): conversa
"aguardando" = última mensagem do contato + status open/pending. Faixas
15min/60min (warn/critical). Toggle Recentes|Fila na lista (fila =
quem espera há mais tempo primeiro); badge de espera colorido no lugar
do horário quando warn+. `last_message_at` é proxy (SUBestima a espera
quando o contato manda várias seguidas — documentado no módulo).

**SMS**: nada implementado — bloqueado na escolha de provedor.

---

## Metas, previsão e performance — P1 (jul/2026, migration 20261055)

Painel do gestor no topo do dashboard comercial (`performance-panel.tsx`),
alimentado por `GET /api/crm/performance` — uma rota só porque os quatro
blocos leem os MESMOS deals. Cálculos em `crm-performance.ts` (26 testes,
puro): é aritmética com armadilha (divisão por zero no dia 1, histórico
fora de ordem, meta contada duas vezes).

**Meta** (`crm_sales_goals`): `revenue_won` (R$) ou `deals_won` (nº), por
month|quarter|year. `owner_id` NULL = meta do time, `pipeline_id` NULL =
todos os pipelines de vendas (o schema suporta meta individual/por
pipeline; a UI hoje só edita a do time — abrir depois não quebra nada).
UNIQUE com COALESCE porque UNIQUE ignora NULL. POST é upsert por período
(o índice usa COALESCE, fora do alcance do `onConflict` do PostgREST —
por isso a rota busca-e-decide). `computeGoalProgress` devolve percent
SEM TETO (bater 120% precisa aparecer), `paceNeeded` null quando o
período acabou e projeção linear que não divide por zero no dia 1.
Barra do card: preenchimento = realizado, marca vertical = onde o
período está — marca à frente da barra é o sinal visual de atraso.

**Forecast** (`buildForecast`): negócios ABERTOS agrupados por mês de
`expected_close_date`, com valor bruto e ponderado por `probability`
(ausente = 50%, fora da faixa é clampeada). Sem data prevista fica FORA
da conta (entrar num mês arbitrário inflaria a previsão) e a UI diz
quantos ficaram de fora. Barra clara = bruto, escura = ponderado; a
diferença é o risco.

**Por responsável** (`computeOwnerStats`): ganho/perdido/aberto, win
rate, ticket e ciclo. `winRate` é NULL sem nada fechado — 0% seria
mentira. Abertos entram inteiros (pipeline atual), fechados só os do
período.

**Tempo por etapa** (`computeStageDurations`): reconstrói as passagens a
partir de `crm_deal_history` (janela 180d). A permanência na etapa ATUAL
NÃO entra — ela não terminou, e incluí-la faria a etapa onde tudo está
parado parecer a mais rápida. Ordena eventos por data (o histórico chega
fora de ordem) e expõe mediana além da média (um deal parado há 2 anos
distorce a média).

---

## Operação do pipeline — P0 do gap vs Pipedrive (jul/2026, migration 20261054)

Quatro lacunas de uso diário, atacadas juntas porque compartilham estado.

**1. Visão de tabela** (`deals-table.tsx`): toggle Kanban|Tabela na barra
de filtros, preferência por pipeline em `localStorage`
(`crm:view-mode:{id}`). Lê a MESMA `filteredDeals` do board — alternar
visão nunca muda o conjunto. Colunas: negócio+cliente, etapa (pílula da
cor da stage), valor, responsável, próxima ação, dias parado. Colunas
somem progressivamente no mobile (`hidden sm/md/lg:table-cell`); header
sticky; `aria-sort` por coluna.

**2. Ordenação e seleção** (`deals-table-utils.ts`, 24 testes — lógica
pura, fora da UI): `toggleSort` (coluna nova começa na direção natural —
valor/data/parado em desc, texto em asc), `sortDeals` (nulos SEMPRE no
fim independente da direção; empate desempata por id pra ordem ser
estável entre renders; etapa ordena por posição no funil, não por nome),
`resolveSelection` (shift+click seleciona intervalo e só ADICIONA),
`pruneSelection` (**descarta da seleção o que saiu do filtro** — sem
isso a ação em massa acertaria deal fora da tela).

**3. Ações em massa** (`POST /api/crm/deals/bulk` + `deals-bulk-bar.tsx`):
assign_owner, add_tags/remove_tags, move_stage, archive. Máx 200 ids.
Barra FLUTUA (não empurra o board), Esc limpa a seleção, etapa terminal
e arquivar pedem confirmação. Cada ação grava atividade `system` na
timeline de cada deal (auditoria). **Exclusão definitiva ficou de fora**
de propósito e **automações de stage_change NÃO disparam em lote** —
mover 50 deals mandaria 50 mensagens ao cliente.

**4. Visões salvas** (`crm_saved_views` + `saved-views-menu.tsx`):
guarda filtros + ordenação + modo como recorte nomeado; privada por
padrão, `is_shared` publica pra org (só o dono edita/apaga). Bolinha no
botão = recorte alterado e não salvo. UNIQUE por (dono, pipeline, nome
normalizado). Rota degrada com `schema_missing` se a migration não rodou.

**Deal sem próxima ação** (`deal-card.tsx`): negócio aberto sem atividade
agendada agora aparece marcado ("Sem próxima ação", tone neut) em vez de
célula vazia — é o que morre no funil em silêncio. `next_step` já vinha
calculado de `/api/crm/pipelines/[id]`; faltava expor o caso vazio.

**Incidente "card volta pra etapa anterior" (ago/2026, migration
20261066)**: arrastar deal pra coluna de ganho revertia o card. Causa: o
trigger `ensure_onboarding_on_deal_won` (ponte venda→onboarding, publica
`deal.won` em `events`) referenciava `NEW.created_by`/`NEW.org_id` —
colunas que `deals` NÃO tem — e PL/pgSQL só avalia o INSERT quando o
gate de ganho passa (nome 'Ganho'/'Fechado'/etc OU stage_type='won'):
erro só nessas colunas → UPDATE abortado → 500 → kanban reverte. Fix:
trigger FAIL-OPEN (campos incertos via `to_jsonb(NEW)`, org_id em
cascata coluna→org_members do owner, INSERT em bloco EXCEPTION — evento
nunca bloqueia o move). Regra derivada: trigger de ponte/telemetria em
tabela de ação do usuário SEMPRE fail-open. No client, `onDragEnd` não
muta mais o objeto do prop (revert de verdade) e falha de move mostra
toast com a mensagem da API — reverter em silêncio vira "bug de drag".

---

## Produtos no negócio (ago/2026 — migration 20261067)

Estilo Datacrazy/Pipedrive: `crm_products` (catálogo da org — nome único
por org via lower(name), preço padrão, billing one_time|recurring +
intervalo) e `crm_deal_products` (itens do deal com SNAPSHOT de
nome/preço + qtd + desconto%; product_id SET NULL). **Com itens,
`deals.value` = soma das linhas** (recalculado pelas rotas via
`recalcDealValue` — app-level, não trigger, regra do incidente 20261066;
remover o último item NÃO zera o valor, volta ao modo manual). Cálculo
puro em `crm-deal-products.ts` (30 testes — arredonda 2 casas POR LINHA).

**Intervalos de recorrência (migration 20261069)**: domínio canônico
monthly|quarterly|semiannual|yearly (Semestral faltava — o CHECK antigo
não aceitava). A LINHA do negócio carrega `recurring_interval` como
SNAPSHOT (backfill do catálogo na migration); NULL = mensal. Helpers no
módulo puro: `intervalLabel/intervalSuffix` ("/mês", "/tri", "/sem",
"/ano" — o bug era "/mês" em tudo), `cyclesPerYear`, `recurringByInterval`
(breakdown por ciclo pros rodapés) e `annualizedTotal` (12m = únicos +
recorrência × ciclos/ano — semestral ×2, NÃO ×12; usado no "Em 12m" do
drawer e da ficha via `DealProductsMeta.annualized`). "/mês" no hero só
quando é verdade (sem produtos = MRR histórico, ou recorrência 100%
mensal — teste: anualizado == recorrente×12). O WonDealDialog só semeia
a "assinatura mensal" com itens MENSAIS (semear um semestral como
mensalidade cobraria a mais). `deals.value` segue = 1 ciclo de cada item
+ únicos (KPIs intocados). **Preço do catálogo usa a máscara de
CENTAVOS** (o form tinha type=number + parseFloat — "4.000" virava R$ 4,
mesmo incidente da linha do negócio). Sem a migration: retry sem a
coluna nos writes; salvar Semestral no catálogo → 422 apontando a
migration (23514 mapeado).
Excluir produto usado em negócio só DESATIVA. UI: seção Produtos no
DealDrawer (valor manual TRAVA quando há itens; "Em 12m" = único +
mensal×12) e no deal-detail-view; bloco opcional no NewDealDialog (POST
/api/crm/deals aceita `products[]`, fail-open se migration não rodou);
catálogo em `/admin/comercial/produtos` (nav Vendas, id
`comercial.produtos` na matriz de roles). `ProductPicker` tem cadastro
rápido inline ("Criar «q»") e item avulso sem catálogo.

---

## Pacote P0/P1/P2 do comercial (ago/2026 — migration 20261068)

Uma migration consolidada cobre tudo: `note` em crm_deal_products,
`crm_lost_reasons`, `pipeline_stages.required_fields`,
`pipelines.assignment_mode/visibility` e as colunas de retomada de
automação (`resume_at/resume_node_id/context_snapshot` + status
'waiting' no CHECK).

**Preço BR nos produtos**: inputs de preço usam máscara por CENTAVOS
(padrão do NewDealDialog) e entrada livre passa por `parseBRNumber`
("10.000" = dez mil — ponto+3 dígitos sem vírgula é MILHAR; o
parseFloat entregava 10 e o negócio nascia 1000x menor). Item de
produto tem `note` (observação livre, edição pela linha).

**Wait real nas automações**: espera >= 30s NÃO roda inline — o run
vira `waiting` com resume_at + snapshot do contexto e o cron
`/api/cron/crm-automation-resume` (a cada minuto, claim atômico
waiting→running) retoma PELAS EDGES do nó wait (não o re-executa).
Wait aninhado re-enfileira. DAG editado no meio (nó sumiu) → failed com
mensagem clara. Sem a migration, degrada pro comportamento antigo
(espera pulada, run completed). Builder configura em min/h/dias
(sempre grava `seconds`).

**Campos obrigatórios por etapa** (`required_fields` JSONB, chaves:
value|expected_close_date|client|phone|products): validados na rota de
MOVE ao entrar na etapa → 422 com lista legível (o board mostra no
toast); editor por etapa no pipeline-settings-dialog (botão ListChecks).
Lógica pura em `crm-required-fields.ts` (8 testes). O bulk move NÃO
valida (mover 50 travaria no primeiro incompleto) — documentado.

**Rodízio** (`assignment_mode='round_robin'`): aplica em criação SEM
ator humano (form público + action_create_deal); criação manual fica
com o criador. `resolveLeastLoadedMember` em crm-assignment.service
(compartilhado com action_assign_owner). **Visibilidade**
(`visibility='owner_only'`): GET da pipeline filtra deals por owner
quando o user não é admin/dev/coo (roles via org_member_roles com
fallback legado).

**Motivos de perda configuráveis** (`crm_lost_reasons`): GET/PUT
(replace da lista, dedupe case-insensitive); gestão inline no próprio
LostReasonDialog (lápis → um motivo por linha); fallback pros padrões
do código. `deals.lost_reason` segue TEXT — histórico nunca corrompe.

**Export CSV** (`crm-csv.ts`, 6 testes): separador ";", BOM UTF-8,
anti fórmula-injection (=+-@ → prefixo '). Board exporta os FILTRADOS
(client-side); leads refaz a busca com limit 5000 (não exporta só a
página).

**Meta individual**: goal-dialog com seletor Time|vendedor (owners vêm
do by_owner do painel — zero rota nova; pré-preenche meta vigente do
escopo); performance devolve `individual_goals`; ranking mostra "% da
meta" com barra (verde >= 100%).

**Origem editável (migration 20261070)**: `deals.source_type` e
`deals.source_referrer` materializados (o NewDealDialog já enviava e o
dado se PERDIA — não havia coluna nem exibição; era o "veio do Luan e
não do Carlos, não consigo editar"). Vocabulário único em
`crm-sources.ts` (`DEAL_SOURCE_TYPES`, `sourceLabel`,
`sourceSelectOptions` — o dialog importa de lá). OriginBox do drawer
edita a FONTE (select canônico + valor legado preservado no topo da
lista) e o "Indicado por" (texto livre) via PATCH; UTMs seguem
read-only. GET do deal seleciona as colunas com retry sem elas; PATCH e
POST degradam com 422 acionável/strip quando a migration não rodou (o
POST com `...parsed` MORRIA em 42703 e criar negócio quebrava).

**Duplicar negócio**: POST `/deals/[id]/duplicate` — mesma etapa,
sufixo "(cópia)", copia produtos, nasce open com owner=quem clicou;
menu do card. **Merge de negócios**: `/api/crm/deals/duplicates`
(GET grupos = mesmo client/lead com 2+ ABERTOS na pipeline; POST
re-aponta atividades/produtos/threads/history/files ANTES do delete e
recalcula o valor) + dialog no board (botão Duplicados).

**Webhook de saída**: nó `action_webhook` no executor (POST JSON com
contexto, HMAC opcional em X-Convertfy-Signature, timeout 10s, guarda
anti-SSRF de host interno, non-2xx = nó failed) + palette/config no
builder.

**Proposta imprimível**: `/admin/comercial/deals/[id]/proposta` —
documento A4 com itens (nome+observação, qtd × preço − desc.),
subtotais único/mensal, validade 15d; Ctrl+P → PDF. Botões no footer
do drawer e topbar da ficha.

**Agenda**: `/admin/comercial/agenda` (nav Atendimento, id
`comercial.agenda`) — calendário mensal de `crm_deal_activities` com
due_at via `/api/crm/activities/agenda`; chip vermelho = vencida não
concluída, riscado = concluída; clique abre a ficha; toggle "Só minhas".

**Click-to-call**: links `tel:` ao lado do WhatsApp (drawer contato +
footer, topbar da ficha).

**Venda ganha → cliente automático** (`crm-client-link.service.ts`):
`ensureClientForDeal` converte o LEAD do deal em `clients` (match por
email reusa existente — nunca duplica; status 'active'), vincula
`deals.client_id`, marca o lead converted e registra atividade. Roda
FAIL-OPEN quando o deal vira won (rota move + bulk) e sob demanda em
`POST /deals/[id]/link-client`. No funil, "Vincular cliente" é ação de
1 clique que emenda a criação do onboarding (que cria loja fallback via
`createFromDeal`). Distinção reforçada na UI: cadastrar produto no
CATÁLOGO não lança no negócio — empty state da seção Produtos explica e
tem botão "Lançar produto da venda".

**Instagram multi-conta**: o roteamento é nativo (webhook resolve canal
por `entry.id` = external_id; envio usa o token do canal da thread).
Uma conta por canal; MESMO app Meta e MESMO webhook para todas (o HMAC
usa `META_APP_SECRET` único — contas em apps diferentes NÃO funcionam).
O POST de canais bloqueia reconectar a MESMA conta (2 canais ativos com
o mesmo external_id quebrariam o lookup do webhook → 409). Form de
conexão é tutorial em 5 passos com links (ID via Graph Explorer
`me/accounts?fields=instagram_business_account`, token de System User).

**Edição do canal (ago/2026)**: `PATCH /api/crm/channels/[id]` edita
nome, `is_active` (desativar é o pré-requisito do Excluir; reativar
re-checa o conflito de conta → 409) e credenciais do IG — token/ID
novos passam por `resolveInstagramAccount` ANTES de gravar (mesma régua
da conexão; ID de Página é corrigido sozinho). O GET da lista expõe
derivados SEGUROS pro card (`facebook_page_id`, `token_preview`
mascarado 4+4 — o token nunca sai inteiro). Card do Instagram:
Editar (painel inline com dados salvos + webhook URL), Desativar/
Reativar e, desativado, o Excluir genérico.

---

## Fechamento → operacional em um gesto + painel Instagram (ago/2026)

**Cadeia won → pós-venda**: mover pra Ganho (drag, quick-win, tabela E
seletor de etapas do drawer via `onWon`) abre o `WonDealDialog`:
dados do cliente (sobrescrevem — o operador REVISOU) + assinatura/
cobrança (`unified_invoices`, mesma fonte do funil/onboarding) + seção
"Iniciar o pós-venda" (nome/URL/plataforma da loja; nome obrigatório
quando marcado — sem ele nasceria a loja fallback genérica). Tudo via
`POST /deals/[id]/billing`. Sucesso com onboarding mostra painel com
LINK (window.open pós-await é bloqueado); `onboarding_error` no payload
quando pedido e não criado — 200 silencioso viraria "card sumiu".

**`createFromDeal` é idempotente PELO DEAL** (`source_deal_id` +
in_progress, checado ANTES de resolver loja): o cron `process-deal-won`
(a cada minuto, loja fallback "Nome - <deal8>") e o dialog correm em
paralelo — sem isso nasciam DOIS onboardings da mesma venda (a checagem
antiga por client+store não os enxergava como iguais). Se o cron chegou
primeiro, o billing atualiza a loja fallback IN-PLACE com os dados
digitados (nada de loja fantasma desativada) e corrige o
`source_metadata.store_name` denormalizado nas onboarding_tasks.

**`ensureClientForDeal`** (org obrigatória — clients.org_id NOT NULL):
cascata owner do deal → assigned_to/created_by do lead → org do
OPERADOR (`fallbackOrgId`, passado por move/bulk/link-client/billing).
Match por email é SÓ na mesma org (cliente de outra org nunca é
sequestrado); 23505 no insert (UNIQUE org+lower(email)) re-seleciona e
reusa; sem org → `reason: 'no_org'` e as rotas explicam em 422. Org do
passo operacional (loja/onboarding) = org do CLIENTE, fallback operador.

**Painel Instagram** (`/admin/comercial/instagram`, id
`comercial.instagram`, nav Atendimento; deep-link `?channel=<id>` pelo
botão Atividade do card em Canais): perfil + seguidores com deltas
1d/7d/30d + sparkline, posts recentes com últimos comentários
(permalink), importação de conversas. **A API oficial NÃO expõe quem
seguiu/deixou de seguir** — só followers_count; o painel guarda
snapshot diário em `crm_channels.config.follower_history` (JSONB, sem
migration; `instagram-followers.ts`, puro, 11 testes) via GET da
activity route + cron `/api/cron/instagram-snapshot` (15 8 * * *).
Importação (`POST .../instagram/import-history`): Conversations API
(janela recente da Meta, ~20 conversas) → mesmo formato do webhook
(thread por channel+contact, msg idempotente por thread+external_id),
`is_historical` + created_at retroativo (padrão Evolution), threads
novas nascem `resolved` (importar não é atendimento pendente). O
webhook de DM/comment agora REABRE thread resolved no inbound (gap que
a importação expôs — Evolution já fazia). Fetcher da página LANÇA em
não-2xx e extrai `error` string do errorResponse (a mensagem amigável
de token expirado chega ao usuário).

**Incidente "(#100) nonexisting field" em TODAS as chamadas (ago/2026)**:
assinatura clássica de ID errado — o operador cola o `id` da PÁGINA do
`me/accounts` no lugar do `instagram_business_account.id` (é o primeiro
da resposta). `resolveInstagramAccount` (instagram-activity.service, 21
testes com fetch mockado nos formatos reais da Meta) sonda o node com
`?metadata=1`: type=page → segue `instagram_business_account` e devolve
o IG ID; `resolveAndHealInstagramChannel` CURA o canal (config +
`facebook_page_id` + `external_id`, que é a chave de roteamento do
webhook — só se não colidir com outro canal ativo). A cura roda nas
rotas activity/import-history/cron; o POST de canais valida na CONEXÃO
(422 acionável ou correção silenciosa — canal quebrado não nasce).
Conversations tem fallback `/{page-id}/conversations?platform=instagram`
quando a edge do IG User nega com #100. friendlyError mapeia 190
(token) e 100 (ID/permissões) pra instrução concreta; a página mostra
banner verde `account_fix` quando corrigiu sozinha.

---

## Funil Comercial (jul/2026 — migration 20261052)

Dashboard `/admin/comercial/funil` (nav "Analise", atalho `g+f`): funil
Leads → MQLs → Agendamentos → Reuniões → Vendas com cards de tráfego dos
dois lados (investimento, faturamento, ROAS, tx. conversão, ticket médio,
cash collect | CPL, custo/MQL, custo/agend., custo/reunião, CPA, taxa
cash collect) e taxas de conversão entre etapas.

**Semântica das etapas**: `pipeline_stages.funnel_step`
('mql'|'agendamento'|'reuniao'|'venda', NULL = fora do funil) — mapeado
no dialog de configuração da própria página (PATCH da rota de stages). A
migration auto-mapeia as etapas seed por nome (`%agendad%`,
`%reuni%realizad%`, `%qualificad%`) e `stage_type='won'` → venda. Topo
"Leads" = `crm_leads` criados no período (scope sales, org do user).

**Contagem** (`GET /api/crm/funnel`, agregação em runtime como
`/api/crm/dashboard/sales`): um deal conta na etapa X se ENTROU em stage
mapeada pra X dentro da janela — entrada = criação do deal (stage
inicial via `old_value` do primeiro history da janela) ou mudança de
stage em `crm_deal_history` (`field='stage_id'`). Contagem cumulativa
(maxStep ≥ X). "Venda" = `won_at` na janela OU entrada em stage venda.
Filtros: `days`/`from`+`to`, `pipeline_id`, `utm_source/medium/campaign`
(deal.utm com fallback pro utm do lead).

**Investimento**: duas fontes somadas. (a) `crm_ad_spend` MANUAL
(org_id, day, platform, account_name, amount; UNIQUE org+day+platform+
account; coluna `source` manual|meta_sync|google_sync — o funil só soma
`manual` daqui) via `/api/crm/ad-spend` GET/POST + `[id]` PATCH/DELETE.
(b) `crm_ad_insights` SINCRONIZADO da Meta (ver abaixo).

**Conexão Meta Ads (migration 20261053)**: `crm_ad_accounts` (org_id,
platform, account_id `act_*`, access_token CRIPTOGRAFADO via `encrypt()`,
business_id, last_synced_at/status/error) + `crm_ad_insights` (day,
level campaign|adset|ad, entity_id, *_name, spend, impressions, reach,
clicks, ctr/cpc/cpm, leads; UNIQUE ad_account_id+day+level+entity_id).
Token recomendado: System User do Business Manager (não expira). Conexão
valida na Graph API ANTES de gravar (`getAdAccount()`).
APIs: `/api/crm/ad-accounts` GET/POST, `[id]` PATCH/DELETE, `[id]/sync`
POST (maxDuration 300). Cron `/api/cron/crm-ads-sync` (40 6 * * *) roda
janela de 30d SEMPRE — a Meta reprocessa atribuição ~7d retroativos.
Service: `crm-meta-ads-sync.service.ts`; `MetaAdsService.getDailyInsights`
(`time_increment=1`, pagina `paging.next`).
**Gasto total = só nível `campaign`** (somar os 3 níveis triplicaria).

**Atribuição criativo ↔ CRM por NOME** (`crm-ads-attribution.ts`, 15
testes): o padrão de UTM da casa carrega os nomes das entidades —
`utm_source=meta-ads&utm_medium={{adset.name}}&utm_campaign=
{{campaign.name}}&utm_content={{ad.name}}+-+{{placement}}`. O
normalizador baixa caixa, tira acento, converte `+`→espaço e colapsa
espaços; `utm_content` é partido no ÚLTIMO " - " (nome do anúncio pode
conter hífen). Payload `creatives[]` do funil: spend/leads_crm/vendas/
receita/CPL/CPA/ROAS por anúncio — é o que liga gasto a venda real.

**Cash collect ligado ao financeiro/onboarding** (jul/2026): o valor
recebido NÃO é digitado — sai de `unified_invoices` (VIEW que une
`invoices` do Asaas + `client_charges` manuais), a MESMA fonte que o
onboarding usa pra dizer se o cliente pagou, então funil e onboarding
nunca discordam. Regras em `crm-cash-collect.ts` (13 testes):
`resolveCashCollect` soma faturas pagas do `deals.client_id` com
`payment_date >= won_at` (pagamento de ciclo anterior não infla a venda
nova) e `deals.cash_collected` vira OVERRIDE manual que VENCE quando
preenchido — inclusive `0` (venda sem cliente não tem como derivar).
Origem exposta por venda (`payment_source`: asaas|local|mixed|null) e
mostrada como legenda embaixo do valor.

**Ponte venda → onboarding**: `onboardings.source_deal_id` já existia
(trigger `deal.won` → cron `process-deal-won`) mas não era usada na UI.
Agora cada venda do painel mostra a etapa do onboarding + link, ou o
botão "Criar onboarding" (`POST /api/crm/deals/[id]/onboarding`,
idempotente via `createFromDeal`; 422 pedindo pra vincular cliente
quando `client_id` é null), ou "Vincular cliente" quando nem isso existe.

UI: 3 dialogs no topo da página — **Meta Ads** (conectar/sincronizar/
desconectar conta + template de UTM copiável), **Investimento**
(lançamento manual) e **Etapas** (mapeia `funnel_step` de cada stage,
agrupado por pipeline). Painel "Criativos que mais performaram" lista
gasto × leads × vendas × ROAS por anúncio.

**Resiliência (incidente jul/2026 — "Algo deu errado")**: a rota degrada
quando a migration não rodou — `isMissingSchema()` (códigos 42P01/42703/
PGRST204) faz fallback do select sem `funnel_step`/`cash_collected` e
pula as tabelas de ads, devolvendo `schema_missing[]` que a UI mostra
como aviso. No client, `funnel-data.ts` (puro, 8 testes) tem o
`fetchFunnel` que LANÇA em não-2xx (antes `r=>r.json()` devolvia o corpo
de erro como dado válido → `data.ad_spend.entries` explodia no
ErrorBoundary) e o `normalizeFunnelData` que preenche payload parcial.

UI em `src/components/crm/funnel-dashboard.tsx` (+ `funnel-dialogs.tsx`):
página DARK por design (réplica do dashboard de referência de mídia
paga, independente do tema — precedente da sidebar), fora do
CrmPageShell (`-m-4 md:-m-6 lg:-m-8` pra sangrar o padding do admin).
Funil de trapézios em clip-path com **taper fixo** ([100,84,68,54,40]%
— volumes degenerados não deformam a silhueta), pílulas de conversão na
borda direita, cards com tile de ícone em gradiente (exceção
consciente à regra "ícone naked" do DS — pedido do design de
referência), PeriodPicker com range custom e dialogs dark.

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
| 7a | **Hero Section** | `chains/hero.chain.ts` + `html/format-context.ts` | `moonshotai/kimi-k3` (swap 20261047) · 240s | Montador HTML + região da hero + `html`/`rendered_html` da variante escolhida (cascata slot_map→blueprint→choices) + copy/imagem da hero + fontes/cores + logos clara/escura | fragmento da hero, splice por código (sentinelas `cfy:hero`); modos marker/tag/full-doc |
| 7b | **Formatação de Texto** | `chains/text-format.chain.ts` | `moonshotai/kimi-k3` · 540s | HTML do 7a + copy do n8n (sem hero) + fields do blueprint + fontes/cores | documento completo; guards (tabelas, shrink, tags de imagem sobrevivem, hero re-spliced se mexer) |
| 7c | **Formatação de Imagem** | `chains/image-format.chain.ts` + `html/apply-patches.ts` | `moonshotai/kimi-k3` · 180s | HTML do 7b + image_map (sem hero) + logos | JSON de ops (img/remove_slot/replace) aplicado por código; hero proibida |
| 7d | **Cores & Botões** | `chains/color-format.chain.ts` (substitui o Refinador) | `moonshotai/kimi-k3` · 240s | HTML do 7c + paleta com papéis + nicho/tons/pesquisa | JSON de ops replace (só cores; pode tocar a hero); **FAIL-OPEN** |
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
`component_tagger` (moonshotai/kimi-k3, roda 1x por variante — cadastro/batch,
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
re-liga).

**Fases B–D — arquitetura por views (migrations 20261043-46, jul/2026)**:
nenhum agente de formatação recebe mais o documento inteiro (regra: LLM
devolve intenção — fragmento ou ops — e só código escreve no HTML).
(F1) toda op/view carrega `block_id` opcional (= `email_blocks.id`, a
chave do callback do n8n) — rastreabilidade ponta a ponta na telemetria.
(F2) **Verificador de merge** (`merge_verifier`, Kimi K3 via OpenRouter, chain
`merge-verifier.chain.ts`): roda entre o copy_merge e o agente de
exceção, audita o merge com views (`buildMergeVerifierInput`) e tria a
fila (`{block_id, tag, motivo, copy_candidata, acao_sugerida}`); modo em
`email_generation_settings.merge_verifier_mode` ('on_flag' default /
'always' / 'off'); erro → fallback mecânico, NUNCA derruba a geração;
não escreve HTML. (F3) image_format recebe `image_slots_json` ({block_id,
tag, row_html}) + `logo_candidates_json` — sem `{{html}}`. (F4)
color_format recebe `color_inventory_json` (extractor
`html/color-inventory.ts`) e emite op `recolor {from,to}` — troca global
por VALOR de cor aplicada por código (`applyRecolor`, rgba preserva
alpha). (F5) QA recebe `block_views_json` (views extraídas ANTES do strip
dos marcadores; `html/qa-views.ts`) + checks globais em código
(`runGlobalDocChecks`); `QaIssue.block_id` aditivo; qa.chain ganhou
prompts DEFAULT in-code. Migrations 20261044-46 zeram os prompts ativos
de image_format/color_format/qa (corte seco pros defaults — prompt velho
referenciava `{{html}}`).

---

## Enxerto da hero por ID (migration 20261049, jul/2026)

A hero deixou de ser ESCRITA por LLM. O Montador continua **escolhendo** a
variante; quem coloca a região no documento é o CÓDIGO
(`html/hero-graft.ts`), com o HTML **canônico** da biblioteca
(`effectiveVariantHtml` = `html_tagged` aprovado, senão `html`),
placeholders intactos.

Motivo (incidente Luxe Lift): o Montador reescrevia o documento inteiro e
ACHATAVA a variante — banda escura do logo, 2º CTA e subtítulo sumiam
antes de qualquer agente rodar. O agente de hero recebia essa região
achatada e não tinha espelho utilizável, porque o `rendered_html` das
variantes é um mockup-imagem de ~1,7KB (não HTML estrutural) — caía em
"degraded mode" e só reproduzia o que recebeu.

Fluxo no `runFormattingChain` (só quando `stage === null`; no resume o
enxerto já está no HTML persistido):

1. `resolveHeroVariant` (cascata **blueprint → slot_map → choices**).
2. `graftHeroVariant(referenceHtml, effectiveVariantHtml(variant))` —
   `locateHeroRegion` + `spliceHero`. Fragmento `<tr>` entra direto,
   `<table>` é embrulhado em `<tr><td>`; qualquer outra coisa é RECUSADA
   (nunca "conserta"). Status: `grafted | no_region | no_variant |
   invalid_variant` — tudo que não é `grafted` mantém a região do Montador
   (fallback do comportamento antigo, zero regressão).
3. `normalizeFonts` — tipografia da loja aplicada por código na região
   enxertada (heading em declarações com `font-size ≥ 20px`/peso alto/
   `<h1..3>`, body no resto, fallbacks genéricos preservados). Sem isso o
   email sai com 3 tipografias, porque as variantes vêm de origens
   diferentes.
4. Enxerto acontece **antes** de `annotateSlots`, para que os placeholders
   da variante entrem no endereçamento como os demais.

O agente `hero_section` recebe `hero_source` (`library` | `montador`): em
`library` a região é estruturalmente FINAL e o trabalho é **substituição
pura** (copy, imagem, logo, fontes/cores) — `hero_variant_html` e
`hero_variant_rendered_html` vão VAZIOS de propósito (a região já é a
referência, mandá-la duas vezes só dobra o prompt). Em `montador` volta o
modo antigo, com a variante como verdade estrutural a restaurar.

A `empty_slot_rule` deixou de comer CTA: com `hero_content` vazio (copy
ainda não chegou) o agente é proibido de remover qualquer slot — os
placeholders seguem para o `copy_merge` determinístico.

**Por que o blueprint vence o slot_map**: o blueprint é o CONTRATO de
endereçamento da copy — `packageBlueprint` deriva `blocks[].fields[]` do
`output_schema` da variante casada e resolve cada `fields.tag` contra o
HTML EFETIVO dessa mesma variante (`fieldsFromSchema(schema, tags,
effectiveVariantHtml(variant))`). A copy do n8n volta amarrada a esses
fields e o `copy_merge` ancora por `fields.tag`. Enxertar variante
diferente da que gerou os fields deixa as tags do snapshot sem endereço no
documento — merge ancora zero. No fluxo natural as fontes concordam por
construção (`generateStoreBlueprint` recebe os MESMOS `slots` que viram
`slot_map`); divergem quando reference e blueprint são regenerados em
momentos diferentes ou quando o match FIFO deixa o bloco hero sem variante.
Divergência → warn `fmt.hero_variant_mismatch` + `variant_mismatch` no run.

Telemetria no run `hero_section`: `hero_source`, `graft_status`,
`variant_source`, `variant_id`, `variant_mismatch`.

**Escopo**: só a hero. Validado, o mesmo desenho (Montador → IDs, montagem
por código a partir do HTML canônico) se estende às demais seções.

---

## O schema é a base (migration 20261064, jul/2026)

Regra única, sem exceção: **o endereço de um campo no HTML é
`{{MAIÚSCULA_DA_KEY}}`**. `hero_headline` mora em `{{HERO_HEADLINE}}` e em
mais lugar nenhum — não existe apelido, tradução por `copyKey` do
tag-registry, nem "a tag que parece servir esse campo".

**Por quê**: `resolveTagForKey` aceitava três caminhos (copyKey do registry,
nome normalizado da tag, placeholder literal no HTML). Numa variante com
`hero_headline`/`hero_subhead` no schema e `{{HERO_EYEBROW}}`/`{{COUPON_CODE}}`
no HTML, ou um alias casava por acaso ou o campo virava `tag: null` em
silêncio — copy sem endereço e placeholder cru chegando ao email. Nada
gritava em lugar nenhum.

- **Auditor canônico**: `auditSchemaTags` em
  `src/lib/email-workspace/schema-tag-coherence.ts` (puro, client-safe).
  Devolve `anchored`/`missing`/`orphans`. Distingue **tag de sistema**
  (`kind` data/url do registry — LOGO, PREHEADER, `*_URL`, `*_ALT`; nunca
  órfã, a plataforma preenche), **tag de copy órfã** e **tag desconhecida**.
  `missing[].legacyTag` NÃO é fallback: é a proposta de retagueamento.
- **Blueprint**: `fieldsFromSchema` perdeu o parâmetro `blockTags` — a tag é
  `placeholderForKey(key)` e ponto. Campo sem âncora sai com a tag
  PREENCHIDA (o contrato é o schema) e vira erro de CADASTRO em
  `schemaAnchorIssues`/`collectSchemaAnchorIssues` → telemetria das duas
  rotas (`schema_anchor_issues`, `schema_anchor_issue_count`) + `log.warn`.
- **Taguedor**: regra 3 virou RENAME (`anchored_by: 'renamed'`, nome antigo
  na note). `existing_tag` é LEGADO e hoje reprova. `validateTaggedHtml`
  mede a proposta contra o schema via `auditSchemaTags`, sem isenção.
- **UI**: painel "Schema × HTML" no editor de variantes — permanente, os dois
  lados à vista, com o de/para do rename. **Não bloqueia salvar** (a
  biblioteca tem variantes legadas e travar o save travaria o conserto);
  o toast do save vira destrutivo quando há desalinhamento.
- **Ponte de vocabulário**: `copy-key-resolve.ts` continua viva porque o n8n
  ainda devolve copy no vocabulário do registry. Cada uso aparece em
  `keys_via_canonical` no run `copy_merge` + `log.warn`
  `phase2.fmt.merge_via_canonical_key`. **Quando esse número zerar, o módulo
  pode ser removido e o merge volta a `content[key]` puro.**
- **Worklist**: `supabase/migrations/DIAGNOSTICO_schema_x_tags.sql` lista as
  variantes ativas desalinhadas (campos sem tag, tags sem campo, proposta de
  rename). Prontidão agregada no `VERIFICAR_pronto_para_gerar.sql` (item 43).

Quando schema e HTML divergem, **quem se ajusta é o HTML** (retagueamento via
Taguedor + revisão humana), não o schema.

---

## O bloco É o schema (migration 20261065, jul/2026)

`email_blocks` ganhou `variant_id` e `fields`: a linha passou a ser a
INSTÂNCIA da variante naquele email, carregando o contrato de copy.

**Por quê**: o vínculo bloco↔variante existia só em runtime, por casamento de
índice (`bpBlocks[position-1]` guardado por `type`), refeito de forma
independente no dispatch e no callback — e quando o guard falhava, TODOS os
campos do bloco viravam default genérico do `copy_spec`, sem um log. Pior: o
schema viajava por fora, em `emails[].component_variants`, que o n8n nunca
cruzava com o bloco. Ele gerava a copy a partir do bloco (tipo/label/purpose)
e devolvia o vocabulário do tag-registry (`headline`, `cta`). Como só existe
UM `cta`, o segundo botão nunca teve fonte: `hero_cta_2_label` voltava vazio,
o agente de hero via slot sem valor e removia a linha (Luxe Lift, jul/2026).

- **Seed** (`seed-blocks.ts`) grava `variant_id`/`fields` do blueprint nos três
  caminhos (seed, ensure, reconcile). O reconcile de estrutura igual também
  backfilla contrato divergente — blueprint regerado com outra variante tem de
  reescrever o schema do bloco.
- **Dispatch** lê da linha (`resolveBlockSchemas`). Bloco anterior à migration
  resolve do blueprint UMA vez, GRAVA e loga (`email_copy.block_schema_backfill`)
  — auto-cura, não fallback permanente. `tags` saiu do bloco e
  `component_variants` saiu do email: **uma fonte só**.
- **Bloco sem schema é erro de CURADORIA**, não modo de operação — não existe
  mais derivação por tag-registry/copy_spec. Vai para `blocos_sem_schema` no
  run `copy_dispatch` (`log.error`) e vira desvio `sem_contrato` no callback.
- **Callback** audita pelo `fields` da linha, pelo `block_id` — a heurística de
  índice sumiu dos dois lados. Chave fora do contrato → desvio `unknown_key`
  (o contador que diz quando o n8n terminou de migrar).
- **Payload gravado**: `input_vars.payload` do run `copy_dispatch` guarda o
  envio na íntegra (esqueleto via `digestPayload` acima de 1 MB).

Contrato do n8n em `docs/email-copy-payload-v2.md` (seção v3): iterar
`blocks[]` e gerar EXATAMENTE as keys de `fields[]`. Entra na mesma janela do
deploy; rollback = reverter o admin.

---

*Última atualização: Julho 2026*
*Versões: Shopify 2024-10, Klaviyo revision 2025-10-15*
