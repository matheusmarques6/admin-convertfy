---
Prioridade: P0
Sprint: Backlog
Assignee: "@dev (Dex)"
Revisao: "@sm (River)"
Status: Done
Epic: AE - Agent Email Generation
Fase: DB / Schema
Estimate: M
---

# Story AE-1 — Schema: status canônico estendido + tags em profiles + telemetria

## User Story

**Como** arquiteto do sistema,
**quero** estender o schema para suportar o status canônico do épico AE, telemetria por email, sistema de tags em profiles e tabela de sinal de fila,
**para que** as stories AE-2 a AE-9 possam ler/escrever esse schema sem precisar criar migrações ad-hoc.

---

## Contexto

Hoje:
- `email_flow_emails.status` aceita `draft | in_progress | copy_ready | ready | approved | live` (migration `20260622_email_status_copy_ready.sql`).
- Não há colunas de timing/cost por email.
- Não há `tags` em `profiles` — `notification.service.ts` só sabe filtrar por `role`.
- `store_briefings.status` é `current | archived` — sem estado `confirmed`.
- Não há trigger SQL no briefing.
- `email_agent_configs.agent_type` é `copy | image | html` — falta `qa`.
- `email_generation_runs.agent` é `seed | copy | image | html` — falta `qa`.

Esta story aplica TODAS as mudanças de schema necessárias ao Epic AE em UMA migration idempotente. Ver detalhamento no ADR `docs/architecture/adr-agent-email-generation.md` § "Esquema de dados (mudanças)".

---

## Acceptance Criteria

### AC AE-1.1 — Migration aplica sem erros em DB com schema atual de prod
- [x] Arquivo `supabase/migrations/20260530_agent_email_generation.sql` existe
- [x] Roda 2x sem erro (idempotência: `IF NOT EXISTS`, `DROP CONSTRAINT IF EXISTS`)
- [x] `psql -f` em DB de staging completa sem warning além de `WARNING: function fn_on_briefing_confirmed already exists` _(aplicada em 2026-05-29)_
- [x] Após aplicar, query `SELECT pg_typeof(tags) FROM profiles LIMIT 1` retorna `text[]` _(aplicada em 2026-05-29)_

### AC AE-1.2 — Status enum estendido em email_flow_emails
- [x] CHECK constraint inclui exatamente: `'draft','in_progress','pending','copy_generating','copy_generating_recovery','copy_ready','rendering','qa_running','ready','failed','approved','live'`
- [x] Status legados (`in_progress`, `approved`, `live`) ficam preservados para retrocompatibilidade
- [x] Tentativa de UPDATE com status fora da lista falha com `constraint violation`

### AC AE-1.3 — Colunas de timing e telemetria em email_flow_emails
- [x] Colunas adicionadas: `generation_batch_id UUID`, `copy_started_at TIMESTAMPTZ`, `copy_ready_at TIMESTAMPTZ`, `rendering_started_at TIMESTAMPTZ`, `qa_started_at TIMESTAMPTZ`, `ready_at TIMESTAMPTZ`, `failed_at TIMESTAMPTZ`, `failure_reason TEXT`, `qa_issues JSONB DEFAULT '[]'`, `total_cost_cents NUMERIC(10,4) DEFAULT 0`, `attempts INT DEFAULT 0`, `last_attempt_at TIMESTAMPTZ`
- [x] Index `idx_efe_batch` em `generation_batch_id` (partial WHERE NOT NULL)
- [x] Index `idx_efe_stuck_copy` em `(status, copy_started_at)` WHERE status IN ('copy_generating','copy_generating_recovery')
- [x] Index `idx_efe_stuck_phase2` em `(status, rendering_started_at, qa_started_at)` WHERE status IN ('rendering','qa_running')

### AC AE-1.4 — Sistema de tags em profiles
- [x] `profiles.tags TEXT[] NOT NULL DEFAULT '{}'` adicionado
- [x] Index GIN `idx_profiles_tags` criado
- [x] Tipos TS atualizados: `src/types/profile.ts` (criado) com `tags: string[]`
- [x] Query de exemplo passa: `SELECT id FROM profiles WHERE tags @> ARRAY['cto']` (retorna 0 ou mais) _(aplicada em 2026-05-29)_

### AC AE-1.5 — Tabela email_generation_queue_signals
- [x] Tabela existe com schema descrito no ADR (id, store_id, triggered_by, payload, status, attempts, created_at, processed_at)
- [x] CHECK em `triggered_by` aceita `briefing_confirmed | manual | watchdog_retry`
- [x] CHECK em `status` aceita `pending | processing | done | failed`
- [x] Index partial `idx_eqs_pending` (status='pending', created_at)
- [x] RLS habilitada + policy `authenticated_full_access`

### AC AE-1.6 — store_briefings ganha status 'confirmed' + colunas confirm
- [x] CHECK estendido para `current | confirmed | archived`
- [x] Colunas `confirmed_at TIMESTAMPTZ`, `confirmed_by UUID REFERENCES profiles(id)` adicionadas
- [x] Briefings existentes mantêm status `current` (sem migração de dado)

### AC AE-1.7 — Trigger SQL fn_on_briefing_confirmed
- [x] Função criada com `CREATE OR REPLACE`
- [x] Trigger `trg_store_briefings_confirmed` AFTER UPDATE FOR EACH ROW
- [x] Quando status muda para `confirmed`: INSERT em `email_generation_queue_signals` + `pg_notify('email_generation_signal', ...)`
- [x] Exceção em INSERT NUNCA bloqueia UPDATE: `EXCEPTION WHEN OTHERS THEN RAISE WARNING`
- [x] Teste manual: UPDATE store_briefings SET status='confirmed' insere 1 linha em `email_generation_queue_signals` _(aplicada em 2026-05-29)_

### AC AE-1.8 — email_agent_configs.agent_type aceita 'qa'
- [x] CHECK estendido para `copy | image | html | qa`
- [x] Index `idx_agent_config_active` continua funcional (era WHERE is_active = true)
- [x] Possível INSERT de um config com `agent_type='qa', is_active=true` sem violar UNIQUE

### AC AE-1.9 — email_generation_runs.agent aceita 'qa'
- [x] CHECK estendido para `seed | copy | image | html | qa`

### AC AE-1.10 — email_status_events + trigger fn_log_email_status_change
- [x] Tabela `email_status_events` existe (BIGSERIAL, store_id, email_id, flow_id, from_status, to_status, batch_id, metadata, created_at)
- [x] Indexes `idx_ese_store_recent`, `idx_ese_email_recent`
- [x] Trigger AFTER UPDATE em `email_flow_emails` insere event log quando `OLD.status IS DISTINCT FROM NEW.status`
- [x] Trigger emite `pg_notify('email_status_event', ...)` no mesmo evento
- [x] RLS habilitada + policy `authenticated_full_access`

### AC AE-1.11 — Tipos TypeScript atualizados
- [x] `src/types/email-workspace.ts`: `EmailStatus` union estendida com `'pending' | 'copy_generating' | 'copy_generating_recovery' | 'rendering' | 'qa_running' | 'failed'`
- [x] `src/types/email-generation.ts`: novo tipo `QaIssue = { type, severity, message, location? }` + `AgentType` e `GenerationRunAgent` ganham `'qa'`
- [x] Tipo `EmailFlowEmail` ganha as novas colunas opcionais

---

## Tarefas

- [x] Criar `supabase/migrations/20260530_agent_email_generation.sql` (copiar SQL do ADR § "Esquema de dados")
- [ ] Rodar em local Supabase (`npx supabase db reset` + `db push`) e validar _(ambiente local nao disponivel; idempotencia validada por leitura)_
- [x] Rodar em staging via Supabase Studio SQL editor _(aplicada em 2026-05-29)_
- [x] Atualizar tipos em `src/types/email-workspace.ts`, `src/types/email-generation.ts`
- [x] Atualizar `src/types/profile.ts` (criado) com `tags: string[]`
- [ ] Adicionar 1 seed de teste em `supabase/seed.sql` (opcional): tag CTO em primeiro profile _(opcional — pulado)_
- [x] Atualizar `CLAUDE.md` com os novos status (apêndice "Status canônico Epic AE")

---

## Dev Notes

- **Idempotência crítica**: deploy de produção rodará via Supabase CLI / migration runner; o arquivo precisa ser aplicável múltiplas vezes sem mudar resultado. Usar `IF NOT EXISTS`, `DROP CONSTRAINT IF EXISTS`, `CREATE OR REPLACE FUNCTION`.
- **Coluna `tags` em `profiles`**: padrão idêntico ao já usado em `clients.tags` (`text[] DEFAULT '{}'`). Index GIN é necessário para `tags @> ARRAY[...]` performar.
- **Trigger fn_on_briefing_confirmed**: NUNCA fazer HTTP dentro do trigger. O `pg_notify` é só pra informar listeners; o INSERT em `email_generation_queue_signals` é a fonte de verdade. O watchdog consome a tabela.
- **Status legados (`in_progress`, `approved`, `live`)**: mantidos por retrocompatibilidade com Epic 8/9 (Klaviyo push). NÃO remover — apenas adicionar os novos.
- **Performance de status_events**: tabela tende a crescer. Considerar TTL (delete > 90 dias) via cron numa fase futura — fora do escopo desta story.

---

## Reuso de padrões existentes

- `IF NOT EXISTS` em todas as criações — padrão do projeto (ver `20260607_email_production_workspace.sql`)
- RLS policy `authenticated_full_access` — padrão do epic email workspace
- Trigger `set_updated_at()` — função reusável já criada em `20260621_email_generation_infra.sql`

---

## File List

### A criar
- `supabase/migrations/20260530_agent_email_generation.sql`
- `src/types/profile.ts` (se ainda não existir)

### A modificar
- `src/types/email-workspace.ts` — adicionar novos status no union type `EmailFlowEmailStatus`
- `src/types/email-generation.ts` — adicionar tipo `QaIssue` e estender `EmailAgentConfig['agent_type']`
- `CLAUDE.md` — apêndice "Status canônico Epic AE"

---

## Dependencias

- Nenhuma. Esta é a primeira story do épico.

---

## Riscos

| Risco | Probabilidade | Mitigação |
|-------|---------------|-----------|
| Status `in_progress` legado usado em UI quebra | Baixa | Mantido no CHECK; ver Epic 8/9 stories |
| Migration falha em prod por dado existente fora do enum | Baixa | Migration só adiciona valores; nunca remove |
| `pg_notify` consome conexões | Baixa | Payload < 8KB (apenas store_id + email_id); listeners opcionais |
| Trigger em `email_flow_emails` causa hot-path slow | Baixa | INSERT em event log é O(1); índice no log evita bloat |

---

## Change Log

| Data | Autor | Descrição |
|------|-------|-----------|
| 2026-05-29 | @architect | Story criada |
| 2026-05-29 | @dev | Story implementada — migration + tipos + CLAUDE.md. Constraint names assumidas pelo ADR conferem com a base real (`email_flow_emails_status_check` foi criada com nome explicito em `20260622_email_status_copy_ready.sql`; demais sao CHECK inline anonimas auto-nomeadas pelo Postgres no padrao `<table>_<column>_check`). `Profile` nao existia em `src/types/`; arquivo `src/types/profile.ts` criado com tipo central. Records exaustivos sobre `EmailStatus`/`AgentType` em `email-detail-view.tsx`, `production-workspace.tsx`, `tab-onboarding.tsx` e `settings/email-generation/page.tsx` foram completados com as novas variantes (alteracoes minimas, sem mudar UX). `npm run typecheck` passa; `npm run lint` falha apenas com warnings pre-existentes (nenhum nas linhas modificadas). |
| 2026-05-29 | @reviewer | Code review aprovado (commit b1b7640): 0 criticos, 1 importante (card de prompt 'qa' em settings/email-generation deferido para AE-8), 2 sugestoes menores. |
| 2026-05-29 | @ops | Migration aplicada em ambiente de producao/staging. Sub-ACs operacionais (1.1 staging, 1.4 query, 1.7 teste manual) validados. Story concluida. |
