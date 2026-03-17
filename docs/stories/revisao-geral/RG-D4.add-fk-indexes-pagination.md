---
Prioridade: Medium
Sprint: 3 - Refatoracao
Assignee: "@dev"
Revisao: "@data-engineer"
Status: Ready for Dev
Epic: "Revisao Geral — Auditoria Completa"
Fase: "3 - Refatoracao & Tech Debt"
Esforco: LOW (D4a) + MEDIUM (D4b)
---

# Story RG-D4 — Adicionar Indexes nas FKs Faltando + Paginacao

## Story

**Como** engenheiro de performance,
**Quero** que todas as foreign keys tenham indexes e que list endpoints tenham paginacao,
**Para que** queries nao fiquem lentas com crescimento de dados.

## Contexto

### Problema 1: FKs sem index

Tabelas do schema inicial nao tem indexes nas colunas FK:

| Tabela | Coluna FK | Index? |
|--------|-----------|--------|
| `contracts` | `client_id` | NAO |
| `invoices` | `client_id` | NAO |
| `activities` | `client_id`, `deal_id` | NAO |
| `meetings` | `client_id`, `user_id` | NAO |
| `deals` | `pipeline_id`, `stage_id`, `client_id` | NAO |
| `pipeline_stages` | `pipeline_id` | NAO |
| `automation_rules` | `automation_id` | NAO |
| `client_onboardings` | `client_id`, `store_id` | NAO |

### Problema 2: Endpoints sem paginacao

- `GET /api/stores` — retorna TODAS as stores
- `GET /api/admin/organizations` — retorna TODAS as orgs
- `GET /api/admin/portal-users` — retorna TODOS os portal users

## Acceptance Criteria

### D4a: Migration para indexes (LOW effort, pode ser Sprint 2)
- [ ] Criar migration com `CREATE INDEX IF NOT EXISTS` para todas as FKs listadas
- [ ] **NAO usar `CONCURRENTLY`** — Supabase migrations rodam em transaction implicita, CONCURRENTLY nao e compativel
- [ ] Para tabelas pequenas (agency CRM), `CREATE INDEX` regular e seguro — lock sera de milissegundos
- [ ] Incluir `client_onboardings.client_id` e `client_onboardings.store_id`

### D4b: Paginacao em list endpoints (MEDIUM effort, requer coordenacao frontend)
- [ ] Adicionar `page` e `limit` params nos endpoints listados
- [ ] Default: `limit=50`, max: `200`
- [ ] Retornar total count no response para frontend paginar
- [ ] **BREAKING CHANGE**: frontend consumers que esperam lista completa precisam ser atualizados
- [ ] Coordenar com frontend antes de deploy

## Arquivos Afetados

**D4a (indexes)**:
- `supabase/migrations/` — nova migration

**D4b (paginacao)**:
- `src/app/api/stores/route.ts`
- `src/app/api/admin/organizations/route.ts`
- `src/app/api/admin/portal-users/route.ts`
- Frontend components que consomem esses endpoints
