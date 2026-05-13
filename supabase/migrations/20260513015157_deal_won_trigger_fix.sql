-- Fix: events table nao tem coluna org_id (sao em metadata jsonb)
-- e tem actor_type NOT NULL. Adapta a function.

CREATE OR REPLACE FUNCTION ensure_onboarding_on_deal_won() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_stage_name TEXT;
  v_stage_type TEXT;
BEGIN
  SELECT name, stage_type INTO v_stage_name, v_stage_type
  FROM pipeline_stages WHERE id = NEW.stage_id;

  IF v_stage_name NOT IN ('Fechado Ganho','Ganho','Won','Closed Won','Fechado')
     AND COALESCE(v_stage_type,'open') NOT IN ('won') THEN
    RETURN NEW;
  END IF;

  INSERT INTO events (event_type, entity_type, entity_id, actor_id, actor_type, payload, metadata)
  VALUES (
    'deal.won',
    'deal',
    NEW.id,
    COALESCE(NEW.owner_id, NEW.created_by),
    'system',
    jsonb_build_object(
      'deal_id', NEW.id,
      'client_id', NEW.client_id,
      'store_id', NEW.store_id,
      'pipeline_id', NEW.pipeline_id,
      'title', NEW.title,
      'value', NEW.value
    ),
    jsonb_build_object('org_id', NEW.org_id)
  );

  RETURN NEW;
END;
$$;
