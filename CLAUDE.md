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

**RLS (incidente ago/2026)**: as tabelas do CRM nasceram com policies
`FOR ALL USING (true)` SEM `TO` (⇒ TO PUBLIC, inclui `anon` — leitura e
escrita com a chave pública do browser via /rest/v1) e outras com
`TO authenticated USING (true)` (cross-org + portal do cliente).
Corrigido nos rounds 3/4 (`APPLY_MANUALLY_fix_rls_round3_crm_anon.sql`,
`..._round4_authenticated.sql`) + advisors de produção
(`APPLY_MANUALLY_fix_security_advisors.sql`). **Regra obrigatória**: toda
policy nova declara `TO authenticated` (ou role específica) + helper de
escopo (`is_admin()`/`is_org_member()`/`can_access_store(store_id)`).
"A API valida" NÃO protege o /rest/v1 direto — o service role bypassa RLS,
mas a anon key não passa pela API.

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
gatilho: `channel_type`, `channel_id` (conta específica — org com duas
contas de IG não quer o direct da B na automação da A), `event_kind`
(message|comment) e `first_message` (só a 1ª do contato — sem isso,
fluxo que cria negócio criaria um por resposta). Fire-and-forget: falha
de automação nunca derruba a ingestão. Idempotência por
`external_message_id` (a Meta reenvia webhooks; o executor já
deduplicava por `idempotency_key`).

**Automação 1-clique do painel Instagram** (ago/2026): feed de
"Notificações" na página (comentários agregados das mídias, directs
recentes via `recent_threads` no GET activity — vem do NOSSO banco, sem
custo de Graph API —, e saldo de seguidores POR DIA derivado dos
snapshots) + `POST /api/crm/channels/[id]/instagram/setup-automation`
que cria a automação "interação → negócio na pipeline" pré-montada.
Montagem em `instagram-automation.ts` (puro, 11 testes): trigger da
COLUNA e config do NÓ nascem espelhados (o save do builder envia só
`{name, dag}`, então a coluna sobrevive a edições; `updateNodeConfig`
faz merge, então `channel_id` sem UI própria sobrevive também). Sem
`title_template` — o default do executor ("{contato} — Instagram") é
dinâmico e melhor. Idempotente por CONTEÚDO (`isSameInstagramAutomation`:
mesmo gatilho + mesmo destino devolve a existente — double-click não
duplica). Dialog na página: gatilho DM/comentário/ambos, first_message
default ON, pipeline scope sales + etapa (default = 1ª etapa não
won/lost), "Ativar imediatamente" default ON. Honestidade mantida: a
Meta NÃO expõe "quem seguiu" nem por webhook — o equivalente do
"seguidor novo → pipeline" do Datacrazy aqui é interação identificável.

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

## Exportar clientes → público da Meta (ago/2026)

Botão "Exportar clientes" em `/admin/clients` (`export-clients-button`)
+ `GET /api/clients/export?format=meta|full`. Regras em
`meta-audience-csv.ts` (puro, 29 testes).

**Exporta a base INTEIRA**, não a página: o PostgREST corta em 1.000
linhas, então a rota percorre em blocos até acabar (teto 100k). Usa o
cliente COM RLS — a exportação enxerga o mesmo que a tela.

**Formato `meta`** (público personalizado): cabeçalhos que a Meta casa
sozinha (`email,phone,fn,ln,ct,st,zip,country,extern_id`), separador
VÍRGULA e **sem BOM** — o marcador UTF-8 gruda no 1º cabeçalho
("﻿email" ≠ "email") e a coluna de maior correspondência deixa de ser
reconhecida. Normalização importa porque o hash é feito sobre o TEXTO:
email minúsculo; telefone só dígitos e sempre com DDI (10-11 dígitos =
BR, prefixa 55); `ct`/`st` seguem a regra "somente a-z" da Meta (sem
acento nem espaço: "São Paulo" → "saopaulo"), enquanto `fn`/`ln` mantêm
UTF-8. Cliente sem email E sem telefone fica FORA (a Meta não acha
ninguém e a linha só derruba a taxa) — o dialog informa quantos foram
excluídos. Razão social (ltda/me/eireli/sa…) devolve fn/ln vazios:
comparar nome de empresa com nome de pessoa enfraquece o casamento.

**Formato `full`**: planilha pt-BR com CPF/CNPJ, endereço e status —
separador ";" + BOM (padrão `crm-csv.ts`), anti fórmula-injection.

## Eventos de conversão da Meta — perda silenciosa (ago/2026)

Sintoma relatado: **"Lead qualificado" nunca chega** na Meta e os de
**"Lead" faltam alguns**. Três causas independentes, todas invisíveis.

**1. O lote de eventos morria junto.** `enqueueConversionEvents` fazia
`insert([Lead, qualificado])` — uma statement só. Um conflito do UNIQUE
`(submission_id, platform, event_name)` (reenvio do mesmo submit)
derrubava as DUAS linhas, e o código só fazia `log.warn` + `return`: o
"Lead" era perdido junto. Agora é `upsert` com `ignoreDuplicates`.

**2. Tentativa queimada sem envio.** O claim incrementava `attempts`
ANTES do envio, e o envio inline roda destacado da resposta
(`void Promise.allSettled` — o serverless congela o processo depois do
`return`). Cada congelamento gastava uma tentativa sem mandar nada;
esgotadas as 5, o cron ignorava a linha para sempre. Agora o claim marca
`status='processing'` (já existia no CHECK) e o cron RESSUSCITA o que
está preso nele há mais de `CONVERSION_STUCK_MS` (5 min).

**3. A condição do qualificado comparava texto literal.** `equals`/`in`/
`contains` usavam `===` cru: a regra `= "Sim"` não batia a resposta
"sim", nem `"São Paulo"` batia "Sao Paulo". Quem monta a regra digita à
mão e quem responde escolhe no formulário — o evento simplesmente nunca
disparava. `normalizeForCompare` (trim + minúsculas + sem acento) resolve;
`gt/gte/lt/lte` seguem numéricos e `is_set` deixou de aceitar espaços.

**Nome do evento personalizado** (`lib/tracking/meta-event-name.ts`, 12
testes): o pixel do BROWSER manda o nome na URL, então "Lead
qualificado" chegava como **`Lead%20qualificado`** e a Meta registrava
DOIS eventos — o do navegador e o `Lead qualificado` da CAPI. Nomes
diferentes = sem dedup por `event_id` (conversão contada em dobro) e
nenhum dos dois utilizável para otimizar campanha. `metaEventName`
normaliza para PascalCase sem espaço/acento ("LeadQualificado") e é
aplicado no submit ANTES de enviar pela CAPI **e** antes de devolver o
nome ao browser — os dois lados usam a mesma string por construção. A
função é idempotente; nome já sem espaço passa intacto. O editor mostra
"Chega na Meta como <nome>". `crm_forms.tracking_config` não muda: a
sanitização é no ENVIO, então renomear na UI continua livre.

**Os DOIS canais continuam disparando** — tentou-se desligar o pixel do
browser para o qualificado (commit 0a206f73, revertido em 21d5ee7d): é
justamente a redundância que salva a conversão quando um lado falha
(caso real: o navegador registrou um lead que a CAPI não registrou).
Pixel e CAPI mandam o mesmo nome e o mesmo `event_id`; a Meta deduplica
e conta uma conversão. Conversão personalizada apontando para o nome
antigo precisa ser editada uma vez (Gerenciador de Eventos → Conversões
personalizadas → Editar → trocar o evento da regra); a UI mostra essa
instrução quando o nome vai mudar.

**Evento de teste** (`POST .../conversion-events/test`): dispara um
evento REAL com contato fictício (`teste-integracao@convertfy.me`) e
devolve a resposta crua da Meta — `events_received`, `fbtrace_id`, erro
com código. NÃO grava em `crm_conversion_events` (a fila é o registro
dos cadastros reais; teste ali sujaria os contadores do diagnóstico
logo acima). Usa o `meta_test_event_code` do form quando existe (vai
pra aba "Testar eventos", fora dos relatórios) e AVISA na tela quando
não existe — nesse caso o evento conta na conta. Botões no painel:
testar o qualificado (nome vem da config) ou o "Lead".

**Diagnóstico na tela** (`conversion-diagnostics.tsx` + `GET/POST
/api/crm/forms/[id]/conversion-events`): pendências de configuração,
contagem enviados/fila/falha por evento, últimos envios com o erro real
da Meta, botão de reprocessar, e o **teste das condições contra os
cadastros recentes** — `diagnoseQualified` roda a MESMA avaliação do
envio e diz, cadastro a cadastro, qual condição reprovou (esperado ×
respondido) ou se a regra aponta para campo que não existe mais. Fecha
com um guia de onde o evento aparece na Meta (evento **personalizado**
só surge após o 1º disparo; código de teste desvia dos relatórios;
browser+servidor com mesmo id contam UMA conversão).

**Redesign do inbox (ago/2026)** — três frentes.

*Funcional.* O envio que FALHAVA respondia **200** com `sent:false` e
nenhum cliente lia o campo: o composer limpava a caixa e o atendente só
via a rejeição quando a bolha vermelha aparecia no refresh — se
estivesse olhando. Agora a rota lança 502 com a mensagem do provedor (a
mensagem local já fica gravada `failed`, o histórico não muda). As rotas
`threads/[id]/*` usam `createAdminClient` (sem RLS) e **não checavam
org**: qualquer autenticado com um UUID lia e respondia conversa de
outra organização — `assertThreadInOrg` (`lib/crm/inbox-thread-guard`)
fecha em GET/PATCH/messages/media/read, devolvendo 404. A busca entrava
crua no `or()` do PostgREST (vírgula é sintaxe: "Silva, João" quebrava a
query) → `sanitizeSearchTerm`. `/admin/inbox/[id]` era gerada por
`ROUTES.INBOX_THREAD` e usada em produção sem existir (404) → redireciona
pra `?thread=`. Erro de API virava "Inbox vazia" e detalhe com erro
virava skeleton eterno → fetcher que lança + estados próprios. Filtro por
tag falhava em silêncio por diferença de caixa → `overlaps` com
variantes. Mídia não limpava o sino; `loadMore` não tinha `catch` nem
preservava scroll; status/atribuição não checavam resposta; "Reenviar"
em mídia não fazia nada — todos corrigidos.

*Clareza.* `crm-inbox-format.ts` (puro, 20 testes): `groupMessagesByDay`
(separador Hoje/Ontem/dia da semana/data — antes era uma parede de
bolhas com só HH:MM) e `messageAuthor`/`shouldShowAuthor` (atendente ×
**Automação** × **Pelo celular**, mostrado só quando o autor MUDA). Novo
`ContactContext`: negócio com valor e status, cliente e lead vinham na
API e nunca eram exibidos. Avatar real do contato na lista e no header.
Resumo de fila no topo ("N aguardando · M há mais de 1h", clica e ordena
por espera). Ponto verde de janela só em canal que TEM janela.

*Usabilidade.* **Enter envia** (Shift+Enter quebra linha), textarea que
cresce até 8 linhas, rascunho preservado por conversa, contador perto do
limite de 4000, Escape do "/" não apaga mais a mensagem e a resposta
rápida substitui só o atalho. Paginação real na lista (era 50 fixo, sem
aviso) e contagem de não-lidas da ORG (o badge divergia do sino). Janela
de 24h do **Instagram** passou a ter barra (a Meta recusava e ninguém
sabia por quê). Realtime filtrado por `org_id` — sem isso o canal
acordava com evento de qualquer organização — e o safety refresh só roda
com o realtime caído (eram 4 requisições/30s por aba), tudo pausado em
aba oculta.

**Fila com SLA no inbox** (`crm-inbox-sla.ts`, 11 testes): conversa
"aguardando" = última mensagem do contato + status open/pending. Faixas
15min/60min (warn/critical). Toggle Recentes|Fila na lista (fila =
quem espera há mais tempo primeiro); badge de espera colorido no lugar
do horário quando warn+. `last_message_at` é proxy (SUBestima a espera
quando o contato manda várias seguidas — documentado no módulo).

**SMS**: nada implementado — bloqueado na escolha de provedor.

**Responder pelo CELULAR marca a conversa como lida** (set/2026,
migration 20261129). O atendente respondia o cliente pelo WhatsApp do
aparelho e a conversa seguia não lida no admin: "Breno Neves" com
`unread_count = 14` e "Lucas" com 3, os dois com a última mensagem
outbound e `sent_by_kind = 'system'` (a marca do fromMe da Evolution).
O `CASE` do trigger `crm_messages_update_thread` incrementava no inbound
e, em todo o resto, MANTINHA o valor — quem zerava era só
`POST /threads/[id]/read`, ou seja, abrir a conversa no admin, caminho
que responder pelo celular nunca percorre. O webhook já cobria metade
(`clearCrmThreadNotifications` no fromMe), então divergiam justamente as
duas coisas que a doc diz espelharem uma à outra: sino limpo e badge
aceso na mesma conversa. Agora outbound de `agent`/`system` zera.
**Automação NÃO zera** — fluxo automático responder não é alguém ter
lido, e zerar ali esconderia mensagem por olhar. `is_historical` fora
(importação traz outbound aos milhares) e a guarda
`created_at >= last_message_at` é a mesma do `GREATEST`: mensagem fora
de ordem não pode apagar não-lida mais recente que ela. Custo ZERO em
escrita — o trigger já fazia esse UPDATE, muda só o valor de uma coluna,
nenhum evento de realtime a mais.

**Foto de perfil do contato — a fila não pode travar no topo**
(set/2026, migration 20261125). Sintoma: inbox só com iniciais, 56 das
61 conversas sem foto E sem tentativa registrada. A causa imediata NÃO
era bug: o canal Evolution ficou deslogado de 04/08 a 08/09 14:35, e
`canalPodeEntregarFoto` corretamente o mantinha fora do lote — o log do
PostgREST mostra as rodadas filtrando só os dois canais de Instagram.
O que estava errado é o que aconteceria com o canal de volta: o desfecho
era BINÁRIO. Erro do provedor (timeout, 5xx, número inexistente no
WhatsApp) devolvia "não tentei" e não carimbava nada; com o lote em
`last_message_at DESC LIMIT 20`, as mesmas conversas do topo voltariam
em toda rodada e a cauda nunca seria alcançada. **Carimbar a falha
sozinho não resolve**: quem falha continua com `checked_at` nulo e
voltaria ao topo junto de quem nunca foi tentado — por isso a ordem
começa por `failed_at NULLS FIRST` (`ORDEM_DA_FILA` em `avatar-fila.ts`,
puro, 13 testes). `contact_avatar_failed_at` separa "a origem respondeu
que não há foto" (7 dias) de "a chamada falhou" (1 hora): sem a
separação, ou a falha queima uma semana, ou trava a fila. O serviço
devolve `motivo` TIPADO por saída — "filled: 0" não distingue canal
deslogado de contato sem foto, e as duas pedem ações opostas; o cron
responde e loga o breakdown. Lote 60 com orçamento de 240s e cadência de
2h (era 20 a cada 6h: a base levava ~18h para ser coberta uma vez, então
quem religava o número via as fotos no dia seguinte).

## Inbox — recuperação de custo no banco (set/2026, migrations 20261120-23)

O inbox sufocou um Postgres pequeno com **59 conversas e 238 mensagens**.
Não era volume: era **relógio** (trabalho periódico que não dependia de
haver mensagem) e **amplificação** (cada escrita acordava todas as abas,
que reliam e escreviam de novo). Medido em `pg_stat_statements`: o cron da
fila gastou **372 min de CPU** num `count exact`, e o polling do WAL do
Realtime outros **372 min**. Mapa completo, queries de acompanhamento e o
roteiro de religar o número em `docs/crm/inbox-observability.md`.

**As cinco regras que não podem voltar:**

1. **Contagem em caminho quente nunca pelo PostgREST.** `count:'exact'`
   (com ou sem `head`) vira RPC com literal ou `EXISTS`/`LIMIT 1`. O
   `head:true` ainda esconde `statement timeout` (supabase-js#1661).
2. **Índice parcial não serve query parametrizada.** O PostgREST usa
   prepared statements e, da 6ª execução em diante, o plano genérico não
   prova `status = $1 ⊆ WHERE status = 'dead'` — era o seq scan de 916 ms.
   Ou o predicado é literal (dentro de função), ou o índice não é parcial.
3. **Chave de JSONB tem de ser literal.** `metadata->>$1 = $2` não usa
   índice e o `->>` não é LEAKPROOF (516 ms → 0,09 ms depois da RPC).
   Daí `clear_crm_thread_notifications`, `has_open_channel_alert`,
   `has_open_crm_thread_notification`, `clear_channel_alerts`.
4. **Escrita evitada = evento de realtime evitado × número de abas.**
   `crm_threads` está na publication: todo UPDATE acorda todas as abas da
   org e cada uma relista. Por isso `unread_count=0` só com não-lida,
   `contact_name` só quando muda, e **GET não escreve** (o backfill de
   avatar saiu do `after()` da lista para o cron `crm-avatar-backfill`; ele
   escrevia na tabela que o realtime observa e o evento refazia a lista).
5. **Notificação de cron é coalescida por chave** — uma linha aberta por
   (usuário, entidade), atualizada no lugar
   (`upsert_onboarding_stuck_notifications`). Sem isso o backlog volta:
   eram 17.611 não lidas de "onboarding travado", 15.465 com mais de 7 dias.

**O que mudou, por camada:**

- **Fila** (`crm_webhook_events`): de 266 MB para 22 MB (VACUUM FULL +
  autovacuum agressivo, TOAST incluído). `claim_crm_webhook_events` faz
  claim em LOTE com `FOR UPDATE SKIP LOCKED`, lease ≥ `maxDuration`
  (90 s no worker, 330 s no cron) e backoff exponencial. `processing` com
  lease vencido volta para a fila — eram 8 eventos presos desde 15/07. O
  cron caiu para 5 em 5 minutos e perdeu o `count`; saúde vem de
  `crm_webhook_queue_stats()`.
- **Payload**: `stripHeavyFields` tira base64/thumbnail antes de gravar. A
  guarda é NOSSA porque a config da origem não é confiável
  (EvolutionAPI#956 relata 12 MB com base64 desligado);
  `EVOLUTION_WEBHOOK_BASE64=false` também desliga na origem.
- **Lista**: `crm_inbox_list_threads` faz em UM statement o que custava
  nove (página + `count exact` + varredura de não-lidas + 4 head counts +
  2 selects de canais). Contadores por `COUNT(*) FILTER`, sem filtro de
  canal (senão o contador do outro zera). 7,5 ms medidos.
- **Cliente**: `useUnifiedNotifications` virou **provider** montado uma vez
  no layout — era montado 5× por página (sidebar, sidebar-user dentro
  dela, o drawer mobile sempre montado com a sua sidebar-user, e a top
  bar), 20 bindings por aba, e o `mutate` do SWR **não** participa do
  dedupe (vercel/swr#1417), então um evento virava até 5 requisições. Os
  bindings de `report_jobs` (os únicos sem filtro) saíram. O realtime do
  inbox é **fail-closed** (sem org, sem canal), tem deps estáveis por ref
  (antes reassinava a cada clique) e **um** timer de fallback com backoff
  30s→5min e jitter — o realtime-js reconecta em [1s,2s,5s,10s] fixos e
  sem jitter, então todas as abas voltavam juntas.

**Pendências conscientes**: Broadcast from Database (o `postgres_changes`
segue custando polling do WAL; as funções já existem no projeto, mas a
policy em `realtime.messages` falha em SILÊNCIO se faltar) e a reescrita
das policies de RLS com `(select ...)` — que deve vir **depois** do
Broadcast, porque com `postgres_changes` ativo endurecer policy aumenta o
custo por assinante. Em produção as policies do CRM ainda são
`USING (true)`: o `APPLY_MANUALLY_fix_rls_round4` nunca foi aplicado.

---

## ConvertIA — resposta legível, indicador de geração, F5 na mesma conversa (set/2026)

Sintoma: parede de texto (a narração "vou buscar o popup…" de cada
rodada de tools colava na resposta), nada dizia se ainda estava gerando,
e recarregar a página voltava na tela inicial com a conversa em branco
até o turno terminar (a linha do assistente só era gravada no FIM).

`POST /api/ai/convertia/chat`: **persistência progressiva** — a linha
em `ai_chat_messages` nasce no início do turno (`meta.streaming=true`,
`started_at`) e é atualizada a cada ~2,5 s (throttle, cadeia de
promises para o update final ser o último); `content` = resposta FINAL
(a rodada que não chamou tool) e `meta.progress[]` = narração das
rodadas intermediárias (evento SSE `round_end` move o texto da bolha
para o processo). O modelo NÃO recebe mais `request.signal`: F5 ou
troca de conversa não aborta uma ação de escrita pela metade — o turno
vai até o fim (freio = orçamento de tempo) e fica gravado. Placeholder
vazio no histórico é filtrado antes de ir ao modelo. Regra de
FORMATAÇÃO no system prompt (resumo em 1 linha, `###` curtos, listas
com negrito, tabela para números, narração de no máximo 1 frase por
rodada).

Chat (`convertia-chat.tsx`): `?conversa=` fica na URL (não é mais
apagado) + `localStorage convertia:last-conversa:<ws>`; o effect de
sincronia só grava depois do mount (`hydratedRef`) — senão apagava o
param antes de ler. Mensagem que chega do banco com `streaming=true`
entra como "em andamento" com polling de 2,5 s até fechar; passada de
6 min (maxDuration é 300 s) vira "interrompida". Enquanto envia, o
botão vira spinner e o rodapé diz "gerando — aguarde"; a bolha mostra
"Gerando resposta…" com a última narração em itálico; "Consultou N
fontes · M etapas" abre o processo completo.

**Composer no padrão Claude (set/2026)**: botão "+" abre anexo,
conectores·MCP e skills num menu só; a análise profunda virou toggle
DENTRO do menu de modelo (é um modo do modelo, desabilitado quando o
modelo não tem `reasoning`); rodapé = "+" · loja · mic · modelo · enviar.
Lista de modelos em `convertia-models.ts` com grupos claude/outros
(Opus 4.8 segue padrão; Fable 5.1, Opus 5, Sonnet 5, GPT-5.4, Gemini
3.5 Flash entraram). Slug que o OpenRouter não serve NÃO derruba o
turno: `isUnknownModelError` (400/404 falando de model) → fallback para
o padrão na 1ª rodada com aviso na resposta. Estudo de arquitetura e
backlog priorizado em `docs/convertia/arquitetura-e-melhorias.md`.

## ConvertIA v3 — motor (set/2026, migrations 20261114/20261115)

Loop de tools extraído da rota para `src/lib/ai/convertia/tool-loop.ts`
(puro, 13 testes com stream mockado) — a rota autentica, monta contexto
e abre o stream; o MESMO loop roda no job de continuação e na avaliação.
Mapa completo em `docs/convertia/motor-v3.md`. O que não pode quebrar:

- **`meta` da mensagem é MERGE** (`ai_chat_message_progress()`): a
  persistência parcial (2,5 s), o botão Parar (`cancel_requested`) e o
  Confirmar (`pending_confirmation.resolved_at`) escrevem na mesma
  coluna JSONB. Um update com o objeto inteiro apagaria a flag alheia.
- **System prompt em dois blocos** (`system-prompt.ts`): o estável leva
  `cache_control` (só `anthropic/*`, via `prompt-cache.ts`); data, "o que
  já foi consultado" (`consult-memory.ts`), sumário rolante e modo
  profundo ficam no dinâmico. Mover um bloco invalida o cache do prefixo.
- **Tool que falha devolve erro ESTRUTURADO** (`tool-errors.ts`:
  `{error:{code, retry_after_s, hint}}`) — o loop repete transitórios
  (429/timeout/5xx) até 2× dentro do orçamento e o prompt ensina o que
  fazer com cada `code`. "Erro ao consultar: …" cru era lido pelo modelo
  como "a plataforma não faz isso".
- **Ação irreversível passa pelo gate da UI** (`ConnectorTool.confirm`):
  enviar campanha, DELETE, supressão, MCP `destructiveHint`/nome. A tool
  NÃO executa; `needs_confirmation` volta ao modelo e o card
  Confirmar/Cancelar aparece. Aprovar = POST com `approve` (uso único,
  dono da conversa) → a rota executa ANTES da 1ª rodada.
- **Parar não aborta o fetch**: marca a flag; o loop lê por polling e
  fecha o turno limpo (custo contabilizado, `status: cancelled`).
- **Orçamento esgotado com tools já executadas → `ai_chat_jobs`**; o cron
  `convertia-continue` retoma da rodada e grava na mesma mensagem (a UI
  repõe por polling até 25 min). Relatório (cookie) fica fora do job.
- **MCP lê a lista de tools do banco** (`tools_cache`, 6 h; stale é usado
  e renovado em background; Testar e o cron horário renovam).
- **Modo econômico** (roteamento por rodada): rodadas de consulta no Kimi
  K3; final ou pedido de ESCRITA é refeito no modelo escolhido — nunca
  deixar um modelo barato montar payload de escrita.
- **Memórias** (`ai_memories`, por org ou loja): a IA propõe
  (`convertia_lembrar`, pending), humano aprova no painel; só aprovadas
  entram no prompt. **Base de conhecimento** (`ai_knowledge_notes`):
  segunda pasta do vault (`VAULT_KNOWLEDGE_BASE_PATH`), só `status:
  aprovado`, grafo por wikilinks normalizados por NOME (como o Obsidian),
  embeddings via OpenRouter (`openai/text-embedding-3-small`, mesma
  OPENROUTER_API_KEY) com fallback full-text; advisors = `Advisors/`.
  Limite diário editável em Custo de IA (`PUT /api/ai/convertia/limits`).
  Coluna gerada `search` NÃO inclui `array_to_string(tags)` — é STABLE e
  coluna gerada exige IMMUTABLE (a migration quebrou por isso).
- **Avaliação** (`ai_eval_cases/runs`): casos dos 👍, lote semanal em 3
  modelos com tools SÓ de leitura, juiz na rubrica; card em Custo de IA.
- **Dado antigo no banco nunca derruba a UI** (incidente 04/09: "Algo
  deu errado" em TODA abertura da ConvertIA). As mensagens pré-v3 têm
  `meta.usage = {tokens_input, tokens_output, cost_usd}` — sem `rounds`
  — e a tela fazia `usage.rounds.length` ao restaurar a última conversa
  do localStorage. `normalizeTurnUsage` (telemetry.ts, puro) adapta
  qualquer geração; `toUiMessages` e o evento `done` passam por ele. O
  ErrorBoundary agora mostra `error.message` na tela — o print chega
  com a causa, não só com o título.
- **Erro do provedor é traduzido, não escondido** (incidente 05/09: a
  conta do OpenRouter ficou SEM CRÉDITO — `HTTP 402 weight_exceeds_budget`
  / `in_flight_budget_exhausted` — e o chat dizia "troque o modelo"; o
  usuário trocou Fable → Kimi achando que era o modelo). O erro cru fica
  em `meta.error` (finalize) e `friendlyModelError` (`model-errors.ts`,
  puro, 3 testes) o traduz na rota (SSE `error` leva `message` + `raw`)
  e na bolha (`msg.status === "error" && msg.error`). 402 → "créditos
  acabaram, adicione em openrouter.ai/settings/credits"; 401 → chave;
  429 → taxa; contexto; 5xx. O OpenRouter RESERVA o custo máximo da
  chamada (prompt + max_tokens no preço do modelo) — por isso o modelo
  mais caro estoura primeiro e parece "defeito do Fable".

## Financeiro ligado à loja (set/2026, migration 20261113)

Cobrança (`client_charges` local e `invoices` do Asaas) ganhou
`charge_type` (subscription | commission | other), `reference_months`
TEXT[] (YYYY-MM — comissão de julho VENCE em agosto, mas é de julho) e
`store_id`; `invoices.asaas_subscription_id` guarda o `subscription`
do payment (o sync preenche e classifica como assinatura sem
sobrescrever classificação manual). `client_subscription_stores`
liga assinatura a 1..N lojas ("Plano Mensal 2 Lojas"). A view
`unified_invoices` expõe tudo (colunas APENDADAS) e resolve a
assinatura local da fatura Asaas pelo `asaas_subscription_id`.

**Carteira por loja** (`cs-carteira.ts`, 20 testes): `splitInvoicesForStore`
— `store_id` decide; senão assinatura vinculada decide (inclusive
excluindo a loja que não está no vínculo); senão só entra quando o
cliente tem UMA loja ativa (multi-loja vira `pagamentos_sem_loja`, que
o drawer mostra com link "Classificar"). Mensalidade e comissão são
baldes separados; `comissaoFromInvoices` monta a grade mês a mês até o
mês PASSADO com "não cobrada" como furo (só em loja que tem comissão).
Sem `reference_months`, comissão assume o mês ANTERIOR ao vencimento
e marca `inferred` ("~" na UI).

**Parser da convenção do time** (`charge-description.ts`, 14 testes):
`inferChargeType` ("comiss" vence tudo), `inferReferenceMonths`
(nomes, "Julho/Agosto", "abril a junho", ano explícito; abreviações
mar/set/out NUNCA — "setup", "out of stock"), `monthsLabel`
("abr–jun/26"), `describeCharge` (texto padrão que o parser lê de
volta). A migration fez o backfill por regex das 67 faturas (42/50
comissões com mês; loja por cliente único ou nome da loja na
descrição); o que sobrou classifica-se à mão em "Classificar (tipo ·
mês · loja)" no financeiro do cliente → `PUT
/api/financial/charge-classification` (Asaas ou local). Toda rota que
grava cobrança degrada sem a migration (retry sem as colunas).

**Cobrança de VÁRIAS lojas + pagamento manual (set/2026, migration
20261118)**: comissão de cliente multi-loja vem numa fatura só, e o
"Classificar" tinha um Select de loja única. `store_ids UUID[]` em
`client_charges` e `invoices` (view expõe `store_ids` resolvido, com
fallback de `store_id` para linhas antigas). Contrato: 1 loja →
`store_id` = ela E `store_ids` = [ela]; várias → `store_id` NULL
(quem só lê store_id vê "sem loja", nunca a errada). `chargeStoreIds`
(`charge-classification.ts`, 10 testes) é o leitor canônico; o parser
aceita `store_ids` e o `store_id` legado. Na carteira,
`splitInvoicesForStore` entra em TODAS as lojas listadas e marca
`shared: n` no histórico (drawer mostra "·nL" — o valor é da fatura
inteira, não rateado). UI: tipo Comissão → checkboxes; outros → Select.
Sem a migration, retry com `stripStoreIds` (loja única sobrevive em
`store_id`; várias → 422 apontando a migration).

**Espelho sob demanda** (`asaas-invoice-mirror.ts`,
`ensureAsaasInvoiceMirror`): o Financeiro lista os pagamentos AO VIVO
do Asaas, mas classificação, comprovante e carteira moram em
`invoices`, que só o sync preenchia — cobrança recém-gerada pela
assinatura dava "Fatura ainda não sincronizada localmente" e o
"Marcar como pago" atualizava 0 linhas. Agora classificar e marcar
pago criam o espelho na hora (idempotente por `asaas_id`; cliente por
`externalReference` ou `custom_fields.asaas_customer_id`, SÓ da org).
**O módulo é a fonte única** de `resolveClientForPayment` e
`buildInvoiceRowFromPayment` — sync e webhook chamam os mesmos: o sync
procurava o cliente pela COLUNA `clients.asaas_customer_id`, vazia nos
52 clientes (o dado mora em `custom_fields`), então pagamento sem
`externalReference` nunca achava dono. `invoices.asaas_id` ganhou
índice ÚNICO parcial (migration 20261119): três escritores fazendo
"existe? senão insere" duplicavam a fatura em corrida, e o `.single()`
do sync passava a inserir uma 3ª a cada rodada. Lookup por payment é
`.eq("asaas_id")` — comparar `pay_…` com a coluna UUID `id` num `.or()`
dava 22P02 silencioso (era metade do sintoma original).
`PUT /api/integrations/asaas/charges` = pagamento por fora
(transferência internacional/Wise/PIX direto → `receiveInCash`, sem
notificar o cliente) e `action: "undo"` → `undoReceivedInCash` +
espelho volta a pending (menu "Desfazer pagamento manual" em
`RECEIVED_IN_CASH`). `billingType: UNDEFINED` = "Cliente escolhe" na
UI (era "via UNDEFINED").

**Vínculo assinatura ↔ lojas**: `store_ids` no POST de
`/api/client-subscriptions`, `PUT /api/client-subscriptions/[id]/stores`
(substitui o conjunto; toda loja tem de ser do cliente), stub local
criado na hora pelo POST de assinatura Asaas (era só no sync). O
fechamento do negócio (`deals/[id]/billing`) liga assinatura e
cobranças à loja do onboarding. Card da assinatura mostra as lojas;
cliente multi-loja sem vínculo vê aviso âmbar.

**Setup da loja editável**: `PATCH /api/admin/stores/[id]` aceita
nome, URL (normalizada com https e sem barra final), plataforma
(enum do banco ampliado com tray/vtex/dupla_estrutura), moeda
(`STORE_CURRENCIES` em `constants/currencies.ts` — lista fechada),
país/idioma/nicho, MRR, vigência (fim ≥ início) e alerta de receita;
`assertStoreInUserOrg` fecha por org. Dialog em
`store-setup-edit-dialog.tsx`, botão "Editar" nas seções Dados da
loja e Contrato da aba Setup.

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
| 3 | **Montador** (Component Assembler) | `architect/component-assembler.service.ts` | **DESLIGADO** (`montador_mode='off'`, migration 20261107). Ligado: `moonshotai/kimi-k3` · T=0.3 · max 2048 | finalistas do Curador + `output_schema`, perfil, objeções, vocabulário, produtos, memória, decisão do Estruturador | JSON de escolha (1 variante por posição). O HTML é montado por CÓDIGO (`assemble-document.ts`) a partir do rank 1 do Curador → `store_email_references` (`model='code'`, `slot_map`) |
| 4 | **Blueprint** | `architect/blueprint-generator.service.ts` | `moonshotai/kimi-k3` (banco, 08/09) · T=0.4 · max 8192 | o HTML do Montador + contexto | JSON `{objective,messaging,subject_hint,blocks[]}` → `store_email_blueprints` (só persiste se `source='ai'`) |
| 5 | **Copy** | `email-copy-webhook.service.ts` + callback `/api/webhooks/n8n/email-copy` | n8n (externo) | store+blueprint+blocos vazios | `email_flow_emails.subject/preheader` + `email_blocks.content`; status `copy_ready` |
| 6 | **Imagem** | `phase2-runner.service.ts` + `chains/image.chain.ts` | `google/gemini-3.1-flash-image` (config; CLAUDE.md dizia gpt-5.4-image-2, revertido na 20261072) · 90s/chamada · 1 chamada por campo `imagem_gerada` | **direção fotográfica da variante + briefing/onde_fica do campo = fonte principal** (migration 20261108); apoio: fio do Estruturador, papel do bloco, marca. Anexos rotulados: `CFY_REF_PRODUCT` (produto DO CAMPO — `panel_2_*` → 2º produto) e `CFY_REF_ANCHOR` (foto principal do grupo, nas thumbs) | `email_blocks.content.images[campo]` = {url, alt, overlay_luminance} + espelho `image_url`/`image_alt`; status `image_done` |
| 7a | **Hero Section** | `chains/hero.chain.ts` + `html/format-context.ts` | `anthropic/claude-sonnet-4.6` (banco, 08/09) · 240s | Montador HTML + região da hero + `html`/`rendered_html` da variante escolhida (cascata slot_map→blueprint→choices) + copy/imagem da hero + fontes/cores + logos clara/escura | fragmento da hero, splice por código (sentinelas `cfy:hero`); modos marker/tag/full-doc |
| 7b | **Formatação de Texto** | `chains/text-format.chain.ts` | `moonshotai/kimi-k3` · 540s | HTML do 7a + copy do n8n (sem hero) + fields do blueprint + fontes/cores | documento completo; guards (tabelas, shrink, tags de imagem sobrevivem, hero re-spliced se mexer) |
| 7c | **Formatação de Imagem** | `chains/image-format.chain.ts` + `html/apply-patches.ts` | `moonshotai/kimi-k3` · 180s | HTML do 7b + image_map (sem hero) + logos | JSON de ops (img/remove_slot/replace) aplicado por código; hero proibida |
| 7d | **Cores & Botões** | `chains/color-format.chain.ts` (substitui o Refinador) | `moonshotai/kimi-k3` · 240s | HTML do 7c + paleta com papéis + nicho/tons/pesquisa | JSON de ops replace (só cores; pode tocar a hero); **FAIL-OPEN** |
| 8 | **QA** | `chains/qa.chain.ts` | `moonshotai/kimi-k3` (banco, 08/09) · 60s | HTML final + blocks + briefing + brand | `email_flow_emails.qa_issues` + `passed`; status `ready`/`failed` |

**Agente de imagem — fonte principal (03/09, migration 20261108)**: o prompt
saiu de "prompt master de diretor de arte + frase de cena fixa por bloco/flow
+ CENARIO/MOOD derivados por código" para três camadas com peso declarado:
`CFY_PRIMARY_BRIEF` (direção fotográfica da variante, agora com as MEDIDAS
apagadas em vez das linhas — "terço superior (0–480px) fora de foco" vira
"terço superior fora de foco"; tabela de categorias vira "coluna — coluna"),
`CFY_THIS_FRAME` (o `<slot_imagem>` do campo: `especificidade` + `onde_fica`
+ formato + áreas de texto + `papel_neste_grupo` nas thumbs) e `CFY_SUPPORT`
(fio, papel do bloco, marca). Sem direção, o template diz para NÃO inventar
cena. Produto por painel (`pickProductForField`, `image/product-for-field.ts`);
âncora e produto vão anexados os DOIS, rotulados — antes `referenceImages`
substituía a foto do produto e a thumb via só a âncora. `CFY_PRODUCT_FIDELITY`
passou a dizer que a foto dá o objeto e a direção dá a cena (o "ATTACHED
PHOTO WINS" fazia copiar ângulo e fundo). Alt sem português ("Produto ·
rótulo"). `MOEDA` = moeda dos produtos, não da coluna da loja. `CENARIO`/
`MOOD` seguem como vars (o agente `campaign_image` usa), mas o template do
`image` não as referencia mais.

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

**Montador desligado (03/09, migration 20261107)**: desde CM-4 o Montador
NÃO escreve HTML — escolhia 1 entre as até 3 finalistas do Curador e o
documento era concatenado por código. Agora o Curador do vault devolve UMA
variante por posição (`SHADOW_TOP_N = 1`) e ela vai direto para
`assembleDocument`; o passo B não chama LLM (`loadMontadorMode` →
kill-switch `email_generation_settings.montador_mode`, aba Configurações)
e grava a run `assembler` como `skipped` com as stats da montagem. O
Curador legado do kimi (fallback) segue rankeando até 3 — desligado, o
rank 1 dele é a escolha.

**Papel-chave (histórico)**: o Montador (#3) GERAVA a arquitetura HTML (esqueleto, ordem dos
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

## Estruturador religado + Curador do vault com a decisão dele (set/2026, migration 20261106)

Fase 1 do Architect: `Pesquisa → Estruturador → Curador (vault) → Montador →
Blueprint`. O **Estruturador** (`estruturador.service.ts`, Sonnet 4.6, gate
`email_generation_settings.estruturador_mode`) decide a SEQUÊNCIA de seções +
papel/porquê/referência por posição + fio; desligado em 31/08 (20261093) e
religado em 02/09 com a sequência sendo dele — a aba Arquitetura (intenção
por bloco) vale só quando ele está `off`. **Sem validador de conteúdo**: o
que ele devolver vale (`normalizarOutput` garante só `estrutura[]` com
`section`+`papel`; retry 1× só para JSON ilegível). Entradas: system =
intenção do flow, progressão, TODAS as `estruturas/{flow}/*.md` e
aprendizados (vault); user = `<perfil_da_marca>` (dossiê completo com Ads +
top 5 com preço/link), intenção deste email, `<secoes_disponiveis>` (só
nomes), estruturas dos outros emails, orientação do COO, revisão humana.
Ele NÃO recebe variantes, lacunas nem intenções por bloco.

**A nota de intenção só viaja quando NÃO há alvo** (08/09,
`intencaoParaOPrompt`). Com o Seletor ligado ela é redundante: ele a lê
INTEIRA e a devolve traduzida — os quatro anti-objetivos da nota do
welcome-1 aparecem LITERALMENTE no `proibido_neste_toque` do alvo, os dois
trabalhos viram `trabalhos_fixos`, "aposta na objeção dominante, uma só"
vira o `criterio_de_selecao` e o contexto do momento vira a `razao`. Servir
a nota de novo é a mesma informação duas vezes, uma crua competindo com a
tipada. No lugar dela vai `INTENCAO_NAO_SERVIDA`, que diz onde a informação
está e proíbe procurá-la — bloco que some em silêncio faz o modelo caçar o
que não recebeu (lição do `exige` e do `momento`), então as três menções
operacionais do system (FALLBACK, VALIDAÇÃO, `text_only`) foram reescritas
com a condição declarada, e a VALIDAÇÃO passou a conferir contra trabalhos
fixos/veículos/proibições do alvo. **Sem alvo a nota volta inteira** —
desligar o Seletor nunca regride. `intencao_servida` no `input_vars` diz em
qual regime a run rodou, e a Entrada mantém a linha "Intenção deste email"
explicando que não foi servida (senão some da tela sem motivo). **Custo
declarado**: dos 5 itens da checklist de saída da nota, 4 têm equivalente no
alvo e "noção da faixa de preço e do tipo de produto" NÃO — é o que
justificava a posição `products`; nenhum campo foi inventado no alvo para
compensar.

O **Curador do vault** (`curador-shadow.ts`, o vigente) NÃO decide
estrutura nem reescreve papel: a função dele é ENCONTRAR na biblioteca os
blocos cuja anatomia realiza o papel decidido pelo Estruturador em cada
posição e conversa com o fio ("encaixe primeiro, depois os eixos"; `papeis`
no output = como a rank-1 realiza o papel). Ele recebe a saída
COMPLETA do Estruturador em `<decisao_do_estruturador>`
(`decisaoCompletaParaCurador`, critério dominante por posição; com ela
`<estruturas_de_referencia>` e `<outline>` são omitidos), as
`<lacunas_da_biblioteca>` (kind `lacuna`, antes sincronizado e nunca
servido) e o `<indice_do_vault>` com ferramentas `listar_pasta`/`ler_nota`
(`curador-vault-tools.ts`, `invokeAgentWithTools` em `llm-invoke.ts`, até 4
consultas, fail-open). Telemetria do run `assembler_chooser`:
`estruturador_consumido`, `consultas_ao_vault[]`, `consultou_vault`,
`voltas`, `fallback_sem_ferramentas`. Risco operacional: com `on` o reuso
da fase 1 é desligado e a fase 1 chega a ~220 s por email — recomendado
`DISPATCH_TICK_BUDGET_MS=15000` no ambiente. Mapa completo:
`docs/email-generation/mapa-estruturador-curador.md`.

**Calibração do Curador** (04/09, migration 20261111): o ciclo que era só
do Estruturador — orientação do COO (efeito imediato, servida em
`<orientacao_do_coo>`) + 👍/👎 por run (vira rascunho de nota do vault) —
passou a valer para o Curador. MESMA tabela (`estruturador_orientacoes` /
`estruturador_feedback`, nomes históricos), separada pela coluna `agente`:
escrever para um NÃO instrui o outro. O agente do feedback sai da RUN, não
do caller. Loader único em `shared/orientacoes-loader.ts` (o `kind` faltava
no select do Estruturador — das duas orientações de flow, intenção e
progressão, só a primeira chegava ao prompt). O rascunho do Curador
(`architect/aprendizado-curador.ts`, puro) fala de ESCOLHA DE BLOCO e
aponta a nota `lacuna` quando a queixa é "nenhum bloco faz isso" — o
`aprendizado` do Estruturador fala de sequência e não serviria. Componentes
`AgentOrientacoes`/`AgentFeedback` (ex-`Estruturador*`) recebem `agente`;
os escopos `flow:intencao`/`flow:progressao` ficam fora do Curador.

## Tipografia: o agente e a edição humana (set/2026)

**Agente de Tipografia** (migration 20261109, STEP 3.5 da fase 2, entre
`image_format` e `color_format`): entra DEPOIS que a copy está no HTML, não
escreve texto. Recebe o INVENTÁRIO numerado das declarações de fonte
(`typography/inventory.ts`) — nunca o documento — e devolve ops por número
de item; o código aplica (`typography/apply.ts`). É a lição do `text_format`:
modelo que recebe 86 KB devolve 86 KB e quebra tabela. Base de conhecimento
fechada com especialista em `docs/email-generation/agente-tipografia.md`
(teto de 3 rupturas de família, piso de 16px, CTA rompe por caixa e peso,
par sans+sans recusado, escala de 3 pesos com distância 200, fundo escuro
comprime). Fail-open. **Só o CHECK de `email_agent_configs` não basta: sem
`typography` em `email_generation_runs.agent` o step roda, custa dinheiro e
some da telemetria** (incidente 04/09, migration 20261110 — mesma armadilha
do `copy_fit`).

**Edição humana na tela** (04/09, migration 20261112): Editar → aba
Tipografia no e-mail. Clicar num texto seleciona a DECLARAÇÃO daquele
elemento (que governa por herança — o contorno mostra o alcance); a lista de
famílias do documento permite remapear a peça inteira (head + corpo, por
NOME — `normalizeFonts` cru apagaria a segunda fonte do tipógrafo e daria
família de título a um corpo levado a 700). `TypographyOp` (agente) e
`TypographyOpHumana` (painel) são tipos DIFERENTES: `familia` livre e
`tamanho_px` só existem no segundo, então o agente é fisicamente incapaz de
pedi-los. A régua vira AVISO para o humano (`avaliarOpsHumanas`) e continua
descarte para o agente. `sanitizarFamilia` é obrigatório: o nome entra em
`style="…"` com aspa dupla, e `Arial";x="` injetaria markup num documento
que vai para o Klaviyo — o guard estrutural não pega. Cada op sobe com
`esperado` (a tela não tem polling; um re-render entre carregar e salvar faz
o item 14 virar outro elemento). Grava `html` + `html_marked` num único
UPDATE — nada de RPC. **Do `typography_override`, só `fontes` sobrevive a um
re-render**; as ops endereçam por índice e viram registro. "Repensar" é o
STEP 3.5 fora do runner, com as fontes da PEÇA e os itens tocados pelo
humano pinados.

## Proveniência do prompt (migration 20261085, ago/2026)

Toda run de agente grava, além do `rendered_prompt`, o MESMO prompt **cortado
por origem** (`prompt_segments`) e a Entrada estruturada (`input_summary`). O
Estúdio (`/admin/agents`) renderiza direto disso: blocos coloridos por
classe — `agente` (template) · `loja` · `biblioteca` · `upstream` (saída de
agente anterior) · `curadoria` · `vault` · `sistema` (derivado por código).

**Regra ao escrever ou mexer num agente**: a origem é declarada AO LADO de
quem monta a var — `HERO_VAR_ORIGINS`/`TEXT_FORMAT_VAR_ORIGINS`/
`COLOR_FORMAT_VAR_ORIGINS` em `html/format-context.ts`, `IMAGE_VAR_ORIGINS`
em `image/prompt-vars-builder.ts`, e assim por diante. Quem sabe de onde o
valor veio é o builder, não o chain; re-derivar depois é o modo de falha que
isto elimina (foi preciso reconstruir os prompts das runs de 24/08 à mão).

**O guard é a recomposição, não a confiança**: `buildSegmentedPrompt`
(`shared/prompt-provenance.ts`) devolve `{prompt, segments}`, e o call site
compara `segments` com o prompt REALMENTE enviado antes de gravar. Divergiu →
grava sem marcação. Isso cobre os três dialetos de template que convivem:
`{{var}}` (renderImageTemplate, com `{{#if}}`/`{{#case}}` pré-resolvidos por
`resolveBlockHelpers`), `{var}` (renderImagePrompt, prompt de imagem in-code)
e o renderer próprio do `qa.chain`.

**Armadilhas**: (a) campo novo no `finishGenerationRun` usa `?? undefined` —
`?? null` apagaria o que o start gravou; (b) o `usageOf`
(`chains/step-usage.ts`), que resgata dados de um erro, **copia campo a
campo**: o que não for copiado atravessa o guard e some; (c) segmento acima
de ~16k vira `{ref, sha8}` (só o catálogo do Curador hoje) e a UI resolve por
`GET /api/admin/agents/prompt-segment`, conferindo o hash.

Contrato em `shared/telemetry-contract.ts` (`PROVENANCE_CONTRACT` +
`missingProvenance`): perder a proveniência vira falha de teste, não run
verde. Documentação:
`docs/architecture/plano-telemetria-proveniencia.md`.

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
  Subject via mini-LLM `subject` (`anthropic/claude-sonnet-4.6` no banco em
  08/09; nasceu Haiku — config própria). Persiste com
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

> **SUPERADO EM PARTE (20/08).** A regra abaixo vale hoje só para campos
> `url` e `image`. Para COPY, a biblioteca nunca adotou `{{TAG}}`: o endereço
> é a **frase do `example`**, casada por `assignTextAnchors`
> (`html/copy-merge.ts:1-5`, `html/anchor-match.ts`). Os nomes citados nesta
> seção também mudaram: `auditSchemaTags`/`schema-tag-coherence.ts` viraram
> `auditSchemaAnchors`+`auditImageAnchors`+`auditOrphanText` em
> `email-workspace/schema-example-coherence.ts`; `variantHasPlaceholders`
> virou `variantIsFillable`; `validateTaggedHtml` e a camada
> `html_tagged`/`tagging_status` foram REMOVIDAS. Quem cadastra variante deve
> seguir `docs/email-generation/guia-de-cadastro-de-variante.md` — cadastrar
> pela regra antiga faz o campo nunca ancorar, em silêncio. O texto abaixo
> fica como histórico do problema que ele resolveu.

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

## Largura canônica de 600px nos componentes (set/2026)

Todo bloco da biblioteca (`email_component_variants`) **declara o container
em 600px** — é o que o Montador, o enxerto da hero e o preview assumem. As
variantes são documentos HTML completos (`<!DOCTYPE>` + calha `width="100%"`
+ container `width="600"` com `width/min-width/max-width:600px`); uma nasceu
em 598 e o bloco saía mais estreito que os vizinhos no email final.

**Preview em Email / Componentes** (`EGRenderFrame` com `emailWidth`):
o documento do iframe é montado por `buildEmailPreviewDoc`
(`lib/email-workspace/email-preview-doc.ts`, puro) — documento completo vai
como está; `<tr>` entra no tbody de uma tabela de 600; `<table>`/outro entra
em `<tr><td>`. Viewport EXATAMENTE 600px (o antigo era a largura da coluna,
~470px, e cortava o bloco); a coluna direita do editor foi de 540 → 640px
para caber sem escala, e o frame escala por `transform` quando a coluna é
menor. **Media queries mobile são neutralizadas no preview**
(`max-width:Npx` → `0px` só no prelúdio): a 600px `@media (max-width:600px)`
dispararia e mostraria a versão celular empilhada.

**Normalização** (`lib/email-workspace/email-width.ts`, puro, 27 testes) —
três correções, porque 100% num BLOCO não quer dizer nada (o bloco tem uma
largura só): (1) `<table>` cuja largura numérica está PERTO de 600 (560–640
— a assinatura de "container que errou o número") vira 600, e coluna interna
(350, 200…) nunca é tocada; (2) `<table>` de NÍVEL RAIZ com `width="100%"`
(a calha do boilerplate) vira 600 — tabela 100% ANINHADA continua 100%, ali
significa "preenche a célula", e a profundidade é contada fora de comentário
para os blocos MSO não confundirem a conta; (3) `width:100%` nas regras de
`body`/`html`/`.body` do `<style>` vira `600px`, menos dentro de `@media`
(lá é a versão mobile e tem de continuar 100%). `max-width:100%` de coluna
responsiva não é tocado. Raiz `<table>` de fragmento sem largura ganha
`width="600"`; raiz `<tr>` não tem onde declarar. Idempotente. Efeito
conhecido: em janela > 600px o bloco para de esticar e fica à esquerda — é
o certo para uma peça de 600px, e o preview roda a 600. Aplicada (a) no
salvar — POST/PATCH de
`/api/admin/components` normalizam ANTES do hash CM-6; (b) no editor, aviso
"Bloco fora de 600px" + botão "Fixar agora" (`auditEmailWidth`); (c) na
varredura `GET/POST /api/admin/components/normalize-width` (botão "Largura
600px na biblioteca" → dialog com prévia de/para por variante → aplicar).
A varredura **preserva o hash do renderizado quando ele estava em dia** com
o html antigo (senão 25 exemplos virariam "desatualizados" sem mudar de
significado) e normaliza também `html_tagged`.

**O container em 600 não bastava: a calha somava por fora** (incidente
08/09, Hero Boxers). Sintoma: "a formatação está errada, não está em
600px". As variantes estavam certas — container em 600 —, mas cada uma traz
a própria calha de boilerplate (`<table width="100%">` → `<td
align="center" style="padding:…">` → container). Na peça SOLTA aquele
padding é invisível, porque a calha ocupa a janela do cliente; dentro da
célula de 600px do email montado ela vira uma tabela e o padding **soma**
ao container — e a tabela não encolhe abaixo do próprio conteúdo, então
quem cede é o `.email-container`, que estica. Medido em Chromium: calhas de
0, 28 e 40px → container de **680px**, `scrollWidth` 712 num viewport de
680 (o preview cortava a direita) e cada bloco centralizado numa largura
diferente. Depois: 600px exatos, todo bloco em x=40. `auditEmailWidth`
dizia "ok" o tempo todo — achava o container em 600 e não olhava para fora
dele.

`neutralizeGutterPadding` (`email-width.ts`, puro) zera **só o horizontal**
da calha: o vertical é ritmo entre seções, o fundo é banda de desenho, e o
padding de dentro do container é o recuo do TEXTO — zerá-lo colaria a copy
na borda. Daí a régua estreita de "isto é calha": tabela de nível raiz que
ocupa o bloco, com UMA linha, UMA célula, e nessa célula nada além de uma
tabela que declara 560–640. `cellpadding` da calha também vai a zero (o
atributo pega as laterais), com o vertical migrando para o `<td>` quando
ele não declara padding. Calha feita de `<div>` NÃO é reconhecida — limite
declarado, não esquecimento.

Roda em DOIS pontos, de propósito: dentro de `enforceEmailWidth` (salvar,
editor, varredura — a biblioteca sai canônica e a auditoria passa a
reprovar) e no **encaixe** (`fitFragment`), porque variante gravada antes
desta regra continua no banco e o email montado não pode depender de
alguém ter clicado no botão da varredura. Fica no `fitFragment`, e não em
cada chamador, porque montagem e enxerto precisam do MESMO fragmento: se só
a montagem normalizasse, o `graftHeroVariant` compararia a região montada
com a variante crua, não veria igualdade e reenxertaria a versão com recuo.
Telemetria: `gutters_neutralized` no run do Montador (`AssembledStats
.guttersNeutralized`).

**O preview desktop mentia junto** (`ScaledEmailFrame`): a folga de
viewport (600 + 80 = 680) existia para não disparar o `@media (max-width:
620px)` do shell, mas o documento montado concatena variantes de origens
diferentes e **qualquer breakpoint entre 601 e 680px disparava dentro do
iframe sem disparar no client** (viewport de ~1000px) — um bloco na versão
celular ao lado de outro em desktop, "cada seção com uma largura", num
email correto no destino. Aumentar a folga não resolve (768px é comum) e
encolhe o preview: em modo desktop as media queries mobile são
NEUTRALIZADAS (`max-width:Npx` → `0px` no prelúdio), mesmo mecanismo do
`buildEmailPreviewDoc`. Abaixo de 600px o slider é simulação de celular e
elas ficam intactas para disparar.

---

## Modelo de imagem: GPT Image 2 com fallback (set/2026, migration 20261126)

**O primário voltou a ser `openai/gpt-5.4-image-2`** nos dois agentes que
compartilham o motor (`image` e `campaign_image`), e `google/gemini-3.1-flash-image`
é o segundo. Regras em `agents/image/model-policy.ts` (puro, 14 testes).

Isto é o caminho da migration 20261071, que a **20261072 desfez por um
motivo real**: o GPT Image 2 entra em LOOP DE WHITESPACE — 200 OK pingando
espaço por minutos, sem imagem. Na Luxe Lift (10/08) duas tentativas
queimaram 455 s da fase 2 e o email SAIU SEM a hero (o agente recebeu
`<hero_image url="" />` e removeu a linha). O defeito é do provedor e
continua existindo; o que mudou é o custo dele:

1. `OPENROUTER_IMAGE_BODY_TIMEOUT_MS` (300 s) corta o corpo que não termina
   — o `fetch` resolve nos HEADERS, então antes a leitura não tinha relógio.
2. **Fallback de MODELO**: falha de PROVEDOR (`ehFalhaDeProvedor`) troca
   para o Gemini e gera a imagem. Recusa por política de conteúdo NÃO
   troca — o segundo recusaria igual e a mensagem do primeiro é o que
   explica. A régua casa pelo **nome da classe** de erro antes do texto:
   `OpenRouterEmptyBodyError` diz "empty body" com ESPAÇO, e a primeira
   versão procurava `empty_body` — o fallback não disparava no corpo vazio.
3. **O fallback é UMA tentativa e tem orçamento** (`FALLBACK_ORCAMENTO_MS`,
   360 s): com retry próprio seriam 4 janelas de 300 s (~20 min) contra os
   760 s de `PHASE2_CHAIN_BUDGET_MS` — o remédio mataria o paciente. O
   primário já gastou os retries dele; o que falta é outro modelo, não mais
   insistência.
4. `onMeta.modelUsed` diz quem REALMENTE gerou. Sem isso a telemetria
   registraria "gpt-5.4-image-2" numa imagem feita pelo Gemini e comparar
   os dois viraria ficção. **O runner de e-mail ignorava esse campo até
   08/09**: gravava `ctx.imageConfig?.model` (o modelo PEDIDO) nas duas
   runs de sucesso, então imagem feita pelo fallback aparecia como se o
   primário tivesse funcionado — e a run é justamente onde se confere se
   uma troca de modelo pegou. As campanhas já passavam o valor certo.

**A tabela de modelos deste arquivo envelhece.** A troca é `UPDATE` na
linha ativa de `email_agent_configs` (sem bumpar `version` nem
`created_at`), então o banco muda sem o repo mudar — quatro células desta
doc estavam erradas em 08/09. A fonte é o banco; a receita de leitura e
de troca, agente por agente, é
`supabase/migrations/TROCAR_modelo_agentes.sql`.

**Duas variações do mesmo prompt saem uma de cada** (`modelosParaVariacoes`):
é comparação lado a lado, não duas tentativas do mesmo. Uma só usa o
primário — pedir uma imagem não é pedir um teste. Acima de duas, alterna.
Hoje o único ponto com quantidade é `/api/conteudo/ia`; é código, não
config, então não depende da migration.

Pior caso hoje: imagem do Gemini + uma linha `image.model.fallback` no log.
Antes: bloco sem imagem, em silêncio. Rollback = voltar o `model` das duas
linhas de `email_agent_configs` para `google/gemini-3.1-flash-image` (a
config do banco VENCE a constante do código).

## Objeções: Catalogador (macro) e Seletor (micro) (set/2026, migration 20261116)

Spec "Objeções: catalogação macro e seleção micro — v2"; plano e mapa em
`docs/email-generation/plano-objecoes-macro-micro.md`. Fato de partida: a
objeção existia em `client_stores.icp_objections` (35 lojas) e nenhum
agente a lia — `resolveObjecoes` servia `icp_frictions` (DOR) ao Curador,
`pesquisaToFullText` não incluía objeções (o Estruturador "adivinhava" a
dominante de prosa), o payload de copy levava `icp.frictions`. Corrigido na
fase 0: os dois leem `icp_objections`; o dossiê ganhou "O que trava o
checkout" na seção 03. Objeção ≠ dor: trava DEPOIS de querer o produto.

**Catalogador** (`src/lib/agents/objecoes/catalogador.service.ts`, agent
`catalogador`, sonnet-4.6): 1× por pesquisa — `pesquisa-completa` (antes
do enqueue, fail-open, TAMBÉM com `regeneration: true`), botão "Regenerar objeções" (rota v2) e
`POST /api/admin/objection-catalogs/batch` (backfill, 1 loja por chamada,
`exclude_ids`). Grava `client_stores.objection_catalog` (4 catálogos:
objeções tipadas por `tipo_de_risco` × `aliviador` com lastro e
`flows_elegiveis`; veículos de argumento; medos de categoria; incentivo —
`vocabulario.ts` é a fonte única dos domínios) e a PROJEÇÃO
`[{objection,treatment}]` em `icp_objections` (UI/n8n/PATCH intocados).
`catalogo-regras.ts` confere o checável (4–8, risco×aliviador único,
compatibilidade risco↔aliviador, uma dominante, nada de política inventada)
e reprova para retry; editar a projeção à mão marca `verificado` no
catálogo. Painel "Catálogo de argumento" na aba Pesquisa; loja SEM catálogo
(pesquisa anterior à feature) vê o bloco `ObjectionCatalogEmpty` com o botão
"Catalogar objeções" — é o backfill, loja a loja, pela tela (decisão 05/09:
sem batch em massa). O botão só habilita com a régua `hasContext` do service.

**Seletor** (`seletor.service.ts`, agent `seletor`, gate
`email_generation_settings.seletor_mode` off|shadow|on — **`on` desde
07/09**): por email, ANTES do Estruturador, decide o ALVO do toque (spec
§3.2) ou declara lacuna — nunca alvo inventado. **Desligado ele grava run
`skipped`** (`seletor_mode_off`, `model:'desligado'`), como o Estruturador
e o Montador: sem run nenhuma a linha dele fica "aguardando" para sempre
nas telas e parece travada. Os motivos de skip viram texto de gente na
Entrada da run (`MOTIVO_LEGIVEL`); `skip_reason` guarda o código. `ensureObjectionTargets` é o ÚNICO caminho e roda
**sequencial por `email_number`** como pré-passo da fila de dispatch, da
aba Teste e do botão de blueprints: a fase 1 roda 4 emails em paralelo e
`ja_atacadas` (o que os irmãos anteriores atacaram) depende da ordem.
Reaproveita o alvo vigente quando o catálogo não mudou (`catalog_sha8`).
Alvos em `store_email_objection_targets` (`is_current`, `consumido`).
Contrato do toque vem do frontmatter tipado de `email_intents`
(`intent-contract.ts`; sem `modo` válido não há contrato → run `skipped`
`sem_contrato`; proposta dos 8 do welcome em
`docs/email-generation/intencoes-welcome-frontmatter.md`). Rollout
welcome-only, como o Estruturador. **Só `modo` é obrigatório** — todo o
resto do frontmatter tem default derivado dele. Os 8 `modo` do welcome
foram gravados direto em `email_intents` em 07/09 e isso é **provisório**:
o sync do vault faz `upsert` por (flow_type, slug) e sobrescreve o
frontmatter inteiro, então some no próximo sync se as notas do Obsidian
não tiverem o campo.

**O contrato do toque vem de TRÊS fontes** (07/09). `parseIntentContract`
recebia SÓ o frontmatter e devolvia `null` sem `modo`
(`intent-contract.ts:106`) — o Seletor gravava `skipped` `sem_contrato` e
NUNCA rodava, porque as 8 notas do welcome no Obsidian não têm a linha
`modo:`. Ele só funcionou nas 7 horas de 07/09 entre eu gravar os valores à
mão em `email_intents.frontmatter` e o sync do vault (20:11) reescrever a
coluna a partir dos `.md` — o `upsert` de `vault-sync.service.ts:295` grava o
frontmatter INTEIRO, não faz merge. Dois erros empilhados: **fonte única** e
**ausência = inexistência**.

O dado sempre esteve em outro lugar: **11 dos 15 campos estão no catálogo da
loja**, com os mesmos enums (`tipo_de_risco`, `aliviador`,
`dimensao_confianca`). Prova: as 8 proibições e os 3 trabalhos fixos do alvo
de 14:06 saíram do catálogo e da PROSA da intenção — o frontmatter tinha uma
chave só. Precedência agora é **nota tipada > catálogo da loja > default por
modo**, com `origens` por campo no contrato (senão o modelo lê default como
ordem) e no `input_summary` da run. Do catálogo saem `riscos_elegiveis` e
`aliviadores_admissiveis` (das objeções elegíveis NAQUELE flow),
`dimensao_alvo` (da dominante), `veiculos_exigidos` (só os com `texto`) e as
proibições dos `alerta`. **`profundidade_minima` é `afirmacao` enquanto
nenhuma objeção tiver `lastro_operacional.verificado`** — sem confirmação da
loja não dá para exigir prova dura. **`incentivo.existe: null` NÃO vira
`promessa_a_pagar`**: "não dá para saber" não é oferta, e inventar promessa é
o pior erro possível aqui.

`modo` continua sem ser inventado por código: sem declaração o contrato sai
com `modo: null` e o Seletor **deduz da prosa** que ele já recebe inteira
(`<intencao_do_toque>`), ecoando em `modo`; a telemetria grava
`modo_adotado` + `modo_origem` (`declarado`|`deduzido`). `sem_contrato` saiu
dos motivos de skip — sobram `seletor_mode_off`, `sem_catalogo` e
`sem_intencao`. `seletor-regras` valida contra o modo EFETIVO
(`contrato.modo ?? alvo.modo`).

**Consumo (só com `seletor_mode='on'`)**: `generate.service` carrega o
alvo e marca `consumido`; Estruturador recebe `<decisao_de_objecao>` +
`<objecoes_ja_atacadas>` (DIAGNÓSTICO virou TRADUÇÃO; modos sem objeção;
"estrutura diferente não basta — o argumento não se repete"; varredura =
razões curtas; veículo sem insumo não vira seção; ecoa `diagnostico.alvo_id`
— `objecao_dominante` só no fallback sem alvo); Curador legado e do vault
recebem `<alvo>` e rankeiam `momento → objecao → aliviador → profundidade
→ registro → paleta → papel_na_peca` com `proibido_neste_toque` como
desempate (nunca veto — ver abaixo);
copy do n8n leva `emails[].alvo` (aditivo, `docs/email-copy-payload-v2.md`).
**`proibido_neste_toque` é restrição de REDAÇÃO, não de curadoria** (incidente
07/09): servido ao Curador com força de veto, o alvo trouxe 8 proibições de
COPY ("não prometer nota média", "não criar urgência") e o agente eliminou
reviews, cupom, urgência e origem da marca — o Curador legado caiu de 6 para
1 posição rankeada, a montagem saiu com o rodapé sozinho e a hero morreu em
`hero_failed` por não existir região. Nos dois prompts do Curador a proibição
agora DESEMPATA e nunca elimina; quem a cumpre é o n8n. Guardas derivados:
`coberturaSuficiente` (assemble-document) recusa a referência quando metade
das posições fica sem variante, em vez de montar peça degenerada; e
`aplicarEstruturadorNoBlueprint` não cola papel quando o número de papéis
diverge do de blocos — era assim que o papel da hero ia parar no rodapé.
Sem alvo, TODOS recebem ausência declarada (`alvo-render.ts`) e voltam ao
comportamento anterior — desligar o Seletor nunca regride.

**Recusar a referência nova não basta: a velha tem de sair** (incidente
07/09, 14:06). Com a proibição já corrigida, o Curador do vault voltou a
rankear e a hero existia na peça — e a geração morreu em `hero_failed` de
novo, porque a montagem RECUSOU corretamente (`reference_source: "none"`,
`coberturaSuficiente`) e a fase 2 seguiu lendo a linha de 13:45 em
`store_email_references`, o documento de um bloco. Guard vira DELETE:
cobertura insuficiente apaga a referência daquele store/flow/email.
Referência que não representa o email é pior que referência nenhuma.
**O ranking também aceita
apelido**: o Curador escolheu `offer-4-manifesto-antes-do-cupom` — o SLUG da
nota, que ele leu no catálogo que nós servimos — e o parser jogou em
`invalid_ids`, perdendo a posição. `buildAliasIndex` (catalog-builder)
indexa nome e slug normalizados → id, ambíguo é DESCARTADO (resolver para a
variante errada é pior que não resolver), e `resolvedByAlias` conta a
frequência em `ids_por_apelido` na telemetria dos dois Curadores.
**Lacuna de biblioteca que sobra e é dado, não código**: para `welcome-1` as
9 variantes de products são eliminadas por `momento` (products-4 e
products-9 vetam `welcome-1` explicitamente), as de reviews não declaram o
momento, e body-6/7/8/9 estão ATIVAS **sem `output_schema`** — sem schema
não entram na biblioteca servida ao Curador, então não existem para ele.

**O Curador enxergava bloco DESATIVADO** (07/09, terceiro ato). As
ferramentas `listar_pasta`/`ler_nota` filtravam `is_active` da NOTA
(`email_vault_docs`) e nunca da VARIANTE (`email_component_variants`). Ele
leu `offer-4-manifesto-antes-do-cupom.md`, escolheu o bloco — `is_active =
false`, portanto fora do catálogo servido (`.eq("is_active", true)`) — e a
escolha morreu em `invalid_ids`. Nem o índice por apelido salva: ele é
construído sobre as ELEGÍVEIS. Hoje as duas ferramentas cruzam
`kind='variante'` com a biblioteca; `ler_nota` responde "esta variante está
desativada e NÃO pode ser escolhida" em vez de "não encontrada" (o modelo
precisa saber que existe e está fora). Erro na checagem serve demais e loga
— calar o vault inteiro tiraria a anatomia das 36 boas para proteger contra
4. Sintoma que denuncia: nota ativa × variante inativa (offer-4, offer-5).

**"Cai no template global, que TEM hero" era FALSO** e derrubou a régua de
cobertura. O global do `welcome-1` tem 21.314 chars, **zero placeholders e
nenhum marcador `cfy:hero`** — `locateHeroRegion` não acha região nem por
marcador nem por tag, então recusar a montagem GARANTE `hero_failed` em vez
de evitá-lo. A maioria estrita do PR 9 saiu: `coberturaSuficiente` agora
mede o que a fase 2 exige de fato — **sequência que pede hero e não recebe
nenhuma é recusada**; peça com hero e poucas seções é POBRE, não inviável,
entra, e as lacunas ficam no `slot_map` e na telemetria, onde a curadoria
pode ser cobrada.

**O eixo `momento` foi APOSENTADO** (07/09). O dado que decidiu: fora da
hero, **nenhuma variante do catálogo declara `welcome-1`** — nem body, nem
offer ativo, nem products, nem reviews. A regra não separava boa de ruim,
eliminava quatro seções inteiras; e os 7 vetos de `welcome-1` (products-4/6/
8a/9, hero-7/9, body-10) cortavam justamente as vitrines. O campo saiu de
`CatalogVaultExtra` e do JSON do catálogo, o bloco `<momento>` saiu dos dois
prompts do Curador (com `buildMomentoBlock`, e com ela a única leitura de
`k.eixos`), a ordem do ranking virou `objecao → aliviador → profundidade →
registro → paleta → papel_na_peca`, e `momento_vetado`/`momento_nao_declarado`
sumiram de `measureProtocolViolations` — sem dado servido e sem regra, medir
"violação" seria inventar erro no log. `momentoDoEmail` sobrevive só como
REGISTRO na telemetria.

**Tirar a regra do texto, não só do dado** — lição repetida do `exige`: a nota
`_protocolo-de-selecao.md` manda eliminar por momento no passo 5 e é servida
em `{{protocolo}}`; as notas de seção ensinam momento como chave de decisão.
Servir a REGRA sem servir o DADO faz o modelo procurar campo que não existe ou
deduzir o momento da prosa e eliminar assim mesmo. `semMomento` (irmã de
`semExige`) tira do markdown servido o ITEM NUMERADO inteiro que cita momento
(linha a linha sobrariam fragmentos de frase), o parágrafo solto e a coluna de
tabela; roda no `buildProtocoloBlock` e no `buildSecaoNotasBlock`. Os dois
prompts ainda declaram a precedência ("o eixo foi APOSENTADO… o passo 5 está
SUPERADO"), porque as ferramentas de vault podem ler a nota crua.

**Repetir a mesma variante é permitido fora de `hero` e `products`**
(07/09, `repeticao.ts`). Vinha do incidente Luxe Lift (23/08, posições 2 e 3
idênticas) uma regra que generalizou demais: `dedupeDecisions` trocava a
escolha em QUALQUER seção e `measureProtocolViolations` acusava
`variante_repetida` em todas — repetir um corpo, uma oferta ou um CTA é
composição legítima, e desfazer isso rebaixava o encaixe rankeado pelo
Curador em nome de uma variedade que ninguém pediu. Só duas seções seguem
únicas, por motivos distintos: `hero` porque `locateHeroRegion` recusa por
ambiguidade e a peça morre em `hero_failed`; `products` porque o feed puxa
os mesmos `top_products` e a MESMA grade apareceria duas vezes. Fora delas
a repetição vira **registro** (`repeticoes[]` no `parsed_output` do
`assembler_chooser`), nunca violação — contar acerto como erro corrompe a
contagem que a gente lê para julgar o Curador. `podeRepetir(section)` é a
fonte única (com `normalizarSecao`, que o `ehHero` da montagem também usa)
e seção desconhecida PERMITE: inventar restrição sobre nome que não
conhecemos é o erro que o módulo desfaz. `dedupeDecisions` só age quando o
caller passa `sections` — sem saber a seção, não desfaz nada. Os prompts
dos dois Curadores deixaram de pedir variedade e declaram a precedência
sobre as notas do vault, como no `momento`.

**Ponte de vocabulário** (`aliviador-bridge.ts`): o eixo `objecao` das
notas do vault tem 11 valores próprios; risco×aliviador do alvo →
`eixo_objecao_equivalente`, e cada variante ganha `aliviador`/
`profundidade` DERIVADOS de block_type+objecao+exige (frontmatter
`aliviador:`/`profundidade:` na nota VENCE). `exige_medicao` fica fora do
JSON servido ao Curador (01/09: eliminar por `exige` reprovava sobre
requisito não verificável) — serve só ao medidor
(`aliviador_ausente`/`proibicao_violada`). **Autoria pendente no vault**:
mesma ordem de ranking na nota `_protocolo-de-selecao`; as 26 intenções
fora do welcome; `aliviador`/`profundidade` nas 44 notas.

## Módulo Conteúdo — Dashboard Social + Estúdio de Carrosséis (set/2026)

Item "Conteúdo" no grupo Marketing do workspace Operacional, com **submenu
suspenso** (`NavItem.children` em `nav-config.ts`: expandido abre acordeão,
colapsado abre flyout; o ⌘K achata os filhos via `flattenNavItems`). Ids
`ops.conteudo*` em `role-access`, rotas em `ROUTES.ADMIN.CONTEUDO`, prefixo
`/admin/conteudo` no `use-workspace`. Reels e Ideias são telas "em breve";
Dashboard, Estúdio e Calendário estão completos.

**Não existe perfil fixo** (migration 20261120): perfil = canal Instagram
conectado da org (`crm_channels.type='instagram'`). Quem conecta um canal
ganha um perfil no módulo; handle, nome, foto e seguidores vêm da Graph API.
A foto é REGRAVADA no Storage (`stores/org-<id>/email-assets/avatar-<canal>`)
porque a URL do CDN da Meta expira e não pode ser embutida na exportação.
Cor do perfil é derivada da POSIÇÃO do canal (`corDoPerfil`), não do
Instagram. YouTube aparece no seletor como "não conectado" — não há
integração, e fingir dado seria pior que a lacuna.

**Nada é mock.** Tabelas novas (todas com RLS `TO authenticated` + escopo por
org): `conteudo_documentos` (Documento inteiro em JSONB), `conteudo_brand_kits`
(por canal), `conteudo_meus_templates` (estrutura lida de inspiração),
`conteudo_agenda` (1 por documento, UNIQUE), `conteudo_ig_media` (mídias +
insights) e `conteudo_ig_daily` (série da conta). O trigger de
`atualizado_em` usa **`clock_timestamp()`, não `now()`** — `now()` é o início
da TRANSAÇÃO e não anda dentro dela, e esse carimbo é a versão que detecta
salvamento concorrente no editor.

**Sync do Instagram** (`conteudo-instagram-sync.service.ts`): mídias +
insights POR MÍDIA (do conjunto mais rico ao mais básico — a Meta muda o
conjunto aceito por tipo, e `#100` significa "tente menos métricas", não
"token inválido") + série diária da conta. O dashboard lê SEMPRE do banco;
o sync inline só roda quando o canal está defasado (30 min) e tem orçamento
de tempo. O cron `instagram-snapshot` (05:15 BRT) sincroniza tudo com budget
por canal. Falha de insight fica na linha (`insights_error`), nunca derruba
a página.

**O histórico vem INTEIRO, por backfill retomável**: a janela fixa de 120
dias fazia qualquer período mais antigo aparecer vazio como se não houvesse
post. `syncChannelConteudo` faz duas passadas — TOPO (2 páginas: novidades +
curtidas/comentários atualizados) e BACKFILL (até 20 páginas a partir do
cursor salvo). `varrerMedia` devolve o cursor em vez de insistir: teto de
páginas, orçamento de tempo estourado e falha no meio da paginação todos
preservam o lote já lido e o `paging.next` (`media_cursor`,
`backfill_done`, `media_oldest_at` em `crm_channels.config.conteudo`). Canal
com backfill pendente IGNORA o TTL de 30 min — cada abertura do dashboard
avança mais um pedaço — e o payload traz `cobertura` (total de posts, mais
antigo, mais recente, `backfillPendente`) fora do período, que é o que
distingue "nenhum post NESTE período" de "nada sincronizado ainda": o estado
vazio da tabela diz qual dos dois é e oferece "Ver desde <data do último
post>".

**Leads do conteúdo = comment gate medido de verdade** (`atribuirLeads`, puro):
contato que COMENTOU num post e depois (até 14 dias) abriu direct é lead
daquele post; casa por id do remetente e, na falta, pelo username; o
comentário mais recente antes da conversa vence. Threads `comment:<media>`
nunca são leads (é a conversa dos comentários, não do contato). Receita
atribuída = negócios GANHOS de contatos do Instagram no período.

**Métrica sem fonte sai `null`, com a nota do porquê** — nunca zero, nunca
inventada: `montarFunil` marca "webhook de comentários sem eventos" quando a
Graph API vê comentários e o nosso banco não, e "insights indisponíveis"
quando a Meta não entrega alcance. Alcance prefere os insights da CONTA
(`conteudo_ig_daily`) e cai para a soma dos posts, dizendo qual usou.
`montarPilarMix` conta só os classificados e informa quantos ficaram fora.
Agregação inteira em `lib/conteudo/dashboard/agregacao.ts` (puro, 20 testes).

**Pilar, molde e palavra-chave são CLASSIFICAÇÃO HUMANA** (`PATCH
/api/conteudo/posts/[id]`, no drawer do post): a Meta não sabe o que é um
"Turbo". Sem classificação, mix e desempenho por molde dizem isso em vez de
mostrar número. Com o histórico inteiro no banco, post a post não escala:
`PATCH /api/conteudo/posts` classifica a SELEÇÃO da tabela (até 500 ids,
campo ausente no corpo não é tocado, campo `null` limpa) e o dashboard tem
filtros de pilar e molde com a opção "Sem pilar"/"Sem molde" — que é onde o
trabalho está. A seleção é PODADA pelo filtro visível (`idsVisiveis`): sem
isso, "selecionar todos" seguido de um filtro alcançaria post fora da tela.

**Estúdio no servidor**: documentos, brand kits, templates do time e agenda
persistem via `/api/conteudo/*`; `data.ts` é a ÚNICA porta do cliente e
lança `ConteudoApiError` com a mensagem da API. O autosave manda o carimbo
`atualizadoEm` que carregou; divergiu, a rota responde **409 com a versão
atual** e o editor oferece Recarregar ou Sobrescrever (nada de sobrescrever
em silêncio). Documento com imagem em base64 é RECUSADO (413 acionável):
imagem entra pelo `POST /api/conteudo/upload`, que redimensiona no servidor
(≤1350px, avatar 256) e devolve a URL servida pelo admin. O painel Mídia
sugere o **banco real da org** (`/api/conteudo/assets`, uploads + gerações
da ConvertIA), não banco de imagens genérico.

**IA sem inventar**: o system prompt perdeu handles, cases e números fixos —
a voz (marca ou pessoal) e o handle vêm do perfil escolhido, e prova/dado
só entram se o usuário informar; sem prova, o slide sai com `[confirmar]` no
lugar do número. O modo local (`ia/fallback.ts`) faz SÓ o que dá sem modelo:
distribuir texto colado e corrigir compliance. Headline, legenda, estrutura
e leitura de inspiração falham com a mensagem do erro — não existe mais
resposta "local" que fingia conteúdo.

**Calendário** (`/admin/conteudo/calendario`) é real: mês a mês com o que foi
publicado (verde, da conta conectada) e o que está agendado no Estúdio
(âmbar), lista do dia e cadência da semana por perfil. A publicação em si
continua no app do Instagram — o calendário organiza a cadência e marca o
status do carrossel.

**Renderer e exportação** seguem como estavam: base 1080 (4:5 = 1350, 9:16 =
1920), só estilos inline e SVGs inline, o MESMO componente desenha canvas,
miniaturas, prévia e exportação; PNG/JPG por `<foreignObject>` → canvas, ZIP
com jszip e `legenda.txt`. Fontes self-hosted em `public/fonts` (a exportação
precisa da URL). Id de DOM em componente SSR-ável vem de `useId` — com
`Date.now()` o id divergia na hidratação e a exportação não achava o frame.

## Estúdio — Referências: a ConvertIA passa a ver carrossel bom (set/2026, migration 20261133)

Medido antes de escrever: o Estúdio tinha **0 documentos, 0 brand kits, 0
templates e 0 agendamentos** em produção (nunca usado), e a IA escrevia
carrosséis só com REGRA (pilares, moldes, limites, compliance) — nunca tinha
visto um carrossel bom da casa. O material existia: 9 carrosséis reais em
`conteudo_ig_media` com legenda e métricas (o melhor com 23 salvamentos e
19 compartilhamentos). Os que o time gosta chegam por upload. "Transformar
em modelo" tem DOIS sentidos e o usuário pediu os dois: referência de
CONTEÚDO (esta fase) e layout visual novo (fase seguinte, só para o que os 5
tipos de frame não reproduzem).

**Tabela `conteudo_referencias`** (RLS `TO authenticated` + escopo por org):
slides (imagens no Storage, com prefixo `ref-` para ficarem FORA das
sugestões de Mídia), copy transcrita por slide, legenda, `por_que_funciona`,
pilar/molde/palavra-chave, `peso` 1..3, `ativa`, `transcricao`
pendente|lida|erro. `ig_media_id` liga ao post real com SET NULL (apagar o
cache do Instagram não apaga o que alguém curou) e UNIQUE parcial por
(org, ig_media_id): importar o mesmo post duas vezes é clique duplo.

**Duas entradas** (`conteudo-referencias.service.ts`): importar do Instagram
(`GET /api/conteudo/referencias/candidatos` lista os CAROUSEL_ALBUM ainda não
importados por salvamentos; `POST .../importar` lê os filhos via Graph
`/{media}/children`, regrava cada slide no Storage porque a URL do CDN da
Meta expira, e carrega as métricas reais) e upload (`POST
/api/conteudo/referencias` com `slidesUrls` vindas do upload `kind=referencia`).
Nos dois casos a IA TRANSCREVE (`transcrever_referencia`, saída validada por
schema: tipo/título/corpo por slide + por que funciona + pilar/molde
sugeridos). Falha vira `transcricao='erro'` com a mensagem na ficha e o
botão "Ler de novo" — a referência não some, o humano vê o porquê. Copy
editada à mão marca `lida`: referência sem copy nenhuma não é utilizável.

**Como entra no prompt** (`lib/conteudo/referencias.ts`, puro, 12 testes) —
três regras que erram em silêncio:

1. **Exemplo de ESTILO, nunca fonte de dado.** As referências carregam
   números de OUTROS posts. O bloco diz em cima e embaixo que não são dado
   deste carrossel — sem isso a IA "cita" um resultado alheio, e o system
   prompt que proíbe inventar número não pega, porque o número foi servido.
2. **Seleção por afinidade, não por ordem de cadastro**: mesmo molde (+100)
   > mesmo pilar (+40) > peso do humano (×10) > salvamentos. A rota deriva o
   contexto de `gerar_estrutura` pelo template (`ST_MOLDE_KEY`) e, nas
   outras ações, pelo `resumo` do documento.
3. **Teto em itens (4) E em caracteres (7000)**: quatro referências de 10
   slides já são 6–8 mil chars; sem teto o exemplo engole o pedido e o
   modelo repete a referência em vez de escrever a pauta.

`executarIA` recebe `blocoReferencias` e prepende só nas ações de escrita
(`ACOES_COM_REFERENCIAS`); a leitura de inspiração e a transcrição não
recebem. Carregar referências é fail-open na rota — sem tabela ou sem
referência, a IA escreve como antes. **Sem referência utilizável, nada entra**
(bloco vazio, não "nenhuma referência"). O rodapé do chat do editor mostra
"N ref." / "sem ref." para o operador saber em qual regime a resposta saiu.

**Na home** (`referencias.tsx`, seção acima de "Meus templates"): cards com
selo (Em uso / Lendo… / Falhou / Desativada / Sem copy), diálogo com abas "Do
seu Instagram" e "Enviar slides", ficha com copy por slide ao lado da imagem,
por que funciona, pilar/molde/kw/peso/ativa.

**Primeira referência entrou à mão** (08/09): o usuário mandou 5 slides do
carrossel "8% dos clientes fazem 41% do faturamento" pelo chat — imagem que
chega no chat não tem como subir para o Storage daqui, então a linha foi
gravada por SQL com a copy transcrita e o "por que funciona" escritos à
mão, `imagemUrl` vazia. A tela já tolerava slide sem imagem, mas não havia
como ANEXAR depois: a ficha ganhou "Enviar imagem" por slide e o PATCH
aceita `imagemUrl` **só onde não existe** e só se o caminho for do Storage
desta org com prefixo `ref-` (o que o upload da tela acabou de gravar) —
trocar imagem existente continua fora, a transcrição foi feita sobre ela.
A anatomia visual desse formato (par itálico-serif + negrito, card com
kpi_grid/print/conta à mão, anotação manuscrita com seta, pílula) está em
`docs/conteudo/formatos/editorial-convertfy.md` para a fase 2.

**Ficou de fora, de propósito**: layout visual a partir da referência (fase 2,
depende dos carrosséis que o usuário vai mandar), smoke e2e do Estúdio
(`e2e/smoke-conteudo.spec.ts`), e a métrica "leads/molde" do dashboard — que
só existe depois de classificar os 87 posts (0 classificados hoje).

## Estúdio — Motor editorial: triagem → headline → espinha → copy → revisão (set/2026)

O "100% com IA" gerava tudo numa chamada a partir da pauta. O material da
BrandsDecoded (versionado em `docs/conteudo/referencias-editoriais/`) mostrou
o que faltava: a headline escolhida entre várias e a espinha aprovada ANTES
da copy. Plano e o mapa recriar × adaptar × complementar em
`docs/conteudo/plano-templates-duas-vias.md`. Sem migration: o estado vive em
`Documento.editorial` (o schema do documento é `passthrough`).

**Camada pura** (`lib/conteudo/editorial/`, 18 testes):
- `padroes.ts`: a TABELA da casa, adaptada ao dono de e-commerce (dado
  contraintuitivo, morte de X, vilão externo, conta traduzida, marca como
  âncora, contraste, por que [grupo], investigando, dois-pontos) + 6
  gatilhos + checklist de rejeição por regex. A RÉGUA é a deles (≥ 1 padrão,
  ≥ 2 gatilhos, anti-padrão reprova); a tabela é nossa e é hipótese até o
  loop de dado calibrar. `avaliarHeadline` é o veredito por CÓDIGO — a IA
  pode se enganar sobre o próprio texto, e o teste garante que todo exemplo
  da tabela passa no próprio checklist (foi assim que um exemplo meu com
  "Não é X, é Y" caiu antes de ir para o prompt). `validarContratoCapa`: o
  subtítulo nunca começa com conectivo e os limites vêm do CANVAS
  (`ST_LIMITES`), não de contagem fixa — a capa da casa tem 8 palavras.
- `anti-slop.ts`: o filtro universal com o TRECHO que reprovou (binários,
  cacoetes, aberturas/fechamentos proibidos, dado sem fonte, travessão,
  jargão). **Segunda pessoa NÃO é regra global**: entra só quando o perfil
  não a libera (`segundaPessoa: false`) e como aviso — o carrossel que o
  time mais gosta é todo em "você", e um teste fixa que a copy da casa passa
  limpa. Anglicismo numérico só na legenda (título de dado com "3x" é o
  molde).
- `revisao.ts`: 7 parâmetros com nota (mínimo 8). Parâmetro que a IA não
  devolveu entra com 0 (ausência não é aprovação); violação de slop pelo
  código rebaixa a nota da IA a 5 e dado sem fonte a 6, como o manual.
- `papeis.ts`: a copy sai DA ESPINHA — capa = headline, CTA = comment gate,
  meio = hook → mecanismo → prova → aplicação → direção → fechamento,
  esticado ou cortado pelo número de frames sem nunca cortar os 3 finais
  enquanto houver 3 (regra "os últimos 3 preparam o CTA").
- `prompt-bloco.ts`: o bloco do system prompt é GERADO dessas tabelas —
  regra que o modelo recebe e regra que o código confere são a mesma.

**Ações da IA** (`ia/schemas.ts` + `ia/service.ts`): `triagem`
(transformação, fricção, ângulo, evidências A/B/C com fonte, eixo, funil,
promessa), `headlines` (agora 10 objetos `{texto, subtitulo, padrao,
gatilhos, veredito}`; `modo: diagnosticar` avalia a atual; `resumo` virou
opcional — quem cria não tem documento), `ajustar_headline` (reescreve UMA
mantendo as outras; "misturar com a N"), `espinha`, `revisar` (nota por
parâmetro e por slide + `reescrita` opcional) e `gerar_estrutura` com
`triagem/espinha/papeis` opcionais (com eles a copy é derivada; sem eles o
caminho direto continua). Temperatura 0,2 na revisão, 0,8 nas headlines.

**UI** (`editorial-motor.tsx`, um componente para dois lugares): no
"100% com IA" (bloco "Motor editorial", opcional — o botão vira "Gerar
carrossel pela espinha" ou "Gerar direto (sem triagem)") e no editor
(Ajustes → Conteúdo → Motor editorial, `editorial-panel.tsx`), onde ganha
"Gerar copy pela espinha", "Revisar copy" e "Aplicar reescrita" por slide.
Escolher a headline aplica na capa e vira o nome; trocar de headline ou
refazer a triagem invalida o que foi derivado delas. Gerado pela espinha, o
editor abre nos Ajustes — o passo seguinte é revisar.

## Estúdio — Via B: o prompt de imagem de cada slide (set/2026)

O usuário faz os slides de que mais gosta direto no ChatGPT Image, porque
"um prompt sem estar engessado" rende algo mais personalizado que um
template. A via B escreve esse prompt a partir do que o documento JÁ
sabe e o oferece por slide, editável, com dois destinos para o MESMO
texto: **Copiar** (cola no ChatGPT — zero custo de API, é o fluxo atual) e
**Gerar** (rota `gerar_imagem`, 2 variações lado a lado: GPT Image 2 ×
Gemini, regra que já existia em `image/model-policy`).

**Construtor puro** (`lib/conteudo/prompt-slide.ts`, 15 testes): entra
frame + posição + papel narrativo do motor editorial (`papeisDosFrames`)
+ cores/brand kit/fundo/proporção do documento + "por que funciona" das
referências mais afins (`selecionarReferencias` por molde, no CLIENTE).
Sem papel (documento sem motor editorial) a cena vem do TIPO de frame —
nunca fica sem cena.

**Híbrido é o padrão, e o motivo é o texto.** Modelo de imagem erra
acento, troca palavra e não repete a fonte entre slides. No híbrido o
prompt gera só o VISUAL — proíbe qualquer letra — e diz ONDE o texto vai
ficar por cima (terço inferior na capa `a`, centro na `b`, metade
superior/inferior no texto conforme a variante, véu escuro na prova),
porque foto com detalhe atrás do título some com a copy. O renderer
escreve a copy com a tipografia da casa: continua editável, consistente
por construção, e a "cara de ChatGPT" fica onde ajuda. O modo
**Slide inteiro** (`imagemModo: "completo"`) é opção explícita: o prompt
leva a copy EXATA entre aspas ("não traduza, não resuma, não acrescente
uma palavra; se não couber, reduza a fonte, nunca o texto"), as fontes por
NOME (Barlow Condensed / Georgia itálico / Inter), a anatomia do tipo
(número de 360 px no dado, barra de progresso e "02 · item de 7" na
lista, aspas gigantes na prova, pílula do CTA com o texto do botão) e o
rodapé de marca com o contador "N/M" — para o slide parecer da mesma
família dos que o renderer desenha. `dado` e `cta` só existem em
"completo": o renderer deles não tem lugar para imagem, e oferecer híbrido
ali seria botão que não faz nada.

**O que muda no documento** (sem migration — `documentoSchema` é
`passthrough`): `DocFrame.promptImagem` (só o EDITADO é gravado; igual ao
sugerido ou vazio volta a "sugerido", e a sugestão acompanha a copy
quando ela muda) e `DocFrame.imagemModo`. No híbrido, aplicar a imagem
num frame que o template criou SEM slot dá `slotsImagem: 1` — o renderer
de texto/lista/mec já desenha o slot quando ele existe. No completo o
renderer mostra a imagem full-bleed e NÃO escreve texto nem rodapé
(`slideInteiro` em `frame.tsx`; o prompt já pediu o rodapé ao modelo) — a
tela avisa que a copy dos campos deixou de aparecer. `trocarTemplate`
carrega imagem, prompt e modo: no completo a imagem É o slide, não
depende de slot; no híbrido o frame novo ganha o slot se o tipo tiver
lugar.

**A rota só solta a proibição de texto no modo completo**
(`entradaImagemSchema.modo`). Nos outros, o sufixo "sem texto na imagem"
continua como rede de segurança: prompt editado à mão que esqueça de
proibir texto ainda sai sem letras.

**Sugestão automática** (`pedeImagem`): frame visível, com lugar para
imagem, sem imagem e com menos de 60% do espaço de texto usado
(`preenchimento` = caracteres escritos sobre a soma dos limites de
`ST_LIMITES`; campo sem limite fica fora da conta). O painel lista esses
slides com o percentual, clicáveis — é o "< 60% de preenchimento" do
material da BrandsDecoded, medido pelo renderer em vez de estimado.

**Ficou de fora, de propósito**: gerar em lote para todos os slides que
pedem imagem (o custo por clique precisa ficar visível enquanto o
usuário calibra os prompts) e o layout visual novo a partir de referência
(fase 3 do plano, famílias Editorial/Alternado).

## Estúdio — Identidade visual: a família Editorial (set/2026)

O molde decide a SEQUÊNCIA dos slides; a **família** decide como eles são
desenhados. Trocar de família não mexe em uma palavra da copy. Duas hoje:
`padrao` (a identidade azul que já existia, byte a byte) e `editorial`, o
formato que o time mais gosta, medido slide a slide em
`docs/conteudo/formatos/editorial-convertfy.md`.

**Tokens em módulo puro** (`lib/conteudo/familias.ts`, 11 testes): paleta,
gradiente, fundo claro/escuro, CTA e um `traco` com as cinco fontes por
papel, caixa e peso do título, raio, inclinação da anotação e o fator do
gancho. O renderer perdeu toda constante de fonte — quem decide é a
família, e um teste garante que toda família tem o traço completo.

**Trocar de família não é rolo de tinta**: `aplicarFamilia` só substitui o
valor que ainda é o DEFAULT da família atual. Cor escolhida a dedo, fundo
trocado num slide e CTA repintado sobrevivem; o ângulo do gradiente é do
usuário (ele o edita num slider) e nunca muda. Ida e volta devolve o
documento à paleta original — é o teste que fixa isso.

**`**palavra**` sai na cor de destaque** (`rich.ts`). Duas consequências
que os testes travam: o limite de caracteres conta o texto SEM os
marcadores (senão marcar três palavras encolheria a fonte sem uma letra a
mais na tela), e **durante a edição o texto vai CRU** — o `contentEditable`
devolve `textContent`, e renderizar formatado apagaria a marcação no
primeiro clique. Em fundo escuro a MESMA cor é clareada (`clarear`) em vez
de uma segunda cor no documento, que o usuário teria de manter em sincronia.

**Dois campos novos, aditivos**: `gancho` (a linha em serif itálica que faz
PAR com o título — "todo título é um par" é a regra do formato) e
`anotacao` (o rabisco à mão, inclinado, na cor de destaque). Não vêm no
molde: o painel Texto tem "Campos deste slide" para ligar e desligar, e
remover apaga o TEXTO junto (o renderer desenha pelo texto, e deixá-lo
para trás manteria a linha na tela sem campo na lista). Na Editorial o
gancho cresce 35% e usa a tinta, não o destaque: com ele pequeno e
colorido o par vira legenda, que é outra coisa.

**Fontes self-hosted** (`public/fonts`, OFL): Instrument Serif itálica (o
gancho) e Caveat (a anotação), declaradas em `conteudo-slides.css` **e** na
lista da exportação — sem elas o PNG sai com a serif do sistema e a peça
exportada não é a que está na tela.

**Onde se escolhe**: no diálogo de criação (ao lado do nome, com a
descrição da família) e no editor, painel Marca → Identidade visual. A via
B lê a família: a direção de arte da Editorial pede matéria impressa (luz
quente, grão de papel, sombra curta) e o prompt do slide inteiro descreve
as fontes e a caixa que a família realmente usa.

**Verificado renderizando**: os oito slides das duas famílias foram
desenhados com `renderToStaticMarkup` e fotografados no Chromium antes e
depois de cada ajuste. Foi assim que apareceram o gancho pequeno demais e o
destaque ilegível no fundo escuro — nenhum dos dois quebra teste.

## ConvertIA — Internet e MCP de terceiro (set/2026)

**Conector "Internet"** (`connectors/web.ts`): `web_buscar` + `web_abrir`, o
par que o Claude oferece. Módulos puros com 40 testes em `lib/ai/web/`.

**A URL é escolhida pelo MODELO** — daí a lista de permissão estreita em
`web-guard.ts` (14 testes): só http/https, só porta 80/443, e host que não
seja localhost, IPv4 privado, link-local, IPv6 interno nem sufixo de rede
(`.local`, `.internal`). O `fetch` usa `redirect: "manual"` e **cada
redirecionamento passa pela mesma régua**: um host público responde 302 para
`169.254.169.254` e, se o fetch seguisse sozinho, a URL final nunca seria
checada — as credenciais do runtime sairiam no corpo da resposta. Armadilha
que já custou um bug aqui: o construtor de `URL` NORMALIZA
`::ffff:127.0.0.1` para a forma hexadecimal `::ffff:7f00:1`, então casar só
o quarteto decimal deixa passar exatamente o bypass que a função existe para
impedir.

**Conteúdo de site é DADO, nunca instrução**: todo texto de fora vai
embrulhado em `<conteudo_externo>` com a frase que diz ao modelo que pedido
dentro da página é texto que ele está LENDO, não ordem que recebeu. Sem o
rótulo, abrir página é canal de injeção de prompt.

**A web não substitui a base da casa**: o `guidance` do conector manda usar
`conhecimento_buscar` para método/copy/flows/processo da Convertfy e reservar
a internet para fato externo. E o conector **nasce DESLIGADO** — é a única
exceção ao "tudo disponível liga sozinho" do composer: ligado por padrão
gastaria rodada buscando fora o que o vault responde melhor, e faria post
aleatório valer tanto quanto a doutrina escrita.

**Busca por provedor plugável** (`web-search.ts`): `TAVILY_API_KEY` →
`BRAVE_SEARCH_API_KEY` → `SERPER_API_KEY`, o primeiro configurado vence;
trocar de fornecedor é trocar variável, não código. **Em produção roda o
Serper** (set/2026): US$ 0,30–1,00/1.000 contra ~US$ 8/1.000 do Tavily, e
a vantagem do Tavily — conteúdo já extraído — rende pouco aqui porque
`normalizarResultados` corta o trecho em 800 caracteres de qualquer jeito
e quem lê a página inteira é o `web_abrir`. O `limite` é capado em 10
porque acima disso o Serper cobra 2 créditos. Conferir se a chave entrou
NO DEPLOY (não só no projeto do Vercel) é o bloco "Busca na internet" do
card ConvertIA · Saúde: mostra o provedor vigente e o botão faz uma busca
real — checar variável de ambiente passaria com chave expirada. Chave em branco NÃO conta
como configurada (variável criada e deixada vazia é o erro de deploy mais
comum, e escolheria um provedor que responde 401 em toda busca). Sem nenhuma
chave a tool DIZ que a busca não está configurada e qual variável criar —
lista vazia silenciosa seria lida como "a internet não tem nada sobre isso".
`web_abrir` **não precisa de chave nenhuma** e funciona sozinho.

Falha é sempre dita, nunca escondida: 403/401 devolve "o site recusou o
acesso… diga isso em vez de descrever a página de memória"; PDF/imagem
devolve o content-type real; página cortada no orçamento devolve
`truncado: true` (senão o modelo conclui a partir de meia página achando que
leu tudo).

**Trendtrack**: ZERO código novo. A infra de MCP já cobre — `mcp-client.ts`
(streamable HTTP + JSON-RPC) e `mcp-oauth.ts` (OAuth 2.1 com discovery,
registro dinâmico RFC 7591 e PKCE, escrito para o MCP oficial da Omnisend) é
exatamente o que `https://api.trendtrack.io/v1/mcp` exige. Só entrou um
preset no diálogo de MCP (Gerenciar → Servidores MCP → "Conectar
Trendtrack") que pré-preenche nome e URL; o botão **Autorizar via OAuth**
leva ao login e volta conectado — não existe token para colar. Requer plano
do Trendtrack que libere o MCP.

## ConvertIA — saúde: o fim da degradação silenciosa (set/2026, migration 20261122)

Medição de 07/09, com 20 respostas no histórico: **4 morreram em HTTP 402 do
OpenRouter** (sem crédito) e as **124 notas da base ficaram sem embedding pela
MESMA causa** — `embedTexts` engole a falha em `log.warn` e o sync segue
reportando sucesso. Um saldo, três subsistemas parados (chat, embeddings da
base e das transcrições, agentes de email), zero sinal em tela: o diagnóstico
inteiro passou por SQL. É o padrão de falha desta parte do sistema.

**Saldo do provedor** (`provider-balance.ts`, 7 testes): lê
`GET /api/v1/credits`, classifica contra `OPENROUTER_SALDO_MINIMO_USD`
(default 5) e grava snapshot em `ai_provider_balance`. Cron
`/api/cron/convertia-saldo` (13 * * * *). Duas regras puras que existem para
o alerta continuar confiável: **`null` é `desconhecido`, nunca `esgotado`**
(timeout na consulta não é notícia sobre o saldo, e alerta falso é como se
aprende a ignorar o verdadeiro) e **`deveAlertar` só dispara na TRANSIÇÃO**
para pior — de hora em hora seriam 24 notificações/dia até alguém recarregar.
`baixo→esgotado` avisa de novo; `esgotado→baixo` não. O snapshot é gravado
MESMO quando a consulta falha: histórico com buraco não responde "desde
quando". Piso folgado porque o OpenRouter RESERVA o custo máximo da chamada
(prompt + max_tokens no preço do modelo) — o modelo caro estoura primeiro.

**A base diz quando não sabe** (`lacunas.ts`, 7 testes): busca vazia deixou de
devolver "Nenhuma nota encontrada" e passa a devolver instrução de
COMPORTAMENTO (`textoSemResultado`) — "isto NÃO autoriza responder de memória;
tente outras palavras (o corpus mistura PT e EN) e, não havendo nota, DIGA que
a base não cobre". Vale para `conhecimento_buscar` e `transcricoes_buscar`. Sem
isso o modelo lê "0 resultados" como permissão para preencher o vazio — e com
um advisor ligado a resposta sem lastro sai com a autoridade dele. Quando a
busca semântica está fora (sem embedding), a resposta diz isso: resultado
pobre por falta de vetor parecia "a base não tem".

**Lacuna vira pauta** (`convertia_lacunas` + RPC `convertia_registrar_lacuna`):
cada busca vazia é gravada com dedupe por consulta NORMALIZADA (minúsculas,
sem acento, sem pontuação) e frequência — é a frequência que ordena o que
escrever primeiro no vault. Guarda as 5 formulações mais recentes: a mesma
lacuna perguntada de cinco jeitos ensina o vocabulário de quem pergunta.
ON CONFLICT no banco porque roda dentro do turno, em paralelo com outras
tools — "SELECT senão INSERT" duplicaria em corrida e o UNIQUE viraria erro
dentro de uma tool que deve ser fail-open. Lacuna "resolvida" que volta a ser
perguntada REABRE. **Não reusa `ai_knowledge_gaps`**: aquela exige `agent_id`
NOT NULL de outro subsistema.

**Painel de saúde** (`GET/POST /api/ai/convertia/health` +
`convertia-health-card.tsx`, primeiro card de `/admin/ai-usage`): saldo com a
hora da checagem, turnos com erro em 7d **agrupados por CAUSA** (vinte linhas
de "HTTP 402: {...}" não dizem nada; "3 turnos sem crédito" diz o que fazer —
usa o `friendlyModelError` já existente), estado do sync do vault (repo,
commit, notas puladas com o motivo), advisors detectados, notas sem vetor e as
lacunas abertas. Botões **Checar saldo** e **Re-sincronizar vault** (sempre
`force: true` — quem clica ali costuma ter mudado CÓDIGO, e o sync
curto-circuita pelo SHA do vault). É a tela que faltava: sem ela toda
verificação desta base passa por console ou SQL.

**Pergunta sem resposta nenhuma** (`turnoPerdido` em `convertia-chat.tsx`): a
conversa de 03/09 tinha duas mensagens do usuário e ZERO do assistente — o
turno morreu antes de a linha nascer, então não existe nem `meta.error` para
mostrar. A bolha agora diz "não chegou a ser respondida", em vez de a conversa
reabrir parecendo que a pergunta foi ignorada.

**O que NÃO foi mexido, e por quê**: o acerto de cache de prompt e o custo por
turno já eram exibidos no card *ConvertIA · Desempenho*; a importação dos 👍
como casos de avaliação já tem botão; a aprovação de memória já tem diálogo.
Zero memórias, zero casos e zero jobs no banco são falta de USO (20 respostas
no total), não gatilho quebrado. O **modo econômico segue desligado por
padrão**: ligá-lo mudaria a qualidade de toda resposta, então é escolha por
conversa, não default silencioso — o painel explica isso na tela.

## Módulo Transcrições — vídeo virado texto pesquisável (set/2026, migration 20261121)

Item "Transcrições" no grupo **Conhecimento** do workspace Geral, liberado
para TODAS as funções (quem assiste a aula não é só quem edita a aula).
Rotas em `ROUTES.ADMIN.TRANSCRICOES`; documentação em `docs/transcricoes/`.

**Onde cada coisa roda.** O admin (Vercel) NUNCA processa mídia: enfileira,
lê o banco e mostra. O worker (`worker/transcricoes/`, container com yt-dlp
e ffmpeg) faz download, áudio, transcrição e indexação. Binário com sistema
de arquivos não cabe em serverless, e o teto de tempo não cobre o download
de um vídeo de uma hora. O estado vive na LINHA (`etapa`, `progresso`,
`media_path`, `audio_path`), então fechar a aba — ou reiniciar o container
— não interrompe: a próxima execução retoma da etapa em que parou, e o
áudio já extraído fica no Storage para não rebaixar de novo. Claim atômico
(`transcricoes_claim`, FOR UPDATE SKIP LOCKED) renovado durante a etapa
longa: sem a renovação, um download de 40 min expiraria o claim e outra
instância recomeçaria por cima, cobrando a transcrição duas vezes.

**Duas honestidades que o código trava (e um teste guarda):**

1. **Sem campo de confiança.** O endpoint não devolve confiança por bloco;
   o que existe em `verbose_json` é `avg_logprob` (log-probabilidade de
   token), que não é porcentagem de acerto. "96% de confiança" derivado
   dali seria métrica inventada — pior que nenhuma, porque leva a decidir
   com base nela. O campo não existe no schema nem na tela.
2. **A etapa de transcrição não tem porcentagem.** `yt-dlp` reporta bytes e
   `ffmpeg` reporta tempo processado, então baixar e extrair áudio têm
   número real; transcrever é UMA chamada síncrona ao provedor. O worker
   grava `progresso: null` e a barra mostra o segmento pulsando, sem
   número. Inventar um é o que faz o usuário achar que travou em 70%.

**Transcrição** (`transcrever.ts`): OpenRouter `/audio/transcriptions`,
multipart (base64 infla 33% e o limite é 25 MB), `verbose_json`, diarização
ligada, estilo **verbatim** (a bruta é a fonte da verdade; a limpeza
acontece no chunking, onde dá para auditar) e a **`phrase_list` da
coleção** — o parâmetro de maior impacto na qualidade: sem ele "Omnisend"
vira "omni send" e a busca nunca encontra. Modelo padrão
`microsoft/mai-transcribe-2`, configurável POR COLEÇÃO; o painel lê
`transcricoes.modelo` (o que foi REALMENTE usado), nunca constante. Áudio
acima de 24 MB é dividido em pedaços de 10 min e cada um leva o offset —
errar isso invalida todos os timestamps do segundo em diante e só aparece
em vídeo longo. A leitura do locutor é defensiva (`speaker`/`speaker_id`/
`speaker_label`): nome de campo diferente não pode custar a diarização
inteira.

**O offset dos pedaços vem do ffmpeg**, não de `i * 600`: o `-segment_time`
corta na fronteira do quadro, o pedaço passa um pouco do alvo e o erro
ACUMULA — os timestamps do fim de uma aula longa sairiam adiantados e o
clique abriria o player no lugar errado. O `-segment_list` traz o início
real de cada pedaço.

**Bloqueio de IP é rotina, não exceção.** As três plataformas recusam IP de
datacenter. `classificarErro` reconhece as frases reais do yt-dlp,
`mensagemDeErro` devolve texto legível ("O YouTube bloqueou o acesso a
partir do servidor"), o retry tem backoff exponencial com jitter (sem
jitter, cinco falhas do mesmo minuto voltam juntas e tomam bloqueio de
novo) e `HTTP_PROXY` é o slot previsto. Nunca vira "falha genérica".

**Dedupe pela URL normalizada** (`url.ts`, índice único por org):
`youtu.be`, `/shorts`, `/embed` e `/live` colapsam no mesmo vídeo;
rastreadores (`utm_*`, `si`, `igsh`, `is_from_webapp`) saem. Variar duplica
a biblioteca; colapsar vídeos diferentes recusa o segundo e ele nunca é
transcrito — os dois erros são silenciosos, daí os testes.

**Busca devolve o OFFSET, não só o id.** Por isso a full-text roda em
`transcricoes_blocos` e não em `texto_completo`: o bloco já carrega o `s`.
Híbrida — exata (`websearch_to_tsquery` em português + `ts_headline`) mais
semântica (pgvector nos chunks), mesclando com a exata primeiro. Semântica
indisponível (sem chave) é DITA na resposta, não escondida.

**Chunking por tópico** (`chunking.ts`): os tópicos detectados são os
pontos de corte primários; tópico longo subdivide na fronteira de BLOCO,
nunca no meio de uma fala. Cada chunk ganha uma linha de contexto por LLM e
o embedding é feito sobre `contexto + texto` — "e aí você aumenta pra 3
dias" é inútil sem saber que o assunto era carrinho abandonado. Contexto
que volta desalinhado do lote é descartado inteiro: na posição errada ele
desloca o vetor.

**Editar uma fala marca os chunks que a cobrem** (`marcarDesatualizados`) e
a tela diz quantos. Sem isso a base de conhecimento diverge do texto que o
usuário está vendo, e a divergência é silenciosa. O cron
`/api/cron/transcricoes-indexar` (a cada 5 min) varre pendências — e cobre
também a faísca recém-ligada, sem depender do container.

**Renomear locutor toca UMA linha**: os blocos guardam o rótulo do provedor
(`speaker_0`) e o nome humano vive em `transcricoes_locutores`. Renomear
não reescreve N mil falas, e o rótulo original preservado permite a um
reprocessamento remapear os nomes que o humano deu.

**Faísca por coleção** (`na_base_de_conhecimento`): só o que está marcado
entra na recuperação da ConvertIA, **e a marca é HERDADA pelas subpastas**
(marcar o pai inclui as filhas — é como o filtro da biblioteca já trata a
árvore; sem isso, marcar "Convertfy Academy" não incluiria nada quando as
aulas moram nas filhas). Ligar enfileira os embeddings que
faltam (assíncrono, a árvore mostra o estado); **desligar exclui da
recuperação mas NÃO apaga os embeddings** — religar tem de ser instantâneo.
O conector `transcricoes_buscar/listar/ler` devolve sempre o timestamp e o
link `?t=MM:SS`, que é o que separa citação verificável de afirmação sem
lastro. Entra sozinho no chat quando há coleção marcada COM peça pronta.

**Upload de 4 GB vai direto ao Storage por TUS**, sem passar pela API, e
retoma de onde parou; a barra é o progresso do próprio envio. A linha nasce
`processando` e só vira `aguardando` quando o envio fecha — senão o worker
pegaria arquivo pela metade. Por isso `transcricoes_claim` aceita apenas
`aguardando` ou `processando` com claim EXPIRADO: aceitar qualquer
`processando` sem token fazia o worker reivindicar justamente o upload em
andamento. O que a aba fechada deixa pendurado o cron varre
(`transcricoes_expirar_uploads`), e o modal apaga a linha quando o envio
falha na cara do usuário.

**O VÍDEO é descartado quando a transcrição fica pronta** (set/2026); o
ÁUDIO fica por uma janela (`TRANSCRICOES_AUDIO_RETENCAO_DIAS`, default 3),
porque é ele — não o vídeo — que o pipeline usa para retranscrever, e é
~10x menor: transcrição que sai ruim tem prazo para ser refeita sem
reenviar o arquivo. Quem apaga o áudio é o cron do admin
(`varrerAudioExpirado`), medindo por `concluido_em`, e a ficha MOSTRA o
prazo ("Áudio guardado até 09 set") — sem isso o usuário só descobriria a
janela falhando. Guardar 500 MB por aula é barato; SERVIR esses 500 MB a
cada play não é, e o egress é a conta que estoura. Quem toca o vídeo passa a ser a plataforma de origem —
`embed.ts` (puro, 11 testes) monta o iframe do YouTube/Instagram/TikTok e a
diretiva `frame-src` do CSP declara os três (sem ela o browser cai no
`default-src` e o player sumiria quando o CSP virar enforcement). O
descarte roda **só depois de indexar**: falhar no meio não pode apagar a
fonte antes de existir texto. **Só o YouTube pula para o tempo** (`seekTo`
por `postMessage`, daí o `enablejsapi=1`); Instagram e TikTok embutem e
ponto — o clique rola o texto e a tela DIZ isso, em vez de fingir o pulo.
Consequência declarada: passada a janela, "reprocessar do zero" só funciona
para LINK (o worker rebaixa da URL); arquivo enviado vira 409 dizendo
quantos dias o áudio ficou guardado, em vez de enfileirar o que falharia.

**Todo select de blocos é PAGINADO** (`lerBlocos`, `blocos-io.ts`): o
PostgREST corta em 1.000 linhas e `.limit(20000)` não muda isso. Sem
paginar, o vídeo de três horas aparecia pela metade na tela, exportava
truncado, tinha o `texto_completo` reescrito sem o fim a cada edição e
entrava na busca faltando dois terços — em silêncio. Pela mesma razão a
soma de duração da biblioteca e a indexação pendente por coleção são
AGREGADAS no banco (`transcricoes_resumo`,
`transcricoes_pendentes_por_colecao`).

**"Não organizadas" é um lugar na tela e dois estados no banco**: a coleção
reservada (destino de quem entra sem sugestão) e `colecao_id NULL` (o que
sobra de uma pasta excluída — a FK é SET NULL). Contagem e filtro cobrem os
dois; cobrir só o NULL deixava a peça recém-criada fora da árvore.

**Prévia de link degrada em escada**: worker (`yt-dlp --dump-json`, com
duração) → oEmbed da plataforma (título, canal e capa REAIS, sem duração) →
só plataforma e URL. Em nenhum degrau um campo é inventado; o que falta
fica null e a tela mostra o traço.

**Nada semeado sozinho além do necessário**: só a coleção reservada "Não
organizadas" nasce automática (todo item precisa de destino). A estrutura
sugerida e as regras de sugestão de coleção
(`transcricoes_regras`, configuráveis sem deploy) são OFERECIDAS por botão
no estado vazio da árvore.

## Moeda e fuso da loja vêm da plataforma (set/2026, migration 20261123)

Sintoma: a moeda de várias lojas estava errada e a tela de Setup não
deixava consertar. Quatro causas empilhadas, todas silenciosas.

**1. O comentário era falso.** `omnisend-sync.service.ts` dizia "Omnisend
nao expoe currency via API" e por isso a moeda dependia de alguém digitar.
`GET /v5/brands/current` devolve `{currency, timezone, website}` desde
sempre — confirmado em 08/09 contra a conta da Luxe Lift (`GBP`,
`America/Sao_Paulo`). Enquanto acreditamos no comentário, dezenas de lojas
ficaram no default `BRL` e valor em euro entrou no dashboard sem conversão.

**2. A lista de moedas era pequena demais para o erro ser corrigível.**
Tinha 11 códigos, sem PLN nem DKK: Lena Warszawa (lenawarszawa.pl) estava
em EUR e Bryn Grill (-dk) também porque **não havia o que escolher**. Agora
são 36 (`STORE_CURRENCIES`), e a lista segue FECHADA — o câmbio
(`exchange-rate.service`) precisa de ISO 4217 que ele saiba converter, então
código fora dela vira AVISO, nunca gravação (`isStoreCurrency`).

**3. O offset do relatório era adivinhado pela MOEDA.** `offsetForCurrency`
mapeava `EUR → "+01:00"` — Berlim e Lisboa no mesmo fuso, e offset FIXO,
sem horário de verão. Trocado por `offsetForTimezone(iana, data)`, que usa
o ICU do runtime (`timeZoneName: "longOffset"`) e resolve o DST PELA DATA.
`omnisendDateRange` resolve o offset **por ponta**: janela que atravessa a
virada (out/2026 na Europa) sai `from +02:00` / `to +01:00` — usar um só
faria o mês ganhar ou perder uma hora exatamente na fronteira comparada
com o painel.

**4. O fuso do sync vinha do `country`, que está errado na base.** 53 das
63 lojas estão como 'BR' (o default nunca sobrescrito), incluindo as `.pl`,
`.de` e `-dk`: toda loja europeia era fatiada à meia-noite de São Paulo.
`resolveStoreTimezone` agora prefere `client_stores.timezone` e só cai no
mapa por país quando ele falta.

**Onde mora cada coisa**: a DECISÃO é pura
(`lib/stores/platform-profile.ts`, 9 testes) — código fora da lista não
grava, fuso que o runtime não reconhece não grava, plataforma calada não
APAGA o que existe, e `*_source = 'manual'` vence a plataforma (a
divergência é reportada, não sobrescrita; `forcar` é o pedido explícito da
tela). O I/O é `store-platform-profile.service.ts`, em SÉRIE por causa do
rate limit por chave. Entradas: `POST /api/stores/platform-profile-sync`
(botão "Conferir com a plataforma", por loja ou todas), cron semanal
`/api/cron/store-platform-profile` (50 5 * * 1) e o auto-conserto dentro do
sync quando a moeda está VAZIA.

**A auditoria era circular** e por isso não denunciava nada: comparava
`client_stores.currency` com `store_revenue_summary.currency`, que o sync
COPIA do primeiro para loja Omnisend — Lena aparecia "OK" em EUR. O eixo
agora é a PROCEDÊNCIA: moeda que ninguém conferiu sai como
`nunca-conferido`, não como OK; `reportedCurrency` só é exibido para
Klaviyo, que é quem de fato reporta moeda própria. A tela
(`/admin/tools/currency-audit`) mostra fuso, procedência e data, e
"Sem fuso" é um contador próprio.

**Edição humana carimba `manual`**: o PATCH da loja grava
`currency_source='manual'` / `timezone_source='manual'`, e é isso que faz
a sincronia parar de sobrescrever. O campo de fuso aceita **qualquer IANA
válido** (lista aberta, `STORE_TIMEZONES` é só o atalho da tela) porque
quem preenche na prática é a plataforma — recusar o que já está gravado
faria o select discordar do banco.

## Câmbio: o real mostra de onde veio (set/2026, migration 20261124)

O dashboard consolida tudo em BRL e o número aparecia sozinho. Um total
em real de loja europeia é uma CONTA, e conta sem as parcelas não é
verificável — foi assim que a Lena Warszawa passou meses em EUR sendo
PLN: o valor final continuava parecendo plausível.

**Como a conversão funciona** — `exchange-rate.service.ts`:
`GET open.er-api.com/v6/latest/BRL` devolve `rates` no formato "1 BRL =
X moeda"; converter é `valor / rates[moeda]`. Cache em três camadas
(memória 1 h → `exchange_rate_cache` 1 h → API) com singleflight,
stale-on-error e cooldown. A conversão roda na LEITURA, em cada rota de
dashboard — nada é gravado convertido.

**O que era impreciso, e o que mudou:**

1. **Taxa de hoje aplicada a 90 dias de receita.** Além do erro de valor,
   o MESMO período dava um total diferente a cada dia — relatório que
   muda sozinho não fecha com nada. `exchange_rate_daily` (uma linha por
   dia, ~1 KB) + `convertToBRLOn(valor, moeda, dia)` resolvem: o dia
   12/08 vale sempre o que valia em 12/08. **Limite declarado**: o feed
   gratuito não serve histórico, então o histórico começa no dia em que
   isto subiu; para trás a cotação é a mais próxima anterior e vem com
   `rateApproximate: true`, que a tela DIZ.
2. **A taxa não aparecia em lugar nenhum.** `convertToBRLDetailed` passa
   a devolver `rate` (invertido — REAIS por 1 unidade, que é como a conta
   é conferida), `rateDate` e `rateApproximate`.
3. **Duas fontes de cotação divergindo.** `/api/stores/currency-audit`
   tinha um `fetch` próprio da API: uma chamada externa a mais e um
   número que podia discordar do dashboard para a mesma loja. Agora usa
   o mesmo serviço.
4. **Valor não convertido somado como se fosse real.** Câmbio
   indisponível devolve o valor NA MOEDA ORIGINAL, e ele entrava no total
   sem marca. `fxDegraded` sobe nas rotas e o total avisa que mistura
   moedas.

**Na tela** (`components/money/valor-brl.tsx`): o real fica no texto (é o
que se compara de relance) e a memória de cálculo no hover —
`ValorBRL` para uma parcela ("€ 12.400,00 × 5,9589 = R$ 73.890,36 ·
cotação de 08/09/2026") e `ValorBRLTotal` para total de várias moedas,
onde não existe "o valor original" e sim a COMPOSIÇÃO. Regras em
`lib/money/conversao.ts` (puro, 17 testes): valor já em real não gera
tooltip (repetir o que está na tela é ruído); código que o `Intl` não
conhece não derruba a página; o espaço é NBSP nos dois ramos (com espaço
comum, "R$ 10" quebraria de linha entre símbolo e valor); e
`formatarDiaISO` não passa por `Date` (`new Date("2026-09-08")` é
meia-noite UTC e voltaria 07/09 no Brasil).

**Onde aparece**: dashboard operacional (tabela de lojas, Clientes por
Receita, card Faturamento total), auditoria de moeda e o hero da loja.

**Cotação mid-market**: é a taxa de referência, não a que o cliente
recebe depois do spread do meio de pagamento. Fica declarado aqui —
"aproximar da realidade" nesse eixo exigiria a taxa efetiva de cada
gateway, que não temos.

**O cron existe porque a gravação oportunista não basta**
(`/api/cron/exchange-rate-snapshot`, 5 11 * * *): o serviço grava a linha
do dia quando busca a cotação, mas isso depende de alguém abrir uma tela.
Um feriado sem acesso deixaria o dia sem linha, e o buraco só apareceria
meses depois como "cotação aproximada" sem ninguém saber por quê. A
gravação oportunista é **await, nunca `void`** — promise solta em
serverless morre quando o processo congela depois da resposta (a mesma
armadilha que perdeu os eventos de conversão da Meta).

## Loja multi-país e presets de mercado (set/2026)

`client_stores.countries` (TEXT[]) e o espelho `country = countries[0]`
**já existiam** — e o PATCH já os mantinha em sincronia. O que faltava era
a TELA: o diálogo de edição oferecia um Select único, então quem vende
para cinco países escolhia um e perdia os outros. (Havia um popover
multi-país no hero da loja, mas escondido atrás de um badge e sem
presets.)

**A ordem carrega significado.** `countries[0]` é o que vira `country`, e
é `country` que alimenta o mapa país→fuso do sync. Por isso o principal
aparece marcado com estrela e tem ação própria ("tornar principal") —
sem ela, trocar o principal exigiria desmarcar tudo e remarcar na ordem
certa, regra que ninguém adivinharia. Um `Set` resolveria a duplicidade e
destruiria essa informação; daí lista ordenada em `lib/stores/mercados.ts`
(puro, 18 testes).

**Presets** (`PRESETS_DE_MERCADO`): Big Five, América do Norte, LATAM,
União Europeia, Zona do euro, DACH, Benelux, Nórdicos, Ibéria, Reino
Unido e Irlanda, Oceania, Golfo. Regras que os testes fixam:

- **O rótulo declara os membros** ("Big Five — EUA, Reino Unido, Canadá,
  Austrália e Nova Zelândia"): é jargão de dropshipping, não é o G5 nem
  os cinco maiores países, e preset que o operador não sabe o que contém
  ele aplica errado.
- **Aplicar preset NÃO troca o principal** — os que faltam entram no FIM.
  Aplicar Big Five numa loja brasileira não pode torná-la americana.
- **Preset ativo = todos os membros marcados, mesmo com extras.** Big
  Five + Brasil segue aceso; exigir exclusividade apagaria o chip assim
  que alguém somasse um país e a tela pareceria ter esquecido a ação.
- **Nada esvazia a seleção**: desmarcar o último país (ou remover o único
  preset) é ignorado — loja sem país é pior que loja com país sobrando, e
  um clique que zera tudo em silêncio é armadilha.

Só `countries` viaja no PATCH; mandar os dois abriria espaço para
divergirem. A ficha (`tab-setup`) mostra "Países" com o principal e o
resto resumido; o popover do hero ganhou os mesmos presets e a lista
agrupada por região.

## Reunião com cliente passa a avisar o cliente (set/2026, migration 20261125)

A integração com o Google Calendar já era substancial — OAuth por
colaborador **e** conta central da org (`user_google_tokens`, tokens
AES-256-GCM), `resolveSyncAccount` mandando toda reunião para a agenda
central (cada participante vira attendee e a vê na própria agenda),
Google Meet automático, `sendUpdates: "all"`, watch + webhook push, cron
horário com RSVP e retry, e o trigger que ao concluir reunião com loja
atualiza `last_feedback_date` e grava em `store_feedback_calls`.

**O buraco era o cliente.** `buildGoogleEvent` montava os attendees com os
MEMBROS participantes + `meetings.guest_emails` — uma lista de texto
digitada à mão. `crm_contacts` (que tem `email`, `is_primary` e
`store_id`) nunca era lida. Marcar "reunião com o cliente X" **não
mandava nada para o cliente X** a menos que alguém lembrasse de digitar o
endereço; e nenhum email nosso existia — o Resend tinha templates de
portal e senha, nenhum de reunião.

`meeting_participants` ganhou o tipo **`contact`** (participant_id =
`crm_contacts.id`). O contato vira participante de verdade: entra como
attendee (recebe o convite nativo), tem o RSVP sincronizado de volta por
`syncRsvpFromGoogle`, e a reunião sabe QUEM foi convidado por id, não por
string. `guest_emails` continua para o convidado avulso que não é
contato cadastrado.

**Os dois canais disparam, de propósito**: o convite do Google traz o
botão de aceitar e o evento na agenda; o email da Convertfy
(`meeting-invite-email.service`, Resend) traz a marca, a loja e o horário
no fuso da reunião, e chega quando o convite cai no spam. Mesma razão de
pixel + CAPI nos eventos de conversão. O email vai **só para o lado do
cliente** — membro já tem o evento na agenda, e um segundo email por
reunião ensina o time a ignorar a caixa. Envio em SÉRIE (limite por
segundo do Resend) e **depois** do sync, porque é ali que o link do Meet
nasce. `await`, nunca `void`: promise solta morre quando o serverless
congela o processo depois do `return`.

**Regras nos módulos puros** (`lib/meetings/`, 36 testes):

- `chaveDeEmail` **não** remove ponto nem `+tag` — só o Gmail os ignora, e
  tratar `joao.silva@` e `joaosilva@` como o mesmo endereço em outro
  provedor faria a gente DEIXAR DE convidar alguém. Deduplicar de menos
  custa um email repetido; deduplicar demais custa um convidado ausente.
- `contatoSugerido`: primário **da loja** vence primário do cliente
  (feedback de uma loja é com quem cuida dela, não com o dono do grupo);
  contato sem email nunca é sugerido — marcado, daria a impressão de que
  o convite vai sair.
- `montarConvidados`: membro > contato > externo no mesmo email, para o
  consultor que é membro E está em `crm_contacts` entrar UMA vez, com o
  nome que temos. O endereço vai ao Google como foi digitado; a caixa
  baixa serve só para comparar.
- `formato.ts`: data/hora no fuso IANA da reunião (`Intl` resolve o DST
  pela data — offset fixo não resolve), com a sigla do fuso, porque a
  carteira tem loja na Polônia e na Dinamarca e "15:00" sozinho é ambíguo.

**Degradação sem a migration**: enum sem `contact` devolve 22P02 e
`vincularContatos` cai para `guest_emails` — o cliente é convidado do
mesmo jeito, perdendo o vínculo com o id e o RSVP. O PUT filtra
`participant_type` em JS de propósito: `.eq("participant_type","contact")`
também estoura 22P02 e a edição inteira falharia por migration pendente.

**Na tela**: seção "Convidados do cliente" no diálogo, primário
pré-marcado, contato sem email desabilitado com o motivo, e o rodapé que
diz "Ninguém do cliente será avisado desta reunião" quando nada está
marcado — convidar cliente em silêncio é o erro caro aqui, e não avisar
também. Trocar de cliente descarta a seleção anterior (o 422 da rota não
explicaria que a causa foi a troca). O toast diz quantos emails saíram e
fica destrutivo quando algum falhou. Remarcar reenvia; cancelar não
(mandar "reunião confirmada" de uma reunião cancelada é pior que nada).

**O que ficou de fora, e é a fase seguinte**: `meetings.deal_id` (a
agenda comercial mostra `crm_deal_activities.due_at`, o hub mostra
`meetings` — dois calendários que não se falam), `store_feedback_calls.
meeting_id` (a idempotência do trigger compara texto de notas +
timestamp), botão "Agendar" na loja / carteira / negócio, as pipelines de
CS lendo `meetings` em vez de presumir pela data
(`/api/cs-crm/calls-pipeline` comenta literalmente "presumido enviado
convite") e o painel de agenda por colaborador.

## Fase 2 das reuniões: previsão deixa de se passar por agendamento (set/2026, migration 20261126)

Medido no banco antes de escrever qualquer código: das **18 reuniões
existentes, ZERO têm loja ou cliente vinculado** (14 vieram do import do
Google, 4 do admin) e **zero estão agendadas para o futuro** — a última é
de julho. Ou seja, o gargalo não era a leitura, era a ENTRADA: ligar as
pipelines de CS a `meetings` mostraria zero em tudo. A ordem da fase 2
inverteu por causa desse número.

**O que a tela dizia e não era**: carteira, "próximas calls" do CS e a aba
Calls da loja liam `client_stores.next_feedback_date` / `next_call_date` —
uma data que o trigger CALCULA a partir da última call — e a mostravam com
a mesma cara de um compromisso marcado. A etapa 2 de
`/api/cs-crm/calls-pipeline` chega a se chamar "Aguardando (presumido
enviado convite)". Ninguém sabia, olhando, se o cliente tinha sido
convidado.

`proxima-call.ts` (puro, 14 testes) separa as duas coisas com a palavra:
**"Agendada"** (reunião existe, convite saiu) × **"Prevista pela cadência"**
(é uma conta) × "Sem call marcada". Regras que não podem regredir:

- **Previsão nunca some da tela.** Sem reunião, a previsão continua
  aparecendo — marcada como previsão. Trocar uma pela outra às cegas
  esvaziaria a carteira no dia do deploy, porque hoje nenhuma reunião tem
  loja.
- **Previsão VENCIDA não é "próxima call"** — é atraso, e chamá-la de
  próxima esconderia justamente a loja que precisa de atenção.
- Entre duas reuniões futuras vence a mais próxima; cancelada e concluída
  não contam; `precisaAgendar` é true também na previsão, porque previsão
  não avisa ninguém.
- `tem_convidado_do_cliente === undefined` (a origem não informou) NÃO vira
  "sem convidado": afirmar isso seria inventar.

**A entrada**: botão "Agendar call" na aba Calls da loja → deep-link
`/admin/meetings?agendar=1&client_id=&store_id=&titulo=`, que abre o mesmo
diálogo da fase 1 já preenchido (e portanto já sugerindo o contato do
cliente). A loja NÃO tem select no formulário de propósito: quem agenda a
partir da ficha de uma loja já a conhece, e pedir de novo abre espaço para
escolher a errada. Na edição, `store_id` preserva o que estava — mandar
null apagaria o vínculo com a carteira em silêncio. O contexto vive em
estado, não no searchParams, porque a URL é limpa logo após abrir.

**Migration 20261126**: `meetings.deal_id` (SET NULL — apagar o negócio não
pode apagar a reunião que aconteceu) e `store_feedback_calls.meeting_id`
com índice ÚNICO PARCIAL. Esse índice substitui a idempotência por TEXTO do
trigger `sync_meeting_to_store_feedback`, que comparava
`notes IS NOT DISTINCT FROM ...` + `conducted_at`: editar a nota e
reconcluir duplicava o registro, e duas calls no mesmo segundo com a mesma
nota faziam a segunda sumir. O trigger virou FAIL-OPEN (regra da casa desde
o 20261066): concluir uma reunião não pode dar 500 porque o histórico de CS
falhou. O backfill só casa onde o par (loja, instante) identifica UMA
reunião — vínculo errado é pior que nenhum, porque faria a próxima
conclusão pular a gravação.

A leitura de reuniões na rota de calls é **enriquecimento**: envolvida em
try/catch e com `MISSING_SCHEMA`, porque a aba existia antes dela e não
pode quebrar por migration atrasada.

## RLS: o round4 nunca rodou, e agora se sabe por quê (set/2026)

Ele cita `wise_reconciliations`, **tabela que não existe neste banco**. O
SQL Editor roda tudo em UMA transação, então o 42P01 abortava o script
inteiro e NADA era aplicado — por isso as policies continuaram `USING(true)`
por meses. `APPLY_MANUALLY_fix_rls_round5a_fechar_anon.sql` não depende de
nenhuma tabela existir: onde ela falta, pula.

Medido em produção em 08/09: **17 tabelas com `FOR ALL TO PUBLIC
USING(true) WITH CHECK(true)`** (TO PUBLIC inclui `anon`, e a anon key está
no JS do browser: leitura E escrita abertas em `client_charges`,
`client_subscriptions`, `crm_leads` com 301 linhas, `crm_contacts`,
`crm_ad_accounts`) e **8 tabelas SEM RLS nenhuma**, que é pior — entre elas
`auth_events` e `client_monthly_reports`.

**A forma da policy é `TO authenticated USING (is_org_member())`, não
`USING (true)`**: há 16 usuários em `auth.users` e **5 não são membros da
org** (3 do portal do cliente), então fechar só em `authenticated` deixaria
o CLIENTE ler o CRM inteiro. Não escopa por org de propósito — há uma org,
ninguém em duas, e 16 leads com `org_id` NULL sumiriam da tela.

**Só cria policy onde a remoção deixaria a tabela descoberta.**
`client_charges` e `client_subscriptions` já têm `ALL` para authenticated —
ali a TO PUBLIC é lixo legado e basta removê-la, preservando "Portal users
can view own client_charges" (o cliente vê as próprias faturas). Tratar em
bloco afrouxaria controle fino que já existe (`clients` tem "Access clients
by permission").

**As 61 `TO authenticated USING(true)` ficaram para o 5B** porque a
simulação mostrou que, tratadas em bloco, `deals`/`pipelines`/`automations`
ficariam só com SELECT e `client_briefings`/`store_feedback_calls` só com
INSERT — quebrando kanban e telas.

## Fase 3: o convite chega ao cliente, e o SQL foi aplicado (set/2026)

Executado com acesso ao banco de produção. O que a medição revelou muda o
que estava escrito acima.

**1. O trigger da ponte reunião→carteira NUNCA existiu neste banco**
(migration 20261129). A
migration 20260415 criava `trg_sync_meeting_to_store_feedback`; só a FUNÇÃO
estava lá. Concluir uma reunião com loja nunca alimentou
`last_feedback_date` nem `store_feedback_calls` — a ponte estava morta desde
sempre, sem erro em lugar nenhum, e a 20261126 (que recria só a função) não
teria consertado. Criado e testado de verdade: reunião → conclusão → 1 call
gravada, concluir de novo NÃO duplica (o índice único parcial funciona), a
loja recebe a data; tudo dentro de transação com ROLLBACK.

**2. `crm_contacts` está VAZIA (0 linhas), e isso quebrava a fase 1.** A
seção "Convidados do cliente" diria "nenhum contato cadastrado" em **100%
dos casos**, com o endereço a uma coluna de distância: `clients.email` cobre
**54 dos 55 clientes** e **todas as 63 lojas ativas** têm cliente com email.
Agora o email do CADASTRO é oferecido como convidável (pré-marcado quando
não há contatos) e viaja como convidado externo — não tem id de
`crm_contacts`, então fingir que é um contato seria mentira de proveniência.
Medido depois: **63 de 63 lojas ativas passam a ter alguém para convidar**;
antes, 0.

**3. As pipelines de CS pararam de presumir.** `calls-pipeline` e
`cs-painel/proximas-calls` resolvem a próxima call por `resolverProximaCall`
e cada item carrega `origem` ('agendada' × 'prevista') + `meeting_id`;
`counts.presumidas` conta as que a tela mostrava como marcadas sem reunião
por trás. Duas correções de borda que a leitura expôs: loja com previsão
além de 30 dias **sumia das seis etapas em silêncio** (agora cai em "a
marcar", que é onde alguém age), e `proximas-calls` exigia
`next_feedback_date NOT NULL`, então loja com reunião de verdade e sem
previsão **ficava fora do painel**.

**4. `ATIVOS` listava status que não existem.** O enum `meeting_status` tem
exatamente quatro valores — `scheduled`, `completed`, `cancelled`,
`no_show` — e o módulo aceitava `confirmed`/`rescheduled`. Não era bug
(`scheduled` é o único ativo e estava coberto), mas fazia o próximo leitor
supor um fluxo de confirmação que não existe. A lista é permissiva nas
BORDAS de propósito: status novo que este arquivo não conheça cai fora e a
loja aparece como "sem call marcada" — visível e corrigível; o inverso faria
um `no_show` valer como próxima call.

**O retrato da carteira, medido**: das 63 lojas ativas, **61 não têm call
marcada nem prevista**, 2 têm só previsão e **zero têm reunião agendada**.
É o número que a tela escondia atrás da palavra "agendada".

### RLS aplicado e verificado nos três papéis

O round 5A foi aplicado. Depois dele: `anon_aberto = 0`, `tabelas_sem_rls =
0`, nenhuma tabela do CRM sem cobertura. Provado assumindo cada papel:

- **anon** (a chave pública do browser): `crm_leads` devolvia **301 linhas**,
  agora devolve **0**; idem `crm_contacts`, `client_charges`,
  `crm_ad_accounts`, `auth_events`, `client_monthly_reports`.
- **membro da org**: continua vendo 100% do que existe (301 leads, 6
  cobranças, 3 produtos) — zero regressão.
- **usuário do portal**: 0 leads, 0 produtos. Fora do banco interno, que era
  o motivo de a policy ser `is_org_member()` e não `USING (true)`.
- Formulário público e `tracking_lookups` intactos (3 policies TO PUBLIC
  preservadas), e "Portal users can view own client_charges" de pé — o
  cliente segue vendo as PRÓPRIAS faturas.

**Ainda aberto**: o round 5B (as 61 policies `TO authenticated USING(true)`,
que exigem avaliação tabela a tabela) e o painel de agenda por colaborador.
---
---

## Execuções ao vivo no Estúdio, e o caminho até a execução parcial (set/2026, migration 20261127)

Pedido: a aba Execuções (`/admin/agents/studio?tab=execs`) em **tempo real
de fato**, e poder **entrar numa execução, desativar o que quiser e testar
até onde quiser** — como no n8n. Pesquisa do modelo do n8n, decisões
tomadas e o estado de cada camada em
`docs/email-generation/plano-execucoes-estilo-n8n.md`.

**O dado do "rodando" já existia; a tela é que era lenta.** O
`startGenerationRun` grava a linha com `status:'running'` ANTES de invocar
o modelo, e o SSE de runs (`/api/sse/admin/agents/runs`) já entrega em 2s —
mas a aba lia SWR a 10s. Baixar o intervalo do SWR era a saída errada: a
listagem filtra com `.or("generation_batch_id.not.is.null, status.in.(…)")`
e o único índice de `email_flow_emails (updated_at DESC)`
(`idx_efe_generated_recent`) é **parcial** em `generation_batch_id IS NOT
NULL` — um OR não é servido por ele, e repetir isso de 2 em 2s por aba é o
padrão que custou 372 min de CPU no incidente do inbox.

Então o SSE faz **duas perguntas**: `agent_studio_executions_delta` (só
ids, três pernas `UNION ALL`, uma por índice — e-mail com batch, e-mail em
voo pelo novo `idx_efe_em_voo_updated`, run mexida) e, só quando a resposta
é não-vazia, `fetchAgentExecutions({emailIds})`. **Conexão ociosa: duas
varreduras de índice a cada 2s e zero byte no cliente.** O delta ordena
**ASC** de propósito: o consumidor tem teto por volta, e cortar pelos mais
NOVOS deixaria mudança antiga atrás do cursor para sempre; o cursor avança
só até o que foi enviado, menos 1ms (o delta compara com `>`, e duas
mudanças no mesmo milissegundo em lados opostos do corte perderiam a
segunda — reenviar é inofensivo, o upsert do cliente é idempotente).

**A armadilha da reconciliação, com teste dedicado:** um evento de RUN
**não move o `updated_at` do e-mail**, só a lista de runs. Desempatar por
`updated_at` — como o `useAgentRunsLive` faz — descartaria em silêncio
justamente o evento que acende o nó. Daí `execRecency` =
`max(updated_at, maior created_at das runs)`; o upsert do SSE é
autoritativo (uma conexão, ordem garantida) e empate contra o snapshot REST
vai para o snapshot: com o SSE morto nenhum evento local chega, a recência
local nunca passa a do snapshot e o fallback assume sozinho. Execução que o
SSE trouxe e a janela do snapshot não cobre é preservada, senão pisca.

O tipo da execução mora em `types/agent-executions.ts` e quem monta é
`lib/services/agent-executions.service.ts`, para REST e SSE — dois
montadores divergiriam e apareceriam como "o nó mudou de status sozinho".
`EM_VOO` é a lista de status em voo e é **SYNC com o predicado literal** do
índice e da perna 2 do delta.

O checkbox "Auto refresh" saiu: ligava um poll de 10s, e a pergunta de quem
olha a lista é "isto está vivo?". O que ele protegia — a lista se mexer
embaixo de quem lê — virou **seleção explícita** no primeiro carregamento
(com `?? executions[0]`, geração nova entrando no topo trocava a execução
aberta). **Limite declarado:** não existe progresso DENTRO de um step — uma
chamada de LLM não reporta nada entre começo e fim, então o nó fica
"rodando" por 30–240s sem fração, e barra ali seria medida inventada.

**Uma feature inteira estava morta em produção** (descoberta 08/09): a
migration `20260816_agent_runs_live.sql` nunca foi aplicada, então
`email_generation_runs.updated_at` NÃO EXISTIA — o SSE de runs (AE-9) fazia
`.gt("updated_at", …)`, tomava 42703 a cada volta de 2s e caía calado no
SWR. A live view de agentes nunca recebeu um `run_upsert`. Aplicada junto
com o delta. **Lição operacional: migration deste repo é aplicada à mão e
SLIPPA** — feature nova que dependa de coluna nova tem de degradar com o
erro NOMEADO, não com silêncio (é a mesma lição do `copy_fit`, que passou
quatro dias sem gravar run porque o CHECK não tinha o valor).

## Estúdio — a triagem busca o fato, e a fonte é CONFERIDA (set/2026)

A triagem do motor editorial só aceitava o que estava no insumo: pauta sem
número saía com `[confirmar]` no slide. Agora ela pode buscar na internet
antes (`buscarNaWeb`, a mesma infra do conector da ConvertIA — provedor
plugável, hoje o Serper), e é aí que aparece o risco que este módulo
existe para fechar: **modelo que recebe resultados de busca escreve URL
plausível de cabeça**, e fonte inventada é pior que dado nenhum, porque
parece conferida.

`lib/conteudo/editorial/evidencias.ts` (puro, 8 testes), três regras:

1. **A consulta sai da PAUTA** — palavras com sentido, na ordem, até 12.
   Pauta longa vira consulta longa e o buscador devolve ruído.
2. **O bloco servido NUMERA as fontes** e proíbe, nas duas pontas, citar
   URL fora daquela lista. Ele vai DEPOIS do pedido: a última coisa que o
   modelo lê antes de responder é a lista fechada. Sem fonte utilizável o
   bloco é VAZIO — servir cabeçalho vazio convida a inventar.
3. **`verificarFontes` confere cada citação** contra as URLs realmente
   servidas (comparação tolerante a www, barra final e caixa — não é sobre
   digitação). O que não bate perde a fonte e o dado sobrevive marcado para
   confirmar; a tela DIZ quantos links foram removidos, porque descarte em
   silêncio é o mesmo que não ter verificado. Fonte que não é URL
   ("Smile.io, 2024") veio do insumo e continua valendo.

Falha de busca **nunca derruba a triagem**: ela roda como antes e a tela
explica por que veio sem fato externo. "Não configurado" é traduzido na
rota — o motivo original é escrito para o modelo da ConvertIA e fala de
`web_abrir`, que não existe no Estúdio. `evidencia.fonte` subiu de 200 para
500 caracteres: com URL de caminho longo o schema recusava o JSON inteiro e
a triagem falhava por causa do endereço de uma evidência.

## Estúdio — família Alternado: a paleta sai de uma cor só (set/2026)

Terceira família visual (item 3 do plano das duas vias). A `padrao` e a
`editorial` decidem o fundo pelo TIPO do slide (capa, prova e CTA no
gradiente); a Alternado decide pela POSIÇÃO — capa, escuro, claro, escuro,
claro… —, que é o ritmo do formato. O CTA fecha no CLARO (é onde a caixa
da palavra tem contraste) e o slide ANTES dele vai no gradiente. Sem saber
o total não dá para achar esse penúltimo, e aí ele simplesmente não
acontece: alternância certa vale mais que um gradiente no slide errado.

**A paleta inteira sai de UMA cor** (`lib/conteudo/paleta.ts`, puro, 8
testes), regra do `principios-de-design` da referência: clara (+20% de
branco), escura (−30%), off-white e quase-preto escolhidos pela
TEMPERATURA da cor (fundo cinza-azulado sob marca laranja parece erro de
impressão), borda = fundo claro um passo abaixo, gradiente 165°. A
primária **nunca vira fundo de texto** — ela é accent em palavra solta,
filete do topo e preenchimento da barra de progresso; `tintaSobre` devolve
a cor do texto a partir do fundo, e é ela que o renderer usa.

`doc.corPrimaria` fica GRAVADA (aditivo, o schema é `passthrough`) porque
é ela que permite trocar de cor DE NOVO sem que a segunda troca confunda o
derivado com o que o usuário pintou à mão — `aplicarCorPrimaria` compara
com a paleta da cor anterior, não com a cor da casa.

**Duas peças de chrome novas**, ligadas por flag no traço da família:
`barraTopo` (o filete de 8px que costura os nove slides quando o fundo
muda a cada passo) e `barraProgresso`, que **substitui** o "N/M" solto —
dizer duas vezes onde a pessoa está é ruído, e a barra diz o que o número
não diz: que existe um caminho até o fim.

**Inserir um slide refaz o ritmo** (`ritmoDeFundos`, chamado por
adicionar, duplicar, dividir, reordenar e excluir): quem insere no meio
desloca todos os seguintes, e sem recalcular a peça fica com dois escuros
colados e o gradiente no slide errado — a identidade do formato sumiria no
primeiro slide adicionado. Só o que ainda está num valor PADRÃO da família
é recalculado; fundo pintado à mão continua onde o usuário pôs. Nas outras
famílias a função devolve o MESMO objeto (o fundo lá vem do tipo, não da
posição), então não há re-render à toa.

**A verificação renderizando pegou o defeito que nenhum teste pegaria**:
capa, prova e CTA escreviam em BRANCO FIXO. Nas duas famílias antigas
esses três moram no gradiente e o branco era certo por construção; na
Alternado o CTA fecha no claro e a prova pode cair no claro — texto branco
sobre off-white, ilegível, com todos os testes verdes. Agora quem manda é
o que está DE FATO atrás da letra: com imagem existe o véu escuro
(`imgSlot` só desenha o véu quando há imagem — era essa a pegadinha), sem
imagem vale o fundo do slide.

## Comment gate: a palavra do carrossel vira automação (set/2026)

O carrossel termina em "comente SEGMENTO e eu te mando no direct" e isso
era **só texto no slide**. Medido antes de mexer: zero automações com
gatilho `thread_message_received` no banco, o texto do comentário
chegando ao dispatcher e **ninguém filtrando por ele**, e o executor sem
saber responder pelo Instagram (canal de IG caía no ramo da Cloud API do
WhatsApp e o nó morria em `config_missing`). Quatro camadas, todas
mudas.

**Filtro por palavra** (`lib/crm/palavra-chave.ts`, puro, 8 testes):
casa por PALAVRA INTEIRA, sem caixa nem acento — "41" não pode disparar
em "3410" nem "guia" em "guiaram", porque casar de mais manda mensagem a
quem não pediu e é assim que a conta é punida. Plural simples entra
("segmentos" casa "segmento"), outras flexões não; variantes por vírgula
("SEGMENTO, SEGMENTAR") porque o operador raramente acerta de primeira
como o público escreve. Sem chave configurada devolve `true`: automação
sem filtro continua disparando como antes.

**Resposta pelo caminho certo** (`lib/crm/resposta-instagram.ts`, puro):
comentário → *private reply* endereçada pelo **id do comentário** (a
resposta cai no direct de quem comentou; uma por comentário, 7 dias);
direct → DM pelo id do remetente. `sendInstagramMessage` ganhou
`to_kind`, que escolhe entre `recipient:{comment_id}` e `recipient:{id}`.
O `to` do nó fica VAZIO de propósito — no Instagram o destinatário vem
do gatilho, não de um campo digitado.

**O negócio é de quem comentou, não do post.** A thread de comentários é
agrupada pela MÍDIA (`contact_external_id = "comment:<media>"`): cem
pessoas comentando caem na MESMA conversa. Como `action_create_deal` é
idempotente por thread, o post inteiro rendia **um negócio só** e todos
os outros voltavam `created:false`, calados — e `is_first_message`, que
contava por thread, dizia "sim" apenas para quem comentou primeiro, então
com o filtro "só a primeira" ligado o gate atendia UMA pessoa por post.
Os dois defeitos são invisíveis: nada em log ou tela diz que noventa e
nove pedidos foram descartados. Os dados de produção já mostravam o caso
(dois posts com 2 comentários de 2 pessoas diferentes cada).

Agora `donoDoNegocio` (mesmo módulo puro) devolve `thread` (conversa de
pessoa: o vínculo dela vale) ou `pessoa` (conversa de post: o dono é
quem comentou), e `garantirThreadDaPessoa`
(`crm-thread-pessoa.service.ts`) abre a conversa DELA — mesmo espaço de
identidade do direct, então quando ela responder cai ali e nada duplica.
Sem `sender_external_id` a ação **recusa com motivo declarado**: um
negócio para o post inteiro é pior que nenhum. `is_first_message` de
comentário passou a contar por remetente (`metadata->>sender_id`).

**A resposta enviada é gravada no inbox** (`registrarSaidaNoInstagram`,
`sent_by_kind: "automation"`): sem isso o direct saía e o atendente via a
pessoa responder a uma mensagem que, para ele, nunca existiu. Vai na
conversa da pessoa, dedupe pelo id do comentário (hash do texto só como
último recurso — a mesma pessoa comentando duas vezes recebe duas
respostas e as duas têm de aparecer). Falhar ao gravar NÃO derruba o nó:
a mensagem já saiu.

**Resposta e negócio são ramos PARALELOS do gatilho**, não uma fila. No
executor um nó que falha interrompe o ramo dele e só ele: em fila, DM
recusada (janela de 7 dias, pessoa que bloqueou direct) faria o lead
nunca chegar à pipeline, e pipeline mal configurada calaria a entrega que
o carrossel prometeu. A resposta vem primeiro na lista de edges porque
elas são percorridas em ordem e quem comentou está esperando.

**Com palavra-chave, "só a primeira mensagem" sai do filtro**
(`instagram-automation.ts`): quem já tinha comentado "🔥" no post não
entraria quando comentasse a palavra — e é justamente essa pessoa que
pediu. Quem faz o papel de guarda contra spam ali é a palavra.
`keyword` entra na identidade de `isSameInstagramAutomation`: duas
automações do mesmo post com palavras diferentes são coisas diferentes.
Comentário da PRÓPRIA conta é gravado (é histórico) mas não dispara —
com o gate ligado, o fluxo responderia a si mesmo.

**O gatilho que o builder edita passou a valer** (`automation-trigger.ts`,
puro, 4 testes). Quem dispara é a COLUNA `automations.trigger`; o nó do
DAG é o que a tela mostra. O save do builder manda só `{name, dag}`, então
mexer no canal, no tipo de interação ou na palavra-chave pela tela salvava
o desenho e **não mudava nada** — sem erro, sem aviso, e só o banco
contava a verdade. O PATCH agora deriva a coluna do nó quando o corpo traz
`dag` e não traz `trigger`; desenho sem nó de trigger utilizável mantém o
que está gravado (apagar desligaria a automação em silêncio). Zero
automações no banco quando isto entrou — não há dado legado a migrar.

**No Estúdio** (`comment-gate.ts`, puro, 8 testes + `comment-gate-modal`):
botão "Ligar a automação" embaixo do campo Comment gate, na aba Legenda.
`impedimentosDoGate` diz o que falta (palavra, perfil, canal fora do
Instagram) em vez de oferecer um botão que falha; `respostaSugerida` sai
do CTA do próprio carrossel quando ele entrega algo — "Comente SEGMENTO"
é o PEDIDO, não a entrega, e cai no texto que nomeia a palavra. O POST é
a MESMA rota do painel Instagram (`setup-automation`, agora com
`keyword` e `reply`), então a automação aparece e é editável em
Automações do CRM: um dono só. `data.ts` ganhou as duas únicas chamadas
do Estúdio a rotas do CRM, com o motivo declarado.

## Execução manual: desativar, pinar e parar onde quiser (set/2026, migration 20261129)

Camadas B/C/D do plano. `email_generation_executions` (mode manual|producao,
`overrides`, `config_snapshot`, status, `stopped_at_node`) +
`email_generation_runs.execution_id`. Régua e gate no módulo PURO
`agents/execucao/overrides.ts`, usado pela TELA e pelo SERVIDOR.

**A linha dura vive numa função**: `gateFor(node, overrides, mode)` devolve
gate NEUTRO quando `mode !== 'manual'`. Não consulta intenção, consulta
modo — vale para override gravado por engano, por corrida ou por `curl` com
o modo errado. É o que impede um pin esquecido de mandar ao cliente um
e-mail com a copy congelada de outro.

**Só o modo MANUAL grava linha**, e é decisão: produção não pode ter
override por construção, então a linha seria telemetria pura (que já existe
em runs/status/batch), e fechá-la exigiria cobrir cinco saídas distintas —
linha `running` órfã é o estado zumbi que este repo já pagou caro. A lista
da esquerda segue agrupando produção por e-mail; o que ela ganhou é o selo
da execução manual viva, o que ela mudou e o botão de cancelar.

**A régua de degradação por nó** (`DEGRADACAO`): `passa_adiante` (o step
seguinte usa a entrada — o que o `resolveAgentSwitch` já fazia),
`roda_degradado` (segue com menos, e o motivo diz o quê) e `recusa`. As
quatro recusas são Curador, Blueprint, Copy e Dispatch: a premissa "cai no
template global, que TEM hero" é FALSA (o global do welcome-1 tem 21.314
chars, zero placeholders, nenhum marcador `cfy:hero`), então deixar rodar
para descobrir custa a fase 1 inteira e termina em `hero_failed` de
qualquer jeito. Um teste garante que TODO nó do grafo tem degradação
declarada — nó novo sem entrada reprova em vez de aparecer na tela sem
explicação.

**Pin = "não execute; a saída gravada vale"** (artefato da fase 1, copy dos
blocos, HTML do estágio). É a única coisa que destrava a recusa: desativar o
Curador é lacuna, pinar o Curador é dizer que a referência gravada serve.
Repor `parsed_output` de run arbitrária ficou fora — exigiria escrever de
volta nos artefatos. **Pin sem artefato é tão fatal quanto desativar sem
pin**, e a régua pura não pode ver isso: daí a segunda régua com I/O
(`verificarPins`), que também recusa `start_from` sem HTML persistido —
a cadeia trata "estágio sem HTML" como inconsistente e RECOMEÇA do zero, ou
seja, o pedido seria ignorado em silêncio.

**Os três modos parciais**: `stop_after`, "rodar só X"
(`overridesSoEsteNo` = pina tudo antes + para depois + `start_from`) e
retomar de X (`start_from` → `html_pipeline_stage`, o resume que a cadeia já
tinha). Um teste garante que o atalho NUNCA produz override que o servidor
recusa — senão o botão existiria para falhar.

**O watchdog respeita a pausa**: `stop_after` deixa o e-mail em `rendering`
com o estágio persistido, indistinguível de geração travada por fora. Os
dois fronts que o tocavam (sweep de `timeout_phase2` e retomada in-process)
excluem os pausados; fail-open com lista vazia. Sem isso, parar no nó X e
sair para almoçar devolvia `failed:timeout_phase2`.

**Duas chamadas no disparo, de propósito**: `POST
/api/admin/agents/executions/manual` grava a execução e o estágio, e devolve
qual disparo fazer; o disparo é o que JÁ EXISTE (`generate-email`, com fase
1 síncrona, split da fase 2 e fallback sem `INTERNAL_SECRET`).
Reimplementá-lo criaria um segundo caminho que divergiria na primeira
mudança. O runner acha a execução sozinho pelo `email_id` — nenhum
parâmetro novo atravessa as três fronteiras de processo do pipeline.

Invariantes no banco: `uniq_ege_manual_viva` (uma manual viva por e-mail; o
segundo disparo toma 409 em vez de embaralhar overrides de duas pessoas no
mesmo HTML), trigger de `updated_at` com `clock_timestamp()`, RPC com
predicados literais, e RLS `TO authenticated` com escopo por org
(`org_members.profile_id`, não `user_id` neste schema) — a tabela nasce
fechada em vez de nascer com o débito das irmãs. `execution_id` degrada:
coluna ausente → retry sem ela, senão uma feature de teste apagaria a
telemetria inteira.

**Na tela**: painel do nó com "Nesta execução" (Desativar · Pinar · Parar
aqui · Rodar só este), o rascunho pinta no canvas quem não vai rodar ANTES
do disparo (reusa o status `pulado`, sem inventar um sexto) e a barra mostra
o resumo e as recusas nó a nó, com o botão travado enquanto houver recusa.
Desativar e pinar são EXCLUSIVOS na tela: os dois impedem o nó de rodar, e
dois selos ao mesmo tempo fariam o operador não saber qual valeu.

---


## Assinatura infere as lojas do cliente, e a carteira ganha busca (set/2026)

**Busca na Gestão de Carteira** (`filtrar-carteira.ts`, puro, 11 testes): 63
lojas em sete colunas de kanban e nenhum jeito de achar uma. A busca casa
**loja, cliente e CSM** — os três jeitos de procurar a mesma conta — e cada
palavra do termo precisa aparecer em ALGUM dos campos, então "jmjc uk" acha
"Boxer Shop UK" do cliente JMJC e a ordem não importa. Exigir a frase inteira
num campo só faria uma busca natural (cliente + loja) não achar nada. Filtra
**mantendo as colunas**: a etapa é a informação daquela tela, achatar em lista
destruiria o que se foi olhar. O contador vira "N de 63 lojas" com busca ativa
— senão o board filtrado parece a carteira inteira. Termo vazio devolve a
MESMA referência do array, para não re-renderizar o board a cada tecla.

**Vínculo assinatura→lojas** (`lojas-da-assinatura.ts`, puro, 15 testes). A
tela dizia "Sem loja — vincular" com a resposta no banco ao lado: o cliente
tem lojas ativas e a assinatura cobre alguma. Três decisões:

- **É derivação de LEITURA, nunca gravação.** A inferência não vira linha em
  `client_subscription_stores` sozinha — é calculada na hora e marcada como
  inferida (chip TRACEJADO, não sólido). Assim o vínculo explícito, feito à
  mão hoje ou **pelo onboarding amanhã**, sempre vence, sem ninguém precisar
  desfazer o que um backfill teria gravado. Era o pedido: não deixar
  definitivo.
- **Só infere sozinha com UMA assinatura ativa.** Medido em 08/09: das 7
  assinaturas sem vínculo, **nenhuma** é o caso trivial de uma loja — seis têm
  múltiplas. João Paulo Lima tem DUAS assinaturas e duas lojas; o JMJC tem
  **MRR de R$ 7.000 em duas assinaturas de 3.500** para três lojas Boxer Shop.
  Dar "todas as lojas do cliente" a cada assinatura contaria a mensalidade
  DUAS VEZES na carteira — e receita inflada é o erro que ninguém percebe
  olhando, porque o número continua plausível. Qual plano paga qual loja é
  decisão de negócio.
- **Calar-se não é o mesmo que não ajudar.** Onde a inferência não vale,
  `candidatas` segue trazendo as lojas do cliente e o diálogo abre com elas
  MARCADAS. O trabalho vira revisar, não garimpar num select — que era a dor.
  Assinatura encerrada não sugere nem candidata: um clique de "confirmar" numa
  assinatura que não corre mais é convite ao erro.

A contagem que decide é a de assinaturas **locais** ativas, porque
`client_subscription_stores` referencia `client_subscriptions` — são elas que
podem reivindicar as mesmas lojas. Assinatura do Asaas **sem espelho local**
não tem onde gravar o vínculo (a FK aponta para a tabela local): o botão manda
para o diálogo, que cria o espelho, em vez de falhar em silêncio.

## RLS round 5B aplicado: o portal sai do banco interno (set/2026, migrations 20261130-31)

Aplicado em produção com medição antes/depois. As 53 tabelas que ainda tinham
`TO authenticated USING (true)` passaram a `is_org_member()`, mantendo o mesmo
comando de cada policy.

**Por que isso é seguro, e não uma aposta:**

- **Nunca afrouxa.** A policy que sai é MAIS permissiva que a que entra
  (`true` ⊇ `is_org_member()`), então nenhum controle fino é anulado. O caso
  que me preocupava — `clients`, com "Access clients by permission" — **não
  estava na lista**: ele não tem policy frouxa.
- **Nunca restringe para membro.** Membro passa em `is_org_member()`.
- **A ordem elimina a janela**: cria a nova ANTES de dropar a antiga. Policies
  permissivas são OR, então entre os dois passos a cobertura só aumenta.
  Dropar primeiro abriria um instante sem acesso.
- **Cobre INSERT**, cujo `true` mora em `with_check` e não em `qual` — filtrar
  só por `qual` deixaria a porta de escrita aberta.

**A prova foi medida, não suposta**: as contagens que um membro enxerga nas 54
tabelas foram capturadas antes e depois e são **idênticas, item a item**
(comparação por diff, não a olho). Escrita testada em `tags`,
`crm_quick_replies`, `store_feedback_calls` e `email_generation_settings` —
INSERT, UPDATE e DELETE, incluindo a policy de INSERT que só tinha
`WITH CHECK`. Anon: zero em tudo. Portal: zero no banco interno.

Estado final: `anon_aberto = 0`, `authenticated_true = 0`, `sem_rls = 0`,
formulário público e `tracking_lookups` intactos. As 17 tabelas com RLS ligada
e nenhuma policy são as 14 que já eram assim + os 3 backups fechados no 5A —
o 5B não criou nenhuma.

### A recursão de `pipeline_members` (migration 20261130)

Descoberta porque **bloqueava a verificação**: `pm_select` fazia
`EXISTS (SELECT 1 FROM pipeline_members ...)` dentro da policy de
`pipeline_members`, e a subconsulta reaplica a policy — `42P17: infinite
recursion`. Levava junto `pipelines` e `pipeline_stages`, que fazem EXISTS
nesta tabela.

**Latente, não ativo**: todas as leituras no código usam `createAdminClient`
(service role), que bypassa RLS — por isso ninguém tropeçou nisso. Consertado
pelo padrão da casa (`is_pipeline_member`/`is_pipeline_owner` SECURITY DEFINER
com `search_path` fixo), preservando a semântica. Sem isso, a policy estouraria
no dia em que alguém lesse com a chave do usuário.

### Um achado de DADOS, não de código

`mathemaxs@gmail.com` é ao mesmo tempo **usuário do portal e membro ativo da
org** (papel `implementacao`) — por isso enxerga a base inteira. Não é falha do
RLS: `is_org_member()` está certo, a conta é que acumula os dois papéis. Os
outros dois usuários do portal estão corretamente fechados. Se essa conta é de
cliente, ela não deveria estar em `org_members`; se é do time, o acesso ao
portal é que deveria sair.

## Assinatura duplicada: três escritores, nenhuma chave em comum (set/2026, migration 20261132)

Relatado: vincular loja no perfil do cliente duplicava a assinatura, e
criar o onboarding às vezes duplicava também. Medido em 08/09 — não era
corrida de clique, eram **dias** de diferença: Frederico (R$ 10.000 pelo
onboarding em 28/08 + R$ 10.000 pelo fechamento em 31/08) e João Paulo
(R$ 3.500 em 02/09 + R$ 3.500 em 03/09).

Três caminhos gravam em `client_subscriptions` e **nenhum compartilha
chave com os outros**: `createOnboarding` e `POST
/api/client-subscriptions` fazem "existe? senão insere" pelo
`asaas_subscription_id`; o **fechamento da venda** (`POST
/api/crm/deals/[id]/billing`) não checava NADA e ainda gravava a linha
**sem** `asaas_subscription_id` — então o merge do GET (que só funde
pelo id) mostrava DOIS cards para uma assinatura só, com o MRR em dobro.
São as cinco linhas "Assinatura — <cliente>" de Camila, Danilo,
Frederico, João Paulo e Thiago; quatro delas de clientes que têm
`asaas_customer_id`, isto é, com a assinatura viva do outro lado.

**A chave da idempotência do fechamento é a VENDA**, não o valor:
`client_subscriptions.source_deal_id` com índice único parcial. O valor
não serve — o JMJC tem duas assinaturas legítimas de R$ 3.500 (MRR
7.000) para três lojas Boxer Shop e João Paulo tem duas de R$ 3.500 para
duas lojas; reusar por valor faria a segunda venda não gerar receita
nenhuma, e **receita que some ninguém vê**, enquanto a duplicada ao
menos aparece na tela. Índice único também em `asaas_subscription_id`
(global, não por cliente: a assinatura do Asaas pertence a um cliente
só, e o par esconderia o espelho gravado sob o cliente errado). É o
mesmo remédio da 20261119 em `invoices.asaas_id`, e aqui ele é ainda
mais necessário porque o `.maybeSingle()` dos dois escritores **estoura**
com duplicata (PGRST116): uma vez duplicado, vincular loja e criar
onboarding falhavam para sempre.

**Checar antes sem tratar o conflito depois é o padrão que duplicou.**
Os três caminhos agora tratam 23505 re-selecionando e ADOTANDO o que
passou primeiro. O billing degrada com `42703/PGRST204/PGRST205` (a
migration deste repo é aplicada à mão e escorrega): grava sem a coluna e
loga — a venda fecha, a idempotência volta quando a migration rodar. A
régua de "coluna ausente" é **só por CÓDIGO**: casar a mensagem por
`source_deal_id` pegaria também o 23505 do índice, cuja resposta é a
oposta. A 1ª mensalidade só é emitida com a assinatura NOVA — na
reaproveitada, cobraria o mês duas vezes.

**As linhas antigas não são apagadas por código.** Quatro das cinco têm
cobrança emitida, e assinatura com cobrança não pode sumir por um
clique. `suspeitasDeDuplicata` (`assinatura-duplicada.ts`, puro, 18
testes) aponta a suspeita no card e o operador confirma; confirmar grava
o `asaas_subscription_id` no espelho (`PATCH` da rota) e o merge funde
os dois a partir dali — não apaga nada. O critério é **exclusivo nos
dois lados**: só aponta quando uma local órfã e uma do Asaas se
correspondem sozinhas em valor E ciclo. Duas órfãs de R$ 3.500
disputando a mesma do Asaas não apontam nada — escolher no chute faria
fundir a assinatura da loja errada, e ciclo diferente (o "Plano
Trimestral" × "Assinatura — Frederico" mensal, ambos R$ 10.000) mudaria
o que o cliente paga por ano.

**O WonDealDialog passou a olhar o financeiro**: ele abre com
"assinatura mensal" pré-marcada e não consultava nada, então quem fecha
a venda de um cliente que já paga mensalidade não tinha como saber pela
tela — foi assim que as duas duplicatas caras nasceram.
`avisoDeAssinaturaExistente` é AVISO, não bloqueio: cliente que compra a
segunda loja precisa mesmo da segunda assinatura, e ali o valor idêntico
é a regra, não a exceção. Conta a lista MERGEADA (locais + Asaas sem
espelho), senão deixaria de avisar justamente quem tem a assinatura viva
no Asaas e ainda sem espelho.

### O quarto escritor: a duplicata que COBRA (08/09)

O usuário mostrou a EP Negócios Digital com DOIS cards de R$ 2.497 —
depois da correção acima. Medido: **zero linhas em
`client_subscriptions` para esse cliente**. A lista da tela é
`localSubscriptions` + `subscriptions` do Asaas, então dois cards com
zero locais só podem ser **duas assinaturas no próprio Asaas**.

`POST /api/integrations/asaas/subscriptions` chamava
`asaas.createSubscription` **sem checar nada**, e o provedor não
deduplica. A chamada leva segundos, o botão não travava de verdade e um
F5 reenviava: o cliente passa a ser cobrado duas vezes por ciclo. As
duplicatas locais eram feias na tela; esta sai na fatura de quem
comprou uma assinatura só.

`decidirCriacaoNoAsaas` (`asaas-assinatura-duplicada.ts`, puro, 18
testes) separa por TEMPO, porque recusar tudo seria pior: a segunda loja
de um cliente custa quase sempre o MESMO que a primeira (o JMJC tem duas
de R$ 3.500), e recusar em silêncio faria a venda nova não ser cobrada.

- **`reusar`** — idêntica (valor + ciclo + descrição sem acento/caixa)
  criada há menos de 10 min: não existe decisão de negócio tomada duas
  vezes nessa janela, é clique duplo ou retry. Segue com a que existe.
- **`confirmar`** — idêntica mais antiga: 409 com a data, e o diálogo
  "Criar mesmo assim" diz que passa a cobrar em dobro. Sem `dateCreated`
  também cai aqui — afirmar recência que não se tem reusaria uma
  assinatura que deveria nascer.
- **`criar`** — nada parecido. Cancelada no Asaas não bloqueia; status
  ausente conta como ATIVA (ignorá-la liberaria a duplicata).

A **consulta** é fail-open (listagem que cai não pode recusar a venda),
mas a criação não: `confirmar_duplicada` só vem de um clique humano. Duas
armadilhas fechadas junto: `listSubscriptions` não filtrava por
`customer` (traria a conta inteira) e `onClick={handleCreateSubscription}`
passaria o EVENTO como `confirmarDuplicada` — truthy, e a checagem nunca
rodaria. O POST passa `externalReference: clientId`, que é como
`resolveClientForPayment` acha o dono do pagamento.

**Nota de método**: o `execute_sql` do MCP devolve só o ÚLTIMO statement.
Duas queries num envio fazem a primeira sumir sem erro — foi o que quase
me fez concluir que o cliente não existia.

### O card duplicado ERA o vínculo (08/09) — a tela somava duas fontes

O relato original era literal e eu demorei a ouvi-lo: **vincular loja
duplicava a assinatura**. Não era corrida, nem escritor a mais — é que
`client-financial.tsx` lê DUAS fontes independentes (`client_subscriptions`
pelo Supabase e a lista crua do Asaas por `useAsaasSubscriptions`) e
renderizava as duas inteiras, `localSubscriptions.map()` seguido de
`subscriptions.map()`, **sem nenhum filtro entre elas**.

Enquanto a assinatura existia só no Asaas era um card. No instante em que
alguém clicava "Vincular lojas", `handleLinkStores` criava a linha local
— corretamente, porque é onde o vínculo mora: a FK de
`client_subscription_stores` aponta para `client_subscriptions` — e a
MESMA assinatura passava a ocupar dois cards. No print da EP Negócios os
dois se distinguem: o esquerdo diz "Asaas (Automático)" sem id (é o
local, que usa `paymentMethodLabels`), o direito mostra "ID Asaas" (é o
do provedor).

**O merge por `asaas_subscription_id` já existia — no
`GET /api/client-subscriptions`, que esta tela não usa.** Agora a mesma
regra roda aqui: a linha local VENCE (é ela que carrega lojas,
classificação e notas) e a do provedor é descartada da lista. O card
local ganhou a linha "ID Asaas", senão o dado sumiria junto com o card
do Asaas.

Conserta três sintomas de uma vez, porque todos liam a mesma variável:
o card repetido, o "Assinaturas (2)" e o MRR de R$ 4.994 (= 2.497 × 2,
somado em `activeSubsValue` = Asaas + locais). E vale para qualquer
origem do espelho — vínculo, onboarding, fechamento da venda ou o sync —
não só para o clique que expôs o defeito.

**Lição**: mesma entidade vinda de duas fontes precisa do merge em TODA
leitura, não só na que foi escrita primeiro. Um endpoint mergeado não
protege a tela que fala direto com as duas pontas.

**Reproduzido e medido (08/09, 22:37)**: criar assinatura pelo perfil do
cliente (Ricardo Lacerda, Plano Mensal R$ 3.500) gravou **UMA linha
correta**, com `asaas_subscription_id = sub_nx3acxf97wuc96j7` — e a tela
mostrou duas. Prova de que o defeito é de LEITURA, não de escrita: o
banco estava certo o tempo todo. Vale para todo caminho que cria o
espelho, e o POST de assinatura Asaas cria um por construção, então
"criar assinatura" duplicava a tela mesmo sem ninguém vincular loja.
A regra saiu do componente para `assinaturasAsaasSemEspelho`
(`assinatura-duplicada.ts`, puro), com esse caso como teste de
regressão.

## Espelho do Asaas parado: comissão paga aparecia atrasada (set/2026)

Relatado com print: a carteira dizia "Comissão atrasada" e "Mensalidade
atrasada" para a Energia Portátil enquanto a aba Financeiro do cliente
mostrava as mesmas cobranças como Pago/Confirmado. Os dois leem fontes
diferentes: o Financeiro lista os pagamentos AO VIVO do Asaas; carteira,
funil e onboarding leem `unified_invoices`, o ESPELHO em `invoices`.

Medido: `integrations.last_sync` = **19/02/2026**; 39 linhas `pending`
(todas vencidas) contra 12 `paid`; a comissão de junho, paga em 09/08,
seguia `pending` com `payment_date` nulo; as três mensalidades de R$ 2.497
nem existiam no espelho. Dois defeitos empilhados:

1. **Nada varria o Asaas.** A única sincronização era o botão manual em
   Configurações → Integrações, e ela pedia `listPayments({limit: 100})`
   sem paginar: cobrança fora da primeira página nunca entrava. O webhook
   não compensou — desde fevereiro nenhum `PAYMENT_RECEIVED` atualizou o
   espelho, o que sugere webhook não configurado ou recusado na assinatura
   (conferir no painel do Asaas; o endpoint é `/api/integrations/asaas/webhook`).
2. **O espelho nasce na classificação** (`ensureAsaasInvoiceMirror`, ao
   classificar ou marcar pago) com o status DAQUELE momento e nunca mais
   é relido. A linha criada `pending` fica `pending` — e `isOverdue` da
   carteira a lê como atrasada assim que vence.

**Correção** (`asaas-sync.service.ts`): varredura PAGINADA por offset
(`varrerPaginado`, puro, 5 testes) com orçamento de tempo e `truncado`
declarado, janela de 24 meses de vencimento, update por `asaas_id` que
PRESERVA a classificação humana (o builder não emite `store_id` nem
`reference_months`); assinaturas casadas pelo `asaas_subscription_id`
sozinho (índice único global — por cliente + id inseria a mesma sob outro
cliente e tomava 23505 a cada rodada) e sem trocar de dono. A rota manual
e o novo cron `/api/cron/asaas-sync` (minuto 25 das horas pares) chamam a
MESMA função — a redundância webhook + varredura é a de pixel + CAPI.

**O dado só se corrige com a varredura rodando**: depois do deploy, clicar
"Sincronizar" no card do Asaas ou esperar o cron. Não há como rodar daqui
(a chave está cifrada com segredo do ambiente). Pendência consciente: a
cobrança avulsa (`charge_type = other`, ex.: "Fatura" de R$ 76,60) cai no
balde de MENSALIDADE da carteira; avulsa vencida vira "mensalidade
atrasada". Separar exige decidir o que é mensalidade sem classificação.

## ConvertIA — as três perdas silenciosas (set/2026)

Medido antes de escrever código: das **27 respostas do assistente, 7
falharam (26%)** e **124 das 124 notas ativas estavam sem embedding**.
Nenhuma das três causas aparecia em tela.

**1. O 402 mais comum NÃO é falta de crédito.** Quatro das sete falhas
eram `in_flight_budget_exhausted` com o saldo em **US$ 5,45, situação
"ok"**. O OpenRouter RESERVA o custo máximo de cada chamada em voo
(prompt + max_tokens no preço do modelo), então com saldo curto e
modelo caro a segunda chamada é recusada enquanto a primeira não
liquida — a mensagem do provedor diz "retry after in-flight requests
settle". `friendlyModelError` casava os dois 402 na mesma regra e
respondia "os créditos acabaram, recarregue", mandando fazer a coisa
errada numa conta com saldo. Agora são códigos distintos:
`credits_in_flight` (esperar) e `no_credits` (recarregar, com o link).
O teste que fixava o comportamento antigo foi corrigido junto — teste
que congela o erro é o que faz ele sobreviver.

**2. A chamada ao MODELO não tinha retry** (as tools tinham desde a
v3). `callWith` tratava só o slug desconhecido; qualquer outro erro
era `throw` e matava o turno. `chamarComRetry` repete o transitório
(in-flight, 429, 5xx, timeout) até 2× com backoff — o in-flight começa
em **3s** porque 1s não faz a chamada anterior liquidar — e a espera
sai do orçamento restante MENOS o mínimo de uma rodada, então insistir
nunca custa a resposta. **Não repete a tentativa que já escreveu na
tela**: 402/429/5xx são recusados no cabeçalho, antes do primeiro
token, mas um timeout no meio do stream deixou texto no state e
repetir duplicaria o parágrafo para quem está lendo.
`meta.model_retries` grava a recuperação (ausente quando zero) — sem
ele, o turno que insistiu 9s passa por lentidão do modelo.

**3. A base inteira sem busca semântica, reportada como sucesso.** Três
camadas conspiravam: `embedTexts` engolia a causa em `log.warn` e
devolvia `null` (indistinguível de "nada a fazer"); `embedPending`
parava no primeiro lote falho e o sync reportava `status:"synced"` com
`embedded: 0`, que se lê como sucesso; e o aviso "só a busca por
palavras rodou" estava atrás de `!embeddingsAvailable()`, que só olha
se a CHAVE existe — e a chave é a mesma do chat, sempre existe. **O
aviso era impossível de disparar justamente no caso real**, então a
ConvertIA respondia de full-text degradado como se estivesse inteira.
Agora toda saída carrega a causa (`{vectors, error}`,
`{embedded, pending, error}`, `embedError` no sync separado de `error`
— trazer as notas pode dar certo e a semântica ficar fora do ar) e o
aviso depende de a semântica ter **rodado**, não de a chave existir.
Resposta 200 sem nenhum vetor utilizável conta como falha; vetor fora
de 1536 dimensões já era descartado, mas em silêncio. O parâmetro
`dimensions` saiu: 1536 é o nativo do modelo, então não muda o
resultado e só acrescenta uma forma de um dos provedores que servem o
modelo recusar a chamada.

**Regra derivada, que vale para os três**: "a chave está configurada"
nunca é prova de que o subsistema funciona — é a mesma lição da chave
em branco do Serper. Onde a resposta importa, o botão faz a chamada
REAL e mostra a recusa crua ("Testar embeddings" e "Vetorizar as N
pendentes" no card de saúde, no padrão do "Testar busca"). Antes, a
única forma de investigar isto era por SQL e console.

## A decisão não se perde mais entre um agente e o seguinte (09/09, migrations 20261134-35)

Diagnóstico em `docs/email-generation/diagnostico-agente-a-agente.md` (batch
`644d86c5`, Hero Boxers Welcome 1): o Estruturador decidiu 7 posições com
qualidade e o e-mail entregou o oposto em 6. Não era um agente errando —
era a decisão morrendo na fronteira. O plano executado (12 passos) e o
que cada um travou:

**Curador do vault** (`curador-shadow.ts`): o teto era `max_tokens: 8192`
FIXO no código (a config de 16000 era ignorada), o modelo respondeu em
prosa dentro do loop de ferramentas e caiu em `shadow_json_ilegivel` sem
segunda chance — a resposta que ELIMINAVA a hero de cupom foi jogada fora
e o legado escolheu justamente ela. Agora: `resolverTetoDoCurador` (env >
max(8192, config)); `invokeAgentWithTools` ganhou **retomada** (resposta
final sem JSON → uma volta a mais, sem ferramentas, com o histórico e
prefill `{"papeis"` quando o provedor é `anthropic/*`; recusa do prefill
repete sem ele; falha devolve a original com o erro); JSON não consumível
vira `<preferencias_do_vault>` no legado. Telemetria: `finish_reason`,
`voltas_json`, `prefill_usado`, `posicoes_sem_resposta`; raw em 32k.

**Contrato da anatomia** (`shared/field-roles.ts`): medido — NENHUM campo
da biblioteca é `required:true`, então o contrato é a PRESENÇA do slot
(hero-3 tem `coupon_line`; sem cupom o example fica no HTML, porque
`pareceExemplo` não reconhece "Use code: [WELCOME-CODE]"). `resumirContrato`
(~150 chars) entra em `CatalogEntry.contrato` para os DOIS Curadores;
`eliminarPorRequisitos` cruza os `requisitos` do Estruturador com o
contrato e serve `<eliminadas_por_requisito>` (fail-open declarado quando
zera a seção); `contrato_violado`/`requisito_violado` no medidor.

**Estruturador** (`estruturador-prompt.ts`): `requisitos` TIPADOS por
posição (`cupom`/`cta`/`n_itens`/`preco`/`avaliacao`/`campos`/`imagem`/
`exige`, `normalizarRequisitos` fail-open) — uma fonte que Curador,
Blueprint, n8n, imagem e QA leem. `<secoes_disponiveis>` leva a
CAPACIDADE por seção (`capacidadePorSecao`): ele não exige o que a
biblioteca não tem. O prompt vive no CÓDIGO (system vazio no banco).

**Blueprint** (`estruturador-consume.ts`): `arbitrarCampos` marca `omitir`
no campo que colide com requisito duro (cupom negado, CTA negado, item
além de `n_itens.max`); `papel` e `requisitos` viram campos PRÓPRIOS do
bloco; purpose = `papel + "Forma (variante, subordinada ao papel)"`.
Telemetria `omitidos`, `papeis_nao_aplicados` (o desalinhamento era
silencioso).

**n8n / callback / merge**: campo `omitir` SAI de `schema.campos` (o n8n
não escreve o que não vê); o callback força `""` mesmo que ele devolva; o
merge remove a linha seja qual for a chave (`itemOrfao` forçado) ou
esvazia o texto — `report.omitidos`. `emails[].decisao` = `{incentivo,
insumos_permitidos}`; `estrutura_geral` passa por `condicionarOutline`
(sem incentivo → prefixo SEM INCENTIVO, blocos coupon/offer fora,
`coupon_code` null; com código da loja → vence o do outline). Doc:
`docs/email-copy-payload-v2.md` §v3.1. As ops `remove_row`/`set_text`
continuam MORTAS — omitir é flag no campo, não op.

**Seletor**: `incentivo` copiado do CATÁLOGO por código (o modelo não
decide), `insumos_permitidos` só com origem entre parênteses,
proibições deduplicadas por chave (`texto.ts`; 17 → sem dobros),
`contradicoes` quando o tratamento pede o que uma proibição nega
(`tratamento_sem_insumo` — alvo mantido, dado que falta declarado).
`renderAlvo` ganhou INCENTIVO/insumos/CONTRADIÇÃO; `alvoParaMedicao`
carrega `incentivo_existe`. Campos opcionais: alvos antigos continuam
válidos.

**Ficha operacional** (`lib/stores/ficha-operacional.ts`, coluna
`client_stores.ficha_operacional`, card na aba Pesquisa): incentivo,
troca, envio, garantia, prova, pagamento, suporte — VERIFICADOS pelo
time. O Catalogador a recebe como `<ficha_operacional_verificada>` (vence
a pesquisa) e `aplicarFichaAoCatalogo` carimba `lastro_operacional.
verificado=true` + `campo_de_origem` por família da afirmação e
sobrescreve `incentivo`; o PATCH de contexto aplica ao catálogo
existente na hora. **É lacuna de DADO, não de prompt**: sem a ficha o
Seletor proíbe tudo e os selos saem vazios.

**Hero**: o guard de PERDA já existia (`heroCopyPreserved`); a última
tentativa ACEITAVA o fragmento reprovado. Agora (a) `heroTextoInventado`
pega o que o agente ESCREVEU sem existir (oferta, `[WELCOME-CODE]`) e (b)
última tentativa reprovada → a REGIÃO DO MERGE fica no lugar
(`hero_fallback: regiao_do_merge`), nunca mais o fragmento errado; issues
`hero_copy_perdida`/`hero_copy_inventada` (high).

**QA** (`html/content-checks.ts`): quatro checks por código que rodam com
o gate `EMAIL_QA_ENABLED` ligado OU desligado — `oferta_sem_incentivo`
(high, só com a decisão conhecida), `placeholder_colchetes` (high),
`texto_de_exemplo` (medium, `EXEMPLO_RE` agora pega `icon N`), `paragrafo_
repetido` (medium). Desligado só persistem em `qa_issues`; ligado, `high`
reprova. **Manter OFF uma semana medindo; ligar depois** (ligado,
`passed=false` vira `failed`).

**copy_fit**: travessão por CÓDIGO (`removerTravessao`: " — " vira ". "
antes de maiúscula, ", " senão) — alvo só de traço que cabe não chama o
modelo; excesso ≤ 15% aparado na última palavra (`apararNoLimite`, sem
reticências — o review com idade e cintura era descartado por 12 chars);
coluna COMPARATIVA (`column_*`/par `_item_N`) NUNCA vai ao modelo (é onde
o sentido inverte) e item ausente com par não é inventado. Limites de
review em `supabase/migrations/DIAGNOSTICO_max_len.sql` (subir para ~260).

**Imagem**: `INTENCAO_VISUAL` (`requisitos.imagem`) entra ACIMA da
direção da variante (template in-code + migration 20261135 no template do
banco, que vence); `blueprint_purpose` = papel; tabela de LAYOUT sai do
brief (`tabelas_removidas`).

**Ainda aberto**: pular slot de imagem sem endereço no HTML (8 geradas /
4 mergeadas); a worklist da biblioteca (`docs/email-generation/worklist-
cobertura-biblioteca.md`: 16 examples + ~14 campos); pendências da ficha
alimentadas pelas `contradicoes` do Seletor na tela; ligar o QA.

## Vault de e-mail: o que o sync serve (set/2026, migrations 20261134-35)

Diagnóstico e plano em `docs/email-generation/diagnostico-vault-vs-advisor-max.md`
(por que o Advisor Max acerta com 1 MB de corpus e o Curador erra com
620 KB: a DISPOSIÇÃO, não o volume). Frente 1 — lado do vault — aplicada:

- **Lacuna aberta é servida.** `isDocActive` exigia `status: aprovada`
  para todo kind exceto o catálogo gerado; lacuna vive `aberta`, então as
  15 nasciam inativas e o loader do Curador (que já pedia o kind) servia
  "(nenhuma lacuna registrada)" em toda run — `lacunas_servidas: 0` como
  se não houvesse lacuna. `retratada`/`observacao`/`modelo`/`proposta`
  seguem fora. Vale após sync com `force: true`.
- **Kinds `julgamento` e `doutrina`** (`_julgamento.md`, régua da casa,
  servida inteira, teto 8k; `doutrina/<slug>.md`, doutrina de curso com
  `fonte:` obrigatória e `secao:`, teto 6k). `VaultDocKind` deriva de
  `VAULT_DOC_KINDS` e **um teste lê a migration e compara com o CHECK** —
  kind novo sem migration sincronizava, tomava 23514 e sumia; o sync agora
  nomeia a migration no card "Notas puladas". Blocos
  `buildJulgamentoBlock`/`buildDoutrinaBlock(k, secao)` com ausência
  DECLARADA; os prompts que os consomem são a Frente 2 (outra sessão).
- **Índice do Obsidian com `slug — primeira frase`** por nota
  (`primeiraFrase` pula título/tabela/lista/citação/código; teto 12k, a
  pasta mais cheia volta a só contagem). Contagem sozinha não orientava a
  consulta sob demanda: `consultou_vault` era 3/8 runs.
- **Catálogo enxuto** (`BuildCatalogResult.enxuto`, ≤ 15k): uma linha por
  variante com id, slug, primeira frase, eixos e anatomia — dos MESMOS
  dados do `json` (128k dos 190k chars da chamada), nunca do
  `_catalogo.md`. Entra no prompt só pelo kill-switch do item 2.3.
- **`buscar_doutrina`** em `VAULT_TOOLS`: a base do Max
  (design/copy/flows/doutrina/fundamentos) pela MESMA busca da ConvertIA
  (`buscarConhecimento`, extraída de `conhecimento_buscar`). Cabeçalho fixo
  rebaixa a "doutrina de curso" — sem ele o modelo lê como regra da casa.
- **Lacunas propostas por telemetria** (`vault_propostas`, cron diário
  `vault-lacunas-propostas`): a mesma violação em 3+ runs de 14 dias vira
  rascunho de nota em `componentes/lacunas/` (chave normalizada: a
  proibição fica só com o requisito depois do `×`, senão nunca chega a 3).
  `descartada` não ressuscita. O 👎 nunca persistiu nada e o token do vault
  é read-only — este é o caminho que sobrou.
- Casos A/B do diagnóstico viraram `curador-casos.test.ts`.

## Reels, Ideias e Calendário: o módulo Conteúdo fecha o ciclo (set/2026, migration 20261136)

As três telas que eram `ConteudoEmBreve` viraram produto, ligadas às mesmas
tabelas que o Dashboard e o Estúdio já usavam. Quatro tabelas novas
(`conteudo_ideias`, `conteudo_ideia_votos`, `conteudo_reels`,
`conteudo_trends`), todas com RLS `TO authenticated` + escopo por org e
`atualizado_em` por `clock_timestamp()`.

**Banco de Ideias** (`/admin/conteudo/ideias`). A anotação rápida é o
coração: quem tem a ideia está no meio de outra coisa — escreve, aperta
Enter, e a ConvertIA classifica DEPOIS (funil, formato, tags, molde, score,
"por que"). **Classificação que falha não perde a ideia**: ela entra crua, a
tela avisa que ficou sem score e o card mostra o traço. Regras em
`lib/conteudo/ideias/banco.ts` (puro, 8 testes): **score da IA e voto do
time são julgamentos DIFERENTES** e a tela ordena por um ou por outro —
somá-los num "score final" apagaria justamente onde a máquina e o time
discordam; ideia não avaliada vai para o FIM da ordenação, nunca some; a
busca casa cada palavra no título OU numa tag (quem procura "carrinho viral"
lembra de meio título e meia hashtag). Voto é **COUNT do servidor**, nunca
`votos + 1` no cliente. Do drawer saem as três saídas: pipeline de Reels,
"agendar direto" (vai para o pipeline já em `agendado`, com data) e
"criar carrossel com esta pauta" (`?novo=ia&pauta=` abre o Estúdio com a
pauta escrita — `promptInicial` no NovoFlow).

**Pipeline de Reels** (`/admin/conteudo/reels`). Kanban de 6 etapas
(ideias → roteiro → gravar → editar → agendado → publicado) com arrasto
otimista e revert de verdade. `lib/conteudo/reels/pipeline.ts` (puro, 9
testes): a meta semanal por funil (topo 2, meio 2, fundo 1) **conta o que
SAIU** — publicado ou agendado DENTRO da semana —, nunca o backlog; card
parado em "gravar" há três semanas não é publicação feita, e contá-lo é o
jeito mais fácil de a meta mentir. `posicaoEntre` é fracionária: soltar
entre dois cards grava o ponto médio, sem reescrever a coluna. **A data de
publicação só é carimbada na ENTRADA em "publicado"** (o serviço lê a etapa
atual antes): sem isso, reordenar um card já publicado — o arrasto manda a
mesma etapa com posição nova — reescreveria a data para hoje e a semana
passaria a contar uma publicação antiga. As métricas do card publicado saem
do POST REAL (`conteudo_ig_media` pelo `ig_media_id`); views e alcance são
medidas diferentes e cada uma pode faltar sozinha, então nenhuma substitui a
outra. Sem vínculo, o traço com o motivo.

**"Em alta" não é API de trends** (`conteudo-trends.service.ts`). Não existe
integração com TikTok aqui: o painel é ConvertIA + busca na internet, e cada
`fonteUrl` é conferida contra o que a busca serviu (`verificarFontes`, o
mesmo módulo da triagem) — link inventado é removido antes de gravar, porque
assunto "em alta" com fonte falsa é pior que painel vazio. O rodapé diz
quando a rodada foi feita e, sem provedor de busca configurado, diz isso em
vez de deixar a lista parecer conferida. Arquivar um assunto o marca
`ativo=false` em vez de apagar: é o título gravado que impede a rodada
seguinte de propor o mesmo tema de novo. A aba "Planejar com IA" é o MESMO
motor com um pedido diferente — as lacunas da semana entram no prompt
(ação `pautas`), então ele propõe o que FALTA fechar.

**Calendário** (`/admin/conteudo/calendario`), mês ou semana, com três
coisas na mesma grade: publicado (mídias da conta), agendado (carrossel do
Estúdio e reel do pipeline) e os **slots vazios**. O slot é o único item da
tela que não existe no banco, e por isso o mais fácil de estragar: é uma
PROMESSA, e promessa inventada faz o operador ignorar promessa e fato. Daí
`lib/conteudo/calendario/slots.ts` (puro, 9 testes): **cadência definida por
alguém vence sempre**; sem ela a meta semanal vira sugestão ESPALHADA pela
semana (`diasSugeridos` usa `floor`, então 2/semana é seg+qui e não seg+sex,
que deixaria metade da semana vazia), e a tela rotula qual dos dois casos é.
Dia passado não gera slot; dia que já tem post daquele perfil também não; e
a tela ainda limita o desenho a 14 dias à frente — mais adiante o tracejado
é ruído que esconde o que tem algo. A cadência virou editável
(`crm_channels.config.conteudo.cadencia_dias/hora` pelo PATCH que já existia
em `/api/conteudo/perfis/[id]`).

**O post real vence o card do pipeline** quando são a mesma publicação
(`Reel.igMediaId` × `Post.id`): sem essa deduplicação, o reel publicado
aparecia duas vezes no mesmo dia e o contador de publicados contava em
dobro — defeito que só apareceu ao RENDERIZAR a tela com dados, não nos
testes.

*As telas foram verificadas renderizando de verdade* (esbuild + shims de
SWR/Next/dnd + Tailwind local + Chromium): foi assim que apareceram a
duplicata acima, o "Setembro De 2026" do `capitalize`, o "0 items" em inglês
e o mês inteiro coberto de slots.


## Referência vira carrossel editável — e a imagem enviada passa a ser guardada (set/2026)

Dois defeitos numa tela só, relatados juntos: "quando eu subo uma img ele
não guarda" e "esse template não gerou igual eu quero, quero um template
editável com base no que enviei".

**A imagem sumia por uma assimetria de ENDEREÇO.** `POST /api/conteudo/upload`
devolve `convertiaImageUrl(path)` — a ROTA DO ADMIN
(`/api/ai/convertia/imagem/<path>`) — e o guard do PATCH conferia com
`storagePathFromUrl`, que só entende URL do **Supabase Storage**. O guard
recebia `null`, concluía "isto não é arquivo nosso" e descartava a imagem
**em silêncio**: o upload funcionava, o slide continuava sem foto e nada
aparecia em log. `objectPathFromAnyUrl` (`convertia-image-url.ts`, puro)
entende as duas formas e é usada nos três pontos que liam a URL errada —
incluindo `lerSlide`, o que significa que **"Ler de novo" nunca teve
imagem para mandar ao modelo** em referência importada. A régua de
segurança não mudou (o path tem de ser da própria org e ter o prefixo
`ref-`), e o descarte deixou de ser mudo (`referencia.imagem_recusada`).
Trocar a imagem existente passou a ser permitido — quem enviou a errada
precisa poder corrigir, e o "Ler de novo" está ao lado.

**"Usar como modelo"** (botão no card e na ficha) materializa a fase 2 que
estava declarada como pendente: a referência vira um `Documento` com um
frame por slide, a copy nos campos certos, a imagem no slot e a identidade
visual da casa (família `editorial`) por cima. Regras em
`lib/conteudo/referencia-para-documento.ts` (puro, 15 testes):

- **O tipo transcrito é intenção, não layout.** O nosso `dado` desenha o
  título como um NÚMERO de 360px (limite de 5 caracteres) e a transcrição
  marca "dado" em qualquer slide que carregue número — o título dela é uma
  frase. Copiar o rótulo faz a frase encolher até o piso e sair ilegível:
  era literalmente o "não gerou como eu queria". `dado` só permanece quando
  o título cabe como número (`pareceNumeroDeDestaque`, com prefixo de moeda
  tratado); senão vira `texto`. Sem tipo declarado, a POSIÇÃO decide (capa,
  meio, CTA) — adivinhar `prova` ou `lista` trocaria o layout inteiro.
- **A fala e a arte se separam** (`separarCopyEArte`). A transcrição
  descreve o visual entre colchetes ("[card com 4 métricas… anotação
  manuscrita: 'esse ninguém sabe']") e carrega a navegação do original
  ("· DESLIZE →", "botão: NOSSO MÉTODO →"). Isso não é parágrafo: vai para
  `promptImagem`, a direção de arte da via B, onde vale. Descrição solta
  depois de "·" é reconhecida por um vocabulário CURTO e fechado (foto,
  print, card, gráfico, anotação, chip, logo…) — ampliá-lo começaria a
  comer copy legítima, e o que sai dali não some do documento.
- **Campo errado some da tela**: capa e CTA desenham `subtitulo`, o meio
  desenha `corpo`. **A imagem só entra onde há slot** (capa, texto, prova,
  lista, mec — `dado` e `cta` não desenham foto, o mesmo limite da via B) e
  o que fica de fora é DITO no toast. A copy nunca é cortada: o canvas
  encolhe e os campos acima do limite são reportados para revisão.

O mesmo clique guarda a FORMA em "Meus templates" (`estruturaDaReferencia`,
dedupe por nome) — é o outro sentido de "transformar em modelo": um pede a
peça pronta para editar, o outro pede a sequência para escrever de novo.

*Verificado renderizando* a referência REAL do banco (os 5 slides do "8%
dos clientes fazem 41% do faturamento") no Chromium: `capa → texto → prova
→ texto → texto`, CTA "Comente MÉTODO", nenhuma imagem sem lugar e um
campo longo sinalizado. Os três slides `dado` da transcrição viraram
`texto` pela régua acima — no rótulo original teriam saído com a frase
espremida no lugar do número.


## Relatório e dashboard: o período era decorativo (set/2026)

Dois sintomas relatados juntos — "gerar relatório dá **Erro de rede: Failed
to fetch**" e "no dashboard, filtrar outra data que não seja 30 dias não
sincroniza". Medido no banco antes de escrever qualquer linha, e são quatro
defeitos independentes, todos silenciosos.

**1. O relatório de um dia trazia o histórico da conta.** A régua da
plataforma está na documentação da Reports API, na letra: *"Results are
grouped by the date a campaign was **sent** … This matches how Omnisend
in-app reports work."* O `report-builder` aplicava esse corte; o
**snapshot do relatório não**. Medido na Blessed Choice para 09/09 a
09/09: **78 campanhas** gravadas sob o rótulo do dia, **75 delas enviadas
fora dele** (a mais antiga de 15/04), somando **3.751.247 envios** — e o
snapshot publicou **872.858 envios com 2,5% de abertura** para um único
dia. O número não era "um pouco a mais": o `delivered` de quem está fora
da janela é o total HISTÓRICO daquela campanha, então o relatório falava
de outro assunto. `lib/reports/periodo.ts` (puro, 17 testes) é a régua
única — `campanhaNoPeriodo` exige envio DENTRO da janela, e **campanha
sem data de envio fica FORA**: assumir que é do período é exatamente o
erro que trouxe abril para setembro. Aplicada nos dois lados que o
snapshot lê (o cache, cuja query agora filtra no SQL com um dia de folga
só para o `limit` não descartar borda, e a lista da API). **Flows não
entram nessa régua** — são contínuos, não têm data de envio, e filtrar
por ela apagaria todos.

O corte é por **"não enviou"**, não por "não é `sent`", e quem ensinou
isso foi o dado: das três campanhas de 09/09, a das 18h estava `started`
— no ar naquele instante, 35 entregues até o snapshot. Exigir `sent`
faria a campanha do próprio dia sumir do relatório daquele dia, em
silêncio, enquanto os envios dela existem e são do período. Só
`scheduled`, `draft` e `cancelled` ficam fora (nunca enviaram nada);
status desconhecido decide pela data, porque inventar exclusão sobre um
nome que não conhecemos apaga dado real. Medido no mesmo relatório:
**de 872.858 envios com 2,5% de abertura para 139.525 com 12,04%** — as
três campanhas do dia, numa base de 100 mil leads.

**2. O relatório NASCIA e a tela dizia erro.** O de 09/09 está no banco,
gravado às 20:19:23, com o alerta na cara do usuário. O insert acontece
antes da resposta, então "a conexão caiu" nunca significou "não foi
criado" — e a tentativa seguinte batia em *"já existe um relatório para
Setembro 2026"*, sem explicação. A causa é uma incoerência de orçamento:
os endpoints consumidos declaram `maxDuration = 300`, a rota que os
consome declarava **120**, abortava cada fetch em 75s e ainda chamava a
Reports API per-campaign **sem relógio nenhum** — perto do teto o runtime
matava a função depois do insert. Agora o teto é o mesmo dos consumidos,
o fan-out roda com **orçamento declarado** (`budgetMs`, 210s dos 300) que
cada etapa consulta antes de gastar, plataforma sem credencial não é
consultada (a loja não tem Shopify e o fetch saía assim mesmo), e o
pre-check de duplicata subiu para **antes** do snapshot — descobrir no
fim que o relatório já existia gastava o fan-out inteiro para responder
409. No cliente, `AbortController` com teto próprio e, em falha de rede,
**a tela pergunta ao servidor se o relatório nasceu** antes de acusar
erro.

**3. O período nunca foi validado.** O Zod exigia "string não vazia": 30/09
→ 01/09 passava e gerava um snapshot vazio sem dizer por quê.
`avaliarPeriodo` recusa invertido, futuro e janela longa demais, e
**aceita HOJE com aviso** — a documentação diz que só a última hora
FECHADA está disponível, então o dia corrente é legítimo e parcial ao
mesmo tempo. Os avisos viajam no snapshot (`period_notes`): quem abrir o
relatório meses depois precisa saber que o dia ainda estava em andamento
quando ele foi tirado.

**4. "Não sincroniza" era literal.** Três causas somadas: (a) o chip de
1 ano mandava `period=1A`, rótulo que **nenhum mapa de período conhece**
(`PERIOD_DAYS[...] ?? 30`) e que o CHECK `valid_period_label` recusa —
selecionar 1 ano mostrava trinta dias e não gravava nada; **zero linhas
`12m` em produção** confirmam que esse filtro nunca funcionou. A tela
continua escrevendo "1A", quem viaja é `12m`. (b) O botão de sincronizar
rodava **30 dias fixos** e apagava o cache de TODOS os rótulos: quem
estava em 7 dias, 90 dias ou num período personalizado via o seu cache
ser apagado sem ser reposto. Agora a rota aceita o período, limpa só o
que vai repor, e existe um **"Sincronizar período" ao lado do seletor** —
é ali que o usuário está quando percebe. (c) `force_refresh=true` era
aceito, documentado e **ignorado** no ramo Omnisend de campanhas e flows:
quem pedia dado novo recebia cache de até 35 minutos. Como o relatório
pede `force_refresh`, é isso que o fazia cair no caminho cacheado, onde
`deliverability` é null — e sem ela o snapshot soma linhas em vez de usar
os agregados send-date da Reports API. Junto veio um quarto: os flows
normalizavam o rótulo **sem as datas**, então período personalizado era
lido sob "30d" (o fallback defensivo) e o cache de trinta dias respondia
a pergunta de outro período.

**Granularidade tem teto, e passar dele falhava calado.**
`fetchOmnisendCampaignReports` pedia `granularity: "day"` sempre; a
Omnisend aceita no máximo **60 dias** nessa granularidade e devolve 400
acima disso, que morria num `catch` — relatório de 90 dias ficava sem
receita por campanha e nada aparecia em tela. `granularidadeParaJanela`
escolhe pela largura, e **`byDate` só é preenchido em granularidade
diária**: acima disso o timestamp é o início da semana ou do mês, e casar
a campanha pelo dia do envio contra esse bucket produziria atribuição
ERRADA — pior que nenhuma, porque a estimativa proporcional ao menos se
declara estimativa. No mesmo eixo, o offset do range custom do sync vinha
de `getTimezoneOffset`, que pergunta o offset de AGORA: relatório de
janeiro gerado em julho saía uma hora deslocado na Europa e a receita
migrava de dia. Agora é `offsetForTimezone`, por ponta e pela DATA.

## "Sincronizar agora" recusava a carteira inteira (set/2026)

Relatado com print: o dashboard em 9–9 set diz *"1 de 54 lojas com
receita"*, clicar em **Sincronizar agora** carrega, dá erro e a receita não
vem. Medido no banco antes de mexer em código — e o erro estava gravado, em
português, em `store_revenue_summary.sync_error`:

> `Omnisend não suporta range retroativo (janela é relativa a hoje)`

**A afirmação é FALSA.** `syncOmnisendForStore` aceita `startDate`/`endDate`
desde sempre e o builder de campanhas já os passa — a rota do dashboard é
que nunca passou, e recusava a loja sem tentar. Como **as 54 lojas da org
são Omnisend** (zero Klaviyo), isso recusava 100% da carteira em todo
período personalizado. É o mesmo padrão do comentário "Omnisend não expõe
currency via API": uma afirmação errada que virou lei porque ninguém foi
conferir. Agora a janela viaja explícita (`janelaDoPeriodo` +
`omnisendDateRange` no fuso da loja) e período retroativo é um período como
outro qualquer.

**"Hoje" tinha fuso errado**: a checagem usava `new Date().toISOString()`,
que é o dia em UTC. Depois das 21h de Brasília já é o dia seguinte lá, então
o período de HOJE também virava "retroativo". `hojeNoFuso` resolve, e um
teste fixa o caso das 21h30.

**Uma passada nunca cobriu a carteira.** Cada loja é um sync completo da
plataforma; 54 em SÉRIE, com 1s de pausa entre elas, não cabem nos 270s de
prazo — o loop parava na primeira e as outras 53 nunca eram tentadas. Era a
segunda metade do "1 de 54". Agora o lote roda em paralelo com teto
(`comLimite`, 5 por vez — as chaves são por loja, então o limite de
requisições da plataforma é por conta e não impede o paralelismo), começa
por **quem não tem dado** (loja sem linha é buraco no total; dado de ontem é
só imprecisão) e devolve `storesPending` — o cliente encadeia passadas até
zerar. Régua em `lib/dashboard/refresh-lote.ts` (puro, 13 testes).

**O erro nunca chegava à tela.** O hook não conferia `res.ok` — um 500 caía
no caminho de sucesso e revalidava os mesmos números, que é exatamente o
"carrega e não puxa a receita" — e o `catch` só fazia `console.error`. Agora
a causa real aparece no banner, e o teto de espera do cliente subiu de 60s
para os 290s que a rota declara.

**3,83 milhões de envios num único dia** era o mesmo defeito do relatório,
noutro caminho: `getUnifiedCampaigns` traz todas as linhas do rótulo sem
olhar `send_time` — nem selecionava a coluna. Medido: **3.751.247 envios e
6,07% de abertura** (o "6,1%" que aparecia na tela) contra **139.525 e
12,04%** com a régua. Corrigido na função, que já recebe o `periodLabel` e
portanto sabe a janela — as cinco rotas do dashboard que a consomem herdam
a correção.

**O lock do sync colidia entre períodos do mesmo tamanho**: a chave era
`storeId:periodDays`, então dois personalizados de UM dia (09/09 e 08/09)
compartilhavam o dedupe e o segundo recebia o resultado do primeiro — dado
de um dia publicado sob a data de outro, em silêncio. A janela entrou na
chave.

**O gráfico diário de um período de um dia não existe** — há um ponto só e
nada a ligar. A tela mostrava "Sem pontos na janela … se ambos são 0, o
sync de campanhas não grava send_time", culpando o sync com 45 campanhas
daquele dia no banco. Agora ela diz que o período é que não rende série.

### A rodada seguinte (set/2026): o que a correção expôs

Medido depois do deploy: de **1 linha** para **41 lojas `ok`, todas com
receita**, e o erro "range retroativo" sumiu do banco. Sobraram três
defeitos que só apareceram com o lote finalmente rodando.

**Cada passada re-sincronizava a carteira inteira.** O lote era
`planoDeLote(stores, stores.length)` — todas as lojas, sempre —, então o
segundo clique atropelava o primeiro e a plataforma, que limita **por
conta** (10/min nas analytics), começava a recusar. Era o contador subindo
sozinho a cada rodada: **2 → 3 → 5 lojas "com erro"**. Agora quem tem dado
FRESCO do período (`FRESCOR_MS`, 10 min) sai da fila — buscar de novo não
traz número diferente e gasta cota. Loja com ERRO entra mesmo fresca: é
justamente ela que pode ter sido vítima do limite na rodada anterior.

**"Statistics API unavailable" era suposição, não medição.** A régua era
`revenueCollected = tudo zero → falhou`, e o `safely` devolve o mesmo
fallback quer a chamada tenha falhado, quer a API tenha respondido zero.
Num período de UM DIA zero é rotina: das 9 lojas marcadas assim, todas
estavam zeradas e são pequenas — **Bryn Grill tem 5 leads na base inteira**
—, e o `total_leads` das nove foi coletado, o que prova que o sync
funcionou. A tela anunciava "9 lojas não sincronizam" sobre lojas que
sincronizaram bem. Agora `OmnisendSyncData.statisticsOk` diz se a CHAMADA
respondeu (sentinela comparada por REFERÊNCIA — a mesma constante só volta
quando o fallback foi usado), e só a falha real preserva a linha antiga e
marca `partial`. **Zero medido é gravado**: sem isso a loja que não vendeu
naquele dia carregaria para sempre a receita de outro período.

**Os cards subiam sozinhos, sem nada dizendo que estava carregando.** Com
o lock do servidor ativo o cliente recebia `alreadyRunning` e SAÍA do
loop: `isRefreshing` voltava a false, o banner sumia e o servidor seguia
trabalhando — os números mudavam na cara de quem olhava e o topo dizia
"Atualizado agora". Agora ele espera o lock (`ESPERA_LOCK_MS`) e continua,
mantendo o indicador e a fila à vista enquanto o lote não fecha.

## Dashboard: o clique em sincronizar e o custo de carregar (set/2026)

Sintomas relatados em sequência — "clico em sincronizar e ele não
sincroniza e para de sincronizar", "mesmo re-sincronizando ainda deixa
loja sem sync", "a taxa média não atualiza com base na data selecionada".
Sete causas independentes, todas invisíveis, todas medidas em produção
antes de qualquer linha de código.

**1. A função morria com o cadeado na mão.** `cron_locks` tinha dois
locks com `is_running = true` e `finished_at` ANTERIOR ao `started_at` —
a marca de quem foi cortado no meio. O deadline só era conferido ANTES de
iniciar cada loja: uma que começasse em 269 s e levasse 60 s terminava em
329 s, além dos 300 s da Vercel, e o `finally` que solta o lock nunca
rodava. O lock então segurava o período por 5 minutos. Deadline para
195 s e teto por loja.

**2. Esperar o lock consumia o orçamento de passadas.** Cada volta caía
em `alreadyRunning`, esperava 6 s e gastava uma das 6 passadas: 36 s
depois o loop saía com `restam = 0` e **sem erro**. A espera deixou de
contar como passada (teto de 6 min) e, esgotada, DIZ que outra
sincronização está em andamento.

**3. Uma falha abortava o encadeamento inteiro** — o `try` envolvia o
`for`. Agora o tratamento é por passada; passada que dá certo limpa o
erro da anterior (senão a tela acusava falha numa sincronização que
completou).

**4. O banner "Desatualizado" era matematicamente inatingível.** A idade
do dado é a da loja MAIS VELHA e uma passada só cobria parte da carteira:
27 lojas às 14:40 e 25 às 16:00 — o mais antigo ficava 1 h 20 atrás,
sempre acima do limite de 1 h. Como `needsSync` dispara auto-sync a cada
abertura do dashboard, era esse sync automático que segurava o lock
quando o usuário clicava. **Uma passada tem de cobrir a carteira**:
concorrência 5 → 18 (54 lojas em 3 ondas, ~144 s dentro dos 195 s, com
folga de 25%; o teste do módulo reprovou o palpite de 12) e frescor 10 →
45 min, alinhado ao `ADMIN_STALENESS_MS` da tela — re-buscar loja que a
tela já considera fresca não muda o veredicto e gasta a cota que falta
para as velhas. `partial` passou a contar como dado INCOMPLETO (peso de
falha): no fim da fila, as 5 `partial` seguiam carimbadas às 14:40 com as
`ok` já refeitas às 16:03.

**5. O teto por loja virou o novo "não sincroniza".** Fixo em 90 s, ele
marcou como `error` três lojas grandes que sincronizariam bem com mais um
minuto — "demorou" virando "não sincroniza" na tela. `tetoPorLoja` é **o
que resta da função** (piso de 90 s): com a fila curta, porque as frescas
saíram do plano, as poucas lentas recebem quase todo o orçamento.

**6. A "Taxa média Convertfy" ignorava a data.** `kpi-series` lia só os
quatro rótulos fixos e o cliente só a chamava neles, sem `start`/`end` —
a única das nove rotas que não passava a janela. Em range personalizado a
chave do SWR virava `null` e o card seguia com o número da última janela
fixa. Agora o período selecionado é lido junto com os quatro, e **sem
faturamento bruto no período a taxa é `null`** ("—"), nunca `0`: zero se
lê como "o email não trouxe nada" quando a verdade é que a base não foi
sincronizada.

**7. O GET escrevia na tabela que o realtime observa.** `total-revenue`
renovava `expires_at` a cada leitura com cache velho: **37.639 chamadas e
391 s de CPU** no `pg_stat_statements`. `store_revenue_summary` está na
publication e o dashboard assina — cada escrita acordava todas as abas,
que revalidavam as nove rotas, e a leitura escrevia de novo. Rodava
sempre, porque `isStale` era permanentemente verdadeiro (causa 4). Quem
dependia do carimbo era `/api/stores/control`, que passou a medir a IDADE
do dado (`fetched_at`, 7 dias): **validade é idade, não um carimbo que
alguém precisa renovar**.

**Custo de carregar.** O fallback de polling virou um timer reagendado
com backoff 30 s→5 min e jitter, parado em aba oculta — cada disparo
revalida as nove rotas, então 30 s fixos eram 18 requisições por minuto
por aba, e o realtime-js reconecta em intervalos fixos sem jitter (todas
as abas voltavam juntas). E `plataformasPresentes` (puro, 5 testes)
impede o dashboard de perguntar pela plataforma que a org não usa: com 54
lojas Omnisend, nenhuma Klaviyo e `klaviyo_campaign_metrics` com ZERO
linhas, três rotas varriam uma tabela vazia a cada carregamento
(`ops-series` quatro vezes — o fallback roda em duas janelas). Lista sem
as colunas devolve as DUAS plataformas, não nenhuma: select degradado
concluindo "nenhuma" faria a tela mostrar zero achando que mediu.

**Auditoria do resto do dashboard, rota por rota** — quatro defeitos do
mesmo feitio: o número aparecia completo e não era.

*O PostgREST corta em 1.000 linhas sem avisar* (HTTP 200, e `.limit()`
maior não resolve — o teto do servidor vence). O trend por loja lia
`store_daily_metrics` sem paginar: com 63 lojas × 90 dias são ~5.670
linhas, então **dois terços da janela sumiam** e metade das lojas ganhava
uma seta calculada sobre outro pedaço de tempo. `unified-metrics` — o
serviço de que as CINCO rotas de campanha/flow dependem — não paginava
nem ordenava, com 5.734 linhas na tabela. `lerPaginado`
(`lib/supabase/paginar.ts`, puro, 6 testes) devolve `truncado` em vez de
calar; erro no meio entrega o que veio, marcado, em vez de derrubar o
card por causa da última página. **A ordem é o que torna a paginação
correta**, não um detalhe: `.range()` sobre consulta sem ordem TOTAL
repete e pula linhas — daí o desempate explícito (`store_id` +
`campaign_id`/`flow_id`; `metric_date` + `store_id`, porque com uma linha
por loja a data não é única).

*"Valor do pipeline" somava o histórico inteiro*: o filtro era `stage_id
not is null`, que não seleciona negócio ABERTO — seleciona negócio que
TEM etapa, ou seja todos, ganhos e perdidos incluídos. Um número que só
cresce e nunca fecha com o funil.

*Taxa sem denominador saía `0%`*, em oito lugares de `email-performance`
(mais seis por loja na auditoria). Num período sem envio o card publicava
"Open Rate 0,0%" e "Deliverability 0,0%" como se tivesse medido — 0% se
lê como "saiu e ninguém abriu". Agora é `null` e a tela mostra "—"
(`fmtPct` já tratava; `csvNumber` exporta célula vazia).

*Barra com largura inválida no caso vazio*: `parte / total` com total
zero dá `Infinity`/`NaN`, e o browser DESCARTA `width: NaN%` — a barra
some sem erro nenhum, justamente no caso vazio, que é quando alguém está
olhando para entender por que não há dado.

De passagem: três `<a href="/admin/...">` viravam recarga completa da
página (e recarregar o dashboard refaz as nove requisições) — agora
`<Link>`.

**Risco latente declarado**: seis rotas leem `client_stores` com
`.limit(500)`. Com 63 lojas hoje sobra folga, mas acima de 500 o corte
volta a ser silencioso.

**Cache HTTP foi avaliado e RECUSADO** para estas rotas: o dashboard
precisa refletir a sincronização no instante em que ela termina, e um
`max-age` faria o browser servir a resposta antiga justamente no
`revalidate` disparado depois do sync — economia paga com o defeito que
esta rodada inteira existiu para consertar.

## Moeda estrangeira somada como real, e "loja sem sync" que vendeu zero (set/2026)

Duas queixas na mesma tela: "ainda tem 10 lojas sem sync mesmo clicando
em sincronizar" e "o valor de campanha está muito baixo perto da
realidade". Nenhuma das duas era o que parecia.

**As 10 lojas tinham sincronizado.** `storesWithRevenue` conta
`totalRevenueBRL > 0` e a tela escrevia "45 de 54 lojas com dado até
agora": as 9 que faltavam sincronizaram com sucesso e faturaram **ZERO**
naquele dia — loja pequena sem venda. Medido: 54 de 54 `ok`, 45 com
faturamento bruto; o "45/54" era exatamente a contagem de quem vendeu. O
banner então dizia "o cache está incompleto, os cards podem mostrar menos
do que o real" sobre uma carteira inteira sincronizada, e o operador
clicava em sincronizar para sempre. **Faturamento zero é MEDIÇÃO, não
lacuna**: a rota expõe `storesSynced` (linhas sem erro) e a tela separa as
duas contagens ("N de M sincronizadas, K com faturamento no período").

**Três caminhos somavam moedas diferentes sem converter** e publicavam o
total com "R$" na frente. Uma libra entrando como um real subestima ~7×,
um euro ~6×, e **o total continua parecendo plausível** — é o que faz esse
defeito sobreviver, e foi o que a suspeita do usuário pegou:

- `getEmailDailySeries` (a série do gráfico "Receita atribuída") lia
  `store_daily_metrics` **sem selecionar `currency`** — a coluna existe e
  é gravada pelo próprio serviço, no upsert, algumas linhas acima.
- O fallback por campanhas do mesmo gráfico somava `conversion_value` cru.
- `email-performance` idem, e o **RPE** do card sai do mesmo número.

`lib/money/converter-lote.ts` (puro, 6 testes) converte **uma vez por
MOEDA**, não por linha: são poucas moedas distintas e milhares de linhas,
e `convertToBRL` já tem cache de três camadas. Moeda estrangeira sem taxa
entra na moeda ORIGINAL em vez de virar zero — perder a linha deixaria o
total menor ainda, e sem nada dizendo que faltou; `moedasNaoConvertidas`
existe para a tela poder declarar.

**Os cards de Receita Atribuída/Campanhas/Automações NÃO eram afetados**:
`total-revenue` já convertia as quatro somas por loja. Se o número deles
parecer baixo, o eixo a investigar é a **moeda gravada** em
`client_stores` (loja europeia marcada BRL converte por 1 e subestima na
mesma proporção) — `/admin/tools/currency-audit` mostra a procedência, e
`fxDegraded` só acusa câmbio que FALHOU, nunca moeda errada.

**A moeda vinha do CACHE, não do cadastro** (relato: "o dólar da Blue Wolf
não bate"). A matemática estava certa — `valor / rates[moeda]`, com o `rate`
do tooltip invertido para reais por unidade, que é como se confere. O que
estava errado era a MOEDA: `store_revenue_summary.currency` é um SNAPSHOT
que o sync copia de `client_stores` e nunca revisita. Corrigir a moeda no
cadastro NÃO reescreve as linhas de cache já gravadas, então a tela seguia
convertendo pela moeda antiga até alguém re-sincronizar aquele período — e
nada dizia que as duas discordavam. `stores-overview` era o pior caso:
`rev?.currency || s.currency` preferia explicitamente o cache.
`moedaDaLinha` (`lib/money/moeda-da-loja.ts`, puro, 5 testes) inverte a
precedência — cadastro > cache, sem cadastro o cache vale (foi copiado de um
que existia) — e **declara a divergência**: `currencyStale` vira o selo
"moeda ⚠" na tabela de lojas, com o de/para no title. Converter pelo valor
certo ainda pode estar errado no sentido oposto (o número foi gravado por um
sync que acreditava na outra moeda), então o aviso importa tanto quanto a
correção.

**Como auditar a conversão, na tela**: passar o mouse sobre qualquer valor da
tabela "Saúde das Lojas" abre a conta inteira — `US$ 7.400,00 × 5,3850 =
R$ 39.849,00 · cotação de 09/09/2026`. `/admin/tools/currency-audit` mostra a
PROCEDÊNCIA da moeda de cada loja (`nunca-conferido` ≠ OK) e o fuso.

**Pendência declarada**: `total-revenue` e `kpi-series` convertem com
`convertToBRL` (taxa de HOJE), não com `convertToBRLOn` (taxa do dia do
período). Para uma janela recente a diferença é pequena; para 90 dias, não.

## O número do relatório não batia com o painel (set/2026)

Relatado com print: a Blue Wolf publicou **US$ 51,5 mil** de receita
atribuída em agosto contra **$51.176,38** no painel do Omnisend, e
faturamento total **US$ 214,1 mil** contra **$213.193,59**. Perto o
bastante para parecer certo, longe o bastante para não fechar com nada.

**A API foi medida antes de escrever código** (conta Treuquell, via MCP,
agosto/2026) — e três afirmações que viviam em comentários deste
repositório estavam ERRADAS:

- **`month` e `day` somam IGUAL** (21.844,93 nos dois; `week` também).
  O comentário do sync dizia que bucket diário "conta pedidos a mais na
  virada de dia" e era por isso que a granularidade era `month`.
- **Buckets são RECORTADOS pela janela**: 15/08→05/09 devolve 244
  pedidos em agosto, não o mês inteiro.
- **Offsets misturados entre `from` e `to` não inflaram nada**, ao
  contrário do "+56 na Clube Rock" registrado no código. `to` é
  exclusivo de verdade (31/08 tira exatamente o dia 31), e o campo
  `interval: "custom"` é ignorado pela Statistics API (ela não o tem).

Ou seja: **a plataforma responde de forma consistente; a divergência era
nossa.** Duas causas, ambas silenciosas.

**1. Gerar UM relatório disparava TRÊS syncs completos da mesma loja.**
`fetchSnapshotSources` chamava `report`, `campaigns` e `flows` em
paralelo, os três com `force_refresh=true`, e cada um roda um
`syncOmnisendForStore` inteiro — 3 chamadas de analytics cada. **Nove
chamadas na mesma chave, contra um limite de 10/min e 55/dia por
brand.** O singleflight (`activeSyncs`) não protegia: cada `fetch` é uma
invocação serverless separada e o `Map` vive na memória de um processo
só — as três nunca se enxergam. Agora o `report` roda sozinho com
`force_refresh` (ele já persiste em `store_revenue_summary` +
`omnisend_campaign_metrics` + `omnisend_flow_metrics`) e campanhas/flows
leem o que ele acabou de gravar; se o `report` não voltar, os dois
pagam o refresh em vez de servir número de outra rodada. Três chamadas
no total, e os três blocos passam a falar do MESMO sync — antes eram
três syncs independentes que podiam divergir **dentro do mesmo
relatório**.

**2. Sem a Reports API, o atribuído sai por outro eixo — e era publicado
sem marca.** Só o número CALIBRADO pela Reports API (send-date) bate com
o painel; sem ela o sync cai no Statistics (event-date), que fica acima.
O código **já sabia** — havia um `log.warn` dizendo que ali o valor
"pode estar ~2x inflado" — e gravava assim mesmo, sem nada em tela, em
banco ou no relatório distinguindo esse número do bom. Como a etapa
falha justamente quando o limite estoura (causa 1), o mesmo relatório
dava números diferentes a cada geração.

`procedencia.ts` (puro, 12 testes) nomeia isso: `procedenciaDoAtribuido`
devolve o agrupamento (`send_date`/`event_date`), se ele
`comparavelComOPainel`, e declara quando o percentual mistura os dois
eixos — que é o caso do slide "24,07% do faturamento veio da Convertfy",
atribuído por data de envio sobre total por data do pedido. A
documentação da Omnisend proíbe essa mistura na letra ("Never combine
attributed revenue from post_analytics_reports with total revenue from
this API"); ela **não é corrigível somando melhor** — é para ser DITA. A
procedência viaja no `revenue.attribution` do relatório e fica congelada
em `snapshot.atribuicao`, como `period_notes` já fazia com o período.

**`safely` deixou de engolir a causa.** Ele captura rate limit e segue
com o fallback — correto, um endpoint não pode abortar os outros — mas
seguia **sem registrar**, e a tela dizia "A plataforma não respondeu às
estatísticas desta janela. Clique em sincronizar de novo". As ações são
OPOSTAS: num 429, insistir queima o resto da cota diária e atrasa a
liberação. Agora cada degradação carrega `causa`
(`limite_da_plataforma` × `falha_na_chamada`) e `liberaEmMs`, e
`mensagemDaDegradacao` escreve o texto certo — o limite vence a falha
comum quando os dois acontecem, e sem prazo informado não se inventa
prazo.

**Auditar deixou de exigir console** (`POST /api/stores/revenue-audit`,
`auditoria-receita.ts` puro, 11 testes): para uma loja e uma janela,
confronta o nosso número com o que a plataforma responde AGORA e mostra
a memória de cálculo — a janela exata enviada (com offset), o fuso do
cadastro contra o fuso da brand (o que o painel usa para cortar os
dias), e o que cada API devolveu. A janela é montada pela MESMA
`omnisendDateRange` da produção: remontá-la aqui faria a auditoria
aprovar uma janela que o sync nunca envia — o defeito circular que a
auditoria de moeda tinha antes de 08/09. O atribuído é confrontado com
a **Reports** API, não com a Statistics: comparar com a segunda faria a
auditoria aprovar justamente o número que diverge da tela do cliente.
Tolerância de 0,1% porque a plataforma reprocessa atribuição entre
leituras, e apontar isso como defeito ensina a ignorar o aviso de
verdade. `causasProvaveis` devolve **lista vazia** quando nenhuma causa
conhecida se aplica — o que é diferente de dizer que está tudo certo.

**Na tela** (`/admin/tools/currency-audit`, botão "Receita" na linha da
loja, só Omnisend — numa loja Klaviyo o botão só saberia falhar): a
janela padrão é o **mês anterior completo**, que é a do relatório
mensal, onde a divergência é reclamada; ela é montada em UTC porque
`new Date(ano, mes, dia)` é local e num fuso a oeste o dia 1 vira o
último dia do mês anterior — a janela sairia deslocada justamente na
ferramenta feita para achar janela deslocada.

*Verificado renderizando* o painel com os números do caso real
(`renderToStaticMarkup` + a régua de verdade): apareceu **"USD 2.267,00"
na linha de pedidos** — contagem formatada como dinheiro, com centavos.
Nenhum teste unitário pegaria, porque o número estava certo. Daí
`Divergencia.unidade`: contagem sai sem moeda e sem decimal, e **não tem
"quase igual"** — a tolerância de 0,1% existe para o centavo que a
plataforma reprocessa entre leituras, e aplicá-la a pedidos esconderia
um pedido a mais.

**Continua em aberto**: a divergência da Blue Wolf não pôde ser fechada
daqui — a chave do MCP é da Treuquell e o MCP do Supabase está
expirado. As duas hipóteses que a auditoria decide num clique são o
fuso do cadastro divergindo do fuso da brand e o atribuído ter saído
sem calibração naquela geração — as duas a um clique no botão
"Receita".

---

## Cores & Botões decide o RITMO, e põe o CTA que falta (set/2026, migration 20261139)

O `color_format` decidia por VALOR e só sabia escrever por valor: `recolor` é
global, então num e-mail em que `#FFFFFF` é o fundo de quatro seções **não
existia op capaz de escurecer uma delas**. As regras de ritmo do guia de cor
(R2/R3/R5/R6) e a inversão do CTA por faixa (C3) eram inexecutáveis com ou sem
prompt novo — faltava ferramenta, não instrução.

**O que o agente recebe agora**: além do inventário de cores (que diz QUANTO
cada cor aparece), `faixas_json` e `ctas_json` — a sequência dos fundos de
seção na ordem da rolagem e cada botão com a faixa em que pousa.
`color-faixas.ts` (puro) cruza `locateBlockRegions` (os marcadores `cfy:block`,
que o runner mantém no documento até a fronteira de saída) com
`backgroundDeclarations` (já na ordem do documento). **Sem marcadores as listas
saem VAZIAS** e o prompt manda não decidir ritmo: deduzir a ordem de um
documento legado é inventar endereço, e op endereçada errado pinta a seção
errada.

**O que ele devolve**: um `plano_de_cor` — `faixas` (por lugar), `botoes`
(recolore um existente), `adicionar` (põe onde falta), `valores` (a
conformidade de sempre), `rodape` e `lacunas`, cada decisão com o seu
`porque`. Não há mais `{"ops":[…]}`: quem traduz é `plano-de-cor.ts`. Prompt
antigo gravado no banco continua funcionando — plano vazio + `"ops"` no texto
cai no caminho legado.

**As armadilhas que os testes travam** (todas apareceram fazendo):

- **`set_fundo` reescreve as DECLARAÇÕES da faixa, não o hex do bloco.** Trocar
  "todo #FFFFFF daqui" repinta o card branco e o botão branco que moram dentro
  dela — e desfaz a inversão que o `set_botao` acabou de fazer, que é o par que
  o C3 exige.
- **`panelFixes` pula ranges de botão.** Botão que colapsa no fundo da faixa é
  decisão (faixa escura + botão escuro invertido), não painel colapsado;
  reerguê-lo para `surface` devolve um retângulo cinza no meio da banda — o
  defeito que a op existe para evitar, refeito pela guarda logo depois dela.
- **A linha do `add_cta` carrega o fundo da faixa.** Ela é IRMÃ da linha que
  pinta o bloco e não herda nada: sem isso o botão pousa no canvas e flutua
  fora da banda. **Nenhum teste de string pega** — foi o render no Chromium.
- **O guard `table_count_changed_by_ops`** derrubaria o step a cada CTA
  inserido (o template embrulha o `<a>` numa tabela). A contagem esperada soma
  `botoesInseridos`.
- **Botão × link**: o `<td>` de 600px que pinta a seção não é fundo de botão.
  Sem a guarda de largura, qualquer link dentro de faixa colorida virava CTA de
  600px e uma op de cor sobre ele repintaria a seção.
- **VML**: `set_botao` escreve no `<td>` **e** no `fillcolor` do `v:roundrect`,
  senão o Outlook segue mostrando a cor antiga — quebra em silêncio, num
  cliente só.
- **`ja_aplicado` ≠ `find_not_found`**: cor que uma op de região já tirou do
  documento é sobreposição benigna, não endereço inventado.

**Adicionar CTA é trabalho DELE** (o nome é Cores & Botões, e a regra da casa é
que todo bloco tem um). Ele escreve o label; **a URL nunca vem do modelo**:
`destino` é um enum (`produto_do_bloco` | `cta_principal` | `loja`) e o código
resolve, com cascata. Sem nenhum destino conhecido o botão não nasce — link
para lugar nenhum é o erro que não se desfaz depois do envio. A curadoria NÃO
mudou: `conflitoDeContrato` continua não eliminando variante sem CTA, porque
eliminar por falta de botão empobrece a escolha (é o erro que já esvaziou uma
peça) e o botão é adicionável depois.

**A oferta é medida contra o FATO**: label que promete desconto com
`incentivoExiste !== true` (`false` OU `null`, a régua do
`oferta_sem_incentivo`) é recusado; label que diz 15% numa peça de 10% é
recusado com os dois números. O agente escreve, o código confere — em vez de o
agente ter de caçar qual cupom repetir.

**O conhecimento entra INTEIRO no prompt** (`color-guia.ts`): o guia de
disposição de cores completo + a doutrina de CTA (as 7 regras do deck do Max,
os princípios de design, e a regra da casa com a precedência declarada — onde
o deck diz 2-3 repetições e a casa diz todo bloco, a casa vence). System de
6.580 → **19.507 chars (~4.877 tokens, US$ 0,015/e-mail)**. Resumir seria
entregar o resumo do resumo.

Junto vai a **alçada**, que é o que impede o modo de falha que este repo já
pagou duas vezes (`momento` e `exige`): o guia é a especificação completa e
boa parte é de outro dono. Ele EXECUTA os passos 1-5 e 7; **registra em
`lacunas`** R1 (a hero vem enxertada), R4 (não há op de gradiente), R7 (o
rodapé é decisão da loja), R8 (não há op de raio), o passo 6 (não recebe
`flow_type`) e o "bloqueia a peça" (ele não reprova nada — o QA decide).

**`color_plano_mode` nasce em `shadow`** (off | shadow | on): o agente decide
tudo, o plano é gravado em `parsed_output` e **nada de faixa ou botão é
aplicado**. Com 4.877 tokens de system num Kimi K3 o risco não é o custo, é a
obediência — e o que se lê no shadow não é "as cores fazem sentido", é se cada
`porque` **cita a regra do guia**. Decisão certa com justificativa vaga
significa que ele não está lendo. Falha de leitura do modo também cai em
shadow: errar para o lado de decidir-e-não-aplicar é barato.

O plano na run é a mudança de auditoria: até aqui a telemetria via o efeito (as
ops) e nunca o motivo, então "por que este e-mail ficou assim" não tinha
resposta.

### O segundo relatório mediu o defeito restante (11/09)

O usuário regerou o relatório da Blue Wolf e o número seguiu em US$ 51,5
mil. Com o MCP do Supabase de volta, deu para medir em vez de supor — e o
que a medição diz elimina metade das hipóteses:

- o snapshot novo (11/09 00:05) **tem** `atribuicao`, ou seja o código já
  estava em produção, e ele diz `bate_com_o_painel: true`: a Reports API
  respondeu e **a calibração aconteceu**. A causa "atribuído sem
  calibração" está descartada para este caso;
- os números exatos: **214.077,62** contra 213.193,59 no painel (+884,03,
  +0,415%) e **51.526,74** contra 51.176,38 (+350,36, +0,685%);
- `client_stores` da Blue Wolf: **`timezone` NULL**, `country = 'US'`,
  `currency_source` NULL — a loja **nunca foi conferida com a
  plataforma**.

**Havia DUAS resoluções de fuso para a mesma loja, e elas discordavam
exatamente aí.** `fusoDaLoja(timezone)` — usada pelo relatório, pelo
dashboard, por campanhas, flows e pela auditoria — devolvia
`America/Sao_Paulo` com `timezone` NULL; `resolveStoreTimezone`, do sync,
caía no mapa por país e devolvia `America/New_York`. O relatório montava
a janela em `-03:00` e o sync a **reescrevia** em `-04:00`; como quem
escreve por último é o sync, o recorte publicado nunca foi o que o
relatório calculou. `resolverFusoDaLoja` (puro, 7 testes novos) é a fonte
única e devolve a **procedência** (`cadastro` | `pais` | `padrao`); o
`country` entra depois do cadastro e antes do padrão porque erra bastante
(53 das 63 lojas estão como 'BR'), mas um país errado ainda é melhor
palpite que ignorar o país de uma loja americana.

**O conserto que faz o número bater sozinho**: o sync já buscava a MOEDA
na plataforma quando ela estava vazia — agora faz o mesmo com o FUSO, e
**antes** de montar a janela, porque é ele que define o recorte. Roda uma
vez por loja (a resposta é gravada com `timezone_source: 'omnisend'`) e,
quando a plataforma não informa fuso, o palpite fica DITO no log em vez
de virar divergência sem explicação.

**Honestidade sobre o que isto explica**: deslocar a janela TROCA horas,
não soma — um fuso errado não produz por construção um excesso nos dois
números. A diferença medida equivale a ~3,1 horas de faturamento médio
(884,03 ÷ 286,55/h), compatível com um deslocamento de algumas horas,
mas **só a comparação com o fuso da conta fecha isso**, e ela exige a
chave decifrada. Quem responde é o botão "Receita", que agora compara o
fuso **USADO** (não o cadastrado — comparar o cadastro diria só "não tem
fuso" e esconderia que o corte saiu em Nova York) com o da conta.

**A chave está cifrada no banco** (`enc:…`, 147 chars), então a API da
Blue Wolf não pode ser chamada nem daqui nem de dentro do Postgres —
tentado com `pg_net`, que existe no projeto e evitaria a credencial sair
do banco: 401/403. O caminho é o botão, que roda no servidor com a chave
aberta.

O fuso da janela passou a viajar no `window` do relatório e a ficar
congelado em `snapshot.janela` — `source: "pais"` ou `"padrao"` é fuso
adivinhado, e quem compara o relatório com o painel meses depois precisa
saber disso pelo mesmo motivo de `period_notes`.

## LeadQualificado não chegava na Meta: o remédio matou o paciente (set/2026, migration 20261142)

Sintoma relatado: o evento **não chega** no Gerenciador de Eventos, nem
pelo botão "testar evento". Medido nos dois lados antes de escrever
código.

**Do lado da Meta** (dataset 694200440166500, via MCP): em 7 dias,
**só `PageView`, 100% `BROWSER`, ZERO `SERVER`**. `ads_get_dataset_quality`
lista um único evento, `PageView`.

**Do lado do banco**: 52 cadastros no formulário, **25 linhas em
`crm_conversion_events`, todas `Lead`, todas `sent`, a última em
05/08** — e **nenhum `LeadQualificado`, nunca**. Entre 06/08 e 29/08,
treze cadastros com lead e **zero** linhas na fila.

**Causa única, provada por SQL**: o índice de dedupe é **PARCIAL** —
`uq_crm_conversion_events_dedup ... WHERE (submission_id IS NOT NULL)`.
O Postgres só infere um índice parcial quando a statement REPETE o
predicado, e o `on_conflict=` do PostgREST manda apenas a lista de
colunas. Toda chamada morria em

```
42P10: there is no unique or exclusion constraint matching the
       ON CONFLICT specification
```

e o enqueue fazia `log.error("enqueue.insert_failed")` + `return`. Nada
em tela, nada na fila, nem o "Lead".

**O remédio anterior é que criou isto.** O `upsert` com
`ignoreDuplicates` entrou justamente para consertar "o lote de eventos
morria junto" (`insert([Lead, qualificado])`, um conflito derrubando as
duas linhas). Ele trocou uma perda ocasional por uma perda TOTAL. E o
`LeadQualificado` nunca existiu porque, até 05/08, o `in` comparava com
`===` cru (o outro defeito documentado acima) — a correção do `===` e o
`upsert` que a anulou subiram na MESMA janela.

**O conserto não depende de migration**: o enqueue insere **linha a
linha**, tolerando 23505 e nada mais. Sem `ON CONFLICT`, o formato do
índice deixa de importar; uma linha que falha não leva a outra junto; e
o log carrega o **código do Postgres** — foi a ausência dele que fez
este diagnóstico custar um mês. `erro-de-fila.ts` (puro, 8 testes) é
quem classifica. A migration 20261142 desparcializa o índice mesmo
assim: o predicado não impedia nada (NULL já é distinto em índice único
btree) e só quebrava `ON CONFLICT` — a armadilha sai do banco em vez de
esperar o próximo.

**A contagem certa não é sobre a fila.** O painel mostrava "0 falhas"
porque contava as linhas que EXISTEM, e o modo de falha era o oposto:
elas nunca nasciam. `cobertura-de-eventos.ts` (puro, 12 testes) mede a
distância entre o formulário e a fila e sobe a lacuna como bloqueio na
tela. A **janela começa no primeiro evento já enfileirado** para aquele
formulário: sem esse corte o mesmo form acusava 27 lacunas, das quais 14
eram cadastros anteriores à integração — alarme falso é como se aprende
a ignorar o verdadeiro. Com o corte, **13**, que é exatamente o número
que o 42P10 comeu.

**O botão de teste mandava payload incompleto e escondia a ressalva.**
Ele montava `action_source: "website"` **sem `event_source_url`** (campo
exigido pela documentação da Meta nesse modo) — diferente, portanto, do
envio real, que sempre teve a URL. Pior: a rota lia a resposta inteira e
**descartava `messages`**, que é onde a Meta escreve "aceitei, mas…", de
modo que um evento aceito e descartado chegava à tela como sucesso
limpo. Agora o teste manda a URL pública do formulário
(`buildCrmFormUrl`), `messages` sobe na resposta, e a tela tem **três**
desfechos — recusado, aceito COM ressalva (âmbar) e aceito limpo.
Pintar o do meio de verde ou de vermelho mentiria igual. O envio real
ganhou o mesmo fallback: `event_source_url` nunca mais é `null`, o que
importa no formulário EMBUTIDO em iframe, que chega sem referrer.

**O que não dá para recuperar**: a CAPI recusa evento com mais de 7
dias, então os 13 cadastros de agosto estão perdidos como conversão —
os leads estão no CRM, o sinal de otimização não.

---

## O laudo da peça: quatro queixas, quatro causas diferentes (11/09)

Relato do usuário sobre a Hero Boxers welcome 1 (batch de 10/09, `ready`,
US$ 3,10): "a formatação da imagem ficou errada", "os ícones ficaram
horríveis", "os CTAs ficaram extremamente pequenos" e "essa cor cinza não
segue em nada o conhecimento de cor". Nenhuma é o Cores & Botões errando —
ele rodou com `color_plano_mode = on`, decidiu 2 faixas (manter nas duas,
citando R3/R5/R6), recoloriu 7 botões, inseriu 3 e registrou 4 lacunas, 17
ops aplicadas e nenhuma recusada. Método: render do HTML entregue a 600px no
Chromium + telemetria das 22 runs.

**Os ícones: o prompt pede e proíbe a mesma coisa.** Os três selos do bloco
`body 3` têm copy no banco ("REAL FIT", "EASY RETURN", "DIRECT BRAND", cada
um com a frase do arco) e natureza `copy_no_desenho` — o texto não tem
endereço no HTML, é DESENHADO dentro da imagem. `buildImageSlots` serve isso
com todas as letras; o mesmo prompt proíbe duas vezes mais abaixo
(`NEVER render any of this text` no cabeçalho de CFY_THIS_FRAME e
`No text, letters, numbers…` nas UNIVERSAL RESTRICTIONS). A proibição vence:
aparece duas vezes, está sob título categórico e é a última coisa lida antes
de gerar. Saíram três círculos de cor sólida — branco, preto e `#B0C4AB`,
exatamente os fundos que a direção da variante nomeia, porque sem poder
escrever aquela foi a única instrução executável. `image/texto-no-desenho.ts`
(puro) SUBSTITUI as duas frases quando o slot pede letra: apagar trocaria
"nenhuma letra" por "qualquer letra" e o modelo escreveria a especificidade
do slot na imagem. A troca é no TEMPLATE, antes de renderizar E de segmentar
(a proveniência compara os segmentos com o enviado byte a byte), decidida
dentro de `buildImagePromptWithSegments` — o ponto por onde os dois caminhos
passam. Vale sobre o template do BANCO sem migration. `Photographic realism`
NÃO é tocado: `copy_no_desenho` também cobre rótulo sobre foto e o schema
não separa os dois casos. O comentário em `build-image-slots.ts:108` já
documentava a METADE disto (o conflito entre `areas_de_texto` e
`texto_no_desenho`); o conflito com o template global sobreviveu.

**Os CTAs: o template não sabia em que peça entrou.** Medido: os três botões
inseridos saíram 152×48, 139×48 e 159×48 com 15px; o nativo da mesma peça
mede 368×59 com 24px, num documento de corpo 24px e título 50px — 41% da
largura e 62% da altura. A causa era constante em `cta-template.ts`, copiada
do template de referência, enquanto `ctas_json` já trazia largura e raio de
cada botão e era lido só para recolorir. `escala-do-botao.ts` (puro) tira
fonte, peso, respiro e raio dos existentes; **só botão PREENCHIDO define a
escala** — dos 7 CTAs do caso real 6 são os "Link Here" do rodapé com 18px, e
a mediana de todos faria o botão novo sair menor ainda. Mediana e não média;
cada dimensão cai para o padrão sozinha; `origem: padrao` quando não há o que
medir. Verificado renderizando: 48px → 67px de altura, a mesma do nativo. A
família passou a sair com pilha de fallback (saía `font-family:Poppins` cru e
webfont não carrega no Outlook).

**O cinza: a régua estava no eixo errado — e a minha primeira versão
também.** Contei quantidade (a letra da R2, "no máximo 3 tons") e a peça
passava: três tons. O usuário corrigiu o eixo: *"seria como se ele
modificasse as duas cores principais da loja, que foram colocadas na
identidade visual; aí se ele ver MUITA necessidade, aí ele coloca outra em
lugares especiais"*. A identidade da Hero Boxers tem EXATAMENTE duas
principais — `#000000` e `#FFFFFF`, zero secundárias — e os fundos saíram
`#FFFFFF`, `#E1DEDE`, `#B1B3B6`, com o preto sem aparecer em seção nenhuma.
Contar quantidade aprova três cinzas estranhos e reprovaria preto, branco e
um acento da marca. `tonsDeFundo(faixas, aceitas)` mede PROCEDÊNCIA: aceito =
paleta cadastrada + os papéis derivados (`bg`, `surface`, `surface_strong`) —
uma loja preto-e-branco precisa de um cinza para separar seções, o que ela
não precisa é de um cinza QUALQUER. **Fundo de seção não é lugar especial**
(é a banda que o leitor atravessa inteira), então qualquer estranho ali é
desvio e a exceção da terceira cor fica para o pontual. A tolerância de 3%
por canal decide as duas coisas e corrigiu uma afirmação minha: `#E1DEDE`
está a 5 de distância do `surface_strong` derivado (`#E3E3E3`) — é o mesmo
cinza e PASSA; o desvio real é só `#B1B3B6`, a 50 de distância, cobrindo o
bloco de produtos inteiro. É o que o agente escreveu na lacuna dele e não
fez ("deveria virar #E3E3E3"): deixou de ser lacuna e virou conta, servida
pronta no prompt e refeita sobre o documento aplicado. **Limite declarado**:
conta fundo de SEÇÃO, não banda interna — a hero tem uma banda preta de
230px que o olho lê como tom e esta conta não vê, porque o container do
bloco é branco e é ele que uma op alcança; contar banda interna faria todo
card colorido gastar um tom.

**O achado que ninguém pediu: um botão que só o Outlook vê.** No bloco `body`
o CTA existe APENAS dentro de `<!--[if mso]>`, escrito `DIGITAL GIFT CARD`
(exemplo de outra peça), com o ramo `<!--[if !mso]>` ao lado VAZIO: o Outlook
mostra um botão de gift card numa marca de cuecas, o resto não mostra botão
nenhum. Era invisível para o extrator — botão em comentário condicional não
existe para o DOM — e foi por isso que o agente leu "bloco sem CTA" e inseriu
um segundo. `extrairCtas` passou a achar o roundrect ÓRFÃO e marcá-lo
`somente_outlook`; ele **não** conta como botão presente, de propósito: o
desenho óbvio (calar a inserção) deixaria o bloco sem CTA para quase todo
leitor e manteria o botão errado no Outlook. Quem esvaziou o ramo não-Outlook
não foi determinado — o caminho é comparar o HTML persistido entre estágios
pelo sha8 encadeado.

**A largura**: o container está em 600px; a exceção é a variante da faixa
cinza, cadastrada em **598px** — a varredura "Largura 600px na biblioteca"
existe para isso e continua sem ter sido rodada nessa variante.

**Selo desenhado por código ficou PENDENTE DE MEDIÇÃO, e o número é o
motivo**: `copy_no_desenho` existe em **uma única variante** da biblioteca
(`body 3`, usada por 2 blocos em 2 e-mails), e os selos são 6 de 524 runs de
imagem em 30 dias — **1,1% de US$ 57,13**. Some-se que SVG não renderiza no
Outlook nem no Gmail: a via "desenhar por código" é PNG composto no servidor,
e as fontes do repo são `.woff2`, que o renderizador não lê. Como a correção
das restrições já destrava o texto, a ordem é gerar um e-mail e OLHAR os
selos antes de construir compositor. As outras duas vias, se a medição
reprovar: selo em HTML+CSS+VML (círculo por `border-radius`, texto central em
HTML — perde o arco) ou PNG composto (preserva o arco, exige embarcar `.ttf`).


---

## A geração seguinte: sete queixas, e o QA já sabia de todas (11/09)

Batch `57bf409d`, Hero Boxers welcome 1, 02:57→03:16 UTC. O usuário
listou: imagem formatada errada, copy com travessão (duas vezes, uma
delas no review), fundo diferente do fundo do e-mail, copy nada a ver e
o CTA mini de novo. Medido run a run e no HTML entregue.

**A correção dos selos pegou.** Três das nove runs de imagem gravaram
`trocasDeTexto: ["never_render","no_text"]` — os selos receberam
permissão de escrever letra e saíram com REAL FIT / EASY SWAP / DIRECT
BRAND. Foi a única frente do laudo anterior que já se pode dar por
resolvida.

**O `copy_fit` morreu na PRIMEIRA chamada** — `resposta vazia de
'anthropic/claude-sonnet-5'; 8000 dos 8000 tokens foram para o
raciocínio; finish_reason=length` — e dos 15 alvos só 3 saíram
corrigidos: os que o código já resolvia antes de qualquer LLM. Os outros
12 foram ao cliente como vieram, com **oito travessões** e 11 campos
acima do limite. Três defeitos empilhados, todos corrigidos:

1. **A regra do `retry-teto` nunca desceu para cá.** Ela foi escrita em
   10/09 para o Seletor e o Estruturador — truncou no teto, a
   retentativa sobe o teto — e o `copy_fit`, que é onde ela fez falta,
   repetia com o MESMO teto. Agora sobe até `max(configurado × 2,
   16000)`. Timeout continua sem subir: a 2ª chamada morreria igual,
   mais tarde, comendo o orçamento das etapas seguintes.
2. **`classificarFalha` não lia a mensagem do erro.** Quem chama do
   `catch` não tem o `InvokeResult`, tem a string — e o truncamento que
   vira `throw` era lido como "ilegível". As três assinaturas
   (`finish_reason=length`, `consumido pelo raciocínio`, `resposta
   truncada`) são NOSSAS, escritas por `llm-invoke` e
   `motivoDaSaidaVazia`, e por isso estáveis.
3. **O que o código resolve não pode cair com o modelo.**
   `socorroPorCodigo` (puro) troca " — " por pontuação e apara excesso
   pequeno, e passa a rodar no `catch` e nos alvos que o modelo não
   corrigiu em duas passadas. Não inventa texto: alvo `ausente` (item de
   lista que o gerador pulou) continua só do modelo — sem ele a linha
   sai do e-mail pelo merge, que é o desfecho certo. O teste que
   afirmava o comportamento antigo ("o traço que sobrevive fica como
   veio") foi corrigido junto: teste que congela o erro é o que faz ele
   sobreviver.

**O CTA mini tinha causa nova.** A escala JÁ era medida (`ctas_json`
trazia `font_size_px: 24, peso: 700` do botão nativo) e `planoParaOps`
JÁ a punha na op — e `apply-patches` montava o botão copiando campo a
campo, sem os quatro campos da escala. O botão nasceu com o padrão da
casa, 15px. É o modo de falha do `usageOf`, de novo: **o que não é
copiado atravessa a fronteira e some**, e os dois módulos puros passam
verdes porque a ponte entre eles é que não tinha teste.

**"Fundo diferente do fundo do e-mail" é o par `bgcolor` × `style`.** O
plano pediu `recolor #E1DEDE → #F2F2F2 where background` e a linha do
botão saiu `bgcolor="#E1DEDE" style="background-color:#F2F2F2"`. Num
e-mail os dois são a MESMA decisão de fundo escrita duas vezes — o
atributo para o Outlook, a propriedade para o resto — e `contextOf` os
separava também na ESCRITA, deixando o documento em dois estados. O
INVENTÁRIO continua distinguindo (lá é informação: o agente precisa ver
onde a cor aparece); quem funde é `mesmoPapelDeEscrita`, só para esse
par. `color`, `border` e `css-var` seguem estritos. Havia um teste
afirmando o comportamento antigo, com a justificativa na linha de cima:
era ele que mantinha o defeito vivo.

**"Copy nada a ver" não é a copy — é o HERO INTEIRO.** A variante
enxertada é de uma peça de SUPORTE: headline "can we help?", botões
"ACCESS MY ACCOUNT" e "VISIT HELP CENTER". O `copy_merge` fechou 44 de
44 slots, mas os dois labels voltaram do n8n IDÊNTICOS ao exemplo
(`de` == `para`) e os hrefs nunca foram preenchidos — os três CTAs do
hero apontam para `URL_DO_SITE_AQUI`, `URL_CTA_PRIMARIO` e
`URL_CTA_SECUNDARIO`, e os quatro ícones do rodapé para `URL_FACEBOOK` e
afins. Esses hrefs não são `{{tag}}` nem `[token]`: **nenhum strip de
placeholder os alcança e nenhum ESP os preenche**, então chegam ao
cliente como clique morto na seção mais importante do e-mail. Virou
check por código (`link_sem_endereco`, high): `enderecoUtil` aceita URL
real, âncora, `mailto:`/`tel:`/`sms:` e merge tag em qualquer dialeto
(`{{x}}`, `*|X|*`, `%%x%%`, `[token]`); o resto é clique morto. O
preheader saiu com `TEXTO_DE_PREHEADER_AQUI` visível, pelo mesmo motivo.

**O QA viu TUDO e o e-mail saiu `ready` assim mesmo.** Em `qa_issues`
estão as 5 issues `high` (o preheader, os dois grupos de links
quebrados, o lorem ipsum do bloco de comparação, o "Link Here"), as 11
de `copy_excede_max_len` e a do review 2 ausente. O gate
`EMAIL_QA_ENABLED` está OFF: ligado, `passed=false` viraria `failed` e
esta peça não teria sido entregue. **A semana de medição que a seção do
laudo previa terminou — o dado está aqui, e o QA acertou em todos os
pontos que o cliente reclamou depois.**

**Fica como worklist de BIBLIOTECA, não de código**: a variante do hero
com hrefs de exemplo e copy de página de suporte; o bloco de comparação
que renderiza o item vazio em vez de ocultar a linha (`[5] dolor sit
amet` chegou ao cliente com o merge em 44/44 — o texto não é slot, é
exemplo sem endereço nenhum); os "Link Here" do rodapé; e a variante em
598px que a varredura "Largura 600px na biblioteca" ainda não alcançou.


### O QA foi LIGADO, e o interruptor mudou de lugar (11/09)

`enforce` está valendo: issue `high` (do agente ou dos checks por código)
reprova a peça — `status: failed`, `failure_reason: qa_failed`.

**O gate saiu do ambiente e foi para o banco** (`email_generation_settings
.qa_mode`, migration 20261141, aplicada). `getQaMode()` lia só
`process.env`, então ligar exigia um deploy da Vercel e desligar, outro —
é o mesmo desenho que `montador_mode`, `seletor_mode`, `blueprint_mode` e
`color_plano_mode` já tinham, e o QA é o mais importante deles.
**`EMAIL_QA_MODE`/`EMAIL_QA_ENABLED` continuam VENCENDO o banco**: é o
freio de emergência que não depende do Postgres responder. Falha de
leitura cai no padrão e loga — errar para o lado de não bloquear é barato;
reprovar geração por migration pendente, não. `resolveQaMode(storeId)` é
chamado UMA vez por peça: ler duas vezes abriria espaço para a mesma
geração usar dois modos.

**Consequência que vale declarar**: a peça de 11/09 teria sido REPROVADA —
e é o desejado. Mas os hrefs de exemplo (`URL_CTA_PRIMARIO` e afins)
moram na BIBLIOTECA, não numa geração: enquanto a variante do hero não
for corrigida, toda peça que a usar reprova em `link_sem_endereco`. O
caminho é a worklist de biblioteca; o atalho, se a produção travar, é
`update email_generation_settings set qa_mode = 'shadow'` — sem deploy.
Sem UI por ora, como os outros quatro gates.

**`copy_fit`: `max_tokens` 8000 → 24000** na linha ativa (o modelo é
`anthropic/claude-sonnet-5`, que gasta o teto pensando antes de
responder). O retry por truncamento continua como rede, com teto ABSOLUTO
de 32.000: dobrar 24.000 daria 48.000, e uma resposta desse tamanho leva
minutos que a fase 2 não tem.

## Conteúdo — os sinais que o ranking lê (set/2026, migration 20261143)

Medido antes de escrever: das 88 mídias sincronizadas, **88 têm alcance e
compartilhamentos** e **69 são reels** — o dado do sinal já estava no banco
e a tela mostrava só o número CRU. Compartilhamento cru esconde justamente
o que o ranking pondera: 10 sends em 500 de alcance vale mais que 20 em
10.000. A base inteira dá **0,551% de sends ÷ alcance** e 3,88% de curtidas
÷ alcance (490 sends sobre 88.895 de alcance).

**Watch time só faltava porque não era PEDIDO.** `ig_reels_avg_watch_time`
entrou no primeiro conjunto de `SETS_VIDEO`; a coluna
`conteudo_ig_media.avg_watch_time_ms` guarda o valor **em
MILISSEGUNDOS**, que é como a API entrega — `segundosDeWatchTime` converte
na leitura. Gravar já convertido esconderia a unidade da origem e o próximo
leitor dividiria de novo.

Regras em `lib/conteudo/metricas/sinais.ts` (puro, 19 testes):

- **`porAlcance` devolve `null` sem alcance, nunca 0** — "0% de sends" se lê
  como "ninguém compartilhou" quando a verdade é que o insight não veio.
- **A razão do período é soma ÷ soma, jamais média das razões por post**:
  média de médias dá o mesmo peso ao post de 50 de alcance e ao de 5.000 e
  descreve uma conta que não existe. Watch time é o oposto — ali a média É
  por peça ("quanto tempo o espectador típico fica"), post sem a métrica
  fica FORA em vez de entrar como zero, e `postsComWatchTime` diz sobre
  quantos a média foi feita.
- **`taxaDeEngajamento` carrega `completa` e a `formula`**: de um
  concorrente só se tem curtidas e comentários, então o número sai
  declaradamente parcial em vez de ser comparado com a mediana de mercado
  como se fosse a mesma conta. `MEDIANAS_DE_MERCADO` nomeia as fontes
  (Rival IQ 0,30% · Socialinsider 0,48%) e `contraMercado` devolve `null`
  sem taxa — dizer "abaixo do mercado" sobre número que não existe é o
  alarme falso que ensina a ignorar o alarme.
- **`colunasDeInsight` traduz nome da API → nome da coluna num lugar só.**
  `ig_reels_avg_watch_time` é o único nome que não serve como coluna, e
  espalhar essa tradução pelo serviço é como a métrica some na fronteira —
  o modo de falha do `usageOf`, que copia campo a campo.

**Na tela**: dois KPIs novos ("Sends ÷ alcance" e "Watch time médio", com a
nota declarando a amostra — `88 posts com alcance`, `média de 12 reels` —
e `—` quando não há), a razão como sub-linha da coluna Compart. (`%alc` no
cabeçalho, `whitespace-nowrap`: sem isso o texto quebra em duas linhas e
engorda as 88 linhas da tabela) e a linha de sinais no drawer do post, FORA
da grade de tiles, porque tile fixo com "—" gasta espaço para não dizer
nada.

**A lista de KPIs passou a ser endereçada por RÓTULO.** A tela fazia
`data.kpis[4]`, e os dois sinais entraram no meio da lista: endereçar por
posição faz o card mostrar outra métrica em silêncio. O comentário "ordem
fixa" saiu do tipo.

**Degradação declarada**: `avg_watch_time_ms` é opcional em `MediaRow`, o
select do dashboard tem retry sem a coluna e o patch do sync a remove
quando o Postgres reclama dela — a migration deste repo é aplicada à mão e
escorrega.

### O watch time nunca teria sido coletado (11/09, medido na Graph API)

A migration, a coluna, o KPI e os 19 testes estavam certos — e o número
ficaria em "—" para sempre. Chamando a API **de dentro do Postgres** com
`pg_net` (a credencial não sai do banco), o primeiro conjunto de
`SETS_VIDEO` devolveu **400**:

> (#100) The Media Insights API does not support the **follows,
> profile_visits** metric for this media product type.

Não é o watch time que a Meta recusa — é `follows`/`profile_visits` para
REELS, e pedir `follows` SOZINHO também dá 400, o que descarta "é a
combinação". Como `ig_reels_avg_watch_time` morava só no degrau de cima,
a escada caía dois degraus e a métrica nunca era pedida.

**A base já provava isso e ninguém tinha olhado**: dos 69 reels, **ZERO**
têm `follows` e ZERO têm `profile_visits`; dos 19 do feed, **19/19** têm
os dois. Um defeito PRÉ-EXISTENTE — a coluna "Seguidores" mostra "—" em
78% das linhas — que a medição do watch time expôs.

**A regra derivada**: *métrica que só existe no degrau mais alto é
métrica que pode nunca ser coletada.* O watch time anda em DOIS degraus
(`SETS_REELS`, em `metricas/sinais.ts` com a medição ao lado), e reels
não pedem o que a Meta declara não servir — gastar a chamada ali é
garantir a queda. O comentário que estava no serviço, *"acrescentar campo
ao primeiro conjunto é seguro POR CONSTRUÇÃO"*, era falso e foi
reescrito: seguro contra QUEBRAR, não contra nunca coletar.

`conjuntosDeInsight(mediaType, productType)` decide pelo **product type
primeiro** (o erro da Meta fala em "media product type"), e
`fetchMediaInsights` devolve o **degrau que respondeu** →
`SyncResultado.insights_degradados`. Sem esse contador, "watch time: 0"
não distingue "a Meta recusou" de "não há reel" — que é exatamente como
a métrica passaria um deploy inteiro sem ser coletada.

**A unidade não é inferida**: a própria API intitula a métrica *"Tempo
médio de visualização de reels (milissegundos)"*. Valor medido 13.212 =
13,2 s num reel curto.

**Backfill feito na hora, pelo mesmo caminho**: 69 disparos, **69
respostas 200**, 69 linhas gravadas. Faixa 4,2 s – 44,4 s, média 10,0 s,
nenhum valor ≤ 0 nem absurdo. O card dos últimos 30 dias mostra
**0,18% de sends ÷ alcance** ("6 posts com alcance") e **9,7 s** ("média
de 5 reels") — conferido do SQL até a string formatada.

**Limitação declarada na tela**: `motivoDaAusencia` explica no `title` da
tabela e numa linha do drawer que a Meta não informa seguidores por
reel. Sem a frase, "—" se lê como "este reel não trouxe ninguém", que é o
contrário do que acontece. Fica em aberto
`ig_reels_video_view_total_time` (também aceito, 4.637.596 ms na peça
medida) — tempo TOTAL assistido, que hoje não coletamos.

## O contrato de decisão do e-mail — semana 1 do plano de set/2026 (14/09)

Batch 6249aef2 (Hero Boxers · Welcome 1, 11/09): 3 de 6 posições contrárias
à decisão do Estruturador, US$ 8,20, reprovado só no QA. As causas eram de
FRONTEIRA entre agentes, não de um agente errando. Plano e execução em
`docs/email-generation/{plano-evolucao,execucao-plano}-pipeline-set2026.md`.

**O incentivo é decisão do FLOW, não do Catalogador** (`objecoes/incentivo.ts`,
puro): `email_outline_templates.coupon_code` diz se o toque entrega cupom;
`coupon_codes[idioma]` (migration 20261144, grade na tela de outlines) é a
tradução, DADO humano; o bloco `coupon` do e-mail sobrescreve por loja.
`existe` é sempre booleano — "não se sabe" deixou de existir, porque foi o
`null` do Catalogador que zerou o cupom de um toque que tem cupom.
`resolverIncentivoDoEmail` (I/O) é a única porta; Seletor, `intent-contract`,
webhook do n8n e fase 2 leem dela. Sem tradução, sai o pt-BR com
`traducao_faltante: true` (aviso, não bloqueio).

**`DecisaoDoEmail`** (`shared/decisao-do-email.ts`, migration 20261145):
alvo + incentivo + insumos + proibições deduplicadas entre idiomas + posições
com `requisitos` + descartes + fio, montada UMA vez no `generate.service` e
persistida em `store_email_blueprints.decisao`. É o que os validadores
comparam. Três gates em `email_generation_settings` (`contrato-mode.ts`,
mesmo desenho do `color_plano_mode`): `auditoria_estruturador` (on),
`contrato_estrutural` (on), `contrato_textual` (shadow).

**Auditoria do Estruturador** (`estruturador/auditoria-requisitos.ts`, puro):
confere os `requisitos` contra o que ELE recebeu — incentivo, capacidade da
biblioteca, seções — e contra o que a normalização descartou. `cupom: "false"`
(string) virava `null` em silêncio e o filtro deixava passar a variante com
cupom exatamente no toque em que o agente tentou negá-lo: agora é descarte
REGISTRADO e dura. Em `on`, dura = retentativa com `<auditoria_anterior>`;
esgotada, `estruturador_incoerente` e a geração PARA — seguir com o outline
montaria a peça sobre a decisão que o código acabou de recusar.

**A eliminação virou filtro** (`elegiveisPorPosicao`): a shortlist do Curador
é a interseção com as elegíveis e nem chama o modelo com ≤ 3 por posição
(`shortlist_fonte: codigo`); o resgate só puxa de elegíveis. O prompt do
Curador parou de contradizer os guards ("cai no template global" — não cai;
"repetir É PERMITIDO" — não é em hero/products); um teste reprova as frases.

**Validadores** (`shared/validadores/`, puros): `escolhas` (requisito ×
contrato da variante; `cupom_sem_incentivo` mesmo com `cupom: null`;
variante repetida em hero/products), `resgate` (anatomia é `high`, redação —
preço, avaliação — é `medium`: a copy compensa), `blueprint` (campo de
oferta OMITIDO por código numa peça sem incentivo — `arbitrarCampos` só
alcançava `cupom: false` explícito), `claims` (oferta com âncora na mesma
janela em pt/en/pl/da: "10% off" é oferta, "10% mais leve" é atributo),
`copy` (callback do n8n, sobre a copy GRAVADA) e `html-final` (por view de
bloco, vira `QaIssue` `contrato_*`). Em `on` a escolha que viola é TROCADA
por código pela próxima finalista limpa — não se repete o Curador, porque
a shortlist já é a interseção e ele devolveria a mesma escolha. `_contrato`
é chave obrigatória nas runs `assembler` e `blueprint` (contrato de
telemetria); `dispositivo` fica em `regra_pendente` até B3.

**Subject lê a decisão** (migration 20261146 troca o prompt do banco — ele
VENCE o in-code, e um teste garante que os dois são o mesmo texto): alvo,
fio, incentivo, insumos e proibições como `upstream`; a saída passa SEMPRE
pela régua de claims; 2ª violação → fallback determinístico (papel da 1ª
posição em 55 chars + fio), nunca a oferta inventada.

**Modelos (14/09)**: 13 agentes de `~anthropic/claude-fable-latest` para
`anthropic/claude-sonnet-4.6`; Seletor, Estruturador e `assembler_chooser`
seguem em Fable (os três que DECIDEM). `max_tokens` intocado. Receita na
seção 14/09 de `TROCAR_modelo_agentes.sql`.

**Cupons traduzidos (14/09)**: os 24 outlines ativos com cupom ganharam
`coupon_codes` nos 14 idiomas além do pt-BR (tradução LITERAL, ASCII, sem
acento — ja/zh/ko usam o inglês) e `coupon_value` derivado do sufixo
(`10%`/`12%`/`14%`/`15%`; ESPECIAL fica NULL). Tabela e SQL rodado em
`supabase/migrations/DADOS_20260914_coupon_codes_traducao.sql`. O código do
outline é o DEFAULT por idioma; a loja sobrescreve pelo bloco `coupon` do
e-mail, e o cupom precisa existir na plataforma dela.

**Pendência declarada**: o reenvio ao n8n em `contrato_textual = on` fica
para depois da leitura em shadow (`DIAGNOSTICO_contrato_textual.sql`).

## Trilha B — gate, lint, dispositivo, tokens, gerador, painel (14/09, migrations 20261147-51)

Seis itens depois da semana 1 do contrato de decisão. Plano em
`.claude/plans` (sessão) e execução em
`docs/email-generation/execucao-plano-pipeline-set2026.md` § "Executado —
Trilha B". O que não pode regredir:

- **B1 · gate de prontidão** (`lib/stores/prontidao.ts`, puro): a loja só
  entra na fila com pesquisa (5 pilares), produtos, paleta com hex, logo e
  fontes; avisos (paleta com dois "principal", política sem página, selos
  vazios, cupom sem tradução, identidade não confirmada) seguem e viram run
  `gate` `success`. Corta no TOPO do `enqueueDispatchJob` (antes do dedup) e
  nas rotas manuais (422 `store_not_ready`; `override_motivo` ≥ 10 chars →
  run `gate_override`). `gate_mode` no banco (`off|shadow|on`), env
  `EMAIL_GATE_MODE` vence. O gate lê a ÚLTIMA identidade, não só a
  confirmada — senão a loja fica bloqueada por um clique esquecido.
- **B2 · lint de envio** (`html/lint-envio.ts` + `html/pos-processador.ts`,
  puros): roda DEPOIS do strip de marcadores e ANTES do QA; 7 regras
  bloqueiam (var(--x), img sem src, href morto, texto de example,
  placeholder [x], contraste, container fora de 600), 8 avisos com auto-fix
  (styles fundidos, vars resolvidas, comentários fora, MSO = anchor, img
  vazia removida, alt, ano, line-height ≥ font-size). `lint_mode`
  (`off|shadow|enforce`, default enforce) no banco; enforce + bloqueante →
  `failed: lint_<id>` SEM chamar o QA. Prints 600/375 (`render_previews`)
  pelo serviço de PNG da casa, fail-open, só com ≥ 25 s de orçamento;
  `next.config.mjs` inclui o Chromium nas rotas que chegam ao runner.
  **O par MSO só sincroniza dentro da janela** (`<![endif]`, `</tr>` ou o
  próximo `<!--[if mso]>`): fora dela o botão do Outlook virava o label
  do bloco vizinho. A régua de largura julga o CONTAINER do documento, não a
  calha 100%.
- **B6 · conformidade** (RPC `email_decisao_vs_entrega(uuid[])` +
  `shared/conformidade.ts`, puro): por posição, pedido × curador ×
  blueprint × montado × entregue, com o nó responsável na PRIMEIRA
  fronteira que divergiu. `escolhas[].block_index` do Curador é índice da
  ESTRUTURA — colapsa sobre `blocks_skipped`, senão a posição resgatada
  aparece como escolha do Curador. Run sem `_contrato` (anterior ao Passo 8)
  é validada RETROATIVAMENTE pelo mesmo `violacoesDaEscolha`.
- **B3 · dispositivo** (`shared/dispositivos.ts`): 22 valores FECHADOS —
  o código não inventa o 23º ("varredura numerada" é pergunta ao dono do
  vocabulário). `conflitoDeContrato` elimina por dispositivo ANTES de cupom/
  cta/itens; variante com `dispositivo` NULL nunca conflita (fail-open) e é
  a auditoria (`dispositivo_sem_variante`) que denuncia. O backfill das 44
  (`DADOS_20260914_backfill_dispositivo.sql`) foi APLICADO como proposta
  reversível; NOT NULL fica para depois da revisão. Lacunas reveladas (zero
  ativas): `products_grade_preco`, `reviews_2`, `body_faq`, `body_passos`,
  `hero_apresentacao`.
- **B5 · tokens de identidade** (`html/identity-tokens.ts`, puro): 11
  tokens resolvidos no `fitFragment` — a MESMA fronteira do
  `neutralizeGutterPadding`, pelo MESMO motivo: montagem e enxerto precisam
  ver o mesmo fragmento. Token sem valor cai no padrão e é REPORTADO
  (`sem_valor`), nunca fica cru (`{{COR_FUNDO}}` num style viraria
  `background-color:;` no strip). `color_format` é pulado (`skipped:
  tokens_de_identidade`) quando todos os blocos são tokenizados; misto → o
  agente só vê os legados (`blocosExcluidos`) e o `recolor` global que
  alcançar bloco tokenizado é DESFEITO por marcador (`preservarBlocos`).
  Paleta = **uma principal, N secundárias** (`lib/stores/papeis-de-cor.ts`,
  decisão do dono em 14/09): o papel por cor (`fundo|texto|destaque|
  superficie`) foi DESCARTADO como cadastro — zero das 10 lojas o usavam, e
  quem decide onde cada cor entra é o agente Cores & Botões. `normalizarPaleta`
  carimba `principal` na primeira primária e desce o excedente para as
  secundárias sem papel; roda no PATCH (que não recusa mais nada) e na
  abertura do editor. O aviso `paleta_dois_principais` saiu da prontidão.
  A derivação por luminância (`color-roles.ts`) cobre fundo/texto/botão
  como antes. Tokenização de variantes existentes
  (`identity-tokenize.ts`, heurística) é DIFF para revisão com prévia nas
  paletas de prova; nada aplicado em produção ainda. `fallbackChainFor`/
  `pesoNumerico` moram em `html/font-fallback.ts` (ciclo de import).
- **B4 · gerador de anatomias** (`gerador-anatomia/`): saída em DOIS blocos
  cercados (```json + ```html — HTML escapado em JSON é onde o modelo erra);
  `validar-anatomia.ts` (puro) reprova pelo lint, largura, tokens (zero hex/
  font-family literal), cobertura example↔HTML pelo casador da PRODUÇÃO
  (`auditVariantCoverage`, só campos de texto; url/image pelo `{{TAG}}`) e
  contrato do dispositivo (`contratoDoDispositivo`, mesma régua do Curador).
  Grava `is_active=false, source='gerada'`, `anatomia_slug` único,
  `geracao_meta` com prévias. Run gravada na loja de REFERÊNCIA (`store_id`
  é NOT NULL nas runs). Rodada inicial de 12 pendente: exige sessão e chaves.
- **Telemetria**: agente novo entra no CHECK de `email_generation_runs`
  (20261147 tem gate/gate_override/lint_envio/gerador_anatomia) E no de
  `email_agent_configs` (20261151) E em `AGENT_VISUAL`/`PIPELINE_AGENT_ORDER`/
  grafo do estúdio — `agent-check-sync.test.ts` reprova o que faltar.

## Semana 2 — a falha nomeada vira e-mail certo (14/09, migration 20261153)

Passos 11, 13, 14, 15 e 16 do plano de set/2026, depois da Trilha B.
Execução em `docs/email-generation/execucao-plano-pipeline-set2026.md`
§ "Executado — Semana 2"; leitura pós-deploy em
`supabase/migrations/DIAGNOSTICO_semana2.sql`. O que não pode regredir:

- **Resgate respeita a decisão** (`resgate-de-posicao.ts`): variante cujo
  DISPOSITIVO (coluna B3) está em `decisao.descartes` custa `Infinity`;
  descarte que nomeia o dispositivo que a própria posição pede é IGNORADO
  (a decisão de referência pede `body_garantias` e o lista nos descartes);
  variante sem dispositivo nunca é eliminada; `preco` custa 40 (anatomia,
  não redação — "o preço entra pela copy" era falso). Sem candidata finita
  o resgate devolve `null`. Hero vazia ou 2+ lacunas = FATAL:
  `ReferenceSource` `"lacuna"` (settled na fila), o `generate.service`
  marca `failed: lacuna_biblioteca` pela fase 1 (`fase1-failure.ts` — o
  primeiro escritor de `failure_reason` antes da fase 2), o dispatch pula
  o e-mail. A lacuna vira proposta no vault na PRIMEIRA ocorrência
  (`MINIMO_POR_TIPO`), chaveada por flow + dispositivo. Decisão do dono:
  ligado direto, sem gate — welcome-1 da Hero Boxers reprova até
  `products_grade_preco` existir na biblioteca.
- **QA recebe a decisão** (`qa-responsavel.ts`): `QaIssue.no_responsavel`
  (seletor | estruturador | curador | copy | imagem | formatacao |
  biblioteca | loja | sistema) atribuído UMA vez sobre a lista final —
  `Record<QaIssueType,…>` obriga dono para tipo novo. `claim_nao_coberto`
  que casa com `insumos_permitidos` (2+ palavras) ou produto da tabela
  viva é descartada por código (`claims_filtrados` na run). Vars
  `decisao_json`/`slot_map_json`; checks `posicao_sem_variante` (high,
  biblioteca) e `traducao_faltante` (medium, loja).
- **Cores & Botões decide com o contrato** (`cta-inventario.ts`): o botão
  de cada bloco vem do `output_schema` (`buildBlockContracts`), a
  heurística `extrairCtas` é verificação — divergência vai à run
  (`cta_inventario_divergente`). `adicionar` só quando o contrato NÃO tem
  CTA e a decisão não o nega. **A cor do botão é do código**
  (`cor-do-botao.ts`): só papéis da paleta, AA 4,5:1 no par, 3:1 contra a
  faixa REAL (a decidida no mesmo plano); ajuste registrado. A pesquisa
  saiu do prompt. Na 2ª falha, `aplicarPaletaPorCodigo` (cor saturada →
  papel; fundo estranho → fundo da loja) em vez de deixar o HTML velho.
  `line-height ≥ 1,1×` também para `normal`/unitless e título sem
  entrelinha (14 correções no HTML de 11/09, não 3);
  `checarReducaoDeFonte` — sem teto absoluto, nunca abaixo da variante,
  no máximo 1,25×. `texto_diff` da hero na run.
- **Payload do n8n com uma voz** (v3.2): `exemplo` que promete o que a
  decisão nega sai (`avaliarClaims`) e vira `directive`;
  `decisao.proibido` deduplicado; `estrutura_geral: null` com alvo;
  `blocks[].campos_omitidos`; callback lê `copy_prompt_version` (ausente
  = aviso na run `copy`). **Sem reenvio ao n8n** (Passo 17).
  `copy_fit`: `apararNoLimite` só em fronteira de FRASE (senão `null` → o
  modelo); a via `ausente` foi REMOVIDA (campo vazio sai pelo merge);
  coluna comparativa que não cabe vai ao modelo com `par` e a instrução
  de manter o lado.
- **Cupom e políticas**: `ShopifyService.graphql` +
  `cupomExisteNaPlataforma` (`discountNodes`; sem token = NOTA
  `cupom_nao_conferido` na run `qa`, nunca issue — nasce INERTE: zero
  lojas com token). `client_stores.politicas` (troca/frete lidos das
  páginas públicas, com URL) é coluna SEPARADA da ficha — captura
  automática não ganha o selo `verificado`; ficha > políticas. Captura
  antes do Catalogador em `pesquisa-completa` (teto 20s, fail-open),
  botão "Ler políticas" na aba Pesquisa, insumo do Seletor com a URL,
  `<politicas_publicas>` no Catalogador, fonte para o gate. `baixarPagina`
  saiu do conector Internet para `lib/ai/web/baixar-pagina.ts` — a régua
  de SSRF é a parte que não pode divergir.

## Sem copy do n8n, o e-mail dá ERRO — nunca é gerado (14/09)

Geração 879fe6e4 (Hero Boxers · Welcome 1, aba Teste): fase 1 inteira
correta, copy despachada às 18:54:59 UTC, **nenhum callback em mais de
uma hora**, status `in_progress`, `html = NULL`. A tela mostrou "só a
hero, com a imagem no lugar errado" — não era um e-mail gerado: o preview
caía em `email.html || renderEmailHtml(email, blocks)`, o renderizador
LEGADO por tipo de bloco, que não conhece `body`/`reviews` e desenha a
hero com a imagem da geração ANTERIOR gravada em `email_blocks.content`.
Decisão do dono: **"se tiver sem copy, ou seja sem uma resposta do n8n, o
e-mail não deve ser gerado, deve dar erro."** Três lugares faziam o
contrário:

1. **Ninguém vigiava o `in_progress`.** O dispatch
   (`dispatchEmailCopyWebhook`) gravava `in_progress` SEM `copy_started_at`;
   o Front 2 do watchdog só olhava `copy_generating` (o status do
   `startOnboarding` legado). O caminho da fila e o da aba Teste ficavam
   fora — callback perdido = e-mail preso para sempre, sem `failure_reason`.
   Agora o dispatch carimba `copy_started_at` (e zera `html_marked`,
   `html_pre_refiner`, `html_pipeline_stage`, `render_previews`,
   `copy_ready_at` — senão o modo Editar abria a peça de 11/09 como se
   fosse a de hoje) e o Front 2 (`failCopySemCallback`) cobre
   `copy_generating` E `in_progress` por `copy_started_at`, mais uma
   consulta de legado por `updated_at` para o que já estava preso sem
   carimbo. Desfecho: `failed: copy_timeout` + run `copy` error
   (`n8n_sem_callback`) + notificação. **Sem cap de `attempts`**: regerar é
   gesto humano.
2. **O remédio do watchdog GERAVA copy sem o n8n.** `recoverStuckCopy`
   claimava para `copy_generating_recovery` e rodava
   `runCopyChainInProcess` (LangChain in-process). REMOVIDO junto com
   `copy-chain-fallback.service.ts`; o status sobrevive no tipo só para
   linhas antigas.
3. **Callback com copy vazia virava `copy_ready`.** A rota marca
   `copy_ready` ANTES de gravar os blocos e, com zero bloco gravado, zero
   caractere ou contrato 100% ignorado (`taxaContrato === 0` com pelo menos
   um bloco COM schema), só fazia `log.error` — a fase 2 renderizava
   placeholder e quem reprovava era o QA, no fim, depois de gastar a fase 2
   inteira. Agora vira `failed: copy_vazia` / `copy_fora_do_contrato` ali,
   com run `copy` error e resposta `{ok:false, motivo}` (200: o n8n não
   deve reenviar). Bloco SEM schema não conta para a taxa — já é
   `merge_sem_contrato`.

**Preview honesto** (`lib/email-workspace/preview-state.ts`, puro, 5
testes): `renderEmailHtml` só para e-mail SEM `generation_batch_id` (flows
legados). Com geração e sem `html`, a ficha mostra um ESTADO —
"Aguardando a copy do n8n desde HH:MM", "Renderizando", ou a falha
traduzida — e o botão Editar fica desabilitado com o motivo.

**Achado paralelo — a régua era mais dura que o pipeline**: a posição 2
(`body_garantias`) ficou vazia porque `conflitoDeContrato` reprovava
body-3 por "tem CTA e a decisão nega CTA", enquanto `arbitrarCampos` já
OMITE o campo de CTA nesse caso. CTA negado deixou de ser conflito de
anatomia (não elimina, não substitui, não veta no gerador); o validador
de escolhas registra `medium` e o resgate segue cobrando 5 de custo.
Cupom negado continua `high` — o example do cupom fica no HTML.

**Pendente (do usuário)**: por que o n8n não respondeu — execuções do
workflow de copy por volta de 18:55 UTC de 14/09 e o log da Vercel em
`/api/webhooks/n8n/email-copy` (4xx = payload rejeitado; ausência = o n8n
nunca chamou). Hipótese: o flow não lê o payload v3.2 (`estrutura_geral:
null`, `directive`, `campos_omitidos`).

## Prefixo estável de verdade, shortlist por excesso, vault por toque (14/09)

Depois da auditoria abaixo, o levantamento do código e da doc da
Anthropic derrubou quatro premissas da análise de custo:

1. **System diferente anula o cache do user.** O cache é hierárquico
   (tools → system → messages); a shortlist tinha system próprio, então o
   breakpoint do user nunca acertava entre as duas chamadas do Curador.
   Agora as duas usam `DEFAULT_CHOOSER_VAULT_SYSTEM` e o que muda vai na
   CAUDA do user (`CAUDA_SHORTLIST_USER` / `CAUDA_ESCOLHA_USER`), depois da
   última marca.
2. **A cadeia de formatação nunca cacheou** — `openrouter-invoke.ts:callOnce`
   mandava o system como string crua. A régua vive em
   `shared/cache-de-prompt.ts` (`modeloComCacheDePrompt`, `blocosDeCache`:
   N marcas → N+1 blocos, `cache_control` em todos menos o último, vazio
   fundido, teto de 3 marcas no user porque o request aceita 4 e o system
   ocupa 1; `semMarcadores` — a proveniência remove a marca antes de
   segmentar). Todo step grava `parsed_output.cache`.
3. **Quatro e-mails em paralelo escrevem o cache quatro vezes** (125%).
   `shared/gate-de-prefixo.ts` em `invokeAgent`: o primeiro de um prefixo
   (modelo + system + 1º bloco do user) passa; os demais esperam
   `CACHE_STAGGER_MS` (15 s) ou o primeiro resolver. Escalonar a fila não
   serviria: o Curador de cada e-mail começa quando o Estruturador dele
   termina.
4. **Prefill está MORTO na família 4.6+** ("returns a 400 error on Claude
   Sonnet 4.6 and later"). `aceitaPrefill` → `false` para Sonnet/Opus 4.6+,
   Sonnet/Opus 5, Fable e Mythos; `prefill_usado` era 0 em 30 dias.

Ordem dos blocos do user, do menos ao mais mutável, com marca entre eles:
Curador `[índice do vault, intenção do flow, aprendizados, estruturas de
referência] [store, perfil, objeções, vocabulário, produtos] [outline,
intenção do e-mail, COO, revisão, alvo, memória, notas de seção, lacunas,
decisão, eliminadas, sequência] [cauda]` — `memoria`, `notas_de_secao` e
`lacunas` são POR E-MAIL (recorte por `liveSections`, escolhas do e-mail
N-1), não da loja. Estruturador `[perfil + seções disponíveis] [resto]`;
Seletor `[loja + catálogo + oferta] [resto]` (o `email_number` saiu do
bloco da loja). `ref: "catalogo_enxuto"` no segmento do catálogo — com
`"catalogo"` o resolver comparava com o JSON integral e saía `stale`.

**Shortlist só com excesso de verdade**: `limiarSemChamada()` = 5 (env
`CURADOR_SHORTLIST_MAX_SEM_CHAMADA`, nunca abaixo de `SHORTLIST_TOP_N`).
A run de 14/09 tinha {4,2,4,3,2,2} elegíveis e pagou US$ 0,97 para
escolher 3 de 4 em duas posições — o custo é a SAÍDA (7,7k tokens a US$
50/M), não a entrada. Até 5, todas viram finalistas e a escolha lê as
notas completas de todas. Telemetria: `shortlist_limiar`,
`finalistas_por_posicao`, `tokens_cache_escrita` em
`consumo_por_chamada` (a retomada também passa pelo `medir`).

**Vault por toque** (`lib/vault/toque.ts`, puro): `emails: [N]` nas
estruturas (já existia, obrigatório) e `serve_a: [welcome-1]` ou
`[todos]` nos aprendizados (vocabulário do diagnóstico do vault; o parser
reprova fora do formato). Global fica no SYSTEM do Estruturador (cacheado
entre os 4 irmãos); o do toque vai no user em `<material_do_toque>` (e
`<aprendizados_do_toque>` no Curador); o de outro toque não é servido.
**Fail-open**: nenhuma referência global nem do toque → serve todas e
marca `vault_por_toque: fail_open_sem_referencia` (senão `loadMaterial`
devolveria `null` e o Estruturador seria pulado). Kill-switch
`VAULT_POR_TOQUE=off`. Telemetria `refs_descartadas_por_toque` e
`aprendizados_descartados_por_toque`; seletor "O que o toque recebe" na
aba Conhecimento, pela MESMA régua. Até o time escrever `serve_a:` nas
notas, todo aprendizado é global — o efeito imediato são as estruturas
com `emails: [2,3,4]` saindo do welcome-1.

JSON compacto onde é gerado por código (decisão do Estruturador,
`format-context`, `build-vars`, `qa.chain`); `catalog-builder.json` fica,
pelo sha8 das runs antigas. Leitura pós-deploy:
`DIAGNOSTICO_cache_por_chamada.sql`.

## O lint reprovou a peça por quatro achados de FRONTEIRA (14/09)

Batch ddb2d125 (Hero Boxers · Welcome 1, 22:50 UTC): `lint_anchor_sem_href`
×4, `texto_de_example` ×8, `largura_container` ×1 e o aviso do botão que só
o Outlook vê. Nenhum era o agente errando — cada um vivia entre duas regras
que não se conheciam. Consertado no lugar (sem regerar) e na raiz:

- **Ícone social sem destino.** `attr-token-vocabulary.ts` deixa
  `URL_FACEBOOK`/`URL_INSTAGRAM`… sem href DE PROPÓSITO (a loja não tem
  redes cadastradas — `client_stores` não tem coluna para isso — e apontar a
  home no lugar do Instagram seria mentira). O lint de envio (B2), mais novo,
  bloqueia `<a>` sem href. Os dois estão certos e o e-mail não saía. Agora o
  pós-processador (passo 9, `icones_sem_destino_removidos`) tira a âncora
  COM o ícone quando ela só embrulha um `<img>`; `<a>` com texto e sem
  destino continua bloqueando — inventar o destino de um botão é conteúdo.
- **`v:roundrect` órfão.** O merge apaga o `<a>` do CTA negado pela decisão
  e o gêmeo `<!--[if mso]>` fica: o Outlook mostrava "DIGITAL GIFT CARD"
  numa marca de cuecas. Passo 10 (`mso_orfao_removido`) tira o bloco MSO e
  o ramo não-Outlook vazio ao lado.
- **598px.** A montagem (`fitFragment`) só neutralizava a calha; a largura
  era normalizada apenas no salvar e na varredura — que nunca rodou: **14
  variantes ativas em 598**. `enforceEmailWidth` passou a rodar no
  `fitFragment` (a MESMA fronteira do `neutralizeGutterPadding`, pelo mesmo
  motivo), e as 18 variantes foram normalizadas no banco
  (`DADOS_20260914_biblioteca_lint_598_rodape.sql`). `enforceEmailWidth` é
  régua de BLOCO: no documento final ela transformaria a calha 100% do
  e-mail em 600 e mudaria o fundo — por isso o pós-processador NÃO a chama.
- **"Verified Buyer" era copy, não example.** O example do campo
  `review_N_credential` é "Verified Buyer 1"; a regex de `pareceExemplo`
  sem o dígito casava a copy real do n8n. Agora exige o dígito (antes ou
  depois). Os "Link Here" ×6 do rodapé eram example de verdade: footer 1
  ganhou seis campos `footer_link_N_label` no schema (a copy passa a
  escrevê-los) com exemplos reais.

**Retomar sem regerar**: `html` corrigido por SQL posicional (substr/||,
guarda e conferência por md5), status `rendering` + `html_pipeline_stage =
'image'` + `rendering_started_at` 16 min atrás + uma run `lint_envio` nova
(o watchdog Front 5 só retoma batch com atividade em 25 min e
`rendering_started_at` entre 15 e 25 min). Custa typography + cores + lint
+ QA, não a fase 1 nem as imagens.

## Cache de prompt de verdade nos agentes que decidem (14/09)

Auditoria do batch 879fe6e4 (`docs`: artifact "Auditoria de custo ·
Estruturador e Curador"): o Curador em `~anthropic/claude-fable-latest`
pagou **153k tokens de entrada em duas chamadas com o MESMO prefixo de
58k** (US$ 2,45 a run, US$ 10/M in · US$ 50/M out). Duas causas no
invoke: (1) a régua do `cache_control` era `^anthropic/` e o slug com
TIL — o dos três agentes que decidem — nunca casava, então nenhum
`cache_control` saía; (2) mesmo casando, só o SYSTEM era marcado, e o
user do Curador tem ~100k chars. `modeloComCacheDePrompt` aceita o til;
`AgentInvokeConfig.cache_user_prefix` marca o user como prefixo
cacheável e `CACHE_PREFIX_MARKER` separa o prefixo (shortlist) do que
muda (as notas das finalistas, na escolha). Só agente de DUAS chamadas
liga o prefixo do user: escrever no cache custa 25% a mais e agente de
uma chamada não teria leitor. `cachedTokens` volta do OpenRouter
(`prompt_tokens_details.cached_tokens`) e vai para
`consumo_por_chamada.tokens_cache` — sem esse número "cache ligado" era
suposição, e foi assim de CM-3 até 14/09. TTL padrão (5 min): as duas
chamadas ficam a ~2 min uma da outra.

**Recusado pelo dono em 14/09** (não refazer): tirar do Curador o que
ele não cita (aprendizados, índice do Obsidian, intenção do flow — "a
estrutura vai ficar repetitiva"), reusar a decisão do Estruturador
quando nada mudou, e teto de raciocínio ou troca de modelo.

## Os sete alertas de Configurações eram três causas (set/2026, migration 20261154)

Sete warnings do `edge_logs` num único carregamento de `/admin/settings`.
O ×4 do avatar é a topologia do layout — `Sidebar` (com `SidebarUser`),
`SidebarMobileDrawer` (que monta a Sidebar de novo) e `MobileTopBar`, mais o
avatar da própria seção Conta. Mesma multiplicação por montagem do
`useUnifiedNotifications`.

**1. O avatar apontava para um arquivo apagado.** O único perfil com foto
tinha `avatar_url` em `<uid>/avatar.png` e o bucket `avatars` guardava UM
objeto: `<uid>/avatar.jpg`. Storage público responde **400** para objeto
ausente. Ninguém viu porque o `AvatarImage` do Radix cai nas iniciais. A
causa é a ORDEM da rota de upload: ela removia as outras extensões **antes**
de subir o arquivo novo e antes de o banco saber dele, então qualquer falha
entre os três passos deixava o ponteiro no vazio. Agora é **upload → update
→ limpeza**: arquivo velho sobrando é lixo tolerável, ponteiro para o vazio
não é. Junto saiu o cruzamento com o PORTAL, que usava o **mesmo bucket e o
mesmo caminho** e grava em `client_portal_users.avatar_url` — um upload lá
invalidava a URL de `profiles` sem que nenhuma das rotas soubesse. O portal
passou a escrever em `<uid>/portal/avatar.<ext>`; o subdiretório vem **depois
do id** porque a policy de Storage exige
`(storage.foldername(name))[1] = auth.uid()` — prefixo `portal/` na frente
quebraria o upload. Caminhos e limpeza moram em `avatar-validation.ts`.

**2. `company_settings` não existia.** A seção "Dados da empresa" lia e
escrevia numa tabela que nenhuma migration criava. A leitura dava 404 com o
erro engolido (o `catch` nem dispara: o supabase-js devolve o erro em `error`
em vez de lançar, e o código nem o desestruturava), então o formulário
aparecia **vazio como se ninguém o tivesse preenchido**; o Salvar falhava
sempre. Medido antes de criar: `company_name` já existia em dois lugares
(`organizations.name` e a key/value `settings`) e os outros sete campos em
nenhum — `clients.cpf_cnpj`/`clients.address` são dos CLIENTES,
`store_brand_identity.logo_*` e `store_onboarding_data.logo_url` são das
lojas deles. **UNIQUE em `org_id`** é o que torna o upsert idempotente: o
código fazia `onConflict: "id"` com um payload **sem `id`** — conflito que
nunca acontece, linha nova a cada clique. A tabela nasce FECHADA
(`TO authenticated` + `is_org_member()` nos quatro comandos), provada nos
três papéis: anon 0, membro 1, portal 0. A tela saiu do acesso direto para
`/api/settings/company`, que resolve o `org_id` no SERVIDOR — a
`is_org_member()` não confere QUAL org, então org no payload seria a única
brecha do desenho.

**3. O 406 do `tutorial_pages` era ruído — e a suspeita de que não era não
se sustentou.** `ignoreDuplicates` devolve ZERO linhas quando a página já
existe (a nossa é de 13/05/2026) e `.maybeSingle()` num POST manda
`Accept: application/vnd.pgrst.object+json` (só no GET usa
`application/json`), então o PostgREST responde 406. Parecia derrubar o
bootstrap pelo `if (tutErr) throw`; **medido com o cliente real, não
derruba**: logo depois de montar o erro o postgrest-js faz
`if (error && isMaybeSingle && error.details?.includes("0 rows")) error = null`
e devolve `{data: null, error: null, status: 200}`. O que sobrava era log
sujo e uma dependência de **match por substring** no texto de erro de um
servidor que não é nosso — mude "0 rows" e o mesmo caso vira `throw` na
criação de onboarding. Sem `maybeSingle`, o POST volta 201 com `[]`.

**Regra derivada, comum às três**: erro que o cliente ABSORVE continua sendo
erro no fio, e é no fio que ele é visível antes de doer. As três causas
estavam nos logs há meses, cada uma com a UI degradando bem o bastante para
ninguém reclamar.


## Duas fotos iguais no mesmo e-mail: a cena que ninguém decidiu (15/09, migration 20261155)

Innova Bay · Welcome 1 (batch b6c478d3): hero e "Works or just an ad?"
saíram com o MESMO produto na MESMA parede. Não era uma imagem para os
dois — são dois slots, duas runs independentes. Medido run a run:

- **Hero**: o Estruturador decidiu "mão adulta encaixando o plug" e a
  variante (`hero section 3`, flat-lay de kit) diz "nenhuma mão, nenhuma
  pessoa". As duas iam ao MESMO prompt; o modelo fez o híbrido.
- **Body 2** (`body 8 - cards vidro`): `requisitos.imagem: null` (ninguém
  decidiu a cena), a direção cadastrada era RASCUNHO ("Pendente da
  referência… aguardando o PNG") servida como "YOUR MAIN SOURCE", e o
  Curador leu "cards de vidro" como cards de TEXTO (a composição
  fotográfica de 600×850 não aparecia na linha do catálogo). Sem cena e
  sem direção sobrou o insumo do hero: produto âncora + cenário genérico.
- Nenhuma run de imagem sabia o que a anterior mostrou.

O que mudou, na fronteira certa:

1. **Cena obrigatória onde há foto gerada** (`auditoria-requisitos.ts`,
   regra `imagem_sem_cena`): `<secoes_disponiveis>` passa a dizer "com
   imagem gerada: N" (`CapacidadeDaSecao.com_imagem[_por_dispositivo]`);
   posição sem `imagem` é DURA quando toda variante da forma tem foto,
   aviso quando só parte. O prompt do Estruturador pede uma frase concreta
   por posição e OUTRO momento da história em cada uma.
2. **`OUTRAS_CENAS` / `CFY_OTHER_FRAMES`** (`prompt-vars-builder.ts` +
   template in-code + migration no template do banco): as cenas decididas
   das outras posições vão ao prompt de imagem com a ordem "não repita".
   Vazio quando nenhuma outra posição tem cena — template idêntico ao de
   antes. Origem `upstream`, custo zero (vem do blueprint).
3. **Cena × direção decide no Curador** (`image/direcao-fotografica.ts`,
   puro, 8 testes; `conflitoDeContrato` lê `RequisitosDuros.imagem` contra
   `ContratoResumo.direcao`): direção que veta pessoa/mão elimina a
   variante quando a cena exige gente. Régua estreita (só termos de
   gente — "sem sombra dura" não é proibição de pessoa); direção ausente
   ou rascunho NUNCA colide (fail-open). A linha do catálogo enxuto
   declara `imagem: N slot(s) de imagem gerada · direção EM RASCUNHO /
   veta pessoa/mão / sem direção`.
4. **Rascunho conta como ausente**: `ehDirecaoEmRascunho` no builder →
   `PHOTO_DIRECTION` vazia + `PHOTO_DIRECTION_AUSENTE` (o bloco "no
   direction was written" do template assume) + `PHOTO_DIRECTION_RASCUNHO`
   na telemetria. O editor da variante avisa. Era a ÚNICA variante ativa
   nesse estado; a direção da body 8 continua por escrever (dado).
5. **Medida apagada sem frase quebrada** (`sanitizePhotoDirection`): a
   ORAÇÃO é julgada sozinha — ficha de arquivo, quase nada sobrando ou
   conectivo pendurado no FIM sai; a vizinha fica. "de," no meio continua
   (decisão de 03/09). A linha real da hero-3 ("slot de, ativo final. ou,
   full-bleed…") cai inteira.

**Limite declarado**: o conflito cena × direção só cobre pessoa/mão. Outros
eixos (estúdio × ambiente real, produto único × kit) seguem indo ao prompt
com a precedência "a cena vence" — sem dado de que o modelo os confunde.

---

## O catálogo sem ofuscamento: o que a linha diz e o que o desempate lê (15/09)

Pedido: que a variante específica não seja ofuscada pela genérica que serve
ao mesmo lugar, que acrescentar variante custe pouco, e que as tags
expressem a peculiaridade de cada peça. Medido em 45 dias de escolhas reais
(`assembler_chooser`, 37 variantes ativas) antes de escrever código:

| dispositivo | placar | concentração |
|---|---|---|
| `footer_nav` | 89 · 0 · 0 | **100%** |
| `offer_sem_cupom` | 19 · 0 | **100%** |
| `hero_lineup` | 5 · 0 | **100%** |
| `hero_oferta_cupom` | 43 · 9 · 8 · 4 · 0 | 67% |
| `reviews_com_credencial` | 36 · 34 · 10 | 45% (saudável) |

**8 de 37 variantes ativas nunca foram escolhidas.** Duas hipóteses CAÍRAM
na medição e ficam registradas: "a com menos campos ganha" (0-6 campos:
média 6,9 escolhas; 13-18: 19,6 — é o oposto) e "o primeiro da lista ganha"
(falha em 3 de 11 dispositivos). A concentração é total exatamente onde o
ranking por eixos chega ao EMPATE; onde a `objecao` separa, é saudável.

**A causa dos três 100% é o desempate lendo um ranking de popularidade.**
`renderUsageCounts` montava a lista A PARTIR das escolhas: quem nunca foi
escolhido não estava no mapa e **não aparecia** — era ausência, não `0×`. A
lista saía em ordem DECRESCENTE sob a legenda "a MENOS usada vence em empate
total": instrução impossível de cumprir, porque a menos usada era a
invisível. Realimentação positiva pura. Agora ela recebe as ELEGÍVEIS da
geração (`elegiveisDaGeracao`), completa com `0×`, ordena ASCENDENTE e o
corte de 60 linhas tira as MAIS usadas — cortar pelo fim removeria as linhas
que a régua usa. Isto não muda régua nenhuma: faz existir o dado que a régua
já pedia. O mesmo desempate entrou no resgate (`menosIncompativel`), onde
`b.copy - a.copy` premiava, por escrito, "a anatomia mais rica"; a contagem
de campos caiu para último critério (a troca NÃO é para "menos campos", que
seria o viés oposto inventado).

**A peculiaridade já estava no schema.** `papelDoCampo` reconhecia `prazo`,
`preco_antigo` e `nome` do depoente, e `resumirContrato` contava `copy` e
`imagens` — nada chegava ao prompt. Publicá-los (`forma:` e `grades:` na
linha) torna **10 dos 11** dispositivos 100% distinguíveis, incluindo os três
de concentração total: `hero_lineup` tinha UMA tupla de eixos para duas
variantes e vira `copy=3 img=1` × `copy=5 img=2 logo ctas=2`;
`offer_sem_cupom` vira `3 campos` × `11 campos · 1 imagem · prazo`. Custo:
~25 chars por variante, no bloco CACHEADO, zero trabalho de curadoria, nunca
desatualiza. `n_ctas` conta o BOTÃO, não o campo (`cta_1_label` +
`cta_1_url` é um só), e o logo é medido antes do `continue` que pula imagens
— ele quase sempre É uma imagem.

**O vazio ficou visível** (`campoDeclarado`): `objeção: (não declara)` nos
três eixos de topo. `campo()` omitia, e o modelo não distinguia "não se
compromete com nada" de "não se aplica aqui" — a que declarava saía
carregando o que declarou, a outra saía curta e limpa. Só esses três:
`registro vetado: (não declara)` seria ruído, porque não vetar nada é o
normal.

**`registro_vetado` deixou de ser órfão.** Era impresso no catálogo e a
regra que o governava morava no passo 5 do protocolo do vault, que
`semMomento` apaga antes de servir — dado sem regra é o erro que
`curador-vault.ts:421` diz ter aprendido a não cometer. A regra voltou ao
system, junto com "(não declara) não é vantagem: overlap ZERO não empata com
quem declara", e com a ressalva que preserva o passo 3 (se a que não declara
for a ÚNICA sobrevivente, ela continua sendo escolhida).

**A contrapartida de `proibicao_violada`**: ela só dispara contra variante
que DECLAROU algo (`proibicaoBateNaVariante` lê `exige_medicao`/`aliviador`),
então a de eixos vazios era **matematicamente incapaz** de aparecer no
medidor — e era justamente a escolhida. `generica_sobre_especifica` (rank-1
que não realiza o aliviador pedido havendo finalista que realiza) e
`sem_eixos` só MEDEM, e só em posição com 2+ finalistas: cobrar onde havia
uma candidata seria cobrar do Curador o que é lacuna da biblioteca.

**67% da cauda era material de outro agente.** Medido nas 40 notas ativas:
6.524 chars em média, sete seções — design system 2.218, direção fotográfica
1.349 e orientações de copy 796 servem a OUTROS agentes e **já estão no
banco**, nas colunas `design_system`, `photo_direction` e `copy_guidance`.
Iam cruas para o Curador, sem `semMomento` nem `semExige`, contrariando o
system que manda ignorar esses campos. `extratoParaDecisao` (puro) mantém
frontmatter + as quatro seções de decisão; nota em formato desconhecido volta
INTEIRA (fail-open — formato novo no vault não pode virar finalista sem
nota). `NOTA_MAX_CHARS` 12.000 → 3.000 e `CAUDA_MAX_CHARS` de 18.000
consumido na ORDEM do ranking: quem fica sem nota é a pior colocada, com
status `sem_orcamento` (≠ `missing`: a variante segue escolhível pela linha
do catálogo). **Uma finalista sozinha sempre cabe** — o teto por nota a corta
antes, e um teto de custo não pode criar a lacuna que ele existe para evitar.

**O teto do catálogo mudou de eixo.** Os 15.000 chars no TOTAL eram um
comentário e um teste sobre fixture sintético (302 chars/linha): a produção
passou dele em 15/09 — **16.255 chars, 37 variantes, 439 por linha** — e nada
mediu, avisou ou cortou. Pior, um teto no total é incompatível com uma
biblioteca que cresce: ele proíbe cadastrar. A medida é
`charsPorVariante` + `linhasLongas` (`LIMITE_CHARS_POR_VARIANTE` = 600), que
é o custo MARGINAL — o que precisa ficar barato —, e ela vai à run
(`catalogo_chars_por_variante`).

**Duplicata virou worklist, não regra.** As duas de `hero_lineup` descrevem
literalmente a mesma peça; escolher sempre a mesma entre duas iguais está
CERTO e nada denunciava. `duplicatasPorDispositivo` reusa
`similaridadeDeDescricao` entre IRMÃS do mesmo dispositivo
(`LIMIAR_DE_DUPLICATA` = 0,65 — mais alto que o 0,5 de `divergentes`, porque
lá servir a descrição a mais é inofensivo e aqui o aviso acusa o time),
aparece na aba Conhecimento e na run. Variante sem dispositivo fica fora: sem
a classificação não se sabe se as duas disputam a mesma posição.

Acompanhamento: `supabase/migrations/DIAGNOSTICO_ofuscamento.sql` — as
MESMAS queries da medição, com o retrato de 15/09 no cabeçalho.

## O dispositivo pedido é filtro, não preço (Passo 19, 15/09)

O resgate cobrava **150** por dispositivo errado — caro, e finito. Finito é
o defeito: `filtrarPorRequisitos` é fail-open no CONJUNTO (zerou a seção,
devolve todas), então posição que pedia `body_garantias` numa seção sem
nenhuma chegava ao resgate com o pool inteiro, e a "menos incompatível" era
uma `body_comparacao` — outra FORMA entregue ao cliente no lugar da
decidida. O fail-open está certo para REDAÇÃO (preço, avaliação: a copy
compensa) e para não esvaziar a shortlist do Curador; está errado para a
forma, que é o que a posição É.

`doDispositivoPedido` (`resgate-de-posicao.ts`, puro) tira do pool quem
realiza dispositivo CONHECIDO e diferente ANTES de pontuar; pool vazio
devolve `null` e a posição cai com o motivo `dispositivo_indisponivel` — o
único dos quatro que nomeia o cadastro que falta ("a seção não tem variante
que realize `body_garantias`"). O preço de 150 saiu: duas regras para a
mesma coisa e a finita venceria em silêncio. O caminho da ESCOLHA já estava
coberto (`violacoesDaEscolha` → `conflitoDeContrato` →
`conflitoDeDispositivo`, `high`); faltava o do resgate, e agora os dois
usam a MESMA comparação — um `===` local divergiria em caixa e acento, que
é o engano por apelido que este repo já pagou.

**Variante sem dispositivo cadastrado NÃO é eliminada**, e o número é o
motivo: **8 das 17 variantes ativas de `hero` têm a coluna NULL** (o
backfill da B3 subiu como proposta reversível, o NOT NULL não existe). O
filtro literal do plano (`c.dispositivo === pedido`) apagaria 47% da hero,
e hero vazia é FATAL desde o Passo 11 — falta de CADASTRO viraria falha de
geração. **As 8 foram classificadas horas depois e hoje a biblioteca tem
ZERO ativas sem dispositivo** (ver a seção seguinte); a guarda fica porque o
NOT NULL continua não existindo e a próxima variante nasce NULL de novo — o
que a torna barata é o preço de 75 em `custoDeIncompatibilidade`, que impede
a não classificada de vencer quem acerta no desempate por menor uso.

**Medido antes de subir** (30 dias de runs do Estruturador): 250 posições
sem dispositivo pedido (no-op) e 29 com — todas existentes na biblioteca,
na própria seção. Nenhuma posição do histórico teria caído: é guarda, não
mudança de comportamento no tráfego de hoje.

Telemetria SEPARADA na run `assembler`: `fora_do_dispositivo` (candidatas de
outra forma) e `dispositivo_indisponivel` (posições que caíram) ao lado de
`recusados_por_dispositivo` — descarte da decisão é acerto do filtro, "não
existe a forma" é lacuna de biblioteca, e as duas pedem ações opostas da
curadoria. A proposta do vault já era chaveada por `dispositivo_pedido`.

## Oito heroes sem etiqueta (15/09)

Entraram 8 hero sections novas, todas ativas, **sem dispositivo e sem nota**
— as outras 37 da biblioteca tinham as duas coisas. O cadastro estava bom
(passam no `variantIsFillable`, HTML em 600px, schema casando), e é
justamente por isso que o defeito era invisível.

**Seis das oito são o e-mail INTEIRO**, não uma abertura: as descrições
abrem com "E-mail inteiro de…" (contador, oferta, cupom, corpo, botão numa
peça só). Cadastradas como `hero`, elas vão para a posição 1 e as posições
2–6 continuam sendo montadas embaixo — dois e-mails empilhados, com dois
cupons. O eixo que diria isso é `papel_na_peca: peca-inteira` e mora na NOTA
do vault; sem nota o Curador não sabe, sem dispositivo o código não filtra.
Só a 17 e a 18 são hero de verdade.

**Três regras certas que, juntas, premiavam quem não tem etiqueta:**

1. `conflitoDeDispositivo` é fail-open — variante sem dispositivo nunca é
   eliminada e concorre em TODA posição da seção.
2. `capacidadePorSecao` só conta as classificadas — o Estruturador nunca
   consegue pedi-la. Ela **custa e não compete**.
3. `custoDeIncompatibilidade` não cobrava nada dela, então ela EMPATAVA em 0
   com quem acerta o dispositivo, e aí decidia o desempate por **menor uso**
   instalado no mesmo dia. Medido: numa posição que pede `hero_pergunta`, a
   `hero section 9` (25 escolhas em 45 dias) perdia para a `hero section 13`
   (e-mail inteiro de Black Friday, 0 escolhas). **Correção: +75.** É o par
   do filtro do Passo 19 (seção acima), não uma segunda regra para a mesma
   coisa: dispositivo ERRADO sai do pool antes de pontuar, dispositivo
   AUSENTE fica — de propósito, senão falta de cadastro viraria falha de
   geração — e paga. Finito, nunca `Infinity`: não saber continua não sendo
   violar.

**Classificação aplicada** (15/09): `hero_oferta_cupom` para 11, 12, 13, 14 e
15; `hero_apresentacao` para 16, 17 e 18 — que deixou de ser dispositivo sem
variante ativa. Pool de hero: 10 · 3 · 2 · 2. Só `hero_oferta_cupom` passa do
limiar de 5 e liga a chamada de shortlist; separar as seis peças inteiras do
pool de hero a zeraria (decisão pendente do dono).

**Custo**: a linha do catálogo é cacheada (~US$ 0,001 por chamada com as 8) —
é a propriedade "acrescentar variante custa pouco" funcionando. O custo real
é a chamada de shortlist que passa a existir: ~US$ 0,10 por e-mail, **1–3%**
dos US$ 3,10–8,20 de uma peça.

**O que ficou visível**: `CompactCatalog.naoClassificadas` sobe na telemetria
do `assembler_chooser` e aparece na aba Conhecimento; `duplicatasPorDispositivo`
passou a comparar também as **não classificadas da mesma seção** (era onde as
8 estavam, e duas delas — 13 e 15 — descrevem a mesma decisão de uso); e o
editor avisa ao ter variante ativa sem dispositivo. O teste que afirmava
"variante sem dispositivo fica fora" foi corrigido: era ele que mantinha o
detector cego.

**Hand-off para o vault** (`ficha-do-vault.ts`, puro, 12 testes): o agente do
Obsidian não enxerga o admin, e `variant_id`, nome exato e schema moram só de
cá — errados, a nota é ignorada **em silêncio**. A ficha é gerada do banco
(botão "Ficha para o vault" no editor; as 8 em
`docs/email-generation/handoff-heroes-15-09.md`) e deriva a forma da MESMA
`resumirContrato` que monta a linha do catálogo, senão a ficha descreveria uma
peça e o ranking mediria outra.

## O pedido que se contradiz sozinho, e a pausa sem fim (15/09)

Duas revisões da geração de hoje, as duas medidas no banco antes de
escrever código.

### `reviews_3plus` com no máximo 2 itens

Batch das 15:49 (Innova, welcome 1): a peça rodou inteira, custou **US$
4,26** e reprovou no QA em `posicao_sem_variante [high/**biblioteca**]`.
A biblioteca estava CERTA. O Estruturador pediu, na posição 3,
`dispositivo: reviews_3plus` **com `n_itens: {min:2, max:2}`** — "três ou
mais" limitado a dois. Medido: as 3 variantes ativas de `reviews_3plus`
entregam 3 itens; a única de `reviews_com_credencial` entrega 2. O filtro
eliminou as **sete** variantes de reviews (`zerou: true`), o fail-open
devolveu todas, o resgate pegou uma e o validador a recusou
(`resgate_recusado`) — posição vazia, peça reprovada, e a curadoria
cobrada por uma lacuna que não existe.

**A auditoria do Estruturador rodou (`modo: on`) e devolveu `ok: true`.**
A régua de `n_itens` olhava a faixa da **seção**, que ia de 2 a 3 por
causa da variante de credencial: `2 < 2` é falso, nada acusou. O pedido se
contradiz na combinação FORMA × GRADE, e ninguém olhava para as duas
juntas.

`CapacidadeDaSecao.itens_por_dispositivo` passa a levar a faixa POR FORMA,
e ela entra nos dois lados: no `<secoes_disponiveis>` colada ao
dispositivo (`reviews_3plus (3, 3 itens)`), para o pedido impossível não
nascer; e na regra dura `n_itens_fora_do_dispositivo`, para não passar. A
régua é o DADO, não o vocabulário — "nenhuma variante ativa desta forma
cabe na faixa pedida" —, então ela não depende de alguém ler o nome do
dispositivo. Forma sem grade cadastrada fica FORA do mapa: "sem grade" não
é faixa, e inventar `{0,0}` reprovaria quem só quer o bloco. A régua da
seção FICA, e um teste garante que ela sozinha não pegaria este caso.

### A pausa manual não tinha fim

A execução manual `8658d1a8` estava `paused` no nó `color_format` desde
10/09 — **cinco dias** — e com ela o e-mail `758f05de` seguia `rendering`
no banco e "rodando" na tela. `emailsComExecucaoPausada` protege o e-mail
de TODOS os fronts do watchdog, e o desenho está certo (parar no nó X e
sair para almoçar não pode devolver `failed:timeout_phase2`); o que
faltava era o outro lado dele. Pior: `uniq_ege_manual_viva` cobre
`running` E `paused`, então o e-mail ficava **trancado** — todo disparo
manual novo tomava 409, para sempre.

`pausa.ts` (puro, 13 testes) tria por idade: **12 h** cobrem um dia de
trabalho e não atravessam a noite, que é onde "pausado" vira "esquecido".
A idade sai de `updated_at` (o instante da pausa, pelo trigger com
`clock_timestamp()`). **Carimbo ilegível conta como VIVA** — expirar no
escuro derrubaria a proteção justamente onde ela não pôde ser medida. A
expiração roda dentro de `emailsComExecucaoPausada`, no watchdog: a pausa
vencida é fechada e o e-mail volta aos fronts na MESMA rodada, sem front
novo nem cron novo.

Fechada a pausa, o e-mail sai do limbo com o motivo verdadeiro
(`liberarEmailDaExecucao` → `execucao_manual_cancelada` /
`execucao_manual_expirada`). Sem isso o **Front 5 o RETOMARIA** dentro de
25 min — cancelar viraria "continue" — e o Front 3 lhe daria
`timeout_phase2`, que não foi o que aconteceu. O `html` fica INTACTO: é
ele que permite ao disparo seguinte retomar com `start_from`. Execução
`running` fica de fora (pode haver runner em voo, e ele escreve o
desfecho).

### O QA julgava dois documentos ao mesmo tempo

Os dois e-mails de hoje trazem `links_quebrados [medium]` — e a varredura
dos `href` do HTML entregue devolve **15 links para `https://innovabay.site`
e um `[unsubscribe_link]`** (merge tag válida): zero links quebrados. O QA
escreveu "footer social media CTAs use placeholder values instead of real
URLs" sobre ícones sociais que **não existem no e-mail**: o passo 9 do
pós-processador (`icones_sem_destino_removidos`) já os tinha apagado.

A causa é de ORDEM. O QA recebe `{{html}}` (o documento final) e
`block_views_json`, e as views eram extraídas no fim do `image_format` —
**três agentes antes** (typography, color_format, background_fit) e antes
do pós-processador inteiro. Ele julgava uma mistura de dois documentos. Com
`qa_mode = enforce`, uma issue `high` nessas condições **reprova peça boa**;
e o erro simétrico é pior — o que esses passos INTRODUZEM ficaria invisível
na view, que é exatamente o que a arquitetura de views existe para ele ler.

O strip dos marcadores desceu: `posProcessar` roda sobre o documento COM
marcadores (ele os preserva por construção, `ehMarcadorInterno`), as views
saem daí, e só então o `stripCfyBlockMarkers` produz o `finalHtml`. As views
da cadeia viram RESERVA — num resume pós-strip não há marcador para
recortar. O lint continua medindo o documento final, sem andaime.

Provado nos dois sentidos: com a ordem antiga o teste falha com
`expected [ 'URL_FACEBOOK' ] to not include 'URL_FACEBOOK'` (o falso
positivo reproduzido), com a nova passa. A invariante que ele trava é
simples: **todo `href` que a view mostra existe no documento que o cliente
recebe**, e o `html` que o QA julga é byte a byte o que fica gravado.

**Limite declarado na perna B do Front 2**: ela exige
`generation_batch_id` porque `in_progress` também é status LEGACY do Epic
8/9, e varrer sem batch inventaria falha em e-mail que nunca foi gerado. O
preço é um zumbi conhecido (um, parado desde 28/08) que pede decisão
humana, não varredura.

## Auditoria de 15/09: conversão íntegra, base cega em cinco notas

Varredura das filas: `crm_webhook_events` 839 `done` (último às 23:30),
`crm_conversion_events` 29 `sent`, `email_dispatch_jobs` e `ai_chat_jobs`
fechados — **zero presos, zero falhas**. O `LeadQualificado` voltou a sair
(11/09, depois da correção do 42P10) e os dois cadastros de hoje
responderam "R$0 - R$99.000": legitimamente não qualificam.

**A fragilidade que sobrou é de CADASTRO.** A regra do qualificado é
digitada à mão e o campo é um `select` com opções próprias: renomear uma
opção no editor deixa a condição apontando para um texto que nenhum lead
pode responder, e o evento para de sair sem nada acusar — mesma família do
defeito de 05/08, agora pela porta do cadastro. O diagnóstico da tela já
roda a avaliação real contra os cadastros recentes, mas isso só responde
depois que alguém se cadastrou, e não distingue "a regra está certa e
ninguém se encaixou" de "a regra aponta para o vazio".

`regra-vs-opcoes.ts` (puro, 17 testes) responde antes e sem tráfego. A
comparação é a MESMA do envio (`normalizeForCompare`) — comparar byte a
byte acusaria o que lá casa, mandando consertar o que funciona. Só julga
campo com lista fechada e operador de igualdade (`contains` é fragmento de
propósito, `gt/lt` comparam número), e campo que sumiu do formulário NÃO
vira aviso daqui: quem cobra isso é o teste contra os cadastros, e o aviso
novo fica ao lado dele, não no lugar. Verificado contra produção: os três
valores da regra existem entre as quatro opções — zero alarme falso.

**A base de conhecimento estava cega em cinco notas.** 256 aprovadas, 251
com vetor, e as 5 sem são exatamente as cinco MAIORES (12,0k a 43,4k
chars), paradas desde 09/09. Dois defeitos somados, e os dois fazem a mesma
nota falhar em toda rodada:

1. `MAX_INPUT_CHARS = 24_000` dizia cortar "com folga" para os 8.192 tokens
   do modelo — a régua de ~4 chars/token é do INGLÊS; em português
   acentuado o `cl100k_base` gasta perto de 3, e 24k ficam colados no
   limite. Agora **16.000**.
2. O lote era **fixo em 32 itens** e o limite do endpoint é por CHAMADA:
   32 notas de 16k são 512k chars num POST. O lote inteiro era recusado,
   inclusive as pequenas que viajavam com as grandes.
   `lotesPorOrcamento` agrupa por orçamento de caracteres; item maior que o
   orçamento vai SOZINHO, nunca descartado.
3. Lote recusado dava `break` em tudo — e como o conjunto de pendentes não
   muda entre rodadas, aquelas notas nunca entravam. Agora o lote falho é
   reprocessado **item a item**: as boas entram, só a recusada fica
   pendente com causa e tamanho no log. Nenhum item passando sozinho =
   provedor fora do ar, e aí sim para.

## Só envelhece quem pode ser renovado (16/09)

Medido: 55 linhas de `store_revenue_summary` no rótulo 30d, **54
sincronizadas minutos antes e UMA de 02/09** — Cronos Alemã,
`sync_status: 'ok'`, 8.567,63 EUR, e nenhuma credencial de plataforma de
e-mail (a chave foi removida depois daquela data).

A lista que o refresh percorre é filtrada por credencial
(`ANY_EMAIL_PLATFORM_FILTER`); a que media a idade do cache **não era**.
A loja ficava fora de toda passada de sync e continuava ancorando o
`oldestFetchedAt`: idade de 13 dias contra um teto de 1 hora, `isStale`
verdadeiro PARA SEMPRE. O banner "cache desatualizado" nunca apagava, o
`needsSync` disparava a sincronização automática em toda abertura da
tela, ela segurava o lock, e o clique em "Sincronizar agora" voltava
`alreadyRunning`. É a segunda metade do "clico em sincronizar e ele não
sincroniza" — a primeira (uma passada não cobria a carteira) foi
corrigida antes e está de pé; o que faltava era a linha que está **fora**
da carteira.

`lib/dashboard/frescor.ts` (puro, 11 testes): linha que nenhuma passada
alcança não fica velha, fica **órfã** — outra coisa, com outra ação
(reconectar a chave ou desativar a loja). O que a desqualifica como
âncora não é a idade, é não ter como ser renovada, então a órfã recente
também sai da conta; ela só vira AVISO passada a mesma hora do
`ADMIN_STALENESS_MS`, senão chave removida há dez minutos seria alarme
falso. Sem carimbo de coleta é declarado como tal, nunca vira idade
inventada. Erro ao ler a lista de lojas trata todas como renováveis —
erro de query não pode inventar carteira órfã.

**O valor dela continua nos cards**, de propósito: descartá-lo derrubaria
o faturamento total em ~R$ 53 mil sem explicação na tela, que é pior que
contar um número antigo e DIZER que ele é antigo. Daí o bloco próprio no
dashboard, separado do "não sincronizam" — o último sync destas deu
certo; o que falta é chave para haver um próximo. Efeito medido na âncora
do 30d: de 02/09 19:29 para 15/09 21:45. De quebra a contagem de lojas
saiu do `count: 'exact'` em caminho quente — a mesma consulta traz os
ids, que é o conjunto que o frescor precisa.

**Fuso das lojas, auditado e declarado**: das 64 ativas, 10 estão sem
`timezone` — e são exatamente as 10 **sem credencial nenhuma** (nem
e-mail, nem Shopify). As 54 com credencial têm fuso, procedência do fuso
e procedência da moeda **em 100%**: a cura automática do sync (set/2026)
funcionou. Não há defeito de código aqui, e não há fonte de onde puxar:
é pendência de dado, sem consumidor — para essas lojas nenhuma janela de
plataforma é montada.

## Central de Campanhas: 16 ciclos, zero sugestões (16/09)

Medido antes de escrever código: **16 ciclos, NENHUMA sugestão**. Quinze
presos em `generating` para sempre; o único com desfecho (#11, 10/08)
fechou por saldo da conta, causa já superada. E `campaign_ai_runs` sem
uma linha `kind='suggestions'` desde 10/08 — o gerador, que é o produto,
nunca chega a ser chamado. Três causas empilhadas, nenhuma visível.

**1. A captura de tendências roda em SÉRIE, sem relógio**, num cron de
`maxDuration = 300`: 81 s de média por cluster (máximo 199 s) × 7 países
= ~568 s. A função morre no meio toda semana, por construção, e quem é
morto pelo runtime não roda `catch` nem `finally` — daí o ciclo
`generating` e o lock com `finished_at` ANTERIOR ao `started_at`.
Tendência é enriquecimento; sugestão é o entregável, e é ela que tem de
caber: `orcamentoDaCaptura` (`lib/campaign-central/ciclo-saude.ts`, puro,
18 testes) reserva o tempo da geração, e `cabeMaisUmCluster` só começa o
que TERMINA dentro do orçamento — a conta é sobre terminar, porque quem
estoura mata a função inteira. O que não coube entra na FRENTE na semana
seguinte (`ordemDaCaptura`: quem esperou mais vai primeiro, nunca
capturado no topo), que é a lição do backfill de avatar — com ordem fixa
e lote menor que a fila, a cauda nunca é alcançada. A duração típica do
próximo cluster é o pior caso já visto NESTA execução, com piso na média
medida.

**2. O teto de 4.096 tokens corta a resposta.** As 20 runs
`invalid_output` desde 17/08 têm `tokens_output` = 4.096 cravado e
`raw_output` terminando no meio de uma palavra. `retry-teto` — o módulo
da casa, escrito para o Seletor e o Estruturador, descido ao `copy_fit`
em 15/09 — é a **terceira ocorrência da mesma família** e nunca tinha
chegado aqui. Para ele funcionar, `finish_reason`/`stop_reason` passou a
ser propagado: o provedor já mandava e o código **lia no tipo e
descartava**, então a causa chegava ao banco como "JSON parse falhou em
todos os candidatos", que descreve o sintoma e esconde o motivo. Foi o
que fez este diagnóstico custar um mês.

**3. Ciclo preso não era varrido por ninguém.** A varredura
(`ciclosInterrompidos`, teto de 15 min) roda no início do ciclo novo —
único ponto que sempre executa — e é fail-open. Sem carimbo de criação o
ciclo NÃO é fechado: afirmar que morreu sem poder medir a idade é
inventar desfecho, e o engano apagaria o "gerando" de uma execução viva.

De quebra, a run passou a gravar o modelo REALMENTE chamado — gravava a
constante `TRENDS_MODEL` enquanto a chamada usava `cfg.model`, então com
a config em `moonshotai/kimi-k3` toda a telemetria dizia
`claude-sonnet-4-6`. É a armadilha do `onMeta.modelUsed`: comparar
modelos vira ficção quando a run registra o pedido em vez do servido.

Dado corrigido em produção: teto das trends 4096 → **8192**, 13 ciclos
pendurados fechados com motivo declarado, 2 locks mortos liberados.
Medição e acompanhamento em
`supabase/migrations/DIAGNOSTICO_central_de_campanhas.sql`.

## Os rounds de RLS fecharam as tabelas; as RPCs ficaram abertas (16/09)

Medido: **78 funções `SECURITY DEFINER` no schema `public` executáveis
por `anon`** — a chave pública que vai no JS do browser. `SECURITY
DEFINER` roda como o dono, então a RLS não protege nada do que a função
faz por dentro, e o PostgREST expõe toda função de `public` em
`/rest/v1/rpc/<nome>`. Sem sessão nenhuma dava para `rate_limit_clear`
(anular o rate limit do login/reset), `acquire_cron_lock('sync_reports',
86400, …)` (travar a sincronização por um dia), `upsert_custom_range_cache`
(**falsificar a receita do dashboard**), `audit_cleanup(0)` (apagar a
trilha de auditoria), `audit_password_reset` (injetar evento falso) e
`search_agent_chunks` (ler o conteúdo indexado dos agentes).

**Fechar é seguro porque nenhuma rota chama RPC com a chave `anon`** —
levantado no código, não suposto: as 51 RPCs do app usam
`createAdminClient` (service role) ou o cliente de servidor com sessão;
os dois únicos arquivos que chamam `.rpc` com o cliente do BROWSER são
`notification.service.ts` (`unread_notifications_count`, que exige
login) e `rate-limit.service.ts`, que é **código morto** — só
reexportado por `lib/services/index.ts`, sem consumidor, porque o rate
limit em uso é `lib/rate-limit.ts`. Todas as rotas públicas
(`/api/public/*`, `/api/tracking/*`) usam `createAdminClient`, inclusive
o `increment_form_views` do formulário.

**A forma do REVOKE é a parte que erra em silêncio**: função nasce com
`EXECUTE` para **PUBLIC** e `anon` herda dali, então `REVOKE … FROM
anon` sozinho não tira nada. A revogação é de PUBLIC — e por isso
`authenticated` e `service_role` recebem o grant explícito ANTES, senão
tirar PUBLIC derrubaria também quem está logado (o sino de notificações,
por exemplo). Aplicado e verificado: `anon` de 78 para **0**,
`authenticated` em 78 (ninguém logado perdeu acesso), `service_role` em
102. As INVOKER voláteis do app foram fechadas junto; as 8 que seguem
abertas são de extensão (pgvector, pg_trgm), que o Supabase gerencia e
cujos índices dependem delas.

SQL idempotente, com a lista de exceções (hoje VAZIA, e isso foi medido)
e o rollback, em `supabase/migrations/APPLY_MANUALLY_fechar_rpc_anon.sql`.

**`function_search_path_mutable` foi medido e DISPENSADO**: 45 das 102
não fixam `search_path`, mas sequestrar a resolução de nomes exige CRIAR
objeto num schema à frente na busca — e `anon`, `authenticated`,
`service_role` e `authenticator` têm CREATE negado em `public` **e** no
banco. Com o vetor fechado, alterar 45 funções de produção é risco puro
(função que dependa de `extensions` ou `auth` passa a não resolver, em
runtime). Se algum papel ganhar CREATE, a conta inverte — e aí o valor é
`public, extensions, pg_temp`, não só `public`.

## A coalescência parou de duplicar, mas não consolidou (16/09, migration 20261156)

`upsert_onboarding_stuck_notifications` (do incidente das 17.611 não
lidas) faz UPDATE primeiro e INSERT só quando nada foi tocado — está
correta e PARA de criar duplicatas. O que ela nunca fez foi consolidar as
que já existiam: o UPDATE alcança TODAS as cópias do par, devolve
`ROW_COUNT = 3`, e as três são renovadas com `created_at = now()` a cada
rodada do cron. **Nunca envelhecem e nunca somem.**

Medido: 905 não lidas para **307 pares** (usuário × onboarding), com 297
pares tendo cópias gravadas no MESMO instante ao microssegundo — a
assinatura de linha legada renovada em bloco, não de uma notificação por
dia. O retorno da função também mentia: somava 3 onde tocou um par só.

Índice único PARCIAL pelos DOIS lados — só a não lida disputa a
unicidade (a lida é histórico e pode repetir) e a chave do JSONB é
literal, que é o que permite ao índice ser usado. A função passa a TRATAR
o 23505 em vez de só tentar evitá-lo: adotar o que passou primeiro é o
padrão desde a 20261119 e a 20261132, e **checar antes sem tratar o
conflito depois é exatamente o padrão que duplica**. Aplicado: 905 → 307.

Fica declarado o que NÃO foi mexido: `onboarding_column_change` (374) e
`onboarding_briefing_ready` (295) são notificações de EVENTO, não de
estado — repetição ali é legítima, e coalescê-las esconderia evento. O
que falta nesses dois é política de retenção, que é decisão de produto.

## Dois crons rodavam há meses sem gravar uma linha (16/09)

Varredura dos 43 crons contra o que cada um deixa no banco. Dois estavam
mudos, pela MESMA causa de fundo: **zero devolvido com `success: true` se
lê como "não havia o que fazer"**.

**`crm-snapshot` nunca gravou NADA.** `crm_org_snapshots`,
`crm_pipeline_snapshots` e `crm_lead_funnel_snapshots` com ZERO linhas,
as três, desde sempre: `computeAllOrgSnapshots` selecionava as
organizações com `.eq("type", "agency")` e a ÚNICA organização deste
banco é `type: 'internal'`. O laço percorria lista vazia e o cron
respondia 200 todo dia às 06:20. O custo ficava escondido em três telas —
`/admin/crm/reports` é "snapshot-first" e lia tabela vazia como se não
houvesse histórico, os deltas do painel de CS ficavam `null` "porque
ainda não há snapshot", e `dashboard/sales` comparava o valor aberto de
hoje com um passado que nunca existiu. O rótulo era suposição sobre um
modelo de negócio que nunca existiu aqui; quem decide se a org rende
snapshot é ter pipeline e carteira, e `snapshotOrg` já mede isso. Os três
upserts também passavam sem conferir erro — o PostgREST devolve a falha
em `error`, não como exceção, e o código nem a desestruturava.

**`store-daily-metrics` tinha TRÊS linhas em meses.** O cron rodava e
agregava quase nada porque `fetchCampaigns` filtrava
`.eq("period_label", "90d")` — o rótulo mais RARO da tabela: medido,
`90d` tem 73 linhas com a mais nova de 05/09, contra 2.061 em `30d` com
423 dos últimos dez dias, num universo de 8.356 campanhas com `send_time`
em 51 lojas. A justificativa ("evitar contar a mesma campanha em várias
janelas") estava certa na intenção e errada na âncora: quem deduplica é
`dedupCampaigns`, por (store_id, campaign_id), dentro do `aggregateByDay`
— o filtro era redundante e amarrava o cron ao rótulo vazio. O gráfico de
receita atribuída caía sempre no fallback por campanhas.

A leitura passou a cobrir todos os rótulos e a ser **paginada** (a mesma
campanha em várias janelas passa fácil do teto de 1.000 do PostgREST, que
corta sem avisar) com ordem TOTAL, senão `.range()` repete e pula linhas.
A dedupe que torna isso seguro ganhou teste dedicado — a mesma campanha
em três rótulos conta uma vez, e vence o sync mais recente.

**Os dois passaram a DIZER quando não escrevem**: `avaliarSnapshot`
(`lib/crm/snapshot-saude.ts`, puro, 6 testes) reprova rodada sem
organização ou sem linha gravada, e o de métricas separa "ontem ninguém
enviou campanha" (zero legítimo) de "havia campanha e nada foi gravado"
(500). Cron que falha tem de aparecer como falha no painel da plataforma
— foi a ausência desse sinal que deixou os dois parados por meses.

Recuperação: o snapshot do CRM começa a série no dia seguinte ao deploy
(snapshot é do dia, não há passado a recuperar); o histórico de métricas
por loja volta com `GET /api/cron/store-daily-metrics?backfill=120`, que
usa a mesma leitura corrigida.

**O resto da varredura está saudável, e o que está zerado tem motivo
declarado**: `commemorative_dates` (280 linhas, cron anual),
`google-calendar-sync` (reuniões atualizadas na hora), `crm-ads-sync`,
`crm-health-compute`, `exchange-rate-snapshot`, `convertia-saldo` e
`vault-sync` todos com escrita recente. `ai_eval_cases`/`ai_eval_runs` e
`client_briefings` em zero é falta de USO, não gatilho quebrado — como já
estava registrado. `store_feedback_calls` recebeu linha em 15/09, o que
confirma a ponte reunião→carteira da migration 20261129 funcionando.

## Template do Estúdio: o caminho mais rápido não existia (16/09)

Medido antes de escrever código: **0 templates do time**, 3 documentos, 1
referência, 0 brand kits, 0 agendamentos. Não era desinteresse — era que
**só existia UM caminho para cadastrar template**: "a partir de
inspiração", que pede subir os slides como IMAGEM e paga uma chamada de
VISÃO (até 12 imagens em base64) para um modelo adivinhar a sequência.
Quem acabou de montar um carrossel bom no próprio Estúdio tinha de
exportar a peça em PNG e subir de volta para o modelo ler o que o editor
já conhece campo a campo.

A conversão inversa já existia nos dois sentidos (`documentoDeEstrutura`,
`estruturaDaReferencia`); **documento → estrutura** era a que faltava. Pior:
`editor-page.tsx` já tinha a função `salvarTemplate` INTEIRA, e ela só era
passada ao editor quando `?modo=template` estava na URL — isto é, apenas
na revisão de um template que acabou de nascer da inspiração. O botão
existia e estava atrás justamente do caminho caro.

**`estrutura-do-documento.ts`** (puro, 13 testes) é a régua, com três
regras que erram em silêncio se ficarem na UI:

1. **Slide oculto não entra.** `oculto` é o que o operador tirou da peça;
   trazê-lo pelo template devolveria, na criação seguinte, o slide que ele
   acabou de esconder. A conversão à mão do `editor-page` levava todos.
2. **Só é "com foto" o slot que o renderer DESENHA.** `dado` e `cta` não
   chamam `imgSlot` (`TIPOS_COM_SLOT`), então `slotImagem` ali é promessa
   que nenhuma peça cumpre. `documentoDeEstrutura` gravava `slotsImagem:
   1` sem checar, a checkbox "foto" da revisão era oferecida nos 7 tipos e
   `analisar_inspiracao` marca foto em slide de número porque VIU uma arte
   — o operador via "foto" na estrutura e nada no slide. `normalizarEstrutura`
   roda na leitura da inspiração e na troca manual de tipo; a checkbox fica
   desabilitada com o motivo.
3. **O nome do template descreve a FORMA, não a pauta.** O nome do
   carrossel é a headline; como template ele reaparece na hora de escolher
   a sequência, onde a headline de outra peça não ajuda. Vem preenchido e
   EDITÁVEL — renomear sozinho seria adivinhar a intenção.

Junto veio uma correção de comportamento declarada: a capa ganhava slot
SEMPRE (`e.slotImagem || e.tipo === "capa"`), então desmarcar a foto da
capa não tinha efeito. Agora o default só vale quando a estrutura **não se
pronuncia** (`e.slotImagem ?? e.tipo === "capa"`) — estrutura sem o campo
continua com foto na capa, zero regressão.

**Nome repetido não vira duplicata silenciosa**: `templateComMesmoNome`
(comparação sem acento/caixa) faz o botão virar "Atualizar o existente", e
o PATCH da rota passou a aceitar `estrutura`/`templateId`/`fidelidade`.
`fidelidade: null` ali APAGA o número de propósito — ela é a confiança da
LEITURA de uma inspiração, e a forma que veio de um carrossel do Estúdio
não foi lida por ninguém. Dois templates de mesmo nome são
indistinguíveis na prateleira; quem quer os dois muda o nome, que é
exatamente o que os distingue.

Entradas: menu do card na biblioteca e botão na barra do editor (fora do
`modoTemplate`, que mantém o fluxo de revisão). **Zero chamadas de IA,
zero upload.**

**Ficou de fora, com o motivo**: template a partir dos 10 carrosséis
publicados no Instagram (exige leitura por visão — mesmo custo do caminho
que este atalho existe para evitar) e UNIQUE em
`conteudo_meus_templates(org, nome)` — o dedupe é do cliente e a tabela
tem 0 linhas; vira corrida real só com uso simultâneo.

**A outra lacuna do módulo é DADO, não código**: dos 89 posts
sincronizados, **0 têm pilar, molde ou palavra-chave**. Mix de pilar e
desempenho por molde mostram a ausência corretamente (`montarPilarMix`
informa quantos ficaram fora), mas o painel só passa a responder depois
que alguém classificar — e `PATCH /api/conteudo/posts` já classifica a
seleção da tabela em lote, com os filtros "Sem pilar"/"Sem molde".

## Estúdio — família "Post": o print de tweet, medido do print (16/09)

Pedido: templates **idênticos** à referência (quatro prints de tweet), com
fonte, dimensão, espaçamento e corpo copiados, e editáveis. Virou a
família visual `post` + o molde `molde-post`; medidas, tabela de/para e
limites declarados em `docs/conteudo/formatos/post-print-de-tweet.md`.

**A régua é a conversão, não o olho**: a referência tem 1170 px de
largura e o canvas tem 1080, então toda medida de `formato-post.ts` é
`doPrint(medida) = medida × 0,923`, gravada já convertida — quem mexer
compara com a coluna do print na tabela do módulo, sem refazer a conta.

**O formato é um LAYOUT, não uma paleta**, e por isso entrou como flag no
traço (`TracoFamilia.cartaoPerfil`) em vez de tipo de frame novo: ligada,
o renderer desenha o MESMO cartão para todo tipo (avatar + nome com selo
+ `@handle` + texto) e **suprime rodapé de marca, contador e filete** — a
peça imita uma captura de tela, e enfeite da casa denuncia que não é uma.
Nome, handle, foto e selo saem do **brand kit** (o canal Instagram
conectado): trocar de perfil reescreve os quatro slides sem digitar nada.

**Três poses, e a pose vem da IMAGEM** (`posePost`): gancho (a capa, com
a frase 22% maior e o dobro de respiro — é o slide que para o dedo),
com print (cabeçalho maior no topo, captura até quase a borda) e só texto
(centro ÓPTICO, 3% acima do geométrico; centralizar no meio exato deixa o
bloco afundado, e é onde os três slides de texto da referência estão).

**Limite próprio** (`LIMITES_POST`): o texto ocupa a peça inteira e o
slide de "por que funciona" tem 232 caracteres. Com o limite do TIPO
(`corpo: 180`) o auto-fit encolheria a fonte e a peça deixaria de ser
idêntica **sem nada avisar** — daí `limiteDe(tipo, campo, cartaoPerfil)`,
com teste fixando `fitFactor(232, …) === 1`, e o aviso de "corpo longo"
do editor lendo a mesma régua.

**Poppins 400/600/700** entrou self-hosted (OFL) no CSS **e** na lista da
exportação — sem os dois o PNG sai com a sans do sistema e a peça
exportada não é a que está na tela. É uma aproximação declarada: a
referência é uma captura, não um arquivo.

**Verificado renderizando** (`renderToStaticMarkup` + Chromium contra a
referência), que é o que pegou os três defeitos invisíveis a teste: o
**gradiente sutil** que sobrava no fundo da capa (`novoDocumento` grava
`"gradiente"` antes de a família ser aplicada, e `aplicarFamilia` trocava
cor por cor — agora recalcula ao entrar ou sair do cartão), o selo em
círculo liso (a forma em lóbulos é o que o olho lê como verificado) e o
gancho pequeno demais. Fidelidade medida: a linha longa saiu em **79,6%**
da largura contra **79,0%** na referência, com a mesma quebra.

**`Template.familia`**: o molde declara a identidade que PRESSUPÕE e o
diálogo troca o seletor ao escolhê-lo — "Print de post" montado na paleta
azul da casa vira outra coisa. Continua editável ao lado; o molde e a
família seguem independentes por desenho.

De passagem, `MOLDE_KEYS` virou lista ÚNICA em `types.ts`: três telas
repetiam o array à mão, então acrescentar um molde acertava o tipo e
deixava os filtros do dashboard para trás, em silêncio.

### O segundo desenho: "Post largo" (16/09)

A segunda referência é o mesmo GÊNERO com outro desenho, e a diferença é
grande demais para ser ajuste da primeira: margem lateral 88 → **72** (o
texto ocupa quase a largura toda), entrelinha 1,28 → **1,37**, avatar
colado ao nome (35 → **18**), halo claro em volta da foto, a imagem
acompanhando a margem do texto em vez de recuada, e uma **colagem de duas
fotos** no lugar da captura única. Virou a família `post-largo` + o molde
`molde-historia`; as medidas convivem em `TABELAS`, e `medidasPost(pose,
tipo, estilo)` escolhe — sem estilo declarado continua o desenhado, então
nenhuma peça antiga muda.

**A fonte é Inter, não a original.** A referência foi capturada num
Windows (a stack do app cai em Segoe UI); Inter é a grotesca livre mais
próxima em proporção, já é self-hosted, e a exportação precisa de fonte
DETERMINÍSTICA — fonte de sistema faria o PNG mudar de máquina para
máquina.

**`DocFrame.imagens.slot2`** (aditivo): só o formato que declara
`gapGaleria > 0` desenha a segunda foto; nas outras identidades ela fica
**guardada sem aparecer** — trocar de identidade não pode apagar o que
alguém enviou. O painel Mídia ganhou o alternador 1ª|2ª (que troca o
destino de upload, banco e IA) e o `ImageFloat` passou a operar na foto
SELECIONADA (`imgSel.slot`): ajustar sempre a primeira deixaria a segunda
sem enquadramento, e foto sem enquadrar sai errada no export sem nada
avisar.

**Verificado renderizando**: as quebras de linha saíram IDÊNTICAS às da
referência nos dois slides longos — é a prova mais forte de que fonte,
corpo e margem batem. Posições medidas: avatar 6,7%–17,0% (ref
7,5%–18,1%), texto começando em 22,5% (ref 21,2%), colagem de 58,5% a
94,5% da altura (ref 57,8%–94,7%). O único ajuste que o render pediu foi a
subida óptica: 1,5% deixava o bloco alto; medida nos cinco slides, é
**0,8%** (contra 3% no desenhado). E, revisando o primeiro formato com uma
imagem clara no slot, apareceu que a captura parava a 2,1% da borda
inferior contra ~1,2% da referência — daí `rodape` separado do `topo`: é o
quase-corte que faz o slide parecer um print, não um card com moldura.

## Estúdio — a prévia do template e a identidade Neon (16/09, migration 20261157)

**A prateleira de templates mostrava a peça errada.** Os três construtores
de prévia (`template-card`, "Meus templates" na home e no diálogo) montavam
o documento com `novoDocumento`/`documentoDeEstrutura`, que nascem na
família PADRÃO, e nenhum chamava `aplicarFamilia` — enquanto escolher o
molde APLICA a identidade que ele pressupõe (`Template.familia` +
`setFamilia`). O "Print de post" (preto, cartão de perfil, sem contador)
aparecia como slide azul da casa e o clique entregava outra coisa. Não
quebrava teste: os dois documentos são válidos, só de identidades
diferentes. Regra em `previa-de-template.ts` (puro, 11 testes) com a cascata
declarada — **o que foi GRAVADO com o template > o que o molde base
pressupõe > a padrão**. Derivar do molde não basta: a identidade é escolha
da PEÇA, e dois templates do mesmo molde base podem ter capas opostas, daí
`MeuTemplate.familia` persistido (degrada com retry sem a coluna nos três
verbos). A legenda do card pousa no campo que a capa DESENHA (`subtitulo`
nas famílias da casa, `corpo` no cartão de perfil — escrever no errado fazia
a descrição sumir em silêncio) e a prévia da home recebe o brand kit, senão
o cartão de perfil sai com avatar vazio.

**A fonte de quem simula um post é a da PLATAFORMA.** O X usa Chirp
(proprietária, não embarcável) e declara a pilha `Segoe UI, Roboto,
Helvetica, Arial`; os apps nativos entregam SF Pro/Roboto — todas grotescas.
Inter é o substituto livre apontado nas comparações, já é self-hosted e
mantém a exportação determinística (fonte de sistema faria o PNG mudar de
máquina para máquina). **Poppins saiu**: é geométrica (Futura), com `a` de
um andar só e bojo circular — nenhuma interface social usa isso no corpo do
post, e é esse detalhe que faz a peça ler como card de Canva. As duas
famílias de print passam a usar a mesma pilha, o que é o certo: elas simulam
a MESMA interface, e o que as separa é a métrica. Os arquivos, os
`@font-face` e as entradas da exportação foram removidos juntos.

**Identidade `neon`** — **SUPERADA em 16/09** pela `manchete` (seção "a
identidade Manchete corrige a que foi feita de descrição", no fim deste
arquivo): com os cinco slides da referência em mãos, ela errava em seis
eixos e o `brilhoImagem` foi REMOVIDO do código. O que está abaixo é o
registro do que foi construído da descrição — bloco preto com
título condensado em caixa alta alternando azul elétrico e branco (pelo
`**palavra**` que já existia), foto recortada com brilho, **um** slide claro
de respiro no meio (`respiroClaro` — não é a alternância do Alternado) e
caixa sólida no fecho (`cta: "bloco"`). `ritmoDeFundos` passou a valer para
toda família cujo fundo é função da POSIÇÃO, senão inserir um slide deixava
o respiro preso ao anterior. Renderizando apareceram: título BRANCO
invisível no slide claro (`cores.hook` é a tinta sobre o claro — mesmo
defeito que a Alternado pagou) e a capa sangrando a foto com véu, que mata o
brilho; e o teste pegou o terceiro — `aplicarFamilia` não REMOVIA a cor que
só a família anterior declara, então o `apoio` cinza da Neon sobrevivia à
troca e ia pintar o corpo dos slides claros da casa. **Limite declarado: as
medidas da Neon vêm da DESCRIÇÃO do formato, não do arquivo da referência** —
ao contrário das duas famílias de print, que têm tabela de/para medida pixel
a pixel.

## O relógio da fase 1 no cron: três comentários que eram falsos (16/09)

Fase 0 do plano do leque do Curador — seis defeitos de produção que valem
por si. Medidos em `email_generation_runs` antes de qualquer linha de
código; as queries estão em `DIAGNOSTICO_fase1_relogio.sql`.

**A conta que dimensionava o tick (`45s + 240s ≤ maxDuration 300s`) era
falsa.** A fase 1 de UM e-mail leva **363s de mediana, 681s no p90, 1213s no
máximo** (43 e-mails, 14 dias) — e não é retomável no meio. O cron sobrevivia
morrendo: a função era morta aos 300s, o lease expirava, outro tick reclamava
o job e o e-mail **recomeçava pagando o Curador de novo**. `maxDuration` foi
para **800** (o teto da Vercel, o mesmo das rotas de fase 2), com
`CRON_MAX_DURATION_S` no serviço e um teste que lê o arquivo da rota e
compara — o Next exige literal, então os dois números só ficam juntos por
verificação.

**`comOrcamentoDeFase1` nunca era aberto no dispatch**: `restanteDoOrcamento()`
devolvia `null` e TODO o guard de `fase1-orcamento.ts` era código morto
justamente em produção (o módulo só rodava na aba Teste e em três rotas do
Catalogador). `JANELA_DO_TICK_MS`, `TICK_BUDGET_MS` e `LEASE_MS` agora derivam
do `maxDuration` — o lease pelo motivo certo: **um tick não pode segurar o
job por mais tempo do que a função dele vive**, e amarrá-lo à latência de um
agente é o que o fazia envelhecer a cada troca de modelo.

**`CUSTO_TIPICO_MS` × teto de tokens.** As duas perguntas são diferentes: o
teto é o RELÓGIO (o provedor reserva `prompt + max_tokens` em voo), o medido
é "vale a pena começar". `cabeNaJanela` usava o teto e era pessimista por 3×
— o Curador tem teto de 32.000 tokens (371s pela conta) e escreve ~12.000
(210s). Estimar pelo teto **e** reservar para o Curador é pedir duas vezes o
mesmo tempo: foi assim que o Estruturador parou de rodar em 11/09.
`RESERVA_POS_ESTRUTURADOR_MS` subiu 150 → **400s** (o Curador medido está em
336s no p90, não nos 97s de n=3 que o comentário citava) e só fecha porque o
custo do Estruturador virou medido (270s). Um teste reprova quem
"simplificar" de volta para `relogioParaTeto`. **Trocar o modelo de um
agente da fase 1 obriga a remedir.**

**Abrir o orçamento criou um caminho de falha novo, e ele foi fechado
junto**: `invokeAgent` LANÇA "sem orçamento" quando a janela acaba, e o laço
do pré-passo do Seletor não tem `try` por e-mail — o throw abortaria o
pré-passo inteiro e os e-mails seguintes iriam para a fase 1 **sem alvo, em
silêncio**. A guarda agora vem antes da chamada e o resultado traz
`semOrcamento`, que **não é `skipped`**: eles não foram dispensados, foram
adiados, e o próximo tick reusa o que já saiu (`catalog_sha8`) e continua.

**A ordem dos e-mails do job não vinha de lugar nenhum.** O enqueue lia
`email_flow_emails` sem `.order()`; **três jobs** têm o welcome gravado como
`2,5,8,6,4,1,3,7` — a mesma permutação nos três, porque era a ordem
determinística do PostgREST. Ela é decisão, não apresentação: o pré-passo do
Seletor roda em sequência e welcome-2 recebe o `ja_atacadas` de welcome-1.
`ordemDosEmails` é a fonte única — o enqueue ordena o que grava e o tick
reordena o que lê, porque o array desordenado mora no JSONB dos jobs antigos
e nenhuma migration o alcança.

**`logCuradorChoice` era `void`** — em serverless a promise solta morre no
congelamento (a armadilha dos eventos de conversão da Meta), e a tabela que
deveria registrar toda escolha registrava as que dessem sorte. Agora é
`await`, **depois** da persistência e só quando `source === "code"`: escolha
de montagem recusada (lacuna fatal ou cobertura insuficiente) não virou
e-mail nenhum, e gravá-la faria a janela de repetição tratar como entrega o
que foi descartado. Heartbeat passou a ser por e-mail dentro do lote — não é
o que impede a reclamação, é o que mantém o progresso visível num lote de 11
minutos.

**Honestidade sobre o risco**: a corrida de lease é **latente, não
observada** (dos 25 e-mails que pagaram o Curador duas vezes no mesmo batch,
a maioria é retry `error` → `success`), e o caminho do cron tem **1 job em 30
dias** — tudo vem passando pela aba Teste, que já tinha janela. Os defeitos
eram reais; nenhum estava queimando dinheiro esta semana.


## A via B falava a identidade da casa em toda peça (16/09)

Depois das três famílias novas, o prompt de imagem por slide
(`prompt-slide.ts`) continuava descrevendo a anatomia do azul da casa —
a única parte já sensível à família eram as FONTES. Achados, todos por
LER a saída do módulo, não por teste:

- **Contradição direta na Post**: o texto base abre com "fotografia real ou
  3D fotorrealista" e a direção da família diz "não é fotografia, é uma
  captura de tela"; a cena por papel pedia "objeto, ambiente ou gesto" e a
  mesma direção proíbe os dois; e a linha `- Fundo:` da casa mandava uma
  SEGUNDA cor de fundo depois de a anatomia já ter declarado o preto. Três
  pares de instruções opostas no mesmo prompt — o modelo obedece a uma ao
  acaso. `ESTILO_SUBSTITUI` e `CENA_DA_FAMILIA` declaram quem substitui a
  base em vez de somar a ela; o `- Fundo:` sai no cartão de perfil.
- **`**palavra**` ia CRU para o modelo** — é notação nossa (o renderer a
  pinta na cor de destaque) e o modelo escreveria os asteriscos dentro da
  imagem. Agora a copy vai limpa e o realce vira instrução de cor
  (`notaDeDestaque`). Vale para as três famílias que usam o realce.
- **O fundo do prompt divergia do renderer**: frame sem entrada em
  `fundoPorFrame` virava "gradiente" no prompt e `SLIDE.fundoClaro` na
  peça. O prompt descrevia um fundo que a peça não teria.
- **A anatomia do cartão de perfil** (avatar, nome com selo, `@handle`,
  texto, captura, pílula do CTA) sai das MEDIDAS de `formato-post.ts`, e o
  prompt declara explicitamente que NÃO há rodapé de marca nem contador —
  pedi-los faria o modelo desenhar o que denuncia que não é uma captura.
- Véu, raio do card, régua sob o título, forma do CTA (pílula · botão ·
  **caixa**) e a foto como BLOCO onde ela acende passaram a vir do traço.

**E o caminho "a partir de inspiração" criava na família errada**: a prévia
ao lado já mostrava a identidade escolhida e o `criar` não chamava
`comFamilia` — o mesmo defeito da prateleira de templates, no outro botão.

## "Rodar só este nó" deixou de ser botão inerte (16/09)

Dois defeitos na execução manual, nenhum dos dois dando erro.

**`stop_after` era declarado, validado, gravado — e nunca consultado na fase
1.** `deveParar` tinha UM call site em todo o repositório
(`phase2-runner`). Pedir `stop_after: "assembler_chooser"` criava a
execução, passava em `validarOverrides` e a fase 1 seguia até Montador →
Blueprint → Subject e, em `full_pipeline`, disparava a copy ao n8n. O
operador clicava e nada acontecia. Agora são cinco pontos em
`generate.service` (estruturador, assembler_chooser, assembler, blueprint,
subject), todos pelo helper `pararAqui`, que pausa a execução
(`stopped_at_node`) e devolve `pausada: true`;
`test-generation.service` propaga como `status: "paused"` e **bloqueia os
dois caminhos de gasto** — o dispatch de copy (com `rollbackClaim()` antes)
e o `triggerPhase2`. Parar sem bloquear os dois deixaria a bancada custando
a peça inteira.

**A lista é verificada, não afirmada**: `NOS_QUE_PARAM` declara quem tem
ponto de parada e um teste lê os dois arquivos e compara com os call sites
reais — mais um que garante que `deveParar` só é consultado de dentro do
`pararAqui`, senão a lista voltaria a ser comentário (o modo de falha que
ela fecha). `validarOverrides` RECUSA `stop_after` em nó real sem ponto de
parada: recusar é melhor que esconder o botão, porque quem pedir por `curl`
recebe a mesma resposta. A tela lê a MESMA régua (`podeRodarSoEsteNo`) e
mostra **o que o nó custou nesta execução** — medido, não estimado: custo
por nó varia com a loja e com a biblioteca, e uma tabela fixa envelheceria
em silêncio.

**O pin do Estruturador prometia uma coisa e entregava outra.** `gateFor`
devolve `disabled: true` também para o pinado, e o `generate.service` lia só
`.disabled` — pinar, que declara "a decisão gravada vale", caía no ramo de
desativado e a estrutura vinha do OUTLINE. `pinado` agora é separado de
`desligado` e desce até `decidirPelaJanela`, que já sabia reusar a decisão
vigente quando a janela aperta — o pin usa o MESMO caminho e a run já é
gravada como reuso. Pedido de quem está na tela vence a conta de tempo,
inclusive sem janela aberta (a bancada roda fora do cron), e
`verificarPins` exige decisão vigente: pin sem artefato é tão fatal quanto
desativar sem pin.

**Para que serve**: `overridesSoEsteNo("assembler_chooser")` custa o Curador
sozinho (~US$ 1,6) em vez dos US$ 3,89–5,16 de uma geração, repetível no
mesmo e-mail, sem imagem, sem copy, sem n8n e sem fase 2.

**Fora de `NOS_QUE_PARAM`, com o motivo**: `seletor` roda no pré-passo, fora
do `generate.service`; `copy_dispatch`/`copy` são assíncronos via n8n
("parar depois da copy" é não rodar a fase 2, que `stop_after` num nó da
fase 2 já faz); `image`, `copy_merge`, `background_fit`, `lint_envio`, `qa`
e `qavision` estão na fase 2 sem ponto de parada escrito — acrescentar é uma
linha em cada arquivo.

---

## Estúdio — prateleira enxuta e slide emprestado de outro molde (set/2026)

Relato com print da galeria: *"tire os templates antigos que estão tudo igual
e péssimos"*. Eram cinco — Turbo, Benchmark, Lista prática, MEC e Bastidor —,
**sequências diferentes desenhadas todas na identidade azul da casa**: cinco
cartões iguais em que a escolha não mudava a peça. Medido antes de apagar:
**zero documentos e zero templates do time no banco**, então a retirada não
alcança dado nenhum. Ficam os três que DECLARAM identidade (`Template.familia`):
Print de post, História em posts e Tese em manchete.

**O vocabulário de CLASSIFICAÇÃO não foi mexido.** `MoldeKey` (Turbo, MEC,
Benchmark, Lista, Bastidor, Post, Manchete) é o que classifica post PUBLICADO no
dashboard — outro eixo. `montarMoldes` derivava as linhas de `ST_TEMPLATES`:
aposentar um molde apagaria da tabela os posts classificados com ele, em
silêncio, com o post intacto no banco. Agora a lista vem de `MOLDE_KEYS`, nome
e descrição saem do molde quando ele existe, e a chave sem molde vivo aparece
como "aposentado" enquanto tiver post.

**Id de molde escrito à mão é o modo de falha desta parte.** `getTemplate`
cai no primeiro da prateleira sem erro: a peça nasce com outra sequência e
outra identidade, calada. Por isso o caminho da IA passou a derivar de
`etapaFunil` (`templatePorFunil`), os defaults viraram `TEMPLATE_PADRAO_ID`, a
lista de moldes nos prompts de leitura de inspiração é gerada de `ST_TEMPLATES`
e um teste confere `PROMPTS_PRONTOS[].tpl` contra a prateleira. Etapa sem molde
não desenha cabeçalho órfão na galeria.

**Os campos de marca passaram a se chamar pelo que a IDENTIDADE desenha**
(`rotulos-de-marca.ts`, puro, 10 testes): no cartão de perfil `brandName` é o
**@ (arroba)** e `brandName2` é o **nome exibido** — com "brand-name" na tela
ninguém achava onde editar a arroba, que foi o pedido literal. `handleComArroba`
põe o @ que falta e **uma arroba sozinha esvazia o campo** (senão sobra um "@"
preso no slide). O `copyright` sai da lista nas famílias de print: elas não têm
rodapé, e campo que não aparece é lido como editor quebrado. O selo verificado
diz ONDE aparece e fica desabilitado na Manchete, que não desenha assinatura no
slide.

**Slide emprestado de outro molde** (`slide-de-outro-template.ts`, puro, 15
testes) — o gesto que faltava entre "Adicionar" (branco) e "Trocar" (tipo e
variação). Duas ações, e a diferença é o que acontece com a COPY: `importarSlide`
INSERE um passo com texto-guia (molde é forma, não conteúdo) e
`aplicarSlideNoFrame` troca o FORMATO do slide atual **preservando o que o
operador escreveu** — é o "usar outro formato de capa". Regras: `frameId` novo
(`fundoPorFrame`, `estilos` e imagens são chaveados por ele, e os moldes usam
`f1`, `f2`…); o fundo sai de `ritmoDeFundos` do DESTINO (importar da Manchete não
traz o preto); slot só onde o tipo desenha foto; a variação volta ao padrão
(ela endereçava o desenho do molde anterior); a imagem FICA quando o formato
novo não tem slot. Na tela: "Adicionar" virou menu com miniaturas REAIS do
documento de destino, e "Trocar" ganhou "Formato de outro molde" — aberto
também para o CTA, com o seletor de tipo fechado em capa e CTA.

**O conjunto de campos é da IDENTIDADE, não do molde** (`campos-da-identidade.ts`,
puro, 10 testes). Achado RENDERIZANDO: aplicar a capa da Manchete (`titulo` +
`subtitulo`) num carrossel Post **apagou o parágrafo da tela** — o renderer do
cartão de perfil desenha `titulo` e `corpo` e mais nada. `camposPost` já
declarava isso e **nada consumia**. Agora `camposDaIdentidade` decide e
`reconciliarCampos` MIGRA o texto do campo que sai para o que fica, de forma
simétrica (ir e voltar devolve o parágrafo ao campo de origem). Ligado em
`trocarTipoFrame`, nas duas ações de empréstimo e em **`aplicarFamilia`** — que
até aqui trocava a identidade e deixava o subtítulo da capa no documento,
invisível na tela, sem erro nenhum.

**A capa da Neon SEM foto encolhia e se centralizava** — com `flex: 1` no
bloco vazio ela virava um retângulo tracejado oco com a frase espremida no
rodapé, e é assim que ela aparecia na prateleira, onde nenhum molde tem
foto. **Esse ramo saiu do código em 16/09** junto com o `brilhoImagem` que o
guardava: a capa da Manchete sangra a foto com véu, como as da casa.

*A fonte do print continua sendo Inter* à frente da pilha que o próprio X
declara (`Segoe UI, Roboto, Helvetica, Arial`): Chirp é proprietária e não
pode ser embarcada, e a exportação precisa de fonte determinística.

*Verificado renderizando* (`renderToStaticMarkup` + Chromium) os três cartões
da prateleira e os dois sentidos do empréstimo (capa da Manchete num Post,
"Por que funciona" do Post numa Manchete). Foi o render que pegou a perda de
copy acima — nenhum teste quebrava.

---

## Estúdio — a identidade "Manchete" corrige a que foi feita de descrição (set/2026)

A família `neon` tinha sido construída a partir da DESCRIÇÃO escrita de uma
referência que não estava em mãos, com o limite declarado no fim do próprio
documento ("as medidas NÃO foram tiradas da referência"). Com os cinco
slides na mesa (o carrossel "DATAS SAZONAIS foram criadas para você vender
mais" / Black Friday), ela errava em **seis eixos**, e não por pouco: dizia
peça toda PRETA com foto ACESA; a real é toda BRANCA com dois escuros (capa
e slide do problema), foto sem brilho nenhum, preto e branco PUROS, título
preto/branco com o azul só em realce pontual, régua apenas no fecho, e a
marca reduzida ao ÍCONE no topo. Virou `manchete` + molde `molde-manchete`
("Tese em manchete"); de/para completo em
`docs/conteudo/formatos/manchete.md`.

**Substituir em vez de somar uma sexta família foi decisão de DADO**: o
banco tem zero documentos e zero templates do time, então renomear a chave,
o molde e o `MoldeKey` não alcança nenhuma linha. As medidas moram em
`formato-manchete.ts` e a procedência delas é declarada no topo do módulo —
**lidas da referência renderizada**, um degrau acima da `neon` (só descrição)
e um abaixo dos prints de tweet (tabela pixel a pixel do arquivo).

**A escada do título é o que dá o tom de manchete**: cada linha um passo
menor (`ESCADA = [1, 0.66, 0.56, 0.5]`, aplicada em `em` para o auto-fit
continuar escalando a escada inteira). Dois limites declarados, os dois
LIDOS e não inventados: ela **vale só no fundo escuro** (os dois slides
pretos a têm, os três brancos trazem o título todo do mesmo corpo — é a
diferença entre o modo "manchete" e o modo "artigo" dentro da mesma peça) e
é sempre **decrescente** (o slide do problema põe a frase entre aspas no
meio, MAIOR que as vizinhas; reproduzir isso exigiria marcar a linha
protagonista, campo que ninguém pediu). A quebra é a do TEXTO (`\n`), nunca
a automática — quebra automática não tem como receber corpo diferente.

**`respiroEscuro` é o inverso do `respiroClaro`**: a peça é CLARA e o preto
é o corte, na capa e no slide do meio (`Math.floor(total / 2)`). Sem saber o
total, só a capa escurece — inventar a posição do corte o poria no slide
errado, e corte no lugar errado é pior que nenhum; peça com menos de 4
slides não tem o segundo escuro.

**A caixa de destaque é campo novo com gate DUPLO**: o tipo de frame
(`DESENHA.destaque` — fora da capa e do fecho, onde competiria com o próprio
título) **e** a família (`camposOpcionaisDaPeca` só o oferece onde
`traco.caixaDeDestaque`). Campo que a identidade não desenha é campo
fantasma: o operador escreve e nada aparece, sem erro nenhum.

**O campo `destaque` tinha uma segunda porta para virar fantasma**:
`preservarCamposOpcionais` julga pelo TIPO do frame, então trocar da
Manchete para qualquer outra identidade levava a caixa junto — no
documento, invisível na tela, sem erro nenhum, que é exatamente o que o
gate do painel fecha. `reconciliarCampos` passou a receber
`DesenhoDaIdentidade` (sem valor padrão: chamada nova é obrigada a
decidir), tira o campo e **guarda o texto**; quem volta à Manchete recebe a
caixa de volta escrita. Apagar seria perder copy na troca de identidade.

**`brilhoImagem` foi REMOVIDO, não zerado.** Era o traço mais visível da
`neon` (90 px de `box-shadow` na cor de destaque) e a referência o
desmentiu; com as seis famílias em 0 ele virava código morto com um ramo de
capa INTEIRO atrás (`capa && brilhoImagem > 0`) que ninguém alcança, mais
três ramos no prompt da via B e o helper `brilhoCor`. Traço que nenhuma
família liga, com layout próprio por trás, é convite a alguém ligá-lo e
receber uma capa que nunca foi desenhada na tela.

**O arnês de render mentiu a sessão inteira, em silêncio.** Ele substituía
`url(/fonts/` e o `conteudo-slides.css` escreve `url("/fonts/...")` **com
aspas**: **Barlow Condensed nunca carregou em render nenhum** — todas as
verificações visuais anteriores (Post, Post largo, prateleira, empréstimo)
rodaram no fallback Inter sem nada avisar, e são justamente as identidades
que existem para COPIAR a fonte. Corrigido para `/url\(("|')?\/fonts\//`. A
lição operacional é a mesma do `EMAIL_QA_ENABLED` e da chave em branco do
Serper: fallback não avisa, e "a fonte está no CSS" nunca é prova de que ela
carregou — quem responde é o render, olhando.

---

## O leque do Curador: uma chamada por posição (16/09, migration 20261158)

O Curador decide TODAS as posições numa chamada só e é o 2º maior gasto do
pipeline (US$ 33,54 em 53 runs em setembro). O leque quebra isso: uma
chamada por posição, em série, prefixo cacheado e cauda fatiada pela seção.
**Nasce DESLIGADO** (`curador_leque_mode`, enum `off|on`); execução em
`docs/email-generation/execucao-plano-pipeline-set2026.md`, acompanhamento
em `DIAGNOSTICO_leque_do_curador.sql`.

**A conta ficou CONTRA ele, e mesmo assim entrou.** A projeção original
(−27%) é anterior ao catálogo enxuto e ao cache de prompt (14–15/09).
Refeita sobre a run `29c3f906`: entrada 38.370 (×1,0) + escrita de cache
56.906 (×1,25) + saída 11.933 (×5) = **US$ 1,69**. O leque paga o mesmo
prefixo de 57k **6 vezes** em vez de 1 → ~+23% de entrada. Decisão do dono:
terminar o leque (o ganho buscado é de DECISÃO) e atacar o cache depois,
quando houver 6 leitores em vez de 0. O veredito de ligar sai da bancada da
Fase 1a — dois cliques em "Rodar só este nó", que custam o Curador sozinho.

**Achado que a medição entregou**: `cache_user_prefix` é incondicional e a
shortlist é pulada em ~2/3 das runs, então 56.906 tokens são escritos a
+25% **sem nenhum leitor** — US$ 0,14 por e-mail. É a primeira linha da
fase do cache.

**O que não pode regredir:**

- **O prompt do leque é DERIVADO do vivo** (`montarLequeUser`): remoção de
  blocos nomeados + troca de duas frases. Escrever um segundo template faz
  as versões divergirem no primeiro ajuste; tag ou frase ausente **LANÇA**,
  e o leque desliga naquela geração (`leque_indisponivel`) — renomear
  `<notas_de_secao>` serviria a nota de TODAS as seções em toda posição,
  calado.
- **`{{catalogo}}` sai do system.** Com ele lá, ou é o inteiro (e a fatia
  não existe) ou o system muda por posição — e o cache é hierárquico, então
  system diferente mata o cache do user inteiro.
- **As regras de conjunto foram reescritas contra `<ja_decididas>`, não
  apagadas.** Tirar o dado sem tirar a regra é o que `momento` e `exige` já
  custaram aqui. Não existe `<ainda_por_decidir>`: a sequência já está em
  `<estrutura_do_email>`, no prefixo, e duas listas da mesma coisa viram
  contradição quando uma muda.
- **`block_index` e `section` são do CÓDIGO.** O eco do modelo vira registro
  (`eco_divergente`), nunca reendereçamento — aceitá-lo montaria a variante
  da posição 2 na 4.
- **`try` por POSIÇÃO.** No caminho de hoje qualquer erro devolve `null` e o
  caller mata a geração; com N chamadas isso perderia as decisões já
  tomadas. A posição que falha vira vazia e NÃO entra no `<ja_decididas>` da
  seguinte.
- **A reserva existe porque `SHADOW_TOP_N = 1`** — três mecanismos procuram
  um rank 2 que nunca existe e só sabem apagar a posição.
- **A saída costurada é o MESMO `CuradorVaultOutput`.** Um segundo formato
  faria o leque precisar de um segundo caminho de conformidade, medição e
  telemetria. O fio vem do Estruturador (`recorteDaDecisao`): nenhuma
  chamada vê o e-mail inteiro.
- **A shortlist NÃO roda no leque** — com a fatia, cada posição já vê só as
  dela, e mantê-la custaria um segundo system na mesma run (ela precisa do
  catálogo) e com isso o cache do prefixo.
- **Sem `shadow` no gate.** Rodar o laço em paralelo pagaria o Curador duas
  vezes por geração e gravaria uma segunda run que a RPC do Estúdio
  (DISTINCT ON) esconderia. Valor no enum que nenhum código executa é a
  armadilha que este repo já pagou três vezes.

**A janela de 3 e-mails (roda em SHADOW)**: `loadEscolhasRecentesPorSecao`
deduplica por `email_number` — a tabela é append-only com 3,2 linhas por
e-mail, e "as últimas 3 por `created_at`" devolveria três regerações do
mesmo. Ela entra **antes** do filtro por requisito (fail-open no conjunto, e
depois dele a janela seria anulada em silêncio) e **afrouxa por ESCASSEZ,
não por zero**: com 2 posições `body` e 4 variantes, bloquear 3 deixa as
duas com a MESMA variante. `janelaAfrouxada` vira pauta `biblioteca_escassa`
com chave FIXA por (flow, seção) — sem ela cada loja abriria um balde e o
limiar de 3 nunca seria atingido.

**Consertos que o leque expôs e valem sozinhos**: `restrictRankingToShortlist`
mutava o argumento; `finalistTypeIndex` aceitava tipo `""` (e aí o marcador
nasce `cfy:block:{i}:` e a hero some do localizador); **as 7 chaves do
`TELEMETRY_CONTRACT` que o caminho do VAULT nunca gravou** (ele exige 9 e
gravava 2 — os testes passavam porque exercitavam o Curador legado);
`orcamento_esgotado` como 5º motivo de posição sem variante (chamada que não
aconteceu NÃO é lacuna de biblioteca, e confundi-las manda a curadoria
cadastrar bloco para resolver timeout); `ordenarCandidatas` extraída do
`menosIncompativel`; `loadEstruturasDosOutrosEmails` limitado aos 3
anteriores; e `aplicarOrcamentoDaCauda` passou a **parar na primeira nota
que não cabe** — antes pulava e servia as menores, premiando nota CURTA em
vez de nota bem colocada.

## O leque continua até acabar: durabilidade, teto por posição e o rótulo certo (16/09)

Três correções para o leque poder ser LIGADO. A primeira nasceu de uma
proposta minha que estava errada: eu ia pôr um freio no laço (parar de
chamar ao ficar sem janela). O dono apontou que isso é limitador — o desenho
é uma chamada nova assim que a anterior termina, até acabar as posições. O
laço já fazia isso; o que faltava era **durabilidade**.

**Quem interrompe não é o laço, é o RUNTIME.** Quando o `maxDuration` acaba,
o processo é morto sem `catch`, sem `finally` e sem resposta, e as posições
já decididas morrem com ele — a invocação seguinte recomeçava do zero,
pagando o Curador inteiro de novo (US$ 1,69–2,45 medidos em 14–15/09). É o
mesmo defeito que o cron tinha antes da Fase 0. Agora
`curador-leque-progresso.ts` grava cada decisão assim que ela fecha
(`updateGenerationRun`, run em `running`) e a entrada do laço lê a run
anterior do MESMO (email_id, batch_id) e retoma da primeira posição sem
escolha gravada. "Continuar até acabar" passa a **atravessar** o limite do
runtime em vez de esbarrar nele.

A linha entre "já foi decidido" e "não chegou a acontecer" é o TIPO do erro,
não a presença de `variant_id` (`precisaRechamar`): `sem_escolha`,
`ids_fora_das_candidatas` e `repetida_sem_reserva` são veredictos — rechamar
gasta de novo pelo mesmo resultado, e ainda com um `<ja_decididas>`
diferente; só `chamada_falhou:` é refeito. A retomada **preserva o arco**: a
posição reaproveitada entra em `<ja_decididas>` da seguinte como se tivesse
acabado de ser tomada. Gravar é fail-open — falhar ao gravar não custa a
decisão, que ainda vai no fechamento da run.

**O risco de verdade não era o relógio, era CRÉDITO.** Cada chamada herdava
o teto de 32.000 tokens para escrever ~2.000, e o OpenRouter reserva
`prompt + max_tokens` em voo — a causa dos `402 in-flight` deste projeto
(duas runs do Curador mortas assim em 08–09/09). `tetoDaPosicao` derruba
isso para o piso já calibrado (8.192; **não** `teto/N`, porque o raciocínio
não encolhe com a fatia — o piso nasceu do Sonnet gastando 8.327 tokens
antes do JSON), e o relógio acompanha (~106 s em vez de 360 s). Junto,
`cache_user_prefix` deixou de ser incondicional: só liga com um SEGUNDO
leitor (`planoShortlist.chamar || usarLeque`) — com a shortlist pulada havia
UMA chamada e 56.906 tokens eram escritos a +25% para ninguém ler, US$ 0,14
por e-mail em ~2/3 das runs.

**A guarda de entrada estava com o sinal invertido.** Ela desligava o leque
quando a janela não cobria o custo do Curador inteiro (340 s) — e caía na
chamada única, que precisa de MAIS tempo. Com o progresso gravado, janela
curta deixou de ser motivo para não começar: o piso agora é o custo de UMA
posição, e só não vale começar quando não cabe nem ela.

**Timeout deixou de se chamar lacuna de biblioteca** (`causaDaLacuna`). As
duas causas descartam a referência igual (peça com buraco não representa a
decisão), e nada depois disso: `biblioteca` marca `failed:
lacuna_biblioteca`, settla a fila e vira pauta de cadastro no vault;
`relogio` devolve o `ReferenceSource` novo **`retomavel`**, que NÃO settla —
o e-mail volta para `pending` e a passada seguinte retoma. **Uma posição por
relógio basta para a causa ser `relogio`**: com a peça decidida pela metade,
qualquer veredito sobre a biblioteca é sobre o que ainda não foi perguntado.
O teste de exaustividade de `SETTLED_REFERENCE_SOURCES` obrigou a decisão
explícita, como foi escrito para fazer.

**A garantia "cada bloco sai com sua variante" já existia e foi medida**:
posição sem escolha cai no resgate por código (`menosIncompativel` entre as
elegíveis) e a biblioteca tem hoje **42 variantes ativas e 0 sem
dispositivo** — o pool existe em toda seção do welcome (os docs ainda diziam
"8 heroes sem dispositivo"; não é mais verdade). A hero é a posição 0, a
primeira do laço, e a única cuja ausência é fatal sozinha.

Acompanhamento: itens 8 e 9 de `DIAGNOSTICO_leque_do_curador.sql`. O gate
segue em `off`; ligar é `update email_generation_settings set
curador_leque_mode = 'on'` (sem UI, como `qa_mode` e `lint_mode`).

---

## Estúdio — família "Thread": o formato era a lacuna, não o construtor (set/2026)

Pedido: copiar o "Template Twitter" do construtor da referência (quatro
prints) **e** dizer o que a plataforma deles tem que a nossa não tem. A
segunda metade foi conferida painel a painel e a resposta é **nada**:
seletor de template, colar-e-aplicar (placeholder idêntico), campos globais
com olhinhos, "Clique em um texto no slide para editar estilo" (mesma
frase), slots de mídia numerados com "N de M slots", cores globais, fundo
por slide, liga/desliga do CTA, 9:16|4:5 com a mesma explicação, histórico,
grade de frames com menu ⋮, zoom, alta fidelidade e exportação PNG/JPG em
ZIP — tudo já existia, e daqui ainda saem o banco de imagens da org, a
geração pela ConvertIA, a colagem de duas fotos e o motor editorial. **A
lacuna era o FORMATO**, e é ele que a família `thread` + o molde
`molde-thread` entregam. De/para completo em
`docs/conteudo/formatos/thread.md`.

**Não é variação do print de tweet.** A `post` simula UM post; a `thread`
simula peça EDITORIAL com cara de thread: cartão **branco**, barra de
metadados no topo (`@handle` · marca · copyright), bloco de autoria, e um
fio de parágrafos com foto no meio — `titulo` é o parágrafo ANTES da foto e
`corpo` o de DEPOIS. O fecho é um slide **preto** com avatar, handle e a
frase sozinha; `camposThread("cta")` devolve só `titulo`, porque `botao` ali
seria campo fantasma (o cartão de perfil desenha botão no fecho, e herdar o
conjunto dele era o defeito que `DesenhoDeCampos` — objeto, não booleano —
fecha). `temBarraDeMetadados` tira a barra do fecho: repetir a marca no
slide que existe para deixar uma frase sozinha é o contrário do formato.

**As medidas saem do print, e a conta fica no código**: o cartão mede 459 px
de tela para uma peça de 1080, ou seja `ESCALA_DO_PRINT = 0,425`, e `doTela()`
converte. Procedência declarada — mesma classe das duas famílias de print,
um degrau abaixo de ter o arquivo.

**A fonte é decisão de procedência, não de gosto** (a pergunta do usuário:
"está simulando um post, qual seria a fonte ideal?"). Chirp, do X, é
proprietária e não pode ser embarcada; a própria aplicação declara a pilha
`Segoe UI, Roboto, Helvetica, Arial` — todas **grotescas** —, e Inter é a
grotesca livre mais próxima em proporção, já self-hosted, que mantém a
exportação DETERMINÍSTICA. As três famílias de print usam a MESMA pilha:
simulam a mesma interface, e o que as separa é a métrica. **Poppins saiu do
repo** por isto: é geométrica (Futura), `a` de um andar e bojo circular —
nenhuma interface social usa isso no corpo, e é esse detalhe que faz a peça
ler como "montada num gerador". O **peso** também é medido:
`THREAD_PESO_CORPO = 600`, porque na referência o fio é semibold e com 400 o
cartão perde a ênfase que marca o argumento.

**Duas listas escritas à mão descartavam a família nova em silêncio** — o
padrão de falha desta parte do código, agora com teste em cada porta:

1. `ehFamilia` era um `||` à mão; `thread` caía em `padrao` e a prateleira
   mostrava a peça errada (foi `previa-de-template.test.ts` que pegou).
   Agora deriva de `FAMILIAS`.
2. `aplicarFamilia` decidia recalcular o fundo por uma LISTA de traços
   (`alternaFundo`/`cartaoPerfil`/`respiroEscuro`) e `cartaoThread` ficou
   fora: o fecho herdava o "gradiente" da casa e saía **branco com texto
   branco** — invisível, sem erro nenhum. A decisão passou a ser pelo
   RESULTADO (compara o padrão posicional antigo com o novo), o que vale
   para toda identidade futura sem ninguém lembrar de editar a lista.
3. `FAMILIA_OPCOES` — a terceira, e a de preço mais peculiar: a identidade
   existia INTEIRA (tipo, mapa, molde) e a peça nascia certa ao escolher o
   molde, mas ela **não podia ser escolhida** em Marca → Identidade visual
   nem no diálogo de criação. Agora deriva de `FAMILIAS`, na ordem em que
   elas são declaradas lá.

**Limites próprios** (`LIMITES_THREAD`): o fio chega a quatro parágrafos na
referência, e o limite do TIPO — desenhado para afirmação curta — encolheria
a letra sem necessidade.

**O chrome da interface não é a paleta da peça**: o selo verificado estava
preso a `doc.cores.destaque` — trocar a cor global do documento o deixaria
vermelho, e nenhuma rede faz isso; virou constante da família, como a `post`
já fazia. E avatar sem foto passou a mostrar a INICIAL: círculo cinza chapado
lê como imagem que não carregou, e era o que a PRATELEIRA exibia (é lá que
nenhum molde tem avatar).

*Verificado renderizando*: a capa quebra a linha IDÊNTICA à referência, o
slide 2 casa com o terceiro print, e o fecho só ficou certo depois de
`fechoTexto` 46 → 52, porque a quebra saía uma palavra depois — defeito que
nenhum teste pegaria. As quatro capas da prateleira foram renderizadas
juntas: cada molde aparece na identidade que ele dá, que era a queixa da
thumb que "não condiz com a realidade".

## Conteúdo — Raio-X e Espionagem: o número que diz de onde veio (set/2026)

Duas telas copiadas de uma ferramenta que o time assinou, cada uma com o eixo
de melhoria declarado. De/para completo em
`docs/conteudo/raio-x-e-espionagem.md`.

**A medição veio antes do código, e mudou o desenho**: 90 posts sincronizados
e **0 classificados**, 0 brand kits, 0 templates do time, 2 documentos, e
`conteudo_trends` em **0 linhas** — o radar "Em alta" nunca rodou porque
**não existe cron para ele**. As duas telas foram desenhadas para funcionar
NESSE estado: nenhuma exige classificação para mostrar número, e o que
depende dela diz que depende.

**Raio-X** (`raio-x/nota.ts`, puro). A referência mostra "48 de 100" e mais
nada — não dá para saber o que entrou na conta, e um perfil cujos insights a
Meta não entregou aparece como perfil RUIM. Três regras:

1. **Componente não medido sai do DENOMINADOR**, nunca entra como zero —
   penalizar o não medido é inventar defeito. A saída declara `medidos` de
   `total` e a tela é obrigada a dizer isso.
2. **Nada medido ⇒ `nota: null`**, jamais 0 (zero se lê como "péssimo"; a
   verdade é "não dá para dizer").
3. **Toda referência é DECLARADA e tem dono**: meta semanal do canal (dado
   nosso), mediana publicada com a fonte nomeada, ou o teto que o próprio
   perfil já provou. Alvo inventado não existe — e por isso o **mix de
   formato**, que não tem referência honesta, ficou FORA da nota e vive no
   diagnóstico.

Constância 30 · Engajamento 25 · Retenção 25 · Conversão 20. A aritmética que
os testes travam: `taxaMediaPorPost` é média POR POST (é a forma das medianas
publicadas — somar o período e dividir por seguidores daria número
incomparável com fonte nenhuma); `retencaoDoPeriodo` é **soma ÷ soma**, nunca
média de razões; e o teto é a **mediana dos 3 melhores**, não o melhor
sozinho — um post de alcance 40 com 2 sends rende 5% e viraria teto que
ninguém alcança, o alarme falso que ensina a ignorar o alarme (`ALCANCE_MINIMO
= 30` é o mesmo cuidado do outro lado). O diagnóstico tem 8 lacunas, cada uma
com evidência, custo, saída e o botão que leva ao lugar certo; lacuna sem
número medido não aparece.

Medido contra produção (@convertfy.me, 30 dias, 781 seguidores, 6 posts):
**72 (bom), 3 de 4 medidos** — Constância 47% (1,4 post/semana · meta 3),
Engajamento 100% (3,29% por post · Socialinsider 0,48%), Retenção 74% (0,28%
no período · os 3 melhores fazem 0,38%), Conversão NÃO MEDIDA. Os 3,29%
foram conferidos post a post.

**Espionagem** (`espionagem/analise.ts`, puro). A tela copiada ordena por
"mais quentes" = curtidas + comentários: num perfil de 68 mil seguidores isso
ranqueia o TAMANHO da conta, e o pior post de um perfil grande ganha do melhor
de um pequeno. Padrão aqui é **destaque** — quantas vezes o post passou da
MEDIANA do próprio perfil; abaixo de 5 posts não há destaque (com 3, "2,4× a
mediana" é ruído) e a ordem cai para o absoluto em vez de ficar arbitrária em
silêncio. **A fórmula é PARCIAL e a tela diz isso**: `business_discovery`
entrega curtidas e comentários e mais nada, então a comparação com o nosso
perfil roda na MESMA fórmula parcial dos dois lados — comparar a parcial dele
com a nossa completa inflaria o nosso lado por construção. **"Usar este tema"
leva o ASSUNTO, nunca a legenda**: levá-la traria a voz dele junto, que é a
diferença entre pesquisar e copiar. Conta pessoal/privada devolve `#110` e a
mensagem diz isso — "perfil inexistente" mandaria caçar erro de digitação que
não existe. Cache de 6 h por handle em `crm_channels.config.conteudo.espionagem`.

**Os dois defeitos que só o RENDER pegou**, nenhum quebrando teste: (a) a
barra de "não medido" saía VAZIA, que se lê exatamente como zero — o oposto
do que a regra 1 existe para dizer; `bg-[repeating-linear-gradient(...)]` como
classe arbitrária do Tailwind **não é aplicada**, virou `style` inline. (b) O
card exibia **"0,1×"** com a legenda "o seu perfil engaja 6,7× o deles" ao
lado — número contra a própria legenda; `compararComONosso` passou a devolver
`{ razao, vezes, quem, nota }`, com `vezes` sempre ≥ 1 na direção que a frase
afirma, e tem teste de regressão. O render também entregou o "1 comentários".

## Radar editorial: a tela pronta que nunca rodou (set/2026, migration 20261160)

`conteudo_trends` com **ZERO linhas** em produção. Não era bug de escrita —
era falta de gatilho: o painel "Em alta", o `gerarTrends`, a busca com fonte
conferida e a rota existiam desde set/2026 com **um botão** como única
entrada, e ninguém clicou. É a pior forma de defeito daqui: nada falha, a rota
responde 200 quando chamada e não é chamada, e na tela o sintoma é "não há
assunto em alta" — indistinguível de "rodou e não achou nada". Mapa completo
em `docs/conteudo/radar-editorial.md`.

**Cron diário** `/api/cron/conteudo-radar` (06:40 BRT), uma rodada por org
**com canal de Instagram ativo** (rodar para toda org gastaria busca + modelo
por dia para quem nunca abre o painel), fail-open por org. **Zero não é
sucesso**: havendo org e nenhuma tendo rodado, responde 500 — cron mudo
reportado como verde é como o `crm-snapshot` passou meses sem gravar linha.
Org pulada por "rodou há pouco" não conta como falha.

**O cron resolve o vazio e cria o problema oposto** — rodada que só acrescenta
vira arquivo. `trends/validade.ts` (puro, 9 testes): (1) **"em alta" é a
RODADA MAIS RECENTE, não uma janela de horas** — as linhas de uma rodada
compartilham o `gerado_em`, então o grupo é exato, e o **92 de três dias atrás
não fica acima do 88 de hoje** (decaimento por idade resolveria, mas a curva
seria inventada); (2) **expira em 14 dias ARQUIVANDO, não apagando** (quem
virou ideia mantém `trend_id`; os 14 dias são DECISÃO — duas voltas do ciclo
semanal do pipeline, passadas elas manter o assunto é mostrar ao time o que
ele já declinou); (3) **painel vazio depois de uma rodada NÃO é "nunca
gerado"** — a idade da última rodada é lida INCLUSIVE das arquivadas
(`ultimaRodada`), porque os dois estados pedem ações opostas. Data ilegível
**não expira** (apagar o não medido é a mesma família do "zero por não medir")
e o desempate final é por `id`, para a ordem ser estável entre renders.

**Procedência é da LINHA, não do ambiente de quem lê**: o rodapé dizia se a
busca está configurada AGORA, o que bastava com um botão (linha e leitura no
mesmo minuto) e deixa de bastar com cron diário. `fonte = 'interno'` marca a
rodada que aconteceu sem busca; na tela os dois caminhos sem link passam a se
distinguir — **"fonte não conferida"** (a busca rodou e `verificarFontes`
removeu o link inventado) × **"sem fato externo"** (não houve busca). A
referência marca "TEMA SENSÍVEL · CONFIRA AS FONTES" em bloco; aqui a linha
guarda a procedência e dá para ser preciso.

**Três limites que só o cron tornou necessários**: `jaTem` com teto de 24
(sem ele, duas semanas de rodadas mandariam ~80 títulos com "evite estes" e o
modelo raspa o fundo do barril); `listarTrends` ordena por `gerado_em` e não
por score, porque é essa ordem que decide quem sobrevive ao `limit 40` — um
top-40 por score cortaria a rodada de hoje se ela viesse com notas baixas (a
ordem da TELA é a do módulo puro); e `precisaRodar` recusa a segunda rodada do
dia, senão retry da plataforma custa duas chamadas de modelo (`?forcar=1` fura).

**O teste que fecha a classe**: `src/lib/crons-agendados.test.ts` — toda rota
em `src/app/api/cron/*` tem de ter horário em `vercel.json`, e todo horário
sob `/api/cron/` tem de apontar para rota existente. Cron que nunca dispara
não falha, ele não acontece. As 42 rotas de hoje estão agendadas; o teste
protege a próxima. (`sync-omnisend` aparece duas vezes de propósito — a
duplicata é medida pelo caminho COM querystring.)

**Não rodou ponta a ponta daqui**: o ambiente de desenvolvimento não tem
`OPENROUTER_API_KEY` nem chave de busca. Verificados: o CHECK aplicado em
produção, typecheck, suíte, build, e o painel renderizado nos três estados.

## A base do Obsidian entra no Estúdio (set/2026)

Medido antes de escrever: **256 notas aprovadas, 251 com vetor** — e o
Estúdio escrevia carrossel com **~40 palavras** de contexto hardcoded
(`contextoDaOrg`), sem consultar a base em ação nenhuma. A base cobre
exatamente os assuntos dos carrosséis da casa: 14 notas de flows, 14 de
deliverability, 12 de list-growth, 11 de copy, 11 de referências de e-mail,
5 de estruturas da casa, com 644 a 1.906 palavras cada. O ativo mais forte é
uma série de **16 notas de NÚMEROS** com valor verbatim, registro de origem e
linha do bruto — enquanto o motor editorial marcava `[confirmar]` toda vez
que não tinha número com fonte. Mapa em
`docs/conteudo/base-do-obsidian-no-estudio.md`.

`blocoConhecimento` é o terceiro bloco do `executarIA` e responde a outra
pergunta: **conhecimento = o que afirmar** (mecanismo, limites, números),
**referências = como escrever**, **fontes = que fato externo existe**. Usa
`buscarConhecimento`, a MESMA busca do `conhecimento_buscar` e do
`buscar_doutrina` — dois buscadores divergiriam e ninguém saberia por que o
Estúdio "não acha" o que a ConvertIA acha. Fail-open: base indisponível não
impede escrever carrossel.

**As cinco regras** (`lib/conteudo/conhecimento.ts`, puro, 18 testes):

1. **Procedência SEPARA o bloco em dois.** `Convertfy/*` e `Referencias/*` é
   como A CASA faz (afirmável em primeira pessoa); `Advisors/Max/*` é curso
   de terceiro. Trocar um pelo outro custa nos dois sentidos: "nós fazemos
   assim" sobre curso alheio é apropriação, "o mercado diz" sobre a casa joga
   fora a autoridade.
2. **Número de doutrina é BENCHMARK, nunca resultado nosso** — "3x por semana
   é o sweet spot" é o que o curso ensina, não o que a casa mediu; um slide
   que troque publica case falso.
3. **As três regras do corpus viajam com o número** (verbatim sem arredondar;
   `outro-narrador` NÃO é citável como fala do Max; nada de média — "o piso é
   3", nunca "cerca de 5"), e só quando uma tabela de número entra,
   reconhecida pelo NOME do arquivo: servi-las sempre vira ruído que o modelo
   aprende a pular.
4. **O corte NUNCA come a ressalva.** As notas da casa abrem com o resumo e
   FECHAM declarando o que não provam — a de welcome termina com "não a use
   para afirmar que esta estrutura converte mais que outra". Cortar pelo
   começo preserva o resumo e joga fora a ressalva, e a nota decapitada vira
   material para afirmar o que ela proíbe. `ressalvaDaNota` entra no
   orçamento ANTES do corpo. Linha de tabela partida ao meio também é barrada
   (`semLinhaPartida`) — "| 7 |" é lido como dado incompleto, não como texto
   faltando; apareceu ao LER o prompt montado com as notas reais.
5. **Path de nota inventado é REMOVIDO, como link inventado.**
   `verificarFontes` só confere o que começa com `http`, então servir a base
   sem uma segunda régua abriria a porta que a primeira fecha — e por um
   caminho pior, porque path interno parece mais confiável que link.
   `conferirNotasCitadas` confere contra os paths servidos.

**A busca por SIGNIFICADO é o que faz isto funcionar**, e foi medido: "carrinho
abandonado recuperacao" devolve **0** notas na full-text e "cart abandon"
devolve 3 (o corpus mistura PT e EN); três pautas naturais devolveram **0/3**,
porque o `websearch_to_tsquery` é AND e uma pauta de dez palavras exige as dez
na nota. Daí a consulta ir em **palavras-chave** (`consultaDaPauta`, a mesma
extração da busca na web — 0/3 → 1/3, e o vetor perde pouco) e o
`semanticaRodou: false` ser dito com força ("o que chegou é quase certamente
uma fração do que a base tem; NÃO conclua que a casa não trata o assunto") —
"pode estar incompleto" faria o modelo concluir o contrário.

**A triagem foi AUTORIZADA a usar a base**, não só servida: o prompt dizia
"só o que está no insumo ou nos resultados de busca", e servir o dado sem
mudar a regra é o erro que este repo já pagou duas vezes. Agora ele ensina a
citar o caminho EXATO da nota e avisa que caminho não servido é removido.

Na tela, o painel da triagem mostra **Fontes consultadas** (web) e **Base da
casa** (notas, com o rótulo `nossa doutrina` × `mercado`) separadas; zero
notas é resultado legítimo e é dito. `contextoDaOrg` (pautas, trends, ideias)
ganhou `assuntosDaBase` — o mapa de pastas com a contagem, para propor pauta
que a casa consegue SUSTENTAR. Custo medido: 5.949 chars no caso real, teto
de 3 notas / 9.000 chars; `pautas` usa teto menor (2 / 4.500).

## Cliente que paga pela LLC, e as duas verdades sobre o documento (set/2026)

Relatado com print: o campo **CPF/CNPJ** com `JFJA DIGITAL LLC 30 N GOULD ST
STE R` dentro — razão social e endereço americano no campo do documento,
porque não havia outro lugar — e o save recusado.

Medido antes de desenhar (56 clientes): 29 com documento, **1 com
`0000000000000000000000`** (a fuga: encher de zeros até o formulário deixar
passar), 25 com `asaas_customer_id` e nenhum documento aqui, e **zero** usos
do `skip_asaas` — o atalho do "000" que já existia na tela de criação com o
comentário *"for international clients"*. A necessidade era conhecida e
estava resolvida por gambiarra que ninguém descobriu.

**Seletor "Quem paga"**: Brasil (CPF/CNPJ, comportamento de sempre) ou
**empresa no exterior** (razão social obrigatória, Tax ID, país ISO,
endereço em uma linha). A régua é `lib/clients/pagador.ts` (puro, 18 testes)
e vale nas **três** portas que editam cliente — criar, editar e o painel de
configurações, que **não validava nada** e é por onde os 22 zeros entraram.
O JSX do bloco virou `components/clients/payer-fields.tsx`: duplicar o
formulário entre duas telas é a mesma assimetria, na camada de cima.

**O nome da LLC não pode morar em `cpf_cnpj`**: é por essa coluna que o Asaas
casa cliente (`listCustomers({cpfCnpj})`) e cria cadastro — texto livre ali
faz a busca comparar lixo e a criação mandar lixo ao provedor, que recusa
depois do save como aviso amarelo. Afrouxar a validação resolveria o sintoma
e quebraria a integração em silêncio. **O exterior não vai para o Asaas**
(ele exige CPF/CNPJ) e a tela DIZ o caminho que já existe: pagamento por fora
(`receiveInCash`). Vínculo existente **não é apagado** — quem migrou de BR
para LLC continua ligado ao histórico de faturas. O dado mora em
`custom_fields.pagador` (sem migration) e no modo BR a chave nem é gravada:
quem paga pelo exterior é uma consulta de uma linha.

**DV é aviso, não bloqueio**: bloquear criaria atrito retroativo (abrir
cadastro antigo com documento torto para mexer em outro campo passaria a não
salvar), e não deu para medir quantos DVs inválidos existem sem despejar CPF
no log. A régua fica onde dá para afirmar — tamanho e sequência repetida, os
dois medidos — e o DV aparece com o que significa: "o Asaas vai recusar".

**O achado paralelo: duas verdades sobre o documento.** A tela de CRIAÇÃO
gravava `cpf_cnpj` só em `custom_fields`; a de EDIÇÃO grava na coluna.
Resultado medido: **26 dos 56 têm o documento só no JSONB** — invisível para
o casamento de faturas, a exportação e o sync, que leem a coluna — e **6 têm
dígitos DIFERENTES** nos dois lugares. `documentoDoCliente` é a leitura
canônica (a coluna vence, o JSONB é fallback e some ao salvar — auto-cura
cadastro a cadastro); divergência de dígitos vira aviso com os dois valores,
porque escolher por código seria decidir quem é o cliente. Diferença só de
pontuação (5 dos 11) não é conflito. Ligado na ficha, na exportação (a
planilha saía vazia para metade da base), no casamento do sync e na criação.

**A sincronização deixou de travar por um CPF torto**: `customers/update`
mandava o documento como estivesse, o Asaas recusa a requisição INTEIRA, e
nome/email/telefone deixavam de sincronizar por causa dele — em silêncio.
Documento inválido agora é omitido (o provedor mantém o dele) com `log.warn`.

**Não endurecido de propósito**: o onboarding público, onde quem preenche é o
cliente final — bloquear o cadastro dele por documento torto o faz abandonar.
Documentação: `docs/clients/pagador-no-exterior.md`.

## O print de tweet contra a especificação do X (set/2026)

Pedido: olhar o componente Tweet do **Spell UI** (`spell.sh/docs/tweet`) e
ver o que dá para aproveitar. O domínio está bloqueado pelo proxy desta
sessão; a busca respondeu o que importava — o componente deles é o
**`react-tweet`** da Vercel, que replica o embed OFICIAL do X. O pacote foi
baixado do npm e LIDO (`twitter-theme/theme.css`, `tweet-header`,
`tweet-body`), em vez de responder de memória.

**Boa parte já batia**: avatar ÷ corpo 2,43 contra 2,40; espaço avatar→nome
÷ avatar 0,161 contra 0,167 no formato largo; nome e `@handle` no mesmo
corpo com pesos 700/400; `pre-wrap`; e o selo `#1D9BF0` **exato**. As
medidas NÃO foram trocadas: as nossas vieram do print da referência e o
`react-tweet` descreve o *embed* (corpo 20px em 550px de largura), que é
outro objeto — trocar uma referência medida por outra perderia o que o
pedido original mandou copiar.

**Duas cores estavam erradas**: o `@handle` era cinza NEUTRO (`#808080`) e o
do X é azulado (`#8B98A5` escuro, `#536471` claro) — sobre fundo escuro o
neutro lê como "desligado"; e o texto era branco puro, sendo `#F7F9F9`.

**Quatro temas** (`TEMAS_DO_X`): `print` (o medido na referência, **o
padrão** — zero regressão para a peça que já existe), `claro`, `dim`
(`#15202B`) e `escuro` (`#000000`). Tema claro era impossível antes, e é o
print mais comum. `aplicarTemaDoPost` segue a regra do `aplicarFamilia` (só
troca o que ainda é padrão do tema anterior) e leva o **fundo de cada
slide** junto — sem isso o texto claro do escuro ficaria sobre o branco do
claro, invisível e sem erro nenhum, que é o defeito que o cartão de thread
já pagou. Seletor em Marca → Identidade visual, só nas duas identidades que
simulam a rede.

**`@menção`, `#hashtag` e link saem em AZUL** (`entidades-do-x.ts`, puro, 13
testes) — é o detalhe que mais denuncia um print falso. As regras são da lib
**oficial** do Twitter (`twitter-text` 3.1.0), lida do pacote: menção precisa
de fronteira à esquerda (senão `joao@convertfy.me` sai com `@convertfy` azul
no meio de um e-mail), morre pelo que vem DEPOIS (`endMentionMatch`: `@`,
letra acentuada, `://`), vai até **20** caracteres (15 é o limite de
CADASTRO — foi onde meu palpite errou e a lib corrigiu), e hashtag só de
dígitos é TEXTO (senão data e preço viram link). **Comparado com o oráculo
oficial em 35 casos: 1 divergência**, a que está declarada (domínio solto,
que o X linka e nós não — reconhecê-lo faria "comprou.Depois" virar link).

**Métricas fabricadas ficaram de fora, de propósito.** O embed as mostra e
um print real também, mas o carrossel é feito ANTES de o post existir:
qualquer número ali seria inventado, e engajamento fabricado é conteúdo
falso, não enfeite. Fora também o ícone do X no canto (é o botão do *embed*,
não de uma captura) e a cashtag (`$` aparece em preço). O selo continua AZUL
no tema escuro — o `react-tweet` o pinta de branco ali, mas isso é decisão do
embed; no X e no print da referência ele é azul em qualquer tema.

A via B (`prompt-slide.ts`) passou a ler o tema: descrever "fundo quase
preto" numa peça no tema claro faria o modelo desenhar o oposto do que o
renderer mostra. Documentação:
`docs/conteudo/formatos/post-print-de-tweet.md`.

## Estúdio — "Card do X": o cartão completo, com as informações editáveis (17/09)

Pedido, depois de eu ter deixado as métricas de fora de propósito:
*"faça ficar idêntico literalmente mesmo que algo não fique funcional pois
vai virar png … para eu só editar img, texto e informações"*. Reafirmado o
pedido, a decisão é do dono: entrou a identidade `tweet` + o molde
`molde-tweet`, com moldura, logo do X no canto, linha de
`hora · data · visualizações` e a barra de contadores. De/para completo em
`docs/conteudo/formatos/card-do-x.md`.

**As medidas são LIDAS do embed oficial** (`react-tweet`, o que o Spell UI
usa por baixo), não medidas a olho: cartão de 550 px → 1000 px na base
1080, e todo valor é `medida_do_embed × 1,818`, gravado já convertido.
Conferido renderizando: cartão de 1000 px em x=40, texto de 36 px com
entrelinha de 43,2 px, ícones de 32 px, selo de 33 px, logo de 43 px.

**A peça é híbrida, e isso é declarado**: moldura, raio, logo e tipografia
vêm do embed; a fileira de MÉTRICAS embaixo vem do aplicativo — o embed tem
Curtir · Responder · Copiar link, que não tem número nenhum para editar.

**Três regras que erram em silêncio.** (1) **Nenhum contador nasce
preenchido** — cartão sem número é o que o X mostra num post recém-publicado,
e número semeado por nós seria engajamento inventado impresso na peça; o
exemplo fica no `placeholder`. (2) **Contador vazio FICA na barra**: tirá-lo
mudaria o espaçamento dos outros e a barra deixaria de ser a do X justamente
no slide sem número. (3) **Os cinco ícones saem em cinza e em contorno** —
no X, preenchido e colorido quer dizer "eu interagi", não "tem muita
curtida". A primeira versão pintava o coração de rosa ao ver um número, o
que conflata as duas coisas; foi o RENDER que mostrou, porque os traçados de
resposta e curtida vinham do embed (lá são botões, portanto preenchidos) e
saíam como manchas sólidas ao lado de três ícones em contorno. Nenhum teste
pega peso de ícone.

**As informações moram FORA de `campos`/`textos`** (`DocFrame.tweet`):
`Campo` é o conjunto de COPY — o que a IA escreve, o que `ST_LIMITES` limita
e o que o auto-fit encolhe —, e contador não é copy. Painel próprio em
Ajustes → Texto, por slide, com "Usar agora" (carimbo pt-BR) e "Usar em
todos os slides" — o carrossel simula um fio, e digitar cinco números em
cinco slides é o atrito que deixaria a barra vazia.

`titulo` e `corpo` são o 1º e o 2º PARÁGRAFO, mesmo corpo e mesmo peso (o X
não tem negrito no post); a divisão é a mesma do cartão de thread e é o que
deixa a foto entrar no meio. **Não há `botao`** — o cartão do X não tem, e o
fecho é o próprio texto. O limite é o da PLATAFORMA (280 divididos entre os
dois), não o do tipo de slide.

**Um campo fantasma pré-existente caiu junto**: `camposOpcionaisDaPeca`
oferecia gancho e anotação nas identidades que simulam uma rede (`post`,
`post-largo`, `thread`), onde o renderer tem UM desenho e não os desenha em
lugar nenhum — o operador escrevia, o texto era gravado e nunca aparecia.
`desenhaOpcionais` fecha os quatro, `reconciliarCampos` GUARDA o texto ao
tirá-los da lista (quem volta à identidade que os desenha recebe de volta
escrito), e `desenhoDaIdentidade(traco)` substituiu os três
`{ caixaDeDestaque: tr.caixaDeDestaque }` escritos à mão — era a mesma
lista-escrita-à-mão que `FAMILIA_OPCOES` e `ehFamilia` já pagaram.
`aplicarFamilia` passou a comparar `cartaoTweet` no `mesmoConjunto`: sem
isso, ir da casa para o X não reconciliaria os campos e o subtítulo da capa
ficaria no documento, invisível. **Sem variantes de layout**
(`variantesDoTipo` devolve `undefined`): o cartão cresce com o conteúdo e
fica centrado, sempre.

---

*Última atualização: Setembro 2026*
*Versões: Shopify 2024-10, Klaviyo revision 2025-10-15*
