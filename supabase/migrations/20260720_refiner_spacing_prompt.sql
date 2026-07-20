-- Refinador: corrige a regra de inserção de respiros no prompt ativo.
--
-- Problema (Luxe Lift w#1, jul/2026): o Refinador inseria spacers de
-- 100-160px (desproporcionais) e em junções DENTRO de blocos visuais
-- contínuos (rodapé) — como o spacer não tinha cor, virava faixa clara
-- cortando a seção escura.
--
-- Par desta migration no código (mesmo commit): teto mecânico de insert
-- cai para 64px, spacer herda o background das seções vizinhas e as
-- junções passam a expor beforeBg/afterBg ao LLM.
--
-- UPDATE cirúrgico via replace(): no-op inofensivo se o prompt ativo
-- tiver sido customizado e o texto original não existir mais.

UPDATE email_agent_configs
SET system_prompt = replace(
  system_prompt,
  '- "insert": cria respiro NOVO entre seções — use as junções numeradas de section_junctions (junction → height_px 8-160, máximo 6 inserções). Use SÓ onde falta respiro estrutural entre duas fases coladas.',
  '- "insert": cria respiro NOVO entre seções — use as junções numeradas de section_junctions (junction → height_px 8-64, típico 24-48; máximo 6 inserções). Use SÓ onde falta respiro estrutural entre duas fases coladas. Cada junção traz beforeBg/afterBg (cor de fundo das seções vizinhas) e o spacer herda essa cor automaticamente. NUNCA insira respiro nas junções do rodapé (logo final, links legais, redes sociais, endereço/unsubscribe) — essa área é um bloco visual contínuo.'
)
WHERE agent_type = 'refiner'
  AND is_active = TRUE;
