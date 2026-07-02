# API — CRM (Deals, Leads, Pipelines, Inbox, Automações) e Webhooks de Mensageria

> Parte da [documentação de API](./README.md). **Auth de todo o CRM: sessão Supabase (`requireAuth`) + isolamento por `org_id` (via `org_members`)**, exceto webhooks (HMAC). **Rate limit: nenhum** em todas as rotas deste domínio.

## Deals

| Endpoint | Métodos | Ação | Params / Notas |
|---|---|---|---|
| `/api/crm/deals` | GET, POST | Listar / criar | GET query: `pipeline_id?`, `stage_id?`, `owner_id?`, `status?`, `search?`, `client_id?`, `store_id?`, `lead_id?`, `limit` (max 500, default 200). POST body: `pipeline_id`, `stage_id`, `title` (1-240) obrigatórios + `value` (default 0), `currency` (default BRL), `probability` (0-100, default 50), `expected_close_date?`, `client_id?`, `store_id?`, `lead_id?`, `source?`, `utm{}`, `tags[]`, `owner_id?` (default usuário), `referrer_partner_id?`, `notes?`, `custom_fields{}`. Dispara trigger `deal_created` |
| `/api/crm/deals/[id]` | GET, PATCH, DELETE | Ficha / atualizar / arquivar | GET: relações completas + timeline (100) + histórico (50). PATCH: campos parciais incl. `status` ∈ {open, won, lost, archived}, `lost_reason`, `won_reason`, `position`. DELETE = soft (status `archived`) |
| `/api/crm/deals/[id]/move` | POST | Mover no kanban | Body: `stage_id` (obrig.), `position?`, `lost_reason?`, `won_reason?`. Stage won/lost transiciona status e exige motivo. Dispara automação `deal_stage_change` + sync de cadências CS |
| `/api/crm/deals/[id]/activities` | POST | Atividade na timeline | Body: `type` ∈ {note, call, email, wa_message, ig_message, meeting, task, system, stage_change, file_attached}, `content` (1-8000), `metadata?`, `due_at?`, `is_internal` (default true) |
| `/api/crm/deals/[id]/files` | GET, POST | Arquivos do deal | GET: signed URLs 1h. POST registra metadados de arquivo já no Storage (`name`, `storage_path` obrig., `mime_type?`, `size_bytes?`, `storage_bucket` default `crm-files`, `category?`); cria activity `file_attached` |
| `/api/crm/deals/[id]/files/[fileId]` | DELETE | Deletar arquivo | Remove registro + objeto do Storage (best-effort) |

## Leads

| Endpoint | Métodos | Ação | Params / Notas |
|---|---|---|---|
| `/api/crm/leads` | GET, POST | Listar / criar | GET query: `status?`, `assigned_to?`, `search?`, `source?`, `scope?` (sales/cs), `category?`, `store_id?`, `limit` (default 100, max 500), `offset`. POST body: `name` (1-240) obrig. + `email?`, `phone?`, `company?`, `role?`, `source?`, `utm?`, `notes?`, `assigned_to?`, `tags[]`, `scope` (default sales), `category?`, `store_id?`. Dispara `lead_created` |
| `/api/crm/leads/[id]` | GET, PATCH, DELETE | Ficha / atualizar / descartar | GET traz custom fields, score IA, enrichment, conversão, atividades (100). PATCH inclui `ai_qualification_score?` (0-100), `custom_fields?`. DELETE = soft (status `lost`) |
| `/api/crm/leads/[id]/convert` | POST | Converter em deal | Body: `pipeline_id`, `stage_id` obrig. + `value` (default 0), `owner_id?`, `create_client` (default false), `deal_title?`. Linka `converted_to_deal_id`/`converted_to_client_id`; status → `converted` |
| `/api/crm/leads/import` | POST | Import em batch | Body: `rows` (1-5000; name, email, phone, company, deal_title, deal_value, external_id, …), `pipeline_id?`, `default_stage_id?`, `create_deals?`, `bulk` (tags/source/assigned_to/phone_ddi). Dedup por email, chunks de 50. Retorna `{imported, leadsCreated, dealsCreated, errors}` |

## Pipelines e stages

| Endpoint | Métodos | Ação | Params / Notas |
|---|---|---|---|
| `/api/crm/pipelines` | GET, POST | Listar / criar | GET: `scope` ∈ {sales, cs, internal, all} (default all) — traz stages + contadores + valores. POST: `name` (1-120), `stages` (1-30: name, color, order, stage_type, sla_hours, exit_criteria, description) + `description?`, `scope` (default sales), `color`, `layout` (kanban/state), `category?`, `is_favorite?`, `default_assignee_id?` |
| `/api/crm/pipelines/[id]` | GET, PATCH, DELETE | Detalhe / atualizar / arquivar | GET: pipeline + stages + deals enriquecidos (contato, ai_score, next_step). PATCH: metadata (marcar default desmarca outros do scope). DELETE = soft (`is_archived`) |
| `/api/crm/pipelines/[id]/stages` | POST | Nova etapa | `name` (1-80) obrig. + `color`, `stage_type` ∈ {open, won, lost, archived}, `sla_hours?`, `description?`, `exit_criteria?`, `order?` (auto) |
| `/api/crm/pipelines/[id]/stages/[stageId]` | PATCH, DELETE | Editar / remover etapa | DELETE exige `migrate_to_stage_id` se houver deals; garante ≥1 stage |
| `/api/crm/pipelines/[id]/stages/reorder` | POST | Reordenar | Body: `stages` (1-50 de `{id, order}`) |

## Inbox (WhatsApp + Instagram)

| Endpoint | Métodos | Ação | Params / Notas |
|---|---|---|---|
| `/api/crm/inbox/threads` | GET | Listar threads | Query: `status` (default open; open/pending/resolved/archived/all), `assigned_to?`, `mine` (0/1), `search?`, `limit` (default 50, max 200). Ordenado por `last_message_at` desc |
| `/api/crm/inbox/threads/[id]` | GET, PATCH | Thread + mensagens / atualizar | GET: últimas 100 msgs (paginação `before` timestamp, `limit` max 500). PATCH: `status?`, `assigned_to?` (atualiza `assigned_at`), `lead_id?`, `deal_id?`, `client_id?`, `contact_id?` |
| `/api/crm/inbox/threads/[id]/messages` | POST | Enviar mensagem | Envia via WhatsApp Cloud API ou Instagram Graph (DM vs comment por prefixo `comment:`). Body: `type` ∈ {text, image, document, template}, `body?` (1-4000), `image_url?`, `document_url?`, `document_filename?`, `template_name?`, `template_language?`. Status local queued → sent/failed |
| `/api/crm/inbox/threads/[id]/read` | POST | Marcar como lido | Zera `unread_count` |

## Automações

| Endpoint | Métodos | Ação | Params / Notas |
|---|---|---|---|
| `/api/crm/automations` | GET, POST | Listar / criar | GET: `scope?`. POST: `name` (1-240), `trigger` (obj), `dag` (nodes+edges) obrigatórios + `description?`, `scope` (default general), `is_active` (default false). Version inicia em 1 |
| `/api/crm/automations/[id]` | GET, PATCH, DELETE | Detalhe (+ últimos 50 runs) / atualizar / arquivar | PATCH incrementa version se DAG mudou. DELETE = soft (`is_active=false`) |
| `/api/crm/automations/[id]/run` | POST | Execução manual | Body: `trigger_data?`, `deal_id?`, `lead_id?`, `thread_id?`, `store_id?`, `idempotency_key?`. Síncrono, `maxDuration` 60s; retorna run_id + telemetria |

## AI Actions

| Endpoint | Métodos | Ação | Params / Notas |
|---|---|---|---|
| `/api/crm/ai-actions` | GET, POST | Listar / criar | GET: `use_case?`. POST: `name` (1-240), `use_case`, `system_prompt`, `user_prompt_template` obrigatórios + `model` (default claude-haiku-4-5), `max_tokens` (1-8192), `temperature` (0-2), `output_schema{}`, `is_active` |
| `/api/crm/ai-actions/[id]` | GET, PATCH, DELETE | Detalhe (+ 50 runs c/ tokens/custo) / atualizar / desativar | PATCH incrementa version se prompts/schema mudam. DELETE = soft |

## Custom fields, channels, forms e tags

| Endpoint | Métodos | Ação | Params / Notas |
|---|---|---|---|
| `/api/crm/custom-fields` | GET, POST | Campos custom de lead/deal | GET: `entity` (lead/deal). POST: `key` (snake_case, 1-60), `label` (1-120) obrig. + `entity_type`, `field_type` ∈ {text, textarea, number, select, multi_select, boolean, date, url, email, phone}, `options[]`, `required`, `position?` |
| `/api/crm/custom-fields/[id]` | PATCH, DELETE | Editar / desativar | DELETE = soft; valores gravados preservados |
| `/api/crm/channels` | GET, POST | Canais de mensageria | GET não retorna `config` (tokens). POST: `type` ∈ {whatsapp, instagram}, `display_name` obrig. + `store_id?`, `whatsapp{phone_number_id, access_token, business_account_id?}` ou `instagram{instagram_business_account_id, access_token}` |
| `/api/crm/forms` | GET, POST | Formulários públicos | GET: `status?`, `scope?`. POST: `name` (1-200), `slug` (2-80, kebab-case) obrig. + `pipeline_id?`, `stage_id?`, `theme?`, `success_message?`, `redirect_url?`, `fields[]` (text/email/phone/select/cpf/cnpj/cep/hidden/…), `scope` |
| `/api/crm/forms/[id]` | GET, PATCH, DELETE | Detalhe (+20 submissões) / editar / arquivar | PATCH: fields = replace total. DELETE = soft (archived) |
| `/api/crm/tags` | GET, POST | Tags | GET: `entity?`. POST: `name` (1-60), `color?` (#hex), `entity_type` (lead/deal/client). Dedup por nome lowercase (retorna `existed: true`) |
| `/api/crm/tags/[id]` | DELETE | Deletar tag | **Hard delete** |

## Dashboards, reports e NPS

| Endpoint | Métodos | Ação | O que faz |
|---|---|---|---|
| `/api/crm/dashboard/cs` | GET | KPIs de CS | Health distribution, MRR (dedup por client), NPS, lojas em risco (top 10), deals abertos por pipeline CS |
| `/api/crm/dashboard/sales` | GET | KPIs de vendas | pipeline_value, won/lost, win_rate, avg_cycle_days, breakdown por pipeline/source. Query: `days` (1-365, default 30) |
| `/api/crm/reports/timeseries` | GET | Série temporal snapshot-first | Lê `crm_org_snapshots` + `crm_lead_funnel_snapshots` + `crm_pipeline_snapshots` (cron 06h). Query: `days` (1-365, default 30) |
| `/api/crm/stores/[id]/nps` | POST | Registrar NPS | Body: `score` (0-10 obrig.), `comment?` (max 2000). Atualiza `client_stores.nps_last_*`; cria activity em deal do pipeline "Feedback" |

## CS-CRM

| Endpoint | Métodos | Ação | O que faz |
|---|---|---|---|
| `/api/cs-crm/cadences` | GET, POST | Cadências por loja | GET: lojas ativas + cadência (override ou default weekly) + stats. POST: `store_id`, `frequency` ∈ {weekly, biweekly, monthly, paused}, `reason` (obrig.), `expires_at?` — weekly remove o override |
| `/api/cs-crm/calls-pipeline` | GET | Kanban de calls mensais | 6 etapas (a marcar → finalizadas), janela ±60d |
| `/api/cs-crm/home` | GET | Kanban agregado do CS | 6 colunas: urgente (health risk), calls hoje, feedbacks prontos, agendar calls (30d+), pós-call pendente, concluídos hoje |

## Pipeline legacy (`/api/pipeline`)

| Endpoint | Métodos | Ação | Params |
|---|---|---|---|
| `/api/pipeline` | POST | Criar pipeline | `name` obrig., `stages` (min 2), `is_default?`; cria membro owner |
| `/api/pipeline/deals` | PATCH, DELETE | Mover / deletar deal | PATCH: `deal_id`, `stage_id`. DELETE (query `id`) = **hard delete** |
| `/api/pipeline/import` | POST | Importar Excel | FormData: `file` (.xlsx), `pipeline_id`. Dedup por email |
| `/api/pipeline/members` | POST, PATCH, DELETE | Membros | roles owner/editor/viewer |
| `/api/pipeline/settings` | PUT, DELETE | Configurar / deletar pipeline | PUT gerencia stages (update/delete/create; migra deals). DELETE: `pipeline_id`, `migrate_to?` |

## Webhooks de mensageria (Meta)

| Endpoint | Métodos | Ação | Auth | Rate limit |
|---|---|---|---|---|
| `/api/webhooks/whatsapp` | GET | Verificação do webhook | `hub.verify_token` == `WHATSAPP_WEBHOOK_VERIFY_TOKEN`; retorna `hub.challenge` | Nenhum |
| `/api/webhooks/whatsapp` | POST | Mensagens/statuses WhatsApp | **HMAC SHA-256** (`x-hub-signature-256` vs `WHATSAPP_APP_SECRET`). Inbound cria thread+message (idempotente por `external_id`); statuses atualizam sent/delivered/read/failed | Nenhum |
| `/api/webhooks/instagram` | GET | Verificação do webhook | `META_WEBHOOK_VERIFY_TOKEN` (fallback WhatsApp) | Nenhum |
| `/api/webhooks/instagram` | POST | DMs + comments Instagram | **HMAC SHA-256** (`META_APP_SECRET`). DMs por sender id; comments agrupados por `comment:{media_id}`. Ignora `is_echo` | Nenhum |
