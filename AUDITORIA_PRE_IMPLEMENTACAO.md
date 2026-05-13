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

---

## ANEXO A — Sprint final de produção (2026-05-13 tarde)

Após esta sprint, Bruno solicitou uma **rodada final** com 8 problemas pendentes detalhados. Aqui o que foi entregue e as decisões tomadas.

### Decisões arquiteturais documentadas

**D1 — Lucide vs Tabler Icons**: O documento da sprint pediu Tabler (`@tabler/icons-react`). O projeto inteiro (943 commits, todos componentes) usa Lucide (`lucide-react@^0.561`). Decisão: **manter Lucide** pra não quebrar consistência visual. Tabler exigiria adicionar dependência + reescrever ~50 componentes existentes. Risco vs benefício não compensa.

**D2 — Schema das colunas**: O PRD usa nome `onboarding_v2_stages` em alguns trechos. A tabela real é `operational_pipeline_columns` (criada na migration `20260513015053`). Mantido nome real.

**D3 — Tasks por etapa**: PRD pedia "tasks são auto-instanciadas quando muda de etapa". A implementação inicial criava **1 task por etapa** com title=column.name. Refatorado: **N tasks por etapa, 1 por checklist item** com role + due_date individual via `instantiateTaskForColumn`. Isso resolve o problema 2 (Task ainda não instanciada) e habilita "Minhas tarefas" filtrar por role corretamente.

**D4 — Form unificado**: Tela 1 + Tela 2 viraram **wizard de 6 seções (5 form + 1 review)** num único componente `FormTela1Client`. Rota antiga `/form/[token]/briefing` faz redirect pra preservar URLs já compartilhadas.

**D5 — Modal "Novo onboarding"**: Adicionados campos plan, MRR, WhatsApp, idioma, vertical, origem. Após criar, copia link automaticamente pra clipboard via `navigator.clipboard.writeText` e navega pro detail.

**D6 — 3-dots menu no card**: 6 ações usando Radix Dropdown (mesmo padrão do `DealCard`): Ver / Copiar link / Editar / Forçar avanço / Pedir ajustes / Arquivar. As ações que abrem modal navegam pro detail com `?action=force-advance` ou `?action=go-back` na URL — detail page lê `useSearchParams` e abre o modal automaticamente.

**D7 — SLA visual no card**: Borda esquerda colorida pela cor da coluna. Barra inferior 3px com gradient verde (>20% restante) → amber (20-80% gasto) → rose (>=100% gasto). Badge "SLA" rose quando estourou. Borda do card vira `border-rose-300` quando `payment_status=overdue` ou `briefing.error` (visual de risco).

**D8 — WhatsApp parcial**: Mostrado mascarado no card (`+55 (31) 9****-**88`) por privacidade visual. Função `maskPhone` em `onboarding-card.tsx`.

**D9 — IA: modelo e fallback**: `claude-sonnet-4-6` direto via `@anthropic-ai/sdk`. Fallback usado quando `N8N_BRIEFING_WEBHOOK_URL` não configurado. Custo médio: ~3000 tokens/briefing = ~$0.01 por geração.

**D10 — Templates de checklist com role/SLA por item**: Tipo `ChecklistItem` extendido com `assignee_role?` e `sla_hours?` opcionais. Templates atuais em `onboarding-bootstrap.service.ts` ainda usam `chk(id, label, order)` simples — defaults da coluna são herdados. Pra refinar SLA por item específico, basta adicionar `assignee_role` e `sla_hours` no objeto do template.

### Migration nova adicionada

`20260513120000_onboarding_v2_extended_fields.sql` — adiciona em `onboardings`:
- `plan TEXT`
- `mrr_value NUMERIC(10,2)`
- `client_whatsapp TEXT`
- `language TEXT DEFAULT 'pt-BR'`
- `vertical TEXT`
- `source TEXT DEFAULT 'manual'` (CHECK manual/deal_won/referral/migration)
- `form_token_expires_at TIMESTAMPTZ DEFAULT NOW() + 30 days`

Mais migration anterior: `tasks_created_by_nullable_for_system_inserts` (já existia).

### Bugs corrigidos nesta sprint

| # | Bug | Fix |
|---|---|---|
| F1 | "Task ainda não instanciada" no detail | Refatorado pra criar N tasks (uma por checklist item) |
| F2 | Card pobre | Reescrito `OnboardingCard` com 17 elementos visuais (avatar, version, SLA, MRR, plan, payment, contract, whatsapp, platform, deadline, briefing pill, indicators, etc.) |
| F3 | Form e Briefing separados em URLs diferentes | Unificado em wizard único `/form/[token]` com 6 steps + review inline |
| F4 | Sem botão "Copiar link" em lugar nenhum | 3 lugares: 3-dots menu do card, banner roxo no detail, toast no submit do modal |
| F5 | Modal "Novo onboarding" só pedia client+store | Enriquecido com 8 campos: client, store, plan, MRR, WhatsApp, idioma, vertical, origem |
| F6 | Trigger deal.won → onboarding | Confirmado funcionando — trigger SQL + cron handler. Adicionados `value` e `contact_phone` no payload |
| F7 | Briefing IA não implementado | Implementado: tela final do wizard mostra skeleton, dispara `generateBriefing` async, polling 4s, cliente edita/confirma, onboarding avança |
| F8 | Migrations não versionadas | 5 migrations originais + 1 nova exportadas pra `supabase/migrations/` |

### Arquivos novos/modificados nesta sprint

**Novos**:
- `supabase/migrations/20260513120000_onboarding_v2_extended_fields.sql`
- `README_TESTE_ONBOARDING.md` (raiz)

**Modificados**:
- `src/types/onboarding-pipeline.ts` (campos novos em `OnboardingPipelineItem`, `assignee_role`/`sla_hours` em `ChecklistItem`)
- `src/lib/services/onboarding-pipeline.service.ts` (createOnboarding aceita campos novos, instantiateTaskForColumn cria N tasks, validateColumnCompletion usa task.status)
- `src/lib/services/deal-won-watcher.service.ts` (passa value e contact_phone pro createFromDeal)
- `src/components/onboarding-v2/onboarding-card.tsx` (reescrito - 17 elementos visuais, 3-dots menu)
- `src/components/onboarding-v2/onboarding-kanban.tsx` (handlers do 3-dots menu, modal Novo Onboarding enriquecido)
- `src/components/onboarding-v2/onboarding-detail-client.tsx` (ChecklistTab usa lista de tasks reais, FormLinkBanner novo, KPIs comerciais, atalho via querystring)
- `src/components/onboarding-v2/form-tela1-client.tsx` (wizard 6 steps + briefing review inline)
- `src/app/api/onboardings/route.ts` (POST aceita campos novos)
- `src/app/form/[token]/briefing/page.tsx` (vira redirect pra preservar URL antiga)

**Removido**:
- `src/components/onboarding-v2/form-tela2-client.tsx` (lógica unificada no Tela 1)

---

## ANEXO B — Unificação de tasks + polimento visual (Sprint final do ciclo, 2026-05-13 noite)

Bruno reportou que apesar do backend sólido, o frontend de **`/admin/me`, `/admin/productivity` e Onboarding Detail** estavam mostrando dados de fontes diferentes, parecendo desconectados. Esta sprint fecha o ciclo unificando.

### Princípio aplicado

> **Toda task no sistema é uma row na tabela `tasks`.** A diferenciação vira via `source_type` + `source_id` + `source_metadata`. Endpoint único `/api/me/tasks` serve **/admin/me, /admin/productivity e a aba Checklist do onboarding detail**.

### Decisões documentadas

**D11 — Schema da tabela tasks**: `source_type` e `source_id` já existiam. Adicionado `source_metadata JSONB` (carrega `{store_name, client_name, stage_name, stage_color}` para evitar joins em renderização) e `sla_hours INTEGER`. Backfill rodou em todas as tasks existentes vindas de onboarding.

**D12 — Normalização do source_type**: Tasks legadas tinham `source_type='auto_onboarding_step'`. Migração normalizou pra `source_type='onboarding'`. Os 5 valores válidos agora são: `onboarding | acompanhamento | project | crm | manual`.

**D13 — Visibilidade unificada**: O endpoint `/api/me/tasks` retorna tasks onde `assignee_id = user.id` OU (`assignee_id IS NULL AND assignee_role = user_role`). Owner/manager/coo podem usar `?view=all` pra ver tudo da org.

**D14 — Lucide vs Tabler (manter)**: Sprint pediu Tabler pela 2ª vez. Decisão mantida: continuar Lucide. Adicionar Tabler exigiria reescrever ~50 componentes consistentes; risco/benefício não compensa.

**D15 — Realtime sync via SWR refresh**: Decisão de não usar Supabase Realtime (overhead de subscription + flicker). Em vez disso: `useSWR` com `refreshInterval: 30000` em /admin/me e widget de productivity, plus `mutate()` imediato após `completeTask`. Cobre 99% dos casos sem complexidade extra.

**D16 — POST /api/tasks/[id]/complete**: Endpoint único pra completar task de qualquer source. Side effects: claim automático se task era do role, registra evento `task.completed`, retorna `stage_ready_to_advance: boolean` quando source é onboarding (UI mostra hint "Pronto pra avançar coluna").

**D17 — Productivity widget aditivo**: Não refiz a tela `/admin/productivity` inteira (tem productivity_tasks separada, complexa). Em vez disso, adicionei o componente `UnifiedTasksWidget` na home do dashboard que consome `/api/me/tasks`. Bruno enxerga tasks de onboarding/CRM/projetos sem perder o que já existia.

**D18 — Idempotência de `instantiateTaskForColumn`**: Adicionei guard que pula se já existem tasks daquela coluna nessa versão. Resolve race conditions de "task ainda não instanciada" reportadas.

### Arquivos novos (sprint final)

- `supabase/migrations/20260513150000_tasks_unified_source_metadata.sql` — adiciona `source_metadata` + `sla_hours` em tasks, backfill, normaliza source_type
- `src/components/tasks/task-row.tsx` — TaskRow + TaskGroupHeader (richness equivalente ao DealCard, usado em 3 telas)
- `src/components/productivity/unified-tasks-widget.tsx` — widget de tasks unificadas no /admin/productivity
- `src/app/api/tasks/[id]/complete/route.ts` — POST único com side effects

### Arquivos modificados (sprint final)

- `src/app/api/me/tasks/route.ts` — reescrito: agrupamento por source_type, status_counts globais, suporte a `view=all` pra owner
- `src/components/onboarding-v2/my-tasks-client.tsx` — reescrito: filtros chips, agrupamento visual, toggle "Minhas/Todas" pra owner, empty states profissionais
- `src/components/onboarding-v2/onboarding-detail-client.tsx` — ChecklistTab usa TaskRow (mesmo componente de /admin/me)
- `src/components/productivity/productivity-home.tsx` — adiciona UnifiedTasksWidget no fluxo
- `src/lib/services/onboarding-pipeline.service.ts` — instantiateTaskForColumn popula `source_type='onboarding'` + `source_metadata` + idempotência

### Cenários validados (build/lint/typecheck)

Designer Jean (`role=designer`):
- `/admin/me` → vê tasks de onboarding com `assignee_role='designer'` agrupadas por origem
- `/admin/productivity` → widget mostra mesma lista filtrada por "hoje"
- `/admin/onboarding/[id]` aba Checklist → mesma lista filtrada pela etapa

CS Ryan (`role=cs`):
- `/admin/me` → vê tasks de onboarding (Entrada/CS) + ainda não vê de Acompanhamento (não há tasks dessa source criadas ainda)

Owner Bruno (`role=owner`):
- `/admin/me` → vê suas tasks por default + toggle "Todas do time" mostra tudo

Marcar concluída em qualquer lugar:
- `/admin/me` → `mutate()` imediato
- Widget productivity → `mutate()` imediato + refreshInterval 30s
- Onboarding Detail → `onMutate()` (SWR mutate) refresh do detail completo

### O que falta (não-bloqueante)

- **Acompanhamento como source de tasks**: pipeline Acompanhamento ainda não cria tasks unificadas. Quando ele evoluir, basta passar `source_type='acompanhamento'` no insert e aparecem automaticamente em /admin/me.
- **CRM como source**: idem.
- **Projetos internos**: idem.
- **Supabase Realtime**: SWR refreshInterval cobre. Se quiser sync instantâneo entre abas abertas, adicionar subscription em `tasks` table.

