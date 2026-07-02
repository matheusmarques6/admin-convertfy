# Mapeamento de Código Morto e Legado — Julho 2026

> **Objetivo:** inventário completo do que NÃO é usado no codebase — arquivos, rotas de
> API, dependências, áreas legadas — classificado por nível de confiança, para executar
> a limpeza em lotes seguros. **Nada foi removido ainda**; este é o mapa.
>
> **Metodologia:** knip 5.41 (análise estática de imports) com verificação manual
> anti-falso-positivo dos 125 apontamentos + auditoria de consumidores das 468 rotas de
> API + investigação dirigida de áreas legadas + depcheck com verificação por grep.
> Data-base: 2026-07-02, branch `claude/resume-previous-session-UvATK`.

## Números gerais

| Categoria | Quantidade | Confiança |
|---|---|---|
| Arquivos mortos confirmados (componentes/hooks/libs/types) | **114** | Alta (verificados 1 a 1) |
| Rotas de API órfãs prováveis | **52** (de 468) | Média-alta (ver subclasses) |
| Dependências removíveis do package.json | **7** | Alta |
| Exports não usados dentro de arquivos vivos | 231 | knip (2ª onda) |
| Tipos exportados não usados | 555 | knip (2ª onda) |
| Bugs/links quebrados achados de brinde | 3 | Confirmados |

---

# CAMADA 1 — Arquivos mortos (114) · REMOÇÃO SEGURA em lotes

Todos verificados individualmente (imports estáticos, dinâmicos, lazy, strings e
homônimos checados). **Remover cada cluster inteiro de uma vez** — são grupos que só se
importam entre si; remover metade faz o knip apontar o resto.

## Cluster A — Dashboard antigo do admin (18 arquivos, último commit ~2026-05-06)
Substituído por `dashboard-layout.tsx` + `dashboard-alerts-card.tsx` + `financial-charts.tsx`.
`src/components/dashboard/`: alerts, board-preview, commemorative-dates-card,
dashboard-charts, metrics, onboarding-preview, quick-actions, recent-activity,
revenue-comparison-chart, revenue-goal-card, task-list-board, today-agenda,
top-stores-card, week-calendar-preview, worst-performers-card,
dashboard-quick-sections, dashboard-top-clients, stores-list-modal (.tsx).

## Cluster B — Detalhe de loja v1 + "link de loja" (18 arquivos, mar–mai 2026)
Substituído por `src/components/stores/v2/` + `integrations-panel.tsx`.
`src/components/stores/`: store-detail-tabs, store-performance-kpis,
store-performance-tables, store-control-panel, store-alerts-panel, store-alerts-tab,
store-tracking-tab, store-utm-tab, integration-card, weekly-report-link,
quick-store-form, store-link-actions, store-link-badge, store-link-modal,
store-transfer-action, store-unlinked-banner, store-unlink-dialog (.tsx) +
`v2/tab-onboarding-pipeline.tsx`.

## Cluster C — Campanhas/calendário antigos (11 arquivos, mar–mai 2026)
Substituído por `src/components/campaign-central/` (o `campaign-detail-modal` vivo é o
de campaign-central — homônimo).
`src/components/campaigns/`: campaign-batch-modal, campaign-calendar-card,
campaign-day-list-modal, campaign-detail-modal, campaign-filter-bar,
campaign-stats-bar, campaigns-list-view (.tsx);
`src/components/calendar/`: calendar-day-cell, calendar-grid, calendar-navigation (.tsx);
`src/app/admin/campaigns/calendar-grid.tsx`.

## Cluster D — Onboarding v1 (7 arquivos, mar 2026)
Substituído por `src/components/onboarding-v2/`. **Manter** da pasta v1: `stepper.tsx`
e `store-onboarding-form.tsx` (usados pelo `/cliente/onboarding` e `store-form-tab`).
`src/components/onboarding/`: onboarding-tabs, onboarding-kanban,
onboarding-steps-kanban, onboarding-step-card, onboarding-approvals,
store-briefing-view, store-onboarding-card (.tsx).
⚠️ `store-briefing-view.tsx` teve commit em 2026-06-12 — double-check antes.

## Cluster E — Clients/reports antigos (10 arquivos)
Substituídos por `clients-content.tsx` e `reports/tab-reports.tsx`.
`src/components/clients/`: client-actions, clients-filters, clients-table,
recovery-analysis, client-reports, store-email-performance-report (.tsx);
`src/components/reports/`: report-history-list, report-history-card, reports-list,
report-generation-banner (.tsx). (`report-generation-banner-helpers.ts` está VIVO —
usado por teste.)

## Cluster F — Team (4 arquivos) ⚠️ commits recentes (2026-06-24)
A página viva `admin/settings/team/page.tsx` reimplementa tudo inline.
`src/components/team/`: index.ts, team-table.tsx, team-member-dialog.tsx,
agent-board-config.tsx. Double-check humano antes (commits recentes podem ser refactor
em massa, mas confirmar).

## Cluster G — Types duplicados (10 arquivos, fev–mai 2026)
Duplicados no monólito `src/types/index.ts`; ninguém importa os arquivos individuais.
`src/types/`: activity, automation, contract, financial, integration, meeting,
pipeline, portal, profile, settings (.ts).
⚠️ CLAUDE.md aponta `src/types/profile.ts` como canônico (Story AE-8) — **atualizar o
CLAUDE.md ao remover**.

## Cluster H — Permissions/hooks/libs órfãos (16 arquivos)
- `src/lib/permissions/index.ts` + `hooks.tsx` (substituídos por
  `src/lib/hooks/use-permissions.tsx` + `src/components/permission-gate.tsx`;
  `role-access.ts` e `onboarding-stage-access.ts` estão VIVOS)
- `src/lib/services/briefing.service.ts` (→ `briefing-generation.service.ts`),
  `omnisend-health.service.ts` (live-fetch removido em favor do cron)
- `src/lib/integrations/klaviyo-sync.ts` (→ `lib/services/klaviyo-sync.service.ts`),
  `src/lib/events/index.ts` (barrel), `src/lib/agents/schemas/copy-output.schema.ts`,
  `src/lib/translations/tracking.ts`, `src/lib/utils/campaign-status.ts`
- `src/hooks/`: index.ts (barrel), use-async, use-local-storage, use-alert-banner,
  use-realtime-onboarding (.ts)
- `src/lib/hooks/`: use-animated-counter, use-dialog-state, use-table-state,
  use-store-performance (.ts)

## Cluster I — UI primitives órfãos (6 arquivos)
`src/components/ui/`: accordion, ambient-background, collapsible, filter-bar,
glow-card, progress-bar (.tsx). Remover junto com as deps radix correspondentes
(accordion, collapsible — ver Camada 4).

## Cluster J — Avulsos (11 arquivos)
`src/app/client/(portal)/dashboard/meetings-section.tsx` (⚠️ órfão criado HOJE no
refactor de perf — substituído por next-meeting-card), `src/components/board/index.ts`
(barrel), `crm/import-csv-dialog.tsx`, `cs-crm/cs-page-header.tsx`, `cs-crm/cs-states.tsx`,
`layout/header.tsx`, `layout/notification-bell.tsx`, `meetings/meeting-invite-actions.tsx`,
`onboarding-v2/my-tasks-client.tsx`, `pipeline/pipeline-header.tsx`,
`portal/theme-toggle.tsx`, `productivity/unified-tasks-widget.tsx`.

## NÃO remover (falsos positivos / casos especiais)
- `.claude/hooks/synapse-engine.js` — registrado em `.claude/settings.local.json`
- `.claude/hooks/precompact-session-digest.js` — pode estar em settings global do dev
- `scripts/seed-campaign-central.mjs`, `test-cross-tenant-isolation.mjs`,
  `test-revenue-consistency.mjs`, `validate-revenue-deployment.mjs`,
  `spike-image-multimodal.mjs` — utilitários operacionais documentados em stories
- `scripts/encrypt-existing-credentials.mjs` — one-shot já executado (arquivável)
- `public/convertfy-design-system (1).jsx`, `convertfy-design-system.jsx`,
  `convertfy-todas-telas.jsx` — dumps de design em public/; mover para docs/ ou apagar

---

# CAMADA 2 — Áreas legadas (decisão de produto antes de remover)

| Item | Estado | Ação recomendada |
|---|---|---|
| `/cliente/onboarding` (form público v1) | ATIVO mas sobrepõe onboarding-v2 (`/form/[token]`); link gerado por `store-form-tab.tsx` | Decidir: consolidar no v2 e aposentar |
| **Link quebrado** `/cliente/${storeId}` | `stores/v2/tab-setup.tsx:60` e `tab-performance.tsx:369` montam URL para rota inexistente (404) | **Corrigir já** (bug em produção) |
| `src/app/report/` (relatório fullscreen) | Rota sem nenhum consumidor localizado; substituída por admin/reports + report-jobs | Confirmar em analytics/logs de prod → remover |
| `check-permission.ts` (`requireFeature`) | @deprecated; restam só **3 consumidores** (client-subscriptions, client-charges, client-reports) | Migrar os 3 para `requireRole` e deletar |
| Status LEGACY `in_progress/approved/live` | Ainda validados/computados em `api/admin/email-flows/[flowId]/*` (enums Zod + rollup) | Migrar quando o pipeline AE substituir os endpoints |
| `email_reference_templates` global + `DEFAULT_BLUEPRINTS` | Fallback-only do pipeline per-store; CRUD vivo em admin/email-blueprints e admin/outlines | Manter enquanto for fallback; reavaliar cobertura per-store |
| `useClientsStore` (zustand) | 0 consumidores | Remover (com `ClientsState`) |
| `legacy-onboarding-migration.service` + `/api/admin/migrate-legacy-onboardings` | Migração one-shot | Confirmar que rodou em prod → remover |
| `/form/[token]/briefing` (stub de redirect) | Legado intencional (links antigos circulando) | Manter por ora |
| `/form/[token]` vs `/forms/[slug]` | **NÃO são duplicados** — onboarding vs CRM leads | Manter ambos |
| Redirects do next.config | Defensivos; nenhum código usa paths antigos | Manter |

---

# CAMADA 3 — Rotas de API órfãs (52 de 468)

## 3a. Debug/dev scaffolding — remoção segura (12 rotas)
`/api/debug/omnisend-discovery` · `/api/debug/stores-diagnostic` ·
`/api/dev/omnisend-discovery-r7` a `-r11` (5 rotas) · `/api/integrations/klaviyo/debug` ·
`/api/integrations/klaviyo/debug-agg` · `/api/integrations/klaviyo/metrics` ·
`/api/integrations/tracking/test` · `/api/tracking/debug-live`

## 3b. Utilitários manuais (curl) — confirmar com o time antes (8 rotas)
`/api/admin/crm-renewal/detect-now` · `/api/admin/email/test` ·
`/api/admin/encrypt-credentials` · `/api/admin/migrate-legacy-onboardings` ·
`/api/admin/reapply-prefill` · `/api/admin/ritual/pre-process` ·
`/api/onboarding/[id]/seed-tasks` · `/api/setup/database`

## 3c. Órfãs prováveis — features desconectadas ou substituídas (32 rotas)
Destaques (lista completa no relatório do agente):
- `/api/portal-users`, `/api/portal-users/me`, `/api/portal-users/reset-password`
  (substituídas por `/api/admin/portal-users/*`)
- `/api/acompanhamento/pipeline/[stateId]` + `/generate-message` + `/send-whatsapp`
- `/api/crm/ai-actions` + `/[id]` · `/api/crm/stores/[id]/nps`
- `/api/cs-crm/cadences` · `/api/cs-crm/calls-pipeline`
- `/api/admin/agents/prompts/[id]` + `/rollback` · `/api/admin/email-agent-configs/[id]`
- `/api/admin/stores/[id]/{briefing/confirm, events, generate-flow, health-history, test-generate}`
  ⚠️ **events e health-history acabaram de ganhar consumidor** — o overview agregado
  (fase 2.4) consulta essas tabelas direto; as ROTAS individuais ficaram órfãs
- `/api/admin/campaign-central/production` (coleção) + `/suggestions/[id]/start-design`
- `/api/admin/email-generation-runs/[id]` · `/api/admin/features` · `/api/admin/organizations`
- `/api/financial/refunds` (plural; o singular `/refund` é usado)
- `/api/integrations/google/calendar/sync` · `/api/onboarding/[id]/edit` ·
  `/api/onboarding/templates` · `/api/portal/tracking/config` ·
  `/api/portal/tracking/stores` · `/api/portal/stores/[id]/utm-templates` ·
  `/api/tasks/reorder`

## 3d. Incertas — verificar via UI/logs antes (3)
`/api/operational-pipelines` (coleção; padrão bootstrap) ·
`/api/admin/campaign-central/production` · `/api/portal/tracking/{config,stores}`

## 3e. NUNCA remover por "falta de referência interna" (consumo externo)
~20 crons (vercel.json) · 12 webhooks n8n · webhooks whatsapp/instagram/asaas/shopify ·
3 callbacks OAuth · endpoints lidos pelo n8n (`store-briefing`,
`email-reference-templates`, `campaign-central/stores/[id]/context`) ·
widget público de tracking (`script/widget.js`, `tracking/config`).

**Recomendação pós-limpeza:** antes de deletar rotas 3b/3c, adicionar log temporário
(`withTiming` já loga hits) e observar 2–4 semanas de produção para pegar consumidores
não mapeados (Postman de alguém, automação externa).

---

# CAMADA 4 — Dependências (package.json)

## Remover (7)
| Pacote | Motivo |
|---|---|
| `langchain` | 0 imports (só os scoped são usados) |
| `@langchain/openai` | 0 imports |
| `@fontsource-variable/inter` | Fonte servida via `next/font/local` |
| `@radix-ui/react-accordion` | Só usado pelo `ui/accordion.tsx` morto |
| `@radix-ui/react-collapsible` | Só usado pelo `ui/collapsible.tsx` morto |
| `@vitejs/plugin-react` (dev) | vitest não a usa (0 testes .tsx) |
| — `eslint-config-next` (dev) | **FALSO POSITIVO do knip — manter** (eslint.config.mjs usa via compat) |

## Adicionar/corrigir
- **`dotenv` (devDependency)** — 4 scripts estão QUEBRADOS hoje
  (`seed-campaign-central`, `test-cross-tenant-isolation`, `test-revenue-consistency`,
  `validate-revenue-deployment` importam dotenv que não está instalado). Alternativa:
  migrar para `node --env-file` (nativo Node 20+).
- ⚠️ Ao mexer em deps: atualizar **pnpm-lock.yaml** (`npx pnpm@10 install
  --lockfile-only`) — a Vercel usa pnpm com frozen-lockfile.

## Manter (verificadas como usadas)
xlsx, jszip, @hello-pangea/dnd, reactflow, react-phone-number-input,
libphonenumber-js, vaul, cmdk, resend, html2pdf.js (import dinâmico),
@langchain/anthropic, @langchain/core, tailwindcss-animate, postcss.

---

# CAMADA 5 — Exports e tipos não usados (2ª onda, granular)

knip aponta **231 exports** e **555 tipos exportados** sem uso dentro de arquivos vivos.
Não vale caçar 1 a 1 agora; concentrações (limpar quando tocar no arquivo):
`src/lib/utils.ts` (9), `productivity/ds-atoms.tsx` (8),
`validations/campaign-central.ts` (7), `services/omnisend-sync.service.ts` (7),
`lib/routes.ts` (7), `services/diagnostic/index.ts` (6), `ui/dropdown-menu.tsx` (6).
Relatório completo: knip (rodar `npx knip` com o pacote instalado via `--no-save`).

---

# Bugs e inconsistências achados durante o mapeamento

1. **Link quebrado em produção**: `stores/v2/tab-setup.tsx:60` e
   `tab-performance.tsx:369` geram link `/cliente/${storeId}` → rota não existe (404).
2. **4 scripts quebrados**: importam `dotenv` ausente (ERR_MODULE_NOT_FOUND).
3. **Docs desatualizadas**: CLAUDE.md aponta `src/types/profile.ts` como canônico
   (morto); `docs/architecture/design-system.md:22` menciona @fontsource (não usado).

---

# Plano de limpeza recomendado (em lotes, cada um com typecheck+build+smoke+deploy)

| Lote | Conteúdo | Risco |
|---|---|---|
| 0 | Corrigir o link quebrado `/cliente/${storeId}` + dotenv dos scripts | Nenhum (são fixes) |
| 1 | Clusters A–E + H–J (arquivos 100% verificados) + deps órfãs + pnpm-lock | Baixo |
| 2 | Cluster F (team) e G (types) após double-check + atualizar CLAUDE.md | Baixo-médio |
| 3 | Rotas debug/dev (3a) | Baixo |
| 4 | `useClientsStore`, `/app/report`, migração dos 3 endpoints do check-permission | Baixo-médio |
| 5 | Rotas 3b/3c após 2–4 semanas de observação de logs | Médio |
| 6 | Decisões de produto: `/cliente/onboarding` vs v2, email templates fallback, status legacy | Requer decisão |
| 7 | Exports/tipos (Camada 5) — oportunista, ao tocar nos arquivos | Contínuo |

**Estimativa de impacto:** ~130+ arquivos e ~60 rotas a menos (≈20% do codebase de
componentes), bundle menor (radix órfãos saem), navegação no código muito mais clara.

*Gerado em 2026-07-02 por auditoria multi-agente (knip + 4 investigações paralelas).*
