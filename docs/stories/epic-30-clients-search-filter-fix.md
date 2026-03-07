# Epic 30 - Correcao de Pesquisa e Filtros na Pagina de Clientes

## Descricao
A barra de pesquisa e filtros na pagina `/clients` do dashboard admin esta completamente quebrada. A UI gera URL params corretamente (`?search=X&status=Y&health=Z`), mas o server component ignora todos os parametros, retornando sempre a lista completa sem filtros. Adicionalmente, a paginacao descarta filtros ativos ao mudar de pagina.

## Problema Raiz
1. `page.tsx` declara `PageProps` apenas com `{ page?: string }`, ignorando `search`, `status` e `health`
2. `getClients()` aceita apenas `page: number` e nao aplica nenhum filtro WHERE na query Supabase
3. `clients-table.tsx` hardcoda `/clients?page=N` nos botoes de paginacao, descartando filtros
4. `clients-filters.tsx` tem bugs menores em `clearFilter()` (nao reseta page)

## Stories

| Story | Titulo | Prioridade | Dependencia | Notas |
|-------|--------|------------|-------------|-------|
| 30.1 | Aplicar filtros no server component + validacao + empty state | CRITICA | - | Inclui sanitize ILIKE, validacao server-side (absorvida da 30.3), empty state diferenciado |
| 30.2 | Preservar filtros na paginacao | ALTA | 30.1 | Sem alteracoes |
| 30.3 | Reset de page ao limpar/aplicar filtros | BAIXA | 30.1 | Escopo reduzido: apenas fixes client-side (clearFilter/applyFilters) |

## Dependencias
```
30.1 (server filters) --> 30.2 (pagination preserves filters)
30.1 (server filters) --> 30.3 (sanitization + page reset)
30.2 e 30.3 sao independentes entre si
```

## Arquivos Afetados
- `src/lib/utils/sanitize-search.ts` (NOVO - helper reutilizavel)
- `src/app/(dashboard)/clients/page.tsx`
- `src/components/clients/clients-table.tsx`
- `src/components/clients/clients-filters.tsx`
