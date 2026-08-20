-- 20261075 — Cadastro: output_schema dos rodapés (destrava o pool de footer)
--
-- Sintoma (Luxe Lift, Carrinho Abandonado 1, 20/08): a seção `footer` voltou
-- do Montador com `assembled: false, variant_id: null` e o e-mail final saiu
-- SEM link de descadastro — `computeRenderChecks` gravou o issue
-- `compliance` e o e-mail foi pra `ready` assim mesmo.
--
-- Causa: as 4 variantes de rodapé da biblioteca estão com `output_schema`
-- vazio. `variantIsFillable` (guard do pool do Montador) exige schema COM
-- pelo menos uma âncora real no HTML — variante sem isso é exemplo
-- hardcoded que vazaria intacto pro cliente. O guard está certo; o cadastro
-- é que nunca foi feito. As quatro saíam do pool antes do Curador ver,
-- registradas só num `log.warn("chooser.candidates_excluded_unfillable")`.
--
-- A âncora é por EXAMPLE (não por `{{TAG}}`) desde 20/08, então nenhum
-- rodapé precisa ser retagueado: basta o schema com exemplos que casem com
-- o texto que já está no HTML. Cada `example` abaixo foi verificado contra
-- o HTML real da variante — ocorrência ÚNICA no documento e ancoragem
-- confirmada pelo mesmo matcher da geração (`auditSchemaAnchors`).
--
-- Escopo deliberado:
--   · Só os campos que precisam mudar por loja. Os rótulos de link do
--     rodapé (`LINK` ×5, `Link Here` ×6) ficam FORA — são idênticos entre
--     si, e ancorar repetição por irmãos-por-ocorrência é frágil demais
--     pra primeira passada.
--   · `footer 4 - dark` fica SEM schema de propósito: é uma grade de botões
--     sem nenhuma linha de descadastro. Dar schema a ela a tornaria
--     elegível e reproduziria exatamente o e-mail sem unsubscribe.
--   · `body 6/7/8/9` também estão sem schema, mas o HTML delas repete a
--     mesma frase de exemplo várias vezes (`Lorem ipsum…` ×4,
--     `Key Features copy here` ×10) — ancorar exige editar o HTML antes.
--     O pool de body tem 5 elegíveis e não está bloqueando ninguém.
--
-- Guard de idempotência: só escreve onde o schema AINDA está vazio, pra um
-- re-run nunca sobrescrever edição humana feita na aba Componentes.

-- ── footer 1 ──────────────────────────────────────────────────────────
UPDATE email_component_variants
SET output_schema = '[
  {
    "key": "footer_copyright",
    "label": "Linha de copyright",
    "type": "text_short",
    "nature": "copy",
    "example": "Copyright © 2025, Company Name",
    "max_len": 44,
    "required": false,
    "guidance": "Nome da marca e ano. Mantenha o formato ''Copyright © ANO, MARCA''."
  },
  {
    "key": "footer_unsub_text",
    "label": "Frase que antecede o link de descadastro",
    "type": "text_short",
    "nature": "copy",
    "example": "If you would like to unsubscribe, click",
    "max_len": 60,
    "required": false,
    "guidance": "Frase curta no idioma da loja."
  },
  {
    "key": "footer_unsub_label",
    "label": "Rótulo do link de descadastro",
    "type": "text_short",
    "nature": "copy",
    "example": "Unsubscribe",
    "max_len": 20,
    "required": false,
    "guidance": "Use um termo com a raiz ''descadastr'' (ex.: ''Descadastrar''). O check de compliance procura por essa palavra no HTML final."
  }
]'::jsonb,
    updated_at = now()
WHERE name = 'footer 1'
  AND block_type = 'footer'
  AND jsonb_array_length(COALESCE(output_schema, '[]'::jsonb)) = 0;

-- ── footer 2 ──────────────────────────────────────────────────────────
UPDATE email_component_variants
SET output_schema = '[
  {
    "key": "footer_unsub_text",
    "label": "Frase que antecede o link de descadastro",
    "type": "text_short",
    "nature": "copy",
    "example": "No longer want to receive these emails?",
    "max_len": 60,
    "required": false,
    "guidance": "Pergunta curta no idioma da loja."
  },
  {
    "key": "footer_unsub_label",
    "label": "Rótulo do link de descadastro",
    "type": "text_short",
    "nature": "copy",
    "example": "Unsubscribe",
    "max_len": 20,
    "required": false,
    "guidance": "Use um termo com a raiz ''descadastr'' (ex.: ''Descadastrar''). O check de compliance procura por essa palavra no HTML final."
  },
  {
    "key": "footer_copyright",
    "label": "Linha de copyright",
    "type": "text_short",
    "nature": "copy",
    "example": "© 2025 brand name. All rights reserved.",
    "max_len": 60,
    "required": false,
    "guidance": "Ano, nome da marca e reserva de direitos."
  }
]'::jsonb,
    updated_at = now()
WHERE name = 'footer 2'
  AND block_type = 'footer'
  AND jsonb_array_length(COALESCE(output_schema, '[]'::jsonb)) = 0;

-- ── footer 3 - dark ───────────────────────────────────────────────────
UPDATE email_component_variants
SET output_schema = '[
  {
    "key": "footer_address",
    "label": "Endereço legal da empresa",
    "type": "text_short",
    "nature": "copy",
    "example": "85 Great Portland Street, London, United Kingdom W1W 7LT",
    "max_len": 90,
    "required": false,
    "guidance": "Endereço físico da loja em uma linha. Exigido por CAN-SPAM em envio internacional."
  },
  {
    "key": "footer_unsub_text",
    "label": "Frase que antecede o link de descadastro",
    "type": "text_short",
    "nature": "copy",
    "example": "No longer want to receive these emails?",
    "max_len": 60,
    "required": false,
    "guidance": "Pergunta curta no idioma da loja."
  },
  {
    "key": "footer_unsub_label",
    "label": "Rótulo do link de descadastro",
    "type": "text_short",
    "nature": "copy",
    "example": "Unsubscribe",
    "max_len": 20,
    "required": false,
    "guidance": "Use um termo com a raiz ''descadastr'' (ex.: ''Descadastrar''). O check de compliance procura por essa palavra no HTML final."
  },
  {
    "key": "footer_prefs_label",
    "label": "Rótulo do link de preferências",
    "type": "text_short",
    "nature": "copy",
    "example": "Manage my preferences",
    "max_len": 30,
    "required": false,
    "guidance": "Rótulo do link para a central de preferências de e-mail."
  }
]'::jsonb,
    updated_at = now()
WHERE name = 'footer 3 - dark'
  AND block_type = 'footer'
  AND jsonb_array_length(COALESCE(output_schema, '[]'::jsonb)) = 0;
