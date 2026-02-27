# Análise Completa: Integração Lojas, Clientes e Credenciais

**Data:** 2026-02-27
**Escopo:** Mapeamento completo do fluxo de dados entre `client_stores`, `clients`, `organizations`, credenciais Klaviyo/Shopify e a página "Ver Loja"

---

## 1. Arquitetura Atual - Modelo de Dados

```
organizations (org_id)
  │
  ├── org_members (org_id, profile_id, role)
  │   └── agent_store_access (org_member_id, store_id)
  │       └── can_view, can_edit, can_manage_onboarding, etc.
  │
  └── clients (org_id, owner_id)
      └── client_stores (org_id, client_id)  ← client_id NULLABLE (lojas avulsas)
          ├── Shopify credentials (encrypted)
          ├── Klaviyo credentials (encrypted)
          ├── Meta credentials (encrypted)
          ├── Google credentials (encrypted)
          └── integration_status (JSONB)
```

### Fluxo de Credenciais
```
OAuth Callback / Config Form
    ↓
updateStoreCredentials(storeId, credentials, integrationKey)
    ↓
createAdminClient() → bypasses RLS
    ↓
Encrypts sensitive fields (AES-256-GCM, prefix enc:v1:)
    ↓
UPDATE client_stores SET ... WHERE id = storeId  ← SEM VALIDAÇÃO DE org_id
    ↓
Merge integration_status JSONB
```

---

## 2. PROBLEMAS CRÍTICOS ENCONTRADOS

### 2.1 🔴 CRÍTICO: Endpoints PÚBLICOS sem autenticação

| Endpoint | Arquivo | Problema |
|----------|---------|----------|
| `GET /api/integrations/klaviyo/debug-agg` | `src/app/api/integrations/klaviyo/debug-agg/route.ts` | **ZERO autenticação.** Qualquer pessoa pode passar um `store_id` e obter dados da loja + credenciais descriptografadas |
| `POST /api/integrations/shopify/test` | `src/app/api/integrations/shopify/test/route.ts` | **ZERO autenticação.** Aceita `store_domain` + `access_token` no body e faz requisição direta à API Shopify |

**Impacto:** Exposição total de credenciais. Qualquer pessoa com o URL pode acessar dados de QUALQUER loja.

---

### 2.2 🔴 CRÍTICO: Rotas de listagem de lojas SEM filtro org_id

| Endpoint | Arquivo | Problema |
|----------|---------|----------|
| `GET /api/stores` | `src/app/api/stores/route.ts` | Retorna TODAS as lojas sem filtro `org_id`. Depende apenas de RLS |
| `GET /api/stores/control` | `src/app/api/stores/control/route.ts` | Mesmo problema - lista todas as lojas |

**Código atual (stores/route.ts):**
```typescript
let query = supabase
  .from("client_stores")
  .select(`id, store_name, platform, ...`)
  .order("store_name")

// FALTA: .eq("org_id", userOrgId)
```

**Impacto:** Se RLS tiver qualquer falha, lojas de TODAS as organizações ficam expostas.

---

### 2.3 🔴 ALTO: Rotas Klaviyo/Shopify sem validação de propriedade da loja

**TODAS as rotas de integração seguem o mesmo padrão quebrado:**

```typescript
await requireAuth(supabase)  // ← Verifica APENAS se está logado
const storeId = searchParams.get("store_id")  // ← Aceita QUALQUER store_id
const credentials = await getStoreCredentials(storeId)  // ← Retorna para QUALQUER loja
```

| Endpoint | Arquivo |
|----------|---------|
| `GET /api/integrations/klaviyo/campaigns` | `klaviyo/campaigns/route.ts` |
| `GET /api/integrations/klaviyo/flows` | `klaviyo/flows/route.ts` |
| `GET /api/integrations/klaviyo/report` | `klaviyo/report/route.ts` |
| `GET /api/integrations/klaviyo/metrics` | `klaviyo/metrics/route.ts` |
| `GET /api/integrations/klaviyo/debug` | `klaviyo/debug/route.ts` |
| `GET /api/integrations/klaviyo/test` | `klaviyo/test/route.ts` |
| `POST /api/integrations/shopify/report` | `shopify/report/route.ts` |
| `POST /api/integrations/shopify/recovery-analysis` | `shopify/recovery-analysis/route.ts` |

**Impacto:** Usuário autenticado da Org A pode acessar campanhas, flows, relatórios e métricas da Org B passando o `store_id` correto.

---

### 2.4 🔴 ALTO: credentials.service.ts sem contexto de org_id

**Arquivo:** `src/lib/services/credentials.service.ts`

```typescript
export async function getStoreCredentials(storeId: string) {
  const adminClient = createAdminClient()  // ← SERVICE ROLE (bypassa RLS)
  const { data: store } = await adminClient
    .from("client_stores")
    .select("*")
    .eq("id", storeId)  // ← SEM filtro org_id
    .single()
  // Descriptografa e retorna
}

export async function updateStoreCredentials(storeId, credentials, integrationKey?) {
  const adminClient = createAdminClient()
  const { error } = await adminClient
    .from("client_stores")
    .update(updateData)
    .eq("id", storeId)  // ← SEM filtro org_id
}
```

**Problema fundamental:** O serviço de credenciais é o ponto central de acesso, mas não valida se o chamador tem permissão para acessar aquela loja. Ele confia inteiramente no chamador.

---

### 2.5 🟡 MÉDIO: Shopify OAuth Callback sem validação de org_id

**Arquivo:** `src/app/api/integrations/shopify/callback/route.ts`

```typescript
await updateStoreCredentials(
  stateData.store_id,  // ← store_id vem do state OAuth (validado por HMAC)
  { shopify_store_domain: shop, shopify_access_token: tokenData.access_token },
  "shopify"
)
```

**Problema:** O `stateData` é protegido por HMAC, mas não há verificação de que o `store_id` dentro dele pertence à organização do usuário logado.

---

### 2.6 🟡 MÉDIO: PUT /api/client-stores/credentials sem org_id

**Arquivo:** `src/app/api/client-stores/credentials/route.ts`

```typescript
const { data, error } = await supabase
  .from("client_stores")
  .update(updates)
  .eq("id", store_id)  // ← SEM filtro org_id
  .select()
  .single()
```

**Impacto:** Se um usuário souber o `store_id` de outra org, pode atualizar credenciais.

---

### 2.7 🟡 MÉDIO: DELETE /api/client-stores/[id] com auth fraca

**Arquivo:** `src/app/api/client-stores/[id]/route.ts`

```typescript
// Busca loja com adminClient (bypassa RLS)
const { data: store } = await adminClient
  .from("client_stores")
  .select("id, store_name, client_id, org_id")
  .eq("id", storeId)
  .single()

// Verifica admin OU agent_store_access, mas NÃO verifica org_id
```

---

### 2.8 🟡 MÉDIO: Página "Ver Loja" sem verificação de org

**Arquivo:** `src/app/(dashboard)/stores/[id]/page.tsx`

```typescript
const { data: store } = await adminClient
  .from("client_stores")
  .select(`id, store_name, ..., clients(...)`)
  .eq("id", id)  // ← SEM org_id
  .single()
```

**Nota:** Protegido por `PagePermissionWrapper`, mas o fetch de dados em si não filtra por org.

---

### 2.9 🟡 MÉDIO: Link de loja com cliente sem verificação do usuário

**Arquivo:** `src/app/api/client-stores/[id]/link/route.ts`

O código valida que `client.org_id === store.org_id` (ótimo), mas **NÃO** valida que `store.org_id === userOrgId` (o usuário pode estar em outra org).

As atualizações em cascata (`store_alerts`, `store_onboarding_data`, `client_onboardings`) também não filtram por `org_id`.

---

## 3. MAPEAMENTO COMPLETO DE ROTAS

### Rotas COM filtro org_id (CORRETAS ✅)

| Rota | Como filtra |
|------|-------------|
| `GET /api/clients/search` | `resolveOrgId()` → `.eq("org_id", orgId)` |
| `GET /api/client-reports` | Filtra por org_id |
| `GET /api/admin/org-members/*` | Filtra por org_id |
| `GET /api/meetings/*` | Filtra por org_id |
| `GET /api/dashboard/total-revenue` | Filtra por org_id |

### Rotas SEM filtro org_id (VULNERÁVEIS ❌)

| Rota | Problema |
|------|----------|
| `GET /api/stores` | Lista todas as lojas |
| `GET /api/stores/control` | Lista todas as lojas |
| `GET /api/stores/alerts/*` | Provavelmente sem filtro |
| `PUT /api/client-stores/credentials` | Atualiza sem verificar org |
| `DELETE /api/client-stores/[id]` | Deleta sem verificar org |
| `PATCH /api/client-stores/[id]/link` | Liga sem verificar org do user |
| `GET /api/integrations/klaviyo/*` (6 rotas) | Aceita qualquer store_id |
| `POST /api/integrations/shopify/*` (2 rotas) | Aceita qualquer store_id |
| `GET /api/integrations/klaviyo/debug-agg` | PÚBLICO |
| `POST /api/integrations/shopify/test` | PÚBLICO |

---

## 4. CAUSA RAIZ

### Multi-tenancy inconsistente

O projeto implementou multi-tenancy em **duas fases diferentes**, resultando em padrão misto:

1. **Fase antiga (pré-F2):** Rotas confiam inteiramente em RLS do Supabase. Sem filtro explícito de `org_id`.
2. **Fase nova (pós-F6):** Algumas rotas usam `resolveOrgId()` + filtro explícito.

### O `credentials.service.ts` é um ponto cego

O serviço usa `createAdminClient()` (service role) que **bypassa completamente o RLS**. Ele foi desenhado para ser chamado apenas de contextos já autorizados, mas **nenhum** dos chamadores valida a autorização antes.

### Falta middleware centralizado

Não existe um middleware ou helper tipo `requireStoreAccess(storeId, userId)` que valide:
1. Usuário está autenticado ✅ (requireAuth faz isso)
2. Usuário pertence a uma org ❌
3. A loja pertence à mesma org ❌
4. O usuário tem permissão para a ação ❌

---

## 5. TABELA DE IMPACTO

| # | Severidade | Descrição | Impacto |
|---|-----------|-----------|---------|
| 1 | 🔴 CRÍTICO | `debug-agg` sem auth | Credenciais expostas publicamente |
| 2 | 🔴 CRÍTICO | `shopify/test` sem auth | Testa tokens arbitrários publicamente |
| 3 | 🔴 CRÍTICO | `/api/stores` sem org_id | Lista lojas de todas as orgs |
| 4 | 🔴 CRÍTICO | `/api/stores/control` sem org_id | Lista lojas de todas as orgs |
| 5 | 🔴 ALTO | Todas rotas Klaviyo sem org check | Cross-org data access |
| 6 | 🔴 ALTO | Todas rotas Shopify sem org check | Cross-org data access |
| 7 | 🔴 ALTO | `credentials.service.ts` sem org_id | Fundação insegura |
| 8 | 🟡 MÉDIO | `client-stores/credentials` PUT sem org | Atualização cross-org |
| 9 | 🟡 MÉDIO | `client-stores/[id]` DELETE sem org | Deleção cross-org |
| 10 | 🟡 MÉDIO | OAuth callback sem org verification | Potencial credential injection |
| 11 | 🟡 MÉDIO | Link store/client sem user org check | Linking cross-org |
| 12 | 🟡 MÉDIO | Store detail page sem org check | Visualização cross-org |
| 13 | 🟢 BAIXO | `StoreLinkModal` prop `orgId` não usada | Dead code |

---

## 6. SOLUÇÃO RECOMENDADA

### 6.1 Criar helper centralizado `requireStoreAccess`

```typescript
// src/lib/auth/store-access.ts
export async function requireStoreAccess(
  storeId: string,
  userId: string,
  permission: 'view' | 'edit' | 'manage' = 'view'
): Promise<{ store: ClientStore; orgId: string }> {
  const adminClient = createAdminClient()

  // 1. Buscar a loja
  const { data: store } = await adminClient
    .from("client_stores")
    .select("id, org_id, client_id, store_name")
    .eq("id", storeId)
    .single()

  if (!store) throw new AppError("Recurso não encontrado", 404)

  // 2. Verificar que o usuário pertence à mesma org
  const { data: orgMember } = await adminClient
    .from("org_members")
    .select("id, role")
    .eq("profile_id", userId)
    .eq("org_id", store.org_id)
    .eq("is_active", true)
    .single()

  if (!orgMember) throw new AppError("Acesso negado", 403)

  // 3. Se não admin, verificar permissão específica
  if (orgMember.role !== 'owner' && permission !== 'view') {
    const { data: access } = await adminClient
      .from("agent_store_access")
      .select("can_view, can_edit, can_manage_campaigns")
      .eq("org_member_id", orgMember.id)
      .eq("store_id", storeId)
      .single()

    if (!access?.can_edit && permission === 'edit') {
      throw new AppError("Sem permissão", 403)
    }
  }

  return { store, orgId: store.org_id }
}
```

### 6.2 Atualizar `credentials.service.ts`

Adicionar parâmetro `orgId` opcional para validação:

```typescript
export async function getStoreCredentials(
  storeId: string,
  orgId?: string  // Se fornecido, valida que a loja pertence a esta org
): Promise<StoreCredentials & { store_name: string; client_id: string | null }> {
  const adminClient = createAdminClient()

  let query = adminClient.from("client_stores").select("*").eq("id", storeId)
  if (orgId) query = query.eq("org_id", orgId)  // ← NOVO

  const { data: store } = await query.single()
  if (!store) throw new NotFoundError("Store")

  return decryptStoreCredentials(store)
}
```

### 6.3 Padrão para TODAS as rotas de integração

```typescript
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await requireAuth(supabase)

  const storeId = request.nextUrl.searchParams.get("store_id")
  if (!storeId) return errorResponse(request, new AppError("store_id obrigatório", 400))

  // ← NOVO: Validar acesso
  const { orgId } = await requireStoreAccess(storeId, user.id)

  // ← ATUALIZADO: Passar orgId para credenciais
  const credentials = await getStoreCredentials(storeId, orgId)

  // ... resto da lógica
}
```

### 6.4 Adicionar auth em endpoints públicos

```typescript
// debug-agg/route.ts - ADICIONAR:
const supabase = await createClient()
const { data: { user } } = await requireAuth(supabase)
await requireStoreAccess(storeId, user.id)

// shopify/test/route.ts - ADICIONAR:
const supabase = await createClient()
await requireAuth(supabase)
```

### 6.5 Filtrar por org_id nas listagens

```typescript
// stores/route.ts
const orgId = await resolveOrgId(adminClient, user.id)
let query = supabase
  .from("client_stores")
  .select(`...`)
  .eq("org_id", orgId)  // ← ADICIONAR
  .order("store_name")
```

---

## 7. PRIORIDADE DE CORREÇÃO

| Prioridade | Ação | Esforço |
|------------|------|---------|
| **P0 (Imediato)** | Adicionar auth em `debug-agg` e `shopify/test` | 30min |
| **P0 (Imediato)** | Adicionar `.eq("org_id")` em `/api/stores` e `/api/stores/control` | 30min |
| **P1 (Urgente)** | Criar `requireStoreAccess` helper | 1-2h |
| **P1 (Urgente)** | Aplicar `requireStoreAccess` em todas as 8 rotas Klaviyo/Shopify | 2-3h |
| **P2 (Importante)** | Atualizar `credentials.service.ts` com org_id | 1h |
| **P2 (Importante)** | Corrigir DELETE, PUT, PATCH de client-stores | 1-2h |
| **P3 (Melhoria)** | Corrigir store detail page e link modal | 1h |

**Tempo total estimado:** ~8-10h de desenvolvimento + testes

---

*Documento gerado automaticamente pela análise do codebase admin-convertfy.*
