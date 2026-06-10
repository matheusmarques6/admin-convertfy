-- ─────────────────────────────────────────────────────────────────────
-- Central de Campanhas — agent_type 'campaign_suggestion'
--
-- Estende o CHECK de email_agent_configs.agent_type (padrão dinâmico de
-- 20260708_component_assembler_schema.sql) e semeia o config ativo v1.
-- O prompt fica versionado/editável na UI de prompts existente.
-- ─────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  cname text;
BEGIN
  SELECT conname INTO cname
  FROM pg_constraint
  WHERE conrelid = 'email_agent_configs'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%agent_type%';
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE email_agent_configs DROP CONSTRAINT %I', cname);
  END IF;
  ALTER TABLE email_agent_configs
    ADD CONSTRAINT email_agent_configs_agent_type_check
    CHECK (agent_type IN ('copy','image','html','qa','blueprint','assembler','campaign_suggestion'));
END $$;

-- Seed do config ativo v1 (idempotente: só insere se não existe ativo)
INSERT INTO email_agent_configs (
  agent_type, model, system_prompt, user_template,
  temperature, max_tokens, output_schema, version, is_active
)
SELECT
  'campaign_suggestion',
  'claude-sonnet-4-6',
  $SYS$Você é o estrategista de campanhas da Convertfy, uma agência que gerencia email marketing (Omnisend) de lojas e-commerce em múltiplos países.

Sua tarefa: analisar o contexto das lojas de um cluster (nicho/país) e gerar sugestões de campanhas de email para o próximo ciclo de 7 dias, considerando uma janela de oportunidade de 25 dias.

TIPOS DE SUGESTÃO (campo "type"):
- "data": ancorada em data comemorativa próxima do país da loja. Respeite o lead time: gift guides convertem 7-10 dias antes; last call 1-3 dias antes.
- "tema": surfa um tema em alta (trend) compatível com o nicho da loja.
- "email": replica a estrutura de um email campeão da rede Convertfy em lojas do mesmo vertical que ainda não usaram.
- "performance": ataca um problema específico de uma loja em atenção (queda de receita, lista desengajada, health baixo). Marque low_perf=true.

REGRAS:
1. Use APENAS lojas listadas no contexto. O campo targets deve conter os store_id EXATOS fornecidos.
2. Agrupe lojas na mesma sugestão somente se compartilham país E o ângulo fizer sentido pros dois nichos.
3. confidence (0-100): baseie em força da evidência (data high-impact próxima + nicho alinhado = alto; trend especulativa = médio).
4. est_revenue: estimativa qualitativa em moeda da loja (ex: "R$ 12k", "£3k"), proporcional à receita 30d e ao tipo de campanha. Seja conservador.
5. angle: 2-3 frases acionáveis descrevendo a estratégia (estrutura do email, oferta, segmentação). Específico, não genérico.
6. subject: no idioma da loja-alvo. Se múltiplas lojas com idiomas diferentes, use o idioma majoritário.
7. trigger: a evidência exata que gerou a sugestão ({label, detail, source}). source cita a origem: "Calendário BR", "admin.metrics", "Benchmark Convertfy", nome da trend.
8. send_date: data sugerida de envio (YYYY-MM-DD) respeitando o lead time da oportunidade.
9. Gere entre 1 e 4 sugestões por cluster. Qualidade > quantidade: só sugira o que você defenderia numa reunião.
10. Responda APENAS com o JSON válido, sem markdown, sem comentários.$SYS$,
  $USR$CICLO: {{cycle_range}} (hoje é {{today}})

LOJAS DO CLUSTER:
{{stores_json}}

DATAS COMEMORATIVAS NA JANELA (25 dias, países do cluster):
{{dates_json}}

LOJAS EM ATENÇÃO (problemas detectados):
{{attention_json}}

EMAILS CAMPEÕES DA REDE (benchmark interno Omnisend, 30d):
{{benchmark_json}}

TEMAS EM ALTA (trends do ciclo):
{{trends_json}}

Gere as sugestões de campanha para este cluster seguindo as regras do sistema. Output: JSON no formato {"suggestions": [...]}.$USR$,
  0.7,
  8000, -- teto da UI de prompts (max_tokens <= 8000 em /api/admin/agents/prompts)
  '{
    "type": "object",
    "required": ["suggestions"],
    "properties": {
      "suggestions": {
        "type": "array",
        "items": {
          "type": "object",
          "required": ["type", "title", "confidence", "trigger", "angle", "subject", "targets", "channel"],
          "properties": {
            "type": { "type": "string", "enum": ["data", "tema", "email", "performance"] },
            "title": { "type": "string" },
            "confidence": { "type": "number", "minimum": 0, "maximum": 100 },
            "trigger": {
              "type": "object",
              "required": ["label", "detail", "source"],
              "properties": {
                "label": { "type": "string" },
                "detail": { "type": "string" },
                "source": { "type": "string" }
              }
            },
            "angle": { "type": "string" },
            "subject": { "type": "string" },
            "channel": { "type": "string" },
            "targets": {
              "type": "array",
              "items": {
                "type": "object",
                "required": ["store_id"],
                "properties": {
                  "store_id": { "type": "string" },
                  "store_name": { "type": "string" },
                  "country": { "type": "string" }
                }
              }
            },
            "target_summary": { "type": "string" },
            "est_revenue": { "type": "string" },
            "low_perf": { "type": "boolean" },
            "send_date": { "type": "string" },
            "commemorative_date_name": { "type": "string" },
            "trend_title": { "type": "string" }
          }
        }
      }
    }
  }'::jsonb,
  1,
  true
WHERE NOT EXISTS (
  SELECT 1 FROM email_agent_configs
  WHERE agent_type = 'campaign_suggestion' AND is_active = true
);
