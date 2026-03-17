---
Prioridade: Medium
Sprint: 3 - Refatoracao
Assignee: "@dev"
Revisao: "@architect"
Status: Ready for Dev
Epic: "Revisao Geral — Auditoria Completa"
Fase: "3 - Refatoracao & Tech Debt"
Esforco: LOW
---

# Story RG-A3 — Eliminar resolveOrgId Duplicados + Padronizar Responses

## Story

**Como** desenvolvedor,
**Quero** que `resolveOrgId` tenha uma unica implementacao e que responses sigam um formato consistente,
**Para que** mudancas futuras nao precisem ser replicadas em 5+ locais.

## Contexto

### Problema 1: resolveOrgId duplicado

Versao centralizada existe em `src/lib/api/resolve-org.ts`, mas ha ~5 copias inline em routes:
- `campaigns/route.ts`
- `client-reports/route.ts`
- `clients/search/route.ts`
- `tasks/[id]/route.ts`
- Outras

Copias usam assinaturas diferentes (algumas `supabase`, outras `adminClient`). A versao centralizada faz `order("created_at")` e logging, copias nao.

### Problema 2: Response format misto

- 230 ocorrencias de `NextResponse.json` (sem CORS, formato ad-hoc)
- 220 ocorrencias de `successResponse` (com CORS, formato `{success: true}`)

## Acceptance Criteria

### AC1: Eliminar copias de resolveOrgId
- [ ] Atualizar `resolveOrgId` para aceitar `SupabaseClient` generico como param
- [ ] Substituir todas as copias inline pela versao centralizada
- [ ] Se RG-A1 (AuthContext) ja estiver implementada, usar `ctx.resolveOrgId()` em vez disso

### AC2: Criar helpers de response para cron/webhook
- [ ] Criar `cronResponse()` para cron routes (sem CORS, formato simples)
- [ ] Criar `webhookResponse()` para webhook routes
- [ ] Documentar: quando usar `successResponse` vs `cronResponse` vs `webhookResponse`

### AC3: Migracao gradual
- [ ] NAO migrar todas as 230 rotas de uma vez
- [ ] Migrar novas rotas e rotas tocadas em outros PRs para o padrao correto

## Arquivos Afetados

- `src/lib/api/resolve-org.ts` — refatorar para aceitar client generico
- `src/lib/api/errors.ts` — adicionar `cronResponse`, `webhookResponse`
- 5+ routes com resolveOrgId inline
