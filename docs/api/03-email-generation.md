# API — Geração de Emails (Epic AE), Prompts, Webhooks N8N e Internal

> Parte da [documentação de API](./README.md). Salvo indicação contrária, **Auth = sessão Supabase** e **Rate limit = nenhum**.

## Prompts versionados de agentes

Auth de todo o grupo: sessão + `canManagePrompts` (role admin/owner OU tag `dev`).

| Endpoint | Métodos | Ação | Params |
|---|---|---|---|
| `/api/admin/agents/prompts` | GET, POST | Listar / criar versão | GET: `agent_type?` ∈ {copy, image, html, qa, blueprint, assembler, campaign_suggestion, campaign_trends, campaign_architect}. POST: `agent_type`, `model` (min 3), `system_prompt` (10-20000), `user_template` (10-20000), `temperature` (0-2, default 0.7), `max_tokens` (100-8000, default 2048), `output_schema?` (JSON Schema) |
| `/api/admin/agents/prompts/[id]` | GET | Detalhe completo (sem truncate) | Path: `id` |
| `/api/admin/agents/prompts/[id]/activate` | POST | Ativar versão (idempotente) | Transição atômica via índice único parcial |
| `/api/admin/agents/prompts/[id]/rollback` | POST | Restaurar versão anterior | Body: `to_version` (int positivo). 404 se não existe; 409 se já ativa |
| `/api/admin/agents/image-spike` | POST | Teste de geração de imagem (AE-13) | Body: `mode` ∈ {product_ref, text2img}, `image_url` (obrig. se product_ref), `prompt` (3-2000), `model?`, `max_tokens?` (256-65536). Cada chamada é cobrada. Auth: sessão + org membership |

## Email agent configs (legacy, paralelo aos prompts)

| Endpoint | Métodos | Ação | Params |
|---|---|---|---|
| `/api/admin/email-agent-configs` | GET, POST | Listar / criar config | GET: `agent_type?`, `active_only` (default true). POST: `agent_type`, `model` (default claude-sonnet-4-6), `system_prompt`, `user_template`, `temperature` (0-2), `max_tokens` (100-32768), `output_schema?` |
| `/api/admin/email-agent-configs/[id]` | PATCH | Nova versão (desativa anterior) | Campos parciais; omissos herdam da versão anterior |

## Email blocks

| Endpoint | Métodos | Ação | Params / Notas |
|---|---|---|---|
| `/api/admin/email-blocks` | POST, PATCH | Criar bloco / reordenar | POST: `email_id`, `block_type` ∈ {hero, text, coupon, products, footer, image, cta, divider, spacer, social}, `label?`, `position?` (auto), `content?`. PATCH: `email_id`, `order` (UUID[] na nova ordem) |
| `/api/admin/email-blocks/[blockId]` | PATCH, DELETE | Atualizar / deletar | PATCH: `label?`, `position?`, `content?`, `applied?` (true seta `applied_at`). Trigger recalcula progresso |
| `/api/admin/email-blocks/[blockId]/regenerate-image` | POST | Regenerar imagem (AE-16) | GPT Image 2 via OpenRouter. **Rate limit próprio: 1 regen/30s por bloco** (`image_last_generated_at`) |
| `/api/admin/email-blocks/[blockId]/resolve-prompt` | POST | Renderizar prompt (custo zero) | Substitui vars (BRAND_NAME, PRODUCT_*, aspect ratio…) sem chamar LLM |

## Email blueprints e reference templates

| Endpoint | Métodos | Ação | Params |
|---|---|---|---|
| `/api/admin/email-blueprints` | GET, POST | Blueprints globais | GET: `flow_type?`. POST: `objective`, `messaging` (obrig.), `flow_type?`, `email_number?`, `subject_hint?`, `blocks[]`, `tone_override?` |
| `/api/admin/email-blueprints/[id]` | PATCH, DELETE | Atualizar / deletar | Campos parciais |
| `/api/admin/email-reference-templates` | GET, POST | Templates de referência | GET: `flow_type?`, `email_number?`, `is_active?`. POST: `name` (obrig.), `flow_type?`, `email_number?`, `html?`, `copy?`, `image_map[]?`, `thumbnail?`, `tags[]`, `is_active` |
| `/api/admin/email-reference-templates/[id]` | PATCH, DELETE | Atualizar / deletar | Campos parciais |
| `/api/admin/email-reference-templates/test-image` | POST | Testar geração de imagem | Body: `image_prompt`, `store_id`. ~3min, ~$0.04 por chamada |
| `/api/email-reference-templates/[id]` | GET | Buscar template (M2M) | **Auth: header `x-webhook-secret` (N8N_WEBHOOK_SECRET)** — consumido pelo n8n pós-dispatch |

## Email flows e emails

| Endpoint | Métodos | Ação | Params / Notas |
|---|---|---|---|
| `/api/admin/email-flows/[flowId]` | PATCH | Atualizar flow | `name?` (1-120), `description?` (max 500), `status?` ∈ {blocked, in_progress, ready_for_review, approved, live}, `assigned_to?` |
| `/api/admin/email-flows/[flowId]/emails` | POST | Criar email | `name?` (default "E-mail #NN"), `subject?`, `preheader?`, `delay_hours?` |
| `/api/admin/email-flows/[flowId]/emails/[emailId]` | GET, PATCH, DELETE | CRUD do email | GET traz blocos ordenados + QA. PATCH: `name?`, `from_name?`, `from_email?`, `subject?`, `preheader?`, `html?`, `delay_hours?`, `status?` ∈ {draft, in_progress, ready, approved, live}, `klaviyo_message_id?`. Auto-promove `flow.status`; sinaliza tasks de onboarding |
| `/api/admin/email-flows/[flowId]/emails/[emailId]/duplicate` | POST | Duplicar email | Cópia com status=draft, blocos `applied=false`, QA `done=false` |
| `/api/admin/email-flows/[flowId]/emails/[emailId]/send-test` | POST | Enviar teste (Resend) | Body: `to` (email). Re-renderiza HTML server-side, assunto com "[TESTE]" |

## Email QA (checklist)

| Endpoint | Métodos | Ação | Params |
|---|---|---|---|
| `/api/admin/email-qa` | POST | Criar item | `email_id`, `label` (1-120), `category?` ∈ {content, design, tech, compliance}, `position?` (auto) |
| `/api/admin/email-qa/[itemId]` | PATCH, DELETE | Toggle / editar / deletar | PATCH: `done?` (seta `done_at`), `notes?` (max 2000), `label?` |

## Telemetria e settings

| Endpoint | Métodos | Ação | Auth | Params |
|---|---|---|---|---|
| `/api/admin/email-generation-logs` | GET | Telemetria agregada (view `v_email_generation_logs`) | `canManagePrompts` | `days` (default 14, max 365), `agent?`, `status?`, `store_id?`, `flow_type?` |
| `/api/admin/email-generation-logs/[id]` | GET | Detalhe de execução (input_vars, raw_output, error_stack) | `canManagePrompts` | Path: `id` |
| `/api/admin/email-generation-runs` | GET | Runs paginadas | Sessão | `store_id?`, `status?`, `agent?`, `limit` (default 50, max 200), `offset` |
| `/api/admin/email-generation-runs/[id]` | GET | Detalhe de run | Sessão | Path: `id` |
| `/api/admin/email-generation-settings` | GET, PATCH | Settings por org | Sessão | GET: `org_id` (obrig.). PATCH: `org_id` + `auto_trigger?`, `max_parallel?` (1-10), `generate_images?`, `notify_on_error?`, `notify_on_success?`, `notify_emails[]?` |

## Internal (watchdog / fase 2)

Auth de todo o grupo: **header `x-internal-secret` == `INTERNAL_SECRET`**. Sem rate limit.

| Endpoint | Métodos | Ação | O que faz |
|---|---|---|---|
| `/api/internal/run-phase2/[emailId]` | POST | Fase 2 completa | Watchdog: dispatcha `runPhase2InBackground` via `after()`, retorna 200 imediato |
| `/api/internal/run-phase2-image/[emailId]` | POST | Só imagens | Ao concluir (`image_done`), encadeia chamada HTTP para run-phase2-html-qa (fallback in-process). Body: `storeId?`, `triggeredBy?`, `relaxedBrandCheck?` |
| `/api/internal/run-phase2-html-qa/[emailId]` | POST | Só HTML + QA | Claim atômico (status ∈ {image_done, rendering}). Mesmo body opcional |

## SSE

| Endpoint | Métodos | Ação | O que faz |
|---|---|---|---|
| `/api/sse/stores/[id]/emails` | GET | Stream de status de emails (AE-6) | Eventos: `snapshot` (conexão), `email_status_change` (poll 2s de `email_status_events`), `ping` (30s). Auth: sessão Supabase |

## APIs M2M para n8n (`/api/n8n/*`)

Auth: **header `x-webhook-secret` == `N8N_WEBHOOK_SECRET`** (n8n não envia cookies).

| Endpoint | Métodos | Ação |
|---|---|---|
| `/api/n8n/email-reference-templates` | GET, POST | Espelho do endpoint admin de reference templates |
| `/api/n8n/store-briefing` | GET | Briefing atual da loja (`store_id` obrig. em query; cache 5min) |

## Webhooks N8N (callbacks de pesquisa e copy)

Auth de todo o grupo: **header `x-webhook-secret` == `N8N_WEBHOOK_SECRET`** (timing-safe). **Rate limit: webhook 100/min.**

| Endpoint | Ação | Persiste em | Body principal |
|---|---|---|---|
| `POST /api/webhooks/n8n/brand` | Perfil da marca (Pesquisa §01) | `client_stores.brand_*` | `store_id`, `thesis` (10-500), `about` (40-4000), `pillars` (3 itens), `presence?` |
| `POST /api/webhooks/n8n/store-story` | História da loja (§02) | `client_stores.store_*` | `store_id`, `story` (80-6000), `milestones` (1-20) |
| `POST /api/webhooks/n8n/icp` | Cliente ideal (§03) | `client_stores.icp_*` | `store_id`, `persona`, `demographics`, `day_in_life` (min 80), `motivations` (2-20), `frictions` (2-20), `awareness?`, `starving_crowd?`, `unique_mechanism?`, `objections?`, `vocabulary?` |
| `POST /api/webhooks/n8n/tone` | Tom de comunicação (§04) | `client_stores.tone_*` | `store_id`, `description` (60-2000), `do_phrases` (2-12), `dont_phrases` (2-12), `use_words` (2-40), `avoid_words` (2-40) |
| `POST /api/webhooks/n8n/ads-analyzer` | Análise de anúncios (§05) | `client_stores.ads_*` | `store_id`, `score` (0-100), `summary` (40-2000), `sub_scores`, `strengths` (1-8), `opportunities` (1-8), `risks` (0-8) |
| `POST /api/webhooks/n8n/competitors` | Concorrentes (TrendTrack) | `store_competitors` (DELETE+INSERT `source='trendtrack'`; preserva `manual`) | `store_id`, `competitors` (0-20) |
| `POST /api/webhooks/n8n/top-products` | Top 5 produtos | `store_top_products` (DELETE+INSERT atômico) | `store_id`, `captured_at?`, `products` (1-50: rank, title, price, currency, handle, image_url, external_id) |
| `POST /api/webhooks/n8n/briefing-markdown` | Briefing markdown versionado | `store_briefings` (arquiva `current`, insere version=max+1; idempotente se markdown idêntico) | `store_id`, `markdown` (min 200), `mode` ∈ {full, reduced, reduced-enriched}, `generated_at?`, `model_used?`, `tokens_used?` |
| `POST /api/webhooks/n8n/pesquisa-completa` | Sinal de conclusão da Pesquisa | Enfileira job em `email_dispatch_jobs` (dedup); cron roda Architect e dispara copy quando tudo settled | `store_id`, `regeneration?` (true = só atualiza, sem enqueue) |
| `POST /api/webhooks/n8n/email-copy` | Callback de copy de email | `email_flow_emails` (subject/preheader) + `email_blocks.content`; status → `copy_ready`. Idempotente; AE-19: defere fase 2 até confirmação de brand | `store_id`, `email_id`, `subject`, `preheader?`, `blocks[]` ({block_id, content}), `meta?` |
| `POST /api/webhooks/n8n/campaign-copy` | Callback de copy de campanha | `campaign_suggestions.copy_results[mode][store_id]` + job counters. Copy `quality='good'` nunca sobrescrita | `job_id`, `suggestion_id`, `store_id`, `mode`, `status` (success/error), `copy?` ({subject, preheader, strategy, blocks[]}), `error_message?`, `meta?` |
