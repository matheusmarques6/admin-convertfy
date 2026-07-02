# Modelo de Dados — Supabase/Postgres

> Parte da [arquitetura do sistema](./system-overview.md). ~220 tabelas, ~50 views, ~150 funções/triggers em ~274 migrations (`supabase/migrations/`). Multi-tenant por `org_id` com RLS + checks server-side. Tipos gerados em `src/types/database.ts`.

## Mapa de domínios

```
organizations ─┬─ org_members (roles) ── agent_store_access (acesso por loja)
               ├─ clients ─┬─ client_stores  ← CHAVE CENTRAL de toda a plataforma
               │           │   ├─ onboardings (+steps, versions, approvals)
               │           │   ├─ store_briefings / store_brand_identity (versionados)
               │           │   ├─ email_flows → email_flow_emails → email_blocks / email_qa_checklist
               │           │   ├─ store_email_references / store_email_blueprints (Architect)
               │           │   ├─ klaviyo_* / omnisend_* metrics, store_revenue_summary
               │           │   ├─ tracking_stores → tracking_orders → tracking_codes
               │           │   └─ deals / crm_leads / crm_contacts / crm_health_history
               │           ├─ contracts, invoices → refunds, client_charges, client_subscriptions
               │           └─ client_portal_users (portal)
               ├─ pipelines → pipeline_stages → deals (CRM)
               ├─ campaign_cycles → campaign_suggestions → campaign_pipeline_items
               ├─ automations (DAG JSON) → crm_automation_runs
               ├─ crm_threads → crm_messages (inbox WhatsApp/Instagram)
               └─ tasks, meetings, report_jobs, ai_usage_events
```

## Domínios

### 1. Multi-tenant e permissões
`organizations` (slug, type internal/agency/partner), `org_members` (N:M profiles↔orgs, role owner/manager/coordinator/…), `agent_store_access` (acesso granular por loja com `can_view/can_edit/can_manage_*`; trigger auto-atribui), `features_catalog` + `org_member_features` (feature flags por membro). Helpers SQL: `current_org_id()`, `is_org_member()`, `accessible_store_ids()`.

### 2. Usuários
`profiles` (1:1 com `auth.users`; `role` legado, **`tags TEXT[]` com índice GIN** — roteia comportamentos como tag `cto` p/ alertas e `dev` p/ ferramentas), `settings` (key-value global), `password_reset_audit`.

### 3. Clientes e lojas
- **`clients`**: name, email, status (active/inactive/churned/prospect/onboarding), health_score 0-100, tags[], custom_fields JSONB, owner_id.
- **`client_stores`** (chave central): client_id, org_id, platform (shopify/nuvemshop/…), store_url, credenciais criptografadas (shopify/klaviyo/omnisend/asaas/meta/ga4/wise), mrr_cents, health_score, nps_last_*, além dos 5 pilares da Pesquisa (`brand_*`, `store_*`, `icp_*`, `tone_*`, `ads_*`).
- `crm_contacts` (contatos por cliente/loja, `is_primary`), `contracts`, `invoices` (asaas_id), `refunds`, `client_charges`, `client_subscriptions`, `client_portal_users` (portal, permissões JSONB, `must_change_password`).

### 4. Onboarding
`onboardings` (canônico por loja: status, progress, form_responses, briefing JSONB), `client_onboardings` (legacy, em unificação), `client_onboarding_steps` (categoria setup/integration/training/launch, `depends_on`), `onboarding_templates` + `onboarding_template_steps`, `store_onboarding_data` (snapshot da pesquisa n8n), `onboarding_approvals`, `onboarding_versions`.

### 5. Geração de emails (Epic AE)
| Tabela | Papel |
|---|---|
| `email_flows` | Container por loja×flow_type (UNIQUE); status blocked→live; progress calculado por trigger |
| `email_flow_emails` | Email individual — **status machine** `draft→pending→copy_generating(→_recovery)→copy_ready→rendering→image_done→qa_running→ready/failed` (+legados in_progress/approved/live); telemetria (`*_started_at`, `total_cost_cents`, `attempts`, `qa_issues` JSONB, `generation_batch_id`) |
| `email_blocks` | Blocos (hero/text/coupon/products/footer/…), `content` JSONB por tipo, `applied`, `needs_image` |
| `email_qa_checklist` | Checklist por email (content/design/tech/compliance) |
| `store_briefings` | Versionado; **status current/confirmed/archived** — trigger `fn_on_briefing_confirmed` enfileira sinal |
| `store_brand_identity` | Versionado; logos (8 slots), cores, fontes, voice, trust_icons |
| `email_generation_queue_signals` | Fila de sinais (pending/processing/done/failed) com índice parcial em pending |
| `email_dispatch_jobs` | Fila do Architect (lease, attempts) consumida pelo cron a cada minuto |
| `store_email_references` / `store_email_blueprints` | Saída do Montador/Blueprint por loja (só persistem se gerados por LLM; fallback → templates globais `email_reference_templates` / `email_blueprints`) |
| `email_agent_configs` + `agent_prompts` | Configs/prompts versionados dos agentes |
| `email_generation_runs` | Telemetria por chamada de agente (tokens, custo, raw/parsed output) |
| `email_status_events` | Audit log append-only de transições (trigger `fn_log_email_status_change`) — alimenta SSE |

### 6. Campanhas
`campaign_cycles` (ciclo semanal por org, UNIQUE(org,number), `context` JSONB snapshot), `campaign_suggestions` (source ai/manual, status suggested/approved/dismissed, `targets` JSONB, `email_draft`, `copy_results` por mode/loja, link p/ `pipeline_item_id`), `campaign_trends` (temas com `evidence`), `commemorative_dates` (catálogo global por país, sem org_id), `campaign_pipeline_items` (board), `campaign_generations` + `_stores` + `_tasks` (geração via n8n/Drive), `campaign_copy_jobs`, `campaign_image_batches`/`_results`, `campaign_ai_runs` (telemetria), `campaign_central_settings`, `campaign_automation_runs`, `campaigns` + `campaign_batches` (calendário/lotes).

### 7. CRM
- **Núcleo**: `pipelines` (scope sales/cs/internal, layout kanban/state) → `pipeline_stages` (stage_type open/won/lost/archived, sla_hours, `automation_on_enter`) → **`deals`** (value, probability, status, utm JSONB, tags[], custom_fields, `last_stage_changed_at` via trigger).
- **Leads**: `crm_leads` (status new→converted/lost, `ai_qualification_score`, conversão linka deal+client), `crm_partners` (comissões e agregados).
- **Event sourcing**: `crm_deal_history` (diffs de campo) + `crm_deal_activities` (timeline: note/call/wa_message/stage_change/…) + `crm_deal_files`, `crm_deal_tags`.
- **Inbox**: `crm_channels` (config WhatsApp/Instagram com tokens em JSONB), `crm_threads` (por canal + contato, unread_count) → `crm_messages` (idempotência por external_id).
- **Automação/IA**: `automations` (DAG JSON com 9 node types) → `crm_automation_runs`; `crm_ai_actions` (prompts versionados + output_schema) → `crm_ai_action_runs` (tokens/custo).
- **Forms**: `crm_forms` → `crm_form_fields` → `crm_form_submissions`; `crm_custom_fields` (por entidade), `crm_tags`.
- **BI snapshot-first**: `crm_health_history` (score + `components` JSONB — cron 05h), `crm_pipeline_snapshots`, `crm_org_snapshots`, `crm_lead_funnel_snapshots` (cron 06h) — reports leem sem agregação.

### 8. Integrações e métricas (cache)
`klaviyo_campaigns` → `klaviyo_campaign_metrics` (UNIQUE por campanha), `klaviyo_flow_metrics`, `omnisend_campaign_metrics`/`omnisend_flow_metrics`, `omnisend_reports_cache`, **`store_revenue_summary`** (fonte canônica de receita: `revenue_total_cents` via Metric Aggregates ≠ `revenue_attributed_cents` via Reporting API — ver [ADR](./adr-klaviyo-revenue-source.md)), `integration_cache`, `dashboard_cache`, `live_fetch_cooldowns` (lock distribuído), `klaviyo_sync_config`/`klaviyo_sync_jobs`, `integrations` (org-level, credenciais criptografadas), `report_jobs` (relatórios sob demanda com dedup e progresso).

### 9. Tracking
`tracking_stores` (1:1 com client_store, `widget_config` JSONB, webhook_secret, keys por carrier) → `tracking_orders` (pedido Shopify) → `tracking_codes` (status + `tracking_events` JSONB, multi-carrier) + `tracking_lookups` (log de buscas públicas).

### 10. Tarefas, reuniões e rituais
`tasks` (status todo→done/blocked, priority, dependencies JSONB, sub_items no metadata) + `task_comments`/`task_deliverables`/`task_checklists`/`task_history`; `meetings` (google_event_id) + `meeting_participants` (rsvp + google_rsvp_status); `ritual_sessions` + `ritual_store_diagnostics`; `weekly_pipeline_states`/`weekly_pipeline_actions` (acompanhamento semanal); tabelas de produtividade (goals, habits, focus_sessions).

### 11. Telemetria de IA
`ai_usage_events` + view **`ai_usage_unified`** (union de `email_generation_runs`, `campaign_ai_runs`, `crm_ai_action_runs`, `ai_usage_events`) — consumida por `/api/admin/ai-usage`.

## Padrões globais

| Padrão | Onde |
|---|---|
| **Soft delete** | `is_active` / `status='archived'` (deals, pipelines, forms, automations, tracking_stores) — hard delete é exceção (crm_tags, pipeline legacy) |
| **Versionamento** | `version INT` + UNIQUE(entity, version): store_briefings, store_brand_identity, agent_prompts, email_agent_configs, onboarding_versions |
| **Event sourcing / audit** | crm_deal_history, crm_deal_activities, email_status_events, task_history, password_reset_audit |
| **Filas em tabela** | email_generation_queue_signals, email_dispatch_jobs, campaign_copy_jobs, report_jobs (com índices parciais em `status='pending'`) |
| **Snapshot-first BI** | crm_*_snapshots, store_revenue_summary, weekly_pipeline_states — crons populam, reports leem direto |
| **JSONB** | custom_fields, metadata, content (blocos), dag (automações), copy_results, widget_config, components (health) |
| **Triggers** | `update_updated_at_column()` (geral), `fn_on_briefing_confirmed` (fila AE), `fn_log_email_status_change` (audit+SSE), `crm_deals_track_stage_change` (history+activity), `handle_new_user` (profiles) |
| **RLS** | Padrão `org_id IN (SELECT org_id FROM org_members WHERE profile_id = auth.uid())`; service role bypassa (checks na API); exceções públicas: commemorative_dates |
| **Índices** | FK + compostos `(store_id, status)`, parciais (`WHERE status='pending'`, stuck detection do watchdog), GIN em tags[], DESC em created_at |
