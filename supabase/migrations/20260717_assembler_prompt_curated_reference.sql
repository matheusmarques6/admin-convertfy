-- ============================================================
-- Epic AE — injeta a REFERÊNCIA CURADA GLOBAL (email_reference_templates, do
-- mesmo flow×email) como INPUT do Montador (assembler), ALÉM do papel de
-- fallback que ela já tem no build-vars (consumidor).
--
-- O Montador NÃO escreve HTML: escolhe variant_ids entre os finalistas e o
-- HTML é a concatenação determinística dos snippets. Portanto a referência
-- curada serve como guia de ESTRUTURA/ESTILO para a ESCOLHA da variante mais
-- próxima — sem copiar.
--
-- Full-set idempotente. Roda DEPOIS de 20260716_assembler_prompt_tone_hint
-- (ordem de nome) e preserva TODOS os campos do outline (objetivo, diretriz e
-- tom sugerido) — esta é a versão autoritativa do user_template do assembler.
-- ============================================================

UPDATE email_agent_configs
SET user_template = $USR$<store>
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

<referencia_curada>
{{reference_template_html}}
</referencia_curada>

<sections>
{{blocks_json}}
</sections>

<candidates>
{{candidates_json}}
</candidates>

## Tarefa

Para cada seção em <sections>, escolha 1 variante entre os candidatos do MESMO block_index em <candidates>. Mantenha a ordem.

Use o <outline> (objetivo, diretriz e tom sugerido do email) e a <pesquisa_diagnostico> (perfil da marca, ICP, tom) para escolher a variante que melhor serve à intenção do email e traduz a identidade da loja.

A <referencia_curada> é um email COMPROVADO para este flow: use-a como guia de ESTRUTURA e ESTILO para escolher, entre os finalistas, a variante mais próxima do espírito dela — adaptando à marca/ICP. NÃO a copie; é inspiração, não um template a reproduzir. Se estiver vazia, baseie-se apenas no <outline> e na <pesquisa_diagnostico>.

Retorne APENAS o array JSON [{"block_index","reasoning","brand_evidence","variant_id"}], um item por seção. Cada variant_id deve ser estritamente um dos IDs apresentados naquela seção.$USR$
WHERE agent_type = 'assembler' AND is_active = true;
