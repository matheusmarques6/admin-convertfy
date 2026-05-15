# Convertfy — Guia de Banco de Dados, Variáveis e Armazenamento

Guia operacional **completíssimo** para que qualquer integração nova seja feita
**sem conflitar** com o que já existe. Cobre: stack, schema (140+ tabelas
agrupadas por domínio), multi-tenant via `org_id`, RLS e helpers, credenciais
cifradas, cache, eventos, realtime, env vars (todas), padrões de API,
crons, services, types e regras de extensão.

> Princípio: **nada se grava num lugar só por gosto**. Cada categoria de
> dado tem um lar canônico. Se for adicionar algo, ache primeiro o lar
> existente — só crie tabela nova se realmente não couber.

---

## 0. TL;DR — Antes de qualquer integração

1. **Storage primário**: Postgres via Supabase. Tudo persistente vai aqui.
2. **Auth**: Supabase `auth.users` → `profiles` (1:1) → `org_members` (N:N com `organizations`).
3. **Multi-tenant**: tudo é escopado por `org_id`. Nunca crie tabela sem `org_id` (a menos que seja global/catálogo — `features_catalog`, `tutorial_blocks`).
4. **Credenciais**: cifradas com AES-256-GCM. Use `lib/crypto.ts` + `credentials.service.ts`. **Nunca** salve token em coluna sem cifrar.
5. **Cache de integrações externas**: `dashboard_cache` (write-through TTL). Não consulte Shopify/Klaviyo direto numa rota interativa — passe pelo cache.
6. **Acesso server**: `createClient()` (com cookies do usuário, respeita RLS) vs `createAdminClient()` (service role, bypassa RLS, **sempre** combinado com checagem manual).
7. **Padrão de rota API**: `requireAuth` → `resolveOrgId` → `requireStoreAccess`/feature check → query → `successResponse`/`errorResponse`. Toda rota de mutação valida com Zod.
8. **Cron**: `vercel.json` → `Authorization: Bearer ${CRON_SECRET}` via `requireCronAuth`. Cron job grava em tabelas de cache/summary; jamais é fonte primária de truth de cliente.
9. **Webhooks**: HMAC obrigatório (Shopify SHA-256, WhatsApp App Secret, N8N shared secret). Sem ENV de secret → 500 em prod.
10. **Realtime**: só onde absolutamente preciso (kanban, inbox). Subscrição manual a `postgres_changes`; deixa de ser barato em escala.

---

## 1. Stack de armazenamento (mapa mental)

| Camada | Tecnologia | Onde fica | Para quê |
|---|---|---|---|
| **Banco relacional** | Postgres (Supabase) | Cloud Supabase | Truth de domínio (clientes, deals, lojas, etc.) |
| **Autenticação** | Supabase Auth | `auth.users` (schema do Supabase) | Sessão, JWT, password reset |
| **Realtime** | Supabase Realtime | mesmo Postgres, replicação WAL | Kanban, inbox, onboarding ao vivo |
| **Storage de arquivos** | Supabase Storage (raro) | buckets Supabase | Logos, anexos (uso pontual) |
| **Cache distribuído (rate limit)** | Upstash Redis | Cloud Upstash | Rate limiting per-IP / per-user serverless |
| **Cache de dashboards** | Postgres (`dashboard_cache`) | mesmo banco | TTL-based, dados de Shopify/Klaviyo |
| **Cache de snapshots BI** | Postgres (`*_snapshots`) | mesmo banco | Cron diário pré-calcula reports |
| **Filas/eventos** | Postgres (`events`) | mesmo banco | Event-driven leve (não é Kafka) |
| **Storage de session/cookies** | Cookies HTTP (SSR) | navegador | Token Supabase refresca via middleware |
| **Estado client-side temporário** | Zustand (`src/stores/`) | RAM do browser | Productivity UI; **não persiste** |
| **Estado client-side persistente** | `localStorage` via `use-local-storage` | navegador | Preferências de UI (workspace, sidebar collapsed) |
| **Cache de dados client-side** | SWR | RAM do browser | Revalidation automática |

**Regra**: dado de domínio → Postgres. Cache temporário → `dashboard_cache` ou Upstash. Estado de UI → Zustand/localStorage. Nada de inventar novo storage.

---

## 2. Supabase — Os 3 clientes (saber qual usar é crítico)

Arquivos: `src/lib/supabase/{client,server,middleware}.ts`.

### 2.1 `createClient()` — Browser (`client.ts`)

```ts
import { createClient } from "@/lib/supabase/client"
const sb = createClient()
```

- Cookies HTTP automáticos.
- **Respeita RLS** (sessão do usuário logado).
- Use em Client Components / hooks.
- **Nunca** chame queries pesadas aqui — vão para servidor via API.

### 2.2 `createClient()` server (`server.ts`)

```ts
import { createClient } from "@/lib/supabase/server"
const sb = await createClient()
```

- Cookies do request (Next 15 `await cookies()`).
- **Respeita RLS** (sessão do usuário autenticado).
- **Default em rotas API**: começa sempre por aqui para autenticar.
- Use para `supabase.auth.getUser()` em rota; depois passe para `createAdminClient()` se precisar bypassar RLS.

### 2.3 `createAdminClient()` server (`server.ts`)

```ts
import { createAdminClient } from "@/lib/supabase/server"
const admin = createAdminClient()
```

- **Service role key** → **bypassa todas as RLS policies**.
- `autoRefreshToken: false`, `persistSession: false`.
- `fetch` com `cache: 'no-store'` para evitar cache do Next 15.
- **Sempre** combinado com validação manual: `requireAuth`, `resolveOrgId`, `requireStoreAccess`, etc.
- Use quando precisa cruzar fronteiras de org/store (admin views, cron, migrações de dados).
- **Risco**: se esquecer a validação, vaza dados entre orgs. Auditar em PR.

### 2.4 Middleware (`middleware.ts` + `lib/supabase/middleware.ts`)

- Roda em **toda rota não-API** (config `matcher`).
- Refresca sessão via cookies (essencial pro Supabase SSR).
- Redireciona:
  - `/admin/**` sem user → `/login`.
  - `/login` com user → `/admin/dashboard`.
  - `/` → `/admin/dashboard` (logado) ou `/login`.
- **Pula rotas `/api/**`** explicitamente — auth vai por dentro do handler.
- **Pula `/public/**` e `/client/auth/callback`**.
- Headers de segurança: `X-Frame-Options: DENY` + `CSP frame-ancestors 'none'` (exceto rotas iframe-embeddable).

### 2.5 Decisão rápida

| Contexto | Cliente |
|---|---|
| Hook / componente client | `client.ts > createClient()` |
| Server Component / `loader` | `server.ts > createClient()` |
| API route (auth) | `server.ts > createClient()` + `requireAuth` |
| API route (após auth, query cross-org) | `server.ts > createAdminClient()` |
| Cron job | `createAdminClient()` direto |
| Webhook (Shopify/WhatsApp/N8N) | `createAdminClient()` (não há user) |

---

## 3. Modelo multi-tenant — O grande "como isolar"

A app é uma **organização principal** (Convertfy) que atende **clientes**
(que têm **lojas**). Times internos (agências parceiras no futuro) também
são organizações.

```
auth.users
   │ (1:1)
   ▼
profiles
   │ (N:N via org_members)
   ▼
organizations  ──┬──> clients ──> client_stores
                 │                    │
                 └──> features_catalog│
                      org_member_features
                      agent_store_access  ←── permissão por loja
```

### 3.1 `organizations` (1 atualmente, multi futuro)

| Campo | Tipo | Comentário |
|---|---|---|
| `id` | UUID PK | |
| `name`, `slug` | TEXT | slug único |
| `type` | TEXT | `internal | agency | partner` |
| `logo_url`, `primary_color` | TEXT | branding |
| `settings` | JSONB | `{ is_main: true }` para Convertfy |
| `is_active` | BOOL | |

Seed: `INSERT ... ('Convertfy', 'convertfy', 'internal')`.

### 3.2 `profiles` — Espelho de `auth.users`

Trigger `on_auth_user_created` cria automaticamente row em `profiles`
quando alguém se cadastra. Mantém `email`, `name`, `role`, `avatar_url`.

`role` (legado): `admin | manager | sdr | closer | cs | financial`.
**Em vias de descontinuação** — o sistema atual usa `org_members.role` (`org_role`).

### 3.3 `org_members` — Quem pertence a quê org

| Campo | |
|---|---|
| `org_id` | FK organizations |
| `profile_id` | FK profiles |
| `role` (`org_role`) | `owner | manager | coordinator | copywriter | designer | developer | support | analyst` |
| `job_title` | TEXT customizado |
| `is_active` | BOOL |

UNIQUE (`org_id`, `profile_id`). Migração inicial moveu todos os `profiles.role=admin` para `org_role=owner` da Convertfy.

### 3.4 `features_catalog` + `org_member_features` — Permissões por feature

Catálogo de features (`onboarding_control`, `team_view`, `campaign_control`,
`view_financial`, etc.) atribuídas por membro. Granular, **não** por role.

```sql
SELECT 1 FROM org_member_features omf
JOIN org_members om ON om.id = omf.org_member_id
WHERE om.profile_id = auth.uid()
  AND omf.feature_key = 'campaign_control'
  AND omf.enabled = true
```

> Quando adicionar feature nova, **insira em `features_catalog`** com `key` único + categoria. Não invente `if` no código baseado em role.

### 3.5 `agent_store_access` — Acesso loja a loja

Membros não-owner enxergam **só** lojas em `agent_store_access` com
`can_view = true`. Permissões granulares:

- `can_view`, `can_edit`, `can_manage_onboarding`, `can_manage_campaigns`, `can_manage_reports`.

**Owner e admin global vêm todas as lojas implicitamente** (sem row).

### 3.6 Como **toda nova tabela** deve respeitar tenancy

1. Adicione **`org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE`**.
2. Crie índice `idx_<table>_org` em `org_id`.
3. Habilite RLS: `ALTER TABLE x ENABLE ROW LEVEL SECURITY;`.
4. Policy padrão:
   ```sql
   CREATE POLICY "tenant_isolation" ON x
     FOR ALL USING (org_id = current_org_id())
     WITH CHECK (org_id = current_org_id());
   ```
5. Se a entidade for por loja, **adicione também `store_id` FK** + RLS combinada:
   ```sql
   USING (org_id = current_org_id() AND store_id = ANY(SELECT accessible_store_ids()))
   ```

### 3.7 Helpers RLS (já criados — use-os)

Definidos em `20250125_05_rls_helpers.sql`. **Use sempre** dentro de policies; nunca duplique lógica:

| Função | Retorna |
|---|---|
| `is_admin()` | Profile.role = `admin` (legado, ainda usado) |
| `is_org_member()` | Tem `org_members` ativo |
| `is_org_owner()` | É owner de **alguma** org (TODO: ainda sem filtro por org_id) |
| `current_org_member_id()` | ID do org_member atual |
| `current_org_id()` | org_id do usuário atual |
| `has_feature(key)` | Tem feature `key` (true também para admin/owner) |
| `can_access_client(uuid)` | Acessa cliente via suas lojas |
| `can_manage_store_onboarding(uuid)` | Permissão granular |
| `can_manage_store_campaigns(uuid)` | Permissão granular |
| `accessible_store_ids()` | SET de UUIDs de lojas que o usuário enxerga |

Todas são `SECURITY DEFINER STABLE` — performance ok.

---

## 4. Schema — Mapa das tabelas por domínio

Hoje há **~140 tabelas**. Não vou cuspir todos os campos; vou agrupar por
domínio para você saber **onde procurar** quando integrar.

### 4.1 Core — Identidade & permissão

| Tabela | Para quê |
|---|---|
| `auth.users` | Auth (Supabase managed) |
| `profiles` | Mirror de auth.users + role legacy |
| `organizations` | Tenants |
| `org_members` | Quem pertence a qual org |
| `features_catalog` | Catálogo global de features |
| `org_member_features` | Atribuições por membro |
| `agent_store_access` | Permissão por loja |
| `password_reset_audit` | Histórico de reset |

### 4.2 Clientes & assinaturas

| Tabela | Para quê |
|---|---|
| `clients` | Clientes da agência (`status` ENUM: active/inactive/churned/prospect/onboarding, `health_score 0-100`, `custom_fields` JSONB, `owner_id`) |
| `client_stores` | Lojas dos clientes (Shopify/Nuvemshop/etc.) + **credenciais cifradas** |
| `client_subscriptions` | Assinaturas recorrentes (vinculadas a Asaas) |
| `client_charges` | Cobranças individuais |
| `client_briefings` | Briefing inicial estruturado |
| `store_briefings` | Briefing por loja |
| `client_notification_preferences` | Preferências de notificação |
| `store_transfer_history` | Auditoria de transferência de loja entre clientes |

> **Importante**: a "loja" é a unidade econômica real, não o cliente. Toda métrica/integração pendura em `client_stores.id`.

### 4.3 Financeiro

| Tabela | Para quê |
|---|---|
| `invoices` | Faturas (FK Asaas via `asaas_id`) |
| `contracts` | Contratos (`plan_name`, `monthly_value`, `status`) |
| `wise_reconciliations` | Conciliações Wise (USD) |
| `product_costs` | Custos por produto/loja |
| `store_cost_settings` | Config de custo da loja |
| `refunds` | Reembolsos sincronizados |

### 4.4 Lojas — Métricas e cache

| Tabela | Para quê |
|---|---|
| `store_revenue_summary` | Receita pré-calculada por loja+período (`7d/15d/30d/90d/1d/12m/custom:start:end`) |
| `dashboard_cache` | Cache TTL `{store_id, cache_type, period} → JSONB` |
| `klaviyo_flow_metrics` | Métricas de flow por loja+período |
| `klaviyo_campaign_metrics` | Métricas de campanha |
| `klaviyo_audiences` | Listas/segmentos |
| `klaviyo_campaigns` | Snapshot de campanhas |
| `klaviyo_sync_config` | Config de sync por loja |
| `klaviyo_sync_jobs` | Histórico de jobs |
| `omnisend_campaign_metrics` | Equivalente Omnisend |
| `omnisend_flow_metrics` | |
| `omnisend_reports_cache` | |
| `attribution_summary` | Receita atribuída |
| `order_attribution` | Atribuição por pedido |
| `store_top_customers` | Top clientes denormalizado |
| `store_alerts` | Alertas operacionais |
| `store_revenue_summary` | Sumário receita |
| `store_feedback_calls` | Calls de feedback (auto-criadas via meetings.store_id) |
| `store_onboarding_data` | Dados do onboarding por loja |

### 4.5 CRM — Sales + CS (escopo `/admin/crm/**`)

Estendeu `pipelines`, `pipeline_stages`, `deals` (não criou paralelas). Tabelas auxiliares prefixadas `crm_*`.

| Tabela | Para quê |
|---|---|
| `pipelines` | Pipelines com `scope` (`sales | cs | internal`), `color`, `layout` (`kanban | state`) |
| `pipeline_stages` | Etapas com `stage_type` (`open | won | lost | archived`), `sla_hours`, `automation_on_enter` JSONB, `exit_criteria` |
| `deals` | Deals (extendido com `lead_id`, `store_id`, `status`, `lost_reason`, `won_at`, `source`, `utm`, `tags`, `position`, `last_stage_changed_at`) |
| `crm_leads` | Leads (pré-deal) |
| `crm_contacts` | Contatos por cliente |
| `crm_partners` | Parceiros/influenciadores |
| `crm_deal_history` | Histórico de mudanças do deal |
| `crm_deal_activities` | Atividades (calls, tasks, notes) |
| `crm_deal_tags` | Tags |
| `crm_health_history` | Health score histórico |
| `crm_pipeline_snapshots` | Snapshot diário do pipeline (cron) |
| `crm_org_snapshots` | Snapshot da org |
| `crm_lead_funnel_snapshots` | Funil de leads |
| `crm_channels` | Canais de mensageria (WhatsApp config) |
| `crm_threads` | Threads de inbox |
| `crm_messages` | Mensagens individuais |
| `crm_automation_runs` | Execuções de automação |
| `crm_ai_actions` | AI actions (prompts versionados) |
| `crm_ai_action_runs` | Runs com tokens/cost |
| `crm_forms` | Formulários de captura |
| `crm_form_fields` | Campos de formulário |
| `crm_form_submissions` | Submissões |
| `crm_custom_fields` | Custom fields do CRM |

> **Decisão arquitetural** (vale ouro): CRM **não duplica** clients/stores. Deals/leads referenciam via FK. Quando um lead converte, popula `converted_to_client_id` e `converted_to_deal_id` — nada de cópia.

### 4.6 Onboarding (v2 — atual)

| Tabela | Para quê |
|---|---|
| `onboardings` | Onboarding mestre (v2) |
| `onboarding_versions` | Versões do template aplicado |
| `onboarding_templates` | Templates reusáveis |
| `onboarding_template_steps` | Etapas do template |
| `client_onboardings` | Status por cliente |
| `client_onboarding_steps` | Steps individuais |
| `onboarding_history` | Histórico de mudanças |
| `onboarding_phase_transitions` | Transições entre fases |
| `onboarding_approvals` | Aprovações |
| `onboarding_edit_log` | Audit log |
| `onboarding_rejection_log` | Rejeições |
| `tutorial_pages` | Páginas do tutorial |
| `tutorial_blocks` | Blocos de conteúdo |
| `board_config` | Config do board (drag-drop layout) |

> O sistema v1 foi droppado em `20260314_drop_legacy_onboarding_system.sql`. Não recriar.

### 4.7 Campanhas

| Tabela | Para quê |
|---|---|
| `campaigns` | Campanhas (legado) |
| `campaign_batches` | Geração em lote |
| `campaign_generations` | Histórico de gerações |
| `campaign_generation_tasks` | Tasks individuais |
| `campaign_generation_stores` | Stores em cada batch |
| `campaign_history` | Auditoria |
| `campaign_metrics` | Métricas |
| `campaign_metrics_history` | Histórico |
| `campaign_alerts` | Alertas |
| `campaign_pipeline_items` | Items do pipeline de copy |
| `copy_pipeline` | Pipeline de copywriting |
| `campaign_pipeline` (tabela) | (legado) |
| `utm_templates` | Templates de UTM |
| `email_logs` | Logs de envio (Resend) |
| `email_templates` | Templates de email |

### 4.8 Reuniões & Calendário

| Tabela | Para quê |
|---|---|
| `meetings` | Reuniões (status: scheduled/completed/cancelled/no_show, `store_id` opcional) |
| `meeting_participants` | Participantes (multi-pessoa via `meeting_participant_type`) |
| `user_google_tokens` | OAuth tokens Google (calendar/ads) — **cifrado** |
| `cron_locks` | Lock para cron de Google Calendar evitar concorrência |

### 4.9 Tarefas & Produtividade

| Tabela | Para quê |
|---|---|
| `tasks` | Tarefas unificadas (fonte única via `source_type`/`source_metadata`) |
| `task_history` | Auditoria |
| `task_checklists` | Checklists |
| `task_comments` | Comentários |
| `task_deliverables` | Entregas |
| `task_overrides` | Overrides por task |

### 4.10 Operacional (kanban de execução)

| Tabela | Para quê |
|---|---|
| `operational_pipelines` | Pipelines operacionais (kanban) |
| `operational_pipeline_columns` | Colunas (estados) |
| `pipeline_members` | Membros do pipeline |
| `pipeline_import_logs` | Imports CSV/Kommo |
| `pipeline_import_rules` | Regras de import |

### 4.11 Portal do cliente (cliente final acessa)

| Tabela | Para quê |
|---|---|
| `client_portal_users` | Usuários do portal (separados de `auth.users` admin) |
| `client_portal_sessions` | Sessões do portal |
| `client_portal_activity` | Atividade |
| `client_report_tokens` | Tokens públicos de report |
| `client_reports` | Reports gerados |

> Portal usa **auth separado** (`/client/auth`). Não usa Supabase Auth direto — usa magic link customizado + sessões em DB.

### 4.12 Tracking & Analytics

| Tabela | Para quê |
|---|---|
| `tracking_stores` | Lojas com tracking script |
| `tracking_codes` | Snippets gerados |
| `tracking_orders` | Pedidos rastreados |
| `tracking_lookups` | Lookups por order |
| `tracking_config` | Config por loja |
| `order_tracking_cache` | Cache de tracking |

### 4.13 Infra (rate limit, eventos, notifs, AI, refunds)

| Tabela | Para quê |
|---|---|
| `rate_limits` | Tracking sliding window (legacy; hoje usamos Upstash) |
| `rate_limit_config` | Regras (legacy) |
| `events` | Event bus interno (event-driven leve) |
| `notifications` | In-app notifications |
| `notification_preferences` | Preferências |
| `live_fetch_cooldowns` | Cooldown de fetch ao vivo |
| `fetch_cooldown` (service) | Logic |
| `ai_prompt_templates` | Prompts versionados |
| `ai_chat_conversations` | Histórico de chat AI |
| `ai_chat_messages` | Mensagens |
| `report_jobs` | Jobs de geração de report (async) |
| `weekly_reports` | Reports semanais |
| `settings` | Settings globais key/value JSONB |

### 4.14 Integrações

| Tabela | Para quê |
|---|---|
| `integrations` | Catálogo de integrações ativas (não-loja) |

### 4.15 Tabelas que **vão sumir** (legado — não use)

- `automations` / `automation_logs` (substituído por `crm_automation_*`).
- `activities` (substituído por `crm_deal_activities`).
- `custom_fields` / `tags` globais (CRM tem suas próprias).

Se for tocar nelas, abra issue primeiro.

---

## 5. Credenciais — Cifragem AES-256-GCM (NUNCA ignore)

**Arquivo**: `src/lib/crypto.ts`. **Service**: `src/lib/services/credentials.service.ts`.

### 5.1 Algoritmo

- AES-256-GCM, IV 12 bytes, auth tag 16 bytes.
- Formato: `enc:v1:<base64(iv || tag || ciphertext)>`.
- Prefixo `enc:v1:` permite migração para v2 sem quebrar dados antigos.
- Idempotente: `encrypt(alreadyEncrypted)` retorna o mesmo.

### 5.2 Onde fica a chave

- ENV: `ENCRYPTION_KEY` — **64 hex chars** (32 bytes).
- Gera com: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
- **Sem essa env**: aplicação **explode** ao tentar decifrar (intencional — fail-fast).
- **Trocar chave**: requer migration que descriptografa com chave antiga e recifra com nova. Roteiro em `docs/guides/credential-key-rotation.md`.

### 5.3 Campos cifrados (canônico em `lib/constants/credentials.ts`)

**Strings simples** (encrypt/decrypt):

```
shopify_access_token, shopify_api_key, shopify_api_secret,
klaviyo_api_key, klaviyo_private_key, klaviyo_public_key,
omnisend_api_key, meta_access_token
```

**JSON blobs** (encryptCredentialsJson / decryptCredentialsJson):

```
google_ads_credentials, google_calendar_credentials, ga4_credentials
```

### 5.4 Como ler/gravar credenciais (única forma correta)

```ts
import { getStoreCredentials, updateStoreCredentials } from "@/lib/services/credentials.service"

// Leitura — devolve descriptografado em memória, NUNCA retorna ao client
const creds = await getStoreCredentials(storeId)
// creds.shopify_access_token está em plain text aqui

// Atualização — cifra automaticamente
await updateStoreCredentials(storeId, {
  klaviyo_private_key: "pk_live_xxx",
})
```

### 5.5 Sanitização para client

```ts
import { sanitizeStoreResponse } from "@/lib/services/credentials.service"

return successResponse(req, { store: sanitizeStoreResponse(store) })
// Cada campo sensível vira true/false (booleano "tem credencial?") — nunca ciphertext.
```

### 5.6 Validação de input

`credentials.service.ts` valida que campos só contêm ASCII printable 0x20-0x7E
(exceto `meta_access_token`, que vem de OAuth). Bloqueia caracteres invisíveis
e Unicode bagunça.

### 5.7 Filtros prontos para Supabase queries

```ts
import {
  KLAVIYO_CREDENTIALS_FILTER,
  OMNISEND_CREDENTIALS_FILTER,
  ANY_EMAIL_PLATFORM_FILTER,
} from "@/lib/services/credentials.service"

admin.from("client_stores").select("*").or(KLAVIYO_CREDENTIALS_FILTER)
```

> **Regra dura**: se você está adicionando um campo de credencial (uma nova integração), **adicione o nome em `ENCRYPTED_FIELDS`** e use os helpers. Senão a coisa vaza.

---

## 6. Environment variables — Inventário COMPLETO

Fontes: `.env.example` (genérico) + `.env.local.example` (mais detalhado). Algumas vars são só read pelo runtime, outras precisam estar setadas no build. Categorias:

### 6.1 Supabase (obrigatórias — sem isso nada roda)

| Var | Onde lê | Lado | Notas |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `lib/supabase/{client,server,middleware}.ts` | Browser + Server | URL do projeto |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | mesmos | Browser + Server | Anon (RLS aplica) |
| `SUPABASE_SERVICE_ROLE_KEY` | `lib/supabase/server.ts > createAdminClient` | **Apenas server** | **NUNCA** expor no client |
| `SUPABASE_URL` | duplicata (legado) | server | Pode coexistir com `NEXT_PUBLIC_SUPABASE_URL` |
| `SUPABASE_ANON_KEY` | duplicata | server | |

### 6.2 App (genéricas)

| Var | Default | Para quê |
|---|---|---|
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` | URL absoluta (callbacks OAuth, emails) |
| `NEXT_PUBLIC_APP_NAME` | `Convertfy Admin` | Branding em emails |
| `NODE_ENV` | `development` | Standard Next.js |
| `LOG_LEVEL` | `info` | `debug | info | warn | error` |
| `ALLOWED_ORIGINS` | `http://localhost:3000` | Lista CSV para CORS |

### 6.3 Segurança / Crypto (obrigatórias)

| Var | Notas |
|---|---|
| `ENCRYPTION_KEY` | 64 hex chars — credenciais cifradas |
| `CRON_SECRET` | Bearer token para `/api/cron/*` (timing-safe compare) |
| `N8N_WEBHOOK_SECRET` | Header `x-webhook-secret` em webhooks N8N |
| `SHOPIFY_API_SECRET` | HMAC verification de webhooks Shopify (sem ela → 500) |
| `WHATSAPP_APP_SECRET` | HMAC para webhook WhatsApp (sem ela → 401 em prod, skip em dev) |
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | Verification challenge GET inicial |
| `ASAAS_WEBHOOK_SECRET` | Verificação de webhook Asaas |
| `ONBOARDING_WEBHOOK_SECRET` | Webhook de onboarding |

### 6.4 Rate limit (produção)

| Var | Notas |
|---|---|
| `UPSTASH_REDIS_REST_URL` | Sem isso, rate limit é fail-open em dev e **503** em endpoints `failClosed` em prod |
| `UPSTASH_REDIS_REST_TOKEN` | |

### 6.5 OAuth & integrações de loja

| Var | Para quê |
|---|---|
| `SHOPIFY_API_KEY` / `SHOPIFY_API_SECRET` | Shopify OAuth + webhook HMAC |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth (Ads, Calendar, GA4) |
| `GOOGLE_ADS_DEVELOPER_TOKEN` | Google Ads API |
| `META_APP_ID` / `META_APP_SECRET` | Meta/Facebook Ads |
| `ASAAS_API_KEY` | API Asaas (cobrança) |
| `NEXT_PUBLIC_ASAAS_ENVIRONMENT` | `sandbox | production` |
| `KLAVIYO_API_KEY` / `KLAVIYO_PUBLIC_KEY` | (legado — credenciais agora ficam em `client_stores`) |

### 6.6 WhatsApp Cloud API

| Var | Notas |
|---|---|
| `WHATSAPP_PHONE_NUMBER_ID` | ID do telefone na Meta |
| `WHATSAPP_ACCESS_TOKEN` | (legado — agora em `crm_channels`) |
| `WHATSAPP_BUSINESS_ACCOUNT_ID` | WABA |
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | Challenge inicial |
| `WHATSAPP_APP_SECRET` | HMAC payload |

### 6.7 Email (Resend)

| Var | |
|---|---|
| `RESEND_API_KEY` | `re_xxxxxxxx` |
| `RESEND_FROM_EMAIL` | `noreply@yourdomain.com` |
| `RESEND_FROM_NAME` | `Convertfy` |

### 6.8 AI

| Var | |
|---|---|
| `ANTHROPIC_API_KEY` | Anthropic (Claude) — usado em `crm-ai-action.service` direto via Messages API |
| `OPENAI_API_KEY` | OpenAI (legado / chat) |
| `DEEPSEEK_API_KEY` | DeepSeek (CLI agents) |
| `OPENROUTER_API_KEY` | Roteamento multi-model |

### 6.9 N8N (workflows)

| Var | |
|---|---|
| `N8N_API_KEY` | API N8N |
| `N8N_WEBHOOK_URL` | URL base do N8N |
| `N8N_WEBHOOK_SECRET` | Shared secret (header) |
| `N8N_CAMPAIGNS_WEBHOOK_URL` | Endpoint específico para campanhas |

### 6.10 Outros

| Var | |
|---|---|
| `SENTRY_DSN` | Error tracking |
| `RAILWAY_TOKEN` / `VERCEL_TOKEN` | Deploy |
| `GITHUB_TOKEN` | CI / scripts |
| `CLICKUP_API_KEY` | Integração ClickUp |
| `EXA_API_KEY` / `CONTEXT7_API_KEY` | Tools dos agentes AIOS (não app runtime) |
| `AIOS_VERSION` | `2.2.0` |

### 6.11 Regras de ENV inflexíveis

1. **`NEXT_PUBLIC_*` é público** — qualquer var sensível **nunca** com prefixo público.
2. **Validação fail-fast**: `ENCRYPTION_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, `SHOPIFY_API_SECRET` → faltam → exception.
3. **Em dev** algumas vars permitem fail-open (Redis, WhatsApp HMAC) — controlado via `process.env.NODE_ENV === 'development'`.
4. **Adicionou var nova?** Documenta em `.env.example` **e** `.env.local.example`. Sem comentário não passa em review.
5. **Local dev**: `.env.local` (Next 15 prioriza acima de `.env`). Não commitado.

---

## 7. Cache — Onde cada tipo de dado mora (e por quanto tempo)

### 7.1 `dashboard_cache` — TTL key-value

Schema:

```sql
{ id, store_id, cache_type, period, data JSONB, expires_at, created_at }
UNIQUE(store_id, cache_type, period)
```

TTL configurado em `src/lib/cache.ts > CACHE_TTL`:

| `cache_type` | Períodos | TTL (min) |
|---|---|---|
| `shopify` | 7d/15d/30d/90d/all | 15-60 |
| `ga4` | 7d/15d/30d/90d/all | 15-60 |
| `asaas_payments` | 7d/15d/30d/90d/all | 10-60 |
| `asaas_billing` | 7d/15d/30d/90d/all | 10-60 |
| `client_performance` | today/yesterday/7d/15d/30d | 30-240 |
| `klaviyo_metadata` | account_info / placed_order_metric | 1440 (24h) |

`CACHE_VERSION = 5` — bump quando lógica de cálculo muda (invalida tudo).

**Stale grace** (`STALE_GRACE_MINUTES`): mesmo expirado, serve como fallback se nova fetch falhar (rate limit Klaviyo). Vale para `klaviyo_perf` (24h), `client_performance` (12h), `shopify` (6h).

### 7.2 `store_revenue_summary` — Write-through cache

```sql
PK: (store_id, period_label)
period_label: '7d' | '15d' | '30d' | '90d' | '1d' | '12m' | 'custom:YYYY-MM-DD:YYYY-MM-DD'
sync_source: 'cron' | 'live' | 'report'
```

Cron `*/30 * * * *` (`/api/cron/sync-reports`) popula. UPSERT com `onConflict: "store_id,period_label"`. **Não use** com offset por origem — só (store, period) é chave.

### 7.3 Outros caches Postgres

| Tabela | Para quê |
|---|---|
| `omnisend_reports_cache` | Reports Omnisend |
| `order_tracking_cache` | Tracking por order |
| `crm_pipeline_snapshots` | BI snapshot diário CRM |
| `crm_org_snapshots` | |
| `crm_lead_funnel_snapshots` | |
| `report_jobs` | Cache de relatórios gerados |

### 7.4 Upstash Redis (rate limit)

- `src/lib/rate-limit.ts` — instâncias cacheadas por `limit:window`.
- Sliding window (Upstash Ratelimit).
- `failClosed: true` em endpoints sensíveis (login, signup) → 503 sem Redis em prod.
- Default fail-open em dev.

### 7.5 Cliente — SWR + Zustand + localStorage

- **SWR**: revalidação automática de fetches em hooks (`use-api-data`, `use-client-performance`, etc.). TTL implícito por focus/revalidation.
- **Zustand**: estado UI complexo (productivity board). **Não persiste**.
- **localStorage** (via `use-local-storage`): preferências (`workspace`, `sidebar-collapsed`, `last-store-selected`). Read-only no SSR.

### 7.6 Invalidação — Como limpar quando algo muda

| Cache | Como invalidar |
|---|---|
| `dashboard_cache` | `DELETE FROM dashboard_cache WHERE store_id = X AND cache_type = 'klaviyo_metadata'` |
| `store_revenue_summary` | Set `expires_at = NOW()` ou aguardar próximo cron |
| Bump global | Incrementar `CACHE_VERSION` em `lib/cache.ts` |
| SWR | `mutate(key)` no client |
| Upstash | Pode-se zerar key específica via Redis CLI |

---

## 8. Eventos — Event bus interno

Tabela `events`:

```sql
{ id, event_type, entity_type, entity_id, actor_id, actor_type, payload, metadata, processed, processed_at, created_at }
```

- Padrão pub-sub leve em DB. Não é Kafka — não use pra alta vazão.
- Producers: services que publicam (`emit('order_created', ...)`).
- Consumers: workers cron que processam `processed = false` e marcam `processed_at`.
- **Idempotência**: dedup por `entity_type + entity_id + event_type` quando relevante.

Use **antes** de criar webhook ou cron ad-hoc.

---

## 9. Realtime — Quando vale (e como)

Use Supabase Realtime **só** em:

- Inbox CRM (`crm_messages`).
- Kanban CRM (`deals`, `pipeline_stages`).
- Onboarding live (`client_onboardings`, `client_onboarding_steps`, `tasks`).

Padrão (`use-realtime-onboarding.ts`):

```ts
const channel = supabase
  .channel("onboarding-realtime")
  .on("postgres_changes",
      { event: "*", schema: "public", table: "client_onboardings", filter: `org_id=eq.${orgId}` },
      handler)
  .subscribe()

return () => supabase.removeChannel(channel)
```

**Habilitar realtime na tabela**: migration explícita
(`20260315_enable_realtime_client_onboardings.sql`,
`20260316_enable_realtime_onboarding_steps_and_tasks.sql`).

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE client_onboardings;
```

> Cuidado: cada tabela publicada gera tráfego WAL. Não ative em tabelas hot
> que não precisam de live update.

---

## 10. Padrão de rota API — Template canônico

Todo handler segue esse esqueleto. **Cole** quando criar rota nova.

```ts
import { NextRequest } from "next/server"
import { z } from "zod"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import {
  errorResponse,
  successResponse,
  requireAuth,
  parseAndValidate,
  AppError,
} from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"
import { requireStoreAccess } from "@/lib/api/require-store-access"
import { logger } from "@/lib/logger"

const log = logger.child("MyFeature")
export const dynamic = "force-dynamic"

const CreateSchema = z.object({
  name: z.string().min(1),
  store_id: z.string().uuid(),
})

export async function POST(request: NextRequest) {
  try {
    // 1. Auth (respeita RLS)
    const sb = await createClient()
    const user = await requireAuth(sb)

    // 2. Resolver tenant
    const orgId = await resolveOrgId(user.id)

    // 3. Validar body
    const body = await parseAndValidate(request, CreateSchema)

    // 4. Permissão granular (loja específica)
    await requireStoreAccess(body.store_id, user.id, "can_edit")

    // 5. Operação (admin client para bypassar RLS se precisar cruzar org)
    const admin = createAdminClient()
    const { data, error } = await admin
      .from("my_table")
      .insert({ ...body, org_id: orgId, created_by: user.id })
      .select()
      .single()
    if (error) throw error

    // 6. Logging estruturado
    log.info("created", { id: data.id, orgId })

    // 7. Response
    return successResponse(request, { item: data }, { status: 201 })
  } catch (error) {
    log.error("create failed", error)
    return errorResponse(request, error, "my-feature-create")
  }
}
```

### 10.1 `errorResponse` mapeia tudo

| Tipo erro | Status | Code |
|---|---|---|
| `AppError(msg, status, code)` | dinâmico | dinâmico |
| `UnauthorizedError` | 401 | UNAUTHORIZED |
| `ForbiddenError` | 403 | FORBIDDEN |
| `NotFoundError` | 404 | NOT_FOUND |
| `ValidationError` | 400 | VALIDATION_ERROR |
| `ConflictError` | 409 | CONFLICT |
| `ZodError` | 400 | VALIDATION_ERROR + `details` field-by-field |
| Postgres `42501` (RLS) | 403 | DATABASE_ERROR ("Permissão negada") |
| Postgres `23503` (FK) | 400 | DATABASE_ERROR ("Registro referenciado…") |
| Postgres `23505` (unique) | 409 | DATABASE_ERROR ("Registro duplicado") |
| Outros | 500 | INTERNAL_ERROR |

### 10.2 `successResponse` shape

```json
{ "success": true, "item": { ... }, "message": "opcional" }
```

CORS aplicado automaticamente via `corsHeaders(origin)`.

### 10.3 Padrões anti-conflito

- **Sempre filtrar por `org_id`** mesmo quando RLS já filtra. Defense-in-depth.
- **`createAdminClient` sem `requireStoreAccess`** = bug crítico de tenancy.
- **Cron**: `requireCronAuth(request)` no topo. Sem auth → 401.
- **Webhook externo**: `requireWebhookSecret(request, "ENV_NAME", "x-header")`.

---

## 11. Cron jobs — Inventário e schedule

`vercel.json > crons` (servidor Vercel chama o path com `Authorization: Bearer ${CRON_SECRET}`):

| Path | Schedule | O que faz |
|---|---|---|
| `/api/cron/sync-reports` | `*/30 * * * *` | Klaviyo/Omnisend → `store_revenue_summary` + `dashboard_cache` |
| `/api/cron/sync-omnisend` | `*/30 * * * *` | Sync Omnisend padrão |
| `/api/cron/sync-omnisend?periods=1d,7d,30d,90d` | `0 4 * * *` | Sync diário completo |
| `/api/cron/store-alerts-check` | `0 8 * * 1` | Alertas semanais (segunda 8h) |
| `/api/cron/tracking-sync` | `0 */6 * * *` | Tracking de pedidos |
| `/api/cron/board-automation` | `0 9 * * 1-5` | Automação onboarding (dias úteis) |
| `/api/cron/google-calendar-sync` | `0 * * * *` | Sync Google Calendar |
| `/api/reports/cleanup` | `0 3 * * *` | Cleanup de jobs antigos |
| `/api/cron/crm-health-compute` | `0 5 * * *` | Health score CRM |
| `/api/cron/crm-snapshot` | `0 6 * * *` | Snapshots BI CRM |
| `/api/cron/weekly-feedback` | `0 7 * * 1` | Feedback semanal de loja |
| `/api/cron/operational-overdue` | `0 9 * * *` | Marcar operacional atrasado |
| `/api/cron/process-deal-won` | `* * * * *` | Processa deals vencidos (1min) |
| `/api/cron/onboarding-sla-check` | `0 9 * * *` | SLA estourado em onboarding |

**Regra de ouro do cron**: idempotente, UPSERT, lock via `cron_locks` quando há
risco de concorrência (ex.: Google Calendar sync). Nunca depende de "última
vez que rodou" — cada execução é completa para o que cobre.

---

## 12. Services — Onde mora a lógica de negócio

Arquivos em `src/lib/services/`. **Use-os** em vez de duplicar lógica em routes.

| Service | Responsabilidade |
|---|---|
| `auth.service.ts` | Login/signup, password reset |
| `client.service.ts` | CRUD de clientes (CRM-aware) |
| `deal.service.ts` | Lógica de deals + transições |
| `credentials.service.ts` | Read/write de credenciais cifradas |
| `credential-validator.service.ts` | Valida creds via API real |
| `klaviyo-sync.service.ts` | Sync de métricas Klaviyo |
| `klaviyo-performance.service.ts` | Cálculo performance |
| `google-auth.service.ts` | Google OAuth flow |
| `google-calendar-sync.service.ts` | Sync de eventos |
| `crm-automation-executor.service.ts` | Executa DAG de automação CRM |
| `crm-trigger-dispatcher.service.ts` | Disparo de triggers |
| `crm-ai-action.service.ts` | AI actions (prompts + Anthropic direto) |
| `crm-snapshot.service.ts` | Cron snapshots |
| `crm-health.service.ts` | Health score (email 35% + revenue 30% + tickets 20% + NPS 15%) |
| `deal-won-watcher.service.ts` | Detecta won deals e dispara automações |
| `notification.service.ts` | Cria notification + events |
| `ai.service.ts` | Wrapper Claude/OpenAI |
| `ai-context.service.ts` | Builder de contexto AI |
| `fetch-cooldown.service.ts` | Cooldown de fetch ao vivo (`live_fetch_cooldowns`) |
| `exchange-rate.service.ts` | Wise/BCB USD-BRL |
| `n8n-trigger.service.ts` | Dispara workflows N8N |
| `briefing.service.ts` / `briefing-generation.service.ts` | Briefings |
| `onboarding-bootstrap.service.ts` | Garante org tem tutorial/onboarding seedado |
| `onboarding-sync.service.ts` | Sync onboarding v2 |
| `legacy-onboarding-migration.service.ts` | Migra v1→v2 |
| `instagram-graph.service.ts` | Integração Instagram |
| `board-config-defaults.ts` | Defaults do board onboarding |

> **Convenção**: services nunca usam `cookies()`. Recebem `userId`/`orgId` como
> arg ou usam `createAdminClient()`. Isso garante reuso em cron + route.

---

## 13. Tipos — Onde mora o domínio em TypeScript

`src/types/index.ts` reexporta tudo. Arquivos por domínio:

```
activity.ts            crm-automation.ts       organization.ts
ai.ts                  crm.ts                  pipeline.ts
automation.ts          events.ts               portal.ts
campaign-pipeline.ts   financial.ts            productivity.ts
campaign.ts            integration.ts          report.ts
client.ts              meeting.ts              settings.ts
contract.ts            onboarding-pipeline.ts  task.ts
                       onboarding.ts           tracking.ts
                       operational-pipeline.ts user.ts
                       weekly-report.ts
```

Regras:

1. **Schema do banco muda → atualize o type aqui antes de PR**.
2. **JSONB column** → defina tipo TS na hora; nunca `any`/`unknown` solto.
3. **Não use tipos auto-gerados do Supabase** (decisão da casa). Tipagem é mantida manual.
4. **Enums** mirroram os enums Postgres (`ClientStatus`, `MeetingStatus`, etc.). Nunca divergir.

---

## 14. Constants e Schemas

`src/lib/constants/`:

| Arquivo | |
|---|---|
| `credentials.ts` | `ENCRYPTED_FIELDS`, `ENCRYPTED_JSON_FIELDS`, `ALL_SENSITIVE_FIELDS` |
| `routes.ts` | (no `lib/routes.ts`) Mapa de rotas de admin/cliente — use `ROUTES.ADMIN.*` |

`src/lib/schemas/`:

- Zod schemas reutilizáveis. **Sempre** reaproveite (ex.: `phoneSchema`, `cpfCnpjSchema`).

`src/lib/validations/`:

- Validators de domínio (regras de negócio: ex.: contrato fechado não pode ter `end_date < start_date`).

---

## 15. Migrações Supabase — Convenção

**Pasta**: `supabase/migrations/`. **161+ arquivos**.

### 15.1 Padrão de nomenclatura

| Era | Padrão | Exemplo |
|---|---|---|
| 2024 (legado) | `00001_*`, `001_*` | `00001_initial_schema.sql` |
| 2024-2025 | `YYYYMMDD_descricao.sql` | `20241213_add_store_credentials.sql` |
| 2025+ | `YYYYMMDD_NN_descricao.sql` | `20250125_05_rls_helpers.sql` (NN ordena migrações do mesmo dia) |
| Recente | `YYYYMMDDHHMMSS_descricao.sql` | `20260513015053_onboarding_v2_schema.sql` |

> Sempre **timestamp futuro** quando a migration é "feature nova" (`20260507_*` etc.) — convenção para precedência clara.

### 15.2 Regras dentro do arquivo

1. **Idempotente**: `CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, `DO $$ ... EXCEPTION WHEN duplicate_object THEN null; END $$;`.
2. **RLS habilitado**: `ALTER TABLE x ENABLE ROW LEVEL SECURITY;` + policies.
3. **Helpers RLS centralizados** — use `current_org_id()`, `accessible_store_ids()` etc. Não duplique queries.
4. **Indexes nos JOINs** e filtros comuns. Sempre crie índice para coluna usada em WHERE/JOIN frequente.
5. **`updated_at` trigger** se a tabela tiver essa coluna — use `update_updated_at_column()`.
6. **Comments**: `COMMENT ON COLUMN x.y IS '...';` é mandatório para JSONB e enums.

### 15.3 Aplicar migration

Em dev local: `supabase db push` (CLI Supabase).
Em prod: aplicada via Supabase Dashboard SQL Editor ou CI deploy do MCP.

**Não** rode migration de prod direto sem revisar — pode bloquear tabela
durante long-running ALTER em produção.

### 15.4 Rollback

Pasta `supabase/migrations/` tem arquivos `*_ROLLBACK_*.sql` quando aplicável
(ex.: `20260317_01_ROLLBACK_enforce_explicit_store_access.sql`).

---

## 16. Hooks de cliente que tocam dados

`src/hooks/` + `src/lib/hooks/`:

| Hook | O que faz |
|---|---|
| `use-api-data` | Fetcher SWR genérico |
| `use-client-performance` | Performance por cliente |
| `use-store-performance` | Performance por loja |
| `use-permissions` | Hook de permissões dinâmicas (use-permissions.tsx — **fonte de verdade**) |
| `use-realtime-board` | Realtime kanban |
| `use-realtime-onboarding` | Realtime onboarding |
| `use-realtime-revenue` | Realtime receita |
| `use-stores-fan-out` | Fetch paralelo em N lojas |
| `use-campaign-polling` | Polling de jobs de campanha |
| `use-report-job` | Polling de job de report |
| `use-report-notifications` | Notificações de report pronto |
| `use-sidebar` | Estado da sidebar |
| `use-workspace` | Workspace atual + persistido em localStorage |
| `use-data-status` | Status de fetch (loading/empty/error/partial) |
| `use-local-storage` | Wrapper SSR-safe |
| `use-debounce`, `use-async`, `use-media-query`, `use-origin` | utilitários |

> **Para integrações novas**: prefira escrever 1 hook em `lib/hooks/` que use SWR + endpoint API único. Não fetch direto em componente.

---

## 17. Stores (Zustand) — Quando faz sentido

Hoje: **um** store global (`src/stores/productivity-store.ts`) — pra Productivity Home, que tem estado UI complexo (drag&drop, multi-painel).

Regra: **só criar Zustand store se**:
1. Estado é UI puro (não vem de servidor).
2. É compartilhado entre componentes não-aninhados.
3. SWR + props não dariam conta.

Senão: SWR (server state) + useState (UI local).

---

## 18. Logger — Nunca use `console.log`

`src/lib/logger.ts`:

```ts
import { logger } from "@/lib/logger"
const log = logger.child("MyComponent")

log.info("created", { id, orgId })
log.warn("rate limited", { retryIn })
log.error("failed", { error, context })
log.debug("internal state", state)
```

- Nivel via `LOG_LEVEL` env (`debug | info | warn | error`).
- Em prod, `error` deveria mandar pra Sentry (`SENTRY_DSN`).
- Estruturado: objeto, não string concat.

---

## 19. Como integrar uma feature nova **sem dar conflito** — Checklist

Cole no PR description quando for adicionar nova entidade/integração.

```
[ ] Pesquisei a tabela equivalente — confirmo que NÃO existe (cite a busca feita)
[ ] Adicionei org_id NOT NULL na tabela nova (ou justifiquei por que é global)
[ ] Adicionei FK ao client_stores.id quando entidade é por loja
[ ] RLS habilitada + policy de tenant_isolation
[ ] Índice em org_id + colunas de JOIN/WHERE frequentes
[ ] Migration nomeada YYYYMMDDHHMMSS_descricao.sql
[ ] Idempotência: IF NOT EXISTS / EXCEPTION WHEN duplicate_object
[ ] Updated_at trigger se aplicável
[ ] Tipos TypeScript adicionados em src/types/<dominio>.ts e reexportados em index.ts
[ ] Credenciais (se houver) listadas em ENCRYPTED_FIELDS
[ ] Env vars novas documentadas em .env.example + .env.local.example
[ ] Rota API segue o template (requireAuth → resolveOrgId → permissão → admin client)
[ ] Validação Zod no body de POST/PATCH
[ ] errorResponse/successResponse usados (não return manual)
[ ] Service em src/lib/services/ quando lógica > 30 linhas
[ ] Hook SWR único pra dados (não fetch in component)
[ ] Cache: se tem fetch externo, decidi onde cachear (dashboard_cache ou *_summary)
[ ] Cron: se for periódico, registrei em vercel.json + requireCronAuth
[ ] Webhook: HMAC validado via requireWebhookSecret
[ ] Realtime: só ativei na tabela se REALMENTE precisa de live update
[ ] Documentação: atualizei CLAUDE.md se for mudança estrutural
```

---

## 20. Onde **NÃO** mexer

| O quê | Por quê |
|---|---|
| `auth.users` direto | Schema Supabase managed. Use `auth.signUp/signIn`. |
| Trigger `on_auth_user_created` | Roda em todo signup. Quebrar = bloquear novos usuários. |
| Helpers RLS (`current_org_id`, etc.) | Usado por dezenas de policies. Mudança requer auditoria completa. |
| `ENCRYPTED_FIELDS` (remover item) | Pode resultar em token sendo gravado plain. |
| `lib/crypto.ts` algoritmo | Mudar = invalidar credenciais existentes. Requer migração v2. |
| Endpoints `/api/cron/*` sem `requireCronAuth` | Vira backdoor pública. |
| `client_portal_users` auth flow | Separa do admin auth — não unifique sem entender. |
| `dashboard_cache.CACHE_VERSION` decrementar | Não decrementa nunca; só incrementa. |
| Sidebar `dark` forçado | Identidade visual. Não tornar configurável. |

---

## 21. Referência rápida — arquivos chave

| Arquivo | Para quê |
|---|---|
| `src/lib/supabase/server.ts` | Server clients (auth + admin) |
| `src/lib/supabase/client.ts` | Browser client |
| `src/lib/supabase/middleware.ts` | Middleware Supabase |
| `src/middleware.ts` | Next.js middleware root |
| `src/lib/crypto.ts` | AES-256-GCM |
| `src/lib/constants/credentials.ts` | Campos cifrados |
| `src/lib/services/credentials.service.ts` | Read/write credentials |
| `src/lib/api/errors.ts` | errorResponse, successResponse, requireAuth |
| `src/lib/api/resolve-org.ts` | resolveOrgId |
| `src/lib/api/require-store-access.ts` | Permissão granular |
| `src/lib/api/cron-auth.ts` | requireCronAuth |
| `src/lib/api/n8n-auth.ts` | requireWebhookSecret |
| `src/lib/cache.ts` | dashboard_cache helpers |
| `src/lib/rate-limit.ts` | Upstash wrapper |
| `src/lib/logger.ts` | Logger estruturado |
| `src/lib/routes.ts` | ROUTES const |
| `src/types/index.ts` | Domain types |
| `supabase/migrations/00001_initial_schema.sql` | Schema base |
| `supabase/migrations/20250125_05_rls_helpers.sql` | Helpers RLS |
| `supabase/migrations/20260507_crm_phase1_core.sql` | CRM schema |
| `vercel.json` | Cron schedules |
| `.env.example` + `.env.local.example` | ENV vars |
| `CLAUDE.md` | Conhecimento integrações Shopify/Klaviyo + decisão CRM |

---

## 22. Diagrama mental — Fluxo de uma request

```
Browser
   │  fetch('/api/x', { credentials: 'include' })
   ▼
Next.js middleware
   │  updateSession()  → refresca cookie Supabase
   │  headers de segurança (X-Frame-Options, CSP)
   ▼
Route handler (src/app/api/x/route.ts)
   │
   ├─ const sb = await createClient()        ← cookies SSR, respeita RLS
   ├─ const user = await requireAuth(sb)     ← 401 se sem sessão
   ├─ const orgId = await resolveOrgId(user.id)  ← service role bypass + check
   ├─ const body = await parseAndValidate(req, Schema)  ← Zod
   ├─ await requireStoreAccess(body.store_id, user.id, "can_edit")
   │
   ├─ const admin = createAdminClient()      ← service role, bypassa RLS
   │
   ├─ Service layer (lib/services/*)         ← lógica de negócio
   │     │
   │     ├─ getStoreCredentials(storeId)     ← decifra AES-256-GCM
   │     ├─ fetch externo (Shopify/Klaviyo)
   │     ├─ cache hit/miss em dashboard_cache
   │     └─ events.insert({ event_type: 'x' })  ← event bus
   │
   ├─ DB operation via admin.from('x').insert/update/delete
   │
   ├─ logger.info(...)
   │
   └─ return successResponse(req, { ... })
       │  CORS headers via corsHeaders(origin)
       ▼
Browser recebe JSON
```

---

## 23. Glossário rápido

| Termo | Significado |
|---|---|
| **Org** | Organization — tenant. Hoje só Convertfy. |
| **Member** | Profile vinculado a org via `org_members` |
| **Store** | `client_stores.id` — a loja Shopify/Nuvemshop |
| **Owner** | `org_role = 'owner'` — acesso total na org |
| **System admin** | `profiles.role = 'admin'` — acesso cross-org (legacy mas vivo) |
| **Feature** | Permissão granular (`features_catalog.key`) |
| **DAG** | Directed Acyclic Graph — JSON de automação CRM |
| **Triplet** | bg + text + border semânticos andam juntos (DS) |
| **Snapshot** | Linha em `*_snapshots` pré-calculada por cron |
| **Write-through cache** | Grava no DB e responde da mesma transação |
| **Stale grace** | Cache expirado ainda serve quando fetch falha |

---

*Última atualização: 2026-05-15. Versão do schema: ~migration 20260605.
Em conflito, este guia vence — qualquer divergência levanta issue.*
