-- 20261096 — 'copy_fit' entra no CHECK de email_generation_runs.agent
--
-- O encurtador nasceu em 28/08 (migration 20260828024540: config do agente +
-- kill-switch) e desde então NUNCA gravou um run: zero linhas com
-- agent='copy_fit' em ~5.700. O CHECK da tabela não conhecia o valor, o
-- INSERT violava a constraint e `logGenerationRun` engole o erro de
-- propósito ("telemetria não deve bloquear a geração"): faz log.error e
-- devolve "". Com runId vazio o finishGenerationRun cai no INSERT único,
-- que viola o mesmo CHECK e também é engolido.
--
-- O efeito não foi só cosmético. Sem o run some TUDO: prompt renderizado,
-- raw_output do modelo, de_para campo a campo com o motivo da recusa,
-- tokens e custo. O agente ficou 4 dias devolvendo `corrigidos: 0` em toda
-- geração (alvos 8/6/4 em 01/09, 28/08 e 28/08) sem que houvesse onde ler
-- por quê — e a CopyFitView do Estúdio, escrita junto com o agente, nunca
-- recebeu um parsed_output.
--
-- Idempotente: DROP IF EXISTS + ADD. As linhas existentes já satisfazem a
-- lista (o valor novo só amplia), então nada de NOT VALID.

ALTER TABLE public.email_generation_runs
  DROP CONSTRAINT IF EXISTS email_generation_runs_agent_check;

ALTER TABLE public.email_generation_runs
  ADD CONSTRAINT email_generation_runs_agent_check CHECK (
    agent = ANY (ARRAY[
      'seed', 'copy', 'image', 'html', 'qa', 'blueprint', 'assembler',
      'copy_dispatch', 'assembler_chooser', 'campaign_image', 'refiner',
      'component_test', 'subject', 'hero_section', 'text_format',
      'image_format', 'color_format', 'component_tagger', 'copy_merge',
      'merge_verifier', 'estruturador',
      -- novo: encurtador da copy acima do limite / com travessão
      'copy_fit'
    ]::text[])
  );

-- Confere: tem de listar 'copy_fit'.
SELECT pg_get_constraintdef(oid) AS definicao
  FROM pg_constraint
 WHERE conname = 'email_generation_runs_agent_check';
