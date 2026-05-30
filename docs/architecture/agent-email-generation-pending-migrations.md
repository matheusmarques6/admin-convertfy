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
| 3 | `20260530c_copy_ready_dispatch_attempts.sql` | AE-4 patch | ⏳ pendente | Coluna `email_flow_emails.copy_ready_dispatch_attempts` + RPC pra cap do front-4 do watchdog |
| 4 | `20260530d_qa_agent_seed.sql` | AE-5 | ⏳ pendente | Seed v1 do `email_agent_configs.agent_type='qa'` com system_prompt + JSON schema |
| 5 | `20260530e_notifications_metadata_gin.sql` | AE-7 patch | ⏳ pendente | Index GIN parcial em `notifications.metadata` pra dedup-key query |
| 6 | `20260601_image_agent_niche_adaptive.sql` | AE-10 | ⏳ pendente | 5 colunas em `email_blueprints` (`image_brief`, `image_aspect`, `image_mode`, `image_overlay_reserve_bottom`, `image_produto_heroi_hint`) + tabela `store_image_overrides` |
| 7 | `20260622_image_agent_config_seed.sql` | AE-11 | ⏳ pendente | Seed v1 do `email_agent_configs.agent_type='image'` com switch Welcome E1-E6 (placeholders) + fallbacks pra cart/browse/win-back/upsell/post-purchase + `{{#if INSTRUCAO_ADICIONAL}}` hook |
| 8 | `20260623_welcome_blueprints_image_brief.sql` | AE-14 | ⏳ pendente | Data-only: UPDATE em Welcome E1-E5 + UPSERT E6 populando `image_brief`, `image_aspect` (4:5/3:5/4:3), `image_mode` (product_ref/text2img), `image_overlay_reserve_bottom`. Idempotente via `ON CONFLICT (flow_type, email_number) DO UPDATE`. |
| 9 | `20260624_image_agent_real_prompts.sql` | AE-14 | ⏳ pendente | Data-only: UPDATE no `user_template` da v1 ativa do `agent_type='image'` substituindo os 6 placeholders `<<E1..E6>>` da AE-11 pelos prompts mestres reais do documento niche-adaptive. Restricoes universais + hook `{{#if INSTRUCAO_ADICIONAL}}` preservados. |

(stories AE-9, AE-12, AE-13, AE-15..16 ainda não têm migrations — entram aqui conforme forem implementadas)

---

## Ordem de aplicação recomendada (7 pendentes)

Pode rodar todas juntas no Supabase Studio (cada uma é independente e idempotente):

1. `20260530c_copy_ready_dispatch_attempts.sql`
2. `20260530d_qa_agent_seed.sql`
3. `20260530e_notifications_metadata_gin.sql`
4. `20260601_image_agent_niche_adaptive.sql`
5. `20260622_image_agent_config_seed.sql`
6. `20260623_welcome_blueprints_image_brief.sql` (depende de #4 — colunas image_*)
7. `20260624_image_agent_real_prompts.sql` (depende de #5 — row ativa pra UPDATE)

Todas usam `IF NOT EXISTS` / `WHERE NOT EXISTS` / `ON CONFLICT DO UPDATE` / `CREATE OR REPLACE` — rodar 2x não causa erro.

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

---

*Última atualização: 2026-05-30 (após Story AE-14)*
