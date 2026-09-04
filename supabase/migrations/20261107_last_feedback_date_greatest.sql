-- =============================================
-- last_feedback_date: parar de andar para trás
-- =============================================
--
-- BUG: o trigger update_next_feedback_date fazia
--   last_feedback_date = NEW.conducted_at
-- SEM COMPARAR com o valor atual. Quem registra POR ÚLTIMO vencia,
-- mesmo registrando uma call ANTIGA — então registrar a call de 13/08
-- depois da de 03/09 fazia a data VOLTAR no tempo, e o card da
-- Gestão de Carteira continuava dizendo "atrasado" logo depois de o
-- CSM registrar a call. Lia como "não registrou".
--
-- É o mesmo defeito já corrigido no inbox (GREATEST no
-- crm_threads.last_message_at, migration 20261065): mensagem fora de
-- ordem afundava a conversa. Mesma cura aqui.
--
-- Também corrige o next_feedback_date, que era derivado da call
-- recém-inserida em vez da mais recente.

CREATE OR REPLACE FUNCTION public.update_next_feedback_date()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  v_last TIMESTAMPTZ;
BEGIN
  -- A call mais recente da loja (inclui a que acabou de entrar).
  SELECT MAX(conducted_at) INTO v_last
  FROM store_feedback_calls
  WHERE store_id = NEW.store_id;

  v_last := GREATEST(COALESCE(v_last, NEW.conducted_at), NEW.conducted_at);

  UPDATE client_stores
  SET
    last_feedback_date = v_last,
    -- autor/notas só acompanham quando a call inserida É a mais
    -- recente; registrar uma call antiga não reescreve o contexto
    -- da última conversa de verdade.
    last_feedback_by = CASE
      WHEN NEW.conducted_at >= v_last THEN NEW.conducted_by
      ELSE last_feedback_by
    END,
    feedback_notes = CASE
      WHEN NEW.conducted_at >= v_last THEN NEW.notes
      ELSE feedback_notes
    END,
    next_feedback_date = CASE
      WHEN feedback_frequency = 'monthly' THEN
        DATE_TRUNC('month', v_last) + INTERVAL '1 month'
      ELSE
        v_last + INTERVAL '30 days'
    END
  WHERE id = NEW.store_id;

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.update_next_feedback_date() IS
  'Mantém client_stores.last_feedback_date = MAX(conducted_at) das calls da loja. Nunca anda para trás (bug corrigido em 20261107).';

-- ── Backfill: repara o que o trigger antigo desalinhou ─────────────
-- Só toca lojas cuja coluna DIVERGE da call mais recente real.
UPDATE client_stores s
SET
  last_feedback_date = c.ultima,
  next_feedback_date = CASE
    WHEN s.feedback_frequency = 'monthly' THEN
      DATE_TRUNC('month', c.ultima) + INTERVAL '1 month'
    ELSE
      c.ultima + INTERVAL '30 days'
  END
FROM (
  SELECT store_id, MAX(conducted_at) AS ultima
  FROM store_feedback_calls
  GROUP BY store_id
) c
WHERE c.store_id = s.id
  AND (s.last_feedback_date IS DISTINCT FROM c.ultima);
