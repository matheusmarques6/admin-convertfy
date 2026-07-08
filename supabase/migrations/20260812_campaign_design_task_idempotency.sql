-- Idempotência real na instanciação de tasks do pipeline de DESIGN de campanha.
--
-- Contexto (bug TEASER 6.6, jul/2026): a checagem de idempotência do
-- instantiateCampaignStage é read-then-insert; 3 webhooks n8n concorrentes
-- passaram juntos pela checagem e criaram 3 tasks "estrutura" duplicadas.
-- Com duplicatas, o handoff nunca avança (exige TODAS as tasks da etapa
-- concluídas). Este índice único parcial faz o perdedor da corrida receber
-- 23505 — que o serviço trata re-lendo as tasks do vencedor.
--
-- Aditivo e defensivo: normaliza dados antes de criar o índice.

-- 1. Versão nunca nula em tasks de campanha (parte da chave de idempotência).
UPDATE tasks
SET version = 1
WHERE source_type = 'campaign_suggestion'
  AND version IS NULL;

-- 2. Backfill de slugs determinísticos nas tasks de finalização por loja
--    (instanciadas sem slug antes desta mudança). Tasks manuais sem
--    column_slug/store_id ficam com slug NULL — fora do índice parcial.
UPDATE tasks
SET slug = 'finalizacao_' || (metadata->>'store_id')
WHERE source_type = 'campaign_suggestion'
  AND slug IS NULL
  AND metadata->>'column_slug' = 'finalizacao'
  AND metadata->>'store_id' IS NOT NULL;

-- 3. Dedup defensivo: cancela duplicatas vivas da mesma chave, preservando a
--    task com mais progresso (completed > in_progress > pending) e, em empate,
--    a mais antiga. Sem isso o CREATE UNIQUE INDEX falharia onde já há lixo.
WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY source_id, operational_column_id, version, slug
      ORDER BY
        CASE status
          WHEN 'completed' THEN 0
          WHEN 'in_progress' THEN 1
          ELSE 2
        END,
        created_at,
        id
    ) AS rn
  FROM tasks
  WHERE source_type = 'campaign_suggestion'
    AND slug IS NOT NULL
    AND operational_column_id IS NOT NULL
    AND status != 'cancelled'
)
UPDATE tasks t
SET status = 'cancelled', updated_at = now()
FROM ranked r
WHERE t.id = r.id
  AND r.rn > 1;

-- 4. Índice único parcial: 1 task viva por campanha × coluna × versão × slug.
--    'cancelled' fica fora do predicado de propósito — cancelar uma task
--    duplicada/lixo não pode bloquear uma nova instanciação legítima.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_campaign_design_task_per_stage
ON tasks (source_id, operational_column_id, version, slug)
WHERE source_type = 'campaign_suggestion'
  AND slug IS NOT NULL
  AND status != 'cancelled';
