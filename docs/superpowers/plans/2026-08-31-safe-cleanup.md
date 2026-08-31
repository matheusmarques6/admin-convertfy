# Cortes Seguros Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** remover somente código sem consumidor comprovado e criar um ponto único de acesso ao conhecimento e às tarefas abertas.

**Architecture:** exclusões pequenas e verificáveis, sem remoção de APIs ou tabelas. A documentação ganha índices por links, não uma migração em massa.

**Tech Stack:** TypeScript, Next.js, ripgrep, Knip e Markdown.

**Spec:** `docs/superpowers/specs/2026-08-31-stability-cleanup-refactor-design.md`

## Global Constraints

- Executar depois do plano de estabilidade verde.
- Não remover rota, migration, dependência ou feature pública neste plano.
- Cada exclusão exige busca de consumidores antes e typecheck/testes depois.

---

### Task 1: Remover cartão Google Calendar substituído

**Files:**
- Delete: `src/components/settings/google-calendar-card.tsx`
- Read: `src/components/settings/org-google-calendar-card.tsx`
- Read: `src/components/settings/sections/integrations.tsx`

- [ ] **Step 1: Confirmar consumidor zero.**

Run: `rg -n 'google-calendar-card|GoogleCalendarCard' src`.

Expected: somente a declaração antiga; a seção ativa importa `OrgGoogleCalendarCard`.

- [ ] **Step 2: Excluir o arquivo antigo.**

Não alterar `org-google-calendar-card.tsx`; ele já é a implementação ativa.

- [ ] **Step 3: Verificar.**

Run: `npm run typecheck`.

Expected: zero referências residuais.

### Task 2: Remover serviço de conta de portal sem consumidor

**Files:**
- Delete: `src/lib/services/portal-account.service.ts`

- [ ] **Step 1: Confirmar consumidor zero.**

Run: `rg -n 'portal-account\.service|portalAccountService|PortalAccountService' src`.

Expected: somente ocorrências no próprio arquivo.

- [ ] **Step 2: Excluir o serviço e verificar.**

Run: `npm run typecheck`.

Expected: nenhum erro e nenhum arquivo substituto criado.

### Task 3: Excluir fixture ritual não usada

**Files:**
- Modify: `src/components/ritual/ritual-tasks.tsx:72-170`

- [ ] **Step 1: Confirmar isolamento.**

Run: `rg -n 'MOCK_BLOCKS|TaskBlock' src/components/ritual/ritual-tasks.tsx`.

Expected: `TaskBlock` existe somente para tipar `MOCK_BLOCKS`.

- [ ] **Step 2: Remover fixture e tipo.**

Excluir `interface TaskBlock` e a constante inteira. Manter `TaskItem` se ainda usado pelo componente.

- [ ] **Step 3: Verificar.**

Run: `npx.cmd eslint src/components/ritual/ritual-tasks.tsx --max-warnings=0`.

Expected: nenhuma variável/tipo não usado.

### Task 4: Criar índice de conhecimento sem reorganização massiva

**Files:**
- Create: `docs/README.md`
- Create: `docs/backlog.md`
- Read: `docs/architecture/README.md`, `docs/api/README.md`, `docs/crm/README.md`, `docs/email-generation/README.md`

- [ ] **Step 1: Criar `docs/README.md` como entrada única.**

Linkar arquitetura atual, API, CRM, geração de emails, integrações, runbooks e backlog. Marcar `README.md` e `ARCHITECTURE.md` da raiz como histórico/não canônico até revisão separada.

- [ ] **Step 2: Criar `docs/backlog.md`.**

```md
| ID | Prioridade | Domínio | Estado | Próxima ação | Evidência |
|---|---|---|---|---|---|
| STAB-01 | P0 | Qualidade | Planejado | Executar plano de estabilidade | plano stability |
| CLEAN-01 | P1 | Limpeza | Planejado | Executar cortes confirmados | plano safe-cleanup |
| REFACTOR-01 | P2 | Produção de email | Planejado | Extrair limites de EmailDetailView | plano component-boundaries |
```

- [ ] **Step 3: Verificar links.**

Run: `rg -n '\]\([^)]*\)' docs/README.md docs/backlog.md`.

Expected: cada destino existe; os índices não copiam o conteúdo fonte.

### Task 5: Gate e revisão da fase

**Files:**
- Modify: somente arquivos das Tasks 1–4.

- [ ] **Step 1: Rodar análise estática.**

Run: `npx knip --include files --no-exit-code` com configuração que inclua layouts, routes, loading/error e imports dinâmicos do Next.

Expected: os três artefatos não aparecem; qualquer novo apontamento é investigado, não removido automaticamente.

- [ ] **Step 2: Rodar gates.**

Run: `npm run typecheck` e `npm test`.

Expected: não introduzir falhas novas.

- [ ] **Step 3: Commit e revisão independente.**

```bash
git add docs src/components/ritual/ritual-tasks.tsx
git rm src/components/settings/google-calendar-card.tsx src/lib/services/portal-account.service.ts
git commit -m "chore: remove confirmed dead code"
```

Revisor confirma consumidor zero e que nenhum endpoint público foi removido.
