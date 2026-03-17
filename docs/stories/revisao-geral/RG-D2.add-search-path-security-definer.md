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

30+ funcoes usam `SECURITY DEFINER` sem `SET search_path`. Isso permite que um atacante que consiga criar objetos em um schema anterior no `search_path` possa "shadow" tabelas como `profiles`, `org_members`, `clients`, etc. — hijackando os checks de RLS.

Essas funcoes sao a FUNDACAO de todo o controle de acesso do sistema.

### Funcoes afetadas — RLS Helpers (ja listadas)

- `is_admin()`, `is_org_member()`, `is_org_owner()` (ambas versoes)
- `current_org_member_id()`, `current_org_id()`
- `has_feature(TEXT)`, `can_access_store(UUID)`, `can_access_client(UUID)`
- `can_manage_store_onboarding(UUID)`, `can_manage_store_campaigns(UUID)`
- `accessible_store_ids()`, `accessible_client_ids()`
- `fn_auto_assign_store_access_on_store_insert()`, `fn_auto_assign_store_access_on_member_insert()`

### Funcoes afetadas — Trigger/Utility (adicionadas pos-review)

- `handle_new_user()` (`00001_initial_schema.sql`)
- `handle_new_user_skip_portal()` (`20260312_fix_handle_new_user_skip_portal.sql`)
- `auto_assign_default_features()` (`20250126_01_auto_assign_features.sql`)
- `init_pipeline_for_org()`, `clone_pipeline_stages()` (`00002_pipeline_enhancements.sql`)
- `sync_email_to_auth()` (`20260228_epic9_email_sync_trigger.sql`)
- `update_coo_features()` (`20260301_add_coo_role.sql`)
- `copy_pipeline_with_stages()` (`20260226_04_copy_pipeline.sql`)
- `ensure_board_config_presets()` (`20260226_03_board_config_presets.sql`)
- `delete_auth_user_by_email()` (`20260226_05_delete_auth_user_by_email.sql`)
- `update_store_alerts_updated_at()` (`20260223_store_alerts.sql`)

## Acceptance Criteria

### AC1: Migration
- [ ] Criar migration `YYYYMMDD_add_search_path_to_security_definer.sql`
- [ ] Para CADA funcao listada: `CREATE OR REPLACE FUNCTION ... SECURITY DEFINER SET search_path = public`
- [ ] **CRITICO**: Trigger functions (handle_new_user, fn_auto_assign_*, etc.) NAO devem ser marcadas `STABLE` — preservar a volatility original (VOLATILE para triggers que fazem writes)
- [ ] Apenas funcoes pure-read (is_admin, can_access_store, etc.) podem ter `STABLE`
- [ ] Manter a logica da funcao identica — apenas adicionar `SET search_path`
- [ ] Considerar `SET search_path = public, auth` para funcoes que usam `auth.uid()` (qualificado, mas por seguranca)

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

Todas as funcoes em `20250125_05_rls_helpers.sql`, `20260304_fix_is_org_owner_isolation.sql`, `20260317_01_enforce_explicit_store_access.sql`, e as trigger/utility functions listadas acima precisam ser atualizadas.

**Funcoes que JA tem `SET search_path`** (nao precisam de fix): rate limiting functions (`002_rate_limiting_v2.sql`), Klaviyo metric triggers (`20250125_10_klaviyo_metrics.sql`), cooldown functions (`20260301_live_fetch_cooldowns.sql`).

**Verificacao pos-migration**: `SELECT proname, proconfig FROM pg_proc WHERE prosecdef AND pronamespace = 'public'::regnamespace AND (proconfig IS NULL OR NOT proconfig @> ARRAY['search_path=public']);`
