---
Prioridade: Critical
Sprint: 1 - Seguranca
Assignee: "@dev"
Revisao: "@data-engineer, @qa"
Status: Ready for Dev
Epic: "Revisao Geral — Auditoria Completa"
Fase: "1 - Seguranca & Estabilidade"
Esforco: LOW
---

# Story RG-D2 — Adicionar SET search_path em SECURITY DEFINER Functions

## Story

**Como** engenheiro de seguranca,
**Quero** que todas as funcoes `SECURITY DEFINER` tenham `SET search_path = public`,
**Para que** nao sejam vulneraveis a search path injection.

## Contexto

### Problema

Todas as 15+ funcoes RLS helper usam `SECURITY DEFINER` sem `SET search_path`. Isso permite que um atacante que consiga criar objetos em um schema anterior no `search_path` possa "shadow" tabelas como `profiles`, `org_members`, `clients`, etc. — hijackando os checks de RLS.

Essas funcoes sao a FUNDACAO de todo o controle de acesso do sistema.

### Funcoes afetadas

- `is_admin()`
- `is_org_member()`
- `is_org_owner()` (ambas versoes)
- `current_org_member_id()`
- `current_org_id()`
- `has_feature(TEXT)`
- `can_access_store(UUID)`
- `can_access_client(UUID)`
- `can_manage_store_onboarding(UUID)`
- `can_manage_store_campaigns(UUID)`
- `accessible_store_ids()`
- `accessible_client_ids()`
- `fn_auto_assign_store_access_on_store_insert()`
- `fn_auto_assign_store_access_on_member_insert()`

## Acceptance Criteria

### AC1: Migration
- [ ] Criar migration `YYYYMMDD_add_search_path_to_security_definer.sql`
- [ ] Para CADA funcao listada: `CREATE OR REPLACE FUNCTION ... SECURITY DEFINER STABLE SET search_path = public`
- [ ] Manter a logica da funcao identica — apenas adicionar `SET search_path`

### AC2: Verificacao
- [ ] Nenhuma funcao `SECURITY DEFINER` sem `SET search_path` apos a migration
- [ ] Testar que funcoes continuam funcionando normalmente apos a mudanca

## Notas Tecnicas

Exemplo de fix:
```sql
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;
```

Todas as funcoes em `20250125_05_rls_helpers.sql`, `20260304_fix_is_org_owner_isolation.sql` e `20260317_01_enforce_explicit_store_access.sql` precisam ser atualizadas.
