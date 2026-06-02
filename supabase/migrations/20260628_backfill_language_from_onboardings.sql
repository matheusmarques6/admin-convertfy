-- ============================================================
-- Backfill: language onboardings → client_stores
--
-- Resolve o gap em que a UI mostra um idioma (lido de
-- `onboardings.language`) mas o webhook do n8n envia outro (lido de
-- `client_stores.language`), porque o sync no `confirmBriefing` falhava
-- silenciosamente quando o label não batia com os 5 códigos canônicos
-- antigos (pt-BR/en/de/it/es).
--
-- Mudanças:
--   1. Amplia `client_stores.language` de VARCHAR(10) pra VARCHAR(32)
--      pra acomodar texto livre ("norueguês", "vietnamita", "afrikaans").
--   2. UPDATE: pra cada loja onde `client_stores.language` está no default
--      ou vazio MAS `onboardings.language` tem valor, copia o valor.
--
-- Estratégia de match — pega 1 onboarding por loja (o mais recente com
-- language preenchido). Idempotente: filtra rows que ainda estão no
-- default; rerodar não bagunça lojas que já foram corrigidas pela mão.
--
-- A correção no código (confirmBriefing + STORE_LANGUAGE_OPTIONS
-- expandido + aliases pt/en) cuida do fluxo daqui pra frente. Esta
-- migration cuida do backlog.
-- ============================================================

-- ── 1. Amplia capacidade da coluna ──
-- VARCHAR(10) só cabe códigos ISO curtos (pt-BR=5, nb=2, zh=2).
-- Texto livre como "norueguês" (9), "vietnamita" (10), "afrikaans" (9)
-- estão no limite. 32 chars dá folga sem inflar o índice.
ALTER TABLE client_stores
  ALTER COLUMN language TYPE VARCHAR(32);

-- ── 2. Backfill propriamente dito ──
-- Usa subquery pra pegar 1 onboarding por loja (mais novo com language
-- preenchido). Filtra `client_stores.language` no default ou null pra
-- não sobrescrever lojas já corrigidas. LOWER+TRIM normaliza
-- consistente com o que confirmBriefing escreve daqui em diante.
UPDATE client_stores cs
   SET language = LOWER(TRIM(latest.language))
  FROM (
    SELECT DISTINCT ON (o.store_id)
      o.store_id,
      o.language
    FROM onboardings o
    WHERE o.language IS NOT NULL
      AND TRIM(o.language) <> ''
      AND LOWER(TRIM(o.language)) <> 'pt-br'
    ORDER BY o.store_id, o.updated_at DESC NULLS LAST, o.created_at DESC
  ) AS latest
 WHERE latest.store_id = cs.id
   AND (
     cs.language IS NULL
     OR cs.language = ''
     OR cs.language = 'pt-BR'
   );
