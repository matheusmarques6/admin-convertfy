# Estabilidade Técnica Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** fazer lint e testes confiáveis, corrigindo as falhas conhecidas pela causa raiz.

**Architecture:** correções mínimas nos pontos que definem os gates: script npm, configuração Vitest e contratos dos testes. `TASK_SLUG_MAP` continua sendo a única origem para determinar que task possui um email.

**Tech Stack:** Next.js 15, TypeScript, ESLint, Vitest 4 e Supabase mocks.

**Spec:** `docs/superpowers/specs/2026-08-31-stability-cleanup-refactor-design.md`

## Global Constraints

- Sem dependências novas e sem aumento de timeout como correção.
- Preservar APIs de produção; mudar somente configuração, nomes privados e testes que contradizem o contrato canônico.
- Gates finais: `npm run typecheck`, `npm run lint` e `npm test`.

---

### Task 1: Registrar baseline e separar causas

**Files:**
- Read: `package.json`, `vitest.config.ts`
- Read: os cinco arquivos de teste apontados na auditoria.

- [ ] **Step 1: Executar os gates sem editar.**

Run: `npm run typecheck`, `npm run lint`, `npm test`.

Expected: registrar separadamente shell Windows, transformação TSX, mock de admin, `post_purchase`/`upsell` e imports lentos.

- [ ] **Step 2: Registrar no ledger.**

Registrar SHA base, contagens e nomes dos testes. Não classificar falha de ambiente como falha de produção.

### Task 2: Restaurar lint portável e sem falso Hook

**Files:**
- Modify: `package.json`
- Modify: `src/lib/services/campaign-central/anthropic-client.ts:24,193,281`

**Interfaces:**
- Produces: `shouldUseOpenRouter(): boolean`, privada; dois callers usam esse nome.

- [ ] **Step 1: Confirmar os três usos.**

Run: `rg -n 'useOpenRouter' src`.

Expected: definição e duas chamadas em `anthropic-client.ts`.

- [ ] **Step 2: Corrigir o script e o nome.**

```json
"lint": "eslint \"src/**/*.{ts,tsx,js,mjs}\" --max-warnings=0"
```

```ts
function shouldUseOpenRouter(): boolean {
  return !!process.env.OPENROUTER_API_KEY
}

if (shouldUseOpenRouter()) {
  // lógica existente
}
```

- [ ] **Step 3: Verificar.**

Run: `npm run lint`.

Expected: nenhum erro de Hooks nem erro de shell no Windows.

### Task 3: Corrigir transformação TSX do Vitest

**Files:**
- Modify: `vitest.config.ts`
- Test: `src/components/settings/settings-sections.test.ts`

**Interfaces:**
- Produces: transformação JSX exclusiva do Vitest; `tsconfig.json` do Next permanece inalterado.

- [ ] **Step 1: Reproduzir isoladamente.**

Run: `npx.cmd vitest run src/components/settings/settings-sections.test.ts`.

Expected: falha de import analysis no JSX válido de `settings-modal.tsx`.

- [ ] **Step 2: Configurar esbuild no Vitest.**

```ts
esbuild: {
  jsx: "automatic",
},
```

- [ ] **Step 3: Verificar.**

Run: `npx.cmd vitest run src/components/settings/settings-sections.test.ts`.

Expected: todos os casos passam.

### Task 4: Corrigir mock de notificações

**Files:**
- Modify: `src/lib/services/email-generation-notify.service.test.ts`
- Read: `src/lib/services/notification.service.ts:281-343`

**Interfaces:**
- Consumes: import dinâmico de `createAdminClient` de `@/lib/supabase/admin`.

- [ ] **Step 1: Fazer o teste falhar isoladamente.**

Run: `npx.cmd vitest run src/lib/services/email-generation-notify.service.test.ts`.

Expected: `SUPABASE_SERVICE_ROLE_KEY is not defined`.

- [ ] **Step 2: Mockar o módulo realmente usado.**

```ts
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: (tableName: string) => buildQuery(tableName) }),
}))
```

- [ ] **Step 3: Verificar.**

Run: `npx.cmd vitest run src/lib/services/email-generation-notify.service.test.ts`.

Expected: 9 testes passam sem ambiente Supabase real.

### Task 5: Alinhar task de pós-compra ao mapa canônico

**Files:**
- Modify: `src/lib/services/email-task-sync.service.test.ts:335-346`
- Read: `src/lib/email-task-sync/slug-mapping.ts:50-105,230-260`

- [ ] **Step 1: Reproduzir a divergência.**

Run: `npx.cmd vitest run src/lib/services/email-task-sync.service.test.ts`.

Expected: `post_purchase` não encontra target e a task fica `review`.

- [ ] **Step 2: Corrigir a fixture, não o mapa.**

```ts
seedFlow({ id: "f1", storeId: "s1", flowType: "upsell" })
```

Renomear o caso para `piloto 1:1 upsell → completed`.

- [ ] **Step 3: Verificar.**

Run: `npx.cmd vitest run src/lib/services/email-task-sync.service.test.ts`.

Expected: todos os casos passam sem criar fluxo duplicado.

### Task 6: Eliminar imports lentos dos hooks de teste

**Files:**
- Modify: `src/app/api/cron/email-generation-watchdog/route.test.ts:275-282`
- Modify: `src/app/api/admin/stores/[id]/start-onboarding/route.test.ts:186-190`

- [ ] **Step 1: Confirmar que o import frio é o atraso.**

Executar cada arquivo isoladamente; o primeiro `beforeEach(async () => import("./route"))` deve ser o ponto lento.

- [ ] **Step 2: Importar uma vez e resetar estado por caso.**

```ts
beforeAll(async () => {
  ;({ GET } = await import("./route"))
})

beforeEach(() => {
  vi.clearAllMocks()
  resetState()
})
```

Usar `POST` no segundo arquivo. Não mover `resetState` para `beforeAll`.

- [ ] **Step 3: Verificar.**

Run: `npx.cmd vitest run src/app/api/cron/email-generation-watchdog/route.test.ts src/app/api/admin/stores/[id]/start-onboarding/route.test.ts`.

Expected: nenhum hook expira.

### Task 7: Gate e revisão da fase

**Files:**
- Modify: somente arquivos das Tasks 2–6.

- [ ] **Step 1: Executar gate completo.**

Run: `npm run typecheck`, `npm run lint`, `npm test`.

Expected: código 0 nos três comandos.

- [ ] **Step 2: Commit atômico e revisão.**

```bash
git add package.json vitest.config.ts src
git commit -m "fix: restore quality gates"
```

Revisor confirma que não houve timeout aumentado, acesso a ambiente real ou alteração do contrato canônico.
