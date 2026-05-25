# Investigação · Ritual Semanal

## 1. Branch e git
- Branch: `claude/resume-previous-session-UvATK`
- Working tree limpa, up-to-date com remote

## 2. Acompanhamento Semanal existente?
### Rotas
- `/admin/operacional/ritual` — page.tsx + RitualClient component
- `/admin/ritual` — redirect para /admin/operacional/ritual
- `/api/ritual/sessions` — GET (lista) + POST (cria sessão)
- `/api/ritual/sessions/[sessionId]` — PATCH (atualiza status/index)
- `/api/ritual/sessions/[sessionId]/diagnostics` — POST (salva diagnóstico)
- `/api/ritual/chat` — POST (chat IA com Anthropic claude-sonnet-4-6)
- `/api/acompanhamento/pipeline` — GET (lista pipeline semanal por stage)
- `/api/acompanhamento/pipeline/[stateId]` — PATCH/actions
- `/api/admin/acompanhamento/flag-now` — POST (sinaliza lojas manualmente)
- `/api/cron/weekly-acompanhamento-reset` — POST (cron domingo 22h)

### Tabelas (já existem)
- `weekly_pipeline_states` — estado de cada loja no pipeline semanal (4 stages, 5 health states)
- `weekly_pipeline_actions` — ações aprovadas por loja/semana
- `ritual_sessions` — sessões do ritual (tracking de call, participantes, gravação)
- `ritual_store_diagnostics` — diagnóstico por loja (notas, ações, chat IA)
- Storage bucket `ritual-recordings` — para gravações Fathom

### Sidebar
- "Ritual de Sexta" existia no grupo "Customer Success" (movido para "Workflows")
- "Pipelines CS" existia no grupo "Pipelines" (movido para "Workflows")

## 3. Schema atual (relevante pro ritual)
### client_stores
- id, org_id, client_id, store_name, store_url, platform, niche, email_platform
- mrr_cents, contract_end_date, health_score, is_active, created_at
- nps_last_score, nps_last_at

### weekly_pipeline_states
- id, org_id, store_id, week_start, current_stage (1-4), health_state, health_score
- flag_reason, flagged_by, flagged_at, approved_actions, approved_at, approved_by
- ai_message, ai_message_generated_at, feedback_sent_at, feedback_sent_by
- is_active, created_at, updated_at

### ritual_sessions
- id, org_id, week_start, status, started_at, completed_at, started_by, participants
- store_ids (UUID[]), current_store_index
- recording_url, recording_filename, recording_uploaded_at
- transcript, transcript_status, transcript_processed_at, transcript_error
- generated_tasks (JSONB)

### tasks
- id, org_id, title, description, status, priority, assignee_id, due_date
- source_type, source_metadata, created_by, created_at

## 4. Integrações ativas
- **Omnisend**: tabelas omnisend_metrics, omnisend_reports_cache + API via service
- **Klaviyo**: tabelas klaviyo_metrics + API via service
- **Shopify**: integração REST/GraphQL via client_stores.credentials
- **Anthropic SDK**: @anthropic-ai/sdk instalado, usado em /api/ritual/chat

## 5. O que foi implementado nesta sessão
- [x] Tela 1 (Home) reescrita idêntica ao protótipo (breadcrumb, grid 8 cols, KPI strip unificado, avatar por estado)
- [x] Tela 2 (Modal) reescrita idêntica ao protótipo (header Fathom, store header com accent rail, 5 tabs, chat IA, footer dots)
- [x] Tela 3 (Upload) nova — 3 estágios (upload dropzone, processing 4 steps, done)
- [x] Tela 4 (Tasks) nova — task blocks por loja, task rows com origin quote, sidebar descartadas
- [x] Sidebar reorganizada (Workflows: Pipelines CS + Ritual de Sexta)
- [x] Rotas: /admin/operacional/ritual/upload + /admin/operacional/ritual/tasks

## 6. O que já existia e NÃO foi alterado
- Schema SQL (weekly_pipeline_states, ritual_sessions, ritual_store_diagnostics)
- APIs (sessions, chat, pipeline, flag-now)
- Serviço de flagging (acompanhamento-flagging.service.ts)
- RLS policies

## 7. Próximos passos (funcionalidade)
- [ ] Upload real do arquivo para Supabase Storage (atualmente simulado)
- [ ] Transcrição via Whisper API (atualmente simulado)
- [ ] Correlação transcrição→lojas via Claude (atualmente simulado)
- [ ] Extração de tasks via Claude (atualmente mock data)
- [ ] "Aprovar tudo" cria tasks reais na tabela `tasks`
- [ ] Mover lojas para Etapa 2 do acompanhamento_pipeline
- [ ] Integração Omnisend nas abas Campanhas e Automações
- [ ] Health score calculado via Omnisend metrics (atualmente via weekly_reports)
- [ ] Cron pg_cron domingo 22h automático

## 8. Riscos identificados
- Tabs Campanhas e Automações mostram placeholder (dados dependem de integração Omnisend ativa)
- Tela 4 usa mock data (tasks serão geradas pela IA após transcrição)
- Upload Fathom simula processamento (integração real com Whisper/Storage pendente)
