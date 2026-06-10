-- ============================================================
-- Epic AE — injeta o OUTLINE (estrutura geral: objetivo + diretriz) no
-- Montador (assembler), para que a escolha de componentes / montagem do HTML
-- respeite a intenção de alto nível do email.
--
-- O Blueprint já recebia o outline (migration 20260713); o Montador só via as
-- seções (suggested_blocks). Esta migration acrescenta um bloco <outline> ao
-- user_template ATIVO do assembler. Idempotente (UPDATE seta o template
-- completo; rodar de novo re-aplica o mesmo valor).
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
</outline>

<sections>
{{blocks_json}}
</sections>

<candidates>
{{candidates_json}}
</candidates>

## Tarefa

Para cada seção em <sections>, escolha 1 variante entre os candidatos do MESMO block_index em <candidates>. Mantenha a ordem. Use o <outline> (objetivo e diretriz do email) e a <pesquisa_diagnostico> (perfil da marca, ICP, tom) para escolher a variante que melhor serve à intenção do email e traduz a identidade da loja.

Retorne APENAS o array JSON [{"block_index","reasoning","brand_evidence","variant_id"}], um item por seção. Cada variant_id deve ser estritamente um dos IDs apresentados naquela seção.$USR$
WHERE agent_type = 'assembler' AND is_active = true;
