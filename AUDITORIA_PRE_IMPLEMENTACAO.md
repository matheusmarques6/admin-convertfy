# Auditoria Pré-Implementação — Sprint Onboarding v2

> **Nota retroativa**: este documento foi criado APÓS a implementação. O sprint foi executado sob override explícito do usuário (“foco é já desenvolver sem para deixando na versão final de produção”), o que levou a saltar a Fase Zero formal e ir direto pro código. Este registro consolida o que foi auditado mentalmente antes/durante a execução, permitindo revisão posterior e onboarding de outros devs.

**Branch**: `claude/resume-previous-session-UvATK`
**Data**: 2026-05-13
**Status do sprint**: implementado, revisado e em produção (3 commits: `45945c9`, `ebacd30`, `ec189a3`)

---

## 1. Estado do banco antes da implementação

### 1.1 Tabelas legadas que coexistem

| Tabela | Linhas | Decisão |
|---|---|---|
| `client_onboardings` | 5 (1 org, dados de teste) | Migrar pra `onboardings` via service `legacy-onboarding-migration.service.ts`. Telas legadas (`/admin/dashboard/operational`, `/admin/stores/[id]`, `/admin/operacional/dashboard`) apontadas pra `onboardings` com adapters de shape. |
| `operational_pipelines` (versão antiga, kanban Monday-style) | 0 | Drop completo. Substituído pelo novo schema do PRD. |
| `client_stores` | 95 (17 clientes) | Reutilizar como FK em `onboardings.store_id`. Não duplicar. |
| `clients` | 17 | Reutilizar como FK em `onboardings.client_id`. Não duplicar. |
| `deals` + `pipeline_stages` | (CRM ativo) | Trigger em `deals` publica `deal.won` em `events`. Handler app cria onboarding. |
| `tasks` | (CRM ativo) | Estender com `onboarding_id`, `operational_column_id`, `assignee_role`, `version`. Não criar tabela nova. |
| `crm_channels`, `crm_threads`, `crm_messages` | (CRM ativo) | Reutilizar pra mandar WhatsApp ao avançar coluna. |
| `notifications` | (sino global) | Reutilizar pra avisos internos (column_change, briefing_ready, stuck). |
| `events` | (event bus) | Reutilizar — handler processa async via cron. |
| `org_members` + `org_role` enum | (ativo) | Estender enum com `ops`, `estrategista`, `cs`, `financeiro`. |

### 1.2 Constraints e enums verificados

- `org_role` enum tem 15 valores (owner, manager, coo, coordinator, copywriter, designer, developer, techlead, support, sdr, analyst, ops, estrategista, cs, financeiro). Quatro últimos adicionados nesta migration.
- `events` table não tem coluna `org_id` (vai em `metadata.org_id`). Descoberto após falha do trigger inicial e corrigido em `deal_won_trigger_fix`.
- `crm_threads` tem `UNIQUE (channel_id, contact_external_id)` permitindo upsert em `sendColumnWhatsApp`.
- `tasks.created_by` era `NOT NULL` — bug: `confirmBriefing` (chamado por cliente público sem auth) inseria null. Fix: migration `tasks_created_by_nullable_for_system_inserts` tornou a coluna nullable.
- `client_stores` tem unique constraint em `(org_id, lower(trim(store_name)))` — leva a `23505` em criação de loja duplicada. Tratado no endpoint `/api/client-stores`.

### 1.3 RLS aplicado

Todas as 6 tabelas novas (`operational_pipelines`, `operational_pipeline_columns`, `onboardings`, `task_deliverables`, `onboarding_versions`, `task_overrides`) têm RLS habilitado com policies baseadas em `org_members`. `task_overrides_select` é mais restritivo (só o próprio user OU owner/manager veem).

---

## 2. Código existente reutilizado

### 2.1 Serviços e helpers
- `createAdminClient()` / `createClient()` (Supabase server) — usado em todos os endpoints.
- `requireAuth`, `errorResponse`, `successResponse`, `AppError` em `@/lib/api/errors`.
- `resolveOrgId` em `@/lib/api/resolve-org`.
- `logger.child(...)` em `@/lib/logger`.
- `sendWhatsAppMessage` em `@/lib/services/whatsapp-cloud.service` (WhatsApp Cloud v20.0 já configurado).
- `requireCronAuth` em `@/lib/api/cron-auth` pros cron endpoints.

### 2.2 UI / Design system
- `useToast` (`@/lib/hooks/use-toast`) pra feedback de ações.
- `PagePermissionWrapper` em `@/components/page-permission-wrapper` envolvendo páginas admin.
- `ROUTES` em `@/lib/routes` — novas chaves adicionadas: `ONBOARDING_V2.{LIST,DETAIL,NEW}`, `ONBOARDING_HELP.{LIST,EDIT,EDIT_PAGE}`, `ME`.
- Design tokens do CRM (`--crm-*`) — paleta preta `#1F1F1F`, border-radius 4-6px, densidade alta.
- `@hello-pangea/dnd` (já no projeto) — pra drag-and-drop do kanban.
- `swr` (já no projeto) — pra fetch reativo.
- Sidebar (`src/components/layout/sidebar.tsx`) — extendida com seções Operacional > Onboarding/Tutorial cliente/Pipelines CS, e overview "Minhas tarefas".

### 2.3 Integrações externas
- **Anthropic API**: `@anthropic-ai/sdk` já presente. Briefing fallback usa Claude direto (model `claude-sonnet-4-6`).
- **n8n webhook**: opcional via `N8N_BRIEFING_WEBHOOK_URL` + `N8N_WEBHOOK_SECRET` (HMAC `timingSafeEqual`).
- **WhatsApp Cloud API v20.0**: já wired pro CRM, reusado pra mandar templates de coluna.

### 2.4 Cron infra (Vercel)
- `vercel.json` já tinha 12 crons. Adicionados 2 novos: `process-deal-won` (a cada minuto) e `onboarding-sla-check` (diário 09h UTC).

---

## 3. Decisões arquiteturais tomadas

### 3.1 Schema operacional separado do comercial
- Pipelines CRM (`pipelines`, `pipeline_stages`, `deals`) continuam intactas.
- Pipelines operacionais usam tabelas paralelas (`operational_pipelines`, `operational_pipeline_columns`).
- Templates de coluna (`checklist_template`, `deliverables_template`, `whatsapp_template`, `automation_rules`) são JSONB inline na coluna — não normalizados em tabelas filhas pra simplificar leitura.

### 3.2 Onboarding como entidade primeira-classe
- Decisão: NÃO criar onboarding como `task` de tipo especial. Em vez disso, tabela própria (`onboardings`) com FK pra `client_stores` e `clients`. Cada coluna do kanban instancia 1 task com `onboarding_id` + `operational_column_id`.
- `form_token` (TEXT UNIQUE NOT NULL) e `tutorial_token` (TEXT UNIQUE nullable) — 24 chars de entropia (~144 bits) gerados via `crypto.randomBytes`.
- `UNIQUE INDEX idx_onboardings_unique_active ON (client_id, store_id) WHERE status='in_progress'` garante idempotência.

### 3.3 deal.won → onboarding via event bus (não inline)
- Trigger SQL publica em `events` em vez de criar onboarding direto. Preserva lógica do service handler em TS (`deal-won-watcher.service.ts`).
- Cron `/api/cron/process-deal-won` roda a cada minuto, idempotente. Defesa em profundidade: se o cron falhar, evento fica em `events.processed=false` até próxima rodada.

### 3.4 Bootstrap idempotente em código TS, não SQL
- `ensureOnboardingBootstrap(orgId, userId)` cria pipeline + 7 colunas + 1 tutorial_page sob demanda.
- SEED_COLUMNS literal em TS (~400 linhas) — fácil revisar/PR, vs migration SQL gigante.
- Chamado em todo `GET /api/onboardings` e `createOnboarding`.

### 3.5 Briefing via IA com fallback
- Tela 1 dispara `void generateBriefing(onb.id)` fire-and-forget.
- Tenta n8n primeiro (se `N8N_BRIEFING_WEBHOOK_URL` configurado). Falha → fallback Claude direto.
- Polling 4s na Tela 2 até `briefing_status='generated_pending_review'`.
- Cliente edita inline e confirma → `confirmBriefing` avança coluna sozinha pra `preview_producao`.

### 3.6 Versionamento entre colunas 3↔4
- `onboarding_versions` registra cada round-trip (preview → cliente → ajustes).
- `task_overrides` audita pulos com justificativa (>=30 chars).
- Severidade do feedback em enum: `small|medium|rework_part|rework_all`.

### 3.7 Permissões granulares por role
- Matriz `OnboardingAction × org_role` em `@/lib/api/onboarding-permissions.ts`.
- Aplicada em endpoints críticos: `/advance`, `/go-back`, `/migrate-legacy-onboardings`, deliverables CRUD, tutorial CRUD.
- Endpoints públicos `/forms/[token]/*` e `/onboarding-help/[token]` ficam abertos (validados por token).

### 3.8 Coexistência com legado
- `client_onboardings` continua na DB mas reads legadas redirecionadas pra `onboardings` com adapters.
- Migração de dados disponível via `POST /api/admin/migrate-legacy-onboardings` (admin-only, idempotente, dedup por client_id+store_id+org_id).
- Decisão: não dropar `client_onboardings` ainda — backup vivo até deploy estabilizar.

---

## 4. Pontos não resolvidos / dívida técnica conhecida

| Item | Impacto | Plano |
|---|---|---|
| Sem rate-limit nos endpoints públicos `/forms/[token]/*` | Spam Claude API se token vazar | Mitigado por: dedup `briefing_confirmed_by_client`, limites de payload (64KB total / 5000 chars/resposta). Rate-limit Redis fica pra v2. |
| `briefing-generation` fire-and-forget no serverless | Timeout Vercel >60s mata o fallback Claude | Aceito. n8n webhook async cobre o cenário longo. |
| Páginas públicas sem dark mode | UX em modo escuro do browser | Decisão intencional — cliente final usa luz. |
| Sem testes unitários/integração | Regressões silenciosas | Decisão usuário: pular infra de teste (projeto não tem jest/vitest). |
| `migrate-legacy-onboardings` não rodou em produção | 5 onboardings legados não migrados | Endpoint pronto, owner roda manualmente quando confortável. |
| OnboardingCard inicial era “pobre” vs DealCard | Visual desigual no app | Sendo enriquecido nesta sessão de revisão. |
| Empty state `tutorial_pages` da org legada | Bootstrap roda na primeira chamada de UI | Não é bug — funciona ao acessar `/admin/onboarding` ou `/admin/onboarding-help`. |

---

## 5. Perguntas pendentes (respondidas durante o sprint)

1. **Como tratar o legado `client_onboardings`?**
   → "Migrar dados pra onboardings + deprecar" (decidido na revisão pós-implementação).

2. **Canal para notificações de onboarding travado?**
   → "Inbox interno (notifications table)".

3. **Adicionar testes?**
   → "Pular — sem infra de teste configurada".

4. **Replace operacional_pipelines existente ou criar paralelo?**
   → Replace (0 rows na tabela legada).

5. **Onde gravar `org_id` no event de deal.won?**
   → `metadata.org_id` (events table não tem coluna própria).

6. **Modelo Claude a usar?**
   → `claude-sonnet-4-6` (mais recente válido na cutoff Jan 2026).

---

## 6. Arquivos físicos criados no sprint

### Backend (services)
- `src/lib/services/onboarding-pipeline.service.ts` — createOnboarding, createFromDeal, advanceColumn, goBackToColumn, confirmBriefing, instantiateTaskForColumn, validateColumnCompletion, generateTutorialTokenIfMissing
- `src/lib/services/onboarding-bootstrap.service.ts` — ensureOnboardingBootstrap + SEED_COLUMNS + TUTORIAL_DEFAULT_BLOCKS
- `src/lib/services/briefing-generation.service.ts` — generateBriefing (n8n + Claude fallback)
- `src/lib/services/tutorial-page.service.ts` — renderTutorialByToken com substituição de variáveis
- `src/lib/services/deal-won-watcher.service.ts` — processDealWonEvents (cron handler)
- `src/lib/services/onboarding-whatsapp.service.ts` — sendColumnWhatsApp (template render + WhatsApp Cloud)
- `src/lib/services/onboarding-notifications.service.ts` — notifyColumnChange, notifyBriefingReady, notifyStuck
- `src/lib/services/legacy-onboarding-migration.service.ts` — migrateLegacyOnboardings
- `src/lib/api/onboarding-permissions.ts` — matriz role→ação + requireOnboardingPermission

### Backend (API routes — 22 novas)
- `src/app/api/onboardings/{route,lookups,[id]/{route,advance,go-back,request-briefing-revision}}.ts`
- `src/app/api/forms/[token]/{route,submit-data,briefing-status,confirm-briefing}/route.ts`
- `src/app/api/onboarding-help/[token]/route.ts`
- `src/app/api/tutorial-pages/{route,[id]/{route,blocks/{route,[blockId]/route}}}.ts`
- `src/app/api/tasks/[id]/deliverables/{route,[deliverableId]/route}.ts`
- `src/app/api/me/tasks/route.ts`
- `src/app/api/upload/onboarding/route.ts`
- `src/app/api/webhooks/n8n/briefing-generated/route.ts`
- `src/app/api/cron/{process-deal-won,onboarding-sla-check}/route.ts`
- `src/app/api/admin/migrate-legacy-onboardings/route.ts`
- `src/app/api/client-stores/route.ts` (POST adicionado pra criação inline)

### Frontend (pages)
- `src/app/admin/onboarding/{page,[id]/page}.tsx`
- `src/app/admin/onboarding-help/{page,[id]/edit/page}.tsx`
- `src/app/admin/me/page.tsx`
- `src/app/form/[token]/{page,briefing/page}.tsx`
- `src/app/onboarding-help/[token]/page.tsx`

### Frontend (components — `src/components/onboarding-v2/`)
- `onboarding-kanban.tsx` — kanban 7 colunas + drag-drop + new dialog
- `onboarding-detail-client.tsx` — detail com tabs (Checklist, Deliverables, Briefing, Versões, Form, Override dialog)
- `select-client-and-store.tsx` — combobox cliente + store inline
- `form-tela1-client.tsx` — formulário público Tela 1 (7 perguntas)
- `form-tela2-client.tsx` — review do briefing com polling + confirmar
- `tutorial-pages-list.tsx` — CMS lista de tutoriais
- `tutorial-page-editor.tsx` — editor de blocks (7 tipos)
- `public-tutorial-renderer.tsx` — renderer público
- `my-tasks-client.tsx` — Minhas tarefas filtradas por role

### Types
- `src/types/onboarding-pipeline.ts` — todos os tipos novos (sem conflitar com `onboarding.ts` legado)

### Migrations físicas (criadas retroativamente)
- `supabase/migrations/20260513015053_onboarding_v2_schema.sql`
- `supabase/migrations/20260513015111_deal_won_trigger.sql`
- `supabase/migrations/20260513015157_deal_won_trigger_fix.sql`
- `supabase/migrations/20260513015243_seed_onboarding_pipeline_and_tutorial.sql`
- `supabase/migrations/20260513030743_tasks_created_by_nullable_for_system_inserts.sql`

---

## 7. Bugs encontrados na revisão pós-implementação (8 corrigidos)

| # | Severidade | Bug | Fix |
|---|---|---|---|
| 1 | Crítico | Migração legacy usava slugs inexistentes (`cliente_preenchendo_formulario`, `emails_finais_em_producao`) | Mapeamento corrigido pros slugs reais do bootstrap (`cliente_formulario`, `emails_finais`) |
| 2 | Crítico | `tasks.created_by NOT NULL` mas `confirmBriefing` insere null | Migration tornou coluna nullable |
| 3 | Crítico | Modelo Claude inexistente `claude-sonnet-4-5` | Trocado pra `claude-sonnet-4-6` |
| 4 | Alto | `createOnboarding.existing` sem filtro `org_id` (cross-org leak) | Adicionado `.eq("org_id")` |
| 5 | Alto | `submit-data` sem limite de payload (DoS) | Limite 64KB total + 5000 chars/resposta |
| 6 | Alto | `submit-data` permitia spam infinito do Claude | Bloqueia regen se `briefing_confirmed_by_client` |
| 7 | Alto | `confirmBriefing` race condition (2x click → versions dup) | Update condicional `eq("briefing_confirmed_by_client", false)` |
| 8 | Médio | `request-briefing-revision` sem `justification` no front | Adicionado `window.prompt()` |

---

## 8. Onde olhar pra entender o sistema

1. **Schema**: `supabase/migrations/20260513015053_onboarding_v2_schema.sql`
2. **Lógica core**: `src/lib/services/onboarding-pipeline.service.ts`
3. **Template das colunas**: `src/lib/services/onboarding-bootstrap.service.ts` (SEED_COLUMNS)
4. **UI principal**: `src/components/onboarding-v2/onboarding-kanban.tsx` + `onboarding-detail-client.tsx`
5. **Fluxo cliente**: `src/components/onboarding-v2/form-tela1-client.tsx` + `form-tela2-client.tsx`
6. **Permissões**: `src/lib/api/onboarding-permissions.ts`
7. **PRD original**: `docs/prd/PRD-onboarding-convertfy.md` (se ainda existir)

---

*Documento criado retroativamente em 2026-05-13 após a revisão completa do sprint. Sirva como histórico arqueológico e onboarding pra próximos devs no projeto.*
