-- 20261102 — 'background_fit' entra no CHECK de email_generation_runs.agent
--
-- Etapa determinística nova da cadeia de formatação (02/09): depois do
-- Cores & Botões, o código confere se cada `<td background="URL">` recebeu
-- um arquivo com o tamanho que o elemento DECLARA (`background-size` /
-- `v:rect`). Quando a foto gerada é mais baixa que o box — caso da
-- `welcome - hero section 5`, cujo fundo é faixa chapada de 585px + foto
-- de 632px —, compõe faixa (cor do próprio td) + foto e troca a URL. Sem
-- isso o email client esticava a foto para o bloco inteiro e o texto caía
-- em cima da pessoa (Innova Bay, batch 5b778483).
--
-- Sem esta linha no CHECK o run seria descartado em silêncio (23514
-- engolido pelo logGenerationRun) — precedente do copy_fit (20261096).
-- Idempotente: DROP IF EXISTS + ADD; o valor novo só amplia a lista.

ALTER TABLE public.email_generation_runs
  DROP CONSTRAINT IF EXISTS email_generation_runs_agent_check;

ALTER TABLE public.email_generation_runs
  ADD CONSTRAINT email_generation_runs_agent_check CHECK (
    agent = ANY (ARRAY[
      'seed', 'copy', 'image', 'html', 'qa', 'blueprint', 'assembler',
      'copy_dispatch', 'assembler_chooser', 'campaign_image', 'refiner',
      'component_test', 'subject', 'hero_section', 'text_format',
      'image_format', 'color_format', 'component_tagger', 'copy_merge',
      'merge_verifier', 'estruturador', 'copy_fit',
      -- novo: fundo conformado ao tamanho declarado (faixa + foto)
      'background_fit'
    ]::text[])
  );

-- Confere: tem de listar 'background_fit'.
SELECT pg_get_constraintdef(oid) AS definicao
  FROM pg_constraint
 WHERE conname = 'email_generation_runs_agent_check';
