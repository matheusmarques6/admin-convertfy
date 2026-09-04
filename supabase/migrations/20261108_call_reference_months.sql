-- =============================================
-- Call de alinhamento: mês de referência + exclusão consistente
-- =============================================
--
-- (1) reference_months: de QUAL mês a call tratou. A data em que a
--     call aconteceu não responde "ficou algum mês sem alinhamento?" —
--     uma call em setembro costuma falar de agosto, e às vezes cobre
--     dois meses de uma vez (quando um foi pulado).
--     Formato "YYYY-MM" (ordenável como texto, sem fuso).
--
-- (2) O trigger só existia para INSERT/UPDATE. Excluir a call mais
--     recente deixava client_stores.last_feedback_date apontando para
--     uma call que não existe mais — o card seguiria mostrando uma
--     data fantasma. Agora recalcula também no DELETE.

ALTER TABLE store_feedback_calls
  ADD COLUMN IF NOT EXISTS reference_months TEXT[];

COMMENT ON COLUMN store_feedback_calls.reference_months IS
  'Meses que a call cobriu, formato YYYY-MM. Vazio = assume o mês anterior à call. Base do alerta de mês sem alinhamento.';

-- Backfill: calls existentes cobrem o mês ANTERIOR ao que aconteceram
-- (a convenção do time). Só onde ainda está nulo.
UPDATE store_feedback_calls
SET reference_months = ARRAY[
  to_char((conducted_at AT TIME ZONE 'America/Sao_Paulo') - INTERVAL '1 month', 'YYYY-MM')
]
WHERE reference_months IS NULL;

-- ── Recalcular a denormalização também no DELETE ───────────────────
CREATE OR REPLACE FUNCTION public.recalc_feedback_dates_after_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  v_last TIMESTAMPTZ;
BEGIN
  SELECT MAX(conducted_at) INTO v_last
  FROM store_feedback_calls
  WHERE store_id = OLD.store_id;

  UPDATE client_stores
  SET
    last_feedback_date = v_last,  -- NULL quando não sobrou nenhuma call
    next_feedback_date = CASE
      WHEN v_last IS NULL THEN NULL
      WHEN feedback_frequency = 'monthly' THEN
        DATE_TRUNC('month', v_last) + INTERVAL '1 month'
      ELSE v_last + INTERVAL '30 days'
    END
  WHERE id = OLD.store_id;

  RETURN OLD;
END;
$function$;

DROP TRIGGER IF EXISTS trigger_recalc_feedback_after_delete ON store_feedback_calls;
CREATE TRIGGER trigger_recalc_feedback_after_delete
  AFTER DELETE ON store_feedback_calls
  FOR EACH ROW
  EXECUTE FUNCTION public.recalc_feedback_dates_after_delete();

COMMENT ON FUNCTION public.recalc_feedback_dates_after_delete() IS
  'Reajusta client_stores.last_feedback_date quando uma call é excluída — sem isso o card mostraria a data de uma call apagada.';
