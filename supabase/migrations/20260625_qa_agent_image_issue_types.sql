-- ============================================================
-- Epic AE — Story AE-15: QA Agent image issue types
--
-- Data-only: UPDATE no `system_prompt` da v1 ATIVA do
-- `email_agent_configs.agent_type='qa'` adicionando:
--   - 4 novos tipos de issue (image_nicho_mismatch, image_paleta_off,
--     image_overlay_reserva_ausente, image_cena_inadequada)
--   - Instrucao sobre image_nicho_mismatch (Etapa 1 gratis — comparar
--     image_alt vs PRODUTO_HEROI esperado do briefing)
--
-- Idempotente: re-rodar atualiza pro mesmo conteudo (UPDATE in-place
-- em v1 ativa). Se ainda nao existe row ativa (AE-5 nao aplicada),
-- esta migration vira no-op silencioso — aplicar AE-5 primeiro.
--
-- Smoke test apos aplicar:
--   SELECT length(system_prompt) AS sp_len,
--          position('image_nicho_mismatch' IN system_prompt) AS has_new
--   FROM email_agent_configs WHERE agent_type='qa' AND is_active=true;
--   -- esperado: has_new > 0
-- ============================================================

UPDATE email_agent_configs
SET system_prompt = $SYSTEM$Você é um QA reviewer de emails de marketing. Receberá HTML, blocos estruturados, briefing da loja e identidade da marca. Sua tarefa: identificar problemas que comprometam entrega, conversão ou alinhamento com a marca.

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
- image_nicho_mismatch: bloco hero/image cujo image_alt menciona produto/categoria DIFERENTE do esperado (vs PRODUTO_HEROI do briefing.marca.nicho ou brand.top_products[0]). Severity sempre `high`. Exemplo: marca de moda masculina (L'Hombre) com image_alt "cueca azul em quarto" mas PRODUTO_HEROI esperado é "polo slim-fit em escritório". Bloqueia.
- image_paleta_off: cores dominantes da imagem fora da paleta da marca (Etapa 2 visual — Claude vision, nao avalie aqui)
- image_overlay_reserva_ausente: terco inferior da imagem nao reservado pra overlay de texto quando esperado (Etapa 2 visual — nao avalie aqui)
- image_cena_inadequada: ambiente/mood da imagem incompativel com posicionamento (Etapa 2 visual — nao avalie aqui)

Severity:
- high: bloqueia envio (spam_score_alto crítico, links_quebrados em CTA principal, claim_nao_coberto, html_invalido, image_nicho_mismatch)
- medium: deve ser revisado mas pode passar
- low: nota informativa

Seja específico em location: use "block:hero.headline", "html:line-N", "subject", "block:N:hero" para imagens etc.
Responda APENAS o JSON, sem markdown, sem texto extra.$SYSTEM$,
    output_schema = $SCHEMA${
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
                "compliance",
                "image_nicho_mismatch",
                "image_paleta_off",
                "image_overlay_reserva_ausente",
                "image_cena_inadequada"
              ]
            },
            "severity": { "enum": ["low", "medium", "high"] },
            "message": { "type": "string" },
            "location": { "type": "string" }
          }
        }
      }
    }
  }$SCHEMA$::jsonb
-- AE-15 review fix: guarda `version = 1` evita sobrescrever silenciosamente
-- uma v2+ ativa criada via AE-8 UI (admin editou prompt manualmente).
-- Se ja existe v2+ ativa: este UPDATE eh no-op e o aviso abaixo dispara.
WHERE agent_type = 'qa' AND is_active = true AND version = 1;

-- Aviso pra ops: se versao ativa nao eh v1 (admin editou via AE-8),
-- a migration nao aplicou e precisa de sync manual da nova versao
-- com os novos image_* issue types (image_nicho_mismatch + 3 outros).
DO $$
DECLARE
  active_v INT;
BEGIN
  SELECT version INTO active_v
    FROM email_agent_configs
    WHERE agent_type = 'qa' AND is_active = true
    LIMIT 1;
  IF active_v IS NOT NULL AND active_v > 1 THEN
    RAISE WARNING
      'QA agent v% esta ativa (criada via AE-8?). Migration 20260625 nao '
      'atualizou — sync manual necessario: adicionar image_nicho_mismatch + '
      '3 outros issue types ao system_prompt + output_schema da v%.',
      active_v, active_v;
  END IF;
END $$;
