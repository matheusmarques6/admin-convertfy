-- ============================================================
-- Epic AE — injeta a Pesquisa & Diagnóstico (5 pilares: marca/ICP/tom/ads,
-- de client_stores via pesquisaToFullText) como contexto rico no Montador e
-- no Blueprint. Atualiza só o user_template da row ativa (mantém o system v3
-- com few-shot). Idempotente.
-- ============================================================

-- ── MONTADOR (assembler) ──────────────────────────────────────
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

<sections>
{{blocks_json}}
</sections>

<candidates>
{{candidates_json}}
</candidates>

## Tarefa

Para cada seção em <sections>, escolha 1 variante entre os candidatos do MESMO block_index em <candidates>. Mantenha a ordem. Use a <pesquisa_diagnostico> (perfil da marca, ICP, tom) para escolher a variante que melhor traduz a identidade da loja.

Retorne APENAS o array JSON [{"block_index","reasoning","brand_evidence","variant_id"}], um item por seção. Cada variant_id deve ser estritamente um dos IDs apresentados naquela seção.$USR$
WHERE agent_type = 'assembler' AND is_active = true;

-- ── BLUEPRINT ─────────────────────────────────────────────────
UPDATE email_agent_configs
SET user_template = $USR$<store>
- marca: {{brand_name}}
- nicho: {{nicho}}
- posicionamento: {{posicionamento}}
- persona: {{persona}}
- tom de voz: {{tom_voz}}
</store>

<pesquisa_diagnostico>
{{pesquisa_diagnostico}}
</pesquisa_diagnostico>

<outline>
- flow: {{flow_type}} — email #{{email_number}}
- objetivo: {{outline_objective}}
- diretriz: {{outline_guidance}}
</outline>

TIPOS PERMITIDOS: {{allowed_block_types}}

<html_montado>
{{reference_html}}
</html_montado>

## Tarefa

Leia o HTML em <html_montado> e extraia o blueprint detalhado que reflete a estrutura DELE (mesma ordem e seções), para o email {{flow_type}} #{{email_number}} da loja {{brand_name}}. Use a <pesquisa_diagnostico> para que objective/messaging/subject_hint reflitam a marca e o ICP.

Retorne APENAS o objeto JSON no formato especificado.$USR$
WHERE agent_type = 'blueprint' AND is_active = true;
