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

### AC2: Auditar exec_sql
- [ ] Verificar se a funcao `exec_sql` existe no banco Supabase
- [ ] Se existir: verificar se tem `SECURITY DEFINER` com check de role admin
- [ ] Se nao tiver protecao adequada: dropar a funcao via migration
- [ ] Avaliar se `/api/setup/database` ainda e necessario — se nao, deletar

### AC3: Cleanup
- [ ] Verificar que nenhuma rota referencia os arquivos deletados

## Arquivos Afetados

- `src/app/api/debug/stores-diagnostic/route.ts` — DELETAR
- `src/app/api/setup/database/route.ts` — avaliar/deletar
