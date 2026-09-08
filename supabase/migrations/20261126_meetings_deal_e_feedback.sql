-- ===========================================
-- Reunião ligada ao negócio e à call de feedback
-- ===========================================
-- Dois vínculos que faltavam, cada um com um sintoma próprio:
--
-- 1) meetings.deal_id — a agenda comercial (/admin/comercial/agenda) mostra
--    crm_deal_activities.due_at, que são TAREFAS; o hub (/admin/meetings)
--    mostra `meetings`. São dois calendários que não se falam: a reunião de
--    fechamento não aparece na agenda do negócio, e a tarefa "ligar para o
--    cliente" não aparece no hub. Sem uma coluna que os ligue, qualquer
--    tentativa de unir as duas telas seria casamento por data e nome.
--
-- 2) store_feedback_calls.meeting_id — o trigger
--    sync_meeting_to_store_feedback (20260415) insere a linha de histórico
--    quando a reunião é concluída, e a idempotência dele compara
--    `notes IS NOT DISTINCT FROM ...` + `conducted_at = ...`. Comparar TEXTO
--    para decidir se já gravou é frágil das duas pontas: editar a nota da
--    reunião e reconcluí-la duplica o registro, e duas calls no mesmo
--    segundo com a mesma nota fariam a segunda sumir. Com o id, a pergunta
--    passa a ser "esta reunião já virou call?", que tem resposta exata.
--
-- Idempotente.
-- ===========================================

-- ── 1. Reunião ↔ negócio ────────────────────────────────────────────────────
ALTER TABLE meetings
  ADD COLUMN IF NOT EXISTS deal_id UUID REFERENCES deals(id) ON DELETE SET NULL;

-- SET NULL, não CASCADE: apagar um negócio não pode apagar a reunião que
-- aconteceu. O histórico do que foi conversado sobrevive ao funil.
CREATE INDEX IF NOT EXISTS idx_meetings_deal
  ON meetings(deal_id) WHERE deal_id IS NOT NULL;

COMMENT ON COLUMN meetings.deal_id IS
  'Negócio vinculado (opcional). Liga o hub de reuniões à agenda comercial; SET NULL para a reunião sobreviver ao negócio.';

-- ── 2. Call de feedback ↔ reunião ───────────────────────────────────────────
ALTER TABLE store_feedback_calls
  ADD COLUMN IF NOT EXISTS meeting_id UUID REFERENCES meetings(id) ON DELETE SET NULL;

-- Índice ÚNICO PARCIAL: uma reunião vira no máximo UMA call de feedback.
-- É esta constraint — não a comparação de texto — que garante a idempotência
-- do trigger a partir de agora.
CREATE UNIQUE INDEX IF NOT EXISTS idx_store_feedback_calls_meeting
  ON store_feedback_calls(meeting_id) WHERE meeting_id IS NOT NULL;

COMMENT ON COLUMN store_feedback_calls.meeting_id IS
  'Reunião que originou esta call (quando veio do módulo de reuniões). Único parcial: uma reunião gera no máximo uma call.';

-- ── 3. Backfill do histórico já existente ───────────────────────────────────
-- Casa as calls que o trigger antigo criou com as reuniões que as originaram,
-- pelo par (loja, instante) que ele mesmo usou para gravar. Só onde o par
-- identifica UMA reunião: na dúvida deixa NULL, porque um vínculo errado é
-- pior que vínculo nenhum — ele faria a próxima conclusão pular a gravação.
UPDATE store_feedback_calls sfc
   SET meeting_id = m.id
  FROM meetings m
 WHERE sfc.meeting_id IS NULL
   AND m.store_id = sfc.store_id
   AND m.status = 'completed'
   AND COALESCE(m.completed_at, m.scheduled_at) = sfc.conducted_at
   AND NOT EXISTS (
     SELECT 1 FROM meetings m2
      WHERE m2.store_id = sfc.store_id
        AND m2.status = 'completed'
        AND COALESCE(m2.completed_at, m2.scheduled_at) = sfc.conducted_at
        AND m2.id <> m.id
   )
   AND NOT EXISTS (
     SELECT 1 FROM store_feedback_calls s2 WHERE s2.meeting_id = m.id
   );

-- ── 4. Trigger: idempotência pelo id, não pelo texto ────────────────────────
CREATE OR REPLACE FUNCTION sync_meeting_to_store_feedback()
RETURNS TRIGGER AS $$
DECLARE
  v_freq TEXT;
  v_quando TIMESTAMPTZ;
BEGIN
  IF NEW.store_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Só na TRANSIÇÃO para 'completed' — reeditar uma reunião concluída não
  -- pode gerar uma segunda call.
  IF NEW.status = 'completed' AND
     (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'completed') THEN

    v_quando := COALESCE(NEW.completed_at, NEW.scheduled_at, NOW());

    SELECT feedback_frequency INTO v_freq FROM client_stores WHERE id = NEW.store_id;

    UPDATE client_stores
       SET last_feedback_date = v_quando,
           last_feedback_by   = COALESCE(NEW.completed_by, NEW.user_id),
           feedback_notes     = COALESCE(NEW.completion_notes, NEW.notes),
           next_feedback_date = CASE
             WHEN COALESCE(v_freq, 'monthly') = 'monthly'
               THEN DATE_TRUNC('month', v_quando) + INTERVAL '1 month'
             ELSE v_quando + INTERVAL '30 days'
           END
     WHERE id = NEW.store_id;

    -- Agora a pergunta é "esta reunião já virou call?" e tem resposta exata.
    INSERT INTO store_feedback_calls (
      store_id, client_id, conducted_by, conducted_at, duration_minutes, notes, meeting_id
    ) VALUES (
      NEW.store_id,
      NEW.client_id,
      COALESCE(NEW.completed_by, NEW.user_id),
      v_quando,
      NEW.duration_minutes,
      COALESCE(NEW.completion_notes, NEW.notes),
      NEW.id
    )
    ON CONFLICT (meeting_id) WHERE meeting_id IS NOT NULL DO NOTHING;
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- FAIL-OPEN, regra da casa desde o incidente 20261066: trigger de ponte em
  -- tabela de ação do usuário nunca bloqueia a ação. Concluir uma reunião não
  -- pode dar 500 porque o histórico de CS falhou.
  RAISE WARNING 'sync_meeting_to_store_feedback falhou para meeting %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

NOTIFY pgrst, 'reload schema';
