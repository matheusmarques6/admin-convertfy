-- ============================================================
-- Epic AE — Component Assembler: seed dos prompts (v1)
--
-- Insere as configs ativas dos dois agentes em email_agent_configs:
--   - blueprint: expande o outline no blueprint detalhado da loja.
--   - assembler: escolhe a variante de componente final por bloco.
-- Idempotente: WHERE NOT EXISTS garante 1 ativo por agent_type
-- (invariante do unique index idx_agent_config_active).
-- ============================================================

-- ── Agente BLUEPRINT ───────────────────────────────────────
INSERT INTO email_agent_configs (
  agent_type, model, system_prompt, user_template,
  temperature, max_tokens, output_schema, is_active, version
)
SELECT
  'blueprint',
  'claude-sonnet-4-6',
  $SYSTEM$Você é o arquiteto de estrutura de emails de marketing de e-commerce. A partir de uma ESTRUTURA GERAL (outline de alto nível do email) e do contexto da loja (nicho, posicionamento, persona, produtos, tom de voz), você gera o BLUEPRINT DETALHADO daquele email: a lista ordenada de blocos com tipo, label, propósito e se cada bloco precisa de imagem.

Princípios:
- Respeite a INTENÇÃO do outline (objetivo + ingredientes sugeridos), mas ADAPTE à loja: ajuste a quantidade e a ordem dos blocos ao nicho, posicionamento e produtos. Ex.: loja sem cupom não recebe bloco coupon.
- Use SOMENTE os tipos de bloco permitidos.
- Cada bloco hero/image deve ter needs_image=true; os demais false.
- Produza objective, messaging e subject_hint específicos da loja.

Tipos de bloco permitidos: hero, text, coupon, products, footer, image, cta, divider, spacer, social, header, headline, features, social_proof, testimonials, urgency, comparison, story, letter.

Retorne JSON estrito no formato:
{
  "objective": "...",
  "messaging": "...",
  "subject_hint": "...",
  "blocks": [ { "type": "...", "label": "...", "purpose": "...", "needs_image": false } ]
}
Responda APENAS o JSON, sem markdown.$SYSTEM$,
  $USER$LOJA: {{brand_name}}
NICHO: {{nicho}}
POSICIONAMENTO: {{posicionamento}}
PERSONA: {{persona}}
TOM DE VOZ: {{tom_voz}}
PRODUTOS TOP: {{top_products}}

FLOW: {{flow_type}} — EMAIL #{{email_number}}

ESTRUTURA GERAL (outline):
- Objetivo: {{outline_objective}}
- Diretriz: {{outline_guidance}}
- Blocos sugeridos: {{suggested_blocks}}
- Tipos permitidos: {{allowed_block_types}}

Gere o blueprint detalhado deste email, adaptado à loja. Responda apenas o JSON.$USER$,
  0.4,
  2048,
  $SCHEMA${
    "type": "object",
    "required": ["objective", "messaging", "blocks"],
    "properties": {
      "objective": { "type": "string" },
      "messaging": { "type": "string" },
      "subject_hint": { "type": "string" },
      "blocks": {
        "type": "array",
        "items": {
          "type": "object",
          "required": ["type", "label"],
          "properties": {
            "type": { "type": "string" },
            "label": { "type": "string" },
            "purpose": { "type": "string" },
            "needs_image": { "type": "boolean" }
          }
        }
      }
    }
  }$SCHEMA$::jsonb,
  true,
  1
WHERE NOT EXISTS (
  SELECT 1 FROM email_agent_configs
  WHERE agent_type = 'blueprint' AND is_active = true
);

-- ── Agente ASSEMBLER ───────────────────────────────────────
INSERT INTO email_agent_configs (
  agent_type, model, system_prompt, user_template,
  temperature, max_tokens, output_schema, is_active, version
)
SELECT
  'assembler',
  'claude-sonnet-4-6',
  $SYSTEM$Você é o montador de referência visual de emails. Para cada bloco do email, você recebe uma lista de VARIANTES FINALISTAS de componente (já pré-filtradas por afinidade com a marca) e deve escolher a que melhor combina com a loja, o produto e o perfil da marca, mantendo coerência visual entre os blocos.

Considere: nicho, posicionamento, mood (tom de voz) e a coerência do conjunto — não misture estilos conflitantes (ex.: hero premium minimalista com footer infantil colorido).

Escolha sempre um variant_id presente nos finalistas daquele bloco. Retorne JSON estrito: um array com uma escolha por bloco, na ordem recebida.

Formato:
[ { "block_index": 0, "variant_id": "..." } ]
Responda APENAS o JSON array, sem markdown.$SYSTEM$,
  $USER$LOJA: {{brand_name}} — NICHO: {{nicho}} — POSICIONAMENTO: {{posicionamento}} — MOOD: {{mood}}

BLOCOS DO EMAIL (em ordem):
{{blocks_json}}

VARIANTES FINALISTAS POR BLOCO (escolha uma por bloco):
{{candidates_json}}

Escolha a melhor variante de cada bloco. Responda apenas o JSON array.$USER$,
  0.3,
  1500,
  $SCHEMA${
    "type": "array",
    "items": {
      "type": "object",
      "required": ["block_index", "variant_id"],
      "properties": {
        "block_index": { "type": "number" },
        "variant_id": { "type": "string" }
      }
    }
  }$SCHEMA$::jsonb,
  true,
  1
WHERE NOT EXISTS (
  SELECT 1 FROM email_agent_configs
  WHERE agent_type = 'assembler' AND is_active = true
);
