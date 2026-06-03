-- ============================================================
-- Backfill: language onboardings → client_stores
--
-- Resolve o gap em que a UI mostra um idioma (lido de
-- `onboardings.form_responses->>'store_language_other'`) mas o webhook
-- do n8n envia outro (lido de `client_stores.language`).
--
-- Causa raiz (corrigida em src/lib/services/onboarding-pipeline.service.ts):
--   1. Usuário escolhe "Outro" no formulário → form_responses.store_language = 'Outro'
--   2. Digita texto livre (ex: "norueguês") → form_responses.store_language_other = 'norueguês'
--   3. `confirmBriefing` antigo só olhava store_language; languageLabelToCode('Outro') = null → UPDATE pulado
--   4. UI lê store_language_other → exibe "norueguês"
--   5. client_stores.language fica no default 'pt-BR'
--   6. Webhook lê client_stores.language → envia "pt-BR"
--
-- Mudanças:
--   1. Amplia client_stores.language de VARCHAR(10) → VARCHAR(32) (texto livre).
--   2. UPDATE retroativo: pra cada loja com gap, copia o melhor valor
--      disponível: store_language_other quando store_language='Outro',
--      senão store_language quando é texto livre fora dos códigos
--      canônicos. Aliases pt/en convertidos pra ISO (norueguês → nb).
--
-- Idempotente — filtra rows que já têm valor não-default.
-- ============================================================

-- ── 1. Amplia capacidade da coluna ──
ALTER TABLE client_stores
  ALTER COLUMN language TYPE VARCHAR(32);

-- ── 2. Backfill: resolve o melhor valor por loja ──
-- COALESCE prioriza store_language_other quando store_language='Outro'.
-- Aliases pt/en mapeados pra códigos ISO inline pra manter consistência
-- com o que o código novo escreve daqui pra frente.
WITH best_lang AS (
  SELECT DISTINCT ON (o.store_id)
    o.store_id,
    LOWER(TRIM(
      COALESCE(
        -- "Outro" → puxa do campo livre
        CASE
          WHEN LOWER(TRIM(o.form_responses->>'store_language')) = 'outro'
            THEN NULLIF(TRIM(o.form_responses->>'store_language_other'), '')
          ELSE NULL
        END,
        -- Senão usa store_language direto
        NULLIF(TRIM(o.form_responses->>'store_language'), ''),
        -- Fallback final: onboardings.language (raro)
        NULLIF(TRIM(o.language), '')
      )
    )) AS resolved_lang
  FROM onboardings o
  WHERE o.form_responses IS NOT NULL OR o.language IS NOT NULL
  ORDER BY o.store_id, o.updated_at DESC NULLS LAST, o.created_at DESC
),
mapped AS (
  -- Aplica aliases comuns pra ISO (espelho do LANGUAGE_ALIASES do código TS)
  SELECT
    store_id,
    CASE resolved_lang
      WHEN 'português' THEN 'pt-BR'
      WHEN 'portugues' THEN 'pt-BR'
      WHEN 'portuguese' THEN 'pt-BR'
      WHEN 'inglês' THEN 'en'
      WHEN 'ingles' THEN 'en'
      WHEN 'english' THEN 'en'
      WHEN 'espanhol' THEN 'es'
      WHEN 'spanish' THEN 'es'
      WHEN 'alemão' THEN 'de'
      WHEN 'alemao' THEN 'de'
      WHEN 'german' THEN 'de'
      WHEN 'francês' THEN 'fr'
      WHEN 'frances' THEN 'fr'
      WHEN 'french' THEN 'fr'
      WHEN 'italiano' THEN 'it'
      WHEN 'italian' THEN 'it'
      WHEN 'holandês' THEN 'nl'
      WHEN 'holandes' THEN 'nl'
      WHEN 'dutch' THEN 'nl'
      WHEN 'norueguês' THEN 'nb'
      WHEN 'noruegues' THEN 'nb'
      WHEN 'norwegian' THEN 'nb'
      WHEN 'no' THEN 'nb'
      WHEN 'sueco' THEN 'sv'
      WHEN 'swedish' THEN 'sv'
      WHEN 'dinamarquês' THEN 'da'
      WHEN 'dinamarques' THEN 'da'
      WHEN 'danish' THEN 'da'
      WHEN 'finlandês' THEN 'fi'
      WHEN 'finlandes' THEN 'fi'
      WHEN 'finnish' THEN 'fi'
      WHEN 'polonês' THEN 'pl'
      WHEN 'polones' THEN 'pl'
      WHEN 'polish' THEN 'pl'
      WHEN 'japonês' THEN 'ja'
      WHEN 'japones' THEN 'ja'
      WHEN 'japanese' THEN 'ja'
      WHEN 'chinês' THEN 'zh'
      WHEN 'chines' THEN 'zh'
      WHEN 'chinese' THEN 'zh'
      WHEN 'mandarim' THEN 'zh'
      WHEN 'coreano' THEN 'ko'
      WHEN 'korean' THEN 'ko'
      ELSE resolved_lang  -- texto livre permanece (ex: "vietnamita")
    END AS final_lang
  FROM best_lang
  WHERE resolved_lang IS NOT NULL
    AND resolved_lang NOT IN ('outro', '')
)
UPDATE client_stores cs
   SET language = m.final_lang
  FROM mapped m
 WHERE m.store_id = cs.id
   AND m.final_lang IS NOT NULL
   AND LENGTH(m.final_lang) BETWEEN 2 AND 32
   AND m.final_lang ~ '^[a-zà-ÿ\s-]+$'
   AND (
     cs.language IS NULL
     OR cs.language = ''
     OR cs.language = 'pt-BR'
   )
   AND m.final_lang <> 'pt-br';
