-- ============================================================
-- Refinador — viés de RESPIRO AMPLO entre seções
--
-- Pedido: os emails devem ficar mais AREJADOS, com mais espaço entre cada
-- área/seção. O Refinador já tem a camada de spacing (adjust/insert/rhythm),
-- mas o comportamento default era conservador (muitos "none"/valores baixos).
--
-- Esta regra dá um VIÉS: preferir editorial_spaced e valores GENEROSOS,
-- escolhendo sempre o maior quando em dúvida. IMPORTANTE — respeita os tetos
-- do guard (máx ~10 adjusts, máx 6 inserts): empurra o VALOR dos espaçamentos
-- existentes (adjust), NÃO multiplica inserções (que reprovaria o delta em
-- spacing_insert_excede_teto).
--
-- Injeta o bloco dentro de <spacing_rules>. Idempotente via sentinela.
-- ============================================================

UPDATE email_agent_configs
SET system_prompt = regexp_replace(
  system_prompt,
  '</spacing_rules>',
  $B$
<generous_spacing_bias>
VIÉS DE RESPIRO AMPLO (padrão deste projeto): os emails devem ser AREJADOS — priorize espaço em branco generoso ENTRE as seções. Aplique sobre as 3 leis acima:
- Na ausência de sinal explícito de posicionamento íntimo/afiado na Pesquisa & Diagnóstico, escolha a assinatura "editorial_spaced".
- Nos "adjust", use valores GENEROSOS para o respiro entre fases: 64-120px entre seções principais; 90-140px antes de uma troca de contexto (fundo claro↔escuro) e antes de prova social/rodapé. Quando em dúvida entre dois valores, escolha SEMPRE o MAIOR.
- Prefira AUMENTAR o valor dos espaçamentos existentes (adjust) a criar novas inserções — respeite os tetos (máximo ~10 adjusts, 6 inserts). Reserve "insert" para as poucas junções realmente coladas.
- Só devolva spacing "none" quando o email JÁ estiver claramente arejado. Se houver seções coladas (< 40px entre fases), NÃO devolva "none" — abra o respiro.
- O núcleo de conversão comprimido (missão → cupom → CTA) permanece a única exceção intencional a valores baixos.
</generous_spacing_bias>
</spacing_rules>$B$,
  'g'
)
WHERE agent_type = 'refiner'
  AND is_active = true
  AND system_prompt LIKE '%</spacing_rules>%'
  AND system_prompt NOT LIKE '%<generous_spacing_bias>%';
