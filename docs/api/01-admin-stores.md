# API — Admin: Lojas, Briefing, Brand Identity e Gestão

> Parte da [documentação de API](./README.md). Salvo indicação contrária, **Auth = sessão Supabase (`requireAuth`)** e **Rate limit = nenhum**.

## Lojas (`/api/admin/stores`)

| Endpoint | Métodos | Ação | O que faz / Params |
|---|---|---|---|
| `/api/admin/stores` | GET, PATCH | Listar / atualizar lojas | GET: filtros `language`, `client_id`, `active_only` (query). PATCH body: `niche`, `language`, `country`, `countries` |
| `/api/admin/stores/[id]` | PATCH | Atualizar loja | Mesmos campos; sincroniza `country`↔`countries` bidirecionalmente |
| `/api/admin/stores/[id]/activity` | GET, POST | Registro de atividades | GET: `kind?`, `limit?`. POST: `kind` (feedback/teste/otimização/entrega/integração/call/outro), `title` (obrig.), `summary?`, `tags?`, `metadata?`, `occurred_at?` |
| `/api/admin/stores/[id]/events` | GET, POST | Eventos agendados | GET: `upcoming=true`. POST: `kind` (feedback_30d/feedback_weekly/auditoria/kickoff/outro), `title`, `scheduled_at` (obrig.), `attendees?`, `notes?` |
| `/api/admin/stores/[id]/context` | PATCH | Contexto da loja | Patches parciais de marca/operação/lista/materiais/pesquisa em `client_stores` (`tom_de_voz`, `posicionamento_preco`, `persona`, `diferencial`, `cores`, `fontes`, `niche`, `target_audience`, `ticket_medio_cents`, `taxa_conversao`, …) |
| `/api/admin/stores/[id]/competitors` | GET, POST | Concorrentes | POST: `name` (obrig., max 160), `url?`, `posicionamento` (popular/similar/premium), `notas?` |
| `/api/admin/stores/[id]/top-products` | GET | Top produtos | Lê `store_top_products`. Query: `limit` (default 5, max 50) |
| `/api/admin/stores/[id]/health-history` | GET | Histórico de health | Últimas N linhas de `crm_health_history`. Query: `limit` (default 5, max 30) |
| `/api/admin/stores/[id]/overview` | GET | Agregado do detalhe da loja | 1 request consolida status de integrações, loja completa (+cliente), health history (2), briefing, atividade (20), eventos futuros e report/campaigns/flows (quando Klaviyo/Omnisend conectado). Query: `period` (7d/30d/90d/1A, default 30d). Auth: `requireStoreAccess`. `maxDuration=300` |
| `/api/admin/stores/[id]/omnisend-brand` | GET | brandID Omnisend | Chamada live ao `/v3/brands` da Omnisend; `brandId` null se falhar |
| `/api/admin/stores/[id]/sync-from-onboarding` | POST | Espelhar formulário → loja | `onboardings.form_responses` → `client_stores` + `store_brand_identity`. Body: `mode` ∈ {overwrite, fill-empty} |

## Briefing

| Endpoint | Métodos | Ação | O que faz / Params |
|---|---|---|---|
| `/api/admin/stores/[id]/briefing` | POST, PATCH | Criar / atualizar briefing | Versionado em `store_briefings`. Body: `raw_input`, `marca` (record), `briefing` (record), `source` ∈ {ai_treatment, manual, edited} |
| `/api/admin/stores/[id]/briefing/confirm` | POST | Confirmar briefing | Marca como `confirmed` → trigger SQL insere sinal em `email_generation_queue_signals`. Idempotente |
| `/api/admin/stores/[id]/process-briefing` | POST | Tratar briefing com IA | Transforma input bruto em texto profissional (nova versão). Fallback sem `ANTHROPIC_API_KEY` |
| `/api/admin/briefings` | GET | Lojas para seleção de briefing | Lista lojas ativas ordenadas por nome |

## Brand Identity (identidade visual)

| Endpoint | Métodos | Ação | O que faz / Params |
|---|---|---|---|
| `/api/admin/stores/[id]/brand-identity` | GET, PATCH | Ler / versionar identidade | PATCH cria nova versão (merge com anterior). Campos: `logo_main_svg/png`, `logo_alt_svg/png`, `logo_monogram_svg/png`, `logo_reverse_svg/png`, `colors_primary[]`, `colors_secondary[]`, `font_heading(+weight)`, `font_body(+weight)`, `voice[]`, `trust_icons[]` |
| `/api/admin/stores/[id]/brand-identity/confirm` | POST | Confirmar (Gate 2 do Epic AE) | Valida cores primárias + font_heading + ≥1 logo; enfileira sinal de fase 2; conta emails em `copy_ready` |
| `/api/admin/stores/[id]/brand-identity/upload` | POST | Upload de asset | FormData: `file` (PNG/SVG/PDF, máx 10MB), `slot` (logo_* ou brand_manual). Retorna URL assinada 7d |
| `/api/admin/stores/[id]/brand-identity/trust-seal-upload` | POST | Upload de selo | FormData: `file` (PNG, máx 2MB). Persistência acontece no Save geral |
| `/api/admin/stores/[id]/brand-identity/download-zip` | GET | ZIP de logos | 8 arquivos (4 slots × SVG+PNG), zip em memória (máx 8MB) |
| `/api/admin/stores/[id]/capture-brand` | POST | Captura automática (IA) | Extrai logos/cores/tipografia/tom via Claude Haiku; fallback determinístico sem API key |

## Pesquisa & Diagnóstico (IA)

| Endpoint | Métodos | Ação | O que faz |
|---|---|---|---|
| `/api/admin/stores/[id]/ads-review/regenerate` | POST | Reanalisar mídia paga | Meta + Google Ads (30d) → `client_stores.ads_*` (score, sub-scores, forças, oportunidades, riscos) via Claude Haiku |
| `/api/admin/stores/[id]/regenerate-objections` | POST | Regenerar objeções do ICP | 5 objeções → `client_stores.icp_objections`. Requer `ANTHROPIC_API_KEY` + contexto de ICP |
| `/api/admin/stores/[id]/trigger-ads-analyzer` | POST | Disparar workflow n8n de Ads | Fire-and-forget (n8n processa em 30-120s); idempotente |

## Geração de emails (por loja — Epic AE)

| Endpoint | Métodos | Ação | O que faz / Params |
|---|---|---|---|
| `/api/admin/stores/[id]/start-onboarding` | POST | Iniciar pipeline de geração | Trigger híbrido (AE-2). Body: `mode?` (fresh/resume/redo), `flow_ids?`, `triggered_by?` (ui/signal_consumer) |
| `/api/admin/stores/[id]/init-flows` | POST | Criar 7 flows padrão | welcome, site_abandoned, browse_abandonment, abandoned_cart, upsell, win_back, shipping_stages + emails default. Idempotente |
| `/api/admin/stores/[id]/generate-email` | POST | Gerar 1 email | Pipeline completo + phase2 em background. Body: `flowId`, `emailId`, `flowType`, `emailNumber` (todos obrig.). `maxDuration` 300s |
| `/api/admin/stores/[id]/generate-flow` | POST | Gerar flow inteiro | Paralelismo respeitando `max_parallel`. Body: `flowId`. `maxDuration` 300s |
| `/api/admin/stores/[id]/generate-blueprints` | POST | Rodar Component Assembler | Montador (Opus) + Blueprint por email (60-180s cada). Body: `flow_ids?`, `force?`. `maxDuration` 300s |
| `/api/admin/stores/[id]/dispatch-email-copies` | POST | Disparar copy via n8n | Botão "Gerar copies". Body: `flow_ids?`, `only_drafts?` |
| `/api/admin/stores/[id]/reconcile-blocks` | POST | Re-sincronizar estrutura | Aditivo, sem gerar copy (custo zero). Body: `flow_ids?`, `force?` |
| `/api/admin/stores/[id]/rerender` | GET, POST | Re-renderizar emails | GET = preview (count). POST insere sinal na fila. Body: `scope` (store/flow), `flow_id?` |
| `/api/admin/stores/[id]/test-generate` | POST | Teste rápido | Cria flow/email temporários. Body: `flowType`, `emailNumber`. `maxDuration` 300s |
| `/api/admin/stores/[id]/emails` | GET | Listar emails + status | Snapshot p/ UI (fallback do SSE). Query: `flow_id?`, `status?` (csv), `batch_id?` |
| `/api/admin/stores/[id]/email-sender` | PATCH | Atualizar remetente global | `from_name?` (max 120), `from_email?` em TODOS os emails da loja |
| `/api/admin/stores/[id]/generation-status/[batchId]` | GET | Status de geração do batch | Runs completos do email; status agregado só do batch atual |
| `/api/admin/stores/[id]/preview-html-vars` | POST | Debug de vars do HTML Agent | Resolve as ~20 vars sem rodar LLM. Body: `emailId`. **Auth extra:** admin/owner ou tag `dev` |
| `/api/admin/stores/[id]/generated` | GET | Conteúdo gerado | Consulta materiais gerados da loja |
| `/api/admin/stores/[id]/producao` | GET | Painel de produção | Estado de produção de emails da loja |

## Relatórios mensais de loja

| Endpoint | Métodos | Ação | O que faz / Params |
|---|---|---|---|
| `/api/admin/stores/[id]/reports` | GET, POST | Listar / gerar relatório | POST cristaliza snapshot (campanhas, flows, KPIs). Body: `period_start`, `period_end` (obrig.), `month_label?`, `sections?`, `tone` (editorial/corporate/casual), `proximos_passos?`, `ai_filled?`, `replace?` |
| `/api/admin/stores/reports/[reportId]` | GET, PATCH, DELETE | CRUD do relatório | PATCH: `status`, `proximos_passos`, `snapshot`, `sent_to`, `pdf_url` |
| `/api/admin/stores/reports/[reportId]/ai-fill` | POST | Insights por IA | Uma frase editorial por slide (Claude Haiku, fallback sem key) |
| `/api/admin/stores/reports/[reportId]/pdf` | POST | URL de impressão | Salva `pdf_url`; PDF gerado via Cmd+P do browser |
| `/api/admin/stores/reports/[reportId]/resync` | POST | Recomputar snapshot | Dados atuais (Omnisend cache + Shopify); preserva campos editoriais. `maxDuration` 90s |

## Catálogo do Epic AE (outlines e componentes)

| Endpoint | Métodos | Ação | Params |
|---|---|---|---|
| `/api/admin/outlines` | GET, POST | Estruturas gerais de emails | GET: `flow_type?`. POST: `flow_type`, `email_number`, `objective`, `guidance`, `suggested_blocks`, `tone_hint`, `is_active` |
| `/api/admin/outlines/[id]` | PATCH, DELETE | Atualizar / deletar outline | PATCH: mesmos campos |
| `/api/admin/components` | GET, POST | Biblioteca de componentes | GET: `block_type?`, `is_active?`. POST: `block_type`, `name`, `html` (obrig.), `slots?`, `niche_affinity?`, `positioning?`, `mood?`, `density?`, `tags?`, `thumbnail?`, `is_active?` |
| `/api/admin/components/[id]` | PATCH, DELETE | Atualizar / deletar componente | PATCH: mesmos campos |

## Organizações, membros e acesso

| Endpoint | Métodos | Ação | Auth | Params |
|---|---|---|---|---|
| `/api/admin/organizations` | GET, POST | Orgs + member_count | GET: sessão. POST: **role admin** | GET: `type?`, `active_only?`. POST: `name`, `slug` |
|`/api/admin/org-members` | GET, POST | Membros da org | Sessão + RBAC (POST exige ROLES_CAN_CREATE_ACCOUNTS ou admin) | GET: `org_id?`, `role?`, `is_active?`. POST: `org_id`, `roles[]` (obrig.), `profile_id?`, `email?`, `name?`, `job_title?`, `store_ids?` |
| `/api/admin/org-members/[id]` | GET, PUT, DELETE | Membro individual | Sessão + RBAC | PUT: `roles`, `job_title`, `is_active`, `store_ids`, `can_edit`, `can_manage_*`. DELETE = desativação |
| `/api/admin/store-access` | GET, POST, DELETE | Acesso membro↔loja | GET: sessão. POST/DELETE: **role admin** | POST: `org_member_id`, `store_id` (obrig.), `can_view`, `can_edit`, `can_manage_*`, `notes`. DELETE: `id` ou `org_member_id`+`store_id` |
| `/api/admin/features` | GET | Catálogo de features | Sessão | `category?`, `active_only` (default true) |

## Portal users (admin)

| Endpoint | Métodos | Ação | Auth |
|---|---|---|---|
| `/api/admin/portal-users` | GET, POST | Listar / criar usuário do portal | GET: sessão (query `client_id?`). POST: role admin/manager/coo — cria auth user + temp password + email |
| `/api/admin/portal-users/[id]` | GET, PUT, DELETE | CRUD individual | role admin/manager/coo. PUT: `name`, `phone`, `is_active`, `is_primary`, `permissions` |
| `/api/admin/portal-users/[id]/send-invite` | POST | Reenviar convite | role admin/manager/coo. Recria auth user; erro se já logou |
| `/api/admin/portal-users/[id]/reset-password` | POST | Resetar senha | role admin/manager/coo. Gera temp password + `must_change_password=true` + email |

## Utilidades administrativas

| Endpoint | Métodos | Ação | Auth | Rate limit |
|---|---|---|---|---|
| `/api/admin/ai-usage` | GET | Observabilidade de custo de IA | admin OU tag `dev` (`canManagePrompts`) | Nenhum. Query: `days` (default 30, max 365), `feature?`, `source?`. Lê view `ai_usage_unified` |
| `/api/admin/encrypt-credentials` | POST | Migração one-time de encriptação | **role admin** | **migration 3/min**. Idempotente |
| `/api/admin/migrate-legacy-onboardings` | POST | `client_onboardings` → `onboardings` | Sessão + permissão onboarding (owner/manager) | Nenhum. `maxDuration` 300s |
| `/api/admin/migrate-onboarding-tasks` | POST | Backfill de sub_items em tasks legadas | idem | Nenhum. `maxDuration` 300s |
| `/api/admin/reapply-prefill` | POST | Re-aplicar pre-fill 03→05 | idem. Body: `onboarding_ids?` | Nenhum. Idempotente |
| `/api/admin/resync-onboarding-tasks` | GET, POST | Reconciliar tasks c/ template | idem. GET = auditoria read-only; **POST é destrutivo** (deleta tasks órfãs) | Nenhum |
| `/api/admin/resync-pipeline-templates` | POST | Re-sync templates de pipeline | idem. Não-destrutivo | Nenhum. `maxDuration` 120s |
| `/api/admin/email/test` | POST | Email de teste (Resend) | **role admin/manager**. Body: `to` (email) | Nenhum |

## Gatilhos manuais de rotinas (espelham crons)

Todos com sessão Supabase, escopo limitado à org do usuário, `maxDuration` 300s, sem rate limit.

| Endpoint | Métodos | Espelha |
|---|---|---|
| `/api/admin/crm-health/compute-now` | POST | Cron `crm-health-compute` (5h UTC) — cria leads CS `health_alert` se score < 50 |
| `/api/admin/crm-renewal/detect-now` | POST | Cron `crm-renewal-opportunities` (7h UTC) |
| `/api/admin/cs-carteira/sync-now` | POST | Sync de Gestão de Carteira |
| `/api/admin/acompanhamento/flag-now` | GET, POST | Cron `weekly-acompanhamento-reset` (dom 22h). POST body: `week?` (YYYY-MM-DD), `force?` |
| `/api/admin/ritual/pre-process` | GET, POST | Pré-processamento do ritual semanal. POST body: `week?`, `force?`, `next_week?` |
