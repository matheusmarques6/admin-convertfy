-- ============================================================
-- Fundo pela PALETA DA LOJA + regra de enquadramento (v2 do bloco de fundo).
--
-- A 20261062 mandava o hex do fundo do email, e ainda saiu errado: com a
-- direção pedindo estúdio, o modelo escolheu um cinza-azulado que não é da
-- marca, e a continuidade entre a foto e a seção — que é o ponto do layout
-- — não aconteceu. Faltava dizer que o fundo TEM de sair da paleta: nunca
-- um neutro escolhido pelo modelo.
--
-- Junto vai a regra de enquadramento: a foto cortou a cabeça da modelo no
-- topo do quadro. Ou a cabeça está inteira, ou o corte começa abaixo dos
-- ombros e é claramente intencional — cabeça fatiada pela borda lê como
-- erro.
--
-- Esta migration SUBSTITUI o bloco da 20261062 (remove o `{{#if BG_COLOR}}
-- … {{/if}}` antigo e prepende o novo), então rodar as duas na ordem deixa
-- só a v2. Idempotente pela marca CFY_BACKDROP_V2.
--
-- Rollback: remover o bloco delimitado pela marca.
-- ============================================================

UPDATE email_agent_configs
SET user_template =
  '{{#if BG_COLOR}}
CFY_BACKDROP_V2 — BACKDROP COLOUR, NOT NEGOTIABLE.
The section this image sits in is painted {{BG_COLOR}}. When the composition calls for a plain, continuous or studio backdrop, the photograph''s background MUST be that exact hex, so photo and section read as ONE CONTINUOUS SURFACE with no visible seam. That continuity is the point of the layout, not a detail.
If the direction asks for a different backdrop, it still has to be one of the STORE''s OWN colours — {{primary_colors}} {{secondary_colors}}. Never a neutral you chose yourself: no generic studio grey, no off-white, no colour from outside the brand palette.
The only thing that overrides this is a direction explicitly asking for a real setting (a room, a street, outdoors) — then shoot the setting.

FRAMING PEOPLE. When a person appears, the frame NEVER cuts the top of the head or crops the face out. Either the head is fully inside the frame, or the crop is a deliberate, recognisable one that starts BELOW the shoulders (a torso or detail shot). A head sliced by the top edge reads as a mistake and ruins the section.

{{/if}}' ||
  regexp_replace(user_template, '\{\{#if BG_COLOR\}\}[\s\S]*?\{\{/if\}\}\s*', '', 'g')
WHERE agent_type = 'image'
  AND is_active = true
  AND user_template NOT LIKE '%CFY_BACKDROP_V2%';

-- Verificação: v2 presente, v1 removida, os demais blocos intactos.
SELECT agent_type,
       length(user_template)                       AS user_chars,
       user_template LIKE '%CFY_BACKDROP_V2%'      AS tem_backdrop_v2,
       user_template LIKE '%CFY_BG_COLOR%'         AS ainda_tem_v1,
       user_template LIKE '%CFY_PHOTO_DIRECTION%'  AS tem_direcao_foto,
       system_prompt LIKE '%CFY_NO_TEXT_RULE%'     AS tem_regra_sem_texto
FROM email_agent_configs
WHERE agent_type = 'image' AND is_active = true;
