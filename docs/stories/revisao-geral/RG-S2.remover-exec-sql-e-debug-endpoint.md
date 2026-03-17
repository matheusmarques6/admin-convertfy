---
Prioridade: Critical
Sprint: 1 - Seguranca
Assignee: "@dev"
Revisao: "@qa"
Status: Ready for Review
Epic: "Revisao Geral — Auditoria Completa"
Fase: "1 - Seguranca & Estabilidade"
Esforco: LOW
Batch: 1 (paralelo com S1, S6)
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

`/api/setup/database` usa `supabase.rpc('exec_sql', { sql: ... })` com SQL strings hardcoded. O endpoint TEM `requireRole(supabase, ["admin"])` e rate limiting, entao a protecao e melhor que o debug endpoint. Porem, a existencia da funcao `exec_sql` no banco e um vetor de risco se chamada fora deste endpoint.

**Nota pos-review:** O `exec_sql` NAO foi encontrado em nenhuma migration no repositorio — pode ter sido criado manualmente no banco. Verificar existencia em producao com `SELECT proname, prosecdef FROM pg_proc WHERE proname = 'exec_sql'`.

## Acceptance Criteria

### AC1: Deletar debug endpoint
- [x] Deletar arquivo `src/app/api/debug/stores-diagnostic/route.ts`
- [x] Verificar se ha outros endpoints de debug em producao (grep por `/api/debug/`) — nenhum outro encontrado

### AC2: Deletar setup/database e dropar exec_sql
- [x] DELETAR `src/app/api/setup/database/route.ts` (endpoint de setup one-time, nao necessario em producao)
- [ ] Verificar se a funcao `exec_sql` existe no banco Supabase — se sim, dropar via migration (TAREFA OPERACIONAL — executar manualmente no banco):
  ```sql
  DROP FUNCTION IF EXISTS public.exec_sql(text);
  DROP FUNCTION IF EXISTS public.exec_sql(sql text);
  ```
- [x] Atualizar `.env.example` removendo referencias a setup endpoints — nenhuma referencia encontrada no .env.example

### AC3: Cleanup de referencias
- [x] **CRITICO:** Remover referencia em `src/components/clients/client-stores.tsx:234` que faz `fetch("/api/setup/database")` — removido funcao `checkDatabaseStatus()`, botao "Verificar BD" e import `Database` do lucide-react
- [x] Grep por `setup/database` e `stores-diagnostic` em todo o codebase — zero referencias restantes
- [x] Verificar que nenhuma rota ou script referencia os arquivos deletados — confirmado

## Arquivos Afetados

- `src/app/api/debug/stores-diagnostic/route.ts` — DELETAR
- `src/app/api/setup/database/route.ts` — DELETAR
- `src/components/clients/client-stores.tsx` — REMOVER referencia ao setup/database (linha 234)
- Migration SQL — DROP FUNCTION exec_sql (se existir no banco)

## Review Consolidado (2026-03-17)

### QA (Quinn)
- **Vulnerabilidade:** CONFIRMADA.
  - Debug endpoint: CRITICAL (leak cross-tenant, qualquer autenticado acessa)
  - Setup/database: MEDIUM (tem requireRole, SQL hardcoded — risco e a funcao exec_sql no banco)
- **Preocupacao:** Antes de deletar setup/database, confirmar que as tabelas que ele cria ja existem em producao.

### DBM
- **Impacto DB:** CRITICAL.
  - Se `exec_sql` existe no banco e e `SECURITY DEFINER`, e vetor de SQL injection completo.
  - Migration de DROP deve ser criada e aplicada ANTES do deploy do codigo.
  - Verificar com: `SELECT proname, prosecdef FROM pg_proc WHERE proname = 'exec_sql' AND pronamespace = 'public'::regnamespace`

### Arquiteto (Aria)
- **Aprovar com adicao:** `client-stores.tsx:234` referencia o endpoint — DEVE ser incluido no AC3.
- **Executar ANTES das stories de DB** (RG-D1/D2) para evitar que alguma dependa de exec_sql.

### Dev (Dex)
- **Pronto para implementar.** Deletar 2 arquivos + limpar 1 referencia + 1 migration condicional.
- **Sem side effects** desde que a referencia em client-stores.tsx seja removida.
