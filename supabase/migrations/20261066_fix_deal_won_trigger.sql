-- ═══════════════════════════════════════════════════════════════════
-- Fix: mover deal para etapa de ganho falhava e o card "voltava"
-- ═══════════════════════════════════════════════════════════════════
--
-- Incidente (ago/2026): arrastar um negócio para colunas de ganho
-- ("Ganho", "Fechado Ganho", "Fechado", "Won", "Closed Won" ou
-- stage_type='won') fazia o card voltar para a etapa anterior.
--
-- Causa: `ensure_onboarding_on_deal_won()` referencia NEW.created_by e
-- NEW.org_id — colunas que a tabela `deals` NÃO tem. PL/pgSQL só avalia
-- o INSERT quando o gate de "ganho" passa, então o erro ("record new
-- has no field ...") aparecia SOMENTE nessas colunas, abortava o UPDATE
-- inteiro e a API devolvia 500 → o kanban revertia o movimento.
--
-- Correção:
--   1. Campos incertos são lidos via to_jsonb(NEW) — chave ausente vira
--      NULL em vez de erro (imune a drift de schema entre ambientes).
--   2. org_id resolve em cascata: coluna (se existir) → org_members do
--      owner (mesma heurística do app). Sem isso o watcher descartava o
--      evento (exige metadata.org_id) e o onboarding nunca era criado.
--   3. Todo o corpo pós-gate é fail-open: publicar o evento deal.won é
--      ponte para o onboarding, NUNCA pode bloquear a ação do usuário.
--      Falhou → RAISE WARNING e o move segue.
--
-- Idempotente: CREATE OR REPLACE + DROP/CREATE TRIGGER.

CREATE OR REPLACE FUNCTION ensure_onboarding_on_deal_won() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_stage_name TEXT;
  v_stage_type TEXT;
  v_row JSONB;
  v_actor UUID;
  v_org UUID;
BEGIN
  SELECT name, stage_type INTO v_stage_name, v_stage_type
  FROM pipeline_stages WHERE id = NEW.stage_id;

  IF v_stage_name NOT IN ('Fechado Ganho','Ganho','Won','Closed Won','Fechado')
     AND COALESCE(v_stage_type,'open') NOT IN ('won') THEN
    RETURN NEW;
  END IF;

  BEGIN
    v_row := to_jsonb(NEW);
    v_actor := COALESCE(NEW.owner_id, (v_row->>'created_by')::uuid);
    v_org := (v_row->>'org_id')::uuid;

    IF v_org IS NULL AND NEW.owner_id IS NOT NULL THEN
      SELECT om.org_id INTO v_org
      FROM org_members om
      WHERE om.profile_id = NEW.owner_id AND om.is_active = true
      LIMIT 1;
    END IF;

    INSERT INTO events (event_type, entity_type, entity_id, actor_id, actor_type, payload, metadata)
    VALUES (
      'deal.won',
      'deal',
      NEW.id,
      v_actor,
      'system',
      jsonb_build_object(
        'deal_id', NEW.id,
        'client_id', NEW.client_id,
        'store_id', v_row->>'store_id',
        'pipeline_id', NEW.pipeline_id,
        'title', NEW.title,
        'value', NEW.value
      ),
      jsonb_build_object('org_id', v_org)
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'ensure_onboarding_on_deal_won: evento deal.won nao publicado para deal % (%); o move do deal segue normalmente', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_deal_stage_change_to_won ON deals;
CREATE TRIGGER on_deal_stage_change_to_won
  AFTER UPDATE OF stage_id ON deals
  FOR EACH ROW
  WHEN (NEW.stage_id IS DISTINCT FROM OLD.stage_id)
  EXECUTE FUNCTION ensure_onboarding_on_deal_won();
