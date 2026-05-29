# ADR: Geração Automática de Emails via Agentes IA

| Field | Value |
|-------|-------|
| **Date** | 2026-05-29 |
| **Status** | Proposto |
| **Epic** | AE — Agent Email Generation |
| **Decision makers** | @architect, @dev, @pm, @qa, @designer-lead |
| **Related ADRs** | `adr-klaviyo-revenue-source.md`, `onboarding-board-sync.md`, `n8n-api-integration.md` |

---

## Context

Hoje, quando o briefing de uma loja é confirmado em `store_briefings`, **nada acontece automaticamente** no pipeline de geração de email marketing. O fluxo atual exige que um operador clique manualmente em "Gerar email" (`POST /api/admin/stores/[id]/generate-email`) por email, um a um. O designer não tem visibilidade do que está pronto e o estado dos emails é fragmentado:

- `email_flow_emails.status` tem hoje os valores `draft | in_progress | copy_ready | ready | approved | live` (após `20260622_email_status_copy_ready.sql`)
- O webhook `POST /api/webhooks/n8n/email-copy` já existe e marca `copy_ready`, mas **não inicia a fase 2** (imagem hero + render HTML + QA)
- Não existe watchdog para emails travados em `copy_generating`
- Não há QA automatizado: emails marcados `ready` podem ter HTML quebrado, claims sem cobertura no briefing, blocos vazios
- Designer não tem uma página única que mostre o que está pronto vs em geração vs com erro
- Não há live-trace de chamadas de agente (Claude/OpenRouter) — debug de produção é cego
- Prompts dos agentes (`email_agent_configs`) só podem ser editados via DB direto

**Objetivo do épico**: ao confirmar o briefing, o sistema gera 5–7 emails por flow de marketing (welcome, abandoned cart, browse, upsell, win-back) sem intervenção humana, e entrega ao designer uma página com copy + HTML + imagens + status amigáveis. O designer leva manualmente pro Klaviyo (push automatizado fica **fora do escopo** desta fase — não há `awaiting_approval` nem `approved` neste épico).

---

## Decision

Adotamos uma arquitetura **reativa serverless** sem worker dedicado, sem queue externa (pg-boss/Redis/BullMQ) e sem hosting fora da Vercel (Railway/Fly). Toda a orquestração roda em três planos:

1. **Gatilho híbrido**: trigger SQL em `store_briefings` (status `confirmed`) + endpoint manual `POST /api/admin/stores/[id]/start-onboarding` acionado por botão na UI.
2. **Pipeline em duas fases por email**:
   - Fase 1 (copy): N8N gera subject + preheader + blocos. Faz callback em `POST /api/webhooks/n8n/email-copy` (handler existente, **enriquecido**).
   - Fase 2 (visual + QA): roda **in-process** no mesmo handler do webhook usando `waitUntil()` do Vercel — gera imagem hero (OpenRouter via `image.chain.ts` existente), HTML chain (Claude via LangChain `ChatAnthropic` em `html.chain.ts` existente) e QA agent (Claude via nova chain `qa.chain.ts` seguindo mesmo padrão LangChain). O handler responde 200 imediatamente; a fase 2 continua em background até ~5min (limite do Vercel Pro).
3. **Watchdog cron** em `/api/cron/email-generation-watchdog` (a cada 5min) detecta emails travados e:
   - `copy_generating > 15min` → dispara chain in-process com Claude direto (pula n8n)
   - `rendering | qa_running > 10min` → marca `failed` com motivo `timeout`

Real-time na UI via **SSE** em `/api/sse/stores/[id]/emails` (com fallback SWR 10s). Notificações in-app + email são disparadas em eventos terminais (`ready` ou `failed`), usando um **sistema de tags genérico** em `profiles.tags text[]` (rota `cto` para alertas de falha, `designer_lead` reservada para futuro).

---

## Status canônico (enum)

```
pending
  → copy_generating
    → copy_ready
      → rendering
        → qa_running
          → ready    (sucesso, status terminal)
          ↘ failed   (status terminal, com qa_issues + failure_reason)
```

Não há `awaiting_approval`. Não há `approved`. O designer **consume** emails `ready` como guia/referência e leva manualmente pro Klaviyo. A coluna `email_flow_emails.status` é estendida via `CHECK` constraint (ver migration na seção "Esquema de dados").

---

## Pipeline detalhado

```
┌──────────────────────────────────────────────────────────────────────┐
│ store_briefings.status = 'confirmed'                                  │
│        │                                                              │
│        │ (auto) trigger SQL fn_on_briefing_confirmed                  │
│        │ ─OR─                                                         │
│        │ (manual) POST /api/admin/stores/[id]/start-onboarding        │
│        ▼                                                              │
│ batch_id = uuid()                                                     │
│ Para cada email_flow_emails (status=draft|failed) da loja:            │
│   UPDATE status='copy_generating', generation_batch_id=$batch_id      │
│ Dispatch único pro n8n: POST $N8N_EMAIL_COPY_URL                      │
│   { store_id, batch_id, emails: [{email_id, flow_type, ...}],         │
│     callback_url: $APP_URL/api/webhooks/n8n/email-copy,               │
│     callback_secret }                                                 │
└──────────────────────────────────────────────────────────────────────┘
                       │
                       ▼
        ┌──────────────────────────────────────┐
        │ N8N processa N emails em paralelo    │
        │ (concorrência controlada pelo n8n)   │
        │ Para cada email finalizado:          │
        │   POST /api/webhooks/n8n/email-copy  │
        │   { store_id, email_id, subject,     │
        │     preheader, blocks, meta }        │
        └──────────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────────────────┐
│ POST /api/webhooks/n8n/email-copy (handler atual + enriquecido)      │
│   1. verify HMAC (requireWebhookSecret)                              │
│   2. parse Zod                                                       │
│   3. UPDATE email_flow_emails SET subject, preheader,                │
│      status='copy_ready', copy_ready_at=now()                        │
│   4. UPSERT email_blocks.content                                     │
│   5. INSERT email_generation_runs (agent='copy', ...)                │
│   6. return 200 OK ────────► n8n libera worker                       │
│   7. waitUntil(runPhase2InBackground({email_id, store_id}))          │
└──────────────────────────────────────────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────────────────┐
│ runPhase2InBackground (in-process, ~30–90s)                          │
│   a. UPDATE status='rendering', rendering_started_at=now()           │
│   b. generateEmailImage()  ── OpenRouter ──►  image url(s)           │
│      (já existe em src/lib/agents/chains/image.chain.ts)             │
│   c. createHtmlChain()     ── LangChain ChatAnthropic ──► HTML       │
│      (já existe em src/lib/agents/chains/html.chain.ts)              │
│   d. UPDATE email_flow_emails.html, status='qa_running'              │
│   e. runQaAgent({html, blocks, briefing, brand})                     │
│      ── LangChain ChatAnthropic (qa.chain.ts NOVA) ──► {passed, ...} │
│   f. SE passed:                                                      │
│        UPDATE status='ready', ready_at=now(), qa_issues=[]           │
│      SENÃO:                                                          │
│        UPDATE status='failed', failed_at=now(),                      │
│          failure_reason='qa_failed', qa_issues=$issues               │
│   g. INSERT email_generation_runs por sub-step                       │
│   h. emitEmailEvent(store_id, email_id, status)  ── SSE bus          │
│   i. SE batch terminal (todos emails da loja em ready|failed):       │
│        notifyBatchComplete(store_id)                                 │
│      SE individual failed:                                           │
│        notifyByTag(['cto'], 'email_generation_failed', ...)          │
└──────────────────────────────────────────────────────────────────────┘
```

### Watchdog (paralelo, every 5min)

```
GET /api/cron/email-generation-watchdog (Bearer CRON_SECRET)
  1. SELECT email_flow_emails
       WHERE status='copy_generating'
       AND copy_started_at < now() - interval '15min'
  2. Para cada: marca em flight (status='copy_generating_recovery')
     e dispara waitUntil(runCopyChainInProcess(email_id))
     usando Anthropic direto (sem n8n). Quando completa,
     entra no mesmo runPhase2InBackground.
  3. SELECT email_flow_emails
       WHERE status IN ('rendering','qa_running')
       AND (rendering_started_at < now() - interval '10min'
         OR qa_started_at < now() - interval '10min')
  4. Para cada: UPDATE status='failed',
       failure_reason='timeout_phase2'
       failed_at=now()
  5. Idempotente: usa SELECT ... FOR UPDATE SKIP LOCKED para
     evitar duplo processamento entre execuções consecutivas.
```

---

## Reuso de infraestrutura existente (pós-audit 2026-05-29)

Antes de implementar, fizemos auditoria da base. Há infraestrutura sólida que será **reusada**, não recriada:

| Componente | Estado | Como reusar |
|------------|--------|-------------|
| `email_agent_configs` (prompts versionados) | ✅ pronto | AE-8 estende — adiciona apenas UI e `agent_type='qa'` ao CHECK |
| `email_generation_runs` (telemetria) | ✅ pronto | AE-3/AE-5 escrevem nele; AE-9 estende UI existente |
| `email_flows`, `email_flow_emails`, `email_blocks` | ✅ pronto | AE-1 estende CHECK + colunas |
| Chains `html.chain.ts`, `copy.chain.ts`, `image.chain.ts` (LangChain) | ✅ pronto | AE-3 reusa; AE-5 cria `qa.chain.ts` com mesmo padrão |
| `email-generation.service.ts` (orquestração fase 2) | ✅ pronto | AE-3 reusa; só envolve em `waitUntil` |
| `email-copy-webhook.service.ts` (dispatch n8n) | ✅ pronto | AE-2 reusa |
| Endpoint `POST /api/admin/stores/[id]/dispatch-email-copies` | ✅ pronto | AE-2 reusa (chamado pelo signal consumer) |
| Endpoint `POST /api/admin/stores/[id]/generate-email` | ✅ pronto | AE-3 não substitui — entrada in-process da fase 2 |
| Endpoint `POST /api/webhooks/n8n/email-copy` | ✅ pronto | AE-3 enriquece com `waitUntil` |
| `notificationService.notifyByRole()` | ✅ pronto | AE-7 estende com `notifyByTag()` (nova função, mesmo service) |
| `emailService.send()` (transacional) | ✅ pronto | AE-7 reusa |
| `notifications` table (in-app bell) | ✅ pronto | AE-7 reusa |
| `generation-notify.service.ts` (notif erro/sucesso) | ✅ pronto | AE-7 estende com tag-based routing |
| `/admin/tools/email-generation-logs` | ✅ pronto | AE-9 estende (filtros, drawer, follow live) em vez de página nova |
| Padrão `errorResponse/successResponse`, `createAdminClient`, Zod | ✅ pronto | Todas as stories seguem |
| Cron secret / `vercel.json` crons | ✅ pronto | AE-4 adiciona entry `*/5 * * * *` |

**Tabelas a criar do zero**: apenas `email_generation_queue_signals` e `email_status_events` (event bus pra SSE).

**Status conflict resolvido**: enum atual (`draft|in_progress|copy_ready|ready|approved|live`) é **estendido**, não substituído. Valores legacy (`in_progress`, `approved`, `live`) ficam na CHECK pra retrocompat. Novos: `pending`, `copy_generating`, `copy_generating_recovery`, `rendering`, `qa_running`, `failed`.

**Briefing status**: `store_briefings` ganha valor `'confirmed'` no CHECK existente (atual: `'current'|'archived'`). Distinto e separado de `client_onboardings.briefing_status` (que cobre o formulário do cliente, outro contexto).

---

## Alternativas avaliadas

| Alternativa | Veredito | Motivo |
|-------------|----------|--------|
| **pg-boss + worker dedicado em Railway/Fly** | REJEITADO | Adiciona infra fora da Vercel. Custo operacional alto pra um pipeline que roda 7 emails por loja confirmada (~10 vezes por semana). |
| **N8N orquestrando tudo (incluindo render HTML e QA)** | REJEITADO | Render HTML usa templates Liquid próprios do app + binding com `email_blocks` em DB. Manter isso dentro do app é mais simples e versionável. QA agent precisa do briefing + brand identity, dados que vivem em Supabase RLS. |
| **Polling do app pro n8n (sem callback)** | REJEITADO | Latência: app teria que pollar a cada 30s pra detectar conclusão. Custo de DB + complexidade de estado. Webhook callback é o padrão já aceito no projeto (Story 12.1, Epic 20). |
| **Worker in-process via BullMQ** | REJEITADO | Requer Redis. Vercel functions são stateless e efêmeras — BullMQ in-process não funciona. Mover pra worker fora da Vercel = mesma rejeição do pg-boss. |
| **Vercel Cron polling status a cada 1min** | REJEITADO | Inflate custo de execução cron + cron tem mínimo de 1min na Vercel. Watchdog 5min é só rede de segurança, não engine principal. |
| **Supabase Realtime no lugar de SSE** | REJEITADO PARA ESTA FASE | Adiciona dependência de subscription client-side + complexidade de RLS pra channels. SSE é simples, server-controlled e suficiente. Realtime pode entrar numa V2 se SSE escalar mal. |

---

## Consequências

### Positivas
- Zero infra nova: tudo Vercel + Supabase + n8n + Anthropic/OpenRouter (stack atual)
- Falhas individuais não bloqueiam o batch (cada email é independente)
- Fase 2 in-process garante que dados sensíveis (HTML completo, claims do briefing) não saem do app
- Watchdog garante que nenhum email fica "preso" em estado intermediário
- Sistema de tags em `profiles.tags` é future-proof: rota `cto` hoje, `designer_lead`/`cs_lead` amanhã, sem mudança de código
- Real-time via SSE com fallback SWR garante UX viva mesmo em redes ruins
- Live trace em `/admin/agents/runs` (dev-only) elimina debug cego

### Negativas / Trade-offs
- **Vercel `waitUntil()` limite ~5min** (Pro plan, máximo de 300s por request handler) — fase 2 que estoura é detectada pelo watchdog e marcada `failed:timeout_phase2`. Em geral fase 2 leva 30–90s.
- **Sem controle fino de paralelismo da fase 2**: depende do ritmo do n8n disparando callbacks. Se n8n disparar 7 callbacks simultâneos, há 7 fases 2 in-process simultâneas (cada uma em sua função serverless). Sem semáforo. Aceito porque OpenRouter e Anthropic têm rate limits separados e nossos volumes (≤7 emails/loja, ≤10 lojas/semana) ficam muito abaixo.
- **N8N HMAC**: o secret `N8N_WEBHOOK_SECRET` é compartilhado entre todos os webhooks n8n. Rotacionar exige redeploy. (Padrão atual do projeto, mantido.)
- **`profiles.tags` sem UI nesta fase**: a tag `cto` precisa ser setada manualmente via SQL/Supabase Studio até que UI de gestão venha numa fase futura. Story AE-7 documenta isso.
- **Trigger SQL é não-suspendível**: se a função `fn_on_briefing_confirmed` falhar ao enfileirar n8n, o INSERT do briefing falha. Mitigação: trigger é `AFTER UPDATE` com `EXCEPTION WHEN OTHERS THEN PERFORM pg_notify(...)` (faz `INSERT` em fila + emite NOTIFY; nunca raise).

### Neutras
- Push pro Klaviyo segue manual nesta fase. Quando virar V2, basta adicionar status `awaiting_approval` no enum e botão "Aprovar para Klaviyo".

---

## Riscos e mitigações

| # | Risco | Probabilidade | Impacto | Mitigação |
|---|-------|---------------|---------|-----------|
| R1 | Vercel `waitUntil` timeout antes da fase 2 terminar | Baixa | Médio | Watchdog detecta em ≤15min e marca `failed:timeout_phase2`. Tag CTO recebe alerta. |
| R2 | N8N retorna callback duplicado | Média | Baixo | Webhook é idempotente: usa `email_id` + status atual como guard. Se status já é `copy_ready+`, retorna 200 e não dispara fase 2 de novo. |
| R3 | Trigger SQL dispara HTTP pro n8n e bloqueia a transação | Alta se mal feita | Alto | Trigger NÃO faz HTTP. Apenas insere em `email_generation_queue_signals` + `pg_notify`. Um endpoint `POST /api/internal/process-pending-signals` (chamado pelo watchdog ou pelo próprio trigger via `pg_net` async) consome o sinal. |
| R4 | QA agent reprova todos os emails (falso positivo) | Média | Alto | Severity tunada: bloqueia apenas issues `severity=high`. Issues `medium`/`low` salvas em `qa_issues` mas marca `ready`. Limiar revisável via `email_agent_configs.user_template`. |
| R5 | Custos de API explodem (Anthropic + OpenRouter) | Baixa | Médio | Telemetria em `email_generation_runs.cost_cents` por chamada. Dashboard `/admin/agents/runs` mostra custo agregado por loja/dia. Alerta CTO quando custo diário > R$ 50 (configurável). |
| R6 | Prompts editados quebram parser de output | Alta | Alto | Versionamento: `email_agent_configs.is_active=false` e rollback 1-clique. AE-8 obriga `output_schema` JSON Schema validado antes do salvar. |
| R7 | SSE não funciona atrás de proxy do cliente | Média | Baixo | Fallback SWR refetch a cada 10s já documentado. UI degrada gracefully. |
| R8 | Tag CTO vazia → falhas não chegam a ninguém | Alta no início | Médio | Story AE-7 obriga seed default vazio + log warn ao notificar com array vazio. README do épico documenta: "antes de prod, marcar pelo menos 1 profile com tag `cto`". |
| R9 | n8n recebe lista de emails diferente do que existe em DB (race) | Baixa | Baixo | Endpoint `start-onboarding` re-lê emails da loja como source-of-truth antes do dispatch. n8n trabalha com o snapshot enviado. Emails criados depois entram no próximo batch. |
| R10 | Watchdog dispara fallback enquanto n8n ainda está trabalhando | Média | Médio | Threshold 15min > p99 esperado do n8n (~5min). Fallback usa `SELECT ... FOR UPDATE SKIP LOCKED` + UPDATE atômico de status para `copy_generating_recovery` antes de iniciar — n8n callback subsequente vê status diferente e é idempotente. |

---

## Esquema de dados (mudanças)

### Migration: `supabase/migrations/20260530_agent_email_generation.sql`

```sql
-- ============================================================
-- Epic AE: Agent Email Generation
-- Status canônico estendido + telemetria + tags em profiles
-- + queue signals + audit de status changes
-- Idempotente.
-- ============================================================

-- ── 1. Extende CHECK constraint de email_flow_emails.status ─
ALTER TABLE email_flow_emails
  DROP CONSTRAINT IF EXISTS email_flow_emails_status_check;

ALTER TABLE email_flow_emails
  ADD CONSTRAINT email_flow_emails_status_check
  CHECK (status IN (
    'draft',
    'in_progress',           -- legacy, mantido por retrocompat
    'pending',               -- agendado para gerar
    'copy_generating',
    'copy_generating_recovery', -- fallback in-process após watchdog
    'copy_ready',
    'rendering',
    'qa_running',
    'ready',
    'failed',
    'approved',              -- legacy, mantido
    'live'                   -- legacy, mantido
  ));

-- ── 2. Colunas de timing/telemetria por email ──────────────
ALTER TABLE email_flow_emails
  ADD COLUMN IF NOT EXISTS generation_batch_id UUID,
  ADD COLUMN IF NOT EXISTS copy_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS copy_ready_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rendering_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS qa_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ready_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS failed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS failure_reason TEXT,
  ADD COLUMN IF NOT EXISTS qa_issues JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS total_cost_cents NUMERIC(10,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS attempts INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_attempt_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_efe_batch
  ON email_flow_emails(generation_batch_id) WHERE generation_batch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_efe_stuck_copy
  ON email_flow_emails(status, copy_started_at)
  WHERE status IN ('copy_generating', 'copy_generating_recovery');
CREATE INDEX IF NOT EXISTS idx_efe_stuck_phase2
  ON email_flow_emails(status, rendering_started_at, qa_started_at)
  WHERE status IN ('rendering', 'qa_running');

-- ── 3. Sistema de tags em profiles ──────────────────────────
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}'::text[];

CREATE INDEX IF NOT EXISTS idx_profiles_tags ON profiles USING GIN (tags);

-- ── 4. Sinal de fila pro processo de start-onboarding ──────
-- Trigger NÃO faz HTTP. Insere sinal aqui. Watchdog consome.
CREATE TABLE IF NOT EXISTS email_generation_queue_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES client_stores(id) ON DELETE CASCADE,
  triggered_by TEXT NOT NULL CHECK (triggered_by IN ('briefing_confirmed','manual','watchdog_retry')),
  payload JSONB DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','processing','done','failed')),
  attempts INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_eqs_pending
  ON email_generation_queue_signals(status, created_at)
  WHERE status = 'pending';

ALTER TABLE email_generation_queue_signals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_full_access" ON email_generation_queue_signals
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── 5. Adiciona status 'confirmed' em store_briefings ──────
-- Status atual: 'current' | 'archived'. Adiciona 'confirmed'.
-- O cliente/operador "confirma" o briefing = libera geração.
ALTER TABLE store_briefings
  DROP CONSTRAINT IF EXISTS store_briefings_status_check;

ALTER TABLE store_briefings
  ADD CONSTRAINT store_briefings_status_check
  CHECK (status IN ('current','confirmed','archived'));

ALTER TABLE store_briefings
  ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS confirmed_by UUID REFERENCES profiles(id);

-- ── 6. Trigger SQL: enfileira sinal ao confirmar briefing ──
CREATE OR REPLACE FUNCTION fn_on_briefing_confirmed()
RETURNS TRIGGER AS $$
BEGIN
  IF (NEW.status = 'confirmed' AND (OLD.status IS NULL OR OLD.status <> 'confirmed')) THEN
    BEGIN
      INSERT INTO email_generation_queue_signals
        (store_id, triggered_by, payload)
      VALUES
        (NEW.store_id, 'briefing_confirmed',
         jsonb_build_object('briefing_id', NEW.id, 'version', NEW.version));
      PERFORM pg_notify('email_generation_signal',
        jsonb_build_object('store_id', NEW.store_id)::text);
    EXCEPTION WHEN OTHERS THEN
      -- NUNCA bloqueia o UPDATE do briefing
      RAISE WARNING 'fn_on_briefing_confirmed failed: %', SQLERRM;
    END;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_store_briefings_confirmed ON store_briefings;
CREATE TRIGGER trg_store_briefings_confirmed
  AFTER UPDATE ON store_briefings
  FOR EACH ROW EXECUTE FUNCTION fn_on_briefing_confirmed();

-- ── 7. Prompts: 'qa' adicionado ao enum de agent_type ──────
ALTER TABLE email_agent_configs
  DROP CONSTRAINT IF EXISTS email_agent_configs_agent_type_check;

ALTER TABLE email_agent_configs
  ADD CONSTRAINT email_agent_configs_agent_type_check
  CHECK (agent_type IN ('copy','image','html','qa'));

-- ── 8. email_generation_runs: agent 'qa' aceito ───────────
ALTER TABLE email_generation_runs
  DROP CONSTRAINT IF EXISTS email_generation_runs_agent_check;

ALTER TABLE email_generation_runs
  ADD CONSTRAINT email_generation_runs_agent_check
  CHECK (agent IN ('seed','copy','image','html','qa'));

-- ── 9. Audit log de mudanças de status (para SSE bus) ──────
CREATE TABLE IF NOT EXISTS email_status_events (
  id BIGSERIAL PRIMARY KEY,
  store_id UUID NOT NULL REFERENCES client_stores(id) ON DELETE CASCADE,
  email_id UUID NOT NULL REFERENCES email_flow_emails(id) ON DELETE CASCADE,
  flow_id UUID REFERENCES email_flows(id) ON DELETE SET NULL,
  from_status TEXT,
  to_status TEXT NOT NULL,
  batch_id UUID,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ese_store_recent
  ON email_status_events(store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ese_email_recent
  ON email_status_events(email_id, created_at DESC);

ALTER TABLE email_status_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_full_access" ON email_status_events
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── 10. Trigger: registra mudança de status em event log ───
CREATE OR REPLACE FUNCTION fn_log_email_status_change()
RETURNS TRIGGER AS $$
BEGIN
  IF (NEW.status IS DISTINCT FROM OLD.status) THEN
    INSERT INTO email_status_events
      (store_id, email_id, flow_id, from_status, to_status, batch_id, metadata)
    SELECT
      ef.store_id, NEW.id, NEW.flow_id, OLD.status, NEW.status,
      NEW.generation_batch_id,
      jsonb_build_object(
        'failure_reason', NEW.failure_reason,
        'qa_issues_count', COALESCE(jsonb_array_length(NEW.qa_issues), 0)
      )
    FROM email_flows ef WHERE ef.id = NEW.flow_id;
    PERFORM pg_notify('email_status_event',
      jsonb_build_object('email_id', NEW.id, 'status', NEW.status)::text);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_email_status_change ON email_flow_emails;
CREATE TRIGGER trg_email_status_change
  AFTER UPDATE ON email_flow_emails
  FOR EACH ROW EXECUTE FUNCTION fn_log_email_status_change();
```

---

## Endpoints novos / modificados

| Método + Path | Tipo | Auth | Story |
|---------------|------|------|-------|
| `POST /api/admin/stores/[id]/start-onboarding` | NOVO | `requireAuth` (admin) | AE-2 |
| `POST /api/webhooks/n8n/email-copy` | MODIFICADO (já existe) | `requireWebhookSecret` | AE-3 |
| `GET /api/cron/email-generation-watchdog` | NOVO | `requireCronAuth` | AE-4 |
| `POST /api/internal/run-phase2/[emailId]` | NOVO (interno, opcional) | HMAC `INTERNAL_SECRET` | AE-3 |
| `GET /api/sse/stores/[id]/emails` | NOVO | `requireAuth` (admin) | AE-6 |
| `GET /api/admin/stores/[id]/emails` | NOVO/CONSOLIDADO | `requireAuth` (admin) | AE-6 |
| `POST /api/admin/agents/prompts` | NOVO | `requireAuth` (dev tag) | AE-8 |
| `GET /api/admin/agents/prompts` | NOVO | `requireAuth` (dev tag) | AE-8 |
| `POST /api/admin/agents/prompts/[id]/activate` | NOVO | `requireAuth` (dev tag) | AE-8 |
| `POST /api/admin/agents/prompts/[id]/rollback` | NOVO | `requireAuth` (dev tag) | AE-8 |
| `GET /api/admin/agents/runs` | NOVO | `requireAuth` (dev tag) | AE-9 |
| `GET /api/admin/agents/runs/[id]` | NOVO | `requireAuth` (dev tag) | AE-9 |

### Detalhe: `POST /api/admin/stores/[id]/start-onboarding`

```ts
// Request
{ mode: 'fresh' | 'resume' | 'redo', flow_ids?: string[] }

// Response 200
{
  batch_id: string (uuid),
  emails_dispatched: number,
  dispatched_to_n8n: boolean,
  flow_ids_used: string[]
}

// Errores: 401 unauth, 403 forbidden, 404 store, 409 batch_in_progress,
//          422 briefing_not_confirmed
```

Comportamento:
- Lê emails da loja em `email_flow_emails` filtrados por `flow_ids` (ou todos os flows ativos)
- Skipa emails em estado terminal (`ready`) salvo `mode='redo'`
- Faz UPDATE atômico: `status='copy_generating', generation_batch_id, copy_started_at=now()`
- Dispatch único pro n8n com lista completa de emails
- Retorna 200 com `batch_id` antes do n8n responder

### Detalhe: `GET /api/sse/stores/[id]/emails`

Server-Sent Events. Cada evento:
```
event: email_status_change
data: {"email_id":"...","flow_id":"...","status":"ready","failure_reason":null,"qa_issues_count":0,"ts":"..."}
```

Heartbeat a cada 30s (`event: ping`). Cliente reconecta automaticamente; se falhar 3x consecutivas, UI fallback para SWR polling 10s.

Implementação: `ReadableStream` + assinante de `pg_notify('email_status_event', ...)` via Supabase `realtime` client OU polling de `email_status_events` (last `id` seen).

---

## Métricas de sucesso

| Métrica | Alvo | Como medir |
|---------|------|-----------|
| % emails de uma loja confirmada que atingem `ready` em ≤ 30min | ≥ 90% | `email_flow_emails` por `generation_batch_id` |
| p95 latência fase 1 (copy) | ≤ 5min | `copy_ready_at - copy_started_at` |
| p95 latência fase 2 (rendering+qa) | ≤ 120s | `ready_at - copy_ready_at` |
| % emails marcados `failed` | ≤ 10% | mesma query |
| Custo de API médio por email | ≤ R$ 0,50 | SUM(`email_generation_runs.cost_cents`) / count |
| MTTR de email travado | ≤ 15min | `watchdog_recovery_ts - copy_started_at` |
| % batches sem nenhum email recovery do watchdog | ≥ 80% | proporção de batches sem run com agent='copy' status='success' E watchdog flag |

---

## Operação

### Variáveis de ambiente novas
| Var | Uso |
|-----|-----|
| `N8N_EMAIL_COPY_URL` | URL do trigger n8n pra disparar batch |
| `N8N_WEBHOOK_SECRET` | já existe; reusado |
| `APP_URL` | já existe; usado como `callback_url` |
| `CRON_SECRET` | já existe; usado pelo watchdog |
| `INTERNAL_SECRET` | NOVO; HMAC dos endpoints `/api/internal/*` |
| `ANTHROPIC_API_KEY` | já existe; usado por copy fallback, html chain, QA |
| `OPENROUTER_API_KEY` | já existe; usado pela image chain |
| `EMAIL_GEN_DAILY_COST_ALERT_BRL` | NOVO; default 50; alerta tag CTO |

### Seed inicial pós-deploy
1. Marcar pelo menos 1 profile com `tags @> '{cto}'` via SQL ou Supabase Studio
2. Criar prompts ativos em `email_agent_configs` (já existem para copy/image/html; adicionar para `qa`)
3. Configurar `N8N_EMAIL_COPY_URL` em prod
4. Agendar cron novo em `vercel.json`: `*/5 * * * *`

---

## Referências

- Vercel `waitUntil` docs: https://vercel.com/docs/functions/configuring-functions/runtime#waituntil
- Anthropic Messages API: https://docs.anthropic.com/en/api/messages
- OpenRouter docs: https://openrouter.ai/docs
- Padrões internos:
  - `src/lib/api/n8n-auth.ts` — HMAC de webhooks
  - `src/lib/api/cron-auth.ts` — Bearer de crons
  - `src/lib/api/errors.ts` — `errorResponse`/`successResponse`/`AppError`
  - `src/lib/supabase/server.ts` — `createAdminClient`/`createClient`
  - `src/lib/agents/email-generation.service.ts` — service de fase 2 existente (será reusado)
  - `src/lib/agents/chains/image.chain.ts`, `html.chain.ts` — chains existentes
  - `src/lib/services/notification.service.ts` — `notifyByRole`/`create`/`createBulk`
- ADRs/docs relacionados:
  - `docs/architecture/adr-klaviyo-revenue-source.md` (formato de ADR)
  - `docs/architecture/n8n-api-integration.md` (padrões n8n)
  - `docs/stories/epic-20-campaign-copy-generation.md` (precedente de copy via n8n + callback)
  - `CLAUDE.md` § Klaviyo, § Shopify, § CRM Convertfy (padrões gerais)

---

## Change Log

| Data | Autor | Mudança |
|------|-------|---------|
| 2026-05-29 | @architect | ADR criado para o Epic AE — Agent Email Generation |
