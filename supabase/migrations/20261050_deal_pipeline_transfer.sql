-- ═══════════════════════════════════════════════════════════════════
-- Transferência de deal entre pipelines
-- ═══════════════════════════════════════════════════════════════════
--
-- A trigger crm_deals_track_stage_change (20260507_crm_phase1_core.sql)
-- só registrava mudança de `stage_id`. Com a transferência entre
-- pipelines (POST /api/crm/deals/[id]/move), o deal passa a mudar de
-- `pipeline_id` também — e sem isto a transferência não aparece no
-- audit log e a timeline mostra apenas "Etapa alterada", escondendo o
-- movimento mais relevante.
--
-- Fazer na trigger (e não na rota) garante o registro em QUALQUER
-- caminho de escrita: API, automação, correção manual via SQL.
--
-- Além disso adiciona um índice em (stage_id, position), usado pelo
-- cálculo de posição no destino durante o move.

CREATE OR REPLACE FUNCTION crm_deals_track_stage_change()
RETURNS TRIGGER AS $$
DECLARE
  v_from_pipeline TEXT;
  v_to_pipeline TEXT;
BEGIN
  -- ── Transferência entre pipelines ───────────────────────────────
  -- Registrada ANTES da etapa: na timeline (ordenada por created_at)
  -- a leitura fica "transferido para X" → "etapa alterada".
  IF OLD.pipeline_id IS DISTINCT FROM NEW.pipeline_id THEN
    INSERT INTO crm_deal_history (deal_id, changed_by, field, old_value, new_value)
    VALUES (NEW.id, NEW.owner_id, 'pipeline_id',
            to_jsonb(OLD.pipeline_id::text), to_jsonb(NEW.pipeline_id::text));

    SELECT name INTO v_from_pipeline FROM pipelines WHERE id = OLD.pipeline_id;
    SELECT name INTO v_to_pipeline   FROM pipelines WHERE id = NEW.pipeline_id;

    INSERT INTO crm_deal_activities (deal_id, type, content, created_by, is_internal)
    VALUES (NEW.id, 'stage_change',
            format('Transferido da pipeline "%s" para "%s"',
                   COALESCE(v_from_pipeline, '—'),
                   COALESCE(v_to_pipeline, '—')),
            NEW.owner_id, true);
  END IF;

  -- ── Mudança de etapa (comportamento original, intocado) ─────────
  IF OLD.stage_id IS DISTINCT FROM NEW.stage_id THEN
    NEW.last_stage_changed_at = NOW();
    INSERT INTO crm_deal_history (deal_id, changed_by, field, old_value, new_value)
    VALUES (NEW.id, NEW.owner_id, 'stage_id',
            to_jsonb(OLD.stage_id::text), to_jsonb(NEW.stage_id::text));
    INSERT INTO crm_deal_activities (deal_id, type, content, created_by, is_internal)
    VALUES (NEW.id, 'stage_change',
            'Etapa alterada',
            NEW.owner_id, true);
  END IF;

  IF OLD.status IS DISTINCT FROM NEW.status THEN
    IF NEW.status = 'won' AND OLD.status != 'won' THEN
      NEW.won_at = COALESCE(NEW.won_at, NOW());
    END IF;
    IF NEW.status = 'lost' AND OLD.status != 'lost' THEN
      NEW.lost_at = COALESCE(NEW.lost_at, NOW());
    END IF;
  END IF;

  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger recriada por garantia (idempotente).
DROP TRIGGER IF EXISTS trg_crm_deals_stage_change ON deals;
CREATE TRIGGER trg_crm_deals_stage_change
  BEFORE UPDATE ON deals
  FOR EACH ROW
  EXECUTE FUNCTION crm_deals_track_stage_change();

-- Suporta o "última posição da etapa de destino" do move.
CREATE INDEX IF NOT EXISTS idx_deals_stage_position
  ON deals(stage_id, position DESC);

-- ── Realtime: replica identity FULL em deals ────────────────────────
-- Sem isto o payload de UPDATE/DELETE carrega apenas a PK no registro
-- ANTIGO. Numa transferência entre pipelines o evento chega com o
-- pipeline_id NOVO, e o board de ORIGEM — que filtra pela sua própria
-- pipeline — descarta justamente o evento que diz "este card saiu
-- daqui". Resultado: card fantasma até o safety refresh de 45s.
--
-- Com REPLICA IDENTITY FULL o `old` traz a linha inteira, então o
-- cliente (use-realtime-pipeline) consegue aceitar o evento quando a
-- pipeline aparece no estado velho OU no novo. Também conserta o DELETE,
-- que hoje é assinado sem filtro pelo mesmo motivo.
--
-- Custo: o WAL passa a registrar a linha antiga completa em UPDATE/
-- DELETE. `deals` é tabela de baixo volume (CRM), então é aceitável.
ALTER TABLE deals REPLICA IDENTITY FULL;
