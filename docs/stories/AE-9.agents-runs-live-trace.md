---
Prioridade: P2
Sprint: Backlog
Assignee: "@dev (Dex)"
Revisao: "@architect"
Status: Draft
Epic: AE - Agent Email Generation
Fase: Admin UI / Observability
Estimate: M
---

# Story AE-9 — `/admin/agents/runs`: live trace de cada chamada de agente

## User Story

**Como** dev,
**quero** uma página que liste em tempo real cada chamada de agente (Claude, OpenRouter) com input/output preview, custo e latência,
**para que** eu debugue produção sem precisar de SQL direto ou logs externos.

---

## Contexto

Tabela `email_generation_runs` (já existe em `20260621_email_generation_infra.sql`) registra cada chamada:
- `store_id`, `flow_id`, `email_id`, `batch_id`
- `agent` (copy/image/html/qa/seed)
- `agent_config_id` (link pra prompt usado)
- `status` (running/success/error/skipped)
- `input_vars`, `rendered_prompt`, `raw_output`, `parsed_output`
- `model`, `tokens_input`, `tokens_output`, `cost_cents`, `duration_ms`
- `error_message`, `error_stack`, `retry_count`

Esta story constrói a UI dev-only que consome essa tabela em tempo real (SSE igual AE-6).

---

## Acceptance Criteria

### AC AE-9.1 — Listagem com filtros
- [ ] `GET /api/admin/agents/runs`
- [ ] Auth: admin/owner ou tag `dev`
- [ ] Query params:
  - `store_id` (uuid)
  - `email_id` (uuid)
  - `batch_id` (uuid)
  - `agent` (enum)
  - `status` (enum)
  - `since` (ISO timestamp, default now()-1h)
  - `limit` (default 50, max 200)
- [ ] Response:
  ```ts
  {
    runs: Array<{
      id, created_at, agent, status,
      model, tokens_input, tokens_output, cost_cents, duration_ms,
      store_id, store_name, email_id, email_number, flow_type,
      error_message: string | null,
      has_input: boolean, has_output: boolean  // flags pra UI saber se pode "Ver detalhes"
    }>,
    aggregate: {
      count: number,
      total_cost_cents: number,
      avg_duration_ms: number,
      error_rate: number
    }
  }
  ```

### AC AE-9.2 — Detalhe de run
- [ ] `GET /api/admin/agents/runs/[id]`
- [ ] Auth idem
- [ ] Response: row completa de `email_generation_runs`, incluindo `rendered_prompt` (truncate a 10kb para evitar payload monstruoso), `raw_output` (truncate 10kb), `parsed_output` (sem truncate), `error_stack` (sem truncate), `input_vars` (sem truncate)
- [ ] Headers: `Cache-Control: no-store` (debug, sempre fresh)

### AC AE-9.3 — SSE para live trace
- [ ] `GET /api/sse/admin/agents/runs`
- [ ] Mesmo padrão SSE de AE-6
- [ ] Filtros via query (`store_id`, `email_id`, `batch_id`)
- [ ] Emite evento `new_run` a cada INSERT em `email_generation_runs` que casa o filtro
- [ ] Implementação: polling de 2s buscando rows com `id > lastIdSeen` e WHERE clause dos filtros
- [ ] Heartbeat 30s + fallback SWR 5s no client (mais rápido que AE-6 porque é debug)

### AC AE-9.4 — Página `/admin/agents/runs`
- [ ] Arquivo: `src/app/admin/agents/runs/page.tsx`
- [ ] Layout: tabela densa (estilo terminal/log viewer) — linhas finas (28-32px), monospace partial
- [ ] Colunas:
  - timestamp (HH:mm:ss.SSS)
  - agent (badge colorido)
  - status (badge)
  - store (link)
  - email # / flow (link)
  - model
  - tokens (in/out)
  - $ (R$ formatado, 4 decimais)
  - duração (ms)
  - actions ("Ver detalhes")
- [ ] Toolbar:
  - filtros (dropdown agent, status, store)
  - search por id de run (uuid)
  - botão "Limpar filtros"
  - toggle "Auto-scroll" (rola pra última run quando ativo)
  - toggle "Live" (pausa stream de novas runs)
- [ ] Stats no topo: count / total cost / avg latência / error rate (cores semafóricas)

### AC AE-9.5 — Drawer de detalhes
- [ ] Click em "Ver detalhes" abre drawer lateral
- [ ] Sections collapsable:
  - **Metadata**: store, email, batch_id, agent_config_id (link pra prompt em AE-8)
  - **Input vars** (JSON pretty-printed)
  - **Rendered prompt** (monospace, scrollable, com botão "Copiar")
  - **Raw output** (monospace, scrollable, com botão "Copiar")
  - **Parsed output** (JSON pretty-printed)
  - **Error** (se houver: message + stack em monospace)
  - **Timing breakdown** (created_at + duration_ms)

### AC AE-9.6 — Atalhos de teclado
- [ ] `/` foca a busca
- [ ] `g d` (sequência) abre `/admin/agents/runs` (já segue padrão CRM)
- [ ] `g p` abre `/admin/agents/prompts`
- [ ] `esc` fecha drawer
- [ ] Documentar atalhos em help (`?`)

### AC AE-9.7 — Performance
- [ ] Limit padrão 50 runs visíveis; auto-evict mais antigos quando excede 200 no client
- [ ] Query DB usa index: `CREATE INDEX IF NOT EXISTS idx_gen_runs_recent ON email_generation_runs(created_at DESC, agent)` — adicionar nesta story (migration `20260530c_runs_view_index.sql`)
- [ ] Latência endpoint < 300ms para 50 rows

### AC AE-9.8 — Segurança dados sensíveis
- [ ] `rendered_prompt` pode conter dados de briefing (PII potencial)
- [ ] Acesso restrito: admin/owner/dev por design
- [ ] Logs do endpoint NÃO loggam `rendered_prompt` ou `raw_output` (evita exposição em log aggregator)

### AC AE-9.9 — CSV export
- [ ] Botão "Exportar CSV" no toolbar
- [ ] Exporta apenas metadata + custo + latência (sem prompts/outputs) — máx 5000 rows
- [ ] Formato: `created_at,agent,status,model,tokens_in,tokens_out,cost_cents,duration_ms,store_name,email_id`

### AC AE-9.10 — Testes
- [ ] Teste API listagem: filtra corretamente por `agent`
- [ ] Teste API detalhe: trunca `raw_output > 10kb`
- [ ] Teste SSE: emite `new_run` quando INSERT acontece
- [ ] Teste UI: drawer abre com detalhes; copy buttons funcionam (smoke test)

---

## Tarefas

- [ ] Criar `src/app/api/admin/agents/runs/route.ts`
- [ ] Criar `src/app/api/admin/agents/runs/[id]/route.ts`
- [ ] Criar `src/app/api/sse/admin/agents/runs/route.ts`
- [ ] Criar página `src/app/admin/agents/runs/page.tsx`
- [ ] Criar componente `src/components/agents/runs-table.tsx`
- [ ] Criar componente `src/components/agents/run-detail-drawer.tsx`
- [ ] Criar hook `src/hooks/use-agent-runs-live.ts`
- [ ] Criar migration `supabase/migrations/20260530c_runs_view_index.sql` (index para query recent)
- [ ] Adicionar atalhos `g d` / `g p` na lib de keybinds global
- [ ] Adicionar link na sidebar admin (apenas dev-visible)
- [ ] Testes

---

## Dev Notes

### Por que SSE em vez de Realtime nesse caso?

Mesmo padrão da AE-6: polling de 2s na tabela `email_generation_runs` (last id seen) com index. Simples, sem dependência de subscription client.

### Trunc 10kb para outputs

`raw_output` de uma chamada Claude pode passar de 100kb (HTML completo). Truncar no endpoint mantém payload responsivo. UI mostra "Output truncado — abrir versão completa" linkando para `GET /api/admin/agents/runs/[id]/raw_output` (endpoint adicional opcional, pode entrar em V2 se demandado).

### Não cachear

`Cache-Control: no-store` no detalhe. Dashboard de debug não pode mostrar dado stale.

### Atalhos `g + letra`

Já existe sistema no CRM (`g+l`, `g+p`, `g+c`, etc — ver CLAUDE.md § CRM Convertfy). Reusar a lib (provavelmente `src/lib/keybinds.ts` ou similar — verificar).

### Decisão pendente: consolidar ou criar nova?

Já existe `/admin/tools/email-generation-logs` (read-only de `email_generation_runs`). Esta story propõe **nova** página em `/admin/agents/runs` com live trace + drawer + atalhos. Duas opções na implementação:

1. **Substituir** `/admin/tools/email-generation-logs` (redirect 301 → `/admin/agents/runs`)
2. **Coexistir**: `tools/email-generation-logs` continua como view simples; `agents/runs` é a view dev com live trace

Recomendação: opção 1 (uma única fonte de verdade). Implementador valida antes.

### Por que dev-only?

`rendered_prompt` pode incluir briefing completo (dados sensíveis do cliente). `error_stack` pode revelar paths e secrets se mal-tratado. Restringir a admin/owner/dev é cautela mínima.

### Tabela densa: design tokens

Seguir tokens CRM (`--crm-*`): row 32px, padding compacto, sem sombras, border de 1px. (Ver `src/styles/crm-tokens.css`.)

---

## Reuso de padrões existentes

- SSE pattern: AE-6 (`src/app/api/sse/stores/[id]/emails`)
- Tabela densa: CRM (`/admin/crm/inbox`)
- Drawer: componentes shadcn (já no projeto)
- Keybinds: lib global (ver CRM `g+letra`)

---

## File List

### A criar
- `src/app/api/admin/agents/runs/route.ts`
- `src/app/api/admin/agents/runs/[id]/route.ts`
- `src/app/api/sse/admin/agents/runs/route.ts`
- `src/app/admin/agents/runs/page.tsx`
- `src/components/agents/runs-table.tsx`
- `src/components/agents/run-detail-drawer.tsx`
- `src/hooks/use-agent-runs-live.ts`
- `supabase/migrations/20260530c_runs_view_index.sql`
- Testes correspondentes

### A modificar
- `src/components/admin/sidebar.tsx` — adicionar link (dev-only)
- Lib de keybinds — registrar `g+d`, `g+p`

---

## Dependencias

- **Bloqueado por**: AE-1 (não obrigatório, mas faz sentido); AE-3/AE-4/AE-5 alimentam dados úteis
- **Bloqueia**: nada — observability, não bloqueia funcionalidade

---

## Riscos

| Risco | Probabilidade | Mitigação |
|-------|---------------|-----------|
| Dados sensíveis vazam por log do endpoint | Média | Não loggar prompt/output; auth restrita |
| SSE consome conexão DB com muitos clients abertos | Baixa | Volume dev-only ≤ 5 conexões simultâneas |
| Index novo causa lock em migration | Baixa | `CREATE INDEX IF NOT EXISTS` sem CONCURRENTLY (tabela ainda pequena) |
| Tabela `email_generation_runs` cresce ilimitado | Média | TTL via cron fora do escopo; documentar como follow-up |
| Drawer com payload de 50kb trava browser | Baixa | Truncate no endpoint; "Ver completo" futuro |

---

## Change Log

| Data | Autor | Descrição |
|------|-------|-----------|
| 2026-05-29 | @architect | Story criada |
