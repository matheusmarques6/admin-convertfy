-- ============================================================
-- Montador (assembler) — passa a GERAR a estrutura HTML do email.
--
-- Antes: o LLM só escolhia variant_ids de uma biblioteca e o código
-- concatenava snippets. Agora o Montador GERA a arquitetura HTML completa
-- (layout + ordem dos blocos + seções), com placeholders de copy e CSS
-- variables de cor, usando briefing/nicho/HTMLs de referência/biblioteca/
-- estrutura geral como input. O agente HTML downstream (Sonnet 4.6) só
-- repinta com a identidade da loja e despeja a copy.
--
-- Troca system_prompt + user_template e sobe max_tokens (1500 -> 16384,
-- senão o HTML é truncado). Mantém o model (anthropic/claude-opus-4.8).
-- Idempotente.
-- ============================================================

UPDATE email_agent_configs
SET
  system_prompt = $SYSTEM$Você é o ARQUITETO de estrutura de emails. Sua tarefa é GERAR a estrutura HTML completa de um email — o esqueleto/arquitetura: layout, ordem dos blocos e seções — que um agente downstream vai apenas REPINTAR com a identidade da loja e PREENCHER com a copy. Por isso:
- NÃO escreva a copy final: use placeholders curtos por bloco (ex.: {{HEADLINE}}, {{BODY}}, {{CTA_LABEL}}).
- NÃO use imagens reais: deixe contêineres/slots de imagem vazios.
- Cores SEMPRE via CSS variables (--bg, --text, --heading, --button-bg, --button-text, --accent) declaradas em :root — nunca hex fixo no markup.
- Container único de 600px centralizado, div + flexbox (sem tabelas).
Use os HTMLs de referência e a biblioteca de componentes como inspiração de TÉCNICA de construção, adaptando ao briefing, nicho e estrutura geral — não copie literalmente.
Emita APENAS o HTML, começando em <!DOCTYPE html> e terminando em </html>, sem cercas markdown e sem comentários explicativos.$SYSTEM$,
  user_template = $USR$<store>
- marca: {{brand_name}}
- nicho: {{nicho}}
- posicionamento: {{posicionamento}}
- persona: {{persona}}
- tom de voz: {{tom_voz}}
- mood: {{mood}}
</store>

<briefing>
{{briefing_json}}
</briefing>

<pesquisa_diagnostico>
{{pesquisa_diagnostico}}
</pesquisa_diagnostico>

<outline>
- objetivo: {{outline_objective}}
- diretriz: {{outline_guidance}}
- tom sugerido: {{outline_tone_hint}}
</outline>

<estrutura_geral_ordenada>
{{blocks_json}}
</estrutura_geral_ordenada>

<htmls_referencia>
{{reference_template_html}}
</htmls_referencia>

<biblioteca_componentes>
{{candidates_json}}
</biblioteca_componentes>

Gere AGORA a estrutura HTML completa do email seguindo a ordem de blocos em <estrutura_geral_ordenada>, usando placeholders de copy e CSS variables de cor. Emita só o HTML, de <!DOCTYPE html> a </html>.$USR$,
  max_tokens = 16384
WHERE agent_type = 'assembler' AND is_active = true;
