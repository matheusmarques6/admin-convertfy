# Tracking System -- Documentacao Completa

Documentacao tecnica do sistema de rastreamento de encomendas do admin-convertfy.

---

## Visao Geral

O sistema de tracking permite que lojas ofereçam rastreamento de pedidos em tempo real para seus clientes. A arquitetura e composta por:

1. **Ingestao de dados** -- Webhooks do Shopify populam pedidos e codigos de rastreio
2. **Multi-provider cascade** -- Engine que consulta multiplos providers de rastreamento em sequencia
3. **Widget publico** -- Endpoint de lookup consumido por um widget JS instalado no site da loja
4. **Portal de gestao** -- Dashboard administrativo com config e visualizacao

```
Shopify Webhook ──→ tracking_orders + tracking_codes (DB)
                                          │
Cliente busca no widget ──→ /api/tracking/lookup
                                          │
                              ┌─ cache? → retorna (~50ms)
                              └─ sem eventos? → syncTrackingCode() real-time
                                                      │
                                              Provider Cascade
                              Correios → PostNL → Cainiao → TrackingMore → 17track
                                                      │
                                              Salva no DB + retorna
```

---

## Estrutura de Arquivos

```
src/
├── app/api/tracking/
│   ├── lookup/route.ts          # Endpoint publico — widget busca aqui
│   ├── config/route.ts          # Endpoint publico — config do widget
│   ├── sync/route.ts            # Endpoint autenticado — sync manual
│   └── webhooks/shopify/route.ts # Webhook Shopify (orders + fulfillments)
│
├── lib/
│   ├── tracking/
│   │   ├── carriers.ts          # Engine multi-provider (cascade + detection)
│   │   └── translate-events.ts  # Traducao EN→PT de descricoes de eventos
│   │
│   ├── services/
│   │   ├── tracking.service.ts  # Pipeline de sync (resolve keys, freshness, 17track)
│   │   └── order-lookup.service.ts # Lookup de pedidos via Shopify/Klaviyo/cache
│   │
│   └── translations/
│       └── tracking.ts          # i18n do portal (pt-BR, en, de, it, es)
│
├── types/
│   └── tracking.ts              # Tipos TypeScript (TrackingStore, TrackingCode, etc.)
│
└── components/stores/
    └── store-tracking-tab.tsx   # Tab de config de tracking na pagina da loja
```

---

## Modelo de Dados (Supabase)

### Tabelas principais

```
tracking_stores         1:N   tracking_orders     1:N   tracking_codes
─────────────────            ──────────────────         ─────────────────
id (uuid PK)                 id (uuid PK)               id (uuid PK)
client_store_id (FK)         tracking_store_id (FK)     tracking_order_id (FK)
org_id                       org_id                     tracking_store_id (FK)
shop_domain                  shopify_order_id           org_id
shop_name                    shopify_order_number       tracking_number
shopify_access_token         order_name                 carrier_code
webhook_secret               customer_name              carrier_name
seventeen_track_api_key      customer_email             status (TrackingStatus)
carrier_api_keys (JSONB)     customer_phone             status_detail
is_active                    financial_status           last_event
widget_config (JSONB)        fulfillment_status         last_event_at
last_sync_at                 total_price                estimated_delivery
created_at                   currency                   tracking_events (JSONB)
updated_at                   order_created_at           last_checked_at
                             shipped_at                 provider_used
                             delivered_at               created_at
                             line_items (JSONB)         updated_at
                             shipping_address (JSONB)
                             created_at
                             updated_at
```

### Tabelas auxiliares

```
tracking_lookups             order_tracking_cache
────────────────             ────────────────────
id (uuid PK)                 id (uuid PK)
tracking_store_id (FK)       org_id
tracking_number              store_id (FK → client_stores)
order_number                 order_id
customer_email               order_number
ip_address                   customer_email
found (boolean)              customer_name
created_at                   tracking_code
                             tracking_carrier
                             fulfillment_status
                             line_items (JSONB)
                             total_price
                             currency
                             order_created_at
                             source ("shopify"|"klaviyo"|"cache")
                             expires_at
                             created_at
```

### Indexes (criados na Story 22.2)

```sql
-- Lookup por loja + tracking number
CREATE INDEX idx_tracking_codes_store_number
  ON tracking_codes (tracking_store_id, tracking_number);

-- Lookup por email do cliente
CREATE INDEX idx_otc_customer_email
  ON order_tracking_cache (store_id, customer_email);

-- Lookup por email nos lookups
CREATE INDEX idx_tracking_lookups_email
  ON tracking_lookups (tracking_store_id, customer_email)
  WHERE customer_email IS NOT NULL;

-- Lookup por order number nos lookups
CREATE INDEX idx_tracking_lookups_order_number
  ON tracking_lookups (tracking_store_id, order_number)
  WHERE order_number IS NOT NULL;

-- Tracking codes ativos (para sync batch)
CREATE INDEX idx_tracking_codes_active
  ON tracking_codes (tracking_store_id, last_checked_at)
  WHERE status NOT IN ('delivered', 'expired');
```

---

## TrackingStatus (enum)

```typescript
type TrackingStatus =
  | "pending"           // Sem informacao ainda
  | "info_received"     // Etiqueta criada, objeto nao coletado
  | "in_transit"        // Em transito
  | "out_for_delivery"  // Saiu para entrega
  | "delivered"         // Entregue
  | "failed_attempt"    // Tentativa de entrega falhou
  | "exception"         // Problema (apreendido, extraviado, etc)
  | "expired"           // Tracking expirado
```

---

## Provider Cascade

### Ordem atual (apos Epic 22.1–22.5)

```
1. Correios     (se tracking BR, gratis)        -- API Rastro direta, TOP 1 para BR
2. PostNL       (se carrier=postnl + key)       -- carrier-specific, direto
3. Cainiao      (SEMPRE, gratis)                -- universal, cobre carriers chineses
4. TrackingMore (se key)                        -- pago, 1500+ carriers
5. 17track      (se key)                        -- SEMPRE ULTIMO, mais caro
```

### Regras do cascade

- **Short-circuit**: primeiro provider que retorna eventos vence
- **17track SEMPRE ultimo**: forcado por `resolveProviderOrder()` (regra de negocio, mais caro)
- **Correios TOP 1 para BR**: `carrier.code === "correios"` detectado por regex `[A-Z]{2}\d{9}BR`
- **Cainiao tenta SEMPRE**: e gratis, retorna rapido null se nao reconhece
- **PostNL so tenta se detected**: `carrier.provider === "postnl"`
- **TrackingMore so tenta se key configurada**: pago por request

### Arquivo: `src/lib/tracking/carriers.ts`

#### Provider Registry (Story 22.5)

O cascade usa um registry dinamico (`PROVIDER_REGISTRY`) em vez de if-chain hardcoded. Cada provider define `canRun` (condicao para tentar) e `execute` (funcao de busca).

```typescript
const PROVIDER_REGISTRY: Record<string, ProviderEntry> = {
  correios:        { canRun: (_, c) => c.code === "correios",                    execute: trackViaCorreios },
  postnl:          { canRun: (k, c) => c.provider === "postnl" && !!k.postnl,    execute: trackViaPostNL },
  cainiao:         { canRun: (k) => k.cainiao !== false,                         execute: trackViaCainiao },
  trackingmore:    { canRun: (k) => !!k.trackingmore,                            execute: trackViaTrackingMore },
  seventeen_track: { canRun: (k) => !!k.seventeen_track,                         execute: trackVia17track },
}

const DEFAULT_PROVIDER_ORDER = ["correios", "postnl", "cainiao", "trackingmore", "seventeen_track"]
```

`resolveProviderOrder()` garante que 17track e sempre o ultimo, independente da ordem passada.

#### detectCarrierProvider()

Detecta a transportadora pelo padrao do tracking number:

| Padrao | Carrier | Provider |
|--------|---------|----------|
| `[A-Z]{2}\d{9}BR` | Correios | correios |
| `3S[A-Z0-9]{11,15}` / `JVGL...` / `[A-Z]{2}\d{9}NL` | PostNL | postnl |
| `[A-Z]{2}\d{9}CN` | China Post | cainiao |
| `LP\d{15,}` / `CAINIAO...` / `\d{17,}` | Cainiao | cainiao |
| `WB\d+` / `WANB...` | Wanb Express | cainiao |
| `(LP|LV|UG|YT|YW)\d{9}(YP|CN)` | Yanwen | cainiao |
| `(SDH|SH)\d+` | SDH Express | cainiao |
| `\d{14}` | Jadlog | trackingmore |
| `TE...` | Total Express | trackingmore |
| Outros | unknown | unknown |

#### trackWithBestProvider()

```typescript
async function trackWithBestProvider(
  trackingNumber: string,
  keys: CarrierKeys,
  trackVia17track: (numbers: string[], apiKey: string) => Promise<any[]>,
  providerOrder?: string[]  // opcional, usa DEFAULT_PROVIDER_ORDER se null
): Promise<TrackingResult | null>
```

Loop dinamico sobre `PROVIDER_REGISTRY` na ordem definida por `resolveProviderOrder()`. Cada provider tem AbortController com timeout de 8s. Logs de latencia por provider (`durationMs`). Log `debug("17track avoided")` quando provider anterior resolve.

#### Providers individuais

| Funcao | API | Auth | Timeout |
|--------|-----|------|---------|
| `trackViaCorreios()` | `proxyapp.correios.com.br/v1/sro-rastro/{code}` | Nenhuma (publica) | 8s |
| `trackViaCainiao()` | `global.cainiao.com/global/detail.json` | Nenhuma | 8s |
| `trackViaPostNL()` | `api.postnl.nl/shipment/v2/status/barcode/` | Header `apikey` | 8s |
| `trackViaTrackingMore()` | `api.trackingmore.com/v4/trackings/realtime` | Header `Tracking-Api-Key` | 8s |

**Nota sobre Correios**: API Rastro e endpoint publico nao-oficial, sem SLA. Pode mudar URL ou bloquear sem aviso. Status inferido do portugues via `normalizeDesc()` + `inferCorreiosStatus()`.

#### CarrierKeys

```typescript
interface CarrierKeys {
  seventeen_track?: string   // API key 17track
  trackingmore?: string      // API key TrackingMore
  cainiao?: boolean          // Free, sempre true
  postnl?: string            // API key PostNL
}
```

---

## Pipeline de Sync

### Arquivo: `src/lib/services/tracking.service.ts`

#### syncTrackingCode(trackingCodeId)

Pipeline completo para sincronizar um tracking code:

```
1. Busca tracking_code no DB (incluindo tracking_store_id)
2. Freshness guard: pula se dados recentes
3. resolveCarrierKeys(): busca API keys da loja (com safeDecrypt)
4. trackWithBestProvider(): cascade multi-provider
5. Se resultado: mapeia status, atualiza tracking_code + tracking_order
6. Se null: atualiza last_checked_at (previne retry storm)
```

#### Freshness Guard

Evita chamadas desnecessarias quando dados foram verificados recentemente:

```typescript
const FRESHNESS_MS = {
  pending:          6h,     // 6 horas
  info_received:    6h,
  in_transit:       4h,
  out_for_delivery: 30min,
  delivered:        30 dias,
  failed_attempt:   2h,
  exception:        24h,
  expired:          24h,
}
```

#### resolveCarrierKeys()

1. Se sem `tracking_store_id`: usa `SEVENTEEN_TRACK_API_KEY` do env
2. Busca `seventeen_track_api_key` e `carrier_api_keys` (JSONB) da `tracking_stores`
3. Decrypta cada key com `safeDecrypt()` (AES-256-GCM, prefix `enc:v1:`)
4. Fallback: key global do env se loja nao tem key propria
5. Cainiao: sempre `true` (gratis, sem key)

#### safeDecrypt()

Wrapper defensivo para `decrypt()`. Se key corrompida, retorna `undefined` com log warn (nao quebra o pipeline).

#### trackVia17track()

Funcao standalone para 17track:
1. Register tracking number (`/track/v2.2/register`) — timeout 8s
2. Pausa 300ms
3. Get tracking info (`/track/v2.2/gettrackinfo`) — timeout 8s
4. Parse resultado com mapeamento de status e eventos

#### syncAllPendingCodes()

Batch sync: busca ate 50 tracking codes nao-delivered/expired, sincroniza sequencialmente com 500ms delay entre calls.

#### CARRIER_STATUS_MAP

Normaliza status de providers para `TrackingStatus`:

```typescript
pick_up       → in_transit      // Cainiao/PostNL
undelivered   → failed_attempt  // TrackingMore
alert         → exception       // TrackingMore
```

---

## Endpoints API

### GET /api/tracking/lookup (publico)

Widget de rastreamento consome este endpoint. CORS aberto (`*`).

**Params:**
- `q` — query (email, order number, ou tracking number)
- `store` — tracking_store_id ou client_store_id

**Fluxo de busca:**
1. Resolve `store` → `tracking_store_id` + `client_store_id`
2. Detecta tipo de busca:
   - Email (`@`) → OrderLookupService cascade (Shopify → Klaviyo → cache) + fallback Supabase
   - Order number (`#` ou `\d{3,6}`) → busca em `tracking_orders`
   - Tracking number (default) → busca em `tracking_codes`
3. Monta `results` com orders + tracking codes
4. Traduz descricoes para portugues (`translateEventDescription`)
5. Retorna com `Cache-Control: s-maxage={ttl}` baseado no status

**Cache TTL por status:**

| Status | TTL |
|--------|-----|
| delivered | 1h |
| in_transit | 5min |
| out_for_delivery | 2min |
| pending / info_received | 10min |
| failed_attempt | 5min |
| exception | 15min |
| expired | 1h |

**Rate limit:** 20 requests/minuto por IP.

### GET /api/tracking/config (publico)

Retorna configuracao sanitizada do widget (sem API keys).

**Params:** `store` — tracking_store_id ou client_store_id

**Retorna:** `{ config: {...}, store_name: "..." }` com defaults mesclados.

**Rate limit:** 30 requests/minuto por IP.

### POST /api/tracking/sync (autenticado)

Sync manual de tracking codes. Requer autenticacao.

**Body:**
- `{ trackingCodeId: "uuid" }` — sync individual
- `{ syncAll: true }` — batch sync (ate 50 codes)

### POST /api/tracking/webhooks/shopify (webhook)

Recebe webhooks do Shopify para popular pedidos e tracking codes.

**Topics tratados:**
- `orders/create` / `orders/updated` — upsert tracking_order + processa fulfillments
- `orders/fulfilled` — mesma logica
- `fulfillments/create` / `fulfillments/update` — upsert tracking_code

**Seguranca:** Valida HMAC-SHA256 com `webhook_secret` da loja.

---

## OrderLookupService

### Arquivo: `src/lib/services/order-lookup.service.ts`

Cascade de lookup para busca por email:

```
1. Shopify API (orders by email) → cache em order_tracking_cache
2. Klaviyo API (events by profile email) → cache
3. Cache local (order_tracking_cache, 30 dias)
```

Tambem suporta busca direta por tracking code no cache.

**NOTA:** Resultados do OrderLookupService tem IDs sinteticos (`${source}-${code}`), nao UUIDs reais do Supabase. Esses IDs NAO podem ser usados para sync.

---

## Traducao de Eventos

### Arquivo: `src/lib/tracking/translate-events.ts`

Traduz descricoes de eventos de EN para PT-BR no lado servidor, antes de retornar ao widget.

**3 niveis de match:**
1. **Exact match** — `EVENT_TRANSLATIONS_PT[description.toLowerCase()]`
2. **Pattern match** — Regex com grupos de captura (ex: "delivered to $1")
3. **Partial match** — Encontra a substring mais longa que casa

Cobre: PostNL, Cainiao, TrackingMore, 17track, Correios.

~200 traducoes exatas + ~20 patterns dinamicos.

---

## Internacionalizacao (i18n)

### Arquivo: `src/lib/translations/tracking.ts`

Labels do portal/widget em 5 idiomas: pt-BR, en, de, it, es.

Cobre: titulos, tabs, status labels, steps do timeline, instrucoes de instalacao, mensagens de erro.

---

## Widget Config

Configuracoes do widget armazenadas em `tracking_stores.widget_config` (JSONB):

```typescript
interface WidgetConfig {
  plugin_type: "complete" | "basic"     // 9 ou 5 etapas
  primary_color: string                  // Ex: "#6366F1"
  accent_color: string
  icon_color: string
  hide_carrier: boolean
  hide_redirect: boolean
  not_found_message: string
  show_estimated_delivery: boolean
  show_carrier_logo: boolean
  language: "pt-BR" | "en" | "de" | "it" | "es"
}
```

---

## Credenciais e Seguranca

### API Keys por loja

Armazenadas em `tracking_stores`:

| Campo | Conteudo |
|-------|----------|
| `seventeen_track_api_key` | Key 17track (encriptada AES-256-GCM) |
| `carrier_api_keys` (JSONB) | `{ trackingmore: "enc:v1:...", postnl: "enc:v1:..." }` |
| `shopify_access_token` | Token Shopify (encriptado) |
| `webhook_secret` | Secret para validar webhooks Shopify |

### Fallback

Se loja nao tem key propria para 17track, usa `process.env.SEVENTEEN_TRACK_API_KEY` (key global).

### Decrypt

`safeDecrypt()` tenta decriptar. Se key corrompida (bytes invalidos, encoding errado), retorna `undefined` e loga warning. O pipeline continua sem aquele provider.

---

## Fluxo Completo: Do Pedido ao Widget

```
1. SHOPIFY cria pedido
   → Webhook POST /api/tracking/webhooks/shopify
   → topic: orders/create
   → Cria tracking_order no DB

2. SHOPIFY faz fulfillment
   → Webhook POST /api/tracking/webhooks/shopify
   → topic: fulfillments/create
   → Cria tracking_code (status: in_transit, sem eventos)

3. CLIENTE busca pedido no widget
   → GET /api/tracking/lookup?q=AB123456789BR&store=xxx
   → Encontra tracking_code no DB (sem eventos, last_checked_at = null)
   → [FUTURO: Story 22.3] Faz sync real-time inline
   → syncTrackingCode() → cascade → salva eventos no DB
   → Retorna dados com eventos traduzidos

4. CLIENTE busca novamente
   → GET /api/tracking/lookup?q=AB123456789BR&store=xxx
   → Encontra tracking_code COM eventos
   → Retorna cache (~50ms)
   → Cache-Control: s-maxage=300 (5min para in_transit)

5. ADMIN dispara sync manual
   → POST /api/tracking/sync { trackingCodeId: "xxx" }
   → syncTrackingCode() → freshness guard → cascade
   → Atualiza dados se fresh threshold expirou
```

---

## Epic 22 -- Provider Ranking (status atual)

### Stories implementadas

| Story | Status | Descricao |
|-------|--------|-----------|
| 22.1 | Done | Reordenar cascade + freshness guard + AbortController + safeDecrypt |
| 22.2 | Done | Migration: indexes + provider_used + Cache-Control headers |
| 22.3 | Done | Sync real-time no lookup (tracking sem eventos) |
| 22.4 | Done | Correios API Rastro como provider direto (TOP 1 para BR) |
| 22.5 | Done | Refatorar cascade para Provider Registry (loop dinamico) |

### Epic 22 — Concluido
Todas as stories foram entregues. Cron de sync automatico em
`/api/cron/tracking-sync` (a cada 6h, conforme `vercel.json`).

### Roadmap de implementacao

```
22.4 (Correios)  → Valor imediato para lojas BR, baixa complexidade
22.3 (Sync RT)   → Resolve gap de tracking sem eventos
22.5 (Registry)  → Refatoracao interna, prepara para customizacao futura
```

### Ordem do cascade apos 22.4

```
1. Correios    (se tracking BR, gratis, direto)     ← NOVO
2. PostNL      (se carrier=postnl + key postnl)
3. Cainiao     (SEMPRE, gratis)
4. TrackingMore (se key trackingmore)
5. 17track     (se key seventeen_track)              ← SEMPRE ULTIMO
```

---

## Problemas Conhecidos e Limitacoes

1. **Sem cron ativo para sync automatico.** `syncAllPendingCodes()` existe mas nao e chamado por nenhum cron. Tracking codes so sao sincronizados via sync manual ou (futuro, 22.3) sync real-time no lookup.

2. **17track e o mais caro e lento.** ~16s worst case (8s register + 300ms delay + 8s gettrackinfo). Por isso e SEMPRE o ultimo no cascade.

3. **Cainiao pode nao reconhecer tracking nao-chines.** Retorna null rapido (~1-2s), sem custo.

4. **API keys corrompidas.** Podem existir no DB (ex: bytes invalidos). `safeDecrypt()` trata graciosamente.

5. **Freshness guard pode bloquear sync desejado.** Se admin quer forcar re-sync, precisa esperar o threshold expirar ou usar sync manual (que bypassa o guard? -- nao, o guard aplica tambem no sync manual via `syncTrackingCode()`).

6. **Traducao de eventos incompleta.** ~200 traducoes exatas + 20 patterns. Eventos nao reconhecidos retornam em ingles.

---

*Ultima atualizacao: 2026-03-06*
*Referencia: Epic 22, Stories 22.1-22.5*
