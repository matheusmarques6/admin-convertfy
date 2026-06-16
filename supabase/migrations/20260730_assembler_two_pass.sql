-- ============================================================
-- Montador em 2 passos (escolhe por descrição → harmoniza só o HTML escolhido).
--
-- Problema: o Montador mandava a biblioteca (email_component_variants) cortada
-- em 1500 chars/variante como "inspiração" — o HTML curado nunca era usado de
-- fato e gastava input tokens com HTML descartado.
--
-- Agora:
--   PASSO A (assembler_chooser, modelo barato): recebe só DESCRIÇÃO + metadados
--     de cada variante (SEM html) e escolhe 1 variant_id por seção.
--   PASSO B (assembler, Opus): recebe o HTML COMPLETO só das variantes ESCOLHIDAS
--     (1/seção) e harmoniza num documento coeso.
--
-- O HTML completo só entra no prompt DEPOIS de escolhido → zero gasto com HTML
-- das variantes rejeitadas. Idempotente.
-- ============================================================

-- 1. Descrição curta por variante (input do passo A, sem html).
ALTER TABLE email_component_variants ADD COLUMN IF NOT EXISTS description text;

-- 2. Expande o CHECK de email_agent_configs.agent_type ANTES do INSERT do novo
-- tipo 'assembler_chooser' (senão o INSERT viola a constraint). Espelha a lista
-- vigente (20260724) + assembler_chooser. Mesmo padrão idempotente.
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
      'campaign_architect'
    ));
END $$;

-- 3. Config do PASSO A — o Curador (escolhe variant_id por descrição).
INSERT INTO email_agent_configs (
  agent_type, model, system_prompt, user_template, temperature, max_tokens, is_active, version
)
SELECT
  'assembler_chooser',
  'anthropic/claude-sonnet-4.6',
  $SYS$Você é o Curador de Componentes de email. Para CADA posição da sequência do email, escolha UMA variante da biblioteca — a que melhor serve ao objetivo do email e à identidade da loja — usando o NOME, a DESCRIÇÃO e os metadados (mood/density) de cada variante. Você NÃO recebe o HTML das variantes; decide pela descrição.

Regras:
- Uma escolha por block_index da sequência. Use APENAS variant_id presente nas opções daquela posição.
- Se a descrição estiver vazia, decida pelo nome + metadados.
- Não invente variant_id.

Responda APENAS um array JSON, sem markdown nem texto ao redor:
[{"block_index": 0, "variant_id": "..."}, {"block_index": 1, "variant_id": "..."}]$SYS$,
  $USR$<store>
- marca: {{brand_name}}
- nicho: {{nicho}}
- posicionamento: {{posicionamento}}
- persona: {{persona}}
- tom de voz: {{tom_voz}}
</store>

<outline>
- objetivo: {{outline_objective}}
- diretriz: {{outline_guidance}}
- tom sugerido: {{outline_tone_hint}}
</outline>

<estrutura_geral_ordenada>
{{blocks_json}}
</estrutura_geral_ordenada>

<biblioteca_componentes>
{{candidates_json}}
</biblioteca_componentes>

Para CADA block_index em <estrutura_geral_ordenada>, escolha em <biblioteca_componentes> (mesmo block_index) o variant_id que melhor serve ao objetivo e à loja. Responda APENAS o array JSON [{"block_index":N,"variant_id":"..."}].$USR$,
  0.2,
  2048,
  true,
  1
WHERE NOT EXISTS (
  SELECT 1 FROM email_agent_configs
  WHERE agent_type = 'assembler_chooser' AND is_active = true
);

-- 4. Config do PASSO B — o Montador agora recebe os HTMLs já escolhidos e monta.
UPDATE email_agent_configs
SET
  system_prompt = $SYS$Você é o Montador de Componentes. Você recebe os HTMLs REAIS das variantes JÁ ESCOLHIDAS para cada seção do email, na ordem (<componentes_escolhidos>). Sua tarefa: MONTAR um único documento HTML coeso REUSANDO esses HTMLs.

Regras:
- Preserve a técnica/estrutura de cada variante escolhida — não reescreva do zero; adapte só o necessário para harmonizar (espaçamentos, larguras, tipografia) num documento único.
- Container único de 600px centralizado.
- Cores SEMPRE via CSS variables (--bg, --text, --heading, --button-bg, --button-text, --accent) declaradas em :root — unifique as cores das variantes nessas variáveis.
- NÃO escreva a copy final: use placeholders curtos (ex.: {{HEADLINE}}, {{BODY}}, {{CTA_LABEL}}).
- NÃO use imagens reais: deixe contêineres/slots de imagem vazios.
- Use <htmls_referencia> só como inspiração de padrão visual.

Emita APENAS o HTML, de <!DOCTYPE html> a </html>, sem cercas markdown e sem comentários.$SYS$,
  user_template = $USR$<store>
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

<htmls_referencia>
{{reference_template_html}}
</htmls_referencia>

<componentes_escolhidos>
{{chosen_html_json}}
</componentes_escolhidos>

Monte AGORA o HTML completo REUSANDO os HTMLs de <componentes_escolhidos>, na ordem, harmonizando num documento único com placeholders de copy e CSS variables de cor. Emita só o HTML, de <!DOCTYPE html> a </html>.$USR$
WHERE agent_type = 'assembler' AND is_active = true;

-- 5. Telemetria do passo A grava agent='assembler_chooser' em
-- email_generation_runs — expande o CHECK (senão o INSERT falha com 23514 e o
-- run do chooser não é registrado). Mesmo padrão das migrations 20260708/20260728.
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
      'seed','copy','image','html','qa','blueprint','assembler','copy_dispatch','assembler_chooser'
    ));
END $$;
