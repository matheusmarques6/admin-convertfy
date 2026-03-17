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

# Story RG-S5 — Validar Store Ownership em Integrations Save

## Story

**Como** engenheiro de seguranca,
**Quero** que o endpoint de salvar integracoes valide que o store_id pertence a org do usuario,
**Para que** um atacante nao possa sobrescrever credenciais de stores de outras orgs.

## Contexto

### Problema

`POST /api/integrations/save` recebe `store_id` do body e chama `updateStoreCredentials(store_id, ...)` sem verificar ownership. O `updateStoreCredentials` usa `adminClient` (bypass RLS) e faz `.eq("id", storeId)` sem filtro de org.

**Vetor de ataque:** Atacante autenticado em Org A envia `{ store_id: "uuid-de-org-B", shopify_access_token: "token-malicioso" }` e sobrescreve credenciais de qualquer store.

## Acceptance Criteria

### AC1: Validar ownership
- [ ] Antes de chamar `updateStoreCredentials`, verificar que `store_id` pertence a `orgId` do usuario
- [ ] Opcao A: Passar `orgId` para `updateStoreCredentials` e adicionar `.eq("org_id", orgId)` na query
- [ ] Opcao B: Fazer SELECT de verificacao antes do update
- [ ] Retornar 403 se store nao pertence a org

### AC2: Proteger updateStoreCredentials
- [ ] Adicionar parametro `orgId` obrigatorio em `updateStoreCredentials`
- [ ] Adicionar `.eq("org_id", orgId)` na query de update
- [ ] Atualizar todos os callers para passar orgId

### AC3: Mesma protecao em getMultipleStoreCredentials
- [ ] `getMultipleStoreCredentials` tambem nao filtra por org — adicionar parametro orgId

## Arquivos Afetados

- `src/app/api/integrations/save/route.ts` — adicionar check
- `src/lib/services/credentials.service.ts` — adicionar orgId param
