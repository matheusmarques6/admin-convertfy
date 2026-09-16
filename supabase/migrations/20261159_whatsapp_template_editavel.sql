-- ============================================================================
-- Texto de WhatsApp da etapa passa a ser EDITÁVEL por humano
-- ============================================================================
--
-- Contexto: `ensureOnboardingBootstrap` tem um re-sync que reescreve 11 campos
-- de toda coluna do SEED a cada execução (TTL de 5 min, disparado por abrir
-- /admin/onboarding), `whatsapp_template` entre eles. O comentário no código
-- dizia o porquê: "necessario porque hoje nao ha UI pra editar colunas".
--
-- Sem o carimbo abaixo, uma tela de edição nasceria mentindo: o texto voltaria
-- ao padrão em até cinco minutos, sem aviso. É a mesma armadilha do sync do
-- vault reescrevendo o frontmatter das notas.
--
-- `whatsapp_template_editado_em` é o que o re-sync consulta para PULAR o campo.
-- `whatsapp_template_editado_por` é auditoria: o texto vai para todos os
-- clientes da carteira, e a partir de agora cinco papéis podem reescrevê-lo —
-- edição anônima nesse ponto é o que o incidente de 15/09/2026 custou caro.
--
-- Reversível: soltar as duas colunas devolve o comportamento anterior, porque
-- o código degrada quando elas não existem (42703 no select → caminho antigo).
-- ============================================================================

ALTER TABLE operational_pipeline_columns
  ADD COLUMN IF NOT EXISTS whatsapp_template_editado_em timestamptz,
  ADD COLUMN IF NOT EXISTS whatsapp_template_editado_por uuid
    REFERENCES profiles(id) ON DELETE SET NULL;

-- Quem editou pode sair do time; o carimbo de QUANDO não pode sumir junto,
-- porque é ele que segura o re-sync. Daí SET NULL e não CASCADE.

COMMENT ON COLUMN operational_pipeline_columns.whatsapp_template_editado_em IS
  'Preenchido = texto editado à mão; o re-sync do bootstrap NÃO sobrescreve '
  '`whatsapp_template` desta coluna. NULL = a coluna segue o SEED.';

COMMENT ON COLUMN operational_pipeline_columns.whatsapp_template_editado_por IS
  'Quem editou por último. SET NULL na saída do time — o carimbo de quando '
  'sobrevive, porque é ele que decide se o seed pode reescrever.';
