---
Prioridade: P1
Sprint: Backlog
Assignee: "@dev (Dex)"
Revisao: "@architect"
Status: In Review
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
- [x] `GET /api/admin/agents/prompts` — retorna todos com agrupamento por `agent_type`
- [x] Query opcional `?agent_type=copy`
- [x] Auth: `requireAuth` + checagem `profile.role IN ('admin','owner')` OR `profile.tags @> ARRAY['dev']`
- [x] Response:
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
- [x] `PromptDetail` inclui: id, version, model, temperature, max_tokens, system_prompt (truncated 500 chars preview), user_template (truncated), is_active, created_at, created_by_name

### AC AE-8.2 — API: detalhe (full)
- [x] `GET /api/admin/agents/prompts/[id]` — retorna versão completa (sem truncate)
- [x] Same auth

### AC AE-8.3 — API: criar nova versão (= editar)
- [x] `POST /api/admin/agents/prompts`
- [x] Body Zod:
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
- [x] Comportamento:
  1. SELECT max(version) WHERE agent_type=$agent_type → next_version
  2. INSERT com `version=next_version, is_active=false, created_by=user.id`
  3. Retorna 201 com o novo registro
- [x] Valida `output_schema` é JSON Schema válido (validação estrutural — type/properties/items/$ref/anyOf/oneOf). Sem Ajv para evitar nova dep; suficiente para barrar lixo no POST.
- [x] NÃO ativa automaticamente

### AC AE-8.4 — API: ativar versão
- [x] `POST /api/admin/agents/prompts/[id]/activate`
- [x] Transação atômica (2 UPDATEs em sequência protegidos pelo unique index parcial `idx_agent_config_active`):
  ```sql
  BEGIN;
  UPDATE email_agent_configs SET is_active=false
    WHERE agent_type=(SELECT agent_type FROM email_agent_configs WHERE id=$id)
      AND is_active=true;
  UPDATE email_agent_configs SET is_active=true WHERE id=$id;
  COMMIT;
  ```
- [x] Idempotente: se já ativo, retorna 200 sem mudanças
- [x] Log `prompt.activated` com `{ agent_type, version, id, activated_by }`

### AC AE-8.5 — API: rollback
- [x] `POST /api/admin/agents/prompts/[id]/rollback`
- [x] Body: `{ to_version: number }`
- [x] Pega versão alvo do mesmo `agent_type` e a ativa (mesma lógica de `/activate`)
- [x] Retorna 200 com `{ activated_version, previous_active_version }`
- [x] Erro 404 se versão alvo não existe
- [x] Erro 409 se versão alvo já é a ativa

### AC AE-8.6 — Página `/admin/agents/prompts`
- [x] Arquivo: `src/app/admin/agents/prompts/page.tsx`
- [x] Server component lê profile + redireciona se não admin/dev
- [x] Layout: tabs no topo (`Copy | Image | HTML | QA`)
- [x] Conteúdo da tab:
  - Card "Versão ativa" com botão "Salvar nova versão" (cria nova versão)
  - Histórico de versões (collapsível) com botões "Ativar" e "Ver diff"
- [x] Editor: textarea com `min-h-[200px] resize-y` (sem syntax highlighting — `react-textarea-autosize`/`prismjs` não instalado e não justifica nova dep)

### AC AE-8.7 — Editor com placeholders documentados
- [x] Painel lateral: lista de variáveis `{{var}}` suportadas por agent_type (hardcoded em sync com `buildAllVars`)
- [ ] Auto-completion básico ao digitar `{{` — não implementado (nice-to-have explícito na story)
- [x] Botão "Validar template" — verifica que todos os `{{var}}` no template existem na lista de variáveis disponíveis

### AC AE-8.8 — Confirmação de ativação
- [x] Botão "Ativar" no histórico → modal:
  - Diff side-by-side entre versão ativa atual e nova
  - Aviso amarelo: "Esta mudança afeta TODOS os emails gerados a partir de agora"
  - Confirmação dupla (typing "ativar" para confirmar)
- [x] Toast de sucesso + atualiza lista

### AC AE-8.9 — Validação de output_schema
- [x] Se `agent_type IN ('copy','qa')` e `output_schema IS NULL` → permite (degrade) — textarea de schema só aparece p/ esses tipos
- [x] Se `output_schema` informado: validação estrutural (type/properties/items/$ref/anyOf/oneOf)
- [ ] Botão "Testar schema" — não implementado (não bloqueia AE-1..AE-7; pode entrar como follow-up)

### AC AE-8.10 — Auditoria
- [x] Service emite `log.info('prompt.activated' | 'prompt.rolled_back', { agent_type, version, id, actor_id })` via logger.child. Tabela `events` não existe no schema atual; criação dela é fora de escopo. Logs estruturados servem como audit trail no curto prazo.

### AC AE-8.11 — Visibilidade na sidebar do admin
- [x] Adicionar link "Agentes / Prompts" na sidebar GERAL_NAV (grupo Ferramentas) — visível apenas se admin/owner (via `requiredFeatures` + early return em `checkPermission`). Devs com tag acessam por URL direto (decisão pragmática para não sobrecarregar o context de permissions).
- [x] Path: `/admin/agents/prompts` registrado em `ROUTES.ADMIN.AGENTS.PROMPTS`

### AC AE-8.12 — Testes
- [x] Teste service: criar nova versão incrementa version corretamente
- [x] Teste service: ativar transição mantém 1 e somente 1 ativa
- [x] Teste service: rollback de version=3 para version=1 funciona
- [x] Teste service: rollback para versão inexistente → NotFoundError (404)
- [x] Teste service: rollback para versão já ativa → ConflictError (409)
- [x] Teste service: activate idempotente
- [x] Teste service: validação de output_schema rejeita objeto sem type/properties
- [x] Teste service: canManagePrompts (admin/owner/tag dev)
- [ ] Teste integration UI → API → geração: não implementado (depende de fluxo do email-generation.service.ts em sandbox; service-level tests cobrem a lógica crítica)

---

## Tarefas

- [x] Criar `src/app/api/admin/agents/prompts/route.ts` (GET, POST)
- [x] Criar `src/app/api/admin/agents/prompts/[id]/route.ts` (GET detalhe)
- [x] Criar `src/app/api/admin/agents/prompts/[id]/activate/route.ts` (POST)
- [x] Criar `src/app/api/admin/agents/prompts/[id]/rollback/route.ts` (POST)
- [x] Criar página `src/app/admin/agents/prompts/page.tsx`
- [x] Criar componente `src/components/agents/prompts-workspace.tsx` (orchestrator)
- [x] Criar componente `src/components/agents/prompt-editor.tsx`
- [x] Criar componente `src/components/agents/prompt-history.tsx`
- [x] Criar componente `src/components/agents/prompt-diff-modal.tsx`
- [x] Criar `src/lib/services/prompt-management.service.ts` (encapsula lógica DB)
- [x] Adicionar link na sidebar admin (`src/components/layout/sidebar.tsx` — não `admin/sidebar.tsx`; sidebar real está em layout)
- [x] **Atualizar `src/app/admin/settings/email-generation/page.tsx`** — incluir `'qa'` no array `activeConfigs` do `AgentsTab`. Schema de POST do legacy `/api/admin/email-agent-configs` também estendido pra aceitar `qa`.
- [x] Testes (service-level, 14 casos)

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
| 2026-05-30 | @dev (Dex) | Implementação completa: service central + 4 rotas + page + 4 client components + sidebar link + atualização do settings/email-generation para incluir `qa`. 14 testes unitários passando. Auto-completion `{{` e botão "Testar schema" não implementados (nice-to-have explícito). Auditoria via logger estruturado em vez de tabela `events` (não existe no schema). Status: Draft → In Review. |
