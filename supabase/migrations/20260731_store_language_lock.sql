-- 20260731_store_language_lock.sql
--
-- Override explícito de idioma pela edição manual do admin.
--
-- Problema: o dispatch de copy re-resolve o idioma via resolveStoreLanguage,
-- que dá prioridade ao form_responses.store_language sobre a coluna
-- client_stores.language. Resultado: editar o idioma na tela do admin não
-- tinha efeito — o formulário sempre vencia.
--
-- `language_locked = true` marca que o idioma foi setado MANUALMENTE pelo
-- admin (via PATCH /api/admin/stores/[id]). Quando ligado, resolveStoreLanguage
-- usa client_stores.language com prioridade máxima (source 'store_override'),
-- e os syncs form→store (confirmBriefing + auto-correct lazy do dispatch) NÃO
-- sobrescrevem mais a coluna.
--
-- Default false: lojas existentes seguem o comportamento atual (form vence)
-- até o idioma ser re-salvo no admin. Sem backfill automático — decisão
-- deliberada pra não mudar idioma de lojas que dependem do auto-resolve.
--
-- Idempotente: pode rodar múltiplas vezes sem efeito colateral.

ALTER TABLE client_stores
  ADD COLUMN IF NOT EXISTS language_locked boolean NOT NULL DEFAULT false;
