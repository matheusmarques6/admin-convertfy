-- Trigger: ao mover deal pra stage "Fechado Ganho", publica evento
-- deal.won pro handler do app criar onboarding correspondente.
-- Estratégia: NÃO criar onboarding direto no SQL (preserva lógica do
-- service handler). Apenas registra evento em events table.

CREATE OR REPLACE FUNCTION ensure_onboarding_on_deal_won() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_stage_name TEXT;
  v_stage_type TEXT;
BEGIN
  SELECT name, stage_type INTO v_stage_name, v_stage_type
  FROM pipeline_stages WHERE id = NEW.stage_id;

  -- Nomes considerados "won" (cobre default + variacoes)
  IF v_stage_name NOT IN ('Fechado Ganho','Ganho','Won','Closed Won','Fechado')
     AND COALESCE(v_stage_type,'open') NOT IN ('won') THEN
    RETURN NEW;
  END IF;

  -- Publica evento (handler do app processa idempotente)
  INSERT INTO events (event_type, entity_type, entity_id, actor_id, payload, org_id)
  VALUES (
    'deal.won',
    'deal',
    NEW.id,
    COALESCE(NEW.owner_id, NEW.created_by),
    jsonb_build_object(
      'deal_id', NEW.id,
      'client_id', NEW.client_id,
      'store_id', NEW.store_id,
      'pipeline_id', NEW.pipeline_id,
      'title', NEW.title,
      'value', NEW.value
    ),
    NEW.org_id
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_deal_stage_change_to_won ON deals;
CREATE TRIGGER on_deal_stage_change_to_won
  AFTER UPDATE OF stage_id ON deals
  FOR EACH ROW
  WHEN (NEW.stage_id IS DISTINCT FROM OLD.stage_id)
  EXECUTE FUNCTION ensure_onboarding_on_deal_won();
