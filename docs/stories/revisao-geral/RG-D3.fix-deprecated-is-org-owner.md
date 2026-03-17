---
Prioridade: High
Sprint: 1 - Seguranca
Assignee: "@dev"
Revisao: "@data-engineer, @qa"
Status: Ready for Dev
Epic: "Revisao Geral — Auditoria Completa"
Fase: "1 - Seguranca & Estabilidade"
Esforco: MEDIUM
---

# Story RG-D3 — Fix is_org_owner() Deprecado em Policies e Helpers

## Story

**Como** engenheiro de seguranca,
**Quero** eliminar todos os usos da funcao `is_org_owner()` sem parametro,
**Para que** owners de uma org nao tenham poderes em todas as organizacoes.

## Contexto

### Problema

A funcao `is_org_owner()` (sem parametro) retorna TRUE se o usuario e owner de QUALQUER org. Ja foi marcada como deprecated em `20260304_fix_is_org_owner_isolation.sql`. Porem, ainda e usada em:

1. **`campaign_batches` policy** (`20250125_06_rls_policies.sql:230`) — owner de Org A pode gerenciar batches de Org B
2. **`has_feature()` helper** (`20250125_05_rls_helpers.sql:106-108`) — owner de Org A ganha ALL features de todas as orgs
3. **`can_manage_store_campaigns()`** — owner de Org A pode gerenciar campanhas de stores de Org B
4. **`can_manage_store_onboarding()`** — idem para onboarding

## Acceptance Criteria

### AC1: Fix has_feature()
- [ ] Substituir `is_org_owner()` por `is_org_owner(current_org_id())` dentro de `has_feature()`

### AC2: Fix can_manage_store_campaigns()
- [ ] Substituir `is_org_owner()` por versao com escopo de org (via store → org_id)

### AC3: Fix can_manage_store_onboarding()
- [ ] Substituir `is_org_owner()` por versao com escopo de org

### AC4: Fix campaign_batches policy
- [ ] `campaign_batches` nao tem `org_id` direto — avaliar: adicionar coluna `org_id` ou usar subquery via store
- [ ] Substituir `is_org_owner()` na policy por check com escopo

### AC5: Dropar funcao deprecada
- [ ] Apos remover todos os usos, dropar `is_org_owner()` (sem parametro) do banco

## Arquivos Afetados

- `supabase/migrations/` — nova migration para fix
- Funcoes no banco: `has_feature`, `can_manage_store_campaigns`, `can_manage_store_onboarding`
- Policy de `campaign_batches`
