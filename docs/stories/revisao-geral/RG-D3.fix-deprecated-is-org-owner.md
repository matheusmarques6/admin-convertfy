---
Prioridade: High
Sprint: 1 - Seguranca
Assignee: "@dev"
Revisao: "@data-engineer, @qa"
Status: Ready for Dev
Epic: "Revisao Geral — Auditoria Completa"
Fase: "1 - Seguranca & Estabilidade"
Esforco: MEDIUM-HIGH
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
5. **~50+ RLS policies** em `_06_rls_policies.sql`, `_07_tasks.sql`, `_08_onboarding.sql`, `20260216_add_org_id_multitenant.sql` — referenciam `is_org_owner()` diretamente em USING/WITH CHECK clauses

**NOTA (pos-review):** O escopo original subestimava drasticamente o numero de usos. Verificar quais policies ja foram substituidas por migrations posteriores antes de listar as que faltam.

## Acceptance Criteria

### AC0: Grep exhaustivo (PRIMEIRO PASSO)
- [ ] Executar grep no banco e migrations para listar TODOS os usos de `is_org_owner()` sem parametro
- [ ] Identificar quais ja foram substituidos por migrations posteriores (ex: `20260317_01`)
- [ ] Produzir lista final de policies + funcoes que ainda referenciam a funcao deprecada

### AC1: Fix helper functions
- [ ] `has_feature()`: substituir `is_org_owner()` por `is_org_owner(current_org_id())`
  - **Nota**: se `current_org_id()` retornar null (user sem org), `has_feature()` retornara false — comportamento correto
- [ ] `can_manage_store_campaigns()`: substituir por `is_org_owner((SELECT org_id FROM client_stores WHERE id = p_store_id))`
- [ ] `can_manage_store_onboarding()`: idem

### AC2: Fix campaign_batches policy
- [ ] `campaign_batches` usa `store_ids UUID[]` (array) — fix via:
  ```sql
  USING (is_admin() OR EXISTS (
    SELECT 1 FROM unnest(store_ids) AS sid WHERE can_access_store(sid)
  ))
  ```
- [ ] Substituir a policy `FOR ALL` com `is_org_owner()` pelo padrao acima

### AC3: Fix remaining RLS policies
- [ ] Para cada policy identificada em AC0 que ainda usa `is_org_owner()`:
  - Substituir por `is_org_owner(org_id)` onde tabela tem `org_id`
  - Ou usar `can_access_store()`/`can_access_client()` onde aplicavel
- [ ] Se escopo for muito grande (>20 policies), dividir em sub-stories

### AC4: Dropar funcao deprecada
- [ ] **SOMENTE apos confirmar que ZERO policies/funcoes referenciam** `is_org_owner()` sem param
- [ ] `DROP FUNCTION IF EXISTS is_org_owner() CASCADE` — usar CASCADE com cuidado, verificar dependentes

## Arquivos Afetados

- `supabase/migrations/` — nova(s) migration(s)
- Funcoes: `has_feature`, `can_manage_store_campaigns`, `can_manage_store_onboarding`
- Policies em: `_06_rls_policies.sql`, `_07_tasks.sql`, `_08_onboarding.sql`, `_multitenant.sql`
- **Verificar pipeline/*.sql**: se esses arquivos sao aplicados em producao, tambem precisam de fix
