# Epic 13 - Ver Todas as Lojas (Modal com Paginacao)

**Status:** Ready
**Prioridade:** P2 (Enhancement)
**Estimativa Total:** 3 stories, ~1 sprint

---

## Problema

Os cards Top Lojas e Atencao Necessaria no dashboard exibem apenas 5 lojas cada. Quando a organizacao tem mais de 5 lojas com Klaviyo configurado, nao ha forma de ver as demais. O usuario precisa de uma visao completa com todas as lojas ordenadas por receita.

## Solucao

Adicionar botao "Ver todas" nos dois cards que abre um modal (Dialog do shadcn/ui) com lista paginada (10 por pagina, client-side). O modal reutiliza o array `storeBreakdown` que a API ja retorna mas que o frontend atualmente ignora.

## Escopo

- **3 stories, 5 arquivos** (1 novo, 4 modificados)
- **0 mudancas backend** — a API ja retorna `storeBreakdown` com todas as lojas
- **Paginacao client-side** — dados ja estao no frontend via SWR

## Stories

| Story | Titulo | Fase | Depende de |
|-------|--------|------|------------|
| 13.1 | Criar componente StoresListModal | Componente | Nenhuma |
| 13.2 | Propagar storeBreakdown para os cards | Data Flow | Nenhuma |
| 13.3 | Integrar botao "Ver todas" nos cards | Integracao | 13.1, 13.2 |

## Diagrama de Dependencias

```
13.1 (Modal) ──┐
               ├──> 13.3 (Integracao nos cards)
13.2 (Data) ───┘
```

## Arquivos Impactados

| Arquivo | Story | Acao |
|---------|-------|------|
| `src/components/dashboard/stores-list-modal.tsx` | 13.1 | CRIAR |
| `src/components/dashboard/total-revenue-banner.tsx` | 13.2 | MODIFICAR |
| `src/components/dashboard/dashboard-layout.tsx` | 13.2 | MODIFICAR |
| `src/components/dashboard/top-stores-card.tsx` | 13.3 | MODIFICAR |
| `src/components/dashboard/worst-performers-card.tsx` | 13.3 | MODIFICAR |

---

## Change Log

| Data | Mudanca | Autor |
|------|---------|-------|
| 2026-03-04 | Epic criado — 3 stories para modal "Ver todas" nos cards de lojas | @sm (River) |
