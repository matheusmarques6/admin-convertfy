# Arquitetura do Sistema — admin-convertfy

> Visão geral da arquitetura. Complementa: [data-model.md](./data-model.md), [design-system.md](./design-system.md), [integracoes-consumidas.md](./integracoes-consumidas.md), [frontend-map.md](./frontend-map.md), [docs/api/](../api/README.md) (API exposta) e os ADRs neste diretório.

## O que é o sistema

Plataforma interna da Convertfy para operação de email marketing gerenciado para e-commerces: administra clientes e suas lojas (Shopify + Klaviyo/Omnisend), gera flows e campanhas de email com pipeline de agentes de IA, opera CRM próprio (vendas + customer success), portal do cliente white-label, rastreamento de pedidos (widget público), financeiro (Asaas) e BI operacional.

## Stack

| Camada | Tecnologia |
|---|---|
| Framework | **Next.js 15.5** (App Router) + **React 19** + TypeScript 5 (strict) |
| Banco / Auth / Storage / Realtime | **Supabase** (Postgres + RLS, `@supabase/ssr` para sessão em cookie) |
| UI | Tailwind CSS 3.4 + shadcn/ui (Radix primitives) + lucide-react; framer-motion; recharts (gráficos); reactflow (builder de automações); cmdk (palette); @hello-pangea/dnd (kanban); vaul (drawers) |
| Estado / dados no cliente | **SWR** (áreas CRM/campanhas), fetch manual (áreas legadas), **Zustand** pontual (ai-chat, sidebar, productivity), react-hook-form + Zod |
| IA | **Anthropic SDK** (Claude direto), **OpenRouter** (roteamento de modelos com `/` no id, ex.: `anthropic/claude-opus-4.8`, `openai/gpt-5.4-image-2`), OpenAI SDK (insights do dashboard), LangChain (chains do pipeline de email) |
| Email transacional | Resend |
| Rate limit / locks | Upstash Redis (`@upstash/ratelimit`, fixed window) |
| Deploy | **Vercel**, região `pdx1`, serverless + 22 cron jobs (`vercel.json`) |
| Testes | Vitest (~127 arquivos `*.test.ts`, coverage v8) + Playwright (`e2e/`: smoke admin/client/public + perf-baseline) |
| Observabilidade | Vercel Speed Insights, logger estruturado (`src/lib/logger.ts`, JSON em prod), telemetria de IA (`ai_usage_events` + view `ai_usage_unified` + `/api/admin/ai-usage`) |

## Áreas da aplicação

```
┌─────────────────────────────── Vercel (pdx1) ───────────────────────────────┐
│                                                                              │
│  /admin/*          Backoffice interno (3 workspaces: Comercial /            │
│                    Operacional / Geral) — sessão Supabase + RBAC            │
│  /client/*         Portal do cliente (white-label) — portal auth            │
│  /(auth)           login, register, change-password                          │
│  /form/[token]     Wizard de onboarding do cliente (token, sem sessão)      │
│  /forms/[slug]     Formulários públicos do CRM                              │
│  /track, /tracking/embed, /api/script/widget.js   Widget público de rastreio│
│  /api/**           ~330 rotas (ver docs/api/) + 22 crons + webhooks         │
│                                                                              │
└───────────┬──────────────────────────────────────────────────┬──────────────┘
            │                                                  │
       Supabase (Postgres/RLS,                      APIs externas consumidas
       Auth, Storage, triggers/filas)               (Shopify, Klaviyo, Omnisend,
            │                                        Asaas, Meta/WhatsApp, Google,
       Upstash Redis (rate limit)                    Wise, n8n, Anthropic,
                                                     OpenRouter, OpenAI, Resend,
                                                     17track/trackingmore, …)
```

## Estrutura de `src/`

| Pasta | Papel |
|---|---|
| `app/` | Páginas por área (admin, client, auth, form(s), track) + `api/**` (~330 rotas) |
| `components/` | `ui/` (shadcn), `layout/` (sidebar admin, header), `client-layout/` (portal), + pastas por domínio (crm, campaigns, stores, onboarding, ai, …) |
| `lib/supabase/` | `client.ts` (browser, anon), `server.ts` (server + cookies), `admin.ts` (service role, sem sessão, `cache: no-store`), `middleware.ts` (refresh de token) |
| `lib/services/` | ~105 services de negócio (briefing, campaign-central, crm-automation-executor, crm-health, sync Klaviyo/Omnisend, refund, tracking, ai-usage, …) |
| `lib/agents/` | Pipeline de IA do Epic AE: `architect/` (Montador + Blueprint), `chains/` (copy, image, html, qa), `phase2-runner`, `html/` (build-vars, brand guards) |
| `lib/integrations/` | Clients de APIs externas (shopify, klaviyo + rate-limiter, omnisend, whatsapp, google-calendar, …) |
| `lib/api/` | Helpers de rota: errors (`AppError`, `errorResponse`/`successResponse`), `cron-auth`, `n8n-auth`, `portal-auth`, `require-store-access`, `check-permission` |
| `lib/permissions/` | RBAC: `role-access.ts` (gates por id de nav/feature), acesso por etapa (onboarding/campaign stage access) |
| `lib/schemas/`, `lib/validations/` | Schemas Zod por feature |
| `lib/` (raiz) | `rate-limit.ts` (Upstash), `cors.ts`, `cache.ts`, `logger.ts`, `crypto.ts` (credenciais criptografadas), `routes.ts`, `i18n/`, `translations/` |
| `types/` | Tipos canônicos: `database.ts` (gerado do Supabase), `crm.ts`, `email-generation.ts`, `email-workspace.ts`, `profile.ts` |
| `styles/` | `crm-tokens.css` (tokens `--crm-*`) |

## Autenticação e autorização

- **Middleware** (`src/middleware.ts` + `lib/supabase/middleware.ts`): refresh de sessão em toda request; rotas embeddable (`/tracking/embed`, `/api/script/*`) liberam iframe, o resto envia `X-Frame-Options: DENY`.
- **Camadas**: sessão Supabase → org membership (`org_members` → `org_id`) → role/feature check (`role-access.ts`, features como `view_financial`, `onboarding_approve`) → acesso por loja (`agent_store_access`, flags `can_view/can_edit/can_manage_*`) → RLS como defesa em profundidade.
- **Perfis**: admin, owner, manager, coo, sales, cs, marketing, dev (tag `dev` em `profiles.tags` dá acesso a ferramentas de prompt/telemetria).
- **Portal**: sessão Supabase separada validada contra `client_portal_users` com permissões JSONB.
- **M2M**: `CRON_SECRET` (Bearer), `N8N_WEBHOOK_SECRET` (`x-webhook-secret`), `INTERNAL_SECRET` (`x-internal-secret`), HMACs de terceiros — detalhes em [docs/api/README.md](../api/README.md).

## Estratégia de cache (resumo de [cache-strategy.md](./cache-strategy.md))

1. **`dashboard_cache`** (blob JSON genérico por store/tipo/período, TTL 10-60min) — Shopify, GA4, Asaas.
2. **Tabelas estruturadas cron-populated** (`store_revenue_summary`, `klaviyo_flow_metrics`, `klaviyo_campaign_metrics`, `omnisend_*`) — populadas por `/api/cron/sync-reports` (30min), TTL 6h, fallback live fetch.
3. **`live_fetch_cooldowns`** — lock distribuído via `INSERT ON CONFLICT` (RPC `try_acquire_live_fetch`) para evitar fetches concorrentes.
4. **SWR no browser** — stale-while-revalidate nas telas de CRM/campanhas.
5. Fallback geral: cache hit → serve; miss em cooldown → aguarda; live falhou (rate limit) → serve stale; tudo falhou → vazio/erro.

## Trabalho assíncrono

| Mecanismo | Uso |
|---|---|
| `after()` (Next 15) | Geração de copy/fase 2 em background após responder a request |
| **22 crons Vercel** | Sync de métricas, watchdogs, filas, snapshots de BI (tabela completa em [docs/api/07](../api/07-integracoes-cron.md#crons-apicron)) |
| **Filas em tabela** | `email_generation_queue_signals` (trigger `fn_on_briefing_confirmed`), `email_dispatch_jobs` (cron a cada minuto com lease/attempts) |
| **SSE** | `/api/sse/stores/[id]/emails` — status de geração em tempo real (poll de `email_status_events` a cada 2s) |
| **Fire-and-forget** | Webhooks outbound para n8n, triggers de automação CRM (`.catch()` + log) |
| **Watchdogs** | `email-generation-watchdog` e `campaign-copy-watchdog` (5min) — recuperam estados travados com claims atômicos e `MAX_GENERATION_ATTEMPTS` |

## Pipeline de agentes de IA (Epic AE — resumo)

Documentação completa: [pipeline-geracao-emails.md](./pipeline-geracao-emails.md), [inventario-agentes-ia.md](./inventario-agentes-ia.md), [adr-agent-email-generation.md](./adr-agent-email-generation.md).

```
Briefing → [Pesquisa & Diagnóstico (n8n)] → Montador (Opus) → Blueprint (Sonnet)
        → Copy (n8n) → Imagem (GPT Image via OpenRouter) → HTML (Sonnet) → QA (Sonnet)
```

- Configs de modelo/prompt vivem em `email_agent_configs` + prompts versionados em `agent_prompts` (UI em `/admin/settings/email-generation` e `/admin/agents/prompts`).
- Model id com `/` roteia via OpenRouter; sem `/` usa Anthropic SDK direto.
- Status machine de `email_flow_emails.status`: `draft → pending → copy_generating → copy_ready → rendering → image_done → qa_running → ready/failed` (gates: confirmação de briefing e de brand identity).
- Telemetria por run em `email_generation_runs` + custo agregado em `ai_usage_unified`.

## Configuração e variáveis de ambiente (~59)

Agrupamentos principais (lista completa via `grep -rhoE "process\.env\.[A-Z_]+" src`):

- **Supabase**: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- **IA**: `ANTHROPIC_API_KEY`, `OPENROUTER_API_KEY`, `OPENAI_API_KEY` + knobs (`EMAIL_QA_*`, `DISPATCH_*`, `MAX_GENERATION_ATTEMPTS`, `WATCHDOG_*`)
- **n8n**: `N8N_*_WEBHOOK_URL` (briefing, onboarding, email-copy, campaigns, campaign-copy, ads-analyzer) + `N8N_WEBHOOK_SECRET`
- **Integrações**: `SHOPIFY_API_KEY/SECRET`, `GOOGLE_CLIENT_ID/SECRET`, `META_APP_ID/SECRET`, `WHATSAPP_APP_SECRET`, `SEVENTEEN_TRACK_API_KEY`, `TRENDTRACK_API_KEY`, `RESEND_API_KEY`
- **Segurança M2M**: `CRON_SECRET`, `INTERNAL_SECRET`, `ASAAS_WEBHOOK_SECRET`, `ONBOARDING_WEBHOOK_SECRET`, `ENCRYPTION_KEY` (criptografia de credenciais por loja)
- **Infra**: `UPSTASH_REDIS_REST_URL/TOKEN`, `ALLOWED_ORIGINS`, `APP_URL`/`NEXT_PUBLIC_APP_URL`

## Segurança (headers e CSP)

`next.config.mjs`: CSP em **Report-Only** (whitelist de connect-src para Supabase, Klaviyo, Omnisend, Asaas, Wise, OpenAI, Shopify, Meta, Google, tracking), `X-Content-Type-Options: nosniff`, HSTS 2 anos, `Referrer-Policy: strict-origin-when-cross-origin`, `frame-ancestors 'none'` (exceto rotas embeddable). Rewrites: `/tracking/widget.js → /api/script/widget.js`. Redirects legacy: `/dashboard → /admin/dashboard`, `/portal/* → /client/*`.

## Documentos relacionados

- **API exposta**: [docs/api/](../api/README.md) — ~330 rotas com auth/params/rate limit + backlog de API pública
- **ADRs**: [adr-agent-email-generation.md](./adr-agent-email-generation.md), [adr-klaviyo-revenue-source.md](./adr-klaviyo-revenue-source.md)
- **Pipelines**: [pipeline-geracao-emails.md](./pipeline-geracao-emails.md), [fallbacks-geracao-emails.md](./fallbacks-geracao-emails.md), [n8n-api-integration.md](./n8n-api-integration.md)
- **CRM**: `docs/crm/`
- **Performance**: [diagnostico-performance-2026-07.md](./diagnostico-performance-2026-07.md)
