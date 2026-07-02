# API — Onboarding, Tasks, Pipelines Operacionais, Ritual e Produtividade

> Parte da [documentação de API](./README.md). Salvo indicação contrária, **Auth = sessão Supabase (`requireAuth`)** e **Rate limit = nenhum**.

## Onboarding legacy (`/api/onboarding`)

| Endpoint | Métodos | Ação | Params / Notas |
|---|---|---|---|
| `/api/onboarding` | GET, POST | Listar / iniciar | GET: `client_id?`, `store_id?`, `status?`, `assigned_to_me?`. POST: `client_id` (obrig.), `store_id?`, `assigned_to?`, `notes?` |
| `/api/onboarding/[id]` | GET, PUT, DELETE | CRUD (+ steps) | PUT: `status`, `assigned_to`, `target_completion_date`, `notes`, `store_analysis`, `generated_copies`, `current_phase` (transições via `onboardingPhaseService`). DELETE = soft cancel |
| `/api/onboarding/[id]/approve` | POST | Aprovar / rejeitar / revisão | Body: `action` ∈ {approved, rejected, revision_requested}, `comments?`. Aprovação cria portal account + copy_pipeline; rejeição notifica via n8n. **Auth extra:** feature `onboarding_approve` OU role owner/manager/coo |
| `/api/onboarding/[id]/edit` | PATCH | Editar em pending_approval | Campos de client/store/onboarding_data; valida duplicatas; audit log. **Auth extra:** idem approve |
| `/api/onboarding/[id]/seed-tasks` | POST | Backfill de tasks | Cria board tasks para steps sem task |
| `/api/onboarding/[id]/steps` | GET, PUT | Steps | PUT: `step_id` (obrig.), `status?`, `assigned_to?`, `due_date?`, `notes?`, `blocked_reason?` — sincroniza com board tasks |
| `/api/onboarding/all-steps` | GET | Todos os steps (Kanban) | Steps ativos com client/store/assignee |
| `/api/onboarding/pending-approval` | GET | Fila de aprovação | **Auth extra:** feature `onboarding_approve` OU owner/manager/coo |
| `/api/onboarding/store-briefing` | GET, PATCH, POST | Briefing da loja | GET: `store_id` (obrig.) — `store_briefings` → fallback confirmed → pesquisa. PATCH: `briefing_id`, `briefing_data`. POST: `store_id`, `mode` ∈ {regenerate, manual}, `briefing_text?` |
| `/api/onboarding/store-data` | GET, POST | Dados do formulário | GET: `store_id` ou `client_id`. POST salva; `is_complete=true` dispara geração de briefing via n8n |
| `/api/onboarding/templates` | GET | Templates | Query: `include_steps` (default true) |
| `/api/onboarding/webhook` | GET, POST | Webhook do n8n | GET = health check. POST processa `store_analysis`, `copies_generated`, `briefing_generated`, `drive_folder`. **Auth: header `X-Webhook-Secret` (HMAC). Rate limit: webhook 100/min** |

## Onboardings novo (`/api/onboardings`)

| Endpoint | Métodos | Ação | Params / Notas |
|---|---|---|---|
| `/api/onboardings` | GET, POST | Kanban / criar manual | GET: `status` (default in_progress) — calcula status efetivo (pagamento/contrato). POST: `client_id`, `store_id`, `source_deal_id?`, `plan?`, `mrr_value?`, `language?`, `vertical?`, `source?`, `subscription_id?` |
| `/api/onboardings/[id]` | GET, PATCH, DELETE | Completo / atualizar / cancelar | GET: client, store, tasks, deliverables, activity, versões. PATCH: `payment_status`, `contract_status`, `form_responses`, `briefing`, `briefing_status`, `status` |
| `/api/onboardings/[id]/advance` | POST | Avançar etapa | Transição de estágio no pipeline de onboarding |
| `/api/onboardings/[id]/go-back` | POST | Voltar etapa | Transição reversa |
| `/api/onboardings/[id]/request-briefing-revision` | POST | Pedir revisão do briefing | |
| `/api/onboardings/[id]/resend-briefing-webhook` | POST | Reenviar webhook de briefing | Re-dispara geração via n8n |
| `/api/onboardings/[id]/visual-assets` | GET/POST | Assets visuais | Registro de assets do onboarding |
| `/api/onboardings/[id]/visual-assets/upload` | POST | Upload de asset visual | |
| `/api/onboardings/lookups` | GET | Clientes/lojas para pickers | |

## Pipelines operacionais

| Endpoint | Métodos | Ação | Params |
|---|---|---|---|
| `/api/operational-pipelines` | GET, POST | Listar / criar | POST: `name`, `type`, `columns[]` |
| `/api/operational-pipelines/[id]` | GET, PATCH, DELETE | CRUD | DELETE = inativação |
| `/api/operational-pipelines/[id]/tasks` | GET, POST | Tasks da pipeline | |
| `/api/operational-pipelines/[id]/move-task` | PATCH | Mover task | Body: `task_id`, `column_id`, `position` |
| `/api/operational-pipelines/lookups` | GET | Pipelines + colunas | |

## Tasks

| Endpoint | Métodos | Ação | Params / Notas |
|---|---|---|---|
| `/api/tasks` | GET, POST | Listar / criar | GET: `status?`, `type?`, `assignee_id?`, `client_id?`, `store_id?`, `priority?`, `source_type?`, `limit?`, `my_tasks?`. Inclui assignee/creator/client/store/comments_count |
| `/api/tasks/[id]` | GET, PUT, DELETE | CRUD | DELETE = cancelled |
| `/api/tasks/[id]/start` | POST | Iniciar task de produção | Resolve workspace target via slug, garante flow/email no banco (idempotente), marca in_progress. **Auth extra:** onboarding task access |
| `/api/tasks/[id]/complete` | POST | Completar | Dispara handoff (sync de design de campanha se aplicável). **Auth extra:** task access |
| `/api/tasks/[id]/deliverables` | GET, POST | Entregáveis | |
| `/api/tasks/[id]/deliverables/[deliverableId]` | PUT, DELETE | Entregável individual | |
| `/api/tasks/[id]/checklists` | GET, POST | Checklist | |
| `/api/tasks/[id]/comments` | GET, POST | Comentários | |
| `/api/tasks/[id]/acceptance-criteria` | POST | Critérios de aceite | |
| `/api/tasks/[id]/private-notes` | GET, POST | Notas privadas | |
| `/api/tasks/[id]/store-context` | GET | Contexto da loja da task | |
| `/api/tasks/[id]/timeline` | GET | Histórico de mudanças | |
| `/api/tasks/[id]/workspace-target` | GET | Resolver target (flow/email/pilot) | |
| `/api/tasks/[id]/sub-items/[slug]/toggle` | PUT | Toggle de sub-item | |
| `/api/tasks/reorder` | POST | Reordenar | Body: `positions[]` ({id, position}) |

## Usuário atual, usuários e settings

| Endpoint | Métodos | Ação | Params / Notas |
|---|---|---|---|
| `/api/me/permissions` | GET | Roles, features e acesso a lojas | Granularidade can_view/can_edit/can_manage_* |
| `/api/me/tasks` | GET, POST | Minhas tasks / criar | GET: `status?`, `source_type?`, `date_filter` (today/week/overdue); agrupa por source. POST exige role com bypass |
| `/api/users` | GET | Listar profiles | id/name/email/avatar_url/role |
| `/api/settings/profile` | GET, PUT | Perfil + org | PUT: `name` (2-100), `phone?` |
| `/api/settings/avatar` | POST | Upload de avatar | |
| `/api/settings/password` | POST, PUT | Alterar senha | **Rate limit: auth 10/min** (rota chama `checkRateLimit`) |
| `/api/settings/implementation-flow` | GET | Config de fluxo de implementação | |
| `/api/auth/change-password` | POST | Alterar senha (legacy) | **Rate limit: auth 10/min** |

## Reuniões e time

| Endpoint | Métodos | Ação | Params |
|---|---|---|---|
| `/api/meetings` | GET, POST | Listar / criar | GET: `status?`, `client_id?`, `upcoming?`, `participant_id?`. POST: `title`, `client_id`, `scheduled_at`, `duration_minutes`, `participants` — sync opcional com Google Calendar |
| `/api/meetings/[id]` | GET, PUT, DELETE | CRUD | DELETE = cancelamento (soft) |
| `/api/team/board-config` | GET | Config do board do time | |
| `/api/team/invite` | POST | Convidar membro | **Auth extra:** admin |

## Ritual (diagnóstico semanal)

| Endpoint | Métodos | Ação |
|---|---|---|
| `/api/ritual/chat` | GET, POST | Chat com agente de diagnóstico (POST envia msg, GET histórico) |
| `/api/ritual/sessions` | GET, POST | Sessões da org |
| `/api/ritual/sessions/[sessionId]` | GET | Sessão específica |
| `/api/ritual/sessions/[sessionId]/process` | POST | Processar diagnóstico (health scores, recomendações, flags) |
| `/api/ritual/sessions/[sessionId]/upload` | POST | Upload de arquivos da sessão |
| `/api/ritual/sessions/[sessionId]/approve-tasks` | POST | Aprovar tasks recomendadas |
| `/api/ritual/sessions/[sessionId]/diagnostics` | GET | Resultado do diagnóstico |
| `/api/ritual/stores/[storeId]` | GET | Contexto da loja para o ritual |

## Acompanhamento (pipeline semanal)

| Endpoint | Métodos | Ação | Params |
|---|---|---|---|
| `/api/acompanhamento/pipeline` | GET, POST | Estado semanal | GET: `week_start` (YYYY-MM-DD, default segunda corrente) — lojas agrupadas por stage/health + revenue 30d. POST (upsert): `store_id`, `week_start`, `current_stage`, `health_state`, `health_score`, `flag_reason`, `flagged_by` |
| `/api/acompanhamento/pipeline/[stateId]` | GET | Estado específico | |
| `/api/acompanhamento/pipeline/[stateId]/generate-message` | POST | Mensagem de feedback (IA) | Baseada no health state |
| `/api/acompanhamento/pipeline/[stateId]/send-whatsapp` | POST | Enviar via WhatsApp Cloud API | |

## Produtividade, tutoriais, uploads e automações

| Endpoint | Métodos | Ação | Params / Notas |
|---|---|---|---|
| `/api/productivity` | GET, POST | Board de produtividade | GET: tasks/goals/habits/meetings/focus/groups (+ projeção de onboardings e campanhas em design). POST: `action` (create_task, update_task, toggle_subtask, complete_habit, save_daily_plan, start/end_focus, create_goal, create_habit, …) + dados |
| `/api/tutorial-pages` | GET, POST | Páginas de tutorial | |
| `/api/tutorial-pages/[id]` | GET, PUT, DELETE | CRUD | |
| `/api/tutorial-pages/[id]/blocks` | GET, POST | Blocos de conteúdo | |
| `/api/tutorial-pages/[id]/blocks/[blockId]` | PUT, DELETE | Bloco individual | |
| `/api/upload/contracts` | POST | Upload de contratos | multipart |
| `/api/upload/onboarding` | POST | Upload de onboarding (logos, manuais) | multipart |
| `/api/upload/store-files` | POST | Upload genérico da loja | multipart |
| `/api/automations/manage` | POST | Gerenciar automações CRM (DAG JSON) | Body: `action` ∈ {create, update, delete} + dados. **Auth extra:** role dev ou admin |
