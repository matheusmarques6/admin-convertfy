# Investigação: Lojas não aparecem na página de Lojas, mas aparecem nos Clientes

**Data:** 2026-02-28
**Status:** Bug confirmado — divergência de query entre os dois fluxos

---

## Resumo do Problema

Ao acessar **Clientes > [Cliente] > Aba Lojas**, as lojas vinculadas aparecem corretamente.
Ao acessar **Lojas** (menu lateral), a página mostra "Nenhuma loja encontrada" / "Cadastre lojas nos clientes para vê-las aqui".

---

## Fluxo 1: Clientes > Lojas (FUNCIONA)

### Caminho do código

```
/clients/[id] (Server Component)
  → src/app/(dashboard)/clients/[id]/page.tsx
    → <ClientDetailTabs>
      → <ClientStores clientId={client.id}>
        → src/components/clients/client-stores.tsx (linha 162-181)
```

### Query executada

```typescript
// client-stores.tsx — linha 162
const supabase = createClient()  // browser client, RLS ativo
const { data } = await supabase
  .from("client_stores")
  .select("id, store_name, store_url, platform, ...")
  .eq("client_id", clientId)          // ← filtra por client_id
  .order("created_at", { ascending: false })
```

### Características
- **Filtro**: `.eq("client_id", clientId)` — filtra pelo ID do cliente
- **NÃO filtra por `org_id`** — confia na RLS para isolamento
- **Sem cache** — busca direto do Supabase
- **Sem filtro `is_active`** — mostra todas as lojas
- **Client**: `createClient()` (browser) — RLS ativo

---

## Fluxo 2: Página de Lojas (NÃO FUNCIONA)

### Caminho do código

```
/stores (Page)
  → src/app/(dashboard)/stores/page.tsx
    → <PagePermissionWrapper requiresStoreAccess>
      → <StoresPageTabs>
        → <StoreControlPanel>
          → fetch('/api/stores/control')
            → src/app/api/stores/control/route.ts
```

### Query executada

```typescript
// stores/control/route.ts — linha 80-108
const supabase = await createClient()  // server client, RLS ativo
const orgId = await resolveOrgId(user.id)  // busca org_id do user

let query = supabase
  .from('client_stores')
  .select(`id, client_id, org_id, store_name, ...`)
  .eq('org_id', orgId)           // ← filtra por org_id
  .order('store_name')

if (activeOnly) {                // ← default: true
  query = query.eq('is_active', true)
}
```

### Características
- **Filtro**: `.eq('org_id', orgId)` — filtra pela organização do usuário
- **Também filtra `is_active = true`** por padrão
- **Cache de 10 minutos** em memória
- **Client**: `createClient()` (server) — RLS ativo
- **Dupla verificação**: RLS + filtro explícito por `org_id`

---

## Causa Raiz Identificada

### O campo `org_id` em `client_stores` pode estar NULL

A coluna `org_id` foi adicionada em `20260216_add_org_id_multitenant.sql` com um backfill:

```sql
UPDATE client_stores cs
SET org_id = cl.org_id
FROM clients cl
WHERE cs.client_id = cl.id
  AND cl.org_id IS NOT NULL
  AND cs.org_id IS NULL;
```

**Problema**: Se lojas foram criadas ANTES da migration de backfill, ou se o `client.org_id` estava NULL no momento do backfill, o `org_id` das lojas permanece NULL.

### Por que funciona nos Clientes mas não em Lojas?

| Aspecto | Clientes (funciona) | Lojas (não funciona) |
|---------|---------------------|----------------------|
| **Filtro principal** | `.eq("client_id", clientId)` | `.eq("org_id", orgId)` |
| **org_id NULL** | Não importa — filtra por client_id | **EXCLUI a loja** (NULL ≠ orgId) |
| **is_active** | Não filtra | Filtra `true` por padrão |
| **Cache** | Nenhum | 10 min (pode estar stale) |
| **Contexto** | Browser Supabase | Server API route |

**Quando `org_id` é NULL na `client_stores`:**
- A query `.eq("client_id", clientId)` **ENCONTRA** a loja (client_id está preenchido)
- A query `.eq("org_id", orgId)` **NÃO ENCONTRA** a loja (NULL ≠ qualquer valor)

---

## Causas Secundárias Possíveis

### 1. Lojas com `is_active = false`
- A API `/api/stores/control` filtra `is_active = true` por padrão
- A tela de clientes NÃO filtra por `is_active`
- Lojas inativas aparecem nos clientes mas não em lojas

### 2. Cache stale (10 minutos)
- Se lojas foram adicionadas recentemente, o cache pode não incluí-las
- O endpoint aceita `?fresh=true` para bypass

### 3. RLS + `agent_store_access` (para não-admins/não-owners)
- A função `can_access_store(id)` verifica se o user é admin, owner, ou tem acesso via `agent_store_access`
- Lojas criadas via aba Clientes NÃO criam registro em `agent_store_access`
- Lojas standalone (avulsas) SIM criam o registro automaticamente
- Para non-admin users, isso pode bloquear via RLS

### 4. `resolveOrgId()` falha silenciosamente
- Se o user não tem `org_members` ativo, retorna erro 403
- Mas isso geraria um toast de erro, não o estado vazio

---

## Solução Recomendada

### Fix 1: Backfill `org_id` nas lojas existentes (URGENTE)

Rodar SQL no Supabase para preencher `org_id` onde está NULL:

```sql
-- Verificar quantas lojas tem org_id NULL
SELECT count(*) FROM client_stores WHERE org_id IS NULL;

-- Backfill via client
UPDATE client_stores cs
SET org_id = cl.org_id
FROM clients cl
WHERE cs.client_id = cl.id
  AND cl.org_id IS NOT NULL
  AND cs.org_id IS NULL;

-- Verificar se ainda restam
SELECT id, store_name, client_id, org_id FROM client_stores WHERE org_id IS NULL;
```

### Fix 2: Garantir `org_id` na criação de lojas (PREVENTIVO)

No `src/app/api/client-stores/credentials/route.ts`, quando uma loja é criada COM `client_id`, garantir que `org_id` seja setado explicitamente:

```typescript
// Ao criar loja com client_id, buscar o org_id do client
if (storeData.client_id) {
  const { data: client } = await adminClient
    .from('clients')
    .select('org_id')
    .eq('id', storeData.client_id)
    .single()

  if (client?.org_id) {
    storeData.org_id = client.org_id
  }
}
```

### Fix 3: Remover filtro `is_active` padrão ou alinhar (MELHORIA)

Duas opções:
- **Opção A**: Remover o default `active_only = true` do `/api/stores/control` para mostrar todas
- **Opção B**: Adicionar mesmo filtro `is_active` na tela de clientes para consistência

### Fix 4: Invalidar cache após criar loja (MELHORIA)

No endpoint de criação (`POST /api/client-stores/credentials`), limpar o cache:

```typescript
// Após insert bem-sucedido, invalidar cache
cache.delete(`stores-control:${orgId}:true`)
cache.delete(`stores-control:${orgId}:false`)
```

---

## Arquivos Envolvidos

### Frontend
| Arquivo | Função |
|---------|--------|
| `src/app/(dashboard)/stores/page.tsx` | Página de lojas (shell) |
| `src/components/stores/store-control-panel.tsx` | Painel principal, fetch `/api/stores/control` |
| `src/components/stores/stores-page-tabs.tsx` | Tabs: Lojas + Alertas |
| `src/components/clients/client-stores.tsx` | Aba Lojas dentro do cliente |
| `src/app/(dashboard)/clients/[id]/page.tsx` | Página de detalhe do cliente |
| `src/components/clients/client-detail-tabs.tsx` | Tabs do cliente |

### Backend
| Arquivo | Função |
|---------|--------|
| `src/app/api/stores/control/route.ts` | API principal da página de lojas |
| `src/app/api/stores/route.ts` | API simples de listagem |
| `src/app/api/client-stores/credentials/route.ts` | Criar/editar lojas |
| `src/lib/api/resolve-org.ts` | Resolve org_id do user |
| `src/lib/api/require-store-access.ts` | Validação de acesso a loja |

### Database / RLS
| Arquivo | Função |
|---------|--------|
| `supabase/migrations/00001_initial_schema.sql` | Schema original |
| `supabase/migrations/20260216_add_org_id_multitenant.sql` | Adicionou `org_id` + backfill |
| `supabase/migrations/20260224_standalone_stores.sql` | `client_id` nullable + trigger |
| `supabase/migrations/20260228_cleanup_orphan_policies.sql` | RLS policies finais |
| `supabase/migrations/20250125_05_rls_helpers.sql` | Funções helper RLS |

---

## Diagrama do Fluxo

```
┌─────────────────────────────────────────────────────────────┐
│                    FLUXO CLIENTES (OK)                      │
│                                                             │
│  /clients/[id]  →  ClientStores  →  createClient()          │
│                                      │                      │
│                    SELECT * FROM client_stores               │
│                    WHERE client_id = :clientId               │
│                          ↓                                  │
│                    RLS: can_access_store(id)                 │
│                          ↓                                  │
│                    ✅ Retorna lojas (org_id irrelevante)     │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                    FLUXO LOJAS (BUG)                        │
│                                                             │
│  /stores  →  StoreControlPanel  →  /api/stores/control      │
│                                      │                      │
│              resolveOrgId(user.id) → orgId                  │
│                                      │                      │
│              SELECT * FROM client_stores                    │
│              WHERE org_id = :orgId                          │
│              AND is_active = true                            │
│                    ↓                                        │
│              RLS: can_access_store(id)                       │
│                    ↓                                        │
│              ❌ org_id NULL → excluído do resultado          │
└─────────────────────────────────────────────────────────────┘
```

---

## Prioridade de Implementação

1. **Fix 1** (Backfill SQL) — Resolve o problema imediatamente para dados existentes
2. **Fix 2** (org_id na criação) — Previne que novas lojas tenham org_id NULL
3. **Fix 4** (Invalidar cache) — Garante que lojas novas apareçam sem delay
4. **Fix 3** (Alinhar is_active) — Melhoria de consistência UX
