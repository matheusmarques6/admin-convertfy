-- 20261110 — `typography` no CHECK de email_generation_runs.agent.
--
-- CONSERTO DE UM ERRO DA 20261109: aquela migration estendeu só o CHECK de
-- `email_agent_configs` e afirmou, num comentário, que o CHECK de
-- `email_generation_runs.agent` "não existe mais em produção". Ele existe —
-- e a afirmação foi copiada de outra migration sem conferir.
--
-- Efeito: o step de tipografia RODOU (chamou o modelo, custou dinheiro) e o
-- insert da run foi rejeitado com 23514. `logGenerationRun` não lança de
-- propósito — telemetria não pode derrubar geração —, então o agente sumiu:
-- nenhuma run, nem de sucesso, nem de pulada, nem de erro. No Estúdio o nó
-- aparece "pulado", que é o sintoma errado para a causa.
--
-- É a MESMA armadilha do `copy_fit`, que passou de 28/08 a 01/09 sem gravar
-- um único run pelo mesmo motivo. O log já nomeia a causa
-- (`telemetry.insert_failed.agent_fora_do_check`); o que faltou foi olhar o
-- CHECK antes de escrever a migration.
--
-- REGRA: agente novo precisa de DOIS CHECKs — `email_agent_configs.agent_type`
-- (para a config existir) e `email_generation_runs.agent` (para a run gravar).
-- Estágio só-código (copy_merge, background_fit) precisa só do segundo.

DO $$
DECLARE cname text;
BEGIN
  SELECT conname INTO cname
    FROM pg_constraint
   WHERE conrelid = 'email_generation_runs'::regclass
     AND contype = 'c'
     AND pg_get_constraintdef(oid) ILIKE '%agent%'
     AND pg_get_constraintdef(oid) ILIKE '%hero_section%';
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE email_generation_runs DROP CONSTRAINT %I', cname);
  END IF;
  ALTER TABLE email_generation_runs ADD CONSTRAINT email_generation_runs_agent_check
    CHECK (agent IN (
      'seed','copy','image','html','qa','blueprint','assembler','copy_dispatch',
      'assembler_chooser','campaign_image','refiner','component_test','subject',
      'hero_section','text_format','image_format','color_format','typography',
      'component_tagger','copy_merge','merge_verifier','estruturador','copy_fit',
      'background_fit'
    ));
END $$;

SELECT pg_get_constraintdef(oid) LIKE '%typography%' AS aceita_typography
  FROM pg_constraint
 WHERE conrelid = 'email_generation_runs'::regclass
   AND conname = 'email_generation_runs_agent_check';
