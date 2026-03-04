# Story: Fix Client Stores Empty State Bug

**Prioridade:** P1 - Alta (funcionalidade core quebrada)
**Sprint:** Current
**Assignee:** @dev
**Revisao:** @sm (River)
**Status:** Ready for Review
**Tipo:** Bugfix
**Estimativa:** ~3-4h
**Bug Doc:** `docs/bugs/bug-client-stores-empty-state.md`

---

## Contexto

A aba "Lojas" do cliente (`Clientes > [Cliente] > Lojas`) mostra "Nenhuma loja vinculada" mesmo quando lojas existem e funcionam na pagina `/stores`. O usuario e org owner.

### Causa Raiz

O componente `client-stores.tsx` e o **unico local no app** que faz query Supabase direta do browser (`createClient()` de `@/lib/supabase/client`). Todo o resto do app usa API routes server-side. O `catch` silencia qualquer erro (auth, RLS, PostgREST) e mostra empty state falso.

Alem do `loadStores()`, o `handleDelete()` tambem usa browser Supabase diretamente, mesmo existindo uma API server-side em `/api/client-stores/[id]` (DELETE). E o `markOnboardingStepCompleted()` tambem faz queries browser Supabase que podem falhar silenciosamente.

### Fluxo do Bug

```
1. Pagina /stores → fetch('/api/stores') → server-side auth → FUNCIONA
2. Aba Lojas do cliente → createClient() browser → auth falha silenciosamente → catch esconde → "Nenhuma loja" QUEBRADO
3. Criar loja → POST server-side (funciona) → loadStores() browser (falha) → empty state apos toast sucesso
4. Deletar loja → browser Supabase .delete() → pode falhar por auth/RLS mesmo existindo API server-side
```

### Problema Secundario: Interface Mismatch

A API `/api/stores` retorna um shape diferente do que o componente espera. A API NAO retorna campos de credenciais (`shopify_access_token`, `klaviyo_private_key`, etc.) que o componente usa para exibir badges "Configurado"/"Nao configurado". Sera necessario:
- Adicionar campos indicadores na API (ex: `has_shopify_credentials`, `has_klaviyo_credentials`, `has_ga4_credentials`) **OU**
- Adicionar os campos nao-sensíveis na query da API (ex: `klaviyo_public_key`, `klaviyo_list_id`, `ga4_property_id`, `currency`) e flags booleanas para presenca de credenciais encriptadas

A opcao recomendada e adicionar campos computados na API para evitar retornar dados encriptados ao browser.

---

## Objetivo

1. Eliminar TODAS as queries browser Supabase de `client-stores.tsx`
2. Usar APIs server-side existentes para todas as operacoes (GET, DELETE)
3. Adaptar o componente ao shape retornado pela API `/api/stores`
4. Tornar erros visiveis ao usuario (toast em vez de silent catch)
5. Garantir que criacao, edicao e delecao continuem funcionando corretamente

---

## Acceptance Criteria

- [x] **FIX.1** `loadStores()` usa `fetch('/api/stores?client_id=${clientId}')` em vez de browser Supabase
  - Given: usuario logado visualiza a aba "Lojas" de um cliente
  - When: o componente carrega
  - Then: lojas sao carregadas via API server-side e exibidas corretamente

- [x] **FIX.2** `handleDelete()` usa `fetch('/api/client-stores/${storeId}', { method: 'DELETE' })` em vez de browser Supabase
  - Given: usuario clica "Remover" em uma loja
  - When: a confirmacao e aceita
  - Then: a delecao ocorre via API server-side com validacao de permissoes

- [x] **FIX.3** Interface `ClientStore` adaptada ao shape retornado pela API `/api/stores`
  - Given: a API retorna `{ stores: [...] }` com campos diferentes
  - When: o componente processa a resposta
  - Then: todos os campos necessarios para a UI sao mapeados corretamente

- [x] **FIX.4** API `/api/stores` estendida com campos necessarios para badges de integracao
  - Given: o componente precisa exibir status "Configurado"/"Nao configurado" para Shopify, Klaviyo, GA4
  - When: a API retorna dados da loja
  - Then: campos indicadores de integracao estao presentes (sem expor credenciais encriptadas)

- [x] **FIX.5** Error handling visivel com toast em vez de silent catch
  - Given: ocorre um erro ao carregar lojas
  - When: o catch e acionado
  - Then: um toast destrutivo e exibido com a mensagem de erro; o estado anterior do `stores` e mantido (nao resetado para `[]`)

- [x] **FIX.6** Import de `createClient` de `@/lib/supabase/client` removido do componente
  - Given: todas as operacoes agora usam fetch API
  - When: o componente e revisado
  - Then: nao existe import de `createClient` do modulo browser Supabase

- [x] **FIX.7** `markOnboardingStepCompleted()` refatorada para nao usar browser Supabase
  - Given: a funcao faz queries ao Supabase via browser client (linhas 90-98)
  - When: credenciais sao salvas
  - Then: a funcao usa fetch API ou a logica de onboarding e delegada ao servidor

- [x] **FIX.8** Criacao de loja + refresh funciona end-to-end
  - Given: usuario adiciona uma nova loja via dialog
  - When: o POST retorna sucesso
  - Then: `loadStores()` via API carrega a lista atualizada e a nova loja aparece

- [x] **FIX.9** Edicao de loja funciona end-to-end
  - Given: usuario edita uma loja existente
  - When: o PUT retorna sucesso
  - Then: `loadStores()` via API carrega a lista atualizada com as mudancas

- [x] **FIX.10** Run `npm run lint` passa sem erros
- [x] **FIX.11** Run `npm run typecheck` passa sem erros

---

## Arquitetura Tecnica

### FIX.1 — Refatorar `loadStores()` para usar fetch API

**ANTES (quebrado):**
```typescript
// src/components/clients/client-stores.tsx — loadStores()
import { createClient } from "@/lib/supabase/client"

async function loadStores() {
  setIsLoading(true)
  try {
    const supabase = createClient()
    const { data, error } = await supabase
      .from("client_stores")
      .select("id, store_name, store_url, platform, currency, is_active, created_at, shopify_store_domain, shopify_access_token, klaviyo_public_key, klaviyo_private_key, klaviyo_api_key, klaviyo_list_id, ga4_property_id, ga4_credentials")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false })
    if (error) throw error
    setStores(data || [])
  } catch (error) {
    console.error("Error loading stores:", error)
    setStores([])  // QUALQUER erro = empty state falso
  } finally {
    setIsLoading(false)
  }
}
```

**DEPOIS (funcional):**
```typescript
// src/components/clients/client-stores.tsx — loadStores()
// NOTA: Sem import de createClient do browser

async function loadStores() {
  setIsLoading(true)
  try {
    const res = await fetch(`/api/stores?client_id=${clientId}`)
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error || `Erro ao carregar lojas (${res.status})`)
    }
    const { stores: data } = await res.json()
    setStores(data || [])
  } catch (error) {
    console.error("Error loading stores:", error)
    toast({
      variant: "destructive",
      title: "Erro ao carregar lojas",
      description: error instanceof Error ? error.message : "Erro desconhecido",
    })
    // NAO resetar para [] — manter estado anterior
  } finally {
    setIsLoading(false)
  }
}
```

### FIX.2 — Refatorar `handleDelete()` para usar API server-side

**ANTES (quebrado):**
```typescript
async function handleDelete() {
  if (!deleteStore) return
  try {
    const supabase = createClient()
    const { error } = await supabase
      .from("client_stores")
      .delete()
      .eq("id", deleteStore.id)
    if (error) throw error
    toast({ title: "Loja removida!" })
    setDeleteStore(null)
    loadStores()
  } catch {
    toast({ variant: "destructive", title: "Erro ao remover", ... })
  }
}
```

**DEPOIS (funcional):**
```typescript
async function handleDelete() {
  if (!deleteStore) return
  try {
    const res = await fetch(`/api/client-stores/${deleteStore.id}`, {
      method: "DELETE",
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error || "Erro ao remover loja")
    }
    toast({ title: "Loja removida!" })
    setDeleteStore(null)
    loadStores()
  } catch (error) {
    toast({
      variant: "destructive",
      title: "Erro ao remover",
      description: error instanceof Error ? error.message : "Nao foi possivel remover a loja",
    })
  }
}
```

### FIX.3 — Adaptar interface `ClientStore`

A interface precisa refletir o shape da API. Credenciais encriptadas NAO devem estar na interface.

**ANTES:**
```typescript
interface ClientStore {
  id: string
  store_name: string
  store_url?: string
  platform?: string
  currency?: string
  // ... 12+ campos de credenciais encriptadas
  shopify_access_token?: string
  klaviyo_private_key?: string
  // etc.
  is_active: boolean
  created_at: string
}
```

**DEPOIS:**
```typescript
interface ClientStore {
  id: string
  store_name: string
  store_url?: string
  platform?: string
  currency?: string
  is_active: boolean
  created_at: string
  client_id?: string
  shopify_store_domain?: string
  // Campos de integracao computados pela API (sem credenciais)
  klaviyo_public_key?: string
  klaviyo_list_id?: string
  ga4_property_id?: string
  // Flags booleanas indicando presenca de credenciais
  has_shopify_credentials?: boolean
  has_klaviyo_credentials?: boolean
  has_ga4_credentials?: boolean
  // Client relation (vem da API)
  client?: { id: string; name: string; company?: string; email?: string }
}
```

### FIX.4 — Estender API `/api/stores` com campos de integracao

```typescript
// src/app/api/stores/route.ts
// Adicionar campos nao-sensiveis ao select e computar flags

let query = supabase
  .from("client_stores")
  .select(`
    id,
    store_name,
    platform,
    store_url,
    is_active,
    created_at,
    client_id,
    currency,
    language,
    shopify_store_domain,
    shopify_access_token,
    klaviyo_public_key,
    klaviyo_private_key,
    klaviyo_api_key,
    klaviyo_list_id,
    ga4_property_id,
    ga4_credentials,
    feedback_frequency,
    last_feedback_date,
    next_feedback_date,
    last_feedback_by,
    feedback_notes,
    client:clients(id, name, company, email)
  `)
  .eq("org_id", orgId)
  .order("store_name")

// Apos obter os dados, mapear para nao expor credenciais encriptadas:
const sanitizedStores = (stores || []).map(store => {
  const { shopify_access_token, klaviyo_private_key, klaviyo_api_key, ga4_credentials, ...rest } = store
  return {
    ...rest,
    has_shopify_credentials: !!shopify_access_token,
    has_klaviyo_credentials: !!(klaviyo_private_key || klaviyo_api_key),
    has_ga4_credentials: !!ga4_credentials,
  }
})

return NextResponse.json(
  { stores: sanitizedStores },
  { headers: corsHeaders(request.headers.get("origin")) }
)
```

### FIX.5 — Adaptar badges no componente

As badges que verificavam presenca de credenciais devem usar as novas flags:

**ANTES:**
```tsx
{store.shopify_access_token ? (
  <Badge variant="success">Configurado</Badge>
) : (
  <Badge variant="secondary">Nao configurado</Badge>
)}
```

**DEPOIS:**
```tsx
{store.has_shopify_credentials ? (
  <Badge variant="success">Configurado</Badge>
) : (
  <Badge variant="secondary">Nao configurado</Badge>
)}
```

Mesma logica para `has_klaviyo_credentials` e `has_ga4_credentials`.

### FIX.7 — Refatorar `markOnboardingStepCompleted()`

A funcao atual usa browser Supabase para buscar onboarding/step antes de chamar a API. Simplificar para delegar toda a logica ao servidor:

**Opcao A (recomendada):** Criar um endpoint server-side que recebe `client_id` + `step_name` e faz tudo server-side.

**Opcao B (minima):** Mover as queries para fetch de uma API existente ou aceitar que esta funcao pode falhar silenciosamente (ja e fire-and-forget com try/catch).

Como esta funcao ja e fire-and-forget e nao afeta a UX diretamente (onboarding auto-mark), a **Opcao B** e aceitavel como fix minimo. O dev deve documentar um TODO para migrar no futuro.

### Sobre `testKlaviyoConnection()` e `testShopifyConnection()`

Estas funcoes atualmente tentam ler credenciais do objeto `store` local. Com a remocao de credenciais do response da API, elas nao terao acesso a `shopify_access_token` ou `klaviyo_private_key`.

**Solucao:** O teste de conexao deve ser invocado via server-side usando o `store.id` — o servidor busca as credenciais decriptadas internamente. Adaptar para `fetch('/api/integrations/klaviyo/test', { body: { store_id: store.id } })` ou similar. Se os endpoints de teste ja nao suportam `store_id`, adicionar esse suporte.

**Alternativa minima:** Manter o botao "Testar Conexao" apenas no dialog de edicao (onde o usuario re-insere credenciais) e remover dos cards. Isso ja e o comportamento atual para credenciais encriptadas (mostra toast "Edite a loja e re-insira...").

O dev deve avaliar qual abordagem e mais adequada. O importante e que **credenciais encriptadas nunca sejam retornadas ao browser**.

---

## Ordem de Implementacao

1. [x] Estender API `/api/stores` com campos de integracao e flags booleanas (FIX.4)
2. [x] Refatorar `loadStores()` para usar fetch API (FIX.1)
3. [x] Atualizar interface `ClientStore` para o novo shape (FIX.3)
4. [x] Adaptar badges para usar flags `has_*_credentials` (parte de FIX.3)
5. [x] Adaptar ou remover `testKlaviyoConnection()`/`testShopifyConnection()` dos cards
6. [x] Refatorar `handleDelete()` para usar API server-side (FIX.2)
7. [x] Melhorar error handling com toast (FIX.5)
8. [x] Avaliar e refatorar `markOnboardingStepCompleted()` (FIX.7)
9. [x] Remover import de `createClient` do browser (FIX.6)
10. [x] Testar fluxo completo: listar, criar, editar, deletar (FIX.8, FIX.9)
11. [x] Run lint + typecheck (FIX.10, FIX.11)

---

## File List

| Arquivo | Acao | Descricao |
|---------|------|-----------|
| `src/components/clients/client-stores.tsx` | MODIFICAR | Remover browser Supabase, usar fetch API para GET e DELETE, adaptar interface e badges, melhorar error handling |
| `src/app/api/stores/route.ts` | MODIFICAR | Adicionar campos de integracao ao select, computar flags `has_*_credentials`, sanitizar credenciais encriptadas |
| `src/app/api/client-stores/[id]/route.ts` | VERIFICAR | Endpoint DELETE ja existe — confirmar que funciona corretamente |
| `src/app/api/client-stores/credentials/route.ts` | VERIFICAR | Endpoints POST/PUT ja funcionam — nenhuma mudanca necessaria |

---

## Dependencias

- **Nao depende de nenhuma story** — bugfix independente
- **Depende de:** API `/api/stores` existente (ja funciona)
- **Depende de:** API `/api/client-stores/[id]` DELETE existente (ja funciona)
- **Relacionada:** `story-rls-security-hardening.md` (RLS policies ja estao corretas)

---

## Riscos e Mitigacoes

| Risco | Mitigacao |
|-------|-----------|
| API `/api/stores` retorna shape diferente do esperado pelo componente | FIX.3 + FIX.4 tratam o mapeamento; testar com dados reais |
| `testKlaviyoConnection()`/`testShopifyConnection()` quebram sem credenciais locais | Adaptar para usar `store_id` server-side OU manter apenas no dialog de edicao |
| `markOnboardingStepCompleted()` para de funcionar | Funcao ja e fire-and-forget; marcar TODO para migrar para server-side |
| Outros componentes dependem de `ClientStore` interface | Buscar usos da interface no codebase antes de mudar |
| DELETE endpoint pode ter permissoes diferentes do esperado | O endpoint ja valida admin/can_edit — mais restritivo que o browser delete direto, o que e correto |

---

## QA Checklist

- [ ] Aba "Lojas" do cliente mostra lojas vinculadas (usuario owner)
- [ ] Aba "Lojas" do cliente mostra lojas vinculadas (usuario membro/agent)
- [ ] "Adicionar Loja" cria e aparece imediatamente na lista
- [ ] "Editar Loja" salva e reflete na lista
- [ ] "Remover Loja" deleta e some da lista
- [ ] Badges "Configurado"/"Nao configurado" mostram status correto para Shopify, Klaviyo, GA4
- [ ] Erros de carregamento mostram toast (nao empty state falso)
- [ ] Erros de delecao mostram toast com mensagem util
- [ ] Pagina `/stores` continua funcionando normalmente (regressao)
- [ ] Console do browser NAO mostra credenciais `enc:v1:...` em nenhuma response
- [ ] Nenhum import de `@/lib/supabase/client` permanece no componente
- [ ] `npm run lint` passa sem erros
- [ ] `npm run typecheck` passa sem erros

---

## CodeRabbit Integration

### Quality Gates
- [ ] Lint clean
- [ ] Typecheck clean
- [ ] Zero browser Supabase queries em `client-stores.tsx`
- [ ] Credenciais encriptadas nao expostas no response da API
- [ ] Error handling visivel (toast) em todas as operacoes
- [ ] Flags `has_*_credentials` computadas server-side

### Specialized Agents
- **@dev**: Implementacao
- **@qa**: Testar fluxo completo (CRUD + badges + error states)

### Review Focus Areas
- Nenhum import de `createClient` de `@/lib/supabase/client` no componente
- Credenciais nunca retornadas ao browser (sanitizacao na API)
- Error handling nao esconde erros como empty state
- Interface `ClientStore` alinhada com response real da API
- `handleDelete` usa a API com validacao de permissoes (nao browser delete direto)
- Regressao: pagina `/stores` nao afetada

---

## Dev Notes

### Por que o browser Supabase falha

O `createClient()` do `@/lib/supabase/client` cria um browser client que depende de cookies httpOnly para autenticacao. Em serverless (Vercel), o middleware de auth pode nao ter refreshed o token corretamente, ou cookies podem estar inacessiveis. O resultado: `auth.uid()` retorna NULL, RLS nega tudo, retorna `[]` sem erro.

A API route server-side (`createClient()` de `@/lib/supabase/server`) le cookies do request headers diretamente, o que funciona consistentemente.

### Campos da API vs Componente

A API `/api/stores` hoje seleciona:
```
id, store_name, platform, store_url, is_active, created_at, client_id,
language, feedback_frequency, last_feedback_date, next_feedback_date,
last_feedback_by, feedback_notes, shopify_store_domain,
client:clients(id, name, company, email)
```

O componente precisa adicionalmente: `currency`, flags de integracao. Nao precisa de credenciais raw.

### Endpoint DELETE ja existente

`/api/client-stores/[id]` (DELETE) ja implementa:
- Auth via `requireAuth()`
- Multi-tenant isolation via `requireStoreAccess()`
- Verificacao admin OU `can_edit`
- Cascade delete
- Logging

E mais seguro e completo que o browser Supabase `.delete()` que o componente usa hoje.

---

## Change Log

| Data | Mudanca | Autor |
|------|---------|-------|
| 2026-02-28 | Story criada a partir de `docs/bugs/bug-client-stores-empty-state.md` | @sm (River) |
