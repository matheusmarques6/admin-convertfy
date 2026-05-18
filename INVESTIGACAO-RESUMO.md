# Investigação · Estado Atual do Repo

**Branch:** `claude/resume-previous-session-UvATK` (clean, sem alterações pendentes)
**Data:** 2026-05-18
**Foco:** Validar premissas do prompt "Enriquecimento do painel + Onboarding completo + Detalhe da Loja"

---

## 1. Stack confirmado

| Dependência | Versão | Esperado | Status |
|---|---|---|---|
| next | **15.5.14** | 14.x | ⚠️ Diferente (mas compatível) |
| typescript | ^5 | ✓ | OK |
| tailwindcss | ^3.4.1 | ✓ | OK |
| @supabase/supabase-js | ^2.87.1 | ✓ | OK |
| **@anthropic-ai/sdk** | **^0.95.1** | (instalar) | ✅ JÁ INSTALADO |
| react-hook-form | ^7.68.0 | ✓ | OK |
| zod | ^4.1.13 | ✓ | OK |
| swr | ^2.4.0 | ✓ | OK |
| @hello-pangea/dnd | ^18.0.1 | – | drag-drop kanban |
| framer-motion | ^12.34.1 | – | animações |
| resend | ^6.9.3 | – | ✅ EMAIL JÁ CONFIGURADO |
| @upstash/redis | ^1.37.0 | – | rate limit |
| openai | ^6.22.0 | – | (também presente) |

**shadcn/ui**: 69 componentes em `src/components/ui/` (alert-dialog, dropdown-menu, popover, tabs, toast, tooltip, etc).

---

## 2. Documentação interna

| Arquivo | Tamanho | Função |
|---|---|---|
| `/CLAUDE.md` | ~1062 linhas | **SOURCE OF TRUTH** — APIs Shopify/Klaviyo/Omnisend, decisões CRM, onboarding v2 |
| `/AUDITORIA_PRE_IMPLEMENTACAO.md` | ~235 linhas | 8 bugs críticos corrigidos: `tasks.created_by` nullable, model `claude-sonnet-4-6`, race conditions |
| `/ARCHITECTURE.md` | – | Estrutura geral |
| `/README.md` | ~100 linhas | Desatualizado (confirmado) |

**Decisões documentadas:**
- **Onboarding v2 schema separado** (não merge com CRM)
- `deals.status='won'` → trigger gera `events.deal.won` → cron processa (event-driven, não inline)
- Briefing IA usa **Anthropic claude-sonnet-4-6** com fallback n8n webhook
- Versionamento preview↔cliente via `onboarding_versions` (semver + feedback_severity)
- RLS habilitado em todas as 6 tabelas novas (org-based)
- Legado `client_onboardings` ainda existe, leituras redirecionadas via adapters

---

## 3. Schema Supabase real (vs prompt)

**181 migrations totais.** Migration principal: `20260513015053_onboarding_v2_schema.sql`.

### Tabelas reais (que o prompt assumia que não existiam)

| Prompt esperava | Reality |
|---|---|
| `onboarding_stages` | ❌ NÃO EXISTE — usa `operational_pipeline_columns` |
| `task_templates` | ❌ NÃO EXISTE — templates em **JSONB** dentro de `operational_pipeline_columns.tasks_template` |
| `subtask_templates` | ❌ NÃO EXISTE — hardcoded em TS (`SEED_COLUMNS`) |
| `stage_deliverables` | ❌ NÃO EXISTE — em `operational_pipeline_columns.deliverables_template` (JSONB) |
| `stage_automations` | ❌ NÃO EXISTE — em `operational_pipeline_columns.automation_rules` (JSONB) |
| `task_subtasks` | ❌ NÃO EXISTE separadamente |
| `task_deliverables` | ✅ EXISTE com schema rico (url/upload/select/numeric/textarea/date/checkbox) |
| `task_activity_log` | ❌ NÃO EXISTE — existe `task_comments`, sem timeline unificada |
| `onboardings.brand_brain` | ✅ EXISTE como `onboardings.briefing` (JSONB) |
| `onboardings.visual_assets` | ❌ NÃO EXISTE |
| `onboardings.language` | ✅ EXISTE |
| `onboardings.preview_version` | ✅ EXISTE como `onboarding_versions` (tabela) |

### Schema atual `operational_pipeline_columns` (a tabela que cumpre papel de "stages"):

```sql
operational_pipeline_columns (
  id uuid PRIMARY KEY,
  pipeline_id uuid REFERENCES operational_pipelines,
  position int,
  name text,                          -- "Entrada", "Cliente preenchendo", etc
  responsible_role text,              -- 'cs' | 'cliente' | 'designer' | 'estrategista' | 'ops' | 'sistema'
  sla_days int,
  tasks_template jsonb,               -- array de templates de task com sub-itens
  deliverables_template jsonb,        -- entregáveis esperados
  automation_rules jsonb,             -- triggers ENTRY/ADVANCE/REMINDER/LOOP_BACK
  checklist_template jsonb,
  whatsapp_message_template text,
  ...
)
```

**Já tem 7 colunas seedadas via migration `20260513015243`**: entrada, cliente_formulario, preview_producao, briefing_ajustes, emails_finais, go_live, sucesso.

### Enums já criados:

```
operational_pipeline_type: onboarding | acompanhamento | feedback | suporte
onboarding_payment_status, onboarding_contract_status, onboarding_status
briefing_status: not_started | form_partially_filled | generating | generated_pending_review | approved | needs_review
deliverable_field_type: url | upload | select | numeric | textarea | date | checkbox | multi_checkbox
feedback_severity: small | medium | rework_part | rework_all
version_status: in_progress | approved | rejected_by_client
```

---

## 4. Componente do painel de task (CRÍTICO)

**Caminho:** `src/components/productivity/task-detail-drawer.tsx`
**Tipo:** Fullscreen drawer (100vh) com backdrop escuro
**Acionado:** click em card de task na productivity board OU em "Detalhes" em qualquer kanban

### Blocos JÁ EXISTENTES no drawer:

1. **Header sticky** (close, título+ID, status dropdown, ações primárias)
2. **KPI Strip** (status, prioridade P1/P2/P3/P4 colorida, responsável, cliente, data, estimativa, time tracking play/pause)
3. **Descrição** (markdown + edit inline)
4. **Entregáveis** (form fields + briefing status + URL) — schema rico já
5. **Checklist** (com avatares, data, drag-drop reorder)
6. **Anexos & Links** (file upload drop zone, link externo, download)
7. **Comentários** (feed + input)
8. **Action Bar sticky bottom** (Escalar, Solicitar revisão, Salvar rascunho, Marcar concluído)

**Comportamento onboarding-aware:** se `source_type='onboarding'`, mostra breadcrumb e dispara `POST /api/onboardings/[id]/advance` quando checklist 100%.

---

## 5. API routes existentes

**Onboardings:** `GET/POST /api/onboardings`, `GET/PATCH /api/onboardings/[id]`, `POST /api/onboardings/[id]/advance`, `POST /api/onboardings/[id]/go-back`, `POST /api/onboardings/[id]/request-briefing-revision`, `GET /api/onboardings/lookups`

**Forms públicos:** `POST /forms/[token]/submit-data`, `GET /forms/[token]/briefing-status`, `POST /forms/[token]/confirm-briefing`

**Tasks:** `GET/POST /api/tasks`, `GET/PATCH /api/tasks/[id]`, `POST /api/tasks/[id]/complete`, `POST /api/tasks/[id]/deliverables`, `PATCH /api/tasks/[id]/deliverables/[id]`

**Cron:** `/api/cron/process-deal-won` (1min), `/api/cron/onboarding-sla-check` (09h UTC)

**Admin:** `POST /api/admin/migrate-legacy-onboardings` (idempotente)

**AI:** `POST /api/ai/chat` (Anthropic direto), `POST /api/ai/templates`

---

## 6. Services existentes

**36 services totais.** Os relevantes:

- `onboarding-pipeline.service.ts` — createOnboarding, **advanceColumn (TS, não SQL function)**, goBackToColumn, confirmBriefing, instantiateTaskForColumn
- `onboarding-bootstrap.service.ts` — ensureOnboardingBootstrap + SEED_COLUMNS (hardcoded)
- `briefing-generation.service.ts` — **generateBriefing (n8n webhook + Claude fallback) ✅ JÁ FUNCIONA**
- `onboarding-whatsapp.service.ts` — sendColumnWhatsApp
- `onboarding-notifications.service.ts` — notifyColumnChange, notifyBriefingReady, notifyStuck
- `deal-won-watcher.service.ts` — processDealWonEvents
- `legacy-onboarding-migration.service.ts` — migrateLegacyOnboardings
- `crm-ai-action.service.ts` — automações IA do CRM

---

## 7. CRM existente (Fases 1-7 completas)

**Não é tema do prompt mas afeta arquitetura.** O CRM nativo (não Pipedrive/Hubspot) tem:
- Kanban visual `/admin/crm/pipelines/[id]` com drag-drop
- Drawer detalhe deal
- DAG automations (9 node types)
- WhatsApp Cloud API (v20.0)
- BI snapshots (cron 06h UTC)
- Health score (cron 05h UTC)
- Inbox unificado

**Design tokens dedicados:** `src/styles/crm-tokens.css` (prefix `--crm-*`, brand `#1F1F1F`, border-radius 4-6px).

---

## 8. Detalhe da Loja atual

**Caminho:** `src/app/admin/stores/[id]/page.tsx`
**Componente:** `StoreDetailTabsV2`

**Tabs EXISTENTES:** Dados, Financeiro, Contrato, Reuniões, Relatórios

**Tabs do prompt que FALTAM:** Onboarding, Acompanhamento, Calls, Solicitações

---

## 9. Storage

Buckets: `avatars`, `onboarding-deliverables`. RLS habilitado.

---

## 10. GAPS REAIS desta sprint (após cruzar prompt × realidade)

### Bloco "9 enriquecimentos do painel da task" — **maior parte já existe**

| Bloco do prompt | Status real |
|---|---|
| Sidebar interna 3 grupos (Contexto/Execução/Acompanhamento) | ❌ **NÃO EXISTE** |
| Bloco Identidade da loja (grid 3x2) | ⚠️ Dados existem em outras telas, não no drawer |
| Bloco Brand Brain lilás 2x2 | ⚠️ `briefing` existe, renderizado de outra forma |
| Bloco Assets visuais (paleta/logos/fonte/top produtos) | ❌ **NÃO EXISTE estruturado** |
| Bloco Critérios de aceitação | ❌ **NÃO EXISTE** |
| Bloco Sub-tasks checklist | ✅ existe (checklist atual) |
| Bloco Sugestões IA (3 variações UI) | ⚠️ Logic existe, UI 3-cards não |
| Bloco Upload entregável drop zone | ✅ existe (task_deliverables) |
| Bloco Timeline comentários + sistema | ⚠️ `task_comments` existe, **timeline com eventos sistema NÃO** |
| Bloco Anotações pessoais (private_notes) | ⚠️ Existe em productivity-task, não em onboardings |
| Action bar reorganizada | ✅ existe |

### Schema/migrations do prompt vs reality

**O prompt assume schema "normalizado" (tabelas separadas) que NÃO existe** — a reality usa **JSONB inline** dentro de `operational_pipeline_columns`. Criar as tabelas do prompt do zero **vai duplicar e conflitar** com:
- `operational_pipeline_columns.tasks_template` (= `task_templates`)
- `operational_pipeline_columns.checklist_template` (= `subtask_templates`)
- `operational_pipeline_columns.deliverables_template` (= `stage_deliverables`)
- `operational_pipeline_columns.automation_rules` (= `stage_automations`)

### Automações do prompt

- ✅ Trigger `deal.won` → onboarding (existe via `events` + cron, não trigger inline)
- ❌ Função SQL `check_stage_advance` (existe como TS `advanceColumn`)
- ❌ Cron reminder Etapa 2 (24h sem progresso)
- ⚠️ Loop Etapa 4→3 (`goBackToColumn` existe manual, sem versionamento auto)
- ⚠️ Email Etapa 7 (Resend instalado, fluxo específico não criado)
- ✅ Brand Brain via Anthropic (já funciona)

### Detalhe da Loja

- ❌ Tab Onboarding (mostrar kanban/status da entity)
- ❌ Tab Acompanhamento (weekly review, health, notes)
- ❌ Tab Calls (calendar integration)
- ❌ Tab Solicitações (feature requests backlog)

---

## 11. CONFLITOS QUE EXIGEM DECISÃO

### Conflito 1 — Schema do prompt vs Onboarding v2 existente

**O prompt quer:** criar tabelas normalizadas (`onboarding_stages`, `task_templates`, `subtask_templates`, `stage_deliverables`, `stage_automations`, `task_subtasks`, `task_activity_log`).

**Reality:** já existe Onboarding v2 com **JSONB inline** em `operational_pipeline_columns`. Seed das 7 etapas já foi feito.

**Implicação:** seguir o prompt literalmente vai **DUPLICAR o schema** e desativar o Onboarding v2 que está em produção. Vai quebrar:
- Trigger `deal.won` que insere em `operational_pipelines`
- `onboarding-pipeline.service.ts`
- `briefing-generation.service.ts`
- Public forms `/forms/[token]/*`
- Migration de legados

**Opções:**
- **A) Manter Onboarding v2 (recomendado)**: adicionar SÓ os gaps reais (sidebar interna, assets, critérios, timeline, etc) sem mexer no schema.
- **B) Migrar para schema do prompt**: refazer tudo. Risco alto, ~2 semanas.
- **C) Híbrido**: criar `task_activity_log` separado e adicionar coluna `visual_assets` em `onboardings` — sem desfazer o resto.

### Conflito 2 — "7 etapas seedadas" do prompt vs já seedadas

**Reality:** as 7 colunas já estão seedadas (migration `20260513015243`). Templates de tasks/checklists/deliverables em JSONB.

**Implicação:** se rodar o seed do prompt vai duplicar. Precisa **comparar** os dois seeds e ver se títulos/SLAs/owners batem.

### Conflito 3 — "Detalhe da Loja" — design file novo vs tela atual

**Reality:** `StoreDetailTabsV2` tem Dados/Financeiro/Contrato/Reuniões/Relatórios. Recentemente teve commit "Move Top 5 produtos para Lista & engajamento" (`0e6df9e`).

**Implicação:** integrar as 4 tabs novas (Onboarding/Acompanhamento/Calls/Solicitações) sem quebrar as 5 existentes. **Preciso baixar o design file pra ver se o layout pretendido bate.**

---

## 12. Pendência crítica não-relacionada

**Omnisend Apr 2026 split (Blue Wolf)** — último push (`9d4abd6`) adicionou `force_refresh=true` no resync. **Pendente verificação pós-deploy.** Esperado: Automation $25.5k → $26.2k matching dashboard.

---

## 13. Plano de execução proposto (ordem por valor + risco)

### Tier A — Quick wins sem risco (1-2 dias cada)

1. **Adicionar coluna `visual_assets` (jsonb) em `onboardings`** — migration mínima
2. **Bloco Identidade da Loja no drawer** — usa dados já existentes, só renderizar
3. **Bloco Brand Brain (visual lilás 2x2)** — `briefing` já tem dados, só formatação
4. **Bloco Critérios de aceitação** — adicionar `acceptance_criteria text[]` em `tasks` + UI
5. **Verificar fix Omnisend $25.5k→$26.2k** após deploy
6. **Anotações pessoais** — `private_notes text` em `onboardings` + textarea auto-save

### Tier B — UI enriquecida (3-5 dias)

7. **Sidebar interna 3 grupos no drawer** — reorganização visual, navegação por bloco
8. **Bloco Assets visuais** — paleta/logos/fonte/top 5 produtos com upload via Storage
9. **Bloco Sugestões IA — UI 3 variações** — endpoint `ai-suggestions` já existe ou adaptar
10. **Bloco Timeline unificada** — criar `task_activity_log` + triggers + UI

### Tier C — Backend/automações (4-7 dias)

11. **Cron reminder Etapa 2** — 24h sem progresso → cria task pro CS
12. **Loop Etapa 4→3 automático** com `preview_version += 1` e tasks de revisão
13. **Email automático Etapa 7** via Resend (já configurado)
14. **`check_stage_advance` mais robusto** — verificação atomic em SQL function

### Tier D — Tela Detalhe da Loja (3-5 dias, depende de design file)

15. **Baixar design file** `Detalhe+da+Loja.html` e ler README
16. **Adicionar tab Onboarding** — mostra status atual + checklist
17. **Adicionar tab Acompanhamento** — weekly review, health
18. **Adicionar tab Calls** — calendar integration (Google Calendar já integrado)
19. **Adicionar tab Solicitações** — backlog client_requests

### Tier E — Funcionalidades novas (semanas)

20. **Pipeline Acompanhamento Semanal** (kanban 4 etapas)
21. **Ritual Sexta** (modal diagnóstico + Fathom + IA chat)
22. **CRM Ryan** (kanban 6 colunas, pipeline call mensal, calendário)

---

## 14. Perguntas decisão para o usuário

### Bloqueadoras (sem isso eu não posso avançar)

**Q1.** Qual abordagem para schema?
- **A** Manter Onboarding v2 + adicionar só o que falta (recomendado)
- **B** Migrar tudo pro schema "normalizado" do prompt (risco alto)
- **C** Híbrido — criar `task_activity_log` separado, adicionar `visual_assets`, mas manter resto

**Q2.** Verificou se o fix Omnisend deploy ($25.5k→$26.2k) bateu? Continuo pendente nesse antes de avançar?

**Q3.** Sobre o seed das 7 etapas — os templates atuais em JSONB cobrem o que o prompt lista (ex.: Etapa 5 com 4 tasks de email finais)? Ou faltam etapas? Se faltar, faço UPSERT incremental, não recriar.

### Priorização (escolher o que entregar primeiro — uma resposta basta)

**Q4.** Por onde começo?
- **i** Tier A (quick wins UI) — 5 itens, ~2-3 dias
- **ii** Tier A + B (enriquecimento completo do drawer) — ~5-7 dias
- **iii** Tier D primeiro (Detalhe da Loja com 4 tabs novas) — depende de design file
- **iv** Tudo Tier A→D em sequência (~3-4 semanas reais)
- **v** Outro caminho que você definir

### Não-bloqueadoras (afinamento)

**Q5.** O design file `https://api.anthropic.com/v1/design/h/ba_sITTFT9PMeSFJY4x1kw` — você tem acesso a download local ou quer que eu tente o fetch? (Eu não consigo fazer requisições à internet com URLs arbitrárias.)

**Q6.** Existe Resend configurado com domínio verificado para emails Etapa 7? Posso disparar do email_sender atual ou precisa nova config?

---

## 15. Riscos

- **R1** Seed duplicado nas 7 etapas se eu não cruzar templates atuais antes
- **R2** Refactor de `task-detail-drawer.tsx` pode quebrar productivity board e onboarding-detail-client
- **R3** Adicionar sidebar de navegação no drawer muda layout — outros usos (CRM tasks) podem precisar adaptar
- **R4** Design file pode pedir tabs novas com schema que conflita com o existente
- **R5** Pipeline Acompanhamento + Ritual Sexta + CRM Ryan são features ENORMES — cada uma é sprint própria

---

**Próximo passo:** aguardando tuas respostas Q1-Q4 antes de implementar qualquer linha. Não vou desfazer trabalho existente sem confirmação explícita.
