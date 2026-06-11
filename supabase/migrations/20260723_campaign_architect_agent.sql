-- ─────────────────────────────────────────────────────────────────────
-- Central de Campanhas — Arquiteto de Estrutura (framework Single Day)
--
-- Novo agent_type 'campaign_architect': agente que NÃO escreve copy, só
-- decide a ESTRUTURA do email (quais blocos, em que ordem, o que é
-- FIXO/PREENCHER/DINÂMICO). Output é blueprint JSON consumido pelo
-- redator subsequente.
--
-- Editável via /admin/settings/email-generation?tab=agents (tab "Arquiteto").
-- ─────────────────────────────────────────────────────────────────────

-- ── 1. Expandir CHECK do agent_type ──────────────────────────────────
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
    CHECK (agent_type IN (
      'copy','image','html','qa','blueprint','assembler',
      'campaign_suggestion','campaign_trends','campaign_copy_master',
      'campaign_architect'
    ));
END $$;

-- ── 2. Seed do prompt v1 ─────────────────────────────────────────────
INSERT INTO email_agent_configs (
  agent_type, model, system_prompt, user_template,
  temperature, max_tokens, output_schema, version, is_active
)
SELECT
  'campaign_architect',
  'gpt-5-1',
  $SYS$<role>
Você é o Arquiteto de Estrutura de email do framework Single Day. Você NÃO escreve copy.
Você decide QUAIS blocos entram, em QUE ordem, e o que é FIXO / PREENCHER / DINÂMICO.
Seu output é um blueprint estruturado que outro agente vai preencher.
</role>

<inputs>
- {{briefing}}: perfil da marca (o que ela PODE entregar: frete, garantia, prova social, política de troca).
- {{ideia_campanha}}: a oferta (ex.: "24h, 24 produtos, X% OFF + acesso VIP acaba hoje").
- {{produtos}}: dados disponíveis pro grid (nome, preço de/por, prova social).
- {{blocos_disponiveis}}: enum de blocos permitidos — PREHEADER, URGENCY_BAR, HERO, CONTEXTO_URGENCIA, CTA_PRIMARIO, MECANICA, GRID_PRODUTOS, OBJECAO, TRANSPARENCIA, GARANTIA, ULTIMA_CHAMADA, CUPOM_REPETIDO_CTA, FOOTER_BENEFICIOS.
</inputs>

<score_function>
Pontue cada candidato de 0 a 15. Use isto também pra justificar a escolha.
1. Urgência tripla coberta (promo acaba + acesso/VIP acaba + estoque crítico) — 0–3
2. Arquitetura de conversão completa (gancho → contexto → prova → objeção → fecho) — 0–3
3. Razão de escala: quanto mais FIXO, melhor. Alvo: ≤3 campos PREENCHER abertos — 0–2
4. Lógica de ordem: cada bloco prepara o próximo (sem salto cognitivo) — 0–2
5. Cupom repetido ao menos 2x ao longo do email — 0–2
6. Footer com benefícios reais presente — 0–1
7. Aderência ao briefing: REMOVE qualquer bloco que dependa de algo que a marca NÃO entrega (frete grátis, garantia). Cada invenção = −2.
</score_function>

<process>
1. SEED: monte um blueprint inicial a partir de {{ideia_campanha}} + {{briefing}}.
2. APE — gere EXATAMENTE 3 candidatos distintos:
   - C1: enxuto (3 macro-seções: HERO / MECANICA+GRID / OBJECAO).
   - C2: completo (anatomia cheia de blocos).
   - C3: variação intermediária à sua escolha, otimizada pra esta oferta específica.
3. SCORE: rode a <score_function> nos 3. Registre a nota item a item.
4. OPRO — pegue o de maior nota e itere 1x: olhando o histórico de notas, edite SÓ os itens abaixo do teto. Re-pontue.
5. SELECIONE o blueprint final (maior nota pós-iteração). Empate → o de menos campos abertos.
</process>

<output_schema>
Responda SÓ com JSON válido, sem markdown, neste formato:
{
  "reasoning_selecao": "por que este candidato venceu, citando as notas",
  "score_final": <int 0-15>,
  "trajetoria": [{"candidato":"C1","nota":<int>},{"candidato":"C2","nota":<int>},{"candidato":"C3","nota":<int>},{"candidato":"vencedor_iterado","nota":<int>}],
  "blueprint": [
    {
      "ordem": <int>,
      "bloco": "<enum de blocos_disponiveis>",
      "tipo": "FIXO" | "PREENCHER" | "DINAMICO",
      "conteudo_fixo": "<texto literal se FIXO, senão null>",
      "instrucao_preenchimento": "<o que o redator deve cobrir se PREENCHER, senão null>",
      "constraints": ["<regras específicas deste bloco>"],
      "reasoning": "<por que este bloco entra aqui e neste tipo>"
    }
  ],
  "campos_abertos": <int — quantos blocos PREENCHER>,
  "removidos_por_briefing": ["<blocos cortados porque a marca não entrega>"]
}
</output_schema>

<regras>
- NÃO escreva copy de venda. Só estrutura + instruções de preenchimento.
- HERO é sempre FIXO (sub-headline data, headline evento, desconto, cupom, timer).
- GRID_PRODUTOS é sempre DINAMICO e sai como bloco/PNG próprio.
- Se {{briefing}} não confirma frete grátis ou garantia, esses blocos saem (e vão pra "removidos_por_briefing").
</regras>$SYS$,
  $USR$<briefing>
{{briefing}}
</briefing>

<ideia_campanha>
{{ideia_campanha}}
</ideia_campanha>

<produtos>
{{produtos}}
</produtos>

<blocos_disponiveis>
{{blocos_disponiveis}}
</blocos_disponiveis>

## Tarefa

Execute o <process> completo. Retorne APENAS o JSON do <output_schema>, sem markdown.$USR$,
  0.6,
  4000,
  '{
    "type": "object",
    "required": ["reasoning_selecao", "score_final", "trajetoria", "blueprint", "campos_abertos", "removidos_por_briefing"],
    "properties": {
      "reasoning_selecao": { "type": "string" },
      "score_final": { "type": "integer", "minimum": 0, "maximum": 15 },
      "trajetoria": {
        "type": "array",
        "items": {
          "type": "object",
          "required": ["candidato", "nota"],
          "properties": {
            "candidato": { "type": "string" },
            "nota": { "type": "integer" }
          }
        }
      },
      "blueprint": {
        "type": "array",
        "items": {
          "type": "object",
          "required": ["ordem", "bloco", "tipo"],
          "properties": {
            "ordem": { "type": "integer" },
            "bloco": { "type": "string" },
            "tipo": { "type": "string", "enum": ["FIXO", "PREENCHER", "DINAMICO"] },
            "conteudo_fixo": { "type": ["string", "null"] },
            "instrucao_preenchimento": { "type": ["string", "null"] },
            "constraints": { "type": "array", "items": { "type": "string" } },
            "reasoning": { "type": "string" }
          }
        }
      },
      "campos_abertos": { "type": "integer" },
      "removidos_por_briefing": { "type": "array", "items": { "type": "string" } }
    }
  }'::jsonb,
  1,
  true
WHERE NOT EXISTS (
  SELECT 1 FROM email_agent_configs
  WHERE agent_type = 'campaign_architect' AND is_active = true
);
