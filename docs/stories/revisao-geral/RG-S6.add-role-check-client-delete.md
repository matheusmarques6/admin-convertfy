---
Prioridade: High
Sprint: 1 - Seguranca
Assignee: "@dev"
Revisao: "@qa"
Status: Ready for Dev
Epic: "Revisao Geral — Auditoria Completa"
Fase: "1 - Seguranca & Estabilidade"
Esforco: LOW
---

# Story RG-S6 — Adicionar requireRole no DELETE clients/manage

## Story

**Como** engenheiro de seguranca,
**Quero** que o endpoint DELETE de clientes exija role admin,
**Para que** usuarios nao-admin nao possam deletar clientes.

## Contexto

### Problema

`DELETE /api/clients/manage` so verifica `requireAuth(supabase)` — qualquer usuario autenticado pode deletar clientes. A unica protecao e RLS, que tem bypass policies (`USING(true)`) em varias tabelas.

## Acceptance Criteria

### AC1: Adicionar role check
- [ ] Adicionar `await requireRole(supabase, ["admin"])` no handler DELETE
- [ ] Retornar 403 para usuarios nao-admin

### AC2: Auditar outros endpoints destrutivos
- [ ] Verificar se outros endpoints DELETE/PATCH tem role checks adequados
- [ ] Listar: `clients/manage`, `portal-users`, `contracts`, `invoices`, `meetings`

## Arquivos Afetados

- `src/app/api/clients/manage/route.ts` — DELETE handler
