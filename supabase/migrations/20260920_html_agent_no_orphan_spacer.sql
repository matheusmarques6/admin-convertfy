-- ============================================================
-- HTML Agent — Proibir spacer <div> orfao (append ao prompt ativo)
--
-- Defeito observado em prod (Luxe Lift, Welcome 1, jul/2026): o agente
-- injeta spacers como `</tr><div style="height:64px"></div><tr>` — uma
-- <div> como filha DIRETA de <table>. Isso e' HTML invalido: pela regra
-- de parsing do HTML5 (foster parenting), o navegador/cliente de email
-- move a <div> para ANTES da tabela, empilhando um GAP de espaco vazio
-- no TOPO do email (hero deslocado pra baixo).
--
-- No email da Luxe Lift eram 5 divs (64+16+16+80+96 = 272px) empurradas
-- pro topo. A rede de seguranca deterministica (fixOrphanSpacerDivs em
-- html.chain.ts) ja converte no render; este append reforca no PROMPT
-- para o modelo nao gerar em primeiro lugar.
--
-- Mesmo padrao da 20260817/20260820: APPEND ao prompt ATIVO, idempotente
-- via sentinela (`<no_orphan_spacer_div>`).
-- ============================================================

UPDATE email_agent_configs
SET system_prompt = system_prompt || $RULES$

<no_orphan_spacer_div>
NEVER place a <div> (or any non-table element) as a direct child of <table>, for example `</tr><div style="height:64px"></div><tr>`. This is invalid HTML: email clients foster-parent the stray element to the TOP of the email, creating a blank gap and pushing the hero down.
- To add vertical space BETWEEN blocks, use a table row: `<tr><td style="height:Npx;line-height:Npx;font-size:0;mso-line-height-rule:exactly;">&nbsp;</td></tr>`.
- Or add padding to the adjacent cell.
- Between </tr> and <tr>, ONLY <tr>...</tr> or HTML comments may appear. Never a <div>, <p>, <span>, or text node.
</no_orphan_spacer_div>$RULES$
WHERE agent_type = 'html'
  AND is_active = true
  AND system_prompt NOT LIKE '%<no_orphan_spacer_div>%';
