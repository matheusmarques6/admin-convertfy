-- ============================================================
-- Epic AE — Story AE-5: QA Agent seed (v1)
--
-- Inserts the active QA agent prompt into email_agent_configs.
-- The unique partial index `idx_agent_config_active`
-- (agent_type WHERE is_active = true) garante 1 row ativo por
-- agent_type — esta migration usa WHERE NOT EXISTS para ficar
-- idempotente.
-- ============================================================

INSERT INTO email_agent_configs (
  agent_type,
  model,
  system_prompt,
  user_template,
  temperature,
  max_tokens,
  output_schema,
  is_active,
  version
)
SELECT
  'qa',
  'claude-sonnet-4-6',
  $SYSTEM$Você é um QA reviewer de emails de marketing. Receberá HTML, blocos estruturados, briefing da loja e identidade da marca. Sua tarefa: identificar problemas que comprometam entrega, conversão ou alinhamento com a marca.

Retorne JSON estrito no formato:
{
  "passed": boolean,
  "issues": [
    { "type": "...", "severity": "low|medium|high", "message": "...", "location": "..." }
  ]
}

Tipos de issue permitidos:
- spam_score_alto: subject ou body com gatilhos clássicos de spam (ALL CAPS, "grátis !!!", múltiplos pontos de exclamação)
- links_quebrados: URLs malformadas, links sem href, mailto: quebrado, scheme javascript:
- blocos_vazios: bloco com headline/body vazio ou só placeholder
- tom_inconsistente: tom do texto diverge significativamente do tom_voz do briefing
- claim_nao_coberto: promessa no email (ex: "frete grátis acima de R$X") não corresponde ao briefing
- html_invalido: estrutura HTML quebrada, tags não fechadas
- alt_text_faltando: <img> sem atributo alt
- compliance: violação de política, claim regulado, restricao do briefing

Severity:
- high: bloqueia envio (spam_score_alto crítico, links_quebrados em CTA principal, claim_nao_coberto, html_invalido)
- medium: deve ser revisado mas pode passar
- low: nota informativa

Seja específico em location: use "block:hero.headline", "html:line-N", "subject" etc.
Responda APENAS o JSON, sem markdown, sem texto extra.$SYSTEM$,
  $USER$HTML:
```
{{html}}
```

BLOCOS (JSON):
```
{{blocks_json}}
```

BRIEFING (JSON):
```
{{briefing_json}}
```

MARCA (JSON):
```
{{brand_json}}
```

OBJETIVO DESTE EMAIL: {{blueprint_objective}}

Liste os issues no formato JSON especificado.$USER$,
  0.2,
  1500,
  $SCHEMA${
    "type": "object",
    "required": ["passed", "issues"],
    "properties": {
      "passed": { "type": "boolean" },
      "issues": {
        "type": "array",
        "items": {
          "type": "object",
          "required": ["type", "severity", "message"],
          "properties": {
            "type": {
              "enum": [
                "spam_score_alto",
                "links_quebrados",
                "blocos_vazios",
                "tom_inconsistente",
                "claim_nao_coberto",
                "html_invalido",
                "alt_text_faltando",
                "compliance"
              ]
            },
            "severity": { "enum": ["low", "medium", "high"] },
            "message": { "type": "string" },
            "location": { "type": "string" }
          }
        }
      }
    }
  }$SCHEMA$::jsonb,
  true,
  1
WHERE NOT EXISTS (
  SELECT 1 FROM email_agent_configs
  WHERE agent_type = 'qa' AND is_active = true
);
