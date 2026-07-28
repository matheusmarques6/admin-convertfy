-- ============================================================
-- Enxerto da hero por ID (hero-graft): a hero deixa de ser escrita
-- pelo LLM do Montador.
--
-- O Montador continua ESCOLHENDO a variante; quem escreve a região da
-- hero no documento agora é o código, com o HTML canônico da biblioteca
-- (html_tagged aprovado, senão html). O agente hero_section passa a
-- receber a região já correta e só substitui (copy, imagem, logo,
-- fontes/cores) — o prompt ganhou <hero_source> (library|montador) para
-- distinguir os dois modos, e a regra de slot vazio deixou de remover
-- CTA quando a copy ainda não chegou.
--
-- Corte seco: zera o prompt da config ativa para que os defaults novos
-- in-code assumam. Editar na aba Agentes volta a sobrescrever.
-- ============================================================

UPDATE email_agent_configs
SET system_prompt = '',
    user_template = ''
WHERE agent_type = 'hero_section'
  AND is_active = true;
