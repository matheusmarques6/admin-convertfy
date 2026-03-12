# Epic 35 — Portal User Profile Orphan Bug

## Resumo

Bug critico onde usuarios criados pelo formulario publico de onboarding ficam com profile orfao no banco: `role: 'sdr'` (hardcoded no trigger) e `account_type: 'admin'` (default da coluna), sem registro em `org_members`. Isso causa erro PGRST116 ao acessar rotas admin e polui a tabela `profiles` com registros que nao deveriam existir.

### Causa Raiz

O trigger `handle_new_user` no Postgres (migration `00001_initial_schema.sql`) sempre cria um profile para TODOS os `auth.users`, sem diferenciar portal users de admin users. Portal users sao gerenciados via `client_portal_users` e NAO precisam de profile.

### Usuarios Afetados em Producao

- `acessos@convertfy.me` (id: `dff9fb8d-5d07-43ee-b3fb-b6674f17e225`)
- `sejacriativvo@gmail.com` (id: `3d9cc0e3-3eab-4b9a-aa7e-57f0c109e843`)

## Escopo

| Story | Titulo | Prioridade | Esforco | Dependencia |
|-------|--------|------------|---------|-------------|
| 35.1 | Fix trigger handle_new_user + limpar profiles orfaos | Critical | Baixo | - |
| 35.2 | Middleware guard portal vs admin routes | High | Medio | - |
| 35.3 | Normalizar client_id no user_metadata | Medium | Baixo | - |
| 35.4 | Criar tabela client_portal_activity | Low | Baixo | - |

## Dependencias

```
35.1 — independente (DEPLOY PRIMEIRO)
35.2 — independente (pode rodar em paralelo com 35.1)
35.3 — independente
35.4 — independente
```

**Recomendacao de deploy:** 35.1 deve ser deployado primeiro para parar o sangramento (novos portal users continuam criando profiles orfaos).

## Arquivos Principais

- `supabase/migrations/00001_initial_schema.sql` — trigger original `handle_new_user` (referencia)
- `src/lib/supabase/middleware.ts` — updateSession (35.2)
- `src/lib/services/portal-account.service.ts` — createPortalAccount (35.3)
- `src/app/api/portal/auth/route.ts` — login activity insert (35.4)
- `src/app/api/portal/auth/verify/route.ts` — verify activity insert (35.4)
- `src/app/api/admin/portal-users/[id]/send-invite/route.ts` — invite activity insert (35.4)

## Contexto de Producao

Investigacao de QA confirmou:
- Trigger `handle_new_user` em producao usa `'sdr'` como default (migration original usa `'cs'`, mas producao foi alterada manualmente)
- Portal auth (`/api/portal/auth`) usa APENAS `client_portal_users`, nunca `profiles` — safe to skip profile creation
- Usuarios dual (matheus@convertfy.me, ryan@convertfy.me) sao portal E admin — tem `is_portal_user: true` MAS tambem tem `org_members`. Middleware DEVE permitir acesso admin para eles
- 3 endpoints fazem INSERT em `client_portal_activity` que NAO existe — inserts falham silenciosamente
