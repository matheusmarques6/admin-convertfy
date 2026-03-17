---
Prioridade: High
Sprint: 1 - Seguranca
Assignee: "@dev"
Revisao: "@qa"
Status: Done
Epic: "Revisao Geral — Auditoria Completa"
Fase: "1 - Seguranca & Estabilidade"
Esforco: LOW
Batch: 1 (paralelo com S1, S2)
---

# Story RG-S6 — Adicionar requireRole no DELETE clients/manage

## Story

**Como** engenheiro de seguranca,
**Quero** que o endpoint DELETE de clientes exija role admin,
**Para que** usuarios nao-admin nao possam deletar clientes.

## Contexto

### Problema

`DELETE /api/clients/manage` so verifica `requireAuth(supabase)` — qualquer usuario autenticado pode deletar clientes. A unica protecao e RLS, que tem bypass policies (`USING(true)`) em varias tabelas.

### Impacto de CASCADE (descoberto na review)

A delecao de um client cascateia para **30+ tabelas**, incluindo:
- `client_stores` (credenciais encriptadas Shopify/Klaviyo/Meta/GA4)
- `client_portal_users` (contas de acesso portal)
- `client_subscriptions`, `client_charges` (dados financeiros)
- `client_reports` (relatorios)
- `contracts`, `deals`, `activities` (CRM)
- `client_onboardings`, `client_onboarding_steps`
- `store_feedback_controls`, `campaigns`, `store_alerts`
- `client_portal_activity`, `tasks`

**Uma unica delecao destroi TODOS os dados do cliente em 30+ tabelas.**

## Acceptance Criteria

### AC1: Adicionar role check
- [x] Trocar `await requireAuth(supabase)` por `await requireRole(supabase, ["admin"])` no handler DELETE
- [x] `requireRole` ja faz `requireAuth` internamente (linha 208 de errors.ts) — e drop-in replacement
- [x] Retornar 403 para usuarios nao-admin

### AC2: Auditar outros endpoints destrutivos
- [x] Verificar se outros endpoints DELETE/PATCH tem role checks adequados
- [x] Listar: `clients/manage`, `portal-users`, `contracts`, `invoices`, `meetings`
- [x] Endpoints ja com requireRole: `organizations`, `encrypt-credentials`, `email/test`, `portal-users/reset-password`, `campaigns/sync`, `campaigns/sync-all`
- [x] Endpoints suspeitos (apenas requireAuth): `client-stores/[id]`, `client-charges`, `client-subscriptions`

#### Audit Findings (Dev Agent)

**Endpoints with only `requireAuth` on DELETE (no role check):**

| Endpoint | Auth | Risk | Notes |
|----------|------|------|-------|
| `client-stores/[id]` | `requireAuth` + `requireStoreAccess(can_edit)` | MEDIUM | Has access control via `requireStoreAccess` but no admin role check |
| `client-charges` | `requireAuth` + `requireFeature(view_financial)` | LOW | Feature-gated but no role check |
| `client-subscriptions` | `requireAuth` + `requireFeature(view_financial)` | LOW | Feature-gated but no role check |
| `portal-users` | `requireAuth` only | HIGH | Any authenticated user can delete portal users |
| `automations/manage` | `requireAuth` only | MEDIUM | Any authenticated user can delete automations |
| `pipeline/deals` | `requireAuth` only | LOW | CRM data, RLS provides some protection |
| `pipeline/settings` | `requireAuth` only | MEDIUM | Can delete entire pipeline config |
| `pipeline/members` | `requireAuth` only | MEDIUM | Can remove pipeline members |
| `upload/store-files` | `requireAuth` only | LOW | File management |
| `upload/contracts` | `requireAuth` only | LOW | Contract file management |
| `integrations/save` | `requireAuth` only | MEDIUM | Can remove integrations |

**Recommendation:** `portal-users` DELETE is the highest risk (similar pattern to `clients/manage`). Consider creating a follow-up story to add `requireRole` there.

## Arquivos Afetados

- `src/app/api/clients/manage/route.ts` — DELETE handler (trocar 1 linha + atualizar import)

## Review Consolidado (2026-03-17)

### QA (Quinn)
- **Vulnerabilidade:** CONFIRMADA. Qualquer autenticado pode deletar clients.
- **Severidade:** HIGH — concordo. Agravado pelo CASCADE.
- **Preocupacao:** Verificar se `manager` deveria poder deletar tambem (em algumas orgs managers gerenciam ciclo de vida do cliente).

### DBM
- **Impacto DB:** HIGH. CASCADE em 30+ tabelas — operacao irreversivel.
- **Recomendacoes futuras (nao nesta story):**
  1. Tighten RLS DELETE policy na tabela `clients` para `is_admin() OR is_org_owner()`
  2. Considerar soft-delete (`deleted_at` column) em vez de hard delete
  3. Mecanismo de confirmacao (ex: exigir nome do cliente como parametro)

### Arquiteto (Aria)
- **Aprovar.** 1 linha de codigo. `requireRole` ja e padrao bem estabelecido (usado em 7+ endpoints).
- **AC2 pode gerar novas stories** se encontrar mais endpoints vulneraveis.

### Dev (Dex)
- **Pronto.** 3 linhas (import + replace). Zero risco de side effects.
- **Breaking change intencional:** usuarios nao-admin que deletavam clients receberao 403.

## Implementacao (2026-03-17)

**Commit:** `7f438c9` — pushed to main
**Arquivos modificados:**
- `src/app/api/clients/manage/route.ts` — DELETE handler: `requireAuth` → `requireRole(["admin"])`

**O que foi feito:**
- Trocado `await requireAuth(supabase)` por `await requireRole(supabase, ["admin"])` no DELETE handler
- Import atualizado para incluir `requireRole`
- Usuarios nao-admin agora recebem 403 ao tentar deletar clientes
- Auditoria AC2 completa: 11 endpoints com role checks insuficientes documentados (portal-users DELETE e o mais critico — recomendado follow-up story)
- TypeScript compila limpo

**QA Gate:** PASS — protecao contra delecao nao-autorizada com CASCADE em 30+ tabelas.
