# API — Portal do Cliente e Endpoints Públicos

> Parte da [documentação de API](./README.md). Convenções de auth, erros e rate limit estão no README.

**Auth do portal:** sessão Supabase (cookie) + validação em `client_portal_users` via `resolvePortalClient()` (`src/lib/api/portal-auth.ts`) — resolve `client_id` → lojas ativas. Permissões granulares em JSONB `permissions` (`view_reports`, `view_invoices`, `edit_profile`, …).

## Portal — Autenticação

| Endpoint | Métodos | Ação | O que faz | Rate limit |
|---|---|---|---|---|
| `/api/portal/auth` | POST | Login | Autentica email/senha, valida `client_portal_users`, marca `must_change_password`, registra login. Body: `email`, `password` | **auth 10/min (fail-closed)** |
| `/api/portal/auth` | GET | Verificar sessão | Retorna usuário logado se sessão válida | Nenhum |
| `/api/portal/auth` | DELETE | Logout | Encerra sessão Supabase | Nenhum |
| `/api/portal/auth/verify` | POST | Re-verificar usuário | Valida se usuário é do portal. Body: `userId` | Nenhum |
| `/api/portal/change-password` | POST | Trocar senha (1º login) | Body: `newPassword`, `confirmPassword` (min 8). Zera `must_change_password` | Nenhum |
| `/api/portal/settings/password` | PUT | Mudar senha | Body: `currentPassword`, `newPassword` (min 8) | **auth 10/min (fail-closed)** |

## Portal — Dashboard e dados

| Endpoint | Métodos | Ação | O que faz |
|---|---|---|---|
| `/api/portal/branding` | GET | Branding da org | Logo, cores e nome da org do cliente (fallback Convertfy) |
| `/api/portal/dashboard` | GET | Dashboard consolidado | Cache-first (sem chamadas live): cliente, lojas, invoices, campanhas, reuniões, dados Klaviyo/Shopify em cache. Query: `period` (default 30d), `store_id` ('all' agrega) |
| `/api/portal/dashboard/refresh` | POST | Refresh manual | Sync Klaviyo/Omnisend sequencial (~1s entre lojas). Body: `period?` |
| `/api/portal/campaigns` | GET | Listar campanhas | RPC `get_portal_campaigns_with_metrics` (unifica campaigns + batches). Query: `start_date?`, `end_date?`, `status?`, `store_id?`, `channel?`, `limit` (1-500, default 500), `offset` |
| `/api/portal/campaigns/[id]/metrics` | GET | Métricas de campanha | Métricas cached (Klaviyo ou Omnisend conforme loja); valida posse da campanha |
| `/api/portal/invoices` | GET | Listar invoices | Filtros `status?` (pending/paid/overdue/refunded/all), `year?`. Busca payment URLs (boleto/PIX) no Asaas para pendentes. Exige permissão `view_invoices` |
| `/api/portal/invoices/status` | GET | Status leve (banner) | Contagens pending/overdue + revenue (cache-only). Exige `view_invoices` |
| `/api/portal/meetings/[id]/rsvp` | POST | RSVP de reunião | Body: `response` ∈ {accepted, declined, tentative}; propaga p/ Google Calendar best-effort |

## Portal — Onboarding, settings e lojas

| Endpoint | Métodos | Ação | O que faz |
|---|---|---|---|
| `/api/portal/onboarding` | GET | Onboarding do cliente | Etapas agrupadas por categoria + timeline + % progresso |
| `/api/portal/onboarding/wizard` | GET, POST | Wizard | GET retorna estado/pré-preenchimento; POST salva step (`step` ∈ {personal_info, store_data, create_shopify_app, shopify_code, klaviyo_keys, omnisend_keys} + `data`). Valida credenciais contra APIs externas |
| `/api/portal/settings` | GET, PUT | Perfil | PUT: `name` (min 2), `phone?`. Exige `edit_profile` |
| `/api/portal/settings/avatar` | POST, DELETE | Avatar | Upload JPG/PNG/WebP máx 2MB (multipart `file`) / remoção. Exige `edit_profile` |
| `/api/portal/settings/notifications` | PUT | Preferências de notificação | Upsert em `client_notification_preferences` (tabela pode não existir — tech debt 18.1.5) |
| `/api/portal/integrations` | GET, PUT | Integrações da loja | GET: status connected/pending/disconnected (nunca expõe chaves). PUT: salva credenciais (shopify/klaviyo/omnisend/tracking/carrier) com validação contra API externa antes de persistir. Query GET: `store_id` (obrigatório) |
| `/api/portal/stores` | GET, PUT | Lojas do cliente | GET: lista com flags hasKlaviyo/hasShopify (exige `view_reports`). PUT: salva keys e auto-marca etapas de onboarding |
| `/api/portal/stores/onboarding` | POST | Nova loja + onboarding | Cria loja (ou substitui via `replace_store_id`) + onboarding `pending_approval`. Body: `store_name`, `store_url`, `platform`, `country`, `language`, + campos de nicho/design |
| `/api/portal/stores/[id]/report` | GET | Relatório da loja | Klaviyo + Shopify via rotas internas. Query: `period` (7d/30d/90d), `force_refresh?`. Exige `view_reports` |
| `/api/portal/stores/[id]/utm-templates` | GET | UTM templates (read-only) | Templates ativos ordenados por uso |

## Portal — Tracking

| Endpoint | Métodos | Ação | O que faz |
|---|---|---|---|
| `/api/portal/tracking` | GET | Dashboard de rastreio | Stats agregados + pedidos recentes; auto-provisiona `tracking_stores`. Query: `store_id?` |
| `/api/portal/tracking/config` | GET, PUT | Config do widget | GET auto-provisiona; PUT salva `widget_config` sanitizado (cores, idioma, blocked_words). Body PUT: `store_id`, `config` |
| `/api/portal/tracking/orders` | GET | Pedidos rastreados | Query: `store_id?`, `status?`, `search?`, `page` (default 1), `limit` (1-100, default 20) |
| `/api/portal/tracking/stores` | GET, POST, DELETE | Lojas de rastreio | POST conecta/reativa (`shop_domain`, `access_token`, `shop_name?`, `client_store_id?`; valida token Shopify, gera `webhook_secret`). DELETE soft-delete (query `id`) |

## Portal Users (gestão)

| Endpoint | Métodos | Ação | Auth | Rate limit |
|---|---|---|---|---|
| `/api/portal-users` | GET, POST, PATCH, DELETE | CRUD de usuários do portal | GET: autenticado (query `client_id` obrigatório). POST/PATCH/DELETE: role admin/manager/coo/cs. POST body: `client_id`, `email`, `name`, `phone?`, `is_primary_contact?`, `permissions?` (dispara convite por email, `must_change_password=true`) | Nenhum |
| `/api/portal-users/me` | GET | Dados do usuário atual | Anônimo OK (retorna `is_portal_user=false`) | Nenhum |
| `/api/portal-users/change-password` | POST | Trocar própria senha | Portal user. Body: `new_password` (min 6) | Nenhum |
| `/api/portal-users/reset-password` | POST | Admin reseta senha | Role admin/manager/cs. Body: `portal_user_id`, `new_password?` (gera temp se omitida); marca `must_change_password=true` e envia email | **auth 10/min (fail-closed)** |

## Endpoints públicos (sem sessão)

| Endpoint | Métodos | Ação | O que faz | Rate limit |
|---|---|---|---|---|
| `/api/cliente/onboarding-form` | POST | Formulário público de onboarding | Cria cliente + loja + onboarding (`pending_approval`). Validação Zod + honeypot (`website`). Body: `name`, `email`, `store_name`, `store_url`, `platform`, + opcionais (phone, cpf_cnpj, niche, target_audience, price_sensitivity, logo_url, design_direction_text, brand_manual_url, …) | **clienteForm 3/h** |
| `/api/cliente/upload` | POST | Upload público | multipart `file` + `file_type` ∈ {logo, design, brand_manual}. Máx 10MB (PNG/JPG/SVG/PDF) | **clienteUpload 10/h** |
| `/api/public/onboarding-form` | POST | Idem `/api/cliente/onboarding-form` (URL alternativa) | | **publicForm 3/h** |
| `/api/public/upload` | POST | Idem `/api/cliente/upload` | | **publicUpload 10/h** |
| `/api/public/forms/[slug]` | GET | Formulário CRM publicado | Retorna form + fields; incrementa view count | Nenhum |
| `/api/public/forms/[slug]/submit` | POST | Submeter form CRM | Valida required fields, deduplica lead por email, cria lead/deal, dispara triggers (lead_created, deal_created). Body: `answers` (map field_id→value), `utm_*?`, `referrer?` | Nenhum |
| `/api/onboarding-help/[token]` | GET | Tutorial renderizado | Interpola `{{client_name}}`, `{{store_name}}` — validação por token | Nenhum |

## Formulários token-gated (wizard de onboarding do cliente)

Auth de todo o grupo: `form_token` (UUID) no path — sem sessão. **Rate limit: nenhum.**

| Endpoint | Métodos | Ação | O que faz |
|---|---|---|---|
| `/api/forms/[token]` | GET | Contexto do formulário | Estado do onboarding (cliente, loja, briefing_status, form_responses) |
| `/api/forms/[token]/submit-data` | POST | Submeter respostas | Body: `responses` (máx 64KB total; 5000 chars por resposta), `completed_section_slug?`. Dispara geração de briefing (Claude); idempotente se respostas iguais |
| `/api/forms/[token]/briefing-status` | GET | Status do briefing | Status, briefing JSON, confirmado?, data de geração |
| `/api/forms/[token]/confirm-briefing` | POST | Confirmar briefing | Body: `briefing` (object). Valida não-confirmado |
| `/api/forms/[token]/retry-briefing` | POST | Retry de geração | Só se status ≠ generating OU stuck >90s; dispara via `after()` |
| `/api/forms/[token]/store-context` | GET | Top products + ads review | Dados visuais (blocos 02/03 do briefing) |
| `/api/forms/[token]/trigger-ads-analyzer` | POST | Disparar análise de ads | Trigger n8n; idempotente (verifica ads_review + top_products) |
| `/api/forms/[token]/upload` | POST | Upload de arquivo | multipart `file` + `field_key?`. Máx 15MB; path com org_id + onboarding_id |
