# Documentação de API — admin-convertfy

Mapeamento completo das **~330 rotas** em `src/app/api/**` (Next.js App Router). Cada arquivo de domínio documenta: endpoint, métodos HTTP, ação, o que faz, parâmetros (path/query/body via Zod), autenticação e rate limit.

> Gerado em 2026-07-01 a partir da leitura do código. Ao criar/alterar rotas, atualize o arquivo do domínio correspondente.

## Índice

| Arquivo | Domínio | Rotas (aprox.) |
|---|---|---|
| [01-admin-stores.md](./01-admin-stores.md) | Admin: lojas, briefing, brand identity, orgs/membros, portal users, utilidades | ~60 |
| [02-campanhas.md](./02-campanhas.md) | Campaign Central, Campaign Pipeline, Campaigns + geração via n8n | ~40 |
| [03-email-generation.md](./03-email-generation.md) | Epic AE: prompts, blocks, flows, QA, telemetria, webhooks n8n, internal, SSE | ~45 |
| [04-crm.md](./04-crm.md) | CRM: deals, leads, pipelines, inbox, automações, AI actions, webhooks WhatsApp/Instagram | ~50 |
| [05-portal-publico.md](./05-portal-publico.md) | Portal do cliente, portal users, formulários públicos e token-gated | ~50 |
| [06-onboarding-operacional.md](./06-onboarding-operacional.md) | Onboarding (legacy + novo), tasks, pipelines operacionais, ritual, produtividade | ~55 |
| [07-integracoes-cron.md](./07-integracoes-cron.md) | Asaas, Google, Klaviyo, Shopify, Meta, Wise, tracking público, webhooks externos, crons | ~55 |
| [08-dashboard-relatorios-clientes.md](./08-dashboard-relatorios-clientes.md) | Dashboard, report jobs, clients, client-stores, financeiro, stores, IA, debug | ~60 |

---

## Convenções transversais

### Mecanismos de autenticação

| Mecanismo | Como funciona | Onde |
|---|---|---|
| **Sessão Supabase** | Cookie de sessão validado pelo middleware (`updateSession`) + `requireAuth()` na rota. Isolamento multi-tenant por `org_id` via `org_members`, com RLS como segunda camada | Padrão de quase todas as rotas internas (`/api/admin/*`, `/api/crm/*`, `/api/dashboard/*`, …) |
| **Role / feature check** | Sobre a sessão: `requireRole(['admin', …])`, features (`view_financial`, `view_reports`, `onboarding_approve`) ou tag `dev` (`canManagePrompts`) | Rotas sensíveis (org management, financeiro, prompts) |
| **Portal auth** | Sessão Supabase + lookup em `client_portal_users` (`resolvePortalClient`) → client_id + lojas ativas. Permissões JSONB granulares | `/api/portal/*` |
| **Token de formulário** | `form_token` (UUID) no path — sem sessão | `/api/forms/[token]/*`, `/api/onboarding-help/[token]` |
| **Cron secret** | `Authorization: Bearer ${CRON_SECRET}` com comparação timing-safe (`requireCronAuth`, `src/lib/api/cron-auth.ts`) | `/api/cron/*`, `/api/reports/process`, `/api/reports/cleanup` |
| **Webhook secret N8N** | Header `x-webhook-secret == N8N_WEBHOOK_SECRET`, timing-safe (`requireWebhookSecret`, `src/lib/api/n8n-auth.ts`) | `/api/webhooks/n8n/*`, `/api/n8n/*`, callbacks de campanha, contexto M2M |
| **Internal secret** | Header `x-internal-secret == INTERNAL_SECRET` | `/api/internal/*` (fase 2 / watchdog) |
| **HMAC de terceiros** | Assinaturas específicas: Meta `x-hub-signature-256` (WhatsApp/Instagram), Shopify `X-Shopify-Hmac-SHA256`, Asaas `asaas-access-token` | Webhooks inbound externos |
| **Público** | Sem autenticação (rate limit por IP e/ou CORS) | Formulários públicos, tracking widget, `/api/public/forms/*` |

### Rate limits existentes

Implementação: Upstash Redis fixed-window (`src/lib/rate-limit.ts`), chave por IP, **fail-open** (exceto `failClosed: true` nos endpoints de auth). Sem Redis configurado em dev, tudo passa.

| Preset | Limite | Rotas que aplicam |
|---|---|---|
| `auth` | 10/min (fail-closed) | `/api/portal/auth`, `/api/portal/settings/password`, `/api/portal-users/reset-password`, `/api/settings/password`, `/api/auth/change-password` |
| `webhook` | 100/min | `/api/webhooks/n8n/*`, `/api/onboarding/webhook`, `/api/integrations/asaas/webhook`, `/api/integrations/whatsapp/webhook` |
| `migration` | 3/min | `/api/admin/encrypt-credentials`, `/api/setup/database` |
| `clienteForm` / `publicForm` | 3/h | `/api/cliente/onboarding-form`, `/api/public/onboarding-form` |
| `clienteUpload` / `publicUpload` | 10/h | `/api/cliente/upload`, `/api/public/upload` |
| custom | 30/min e 20/min | `/api/tracking/config`, `/api/tracking/lookup` |
| ad-hoc | 15 msgs/min (in-memory) | `/api/ai/chat` |
| ad-hoc | 1 req/30s por bloco | `/api/admin/email-blocks/[blockId]/regenerate-image` |

**Todas as demais rotas (~95% da API) não têm rate limit** — dependem apenas da autenticação.

### Formato de resposta e erros

- Sucesso: `successResponse(data, status)` → `{ ...data }` com 200/201/202.
- Erro: `errorResponse(request, error, context)` → `{ error: string }` com status derivado de `AppError` (`ValidationError` 400, `NotFoundError` 404, `ConflictError` 409, …) — ver `src/lib/api/errors.ts`.
- Validação de body/query: **Zod** por rota (`src/lib/validations/*`, `src/lib/schemas/*`).
- Operações longas retornam **202** com id para polling (ex.: geração de copy, report jobs) ou usam `after()` para trabalho pós-resposta.

### CORS e embed

- `src/lib/cors.ts`: origens permitidas via env `ALLOWED_ORIGINS` (csv). Em produção, sem essa env, nenhuma origem externa é permitida.
- Rotas embeddable (widget de tracking, `/api/script/*`): middleware libera `frame-ancestors *`; todo o resto envia `X-Frame-Options: DENY`.

### Crons

22 agendamentos em `vercel.json` (tabela completa em [07-integracoes-cron.md](./07-integracoes-cron.md#crons-apicron)).

---

## Lacunas — o que precisa ser criado para integrações externas

O mapeamento acima mostra que **hoje não existe uma API pública para terceiros**: tudo é autenticado por cookie de sessão (inviável para server-to-server de parceiro), por secrets compartilhados ponto-a-ponto (n8n, cron) ou por token de formulário. Para expor integrações a outras plataformas, o backlog é:

### 1. Autenticação por API key (pré-requisito de tudo)
- Não existe hoje: tabela `api_keys` (hash da chave, org_id, escopos, expiração, last_used_at), header `Authorization: Bearer cvfy_...` ou `X-API-Key`.
- Helper `requireApiKey(scopes)` no padrão de `requireCronAuth`/`requireWebhookSecret` (timing-safe), resolvendo `org_id` para reutilizar o isolamento multi-tenant já existente.
- UI de gestão de chaves (criar/revogar/rotacionar) em `/admin/settings`.

### 2. Superfície pública versionada (`/api/v1/*`)
Não expor as rotas internas diretamente — criar um subconjunto estável e versionado. Candidatos naturais (a lógica já existe, falta o wrapper autenticado por API key):

| Recurso proposto | Reaproveita | Uso típico de integração |
|---|---|---|
| `GET/POST /api/v1/leads` | `/api/crm/leads` (+ `import`) | Captação de leads de landing pages/plataformas de ads |
| `GET/POST /api/v1/deals`, `POST /api/v1/deals/[id]/move` | `/api/crm/deals` | Sincronizar CRM com ferramentas externas |
| `GET /api/v1/stores`, `GET /api/v1/stores/[id]/metrics` | `/api/stores`, `/api/dashboard/*`, `store_revenue_summary` | BI/planilhas de clientes e parceiros |
| `GET /api/v1/campaigns` | `/api/campaigns` | Calendário de campanhas em ferramentas externas |
| `POST /api/v1/events` (ingest genérico) | — (novo) | Receber eventos de plataformas que não têm webhook próprio |
| `GET /api/v1/invoices` | `/api/portal/invoices` / Asaas sync | Conciliação financeira |

### 3. Rate limiting para a API pública
- A infra (Upstash) já existe; falta aplicar por **API key** (não por IP) com tiers (ex.: 60/min default, burst configurável) e headers `X-RateLimit-Limit/Remaining/Reset` — hoje só se retorna `Retry-After` no 429.
- Definir política também para os webhooks inbound que hoje não têm limite (`/api/webhooks/whatsapp`, `/api/webhooks/instagram`, `/api/tracking/webhooks/shopify`).

### 4. Webhooks outbound (eventos para terceiros)
- Hoje só existem webhooks **inbound**. Eventos internos já são gerados (`email_status_events`, triggers de CRM `deal_created`/`deal_stage_change`/`lead_created`, callbacks de campanha) — falta:
  - Tabela `webhook_subscriptions` (org_id, url, eventos, secret) + dispatcher com retry/backoff e assinatura HMAC (o padrão de verificação já existe no lado inbound).
  - Eventos candidatos: `lead.created`, `deal.stage_changed`, `deal.won`, `email.ready`, `campaign.approved`, `invoice.paid`, `onboarding.completed`.

### 5. Especificação OpenAPI
- Os schemas Zod já existem por rota; gerar spec com `zod-to-openapi` (ou `@asteasolutions/zod-to-openapi`) para a superfície `/api/v1/*` e publicar em `/api/v1/openapi.json` + Swagger UI. Esta documentação markdown vira a fonte de "o que expor primeiro".

### 6. Higiene necessária antes de expor
- **Idempotência**: só automações CRM e webhooks têm `idempotency_key`/dedup — rotas públicas de escrita (leads, events) precisam aceitar `Idempotency-Key` header.
- **Paginação**: padronizar (hoje mistura `limit/offset`, `page/per_page` e cursor) — recomendação: cursor-based no `/api/v1/*`.
- **Erros**: padronizar envelope `{ error: { code, message } }` com códigos estáveis (hoje é `{ error: string }` com mensagem livre).
- **CORS**: `ALLOWED_ORIGINS` é global — API pública server-to-server não precisa de CORS, mas se houver uso browser-side, permitir por origem cadastrada da API key.
- **Remover/proteger rotas de laboratório**: `/api/dev/omnisend-discovery-r7..r11`, `/api/debug/*` (hoje atrás de sessão, mas sem papel em produção).
- **Rotação de secrets M2M**: `N8N_WEBHOOK_SECRET`, `INTERNAL_SECRET` e `CRON_SECRET` são únicos e estáticos — suportar duas chaves ativas para rotação sem downtime.
