# Limites de Componentes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** reduzir `email-detail-view.tsx` sem mudar sua API pública, URLs ou comportamento visual.

**Architecture:** `EmailDetailView` fica como orquestrador de dados, estados e mutações. As abas render, copy, HTML, referência e edição de blocos passam a módulos adjacentes que recebem props explícitas; não criar store, contexto ou serviço novo.

**Tech Stack:** React 19, TypeScript, SWR e componentes existentes do workspace de email.

**Spec:** `docs/superpowers/specs/2026-08-31-stability-cleanup-refactor-design.md`

## Global Constraints

- Executar somente após estabilidade e cortes seguros verdes.
- `EmailDetailViewProps` não muda.
- Não mudar endpoints, payloads, labels, tabs nem regras de status.
- Parar após este componente e medir novamente.

---

### Task 1: Fixar contrato externo antes de mover código

**Files:**
- Read: `src/components/stores/producao/email-detail-view.tsx:1-1238`
- Read: todos os consumidores de `EmailDetailView`.

- [ ] **Step 1: Localizar consumidores.**

Run: `rg -n 'EmailDetailView' src`.

Expected: registrar cada caller e props passadas.

- [ ] **Step 2: Fixar a estratégia de verificação.**

Este refactor não introduz lógica nova e o Vitest atual usa ambiente `node`; não adicionar framework DOM. O contrato é mantido por TypeScript, pela suíte Vitest completa e pela revisão de props/payloads contra a base.

- [ ] **Step 3: Capturar baseline.**

Run: `npm run typecheck` e `npm test`.

Expected: baseline verde antes de movimentação.

### Task 2: Extrair tipos e helpers puros

**Files:**
- Create: `src/components/stores/producao/email-detail-types.ts`
- Modify: `src/components/stores/producao/email-detail-view.tsx:47-101,2978-3003`

**Interfaces:**
- Produces: `EmailDetailResponse`, `GeneratedRefItem`, `EmailDetailViewProps` e `summarizeBlockContent` no módulo local.

- [ ] **Step 1: Mover apenas declarações sem React.**

```ts
export interface EmailDetailViewProps {
  storeId: string
  flow: EmailFlow
  emailId: string
  onEmailUpdated: () => void
  onNavigate: (emailId: string) => void
  onEmailDeleted?: () => void
  onEmailDuplicated?: (newEmailId: string) => void
}
```

- [ ] **Step 2: Atualizar imports do orquestrador.**

Manter nomes/campos idênticos e não criar barrel global.

- [ ] **Step 3: Verificar.**

Run: `npm run typecheck`.

Expected: nenhum tipo duplicado ou import cíclico.

### Task 3: Extrair abas somente leitura

**Files:**
- Create: `src/components/stores/producao/email-render-preview.tsx`
- Create: `src/components/stores/producao/email-copy-view.tsx`
- Create: `src/components/stores/producao/email-html-view.tsx`
- Create: `src/components/stores/producao/email-ref-view.tsx`
- Modify: `src/components/stores/producao/email-detail-view.tsx:1592-3003`

**Interfaces:**
- Produces: `EmailRenderPreview`, `EmailCopyView`, `EmailHtmlView`, `EmailRefView` com props explícitas.

- [ ] **Step 1: Mover uma aba por commit lógico.**

`EnvelopeRow` acompanha render, `CopyCard` acompanha copy e `RefMetaChip` acompanha ref. Helpers compartilhados ficam no arquivo de tipos apenas se forem puros.

- [ ] **Step 2: Manter callbacks como props.**

```ts
type EmailRenderPreviewProps = {
  email: EmailFlowEmail
  html: string
  width: number
  onEditSubject: (value: string) => Promise<void>
  onEditPreheader: (value: string) => Promise<void>
  onEditFromName: (value: string) => Promise<void>
  onEditFromEmail: (value: string) => Promise<void>
  onEditDelay: (value: string) => Promise<void>
}
```

- [ ] **Step 3: Verificar por extração.**

Run: `npm run typecheck` e `npm test`.

Expected: trocar abas preserva conteúdo e não cria fetch adicional.

### Task 4: Extrair editor estrutural de blocos

**Files:**
- Create: `src/components/stores/producao/email-block-editor.tsx`
- Modify: `src/components/stores/producao/email-detail-view.tsx:2705-4575`

**Interfaces:**
- Produces: `BlockCard` e `BlockContentEditor` locais.
- Consumes: `EmailBlock`, `BlockType`, `onPatch`, `onCopy` e `onRefresh` existentes.

- [ ] **Step 1: Mover editor e campos juntos.**

`BlockContentEditor`, `FieldLabel`, `FieldText`, `FieldTextarea`, `FieldButton` e `FieldImage` ficam no módulo novo. Não converter updates em reducer/contexto.

- [ ] **Step 2: Preservar contrato de patch.**

```ts
onPatch: (update: Record<string, unknown>) => Promise<void>
```

O update continua como `{ content: { ...content, [key]: value } }`.

- [ ] **Step 3: Verificar interação.**

Comparar o callback `onPatch` e o payload `{ content: { ...content, [key]: value } }` com a base no review package.

### Task 5: Enxugar orquestrador e revisar

**Files:**
- Modify: `src/components/stores/producao/email-detail-view.tsx`

- [ ] **Step 1: Manter somente estado compartilhado.**

Deixar SWR, abas, mutações, ações de status, navegação e composição; remover os componentes extraídos.

- [ ] **Step 2: Rodar gates.**

Run: `npm run typecheck`, `npm run lint` e `npm test`.

Expected: nenhum endpoint/prop público muda e o arquivo principal reduz materialmente.

- [ ] **Step 3: Commit e revisão final.**

```bash
git add src/components/stores/producao
git commit -m "refactor: split email detail views"
```

Revisor compara imports, props e payloads com a base. Alteração comportamental bloqueia o merge.
