-- 20261109 — Agente de TIPOGRAFIA: quem decide onde o email rompe a fonte.
--
-- Até aqui a tipografia era decisão de ninguém. `normalizeFonts`
-- (html/hero-graft.ts:159), chamada pelo `assembleDocument`, carimba a fonte
-- cadastrada em TODA declaração do documento por uma heurística cega ao papel
-- (>=20px ou peso >=600 -> heading, resto -> body). Medido no Welcome 1 da
-- Innova (86 KB, 02/09): 74 declarações de `Montserrat,Arial,Helvetica,
-- sans-serif`, do título do herói ao link do rodapé; 0 @font-face; pesos
-- 400/700/900 achatados pelo peso da marca. Nenhum destaque tipográfico.
--
-- O agente novo entra DEPOIS que a copy já está no HTML e só troca
-- tipografia em algumas declarações: família, peso, caixa alta, espaçamento.
-- Ele NÃO vê o documento — recebe o inventário das declarações de fonte
-- (typography/inventory.ts) e devolve ops por número de item, filtradas pelos
-- guards (typography/rules.ts) e aplicadas por código (typography/apply.ts).
-- Mesmo desenho do color_format, e a lição do text_format: modelo que recebe
-- 86 KB e devolve 86 KB reescreve o documento inteiro.
--
-- Base de conhecimento (especialista, 03/09) e o system prompt vivem em
-- docs/email-generation/agente-tipografia.md e nos DEFAULTS in-code do chain
-- (chains/typography.chain.ts). A linha nasce com prompts VAZIOS de
-- propósito: prompt vazio -> defaults in-code, e o editor da aba Agentes
-- passa a poder sobrescrever sem migration.
--
-- Rollback: `UPDATE email_agent_configs SET is_active=false WHERE
-- agent_type='typography';` — o runner trata linha inativa como step
-- desligado (logStepDisabled) e o email segue igual a hoje.

-- 1. CHECK de agent_type (o de email_generation_runs não existe mais em
--    produção desde 28/08 — verificado; só este precisa ser estendido).
DO $$
DECLARE cname text;
BEGIN
  SELECT conname INTO cname
    FROM pg_constraint
   WHERE conrelid = 'email_agent_configs'::regclass
     AND contype = 'c'
     AND pg_get_constraintdef(oid) ILIKE '%agent_type%';
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE email_agent_configs DROP CONSTRAINT %I', cname);
  END IF;
  ALTER TABLE email_agent_configs ADD CONSTRAINT email_agent_configs_agent_type_check
    CHECK (agent_type IN (
      'copy','image','html','qa','blueprint','assembler','assembler_chooser',
      'campaign_suggestion','campaign_trends','campaign_copy_master',
      'campaign_architect','campaign_image','refiner','component_test','subject',
      'hero_section','text_format','image_format','color_format','typography',
      'component_tagger','merge_verifier','estruturador','copy_fit'
    ));
END $$;

-- 2. Seed idempotente. Modelo: o mesmo dos demais steps de ops (Kimi K3 via
--    OpenRouter) — a saída é um JSON pequeno, não um documento.
INSERT INTO email_agent_configs (
  agent_type, model, system_prompt, user_template,
  temperature, max_tokens, is_active, version
)
SELECT 'typography', 'moonshotai/kimi-k3', '', '', 0.20, 8192, true, 1
 WHERE NOT EXISTS (
   SELECT 1 FROM email_agent_configs
    WHERE agent_type = 'typography' AND is_active = true
 );

SELECT agent_type, version, is_active, model, temperature, max_tokens
  FROM email_agent_configs WHERE agent_type = 'typography';
