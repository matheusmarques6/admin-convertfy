---
Prioridade: P1
Sprint: Backlog
Assignee: "@dev (Dex)"
Revisao: "@architect"
Status: Draft
Epic: AE - Agent Email Generation
Fase: Admin UI / Prompts
Estimate: L
---

# Story AE-8 — `/admin/agents/prompts`: CRUD versionado + ativar/rollback

## User Story

**Como** dev ou architect,
**quero** uma página que liste prompts por tipo (copy, image, html, qa), permita editar com versionamento e ativar/rollback com 1 clique,
**para que** eu possa iterar prompts em produção sem precisar de migration ou SQL.

---

## Contexto

A tabela `email_agent_configs` (criada em `20260621_email_generation_infra.sql`):
```sql
(id, agent_type, model, system_prompt, user_template, temperature, max_tokens, output_schema, version, is_active, created_at, created_by)
UNIQUE INDEX idx_agent_config_active ON email_agent_configs(agent_type) WHERE is_active = true;
```

Esta story constrói a UI + API para gerenciá-la. Sem A/B testing nesta fase — só 1 ativa por `agent_type`. Versionamento: cada save vira NOVA row com `version=max(version)+1, is_active=false`. Botão "Ativar" desativa a anterior e ativa a nova (transação atômica).

`agent_type` aceito: `copy | image | html | qa` (após AE-1 estender o CHECK).

---

## Acceptance Criteria

### AC AE-8.1 — API: listar prompts
- [ ] `GET /api/admin/agents/prompts` — retorna todos com agrupamento por `agent_type`
- [ ] Query opcional `?agent_type=copy`
- [ ] Auth: `requireAuth` + checagem `profile.role IN ('admin','owner')` OR `profile.tags @> ARRAY['dev']`
- [ ] Response:
  ```ts
  {
    by_type: {
      copy: { active: PromptDetail|null, history: PromptDetail[] },
      image: { ... },
      html: { ... },
      qa: { ... }
    }
  }
  ```
- [ ] `PromptDetail` inclui: id, version, model, temperature, max_tokens, system_prompt (truncated 500 chars preview), user_template (truncated), is_active, created_at, created_by_name

### AC AE-8.2 — API: detalhe (full)
- [ ] `GET /api/admin/agents/prompts/[id]` — retorna versão completa (sem truncate)
- [ ] Same auth

### AC AE-8.3 — API: criar nova versão (= editar)
- [ ] `POST /api/admin/agents/prompts`
- [ ] Body Zod:
  ```ts
  z.object({
    agent_type: z.enum(['copy','image','html','qa']),
    model: z.string().min(3),
    system_prompt: z.string().min(10).max(20000),
    user_template: z.string().min(10).max(20000),
    temperature: z.number().min(0).max(2).default(0.7),
    max_tokens: z.number().int().min(100).max(8000).default(2048),
    output_schema: z.unknown().nullable().optional()
  })
  ```
- [ ] Comportamento:
  1. SELECT max(version) WHERE agent_type=$agent_type → next_version
  2. INSERT com `version=next_version, is_active=false, created_by=user.id`
  3. Retorna 201 com o novo registro
- [ ] Valida `output_schema` é JSON Schema válido (parse com `ajv` ou Zod se aplicável). Se inválido → 400.
- [ ] NÃO ativa automaticamente

### AC AE-8.4 — API: ativar versão
- [ ] `POST /api/admin/agents/prompts/[id]/activate`
- [ ] Transação atômica:
  ```sql
  BEGIN;
  UPDATE email_agent_configs SET is_active=false
    WHERE agent_type=(SELECT agent_type FROM email_agent_configs WHERE id=$id)
      AND is_active=true;
  UPDATE email_agent_configs SET is_active=true WHERE id=$id;
  COMMIT;
  ```
- [ ] Idempotente: se já ativo, retorna 200 sem mudanças
- [ ] Log `prompt.activated` com `{ agent_type, version, id, activated_by }`

### AC AE-8.5 — API: rollback
- [ ] `POST /api/admin/agents/prompts/[id]/rollback`
- [ ] Body: `{ to_version: number }`
- [ ] Pega versão alvo do mesmo `agent_type` e a ativa (mesma lógica de `/activate`)
- [ ] Retorna 200 com `{ activated_version, previous_active_version }`
- [ ] Erro 404 se versão alvo não existe
- [ ] Erro 409 se versão alvo já é a ativa

### AC AE-8.6 — Página `/admin/agents/prompts`
- [ ] Arquivo: `src/app/admin/agents/prompts/page.tsx`
- [ ] Server component lê profile + redireciona se não admin/dev
- [ ] Layout: tabs no topo (`Copy | Image | HTML | QA`)
- [ ] Conteúdo da tab:
  - Card "Versão ativa" com botão "Editar" (cria nova versão)
  - Histórico de versões (collapsível) com botões "Ativar" e "Ver diff"
- [ ] Editor: textarea grande para `system_prompt` e `user_template` com syntax highlighting (usar `react-textarea-autosize` ou similar — verificar libs do projeto)

### AC AE-8.7 — Editor com placeholders documentados
- [ ] Painel lateral: lista de variáveis `{{var}}` suportadas por agent_type, lidas de `src/lib/agents/email-generation.service.ts` (`buildAllVars`)
- [ ] Auto-completion básico ao digitar `{{` (nice-to-have; pode ser apenas sidebar estática)
- [ ] Botão "Validar template" — verifica que todos os `{{var}}` no template existem na lista de variáveis disponíveis

### AC AE-8.8 — Confirmação de ativação
- [ ] Botão "Ativar nova versão" → modal:
  - Diff side-by-side entre versão ativa atual e nova
  - Aviso amarelo: "Esta mudança afeta TODOS os emails gerados a partir de agora"
  - Confirmação dupla (typing "ativar" para confirmar)
- [ ] Toast de sucesso + atualiza lista

### AC AE-8.9 — Validação de output_schema
- [ ] Se `agent_type IN ('copy','qa')` e `output_schema IS NULL` → permite (degrade)
- [ ] Se `output_schema` informado: valida com `ajv` que é JSON Schema válido
- [ ] Botão "Testar schema" no editor: rodar contra exemplo mock para validar

### AC AE-8.10 — Auditoria
- [ ] INSERT em tabela existente `events` (se existir; senão usar `email_generation_runs` com `agent='seed'`):
  - `event_type='prompt.created'` ou `'prompt.activated'` ou `'prompt.rolled_back'`
  - `metadata={ agent_type, version, id, actor_id }`

### AC AE-8.11 — Visibilidade na sidebar do admin
- [ ] Adicionar link "Prompts" na sidebar/nav do admin (apenas se admin/dev)
- [ ] Path: `/admin/agents/prompts`

### AC AE-8.12 — Testes
- [ ] Teste API: criar nova versão incrementa version corretamente
- [ ] Teste API: ativar transição UPDATE/UPDATE é atômica (1 e somente 1 versão ativa)
- [ ] Teste API: rollback de version=5 para version=3 funciona
- [ ] Teste API: rollback para versão inexistente → 404
- [ ] Teste UI integration: editar prompt → ativar → verifica que próxima geração usa a nova versão (mock do email-generation.service.ts lendo `is_active=true`)

---

## Tarefas

- [ ] Criar `src/app/api/admin/agents/prompts/route.ts` (GET, POST)
- [ ] Criar `src/app/api/admin/agents/prompts/[id]/route.ts` (GET detalhe)
- [ ] Criar `src/app/api/admin/agents/prompts/[id]/activate/route.ts` (POST)
- [ ] Criar `src/app/api/admin/agents/prompts/[id]/rollback/route.ts` (POST)
- [ ] Criar página `src/app/admin/agents/prompts/page.tsx`
- [ ] Criar componente `src/components/agents/prompt-editor.tsx`
- [ ] Criar componente `src/components/agents/prompt-history.tsx`
- [ ] Criar componente `src/components/agents/prompt-diff-modal.tsx`
- [ ] Criar `src/lib/services/prompt-management.service.ts` (encapsula lógica DB)
- [ ] Adicionar link na sidebar admin (provavelmente `src/components/admin/sidebar.tsx`)
- [ ] Testes

---

## Dev Notes

### Por que sem A/B testing nesta fase?

A/B testing adiciona complexidade (split traffic, tracking de performance por variant). Volume atual (≤10 lojas confirmadas/semana × 7 emails) não justifica. Pode entrar em V2 quando volume crescer.

### Sobre `output_schema`

Hoje usado por `copy` (validar estrutura do JSON gerado pelo n8n). AE-5 adiciona `qa` que também usa. Image e HTML não validam schema (output é texto/url).

### Locking de campos

Quando uma versão está ativa, ela NÃO pode ser editada in-place. Edits sempre criam nova versão. Isso simplifica o audit trail e o rollback.

### Diff entre versões

Usar `diff-match-patch` (Google) ou `jsdiff` (verificar se já no projeto). Side-by-side com cores em vermelho/verde.

### Por que a sidebar é dev-only?

Mudanças de prompt afetam outputs de IA. Apenas roles `admin | owner` ou tag `dev` veem o link. Designer/CS não devem mexer (eles consomem o output, não o controlam).

---

## Reuso de padrões existentes

- `createAdminClient`, `requireAuth`, `errorResponse/successResponse` — padrão API
- Tabela `email_agent_configs` — já existe
- Index `idx_agent_config_active` — já garante unicidade do ativo
- Diff library: verificar `package.json`

### Endpoint legacy: manter dual (decisão tomada)

Já existe `/api/admin/email-agent-configs/route.ts` (GET/POST/PATCH) fazendo CRUD na mesma tabela. **Decisão**: ambos os endpoints permanecem ativos em paralelo:

- `/api/admin/email-agent-configs/*` — endpoint legacy, continua funcionando como está
- `/api/admin/agents/prompts/*` — novos endpoints desta story (com versionamento explícito, ativar, rollback, diff)

**Regra de implementação**: ambos devem terminar chamando o mesmo `prompt-management.service.ts`. Lógica de validação, versionamento e activate/rollback fica centralizada no service. Os route handlers são wrappers finos.

Não há plano de deprecação nesta fase — convive-se com os dois caminhos. UI nova (`/admin/agents/prompts`) usa o namespace novo. Scripts internos e UI antiga (se existir) continuam usando o legacy.

---

## File List

### A criar
- `src/app/api/admin/agents/prompts/route.ts`
- `src/app/api/admin/agents/prompts/[id]/route.ts`
- `src/app/api/admin/agents/prompts/[id]/activate/route.ts`
- `src/app/api/admin/agents/prompts/[id]/rollback/route.ts`
- `src/app/admin/agents/prompts/page.tsx`
- `src/components/agents/prompt-editor.tsx`
- `src/components/agents/prompt-history.tsx`
- `src/components/agents/prompt-diff-modal.tsx`
- `src/lib/services/prompt-management.service.ts`
- Testes correspondentes

### A modificar
- `src/components/admin/sidebar.tsx` (ou file equivalente) — adicionar link
- `package.json` — adicionar `diff` ou `jsdiff` (se ainda não estiver)

---

## Dependencias

- **Bloqueado por**: AE-1 (CHECK estendido para `qa`)
- **Bloqueia**: nada — sistema funciona com prompts editados via SQL; UI é conveniência

---

## Riscos

| Risco | Probabilidade | Mitigação |
|-------|---------------|-----------|
| Prompt quebrado ativado quebra geração | Alta | Confirmação dupla + diff + rollback 1-clique |
| Race em activate (duas pessoas ativando simultâneo) | Baixa | Transação atômica + index unique |
| Output_schema mal validado bypass produção | Média | Validação no POST + teste "Validar schema" no UI |
| Editor sem auto-save → perda de trabalho | Média | Draft em localStorage por agent_type |
| Histórico cresce ilimitado | Baixa | Sem TTL nesta fase; volume baixo (manual edits) |

---

## Change Log

| Data | Autor | Descrição |
|------|-------|-----------|
| 2026-05-29 | @architect | Story criada |
