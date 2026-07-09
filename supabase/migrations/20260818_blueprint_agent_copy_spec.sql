-- ============================================================
-- Blueprint Agent — copy_spec (orçamento de caracteres por campo)
--
-- Problema: o gerador de copy (n8n) não recebia nenhum limite de
-- tamanho por campo — headline de 98 chars virava parágrafo de 6
-- linhas em 48px (validado em render real; ver
-- src/lib/email-workspace/copy-spec.ts). O Blueprint agent LÊ o HTML
-- montado, então ele é o ponto certo para derivar o budget da
-- geometria real do template.
--
-- APENDA as instruções de copy_spec ao system_prompt ATIVO do agente
-- blueprint (não substitui — preserva ajustes feitos pela UI em
-- /admin/settings/email-generation?tab=agents). Os números emitidos
-- pelo LLM são clampados em código aos guarda-corpos absolutos
-- (normalizeCopySpec) antes de persistir.
--
-- Idempotente via sentinela: re-run é no-op se "copy_spec" já consta
-- do prompt ativo.
-- ============================================================

UPDATE email_agent_configs
SET system_prompt = system_prompt || $RULES$

REGRA ADICIONAL — copy_spec (orçamento de caracteres por campo):
Para CADA bloco com texto, emita também "copy_spec": a lista dos campos de copy que o gerador precisa preencher, com orçamento de caracteres derivado da GEOMETRIA REAL do HTML que você leu:
- Fórmula: chars_por_linha ≈ largura_útil_px ÷ (font_size_px × 0.55). Em colunas ESTREITAS (< 300px, ex.: texto ao lado de imagem), use × 0.75 no lugar de × 0.55 — a quebra de palavra desperdiça ~30% da linha.
- max_chars = chars_por_linha × número de linhas que a seção comporta com elegância (headline: 1-2 linhas; body/parágrafo: 3-4; CTA de botão: SEMPRE 1 linha).
- min_chars ≈ 40-60% do max_chars (texto raquítico em área grande também quebra o design).
- Use as chaves REAIS de copy: headline, body, text, cta, code, hint, title, eyebrow, greeting, signoff, author.
- Guarda-corpos que NUNCA podem ser violados: headline 12-60, body/text 30-400, cta 6-24, code 4-16, title 8-50.
- Blocos sem texto gerado (image, divider, spacer, footer) → "copy_spec": [].
O shape de cada item: {"key":"headline","min_chars":18,"max_chars":40}. O JSON final passa a ser: {"objective","messaging","subject_hint","blocks":[{"type","label","purpose","needs_image","image_brief","copy_spec"}]}.$RULES$
WHERE agent_type = 'blueprint'
  AND is_active = true
  AND system_prompt NOT LIKE '%copy_spec%';
