# API — Integrações Externas, Tracking, Webhooks e Crons

> Parte da [documentação de API](./README.md). Salvo indicação contrária, **Auth = sessão Supabase** e **Rate limit = nenhum**.

## Asaas (financeiro)

| Endpoint | Métodos | Ação | Params |
|---|---|---|---|
| `/api/integrations/asaas/billing` | GET | Resumo financeiro / MRR | `period` (today/7days/month/year/custom), `start_date?`, `end_date?` |
| `/api/integrations/asaas/charges` | POST, DELETE | Criar / cancelar cobrança | POST: `clientId`, `value`, `billingType` (boleto/PIX/cartão), `dueDate`, `description`, `installmentCount?`, `discount?`, `interest?`, `fine?`, `postalService?`. DELETE: `payment_id` (query) |
| `/api/integrations/asaas/charges/list` | GET | Listar cobranças | `status?`, `start_date?`, `end_date?` — agrupa por vencimento (overdue/pending/upcoming/received) |
| `/api/integrations/asaas/clients-status` | GET | Status financeiro por cliente | Cache interno 5min |
| `/api/integrations/asaas/customers` | GET, POST | Contagem / importar clientes | POST importa Asaas → `clients` |
| `/api/integrations/asaas/customers/create` | POST | Criar cliente no Asaas | `name`, `cpfCnpj`, `email`, `phone`, `mobilePhone`, `address` |
| `/api/integrations/asaas/customers/update` | PATCH | Sincronizar cliente local → Asaas | `clientId` |
| `/api/integrations/asaas/payments` | GET, POST | Pagamentos por cliente / sync geral | GET: `client_id`, `year` (breakdown mensal). POST sincroniza pagamentos + assinaturas → `invoices` e `client_subscriptions` |
| `/api/integrations/asaas/refund` | POST | Reembolso | `invoice_id`, `amount?`, `reason` (Zod) |
| `/api/integrations/asaas/subscriptions` | GET, POST, DELETE | Assinaturas | GET: `client_id`. POST: `clientId`, `value`, `cycle`, `billingType`, `nextDueDate`, `description`. DELETE: `subscription_id` (query) |
| `/api/integrations/asaas/sync` | GET, POST | Sync geral / status | GET retorna última sync + resumo de invoices |
| `/api/integrations/asaas/webhook` | POST | **Webhook Asaas** | Eventos de pagamento/reembolso → atualiza `invoices` e `activities`. **Auth: token `asaas-access-token` (ASAAS_WEBHOOK_SECRET, timing-safe). Rate limit: webhook 100/min** |

## Email platform (Klaviyo / Omnisend)

Auth: sessão + acesso à loja (`requireStoreAccess`).

| Endpoint | Métodos | Ação | Params |
|---|---|---|---|
| `/api/integrations/email-platform/campaigns` | GET | Campanhas com métricas | `store_id`, `period` (7d/30d/90d/custom), `start_date?`, `end_date?`, `status?` (sent/scheduled/draft), `force_refresh?`. Cache 35min (`klaviyo_campaign_metrics`) |
| `/api/integrations/email-platform/flows` | GET | Flows com métricas | Mesmos params. Cache `klaviyo_flow_metrics` |
| `/api/integrations/email-platform/report` | GET | Relatório completo | Listas, segmentos, flows, campanhas e revenue com fallback em cache |

## Google

| Endpoint | Métodos | Ação | Auth / Notas |
|---|---|---|---|
| `/api/integrations/google/authorize` | GET | Iniciar OAuth | Query: `scope` (calendar/ads/all), `store_id?`, `context` (admin/portal). State em cookie HttpOnly + nonce anti-CSRF |
| `/api/integrations/google/callback` | GET | Callback OAuth | Valida nonce/state; salva tokens em `user_google_tokens` ou `client_stores` |
| `/api/integrations/google/calendar/calendars` | GET | Listar calendários (owner/writer) | Token Google com auto-refresh |
| `/api/integrations/google/calendar/disconnect` | POST | Desconectar | Revoga token + deleta registro |
| `/api/integrations/google/calendar/settings` | GET, PATCH | Config | PATCH: `selected_calendar_id`, `auto_meet` |
| `/api/integrations/google/calendar/status` | GET | Status da conexão | connected, email, last_synced_at, sync_error |
| `/api/integrations/google/calendar/sync` | POST | Sync de RSVP | Atualiza `meeting_participants.google_rsvp_status` |
| `/api/integrations/google-analytics/report` | GET | Relatório GA4 | `store_id`, `period` (7d/30d/90d/all/custom), `start_date?`, `end_date?`, `force_refresh?`. Service Account JWT; cache `integration_cache` |

## Klaviyo (direto)

| Endpoint | Métodos | Ação | Params |
|---|---|---|---|
| `/api/integrations/klaviyo/metrics` | GET | Métricas resumidas | `store_id` — contagens de profiles/flows/campaigns/metrics |
| `/api/integrations/klaviyo/test` | POST | Testar API key | `api_key` ou `private_key`, `store_id` — valida permissions (sem sessão; validação pela própria key) |
| `/api/integrations/klaviyo/debug` | GET | Debug de statistics (Reporting API) | `store_id` |
| `/api/integrations/klaviyo/debug-agg` | GET | Debug de metric-aggregates | `store_id` |

## Shopify / Meta / Wise

| Endpoint | Métodos | Ação | Auth / Notas |
|---|---|---|---|
| `/api/integrations/shopify/authorize` | GET | Iniciar OAuth Shopify | Query: `shop`, `store_id`. Scopes read (products, orders, customers, inventory) |
| `/api/integrations/shopify/callback` | GET | Callback OAuth | **Validação HMAC SHA-256** (`hmac` query); salva access token |
| `/api/integrations/shopify/report` | GET | Relatório Shopify | `store_id`, `period` — pedidos, revenue, clientes, taxa de retorno |
| `/api/integrations/shopify/recovery-analysis` | GET | Análise de carrinhos abandonados | `store_id` |
| `/api/integrations/shopify/test` | POST | Testar token | `store_domain`, `access_token` (GraphQL) |
| `/api/integrations/meta/authorize` | GET | Iniciar OAuth Meta | Query: `scope` (ads/instagram/all), `store_id` |
| `/api/integrations/meta/callback` | GET | Callback OAuth | Long-lived token + ad accounts + IG accounts → `client_stores` |
| `/api/integrations/wise/balances` | GET | Saldos multi-moeda | |
| `/api/integrations/wise/transactions` | GET | Transações | |
| `/api/integrations/wise/reconcile` | POST | Conciliação | |

## Integrações — geral

| Endpoint | Métodos | Ação | Params |
|---|---|---|---|
| `/api/integrations/save` | POST, DELETE | Salvar / remover credenciais | POST: `integration_id` ou `store_id`, `type`, `credentials` (criptografadas), `is_active`, `name`. DELETE: `id` (query) |
| `/api/integrations/test` | POST | Teste genérico | `type`, `credentials` |
| `/api/integrations/tracking/test` | POST | Teste de tracking | |

## Tracking (rastreio de pedidos — público)

| Endpoint | Métodos | Ação | Auth | Rate limit |
|---|---|---|---|---|
| `/api/tracking/config` | GET | Config sanitizada do widget | **Público (CORS)**. Query: `store` | **30/min por IP** |
| `/api/tracking/lookup` | GET | Buscar pedido/rastreio | **Público (CORS)**. Query: `q` (email/pedido/código), `store`. Integra Shopify, 17track, trackingmore, Cainiao; cache dinâmico por status | **20/min por IP** |
| `/api/tracking/script/widget.js` e `/api/script/widget.js` | GET | Script JS do widget | **Público** (embeddable — middleware libera iframe) | Nenhum |
| `/api/tracking/sync` | POST | Sync de rastreios | Interno | Nenhum |
| `/api/tracking/debug-live` | GET | Debug live | Interno | Nenhum |
| `/api/tracking/webhooks/shopify` | POST | **Webhook Shopify (fulfillment)** | **HMAC SHA-256** (`X-Shopify-Hmac-SHA256`) | Nenhum |
| `/api/integrations/whatsapp/webhook` | GET, POST | **Webhook WhatsApp (tracking)** | **HMAC SHA-256** (`X-Hub-Signature`) | **webhook 100/min** |

## Crons (`/api/cron/*`)

Auth de todos: **`Authorization: Bearer ${CRON_SECRET}`** (`requireCronAuth`, timing-safe). Schedules definidos em `vercel.json`. Sem rate limit (protegidos pelo secret).

| Rota | Schedule (UTC) | O que faz |
|---|---|---|
| `/api/cron/sync-reports` | `*/30 * * * *` | Sincroniza reports Klaviyo, GA e receita Shopify |
| `/api/cron/sync-omnisend` | `*/30 * * * *` + `0 4 * * *` (`?periods=1d,7d,30d,90d`) | Sincroniza campanhas/flows Omnisend |
| `/api/cron/email-dispatch-queue` | `* * * * *` | Processa fila do Architect (Montador+Blueprint) e dispatch de copy. `maxDuration` 300 |
| `/api/cron/email-generation-watchdog` | `*/5 * * * *` | Recupera gerações de email travadas |
| `/api/cron/campaign-copy-watchdog` | `*/5 * * * *` | Monitora geração de copy de campanha |
| `/api/cron/campaign-suggestions-cycle` | `0 1 * * 1` | Gera ciclo semanal de sugestões de campanha |
| `/api/cron/process-deal-won` | `* * * * *` | Processa deals ganhos (cria onboardings etc.) |
| `/api/cron/board-automation` | `0 9 * * 1-5` | Automações do board |
| `/api/cron/google-calendar-sync` | `0 * * * *` | Sync de RSVP do Google Calendar |
| `/api/cron/crm-health-compute` | `0 5 * * *` | Health scores (email 35% + revenue 30% + tickets 20% + NPS 15%) |
| `/api/cron/crm-snapshot` | `0 6 * * *` | Snapshots de BI (`crm_*_snapshots`) |
| `/api/cron/crm-renewal-opportunities` | `0 7 * * *` | Detecta oportunidades de renovação |
| `/api/cron/weekly-feedback` | `0 7 * * 1` | Pesquisa de feedback semanal |
| `/api/cron/store-alerts-check` | `0 8 * * 1` | Alertas de loja (SLA, saúde) |
| `/api/cron/operational-overdue` | `0 9 * * *` | Tarefas operacionais vencidas |
| `/api/cron/onboarding-sla-check` | `0 9 * * *` | SLA de onboarding |
| `/api/cron/onboarding-form-reminder` | `0 12 * * *` | Lembrete de formulário |
| `/api/cron/weekly-acompanhamento-reset` | `0 22 * * 0` | Reset semanal do acompanhamento |
| `/api/cron/tracking-sync` | `0 */6 * * *` | Sync de códigos de rastreio |
| `/api/cron/holidays-sync-yearly` | `0 3 1 1 *` | Feriados do ano |
| `/api/reports/cleanup` | `0 3 * * *` | Limpa report jobs expirados (documentado em [08](./08-dashboard-relatorios-clientes.md)) |
