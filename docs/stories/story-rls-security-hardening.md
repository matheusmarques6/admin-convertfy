# Story: RLS Security Hardening & Multi-Tenant Store Access

**Status:** Ready for Development
**Priority:** P0 - Critical Security
**Estimated Effort:** ~8-10h

---

## Contexto

A auditoria de seguranca identificou problemas graves na integracao entre lojas, clientes e credenciais. O RLS do Supabase esta parcialmente implementado: as policies de `client_stores` estao corretas (`can_access_store(id)`) mas varias API routes usam `createAdminClient()` que bypassa completamente o RLS, sem validacao propria de org_id.

### Estado Atual do RLS (Validado)

**Policies ATIVAS em `client_stores`** (migration `20250215_fix_rls_using_true.sql`):
- SELECT: `is_admin() OR can_access_store(id)`
- UPDATE: `is_admin() OR can_access_store(id)`
- DELETE: `is_admin()`
- INSERT: `is_admin() OR client_id IS NULL OR can_access_client(client_id)`

**`can_access_store()`** (migration `20260226_02_rls_helpers_org_member_access.sql`):
- Admins: true
- Org owners: true
- Membros ativos da mesma org: true (nao precisa mais de `agent_store_access.can_view`)

**Conclusao:** Rotas que usam `createClient()` (user RLS) **JA estao protegidas**. O problema real sao rotas que usam `createAdminClient()` sem validar org_id.

---

## Acceptance Criteria

- [x] **AC1:** Endpoints publicos (`debug-agg`, `shopify/test`) requerem autenticacao
- [x] **AC2:** Helper `requireStoreAccess` centralizado e reutilizavel
- [x] **AC3:** Helper `resolveOrgId` centralizado (eliminar duplicatas)
- [x] **AC4:** Todas rotas de integracao Klaviyo/Shopify validam acesso a loja
- [x] **AC5:** `credentials.service.ts` aceita e valida `orgId` opcional
- [x] **AC6:** Rotas de listagem (`/api/stores`, `/api/stores/control`) adicionam filtro org_id como defense-in-depth
- [x] **AC7:** Rotas de mutacao (`PUT credentials`, `DELETE store`, `PATCH link`) validam org_id
- [x] **AC8:** Pagina "Ver Loja" valida que loja pertence a org do usuario
- [x] **AC9:** Policies RLS antigas/orfas sao limpas via migration SQL (pronta para executar)
- [x] **AC10:** Nenhuma regressao introduzida (typecheck passando)

---

## Plano de Execucao - Step by Step

### FASE 0: Hotfix Imediato (P0 - Incendio)
**Tempo: ~30min | Risco: Baixo**

#### Step 0.1: Adicionar auth em `debug-agg`
**Arquivo:** `src/app/api/integrations/klaviyo/debug-agg/route.ts`

```
ANTES: export async function GET(request: NextRequest) {
        const storeId = request.nextUrl.searchParams.get("store_id")
        ...

DEPOIS: export async function GET(request: NextRequest) {
         const supabase = await createClient()
         const { data: { user } } = await requireAuth(supabase)
         const storeId = request.nextUrl.searchParams.get("store_id")
         ...
```

#### Step 0.2: Adicionar auth em `shopify/test`
**Arquivo:** `src/app/api/integrations/shopify/test/route.ts`

```
ANTES: export async function POST(request: NextRequest) {
        const body = await request.json()
        ...

DEPOIS: export async function POST(request: NextRequest) {
         const supabase = await createClient()
         await requireAuth(supabase)
         const body = await request.json()
         ...
```

#### Step 0.3: Validar
- [ ] Testar `debug-agg` sem token -> deve retornar 401
- [ ] Testar `shopify/test` sem token -> deve retornar 401
- [ ] Testar ambos COM token -> devem funcionar normalmente

---

### FASE 1: Criar Helpers Centralizados (P1)
**Tempo: ~2h | Risco: Baixo (codigo novo, nao altera existente)**

#### Step 1.1: Centralizar `resolveOrgId`
**Arquivo NOVO:** `src/lib/api/resolve-org.ts`

```typescript
import { createAdminClient } from "@/lib/supabase/server"
import { AppError } from "./errors"

/**
 * Resolve org_id do usuario autenticado.
 * Busca em org_members onde profile_id = userId e is_active = true.
 * Lanca 403 se usuario nao pertence a nenhuma org.
 */
export async function resolveOrgId(userId: string): Promise<string> {
  const adminClient = createAdminClient()

  const { data: orgMember } = await adminClient
    .from("org_members")
    .select("org_id")
    .eq("profile_id", userId)
    .eq("is_active", true)
    .limit(1)
    .single()

  if (!orgMember?.org_id) {
    throw new AppError("Acesso negado - usuario sem organizacao", 403)
  }

  return orgMember.org_id
}
```

#### Step 1.2: Criar `requireStoreAccess`
**Arquivo NOVO:** `src/lib/api/require-store-access.ts`

```typescript
import { createAdminClient } from "@/lib/supabase/server"
import { AppError, ForbiddenError } from "./errors"

interface StoreAccessResult {
  storeId: string
  orgId: string
  storeName: string
  clientId: string | null
}

/**
 * Valida que o usuario tem acesso a uma loja especifica.
 * Usado em rotas que usam createAdminClient() e precisam
 * de validacao manual de org_id.
 *
 * Fluxo:
 * 1. Busca loja por ID
 * 2. Busca org do usuario
 * 3. Compara org da loja com org do usuario
 * 4. Retorna dados da loja se match
 */
export async function requireStoreAccess(
  storeId: string,
  userId: string
): Promise<StoreAccessResult> {
  const adminClient = createAdminClient()

  // 1. Buscar a loja
  const { data: store, error } = await adminClient
    .from("client_stores")
    .select("id, org_id, store_name, client_id")
    .eq("id", storeId)
    .single()

  if (error || !store) {
    throw new AppError("Recurso nao encontrado", 404)
  }

  // 2. Verificar que usuario pertence a mesma org
  const { data: orgMember } = await adminClient
    .from("org_members")
    .select("id, role")
    .eq("profile_id", userId)
    .eq("org_id", store.org_id)
    .eq("is_active", true)
    .single()

  if (!orgMember) {
    throw new ForbiddenError("Sem acesso a esta loja")
  }

  return {
    storeId: store.id,
    orgId: store.org_id,
    storeName: store.store_name,
    clientId: store.client_id,
  }
}
```

#### Step 1.3: Validar
- [ ] Criar testes manuais: usuario da Org A chamando `requireStoreAccess` com store da Org B -> 403
- [ ] Usuario da Org A com store da Org A -> retorna dados

---

### FASE 2: Proteger Rotas de Integracao (P1)
**Tempo: ~2-3h | Risco: Medio (altera rotas existentes)**

#### Step 2.1: Klaviyo Campaigns
**Arquivo:** `src/app/api/integrations/klaviyo/campaigns/route.ts`

```
ADICIONAR apos requireAuth:

  const storeId = searchParams.get("store_id")
  if (!storeId) throw new AppError("store_id obrigatorio", 400)
  await requireStoreAccess(storeId, user.id)  // <-- NOVO
  const credentials = await getStoreCredentials(storeId)
```

#### Step 2.2: Klaviyo Flows
**Arquivo:** `src/app/api/integrations/klaviyo/flows/route.ts`
Mesmo padrao do Step 2.1.

#### Step 2.3: Klaviyo Report
**Arquivo:** `src/app/api/integrations/klaviyo/report/route.ts`
Mesmo padrao do Step 2.1.

#### Step 2.4: Klaviyo Metrics
**Arquivo:** `src/app/api/integrations/klaviyo/metrics/route.ts`
Mesmo padrao do Step 2.1.

#### Step 2.5: Klaviyo Debug
**Arquivo:** `src/app/api/integrations/klaviyo/debug/route.ts`
Mesmo padrao do Step 2.1.

#### Step 2.6: Klaviyo Debug-Agg
**Arquivo:** `src/app/api/integrations/klaviyo/debug-agg/route.ts`
Ja tem auth da Fase 0. Adicionar `requireStoreAccess`.

#### Step 2.7: Klaviyo Test
**Arquivo:** `src/app/api/integrations/klaviyo/test/route.ts`
Mesmo padrao do Step 2.1.

#### Step 2.8: Shopify Report
**Arquivo:** `src/app/api/integrations/shopify/report/route.ts`
```
ADICIONAR apos requireAuth:

  const { store_id } = body
  if (!store_id) throw new AppError("store_id obrigatorio", 400)
  await requireStoreAccess(store_id, user.id)  // <-- NOVO
```

#### Step 2.9: Shopify Recovery Analysis
**Arquivo:** `src/app/api/integrations/shopify/recovery-analysis/route.ts`
Mesmo padrao do Step 2.8.

#### Step 2.10: Shopify Test
**Arquivo:** `src/app/api/integrations/shopify/test/route.ts`
Este endpoint aceita credenciais no body (nao usa store_id), entao nao precisa de `requireStoreAccess`. O `requireAuth` da Fase 0 e suficiente.

#### Step 2.11: Validar cada rota
- [ ] Klaviyo campaigns: com token valido + store da mesma org -> 200
- [ ] Klaviyo campaigns: com token valido + store de OUTRA org -> 403
- [ ] Repetir para cada rota alterada

---

### FASE 3: Proteger Rotas de Store CRUD (P2)
**Tempo: ~2h | Risco: Medio**

#### Step 3.1: GET /api/stores - Defense-in-depth
**Arquivo:** `src/app/api/stores/route.ts`

```
NOTA: Esta rota usa createClient() (user RLS), entao JA esta protegida
pelo RLS. Adicionar .eq("org_id") e defense-in-depth, nao correcao critica.

ADICIONAR:
  const orgId = await resolveOrgId(user.id)
  let query = supabase
    .from("client_stores")
    .select(...)
    .eq("org_id", orgId)  // <-- NOVO: defense-in-depth
    .order("store_name")
```

#### Step 3.2: GET /api/stores/control
**Arquivo:** `src/app/api/stores/control/route.ts`
Mesmo padrao do Step 3.1.

#### Step 3.3: PUT /api/client-stores/credentials
**Arquivo:** `src/app/api/client-stores/credentials/route.ts`

```
ADICIONAR antes do update:
  await requireStoreAccess(store_id, user.id)
```

#### Step 3.4: DELETE /api/client-stores/[id]
**Arquivo:** `src/app/api/client-stores/[id]/route.ts`

```
ADICIONAR:
  // Verificar org match ANTES de checar admin/agent_store_access
  await requireStoreAccess(storeId, user.id)
```

#### Step 3.5: PATCH /api/client-stores/[id]/link
**Arquivo:** `src/app/api/client-stores/[id]/link/route.ts`

```
ADICIONAR:
  const { orgId } = await requireStoreAccess(storeId, user.id)
  // Remover check manual de org que ja existe (store.org_id === client.org_id)
  // pois requireStoreAccess ja garante a org do usuario
```

#### Step 3.6: Validar
- [ ] Listar lojas: so retorna lojas da org do usuario
- [ ] Atualizar credenciais de loja de outra org -> 403
- [ ] Deletar loja de outra org -> 403
- [ ] Linkar loja de outra org -> 403

---

### FASE 4: Atualizar Credentials Service (P2)
**Tempo: ~1h | Risco: Baixo**

#### Step 4.1: Adicionar orgId opcional ao `getStoreCredentials`
**Arquivo:** `src/lib/services/credentials.service.ts`

```typescript
export async function getStoreCredentials(
  storeId: string,
  orgId?: string  // <-- NOVO: se fornecido, valida que loja pertence a org
): Promise<StoreCredentials & { store_name: string; client_id: string | null }> {
  const adminClient = createAdminClient()

  let query = adminClient
    .from("client_stores")
    .select("*")
    .eq("id", storeId)

  if (orgId) {
    query = query.eq("org_id", orgId)  // <-- NOVO
  }

  const { data: store, error } = await query.single()

  if (error || !store) {
    throw new NotFoundError("Store")
  }

  return decryptStoreCredentials(store)
}
```

#### Step 4.2: Atualizar chamadores para passar orgId
Nos rotas da Fase 2, apos ter `requireStoreAccess`, passar o orgId:

```typescript
const { orgId } = await requireStoreAccess(storeId, user.id)
const credentials = await getStoreCredentials(storeId, orgId)
```

#### Step 4.3: Validar
- [ ] `getStoreCredentials("store-org-A", "org-B")` -> NotFoundError
- [ ] `getStoreCredentials("store-org-A", "org-A")` -> retorna credenciais
- [ ] `getStoreCredentials("store-org-A")` -> funciona (backward compat)

---

### FASE 5: Proteger Pagina Ver Loja (P3)
**Tempo: ~1h | Risco: Baixo**

#### Step 5.1: Validar org na page.tsx
**Arquivo:** `src/app/(dashboard)/stores/[id]/page.tsx`

```
ADICIONAR apos buscar a loja:
  // Verificar que a loja pertence a org do usuario
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (user) {
    const userOrgId = await resolveOrgId(user.id)
    if (store.org_id && store.org_id !== userOrgId) {
      notFound()  // Retorna 404 em vez de 403 (nao expoe existencia)
    }
  }
```

#### Step 5.2: Validar
- [ ] Acessar `/stores/[id]` com loja da propria org -> renderiza
- [ ] Acessar `/stores/[id]` com loja de outra org -> 404

---

### FASE 6: Limpeza de Policies Orfas (P3)
**Tempo: ~30min | Risco: Baixo (policies ja foram substituidas)**

#### Step 6.1: Migration SQL de limpeza
**Arquivo NOVO:** `supabase/migrations/20260228_cleanup_orphan_policies.sql`

```sql
-- ============================================================================
-- CLEANUP: Remove orphan RLS policies from initial schema
-- These were replaced by proper org-scoped policies in later migrations
-- but may still exist in the database if DROP IF EXISTS wasn't called.
-- ============================================================================

-- client_stores: policies originais do 00001 e 20241212
DROP POLICY IF EXISTS "Users can view client_stores" ON client_stores;
DROP POLICY IF EXISTS "Users can manage client_stores" ON client_stores;
DROP POLICY IF EXISTS "Allow authenticated users to view stores" ON client_stores;
DROP POLICY IF EXISTS "Allow authenticated users to insert stores" ON client_stores;
DROP POLICY IF EXISTS "Allow authenticated users to update stores" ON client_stores;
DROP POLICY IF EXISTS "Allow authenticated users to delete stores" ON client_stores;
DROP POLICY IF EXISTS "Allow all operations on client_stores" ON client_stores;
DROP POLICY IF EXISTS "Access stores by permission" ON client_stores;

-- clients: policy original do 00001
DROP POLICY IF EXISTS "Users can view all clients" ON clients;

-- profiles: excessivamente aberto
DROP POLICY IF EXISTS "Users can view all profiles" ON profiles;

-- meetings: excessivamente aberto
DROP POLICY IF EXISTS "Users can view meetings" ON meetings;
DROP POLICY IF EXISTS "Users can manage meetings" ON meetings;

-- contracts: excessivamente aberto
DROP POLICY IF EXISTS "Users can view contracts" ON contracts;
DROP POLICY IF EXISTS "Users can manage contracts" ON contracts;

-- reports: excessivamente aberto
DROP POLICY IF EXISTS "Users can view reports" ON reports;
DROP POLICY IF EXISTS "Users can manage reports" ON reports;

-- ============================================================================
-- VERIFICACAO: Listar policies ativas apos cleanup
-- Execute manualmente para validar:
--
-- SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
-- FROM pg_policies
-- WHERE tablename IN ('client_stores', 'clients', 'profiles', 'meetings')
-- ORDER BY tablename, policyname;
-- ============================================================================
```

#### Step 6.2: Validar ANTES de executar
- [ ] Executar query de verificacao para ver quais policies existem atualmente
- [ ] Confirmar que as policies de substituicao existem antes de dropar as antigas
- [ ] Executar migration em staging/dev primeiro

#### Step 6.3: Query de verificacao (executar no Supabase SQL Editor)

```sql
-- EXECUTAR ANTES da migration para ver estado atual
SELECT
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  LEFT(qual::text, 80) as using_clause
FROM pg_policies
WHERE tablename IN (
  'client_stores',
  'clients',
  'profiles',
  'meetings',
  'contracts',
  'reports'
)
ORDER BY tablename, policyname;
```

---

### FASE 7: Remover duplicatas de `resolveOrgId` (P3)
**Tempo: ~1h | Risco: Baixo**

#### Step 7.1: Identificar todos os arquivos com `resolveOrgId` duplicado
Rotas que definem a funcao localmente (em vez de importar):

```
src/app/api/campaigns/route.ts
src/app/api/client-reports/route.ts
src/app/api/clients/search/route.ts
src/app/api/dashboard/total-revenue/route.ts
src/app/api/meetings/route.ts
(+ possivelmente outros)
```

#### Step 7.2: Substituir por import centralizado
Em cada arquivo, substituir a funcao local por:

```typescript
import { resolveOrgId } from "@/lib/api/resolve-org"

// Antes: const orgId = await resolveOrgId(supabase, user.id)
// Depois: const orgId = await resolveOrgId(user.id)
```

**NOTA:** A versao centralizada usa `adminClient` internamente, entao nao precisa receber `supabase` como parametro.

#### Step 7.3: Validar
- [ ] Cada rota alterada continua funcionando
- [ ] Nenhuma funcao `resolveOrgId` local restante no codebase

---

## Checklist Final de Validacao

### Seguranca
- [ ] Nenhum endpoint publico sem autenticacao
- [ ] Nenhuma rota permite acesso cross-org via `createAdminClient()`
- [ ] `getStoreCredentials` com orgId valida pertencimento
- [ ] Policies RLS orfas removidas

### Funcional
- [ ] Dashboard carrega normalmente
- [ ] Lista de lojas funciona
- [ ] Pagina de detalhes da loja funciona
- [ ] Tabs de Klaviyo (campaigns, flows, report) funcionam
- [ ] Configuracao de credenciais funciona
- [ ] OAuth Shopify callback funciona
- [ ] Criacao/edicao/exclusao de lojas funciona
- [ ] Link/unlink de loja com cliente funciona

### Performance
- [ ] `requireStoreAccess` nao adiciona latencia perceptivel
- [ ] Listagem de lojas com filtro org_id nao degrada

---

## Arquivos Afetados (Lista Completa)

### Novos
- `src/lib/api/resolve-org.ts`
- `src/lib/api/require-store-access.ts`
- `supabase/migrations/20260228_cleanup_orphan_policies.sql`

### Modificados
- `src/app/api/integrations/klaviyo/debug-agg/route.ts`
- `src/app/api/integrations/klaviyo/debug/route.ts`
- `src/app/api/integrations/klaviyo/campaigns/route.ts`
- `src/app/api/integrations/klaviyo/flows/route.ts`
- `src/app/api/integrations/klaviyo/report/route.ts`
- `src/app/api/integrations/klaviyo/metrics/route.ts`
- `src/app/api/integrations/klaviyo/test/route.ts`
- `src/app/api/integrations/shopify/report/route.ts`
- `src/app/api/integrations/shopify/recovery-analysis/route.ts`
- `src/app/api/integrations/shopify/test/route.ts`
- `src/app/api/stores/route.ts`
- `src/app/api/stores/control/route.ts`
- `src/app/api/client-stores/credentials/route.ts`
- `src/app/api/client-stores/[id]/route.ts`
- `src/app/api/client-stores/[id]/link/route.ts`
- `src/app/api/campaigns/route.ts`
- `src/app/api/client-reports/route.ts`
- `src/app/api/clients/search/route.ts`
- `src/app/api/dashboard/total-revenue/route.ts`
- `src/app/api/meetings/route.ts`
- `src/lib/services/credentials.service.ts`
- `src/app/(dashboard)/stores/[id]/page.tsx`

---

*Story gerada pela auditoria de seguranca de 2026-02-27*
*Revisada por Quinn (QA) e River (SM)*
