-- ============================================================
-- Montador (assembler) deixa de receber briefing e pesquisa (decisão
-- jul/2026): ele harmoniza ESTRUTURA HTML, não adapta conteúdo à marca —
-- isso é trabalho do HTML agent na fase 2. Remove os blocos <briefing> e
-- <pesquisa_diagnostico> do user_template ATIVO. Idempotente (só remove se
-- o bloco existir exatamente; prompt editado à mão fica intocado — e, mesmo
-- que a var reste, o renderer devolve string vazia, sem literal órfão).
--
-- OBS: o Curador (assembler_chooser) CONTINUA recebendo o perfil da marca
-- via {{briefing_marca}} — esta migration NÃO toca no prompt do Curador.
-- ============================================================

UPDATE email_agent_configs
SET user_template = REPLACE(
  user_template,
  '<briefing>
{{briefing_json}}
</briefing>

',
  ''
)
WHERE agent_type = 'assembler'
  AND is_active = true
  AND user_template LIKE '%{{briefing_json}}%';

UPDATE email_agent_configs
SET user_template = REPLACE(
  user_template,
  '<pesquisa_diagnostico>
{{pesquisa_diagnostico}}
</pesquisa_diagnostico>

',
  ''
)
WHERE agent_type = 'assembler'
  AND is_active = true
  AND user_template LIKE '%{{pesquisa_diagnostico}}%';
