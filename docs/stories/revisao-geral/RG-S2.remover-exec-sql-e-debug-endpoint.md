---
Prioridade: Critical
Sprint: 1 - Seguranca
Assignee: "@dev"
Revisao: "@qa"
Status: Ready for Dev
Epic: "Revisao Geral — Auditoria Completa"
Fase: "1 - Seguranca & Estabilidade"
Esforco: LOW
---

# Story RG-S2 — Remover exec_sql RPC e Debug Endpoint

## Story

**Como** engenheiro de seguranca,
**Quero** remover o endpoint de debug e auditar a funcao `exec_sql` no banco,
**Para que** nao existam vetores de execucao de SQL arbitrario ou exposicao de dados em producao.

## Contexto

### Problema 1: Debug endpoint em producao

`/api/debug/stores-diagnostic` expoe dados de TODAS as stores via admin client (bypass RLS). O proprio arquivo diz "TEMPORARY... DELETE THIS FILE after debugging." A unica protecao e `supabase.auth.getUser()` — qualquer usuario autenticado (incluindo portal users) pode acessar.

**Dados expostos:** org_id, client_id, org memberships de TODAS as stores do sistema.

### Problema 2: exec_sql RPC

`/api/setup/database` usa `supabase.rpc('exec_sql', { sql: ... })` com SQL strings. A existencia da funcao `exec_sql` no banco e um vetor de risco — se nao tiver check de role adequado, qualquer usuario pode executar SQL.

## Acceptance Criteria

### AC1: Deletar debug endpoint
- [ ] Deletar arquivo `src/app/api/debug/stores-diagnostic/route.ts`
- [ ] Verificar se ha outros endpoints de debug em producao (grep por `/api/debug/`)

### AC2: Deletar setup/database e dropar exec_sql
- [ ] DELETAR `src/app/api/setup/database/route.ts` (endpoint de setup one-time, nao necessario em producao)
- [ ] Se necessario em desenvolvimento local, proteger com `if (process.env.NODE_ENV === 'production') return 403`
- [ ] Verificar se a funcao `exec_sql` existe no banco Supabase — se sim, dropar via migration
- [ ] Atualizar `.env.example` removendo referencias a setup endpoints

### AC3: Cleanup
- [ ] Verificar que nenhuma rota ou script referencia os arquivos deletados
- [ ] Grep por `setup/database` e `stores-diagnostic` no frontend

## Arquivos Afetados

- `src/app/api/debug/stores-diagnostic/route.ts` — DELETAR
- `src/app/api/setup/database/route.ts` — DELETAR (decisao firme pos-review)
