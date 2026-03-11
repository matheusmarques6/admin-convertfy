# Epic 34 — Dashboard & Onboarding Bug Fixes

## Resumo

Conjunto de bug fixes identificados durante triage de logs de producao de 2026-03-11. Corrige query quebrada no BoardPage (coluna inexistente), ambiguidade de FK em queries PostgREST (org_members->profiles), payload de webhook de onboarding nao parseado, e log noise de self-transition na state machine de fases.

## Escopo

| Story | Titulo | Prioridade | Esforco | Dependencia |
|-------|--------|------------|---------|-------------|
| 34.1 | Fix BoardPage tasks.org_id Query | Alta | Baixo | - |
| 34.2 | Fix Ambiguous FK org_members→profiles | Alta | Baixo | - |
| 34.3 | Parse briefing_generated Webhook String Payload | Baixa | Baixo | - |
| 34.4 | Guard Onboarding Phase Self-Transition | Baixa | Baixo | - |

## Dependencias

```
34.1, 34.2, 34.3, 34.4 — todas independentes entre si
```

## Arquivos Principais

- `src/app/(dashboard)/board/page.tsx` — BoardPage tasks query (34.1 + 34.2)
- `src/app/api/campaigns/tasks/route.ts` — CampaignTasks query (34.2)
- `src/app/api/meetings/route.ts` — Meetings GET/POST query (34.2)
- `src/app/api/meetings/[id]/route.ts` — Meeting GET/PUT query (34.2)
- `src/app/api/onboarding/webhook/route.ts` — Webhook handler (34.3)
- `src/app/api/public/onboarding-form/route.ts` — Public form submission (34.4)
- `src/app/api/portal/stores/onboarding/route.ts` — Portal form submission (34.4)

## Contexto de Producao

Evidencias coletadas dos logs de producao (2026-03-11):
- **BoardPage**: Postgres error 42703 — column `tasks.org_id` does not exist
- **CampaignTasks + Meetings**: PostgREST PGRST201 — ambiguous FK `org_members` → `profiles` (2 FKs: `profile_id` e `invited_by`)
- **Webhook briefing_generated**: `body.data` chega como JSON string em vez de objeto parsed, cai no fallback `raw_text`
- **Onboarding form resubmit**: Warning "Invalid transition: pending_approval → pending_approval" polui logs
