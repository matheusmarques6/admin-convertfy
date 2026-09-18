-- Arquivar um negócio não deixava rastro nenhum.
--
-- Medido em 18/09: 125 negócios com status 'archived' no banco (39 só no
-- Funil Inbound, onde a coluna "Lead novo" tinha 27 de 27 arquivados e
-- aparecia VAZIA na tela, porque o GET filtra `.neq("status","archived")`).
-- `crm_deal_history` tinha ZERO linhas com field='status' — só 'stage_id' e
-- 'pipeline_id' — e o DELETE da rota não grava atividade. Resultado: não
-- havia como saber quem arquivou, quando, nem desfazer pela interface.
--
-- O bloco de status JÁ EXISTIA neste trigger: ele carimbava won_at/lost_at e
-- não gravava o histórico. Fechar aqui — e não no app — cobre TODOS os
-- escritores por construção: o DELETE do card, a ação em massa, o PATCH e
-- qualquer UPDATE feito por SQL direto. Foi gravar em um lugar só que abriu
-- o buraco.
--
-- O INSERT novo roda em bloco EXCEPTION: a regra da casa desde o incidente
-- 20261066 é que telemetria em tabela de ação do usuário é FAIL-OPEN —
-- perder a linha de histórico é barato, impedir o operador de arquivar,
-- ganhar ou perder um negócio não é.
--
-- Rollback: reaplicar a versão anterior da função (sem o INSERT de status).

CREATE OR REPLACE FUNCTION public.crm_deals_track_stage_change()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_from_pipeline TEXT;
  v_to_pipeline TEXT;
  v_texto TEXT;
BEGIN
  -- Transferência entre pipelines (registrada ANTES da etapa, pra a
  -- timeline ler "transferido para X" → "etapa alterada")
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

  -- Mudança de etapa (comportamento original, intocado)
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

    -- O rastro que faltava. Fail-open: nunca derruba o UPDATE.
    BEGIN
      INSERT INTO crm_deal_history (deal_id, changed_by, field, old_value, new_value)
      VALUES (NEW.id, NEW.owner_id, 'status',
              to_jsonb(OLD.status::text), to_jsonb(NEW.status::text));

      -- Arquivar tira o negócio do quadro, então é o caso em que a linha na
      -- timeline mais importa: é o único lugar onde ele continua visível.
      v_texto := CASE
        WHEN NEW.status = 'archived' THEN 'Negócio arquivado — saiu do quadro'
        WHEN OLD.status = 'archived' THEN 'Negócio restaurado — voltou ao quadro'
        ELSE format('Status alterado de "%s" para "%s"', OLD.status, NEW.status)
      END;

      INSERT INTO crm_deal_activities (deal_id, type, content, created_by, is_internal)
      VALUES (NEW.id, 'system', v_texto, NEW.owner_id, true);
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;

  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$;
