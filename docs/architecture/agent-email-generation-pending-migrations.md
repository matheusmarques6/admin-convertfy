# Migrations pendentes — Epic AE (Agent Email Generation + Image Niche-Adaptive)

Lista das migrations criadas durante os épicos AE-1..AE-15+ e seu status de aplicação em prod.

**Ambiente alvo**: Supabase prod via Supabase Studio SQL editor (mesmo padrão usado nas anteriores).

**Convenção**: ✅ aplicada · ⏳ pendente · ⚠️ aplicar antes de feature dependente

---

## Status atual

| Ordem | Arquivo | Story | Status | O que faz |
|---|---|---|---|---|
| 1 | `20260530_agent_email_generation.sql` | AE-1 | ✅ aplicada | Schema base: status enum estendido, telemetria, `profiles.tags`, `email_generation_queue_signals`, trigger de briefing confirmed, `email_status_events` |
| 2 | `20260530b_increment_email_attempts.sql` | AE-2 patch | ✅ aplicada | RPC `increment_email_attempts(UUID[])` |
| 3 | `20260530c_copy_ready_dispatch_attempts.sql` | AE-4 patch | ✅ aplicada | Coluna `email_flow_emails.copy_ready_dispatch_attempts` + RPC pra cap do front-4 do watchdog |
| 4 | `20260530d_qa_agent_seed.sql` | AE-5 | ✅ aplicada | Seed v1 do `email_agent_configs.agent_type='qa'` com system_prompt + JSON schema |
| 5 | `20260530e_notifications_metadata_gin.sql` | AE-7 patch | ✅ aplicada | Index GIN parcial em `notifications.metadata` pra dedup-key query |
| 6 | `20260601_image_agent_niche_adaptive.sql` | AE-10 | ✅ aplicada | 5 colunas em `email_blueprints` (`image_brief`, `image_aspect`, `image_mode`, `image_overlay_reserve_bottom`, `image_produto_heroi_hint`) + tabela `store_image_overrides` |
| 7 | `20260622_image_agent_config_seed.sql` | AE-11 | ✅ aplicada | Seed v1 do `email_agent_configs.agent_type='image'` com switch Welcome E1-E6 (placeholders) + fallbacks pra cart/browse/win-back/upsell/post-purchase + `{{#if INSTRUCAO_ADICIONAL}}` hook |
| 8 | `20260623_welcome_blueprints_image_brief.sql` | AE-14 | ✅ aplicada | Data-only: UPSERT em Welcome E1-E6 populando `image_brief`, `image_aspect` (4:5/3:5/4:3), `image_mode` (product_ref/text2img), `image_overlay_reserve_bottom`. Idempotente via `ON CONFLICT (flow_type, email_number) DO UPDATE`. |
| 9 | `20260624_image_agent_real_prompts.sql` | AE-14 | ✅ aplicada | Data-only: UPDATE no `user_template` da v1 ativa do `agent_type='image'` substituindo os 6 placeholders `<<E1..E6>>` da AE-11 pelos prompts mestres reais do documento niche-adaptive. Restricoes universais + hook `{{#if INSTRUCAO_ADICIONAL}}` preservados. |
| 10 | `20260625_qa_agent_image_issue_types.sql` | AE-15 | ✅ aplicada | Data-only: UPDATE in-place no `system_prompt` + `output_schema` da v1 ativa do `agent_type='qa'` adicionando 4 issue types (`image_nicho_mismatch`, `image_paleta_off`, `image_overlay_reserva_ausente`, `image_cena_inadequada`) + instrução pra comparar `image_alt` vs PRODUTO_HEROI. Idempotente. Depende de #4 (AE-5 seed). |
| 11 | `20260626_auto_seed_flows.sql` | AE-17 | ⏳ pendente | Trigger `fn_seed_default_flows_on_store_insert` em `client_stores` que cria 7 flows + 38 emails (status `draft`) sempre que uma loja é inserida. Idempotente via `ON CONFLICT (store_id, flow_type) DO NOTHING` + `WHERE NOT EXISTS` no insert dos emails. Catálogo bate 1:1 com `flow-seed.service.ts`. |
| 12 | `20260626b_brand_identity_confirmation.sql` | AE-18 | ⏳ pendente | Colunas `store_brand_identity.confirmed_at / confirmed_by` + index parcial `idx_brand_identity_confirmed` (cron query da latest confirmed) + trigger `trg_brand_identity_confirmed` (SECURITY DEFINER, search_path hardened) que enfileira sinal em `email_generation_queue_signals` quando confirmed_at vai NULL→NOT NULL. |
| 13 | `20260626c_email_render_signal_type.sql` | AE-19 | ⏳ pendente | Promove `signal_type` a coluna dedicada em `email_generation_queue_signals` (DEFAULT `'start'` + CHECK em `'start'|'render'|'rerender'`) + backfill rows AE-18 (payload→coluna) + index parcial `idx_eqs_pending_by_type` + `CREATE OR REPLACE` do trigger fn_on_brand_identity_confirmed pra escrever direto na coluna. |
| 14 | `20260626d_backfill_brand_identity_confirmed.sql` | AE-21 | ⏳ pendente | Backfill: brand identities com `source IN ('manual','edited')` viram `confirmed_at = COALESCE(confirmed_at, created_at)`. `source='ai_capture'` permanece NULL. Usa `SET LOCAL session_replication_role='replica'` pra desabilitar trigger AE-18/AE-19 durante o UPDATE em massa (evita flood de sinais 'render' no cron). Idempotente. |

(stories AE-9, AE-12, AE-13, AE-16, AE-20 não têm migration própria — code-only.)

---

## Ordem de aplicação recomendada (8 pendentes)

Pode rodar todas juntas no Supabase Studio (cada uma é independente e idempotente):

1. `20260530c_copy_ready_dispatch_attempts.sql`
2. `20260530d_qa_agent_seed.sql`
3. `20260530e_notifications_metadata_gin.sql`
4. `20260601_image_agent_niche_adaptive.sql`
5. `20260622_image_agent_config_seed.sql`
6. `20260623_welcome_blueprints_image_brief.sql` (depende de #4 — colunas image_*)
7. `20260624_image_agent_real_prompts.sql` (depende de #5 — row ativa pra UPDATE)
8. `20260625_qa_agent_image_issue_types.sql` (depende de #2 — row ativa do QA agent)

Todas usam `IF NOT EXISTS` / `WHERE NOT EXISTS` / `ON CONFLICT DO UPDATE` / `CREATE OR REPLACE` — rodar 2x não causa erro.

### Épico AE Pipeline Split (AE-17..21) — ordem obrigatória

As 4 migrations do épico AE Pipeline Split têm **dependência sequencial** e DEVEM rodar nesta ordem:

| Ordem | Arquivo | Story | Depende de |
|---|---|---|---|
| A | `20260626_auto_seed_flows.sql` | AE-17 | (nenhuma) |
| B | `20260626b_brand_identity_confirmation.sql` | AE-18 | (nenhuma) |
| C | `20260626c_email_render_signal_type.sql` | AE-19 | B (consome `payload->>'signal_type'` que o trigger AE-18 produz) |
| D | `20260626d_backfill_brand_identity_confirmed.sql` | AE-21 | B + C (precisa das colunas `confirmed_at/by` + signal_type pra não emitir sinais legados) |

**Não pular ordem**: C lê dados que B já gravou. D pressupõe trigger existente (B) e signal_type como coluna (C) — sem C, o backfill ainda funciona porém o trigger desativado também não seria problema, mas a ordem A→B→C→D mantém o invariante mental.

---

## Smoke tests sugeridos (1 query por migration)

```sql
-- AE-4 patch: confirma a função RPC
SELECT proname FROM pg_proc WHERE proname = 'increment_copy_ready_dispatch_attempts';

-- AE-5: confirma o seed do QA agent
SELECT version, is_active, length(system_prompt) AS sp_len
FROM email_agent_configs WHERE agent_type = 'qa' ORDER BY version DESC LIMIT 1;

-- AE-7 patch: confirma o index GIN parcial
SELECT indexname FROM pg_indexes
WHERE tablename = 'notifications' AND indexname = 'idx_notifications_dedup_key';

-- AE-10: confirma as colunas novas em email_blueprints + tabela de overrides
SELECT column_name FROM information_schema.columns
WHERE table_name = 'email_blueprints'
  AND column_name IN ('image_brief','image_aspect','image_mode',
                      'image_overlay_reserve_bottom','image_produto_heroi_hint');
SELECT to_regclass('public.store_image_overrides');

-- AE-11: confirma o seed do agent_type='image'
SELECT version, is_active, length(user_template) AS template_len
FROM email_agent_configs WHERE agent_type = 'image' ORDER BY version DESC LIMIT 1;

-- AE-14: confirma blueprints Welcome E1-E6 com image_* preenchidos
SELECT email_number, image_aspect, image_mode, image_overlay_reserve_bottom
FROM email_blueprints WHERE flow_type = 'welcome' ORDER BY email_number;
-- esperado: 6 rows; aspects 4:5,4:5,3:5,4:5,4:3,4:5; modes product_ref/text2img

-- AE-14: confirma que prompts reais substituiram placeholders
SELECT length(user_template) AS sz,
       position('<<E1' IN user_template) AS placeholder_gone
FROM email_agent_configs WHERE agent_type = 'image' AND is_active = true;
-- esperado: sz > 4000, placeholder_gone = 0

-- AE-15: confirma os 4 novos issue types no system_prompt + output_schema
SELECT length(system_prompt) AS sp_len,
       position('image_nicho_mismatch' IN system_prompt) AS has_new_prompt,
       output_schema->'properties'->'issues'->'items'->'properties'->'type'->'enum'
         AS schema_enum
FROM email_agent_configs WHERE agent_type = 'qa' AND is_active = true;
-- esperado: has_new_prompt > 0, schema_enum tem 12 valores

-- AE-17 (auto-seed): loja recém-criada tem 7 flows + 38 emails sem clique
-- Substituir <NEW_STORE_ID> pelo id de uma loja criada APÓS a aplicação da migration.
SELECT s.id,
       COUNT(DISTINCT f.id) AS flows,
       COUNT(DISTINCT efe.id) AS emails
FROM client_stores s
LEFT JOIN email_flows f ON f.store_id = s.id
LEFT JOIN email_flow_emails efe ON efe.flow_id = f.id
WHERE s.id = '<NEW_STORE_ID>'
GROUP BY s.id;
-- esperado: flows = 7, emails = 38

-- AE-17 (trigger registrado em client_stores)
SELECT trigger_name FROM information_schema.triggers
WHERE event_object_table = 'client_stores'
  AND trigger_name = 'tr_seed_default_flows_on_store_insert';
-- esperado: 1 row

-- AE-18 (confirmation gate): colunas existem
SELECT column_name FROM information_schema.columns
WHERE table_name = 'store_brand_identity'
  AND column_name IN ('confirmed_at', 'confirmed_by');
-- esperado: 2 rows

-- AE-18 (trigger registrado em store_brand_identity)
SELECT trigger_name FROM information_schema.triggers
WHERE event_object_table = 'store_brand_identity'
  AND trigger_name = 'tr_on_brand_identity_confirmed';
-- esperado: 1 row

-- AE-18 (index parcial pra latest confirmed)
SELECT indexname FROM pg_indexes
WHERE tablename = 'store_brand_identity'
  AND indexname = 'idx_brand_identity_confirmed';
-- esperado: 1 row

-- AE-19 (signal_type como coluna dedicada + backfill aplicado)
SELECT signal_type, COUNT(*) AS qtd
FROM email_generation_queue_signals
GROUP BY signal_type
ORDER BY signal_type;
-- esperado: ao menos 'start' (rows legadas); 'render' aparece após primeira
-- confirmação de brand identity pós-AE-18.

-- AE-19 (índice parcial pra dispatcher buscar pendentes por tipo)
SELECT indexname FROM pg_indexes
WHERE tablename = 'email_generation_queue_signals'
  AND indexname = 'idx_eqs_pending_by_type';
-- esperado: 1 row

-- AE-19 (CHECK constraint nos 3 valores permitidos)
SELECT conname, pg_get_constraintdef(oid) AS def
FROM pg_constraint
WHERE conrelid = 'email_generation_queue_signals'::regclass
  AND contype = 'c'
  AND conname LIKE '%signal_type%';
-- esperado: 1 row contendo 'start','render','rerender'

-- AE-21 (backfill aplicado: manual/edited confirmados, ai_capture pending)
SELECT source,
       COUNT(*) FILTER (WHERE confirmed_at IS NOT NULL) AS confirmed,
       COUNT(*) FILTER (WHERE confirmed_at IS NULL)     AS pending,
       COUNT(*) AS total
FROM store_brand_identity
GROUP BY source
ORDER BY source;
-- esperado:
--   source='manual'     → confirmed = total, pending = 0
--   source='edited'     → confirmed = total, pending = 0
--   source='ai_capture' → confirmed = 0,     pending = total

-- AE-21 (verifica que o backfill NÃO disparou flood de sinais 'render'
-- — o backfill roda com session_replication_role='replica')
-- Rodar IMEDIATAMENTE após a migration D; quantidade de sinais 'render'
-- deve refletir apenas confirmações genuínas pós-AE-18, não o backfill.
SELECT signal_type, COUNT(*) AS qtd
FROM email_generation_queue_signals
WHERE signal_type = 'render'
GROUP BY signal_type;
-- esperado: 0 rows logo após D (a menos que algum designer tenha
-- confirmado uma brand identity manualmente entre B/C e D).
```

---

## Comportamento sem aplicar (degrade graceful)

Cada feature funciona em fallback se a migration ainda não rodou:

| Migration pendente | Sem ela acontece |
|---|---|
| AE-4 patch | Watchdog front-4 não cap stale copy_ready → loop infinito teórico (mas só dispara se endpoint interno falhar 30+min). |
| AE-5 | QA agent retorna `{passed:true, issues:[]}` (degrade no `runQaAgent` quando config ativa não existe). |
| AE-7 patch | Dedup-key query usa seq-scan em `notifications.metadata` (lento conforme cresce). |
| AE-10 | `buildImagePromptVars` retorna 12 vars UPPERCASE com fallbacks dos helpers; `store_image_overrides.*` simplesmente não existe pra ler. |
| AE-11 | `phase2-runner` cai no fallback `DEFAULT_IMAGE_PROMPT_TEMPLATE` hardcoded em `image.chain.ts` (legacy `{var}` interpolação, mesmo prompt pra todos os emails). |
| AE-14 (blueprints) | `email_blueprints.image_*` ficam NULL nos Welcome E1-E6 → `mode-resolution` cai no default `text2img` 4:5 sem overlay reserve. Pipeline gera, mas sem diferenciação por slot. |
| AE-14 (prompts) | `user_template` ativo ainda usa placeholders `<<E1..E6>>` da AE-11 → o LLM recebe texto literal "<<E1 — hero lifestyle...>>" como prompt e gera imagens genéricas. Resolução parcial dos casos L'Hombre / produto-errado. |
| AE-15 | Zod schema do `qa.chain.ts` aceita os 12 issue types em runtime, mas o LLM textual continua com o prompt v1 antigo (só 8 tipos) — nunca vai emitir `image_nicho_mismatch`. Cascade Etapa 1 vira no-op silencioso. Etapa 2 (vision) continua funcionando pois nao depende do prompt textual. |
| AE-17 | Lojas novas NÃO recebem flows automaticamente — designer tem que rodar `flow-seed.service.ts` manualmente via UI ou ficar com a loja "vazia" no /admin/stores/[id]/producao. Sem regressão funcional, só fricção operacional. |
| AE-18 | Coluna `confirmed_at` não existe → endpoint `/api/admin/stores/[id]/brand-identity/confirm` retorna 500 (PG `undefined column`). Pipeline fase 2 não tem gate: copy_ready transita direto pra rendering como antes. Reverter para release implica reverter código AE-19 também. |
| AE-19 | `signal_type` ainda é só payload jsonb. O cron dispatcher (`/api/cron/email-generation`) lê via `payload->>'signal_type'`, então roda; mas o trigger AE-18 escreve via coluna inexistente → ERROR no INSERT. Migration B precisa de C pra trigger funcionar. |
| AE-21 | Brand identities legadas com `source='manual'/'edited'` permanecem `confirmed_at = NULL` → designer precisa abrir cada loja antiga e clicar "Confirmar identidade visual" individualmente antes da fase 2 disparar. Lojas novas (pós-AE-18) não são afetadas. |

Nada quebra. Mas as features niche-adaptive não ativam até rodar.

---

## Histórico de SQL copy-paste mandados pelo Claude Code

(referência rápida — texto completo está nos arquivos correspondentes em `supabase/migrations/`)

- AE-2b: 2 funções (`increment_email_attempts(UUID[])` + singular)
- AE-4 patch: coluna `copy_ready_dispatch_attempts INT DEFAULT 0` + RPC `increment_copy_ready_dispatch_attempts(UUID[])`
- AE-5: INSERT em `email_agent_configs` (system_prompt longo)
- AE-7 patch: `CREATE INDEX IF NOT EXISTS idx_notifications_dedup_key ON notifications USING GIN (metadata) WHERE metadata ? 'dedup_key';`
- AE-10: ALTER em `email_blueprints` + CREATE de `store_image_overrides`
- AE-11: INSERT v1 em `email_agent_configs` com `agent_type='image'`
- AE-14 (blueprints): UPDATE em Welcome E1-E5 + UPSERT E6 com `image_brief`/`image_aspect`/`image_mode`/`image_overlay_reserve_bottom`
- AE-14 (prompts): UPDATE no `user_template` da v1 ativa substituindo `<<E1..E6>>` pelos prompts mestres reais
- AE-15: UPDATE no `system_prompt` + `output_schema` da v1 ativa do `agent_type='qa'` adicionando 4 issue types (image_*) + instrução sobre comparação image_alt vs PRODUTO_HEROI
- AE-17: CREATE FUNCTION `fn_seed_default_flows_on_store_insert()` + CREATE TRIGGER em `client_stores AFTER INSERT` — replica `flow-seed.service.ts` (7 flows × emails)
- AE-18: ALTER em `store_brand_identity` (`confirmed_at`/`confirmed_by`) + CREATE INDEX parcial + CREATE FUNCTION `fn_on_brand_identity_confirmed` (SECURITY DEFINER) + CREATE TRIGGER
- AE-19: ALTER em `email_generation_queue_signals` adicionando coluna `signal_type` (DEFAULT `'start'` + CHECK) + UPDATE backfill (payload→coluna) + CREATE INDEX parcial `idx_eqs_pending_by_type` + CREATE OR REPLACE no trigger AE-18
- AE-21: UPDATE em `store_brand_identity` setando `confirmed_at = COALESCE(confirmed_at, created_at)` para `source IN ('manual','edited')`, rodando com `SET LOCAL session_replication_role='replica'` pra suprimir triggers e evitar flood

---

## Épico AE Pipeline Split — runbook ops

### Visão geral

O pipeline AE foi splittado em **2 gates** sequenciais:

1. **Gate 1 (briefing confirmed)** — copy generation. Dispara quando
   `store_briefings.status='confirmed'` (trigger AE-1) → sinal `'start'`
   em `email_generation_queue_signals` → fase 1 (copy generation N8N).
   Output: emails em `copy_ready`.
2. **Gate 2 (brand identity confirmed)** — render + QA. Dispara quando
   `store_brand_identity.confirmed_at` vai NULL → NOT NULL (trigger AE-18) →
   sinal `'render'` em `email_generation_queue_signals` → fase 2
   (image + html + QA). Output: emails em `ready`.

Antes do épico AE Pipeline Split, copy_ready transitava direto pra rendering.
O gate 2 dá controle ao designer para revisar a identidade visual capturada
automaticamente antes de gastar tokens/dólares com imagem.

### Sequência de aplicação das 4 migrations (obrigatória)

| Ordem | Arquivo | Por quê |
|---|---|---|
| **A** | `20260626_auto_seed_flows.sql` | Independente; lojas novas passam a receber flows |
| **B** | `20260626b_brand_identity_confirmation.sql` | Cria colunas `confirmed_at/by` + trigger gate 2 |
| **C** | `20260626c_email_render_signal_type.sql` | Promove signal_type a coluna; trigger AE-18 precisa dela |
| **D** | `20260626d_backfill_brand_identity_confirmed.sql` | Backfill legadas; usa `session_replication_role='replica'` |

**NÃO pular ordem** — D pressupõe B e C aplicados. C pressupõe B aplicado
(o trigger AE-18 referencia a coluna criada em C).

### Cenários de uso

| Cenário | Comportamento esperado |
|---|---|
| **Loja nova (pós-AE-17)** | INSERT em `client_stores` dispara auto-seed → 7 flows + 38 emails em `draft`. Quando briefing for confirmado → sinal `start` → copy gen → `copy_ready`. Quando brand identity for confirmada → sinal `render` → fase 2 → `ready`. |
| **Loja legada com brand_identity manual/edited** | AE-21 marca como confirmada retroativamente. NÃO emite sinal `render` (trigger desabilitado). Se houver emails em `copy_ready` aguardando, designer precisa usar o botão "Re-renderizar tudo" (AE-20) ou inserir sinal `render` manualmente. |
| **Loja legada com brand_identity = ai_capture** | Permanece `confirmed_at = NULL` após AE-21. Designer precisa abrir `/admin/stores/[id]` e clicar **Confirmar identidade visual** (AE-18 UI). Aí o trigger normal dispara o sinal `render` e a fase 2 roda. |
| **Loja sem brand_identity** | Phase 2 nunca dispara. Designer precisa criar a brand identity (manual ou via captura automática + edição) e confirmar antes de a fase 2 sair de `copy_ready`. |

### Comandos ops

**Quantos emails estão presos em copy_ready aguardando confirmação visual?**

```sql
SELECT s.id AS store_id,
       s.name AS store_name,
       COUNT(efe.id) AS emails_in_copy_ready,
       sbi.confirmed_at IS NOT NULL AS brand_identity_confirmed
FROM email_flow_emails efe
JOIN email_flows f ON f.id = efe.flow_id
JOIN client_stores s ON s.id = f.store_id
LEFT JOIN LATERAL (
  SELECT confirmed_at
  FROM store_brand_identity
  WHERE store_id = s.id
  ORDER BY created_at DESC
  LIMIT 1
) sbi ON true
WHERE efe.status = 'copy_ready'
GROUP BY s.id, s.name, sbi.confirmed_at
ORDER BY emails_in_copy_ready DESC;
```

Linhas com `brand_identity_confirmed = false` são as "presas". Resolvê-las
via UI (designer confirma brand identity) ou via SQL manual:

```sql
-- Confirmar manualmente (admin override; usa o seu profile id como confirmed_by)
UPDATE store_brand_identity
   SET confirmed_at = NOW(),
       confirmed_by = '<your_profile_id>'
 WHERE store_id = '<store_id>'
   AND confirmed_at IS NULL;
-- Trigger dispara → sinal 'render' → fase 2 sobe automaticamente
```

**Forçar re-render de um flow inteiro (pós-edição de blueprint, troca de prompt etc.)** — use o botão AE-20 em `/admin/stores/[id]/producao` (preferido) ou:

```sql
INSERT INTO email_generation_queue_signals (store_id, flow_id, signal_type)
VALUES ('<store_id>', '<flow_id>', 'rerender');
```

### Após o último push

Épico AE Pipeline Split (AE-17..21) **completo no código**. Restam apenas as 4
migrations pendentes (A→B→C→D) para aplicar via Supabase Studio.

---

*Última atualização: 2026-05-31 (após Story AE-21 — fim do épico AE Pipeline Split)*
