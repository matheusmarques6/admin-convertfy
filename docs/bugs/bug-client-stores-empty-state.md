# Bug: Aba "Lojas" do Cliente Mostra "Nenhuma Loja Vinculada"

**Data:** 2026-02-28
**Status:** Diagnosticado
**Severidade:** Alta (funcionalidade core quebrada)
**Agentes:** Explore (mapeamento), Architect (RLS), Dev (solucao)

---

## 1. Sintoma

Na aba **Clientes > [Cliente] > Lojas**, mesmo com lojas cadastradas e puxando dados:
- Empty state: "Nenhuma loja vinculada"
- Adicionar loja pela aba tambem nao funciona (nao aparece apos criar)
- **Usuario e org owner** — descarta RLS como causa isolada

---

## 2. Causa Raiz Identificada

### O problema: Query Supabase direto do browser

O componente `client-stores.tsx` e o **unico local** que faz query Supabase direto do browser:

```ts
// src/components/clients/client-stores.tsx (linha 162-181)
const supabase = createClient()  // ← browser client (@/lib/supabase/client)
const { data, error } = await supabase
  .from("client_stores")
  .select("id, store_name, ..., shopify_access_token, klaviyo_private_key, ...")
  .eq("client_id", clientId)
  .order("created_at", { ascending: false })

if (error) throw error   // ← se erro, cai no catch
setStores(data || [])     // ← se RLS filtra, retorna [] sem erro
```

**O catch esconde qualquer erro como "sem lojas":**
```ts
catch (error) {
  console.error("Error loading stores:", error)
  setStores([])  // ← QUALQUER erro = mostra empty state
}
```

### Por que a pagina `/stores` funciona

| Local | Metodo | Funciona? |
|-------|--------|-----------|
| Pagina `/stores` | `fetch('/api/stores')` → server-side `createClient()` | **SIM** |
| Aba Lojas do cliente | Browser `createClient()` direto | **NAO** |

A pagina `/stores` usa a **API route** (`GET /api/stores`) que roda no servidor:
```ts
// src/app/api/stores/route.ts
const supabase = await createClient()  // ← server-side, le cookies do request
const orgId = await resolveOrgId(user.id)
let query = supabase
  .from("client_stores")
  .select(`id, store_name, ..., client:clients(id, name, company, email)`)
  .eq("org_id", orgId)
```

### Fatores que comprovam o diagnostico

1. **Browser client vs Server client**: O browser client (`createBrowserClient`) depende de cookies acessiveis no browser. Se ha qualquer problema com refresh de sessao, httpOnly cookies, ou middleware de auth, o `auth.uid()` retorna NULL e TODAS as funcoes RLS negam acesso.

2. **Erro silenciado**: O `catch` transforma qualquer erro (PostgREST, RLS, auth) em `setStores([])`. O usuario ve "nenhuma loja" mas o console pode ter o erro real.

3. **Credenciais na query**: A query seleciona campos encriptados (`shopify_access_token`, `klaviyo_private_key`, etc.) — embora isso nao quebre a query, retorna strings `enc:v1:...` inuteis para a UI.

4. **Criacao tambem falha/nao aparece**: O POST para `/api/client-stores/credentials` roda no servidor (funciona), mas o `loadStores()` chamado apos salvar usa o browser client (falha silenciosamente).

---

## 3. Evidencia: Fluxo de Criacao

Quando o usuario clica "Adicionar Loja" na aba do cliente:

```
1. handleSave() → POST /api/client-stores/credentials
   body: { client_id: clientId, store_name, ... }
   → Roda no SERVIDOR (server-side createClient)
   → INSERT com RLS → PODE FUNCIONAR (server auth OK)
   → Retorna { success: true, store: {...} }

2. Toast: "Loja adicionada!" (ou "Erro ao salvar")

3. loadStores() → query BROWSER Supabase
   → .eq("client_id", clientId)
   → Browser auth pode estar quebrada
   → Retorna [] ou erro
   → catch: setStores([])
   → UI mostra "Nenhuma loja vinculada" ← BUG
```

O usuario ve o toast de sucesso mas a loja nao aparece na lista.
OU o POST falha e o toast mostra "Erro ao salvar" (o usuario disse "nao esta indo").

---

## 4. Solucao

### Fix principal: Trocar browser query por API fetch

A API `/api/stores` ja existe, ja funciona, e ja suporta `?client_id=` filter.

**Antes (quebrado):**
```ts
async function loadStores() {
  const supabase = createClient()  // browser client
  const { data, error } = await supabase
    .from("client_stores")
    .select("id, store_name, ...")
    .eq("client_id", clientId)
  if (error) throw error
  setStores(data || [])
}
```

**Depois (funcional):**
```ts
async function loadStores() {
  const res = await fetch(`/api/stores?client_id=${clientId}`)
  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.error || "Erro ao carregar lojas")
  }
  const { stores } = await res.json()
  setStores(stores || [])
}
```

### Fix secundario: Error reporting visivel

```ts
catch (error) {
  console.error("Error loading stores:", error)
  toast({
    variant: "destructive",
    title: "Erro ao carregar lojas",
    description: error instanceof Error ? error.message : "Erro desconhecido",
  })
  // NAO esconder como empty state - manter stores no estado anterior
}
```

### Fix preventivo: Nao selecionar credenciais encriptadas

A query atual seleciona `shopify_access_token`, `klaviyo_private_key`, etc. Esses campos voltam como `enc:v1:...` (inuteis). A API `/api/stores` ja nao retorna credenciais.

---

## 5. Arquivos a Modificar

| Arquivo | Acao | Prioridade |
|---------|------|------------|
| `src/components/clients/client-stores.tsx` | Trocar `createClient().from()` por `fetch('/api/stores?client_id=')` em `loadStores()` | **CRITICA** |
| `src/components/clients/client-stores.tsx` | Melhorar catch para mostrar toast de erro | **ALTA** |
| `src/app/api/stores/route.ts` | Nenhuma — ja funciona | - |

---

## 6. Validacao

Apos aplicar o fix:
- [ ] Aba "Lojas" do cliente mostra lojas vinculadas (owner)
- [ ] Aba "Lojas" do cliente mostra lojas vinculadas (membro comum)
- [ ] "Adicionar Loja" cria e aparece imediatamente na lista
- [ ] Erros de carregamento mostram toast (nao empty state falso)
- [ ] Pagina `/stores` continua funcionando normalmente
- [ ] Editar loja existente funciona e reflete na lista

---

## 7. Query de Diagnostico

Para confirmar que lojas existem no banco:

```sql
-- Ver lojas do cliente especifico
SELECT id, store_name, client_id, org_id, is_active, created_at
FROM client_stores
WHERE client_id = '<UUID_DO_CLIENTE>'
ORDER BY created_at DESC;

-- Ver se existem lojas avulsas (sem cliente)
SELECT id, store_name, client_id, org_id
FROM client_stores
WHERE org_id = '<SUA_ORG_ID>' AND client_id IS NULL;

-- Verificar policies ativas na tabela
SELECT policyname, cmd, LEFT(qual::text, 80)
FROM pg_policies
WHERE tablename = 'client_stores'
ORDER BY policyname;
```

---

*Causa raiz: `client-stores.tsx` usa browser Supabase client direto (unico componente que faz isso), enquanto todo o resto do app usa API routes server-side. O `catch` silencia erros como empty state.*
