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

# Story RG-D1 — Fix USING(true) em 6 Tabelas (Cross-Tenant Data Leak)

## Story

**Como** engenheiro de seguranca,
**Quero** substituir todas as policies `USING(true)` por policies com escopo de org,
**Para que** usuarios autenticados nao possam acessar dados de outras organizacoes.

## Contexto

### Problema

6 tabelas tem RLS policies `FOR ALL TO authenticated USING(true)`, significando que QUALQUER usuario autenticado (incluindo portal users) pode ler, inserir, atualizar e deletar TODOS os registros dessas tabelas, sem restricao de organizacao.

### Tabelas afetadas

| Tabela | Migration | Tem store_id? | Tem org_id? |
|--------|-----------|---------------|-------------|
| `store_onboarding_data` | `20260220_store_onboarding_system.sql:44` | SIM | NAO |
| `store_briefings` | `20260220_store_onboarding_system.sql:45` | SIM | NAO |
| `store_alerts` | `20260223_store_alerts.sql:39` | SIM | SIM |
| `onboarding_approvals` | `20260225_onboarding_flow_redesign.sql:84` | SIM (via store) | NAO |
| `onboarding_phase_transitions` | `20260225_onboarding_flow_redesign.sql:87` | SIM (via store) | NAO |
| `meeting_participants` | `20260223_fix_meeting_participants_schema.sql:91-100` | NAO (via meeting→client) | NAO |

### Padrao de fix

Seguir o padrao de `20260304_fix_rls_legacy_klaviyo_tables.sql`:
- Dropar policies `USING(true)`
- Criar novas policies usando `can_access_store(store_id)` para tabelas com `store_id`
- Para `meeting_participants`, usar JOIN com `meetings.client_id` via `can_access_client()`

## Acceptance Criteria

### AC1: Migration para fix de RLS
- [ ] Criar migration `YYYYMMDD_fix_using_true_6_tables.sql`
- [ ] Para cada tabela: DROP a policy existente, CREATE nova policy com escopo correto
- [ ] `store_onboarding_data`: `USING(can_access_store(store_id))`
- [ ] `store_briefings`: `USING(can_access_store(store_id))`
- [ ] `store_alerts`: `USING(can_access_store(store_id))` (ja tem org_id, bonus)
- [ ] `onboarding_approvals`: `USING(can_access_store(store_id))`
- [ ] `onboarding_phase_transitions`: `USING(can_access_store(store_id))`
- [ ] `meeting_participants`: Policy via subquery em meetings → `can_access_client(client_id)`

### AC2: Rollback script
- [ ] Criar rollback script na pasta `supabase/rollbacks/`

### AC3: Testar isolamento
- [ ] Verificar que usuario de Org A NAO ve dados de Org B
- [ ] Verificar que admin ainda ve dados da propria org
- [ ] Verificar que portal user so ve dados do proprio cliente

## Notas Tecnicas

- `can_access_store()` ja faz check de org membership — funciona para admin, owner, e agents
- Para tabelas sem `store_id` direto (meeting_participants), usar subquery:
  ```sql
  USING (EXISTS (
    SELECT 1 FROM meetings m
    WHERE m.id = meeting_participants.meeting_id
    AND can_access_client(m.client_id)
  ))
  ```
