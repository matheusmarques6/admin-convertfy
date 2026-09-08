-- ===========================================
-- O trigger da ponte reunião→carteira NUNCA existiu neste banco
-- ===========================================
-- Descoberto em 08/09 com acesso ao banco de produção: a migration 20260415
-- criava `trg_sync_meeting_to_store_feedback`, mas em `pg_trigger` só existia
-- `update_meetings_updated_at`. A FUNÇÃO estava lá (a 20261126 a recria), o
-- TRIGGER não — então concluir uma reunião com loja nunca alimentou
-- `client_stores.last_feedback_date` nem gravou em `store_feedback_calls`.
--
-- A ponte estava morta desde sempre, e sem erro em lugar nenhum: função órfã
-- não reclama, e a 20261126 sozinha não consertaria — ela só troca o corpo de
-- uma função que ninguém chamava.
--
-- Testado em produção dentro de transação com ROLLBACK: reunião criada →
-- concluída → 1 linha em store_feedback_calls + last_feedback_date na loja;
-- concluir de novo NÃO duplica (o índice único parcial da 20261126 segura).
--
-- Idempotente.
-- ===========================================

DROP TRIGGER IF EXISTS trg_sync_meeting_to_store_feedback ON meetings;

-- UPDATE OF status: o corpo só age na transição para 'completed', e restringir
-- aqui evita acordar o trigger a cada UPDATE de campo não relacionado.
CREATE TRIGGER trg_sync_meeting_to_store_feedback
  AFTER INSERT OR UPDATE OF status ON meetings
  FOR EACH ROW EXECUTE FUNCTION sync_meeting_to_store_feedback();

-- Verificação: tem de voltar true.
SELECT EXISTS(
  SELECT 1 FROM pg_trigger
   WHERE tgname = 'trg_sync_meeting_to_store_feedback' AND NOT tgisinternal
) AS trigger_criado;
