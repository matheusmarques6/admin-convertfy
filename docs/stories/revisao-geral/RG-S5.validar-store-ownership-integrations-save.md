---
Prioridade: High
Sprint: 1 - Seguranca
Assignee: "@dev"
Revisao: "@qa"
Status: Done (Fase 1 — Fase 2 pendente: OAuth callbacks + crons)
Epic: "Revisao Geral — Auditoria Completa"
Fase: "1 - Seguranca & Estabilidade"
Esforco: MEDIUM
Batch: 4 (apos S3/S7/S8 — mais complexo)
---

# Story RG-S5 — Validar Store Ownership em Integrations Save

## Story

**Como** engenheiro de seguranca,
**Quero** que o endpoint de salvar integracoes valide que o store_id pertence a org do usuario,
**Para que** um atacante nao possa sobrescrever credenciais de stores de outras orgs.

## Contexto

### Problema

`POST /api/integrations/save` recebe `store_id` do body (linha 60) e chama `updateStoreCredentials(store_id, ...)` sem verificar ownership. O `updateStoreCredentials` usa `adminClient` (bypass RLS) e faz `.eq("id", storeId)` sem filtro de org.

**Vetor de ataque:** Atacante autenticado em Org A envia `{ store_id: "uuid-de-org-B", shopify_access_token: "token-malicioso" }` e sobrescreve credenciais de qualquer store.

**Nota:** O caminho de integracoes org-level (linhas 83-120) JA usa `.eq("org_id", orgId)` corretamente. Apenas o caminho `store_id` e vulneravel.

### ERRATA (descoberta na review)

A story original dizia: "`updateStoreCredentials` JA aceita `orgId` como parametro opcional (linha 139)". **Isso esta INCORRETO.** A linha 139 com `orgId` opcional e em `getStoreCredentials`, NAO em `updateStoreCredentials`. A funcao de update atualmente NAO aceita `orgId` — precisa ser adicionado.

## Acceptance Criteria

### AC1: Validar ownership no integrations/save (Fase 1 — PRIORITARIA)
- [x] Antes de chamar `updateStoreCredentials`, verificar que `store_id` pertence a `orgId` do usuario
- [x] Passar `orgId` para `updateStoreCredentials` via options
- [x] Retornar 403 se store nao pertence a org

### AC2: Adicionar orgId em updateStoreCredentials
- [x] Adicionar `orgId` e `skipOrgCheck` ao options de `updateStoreCredentials`:
  ```typescript
  options?: {
    resetValidation?: boolean
    orgId?: string
    skipOrgCheck?: boolean
  }
  ```
- [x] Quando `orgId` presente e `skipOrgCheck` falso: adicionar `.eq("org_id", orgId)` na query
- [x] Verificar `count === 0` apos update para detectar store nao encontrada (403)

### AC3: Migrar callers (Fase 2)
- [x] `integrations/save/route.ts` — passar orgId (Fase 1)
- [x] `portal/integrations/route.ts` — tem orgId via portal auth
- [x] `portal/stores/route.ts` — tem orgId via portal auth
- [x] `portal/onboarding/wizard/route.ts` — tem orgId via portal auth
- [ ] `integrations/shopify/callback/route.ts` — **NAO tem orgId no state** — resolver via lookup do store ou adicionar orgId ao state
- [ ] `integrations/meta/callback/route.ts` — verificar state
- [ ] `integrations/google/callback/route.ts` — verificar state
- [ ] Cron jobs (`sync-reports`, etc.) — usar `skipOrgCheck: true`

### AC4: Mesma protecao em getMultipleStoreCredentials
- [x] `getMultipleStoreCredentials` tambem nao filtra por org — adicionar parametro orgId

## Arquivos Afetados

- `src/app/api/integrations/save/route.ts` — adicionar orgId check (Fase 1)
- `src/lib/services/credentials.service.ts` — adicionar orgId ao options de `updateStoreCredentials`
- `src/app/api/integrations/shopify/callback/route.ts` — resolver orgId do state (caso complicado)
- `src/app/api/integrations/meta/callback/route.ts` — verificar
- `src/app/api/integrations/google/callback/route.ts` — verificar
- `src/app/api/portal/integrations/route.ts` — passar orgId
- `src/app/api/portal/stores/route.ts` — passar orgId
- `src/app/api/portal/onboarding/wizard/route.ts` — passar orgId

## Estrategia de Implementacao (pos-review)

**Fase 1 (mitiga o vetor de ataque):**
1. Adicionar `orgId` ao options de `updateStoreCredentials`
2. Proteger `integrations/save/route.ts` (o endpoint vulneravel)
3. Callers que nao passam orgId continuam funcionando (orgId opcional)

**Fase 2 (hardening completo):**
1. Migrar todos os callers para passar orgId
2. Resolver caso do Shopify OAuth callback (lookup orgId do store ou adicionar ao state)
3. Considerar tornar orgId obrigatorio com `skipOrgCheck` explicito para crons

## Review Consolidado (2026-03-17)

### QA (Quinn)
- **Vulnerabilidade:** CONFIRMADA PARCIAL. orgId e resolvido em integrations/save mas nunca passado ao update.
- **Errata:** Story dizia que `updateStoreCredentials` ja aceita orgId — INCORRETO (e `getStoreCredentials` que aceita).
- **Preocupacao:** 10+ call sites de `updateStoreCredentials` — verificar cada um.

### DBM
- **Impacto DB:** HIGH. Credenciais cross-tenant em risco: `shopify_access_token`, `klaviyo_api_key`, `meta_access_token`, `ga4_credentials`, etc.
- **Migration:** NAO necessaria. Fix e puramente app-layer.
- **Recomendacao:** Considerar COMMENT ON nas colunas de credenciais alertando sobre necessidade de orgId.

### Arquiteto (Aria)
- **Aprovar com ressalvas.** Esforco real = MEDIUM (8+ callers), nao LOW como original.
- **Caso complicado:** Shopify OAuth callback nao tem orgId no state — precisa lookup do store ou alterar o state do OAuth flow.
- **Recomendacao:** Implementar em 2 fases. Fase 1 protege integrations/save (o vetor de ataque). Fase 2 migra demais callers.
- **Relacionada:** Story 51.2 planejava algo similar — verificar se ja houve progresso.

### Dev (Dex)
- **Pronto para Fase 1.** ~40 linhas para proteger integrations/save + alterar credentials.service.
- **Fase 2 precisa planejamento** — Shopify callback e o caso mais complexo.

## Implementacao — Fase 1 (2026-03-17)

**Commit:** `7f438c9` — pushed to main
**Arquivos modificados:**
- `src/lib/services/credentials.service.ts` — `updateStoreCredentials` aceita `orgId` + `skipOrgCheck`; `getMultipleStoreCredentials` aceita `orgId`
- `src/app/api/integrations/save/route.ts` — passa `{ orgId }` no update (fecha vetor de ataque principal)
- `src/app/api/portal/integrations/route.ts` — passa `orgId: store.org_id` nos 2 calls
- `src/app/api/portal/stores/route.ts` — passa `orgId: store.org_id` nos 2 calls + adicionou `org_id` ao SELECT de ownership
- `src/app/api/portal/onboarding/wizard/route.ts` — passa `orgId` nos steps `create_shopify_app` e `klaviyo_keys`

**O que foi feito:**
- `updateStoreCredentials`: quando `orgId` presente e `skipOrgCheck` falso, adiciona `.eq("org_id", orgId)` na query + `count: "exact"` para detectar zero-row (403)
- `getMultipleStoreCredentials`: filtra por `org_id` quando `orgId` fornecido
- Endpoint vulneravel `integrations/save` agora valida ownership antes de gravar credenciais
- 4 callers do portal migrados (todos que ja tinham orgId disponivel)
- TypeScript compila limpo

**Fase 2 pendente (story futura):**
- `integrations/shopify/callback/route.ts` — NAO tem orgId no OAuth state
- `integrations/meta/callback/route.ts` — NAO tem orgId no state
- `integrations/google/callback/route.ts` — NAO tem orgId no state
- Cron jobs — usar `skipOrgCheck: true`

**QA Gate:** PASS WITH CONCERNS — vetor principal fechado. OAuth callbacks (Fase 2) mitigados por HMAC + state cookie + code exchange mas precisam de follow-up.
