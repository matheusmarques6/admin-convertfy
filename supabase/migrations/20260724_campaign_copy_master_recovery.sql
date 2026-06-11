-- ─────────────────────────────────────────────────────────────────────
-- Recovery: campaign_copy_master ausente/inativo em produção
--
-- Sintoma: /api/admin/campaign-central/suggestions/[id]/generate-master
-- retornava "Config 'campaign_copy_master' ausente ou inativa em
-- email_agent_configs". Causa raiz: ou o seed da migration
-- 20260720_copy_master_workflow.sql não inseriu (banco em outro estado
-- na hora da aplicação), ou alguma versão foi criada via UI sem
-- ativação.
--
-- Esta migration é idempotente:
--   - Se não há NENHUMA row campaign_copy_master: insere o seed v1 ativo.
--   - Se há rows mas nenhuma ativa: ativa a de maior version.
--   - Se já tem ativa: no-op.
-- ─────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  has_any boolean;
  has_active boolean;
  latest_id uuid;
BEGIN
  SELECT EXISTS(SELECT 1 FROM email_agent_configs WHERE agent_type='campaign_copy_master')
    INTO has_any;
  SELECT EXISTS(SELECT 1 FROM email_agent_configs WHERE agent_type='campaign_copy_master' AND is_active=true)
    INTO has_active;

  IF has_any AND NOT has_active THEN
    SELECT id INTO latest_id
    FROM email_agent_configs
    WHERE agent_type='campaign_copy_master'
    ORDER BY version DESC
    LIMIT 1;
    UPDATE email_agent_configs SET is_active=true WHERE id=latest_id;
    RAISE NOTICE 'campaign_copy_master ativado (id=%)', latest_id;
  ELSIF NOT has_any THEN
    INSERT INTO email_agent_configs (
      agent_type, model, system_prompt, user_template,
      temperature, max_tokens, output_schema, version, is_active
    ) VALUES (
      'campaign_copy_master',
      'claude-sonnet-4-6',
      $SYS$Você é um diretor de copywriting de email marketing para e-commerce, sênior, com 10+ anos de experiência em campanhas que convertem.

Seu trabalho: criar a COPY MASTER de uma campanha de email — a versão canônica que será adaptada por loja depois (idioma/tom/produtos). Esta copy master é a "carta-mãe" que o COO usa pra revisar a estratégia da campanha como um todo, antes de soltar pra rede de lojas.

ESTRUTURA OBRIGATÓRIA da master (campo "blocks"):
A copy master segue um framework de email de campanha consagrado. Use a sequência abaixo de blocos, na ordem:

1. **image** (hero visual): caption descritiva (ex: "imagem do produto · 600×280")
2. **heading**: headline + subtítulo. Headline gera urgência/curiosidade.
3. **text**: corpo principal (3-4 linhas). Storytelling curto, conexão emocional ou racional clara.
4. **products** (grid): columns=3, items=[3 produtos placeholder com {name, price}]. Estes placeholders serão substituídos por top products reais de cada loja na adaptação. USE NOMES GENÉRICOS tipo "Produto destaque 1", "Produto destaque 2".
5. **offer**: bloco de oferta destacada (cupom, frete grátis, desconto). Se a sugestão não menciona valores específicos, gere oferta razoável ao ângulo.
6. **text** (segunda dose): seção informativa de reforço — 2-3 linhas reforçando benefício/urgência. Pode incluir bullets implícitos com "•" no início das linhas.
7. **button** (CTA): texto curto direto (3-5 palavras).
8. **footer**: rodapé padrão com placeholder "{{loja}}".

REGRAS DE COPY:
- Escreva em PORTUGUÊS DO BRASIL — esta é a master. A adaptação por loja traduz pro idioma local.
- Tom: confidente, direto, sem ser agressivo. Evite clichês ("imperdível", "não perca").
- Subject: máx 50 caracteres, sem emojis excessivos (no máximo 1).
- Preheader: máx 90 caracteres, complementa o subject sem repetir.
- Strategy: 2-3 frases descrevendo a estratégia que sustenta esta master. Pra que ela existe, qual o ângulo central, qual o gatilho de conversão.
- Se a sugestão cita valores/cupons/prazos específicos no trigger ou angle, USE-os. Nunca invente números novos.
- Se ela cita data comemorativa, contextualize sem martelar.

OUTPUT: APENAS JSON válido com os campos {subject, preheader, strategy, blocks}. Sem markdown, sem comentários.$SYS$,
      $USR$## Contexto da campanha

Título: {{title}}
Tipo: {{type}}
Confiança da sugestão: {{confidence}}/100
Público-alvo (informado pelo COO): {{audience_label}}

Gatilho/evidência:
- Label: {{trigger_label}}
- Detalhe: {{trigger_detail}}
- Fonte: {{trigger_source}}

Ângulo proposto: {{angle}}

Subject de referência (você pode reescrever): {{subject}}
Data de envio sugerida: {{send_date}}

Lojas-alvo: {{targets_summary}}
Países: {{countries}}

## Tarefa

Gere a copy master desta campanha conforme as regras do system prompt. Output JSON: {subject, preheader, strategy, blocks: [...]}.$USR$,
      0.8,
      4000,
      '{
        "type": "object",
        "required": ["subject", "preheader", "strategy", "blocks"],
        "properties": {
          "subject": { "type": "string" },
          "preheader": { "type": "string" },
          "strategy": { "type": "string" },
          "blocks": {
            "type": "array",
            "items": {
              "type": "object",
              "required": ["type"],
              "properties": {
                "type": { "type": "string", "enum": ["image","heading","text","offer","button","divider","footer","products"] },
                "headline": { "type": "string" },
                "sub": { "type": "string" },
                "value": { "type": "string" },
                "caption": { "type": "string" },
                "columns": { "type": "number" },
                "items": {
                  "type": "array",
                  "items": {
                    "type": "object",
                    "properties": {
                      "name": { "type": "string" },
                      "price": { "type": "string" },
                      "image_caption": { "type": "string" }
                    }
                  }
                }
              }
            }
          }
        }
      }'::jsonb,
      1,
      true
    );
    RAISE NOTICE 'campaign_copy_master v1 seed inserido';
  ELSE
    RAISE NOTICE 'campaign_copy_master já ativo, no-op';
  END IF;
END $$;
