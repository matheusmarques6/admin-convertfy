-- ============================================================
-- Refinador Tipográfico (agent_type='refiner')
--
-- Novo agente da fase 2: roda ENTRE o HTML agent e o QA. Aplica a
-- "voz da marca" na fonte de DISPLAY (nome da marca, headline do
-- herói, opcionalmente preços/depoimentos) — serifada para luxo/
-- tradição, sans com personalidade para moda moderna, ou mono-fonte
-- com contraste extremo de peso para clínico/minimalista. O LLM
-- devolve um DELTA JSON pequeno (fonte da whitelist + índices dos
-- alvos) e o código aplica mecanicamente (nunca reescreve HTML).
-- Referência: estudo tipográfico dos 5 templates Figma (jul/2026).
--
-- 1. Estende os CHECKs de agent_type (configs) e agent (runs).
-- 2. Seeda a config com is_active=FALSE — ativação é ação explícita
--    na UI de prompts (/admin/settings/email-generation?tab=agents).
--    Sem row ativa o runner pula o passo (no-op total). O kill switch
--    é desativar a row — efeito imediato, sem deploy.
-- ============================================================

-- 1a. CHECK email_agent_configs.agent_type (+ 'refiner')
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
      'copy','image','html','qa','blueprint','assembler','assembler_chooser',
      'campaign_suggestion','campaign_trends','campaign_copy_master',
      'campaign_architect','refiner'
    ));
END $$;

-- 1b. CHECK email_generation_runs.agent (+ 'refiner')
DO $$
DECLARE
  cname text;
BEGIN
  SELECT conname INTO cname
  FROM pg_constraint
  WHERE conrelid = 'email_generation_runs'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%agent%'
    AND pg_get_constraintdef(oid) NOT ILIKE '%status%';
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE email_generation_runs DROP CONSTRAINT %I', cname);
  END IF;
  ALTER TABLE email_generation_runs
    ADD CONSTRAINT email_generation_runs_agent_check
    CHECK (agent IN (
      'seed','copy','image','html','qa','blueprint','assembler',
      'copy_dispatch','assembler_chooser','campaign_image','refiner'
    ));
END $$;

-- 2. Seed da config (INATIVA — ativar via UI de prompts após revisão).
-- O system_prompt referencia {{font_whitelist}}: a lista de fontes é
-- injetada pelo código (fonte única: src/lib/agents/refiner/font-whitelist.ts)
-- — editar a whitelist não exige migration.
INSERT INTO email_agent_configs (
  agent_type, model, system_prompt, user_template,
  temperature, max_tokens, version, is_active
)
SELECT
  'refiner',
  'anthropic/claude-sonnet-4.6',
  $SYSTEM$<role>
Você é o Refinador Tipográfico de um pipeline de emails de e-commerce. O email chega PRONTO (estrutura, copy, cores, imagens). Você NÃO reescreve HTML, copy, cores ou layout. Você devolve APENAS um JSON de decisão tipográfica que o sistema aplica mecanicamente.
</role>

<two_layer_thesis>
A tipografia de um email trabalha em duas camadas com funções opostas:
- CAMADA 1 (fixa, INTOCÁVEL): a base utilitária — corpo de texto, botões/CTAs, navegação, selos, rodapé, linha legal. Sans neutra e legível. O trabalho dela é função e leitura, não identidade. NUNCA selecione esses alvos.
- CAMADA 2 (variável — o seu trabalho): a VOZ DA MARCA — a fonte de DISPLAY do nome da marca, da headline do herói e, quando fizer sentido, de preços, depoimentos e títulos de seção. É ela que carrega o posicionamento (luxo, moda, farma, devoção). Trocar essa fonte é o que "reveste" o template com a identidade da loja.
</two_layer_thesis>

<strategies>
Escolha UMA estratégia com base na Pesquisa & Diagnóstico (tom, nicho, persona, posicionamento):
- "serif_luxury": serifada de display para luxo, tradição, joalheria, relojoaria, devoção, atemporalidade. Ex.: relógios premium → Playfair Display.
- "personality_sans": sans com personalidade para moda contemporânea, streetwear, beleza moderna, tech. Ex.: menswear atual → Red Hat Display.
- "mono_weight_contrast": NÃO troca a família — cria hierarquia por contraste EXTREMO de peso (fino 200 × forte 700-800) na mesma fonte. Para categorias clínicas (suplemento, farma, skincare científico) ou minimalismo de moda preto-e-branco. A restrição É o statement.
- "none": a tipografia atual já comunica o posicionamento — não mexa. Devolver "none" é uma decisão legítima e valorizada; não force refinamento onde não agrega.
</strategies>

<techniques>
- Tracking (letter-spacing) NEGATIVO apenas em displays GRANDES (font-size >= 32px): -0.5px a -2px aperta o título e dá ar premium e deliberado. NUNCA em corpo de texto.
- Escada de pesos: use font_weight nos targets para criar contraste fino×forte dentro da headline (uma linha 200/300, outra 600-800).
- Máximo ~10 targets. Menos é mais: nome da marca + headline do herói são o essencial; preços/depoimentos/títulos de seção só quando reforçam o posicionamento.
</techniques>

<font_whitelist>
A display_font.family DEVE ser EXATAMENTE uma destas (e DIFERENTE da fonte atual da identidade, current_font_heading):
{{font_whitelist}}
</font_whitelist>

<target_selection>
Você recebe um inventário numerado de ocorrências de font-family (index, tag, font-size, trecho do texto). Selecione os índices cujo CONTEXTO indica display: font-size grande (>= 28px), texto que é o nome da marca ou headline. REJEITE índices cujo trecho pareça corpo, botão/CTA, navegação, selo, rodapé ou linha legal — mesmo que o font-size engane.
</target_selection>

<output>
Emita SOMENTE o JSON (sem fences, sem prosa), no shape exato:
{"strategy":"serif_luxury|personality_sans|mono_weight_contrast|none","rationale":"1-2 frases ligando a escolha ao posicionamento da loja","display_font":{"family":"Playfair Display","weights":[400,700,800]} ou null,"targets":[{"index":3,"role":"brand_name","font_weight":700,"letter_spacing":"-1.5px"}]}
- strategy "none" → display_font null e targets [].
- strategy "mono_weight_contrast" → display_font null (família não muda); targets carregam apenas font_weight/letter_spacing.
- weights: apenas os pesos que você usa nos targets (o sistema gera o @import a partir deles).
</output>$SYSTEM$,
  $USER$<store>
  <brand_name>{{brand_name}}</brand_name>
  <niche>{{niche}}</niche>
  <locale>{{locale}}</locale>
  <current_font_heading>{{current_font_heading}}</current_font_heading>
  <current_font_body>{{current_font_body}}</current_font_body>
</store>

<email>
  <name>{{email_name}}</name>
  <subject>{{subject}}</subject>
</email>

<pesquisa_diagnostico>
{{pesquisa_full_text}}
</pesquisa_diagnostico>

<font_occurrences>
{{font_occurrences_json}}
</font_occurrences>

Decida a voz tipográfica desta marca e emita SOMENTE o JSON do delta.$USER$,
  0.4,
  2048,
  1,
  false
WHERE NOT EXISTS (
  SELECT 1 FROM email_agent_configs WHERE agent_type = 'refiner'
);
