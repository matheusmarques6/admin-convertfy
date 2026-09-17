-- Trilha B3 (set/2026) — a biblioteca ganha o eixo de SEÇÃO que faltava.
--
-- `dispositivo` é o vocabulário FECHADO de 22 valores (fonte única em
-- `src/lib/agents/shared/dispositivos.ts`; um teste compara este CHECK com
-- a lista). Nasce NULLABLE: o backfill das 44 variantes é curadoria
-- (`DADOS_20260914_backfill_dispositivo.sql`, com a confiança linha a
-- linha), e enquanto uma variante está NULL o filtro por dispositivo é
-- fail-open para ela. NOT NULL entra numa migration própria depois da
-- revisão — antes disso, o INSERT da tela quebraria.
--
-- `anatomia_slug` — identidade da ANATOMIA (o slug da nota do vault quando
-- existe; senão o nome normalizado). É a chave da memória de uso e da
-- regra "a mesma anatomia não repete na peça" (B3) e do gerador de
-- anatomias (B4: `body_tese_a`, `body_tese_b`…).
-- `tokens_de_identidade` — o HTML usa {{COR_PRINCIPAL}}… em vez de hex (B5).
-- `source` — `manual` (cadastrada/colada) ou `gerada` (gerador B4).
-- `geracao_meta` — prompt/refs/lint/prévias da geração (B4).

ALTER TABLE email_component_variants
  ADD COLUMN IF NOT EXISTS dispositivo TEXT,
  ADD COLUMN IF NOT EXISTS anatomia_slug TEXT,
  ADD COLUMN IF NOT EXISTS tokens_de_identidade BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS geracao_meta JSONB;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ecv_dispositivo_check') THEN
    ALTER TABLE email_component_variants ADD CONSTRAINT ecv_dispositivo_check
      CHECK (dispositivo IS NULL OR dispositivo IN (
        'hero_apresentacao','hero_oferta_cupom','hero_pergunta','hero_lineup',
        'body_tese','body_mecanismo_visual','body_garantias','body_comparacao','body_faq','body_passos',
        'products_grade_preco','products_grade_sem_preco','products_unico_oferta','products_galeria',
        'reviews_2','reviews_3plus','reviews_com_credencial',
        'offer_cupom','offer_sem_cupom','offer_lembrete',
        'footer_nav','footer_minimo'
      ));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ecv_source_check') THEN
    ALTER TABLE email_component_variants ADD CONSTRAINT ecv_source_check
      CHECK (source IN ('manual','gerada'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_ecv_dispositivo_ativa
  ON email_component_variants (block_type, dispositivo)
  WHERE is_active = true;

COMMENT ON COLUMN email_component_variants.dispositivo IS
  'Eixo de seção (B3), vocabulário fechado de 22 valores — ver src/lib/agents/shared/dispositivos.ts. NULL = ainda não classificada (filtro fail-open).';
COMMENT ON COLUMN email_component_variants.anatomia_slug IS
  'Identidade da anatomia: slug da nota do vault quando existe, senão o nome normalizado. Chave da memória de uso e da regra de não-repetição.';
COMMENT ON COLUMN email_component_variants.tokens_de_identidade IS
  'O HTML usa tokens {{COR_*}}/{{FONTE_*}} resolvidos por loja antes da fase 2 (B5). false = hex cru; o Cores & Botões continua reescrevendo.';
COMMENT ON COLUMN email_component_variants.source IS
  'manual = cadastrada à mão; gerada = pelo gerador de anatomias (B4), entra is_active=false até aprovação.';
