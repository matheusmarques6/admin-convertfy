-- ============================================================
-- Blueprint Agent — estrutura PRÉ-EXTRAÍDA das tags canônicas
--
-- Com os HTML references usando o vocabulário canônico de tags {{TAG}}
-- (docs/email-reference-tags.md + tag-registry.ts), a ESTRUTURA do blueprint
-- (número/ordem/type dos blocos, needs_image, copy_spec) passa a ser extraída
-- DETERMINISTICAMENTE em código (reference-structure.ts) e imposta sobre o
-- output do LLM (applySkeletonToBlueprint). O LLM fica responsável só pelos
-- campos criativos: label, purpose, image_brief, objective, messaging,
-- subject_hint.
--
-- Esta migration:
--  1) Anexa ao system_prompt a regra da estrutura pré-extraída.
--  2) Anexa ao user_template o bloco <estrutura_extraida> (var nova, vazia
--     em references legados — nesse caso nada muda no comportamento).
--
-- Idempotente via sentinelas.
-- ============================================================

-- 1) system_prompt
UPDATE email_agent_configs
SET system_prompt = system_prompt || $RULE$

ESTRUTURA PRÉ-EXTRAÍDA (tags canônicas): quando o input contiver um bloco <estrutura_extraida> NÃO-VAZIO, a estrutura já foi derivada deterministicamente das tags {{TAG}} do HTML — número, ordem e type dos blocos e o copy_spec por bloco JÁ ESTÃO DECIDIDOS e serão impostos por código. Nesse caso: NÃO re-derive a estrutura nem a geometria; gere "blocks" EXATAMENTE na mesma ordem, quantidade e type da estrutura pré-extraída, preenchendo para cada bloco apenas label (nome específico), purpose (2-3 frases concretas de diretiva de copy) e image_brief (só onde needs_image=true), além de objective, messaging e subject_hint. Pode omitir copy_spec nesses blocos (será sobrescrito). Se <estrutura_extraida> estiver vazio, siga o fluxo normal (extraia a estrutura do HTML como sempre).$RULE$
WHERE agent_type = 'blueprint'
  AND is_active = true
  AND system_prompt NOT LIKE '%ESTRUTURA PRÉ-EXTRAÍDA (tags canônicas)%';

-- 2) user_template
UPDATE email_agent_configs
SET user_template = user_template || $TPL$

<estrutura_extraida>
{{estrutura_extraida}}
</estrutura_extraida>$TPL$
WHERE agent_type = 'blueprint'
  AND is_active = true
  AND user_template NOT LIKE '%estrutura_extraida%';
