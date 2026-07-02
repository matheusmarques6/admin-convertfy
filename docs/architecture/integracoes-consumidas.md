# Integrações Externas Consumidas

> Parte da [arquitetura do sistema](./system-overview.md). APIs que o admin-convertfy **consome**. As APIs que o sistema **expõe** estão em [docs/api/](../api/README.md).

## Visão geral

| Integração | Credencial | Escopo | Client |
|---|---|---|---|
| Shopify Admin API | `client_stores.shopify_access_token` | por loja | `src/lib/integrations/shopify.ts` |
| Klaviyo | `client_stores.klaviyo_api_key` (criptografado) | por loja | `src/lib/integrations/klaviyo/*` |
| Omnisend | `client_stores` | por loja | `src/lib/integrations/omnisend/*` |
| Asaas | `client_stores.asaas_api_key` (criptografado) | por loja (sandbox/prod configurável) | `src/lib/integrations/asaas.ts` |
| Meta Ads / WhatsApp / Instagram | tokens por loja / canal CRM | por loja / por canal | `meta-ads.ts`, `whatsapp.ts`, `instagram-graph.service.ts` |
| Google (Ads, Calendar, GA4) | OAuth por usuário / service account por loja | misto | `google-ads.ts`, `google-calendar.ts` |
| Wise | token por loja | por loja | `wise.ts` |
| Anthropic | `ANTHROPIC_API_KEY` | global | vários (ver §IA) |
| OpenRouter | `OPENROUTER_API_KEY` | global | `agents/openrouter-invoke.ts` |
| OpenAI | `OPENAI_API_KEY` | global | dashboard insights |
| Resend | `RESEND_API_KEY` | global | `src/lib/email/email.service.ts` |
| n8n | `N8N_*_WEBHOOK_URL` + secret | global | dispatchers em services |
| Rastreamento (6 provedores) | mix global/por loja | por loja | `src/lib/tracking/carriers.ts` |
| Nager.Date, Exchange Rate, Correios, Cainiao | — (públicas) | global | services |
| Upstash Redis | `UPSTASH_REDIS_REST_*` | global | `src/lib/rate-limit.ts` |

## E-commerce e email marketing

### Shopify Admin API
- **Base**: `https://{store}.myshopify.com/admin/api/{version}` — versão default `2025-01` (suporta 2024-10/2024-07). REST.
- **Auth**: header `X-Shopify-Access-Token` (obtido por OAuth em `/api/integrations/shopify/authorize|callback` ou colado manualmente).
- **Operações**: orders, customers, products, inventory, shop (test). Paginação cursor via Link header.
- **Rate limit**: 40 req/min (400 no Plus); `fetchWithRetry` com backoff; cache no Supabase.

### Klaviyo
- **Base**: `https://a.klaviyo.com/api`, revision `2025-10-15`. Auth: `Authorization: Klaviyo-API-Key`.
- **Operações**: Reporting API (`campaign-values-reports`, `flow-values-reports`, `flow-series-reports`), Metric Aggregates (receita total — ver [ADR](./adr-klaviyo-revenue-source.md)), Profiles, Segments.
- **Rate limit**: tiers XS→XL; **rate limiter próprio** (`klaviyo/rate-limiter.ts`, fila global + dispatch por tier), retry máx 3, `Retry-After` limitado a 10s, fallback em cache de até 48h.

### Omnisend
- **Base**: `https://api.omnisend.com` — v3 (campaigns/automations), v5 (contacts/brands), `/api/analytics/` (reports). Auth: header `X-API-KEY`.
- **Rate limit**: 400 req/min geral; **Analytics: 10 req/min e ~55 req/dia** — throttle de 160ms + contador diário no client; backoff 30s→60s→120s.

## Financeiro

### Asaas
- **Base**: `https://api.asaas.com/v3` (prod) / `https://sandbox.asaas.com/api/v3` — ambiente configurável por loja. Auth: header `access_token`.
- **Operações**: customers (CRUD), payments (criar/listar/cancelar), subscriptions, `GET /myAccount` (teste).
- **Inbound**: webhook em `/api/integrations/asaas/webhook` (eventos de pagamento/reembolso).

### Wise
- **Base**: `https://api.wise.com` (prod) / sandbox. Auth: Bearer por loja + profile id.
- **Operações**: profiles, balances (v4), balance statements (transações para conciliação).

### Exchange Rate (open.er-api.com)
- Pública, `GET /v6/latest/{base}` — conversão de moedas nos agregados multi-currency.

## Meta (Facebook)

| API | Versão | Uso |
|---|---|---|
| Meta Ads | Graph `v18.0` | ad accounts, campaigns, insights (spend/ROAS) — token por loja |
| WhatsApp Cloud API | Graph `v20.0` | envio de mensagens (text/image/document/template), mark-as-read, templates — token por canal CRM; janela de 24h; webhook inbound com HMAC |
| Instagram | Graph `v20.0` | DMs e replies de comments — webhook inbound com HMAC |

## Google

| API | Auth | Uso |
|---|---|---|
| Google Ads (`googleads.googleapis.com/v15`) | OAuth Bearer + `GOOGLE_ADS_DEVELOPER_TOKEN` | GAQL via searchStream (campanhas, contas) |
| Google Calendar (`/calendar/v3`) | OAuth por usuário (tokens em `user_google_tokens`, auto-refresh) | calendários, eventos (meetings sync + RSVP) |
| GA4 Data API (`analyticsdata/v1beta`) | **Service Account JSON por loja** (`ga4_credentials` + `ga4_property_id`) | runReport (tráfego, páginas, dispositivos); cache 15-60min por período |

## IA

### Anthropic API (direto)
- `POST /v1/messages`, modelos `claude-opus-4-8`, `claude-sonnet-4-6`, `claude-haiku-4-5`. Env global `ANTHROPIC_API_KEY`.
- Consumidores: briefing generation (SDK), campaign central (fetch com JSON mode/tools), CRM AI actions, HTML/QA chains, capture-brand e ads-review (Haiku).

### OpenRouter
- `POST /api/v1/chat/completions`. **Regra de roteamento**: model id com `/` → OpenRouter; sem `/` → Anthropic direto.
- Modelos roteados: `anthropic/claude-opus-4.8` (Montador), `anthropic/claude-sonnet-4.6` (Blueprint), `openai/gpt-5.4-image-2` (geração de imagem), `openai/gpt-5.3-chat` (fallback de briefing).
- Client: `src/lib/agents/openrouter-invoke.ts` + `chains/image.chain.ts`.

### OpenAI
- Usado em `/api/dashboard/insights` (GPT-4o-mini para insights do dashboard).

## Orquestração n8n

**Outbound** (fire-and-forget via `after()`; falha não bloqueia response):

| Env var | Disparo |
|---|---|
| `N8N_BRIEFING_WEBHOOK_URL` | Geração/regeneração de briefing |
| `N8N_ONBOARDING_WEBHOOK_URL` | Pesquisa & Diagnóstico (brand, competitors, ICP, tone) |
| `N8N_EMAIL_COPY_URL` | Lote de emails para gerar copy |
| `N8N_CAMPAIGN_COPY_WEBHOOK_URL` | Copy de campanha por loja |
| `N8N_CAMPAIGNS_WEBHOOK_URL` | Geração de campanhas (Drive) |
| `N8N_ADS_ANALYZER_WEBHOOK_URL` | Análise de ads |

**Inbound**: callbacks em `/api/webhooks/n8n/*` autenticados por `x-webhook-secret` (documentados em [docs/api/03](../api/03-email-generation.md#webhooks-n8n-callbacks-de-pesquisa-e-copy)). Ver também [n8n-api-integration.md](./n8n-api-integration.md).

## Rastreamento de pedidos (multi-carrier)

Registry em `src/lib/tracking/carriers.ts` com detecção automática de carrier e fallback em cascata:

| Provedor | Auth | Notas |
|---|---|---|
| Correios (proxyapp.correios.com.br) | pública | formato UPU (XX…BR), timeout 5s |
| Cainiao (global.cainiao.com) | pública | Yanwen, China Post, AliExpress etc. |
| TrackingMore v3 | key por loja (`tracking_stores.carrier_api_keys`) | 1500+ carriers, handling de 429 |
| 17track v2.2 | `SEVENTEEN_TRACK_API_KEY` global ou por loja | register + getTrackInfo |
| PostNL | key por loja | status por barcode |
| YunExpress | Basic (customerNumber:apiKey) por loja | |

## Utilitários

- **Resend**: `POST /emails` — emails transacionais (testes de email do workspace, convites de portal user). Envs `RESEND_API_KEY`, `RESEND_FROM_EMAIL/NAME`.
- **Nager.Date** (`date.nager.at/api/v3`): feriados públicos por país/ano → `commemorative_dates` (cache 6h, dedup manual vs nager). ~15 países.
- **Upstash Redis**: rate limiting (fixed window) — ver [docs/api/README](../api/README.md#rate-limits-existentes).
- **Supabase Storage** — buckets: `onboarding-uploads`, `onboarding-assets`, `onboarding-visual-assets`, `contracts`, `store-files`, `avatars`, `crm-files`.

## Padrões transversais

- **Credenciais por loja** ficam em `client_stores` criptografadas (`ENCRYPTION_KEY`, `src/lib/crypto.ts`); nunca retornadas em plaintext pelas APIs (masking nos endpoints de credenciais).
- **Retry**: `fetchWithRetry` com backoff exponencial como padrão; customizações por API (Klaviyo tier queue, Omnisend daily cap).
- **Cache**: Supabase (tabelas `*_metrics`, `dashboard_cache`, `integration_cache`) com TTLs de 10min a 48h conforme a fonte.
