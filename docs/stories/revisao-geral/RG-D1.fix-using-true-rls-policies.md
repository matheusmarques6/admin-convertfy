---
Prioridade: Critical
Sprint: 1 - Seguranca
Assignee: "@dev"
Revisao: "@data-engineer, @qa"
Status: Ready for Dev
Epic: "Revisao Geral — Auditoria Completa"
Fase: "1 - Seguranca & Estabilidade"
Esforco: MEDIUM
---

# Story RG-D1 — Fix USING(true) em 7 Tabelas (Cross-Tenant Data Leak)

## Story

**Como** engenheiro de seguranca,
**Quero** substituir todas as policies `USING(true)` por policies com escopo de org,
**Para que** usuarios autenticados nao possam acessar dados de outras organizacoes.

## Contexto

### Problema

7 tabelas tem RLS policies `FOR ALL TO authenticated USING(true)`, significando que QUALQUER usuario autenticado (incluindo portal users) pode ler, inserir, atualizar e deletar TODOS os registros dessas tabelas, sem restricao de organizacao.

### Tabelas afetadas

| Tabela | Migration | Tem store_id? | Tem org_id? | Path de acesso |
|--------|-----------|---------------|-------------|----------------|
| `store_onboarding_data` | `20260220_store_onboarding_system.sql:44` | SIM | SIM | `can_access_store(store_id)` |
| `store_briefings` | `20260220_store_onboarding_system.sql:45` | SIM | NAO | `can_access_store(store_id)` |
| `store_alerts` | `20260223_store_alerts.sql:39` | SIM | SIM | `can_access_store(store_id)` |
| `onboarding_approvals` | `20260225_onboarding_flow_redesign.sql:84` | NAO (via onboarding_id) | NAO | `onboarding_id → client_onboardings.client_id → can_access_client()` |
| `onboarding_phase_transitions` | `20260225_onboarding_flow_redesign.sql:87` | NAO (via onboarding_id) | NAO | `onboarding_id → client_onboardings.client_id → can_access_client()` |
| `meeting_participants` | `20260223_fix_meeting_participants_schema.sql:91-100` | NAO (via meeting→client) | NAO | `meeting_id → meetings.client_id → can_access_client()` |
| `store_revenue_summary` | `20260228_store_revenue_summary.sql:85` | SIM | SIM | `can_access_store(store_id)` — **contem dados financeiros** |

### Padrao de fix

Seguir o padrao de `20260304_fix_rls_legacy_klaviyo_tables.sql`:
- Dropar policies `USING(true)`
- Criar novas policies usando `can_access_store(store_id)` para tabelas com `store_id`
- Para `meeting_participants`, usar JOIN com `meetings.client_id` via `can_access_client()`

## Acceptance Criteria

### AC1: Migration para fix de RLS
- [ ] Criar migration `YYYYMMDD_fix_using_true_7_tables.sql`
- [ ] Para cada tabela: `DROP POLICY IF EXISTS` + `CREATE POLICY` (idempotente, sem locks)
- [ ] `store_onboarding_data`: `USING(can_access_store(store_id))`
- [ ] `store_briefings`: `USING(can_access_store(store_id))`
- [ ] `store_alerts`: `USING(can_access_store(store_id))`
- [ ] `store_revenue_summary`: `USING(can_access_store(store_id))` — **dados financeiros, prioridade**
- [ ] `onboarding_approvals`: subquery via `onboarding_id → client_onboardings.client_id → can_access_client()`
- [ ] `onboarding_phase_transitions`: mesma subquery via `onboarding_id → client_onboardings`
- [ ] `meeting_participants`: subquery via `meeting_id → meetings.client_id → can_access_client()`
- [ ] Considerar restringir DELETE a `is_admin()` em tabelas criticas (`store_alerts`, `store_revenue_summary`)

### AC2: Rollback script
- [ ] Criar rollback script na pasta `supabase/rollbacks/`

### AC3: Testar isolamento
- [ ] Verificar que usuario de Org A NAO ve dados de Org B
- [ ] Verificar que admin ainda ve dados da propria org
- [ ] Verificar que portal user so ve dados do proprio cliente

## Notas Tecnicas

- `can_access_store()` ja faz check de org membership — funciona para admin, owner, e agents
- **Portal users**: `can_access_store()` depende de `org_members`. Portal users NAO tem entrada em `org_members`. Verificar que rotas portal usam `adminClient` (service_role) para acessar essas tabelas — nao dependem de RLS.
- Para `onboarding_approvals` e `onboarding_phase_transitions` (sem store_id direto):
  ```sql
  USING (EXISTS (
    SELECT 1 FROM client_onboardings co
    WHERE co.id = onboarding_approvals.onboarding_id
    AND can_access_client(co.client_id)
  ))
  ```
- Para `meeting_participants`:
  ```sql
  USING (EXISTS (
    SELECT 1 FROM meetings m
    WHERE m.id = meeting_participants.meeting_id
    AND can_access_client(m.client_id)
  ))
  ```
- Adicionar index em `meeting_participants.meeting_id` se nao existir (performance da subquery)
- **Testar em Supabase branch database** antes de aplicar em producao — policies RLS incorretas podem bloquear acesso de todos os usuarios
