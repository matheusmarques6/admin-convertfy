# API — Campanhas (Campaign Central, Pipeline e Campaigns)

> Parte da [documentação de API](./README.md). Convenções de auth, erros e rate limit estão no README.

## Campaign Central

### Lotes de campanha

| Endpoint | Métodos | Ação |
|---|---|---|
| `/api/admin/campaign-batches` | GET, POST | Listar / criar lotes de campanha |

- **GET** — Lista lotes da organização com filtro `status` e `limit` (query, default 50); enriquece com nomes das lojas.
- **POST** — Cria lote. Body: `name` (min 3), `campaign_type`, `scheduled_at` (ISO 8601, futuro), `store_ids` (UUID[], min 1), `instructions_doc_url?` (URL), `notes?`.
- **Auth:** sessão Supabase + perfil em `profiles`. **Rate limit:** nenhum.

### Board, calendário e ciclo

| Endpoint | Métodos | Ação | O que faz |
|---|---|---|---|
| `/api/admin/campaign-central/board` | GET | Board unificado | Cards (sugestões + pipeline items) em 7 colunas derivadas server-side + designers disponíveis |
| `/api/admin/campaign-central/board/[id]/move` | POST | Mover card | Traduz drag→ação (approve, dispatch copy, bulk stage, reopen) com guard-rails de adjacência e gate piloto. Body: `to` (BoardColumnKey). Path aceita UUID ou `sugg:<id>` |
| `/api/admin/campaign-central/automations` | GET | Log de transições | Últimas 200 transições de coluna (`campaign_automation_runs`) com autor resolvido |
| `/api/admin/campaign-central/calendar` | GET | Calendário | Feriados da janela + contagem de sugestões por data + campanhas. Query: `days` (default 25, max 90) |
| `/api/admin/campaign-central/calendar/sync-holidays` | POST | Sincronizar feriados | Upsert de feriados oficiais (Nager.Date) dos países das lojas ativas, 2 anos. `maxDuration` 60s |
| `/api/admin/campaign-central/cycle` | GET | Carregar ciclo | Ciclo atual ou por `cycle_id` (query) + sugestões + temas em alta + contadores |
| `/api/admin/campaign-central/cycle/regenerate` | POST | Regenerar ciclo | Dispara `runSuggestionCycle()` com mesmo lock do cron; 409 se em execução. `maxDuration` 300s |
| `/api/admin/campaign-central/insights` | GET | Rail de insights | Lojas em atenção + emails campeões (benchmark Omnisend) |
| `/api/admin/campaign-central/settings` | GET, PUT | Settings da Central | GET retorna settings da org (ou defaults); PUT faz upsert. Campos: `date_window_days` (7-90), `max_trends_per_cluster` (1-12), `max_web_searches_per_cluster` (1-10), `max_stores_per_cluster` (2-12), `max_concurrent_clusters` (1-5), `benchmark_min_recipients`, `benchmark_top_n` (3-20), `health_critical_threshold` (0-100), `health_warn_threshold` (0-100), `revenue_drop_pct` (-90 a 0), `auto_cycle_enabled`, `trends_enabled` — todos opcionais |

- **Auth (todos acima):** sessão Supabase + org membership (`getUserOrgRole`). **Rate limit:** nenhum.

### Produção

| Endpoint | Métodos | Ação | O que faz |
|---|---|---|---|
| `/api/admin/campaign-central/production` | GET | Listar produção | Campanhas aprovadas em produção com estágio + designer por loja |
| `/api/admin/campaign-central/production/[id]` | PATCH | Atualizar loja em produção | Muda `prod_stage` (0-4) e/ou `designer_id` de UMA loja (mutação cirúrgica no JSONB `target_stores`). Body: `store_id` (obrigatório), `prod_stage?`, `designer_id?` |
| `/api/admin/campaign-central/production/[id]/preview` | GET | Preview de email | HTML real (pipeline AE) de uma loja. Query: `store_id` (obrigatório). Só consome, nunca dispara pipeline |
| `/api/admin/campaign-central/production/[id]/reopen` | POST | Reabrir em rascunho | Reabre pipeline_item; garante `campaign_suggestion` 'suggested' atrelada |

- **Auth:** sessão Supabase + org membership. **Rate limit:** nenhum.

### Contexto para n8n (M2M)

| Endpoint | Métodos | Ação |
|---|---|---|
| `/api/admin/campaign-central/stores/[id]/context` | GET | Contexto completo da loja p/ geração de copy |

- Retorna idioma, briefing, pesquisa & diagnóstico, brand identity, top products.
- **Auth:** header `x-webhook-secret` (`requireWebhookSecret`) — sem sessão; consumido pelo n8n. **Rate limit:** nenhum.

### Sugestões

| Endpoint | Métodos | Ação | O que faz |
|---|---|---|---|
| `/api/admin/campaign-central/suggestions` | POST | Criar campanha manual | Cria como rascunho: `status='suggested'` + pipeline_item em `copy_creation`. Body: `title`, `type`, `channel`, `targets` (Array<{store_id, store_name, country}>), `briefing?`, `send_date?` |
| `/api/admin/campaign-central/suggestions/[id]` | GET, PATCH | Buscar / agir | PATCH é union discriminada por `action`: `approve` (cria pipeline item, `email_draft?`), `dismiss`, `undo`, `update_draft` (`email_draft?`, `angle?`, `send_date?`, `brief?`, `targets?`, `channel?`) |
| `/api/admin/campaign-central/suggestions/[id]/design-decision` | POST | Decisão do COO | `decision`: `approve` → produção; `request_changes` → version++, volta para estrutura (Fase 8) |
| `/api/admin/campaign-central/suggestions/[id]/generate-copy` | POST | Disparar copy via n8n | Marca lojas pending em `copy_results[mode]`, cria job e envia webhook fire-and-forget. Retorna **202** com `job_id`. Body: `mode` ('test'\|'production'), `store_ids` (UUID[]) |
| `/api/admin/campaign-central/suggestions/[id]/generate-master` | POST | Gerar copy master (IA) | Gera subject + preheader + strategy + blocks e persiste em `email_draft`. Body: `audience_label?`. `maxDuration` 120s |
| `/api/admin/campaign-central/suggestions/[id]/parse-master` | POST | Estrutura → copy master | Usa `raw_text` literalmente (sem IA). `maxDuration` 30s |
| `/api/admin/campaign-central/suggestions/[id]/mark-quality` | PATCH | Marcar qualidade da copy | Body: `store_id`, `mode` ('test'\|'production'), `quality` ('good'\|null) |
| `/api/admin/campaign-central/suggestions/[id]/set-pilot` | PATCH | Definir lojas piloto | Body: `store_ids` (UUID[]) |

- **Auth:** sessão Supabase + org membership (design-decision exige coo/admin/dev). **Rate limit:** nenhum.

## Campaign Pipeline (legacy)

| Endpoint | Métodos | Ação | O que faz |
|---|---|---|---|
| `/api/campaign-pipeline` | GET, POST | Listar / criar itens | GET filtra por `stage`, `assigned_to`, `campaign_type` (query). POST body: `title` (obrigatório), `description`, `stage`, `campaign_type`, `subject_line`, `preview_text`, `copy_data`, `design_data`, `target_stores`, `deploy_config`, `priority`, `due_date`, `tags` |
| `/api/campaign-pipeline/[id]` | GET, PATCH, DELETE | CRUD do item | PATCH aceita os mesmos campos do POST |
| `/api/campaign-pipeline/[id]/deploy` | POST | Deploy no Omnisend | Cria draft campaigns no Omnisend por loja (`store_ids` UUID[]); move stage para `deployed` se todas OK. `maxDuration` 120s |
| `/api/campaign-pipeline/[id]/move` | PATCH | Mover stage | Body: `stage` ∈ {idea, briefing, copy_creation, design, review, ready_to_deploy, deploying, deployed} |

- **Auth:** sessão Supabase + org (via `resolveOrgId`). **Rate limit:** nenhum.

## Campaigns (calendário/aprovação)

| Endpoint | Métodos | Ação | O que faz |
|---|---|---|---|
| `/api/campaigns` | GET, POST | Listar / criar | GET unifica `campaigns` + `campaign_batches`. Query: `store_id`, `client_id`, `start_date`, `end_date`, `status`, `channel`, `unified` (default true). POST body: `name` (obrigatório), `store_id`, `client_id`, `description`, `scheduled_date`, `scheduled_time`, `channel`, `campaign_type`, `status`, `subject_line`, `preview_text`, `segment_name`, `estimated_recipients`, `tags`, `color`, `notes` |
| `/api/campaigns/[id]` | GET, PUT, DELETE | CRUD | GET traz relations (store, client, submitter, reviewer). PUT: se `status='scheduled'`, cria task automática (TaskAutomationService) |
| `/api/campaigns/[id]/submit` | POST | Enviar p/ revisão | draft/rejected → pending_review. Body: `notes?` |
| `/api/campaigns/[id]/approve` | POST | Aprovar | pending_review → approved (ou scheduled se tem `send_datetime`). Body: `notes?`. Exige owner/manager/coordinator ou admin |
| `/api/campaigns/[id]/reject` | POST | Rejeitar | Body: `reason` (obrigatório). Exige owner/manager/coordinator ou admin |
| `/api/campaigns/[id]/history` | GET | Histórico | `campaign_history` desc com autor |

### Geração via n8n

| Endpoint | Métodos | Ação | O que faz |
|---|---|---|---|
| `/api/campaigns/generate` | POST | Iniciar geração | Cria `campaign_generations` + `campaign_generation_stores`, dispara webhook n8n fire-and-forget. Retorna **202** com `generation_id`. Body: `store_ids` (obrigatório), `name`, `date`, `reference_doc_url?`, `generation_id?` (regen). Aceita org member OU portal user |
| `/api/campaigns/generate/[id]` | GET, DELETE | Buscar / deletar geração | Isolamento: portal user por `client_id`, org member por `org_id`, admin sempre |
| `/api/campaigns/generations/[id]/approve` | POST | Aprovar geração | done → approved; trigger de DB cria 3 tasks (designer, techlead, sdr) com auto-assign + notificação. Exige owner/manager/coo ou admin |
| `/api/campaigns/tasks` | GET | Listar tasks de geração | Query: `generation_id?`, `status?`, `my_tasks?` (bool). RLS por org |
| `/api/campaigns/tasks/[id]` | PATCH | Atualizar task | `status` (pending→in_progress\|skipped; in_progress→completed\|skipped), `assignee_id?`, `notes?` (max 5000). Permissão: assignee, manager/coo ou admin. Notifica COO quando todas completam |
| `/api/campaigns/webhook-callback` | POST | Callback do n8n | Marca generation `done` e status per-store. **Auth:** header `x-webhook-secret` (timing-safe), sem sessão. Body: `generation_id`, `drive_folder_id?`, `drive_folder_url?`, `stores` (Array<{store_id, status, error_message?}>) |

### Sincronização Klaviyo

| Endpoint | Métodos | Ação | O que faz |
|---|---|---|---|
| `/api/campaigns/sync` | POST | Sync por loja | Klaviyo API → tabela `campaigns`, métricas email+SMS em paralelo. Body: `store_id` (UUID). Exige role admin/super_admin |
| `/api/campaigns/sync-all` | POST | Sync geral | Itera lojas ativas com Klaviyo key; pausa 1s entre lojas. Exige role admin/super_admin |

- **Rate limit (todo o grupo Campaigns):** nenhum.
