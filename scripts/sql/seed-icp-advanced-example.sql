-- Seed de exemplo — blocos avançados do Cliente Ideal (Pilar 3)
-- Popula os 5 campos novos (icp_awareness, icp_starving_crowd, icp_unique_mechanism,
-- icp_objections, icp_vocabulary) com o exemplo "Patrícia / Blessed Choice" do HTML
-- de referência, para validar o render pixel-a-pixel da aba Contexto.
--
-- USO: troque o UUID abaixo pelo id da loja-alvo e rode no Supabase Studio.
-- Dollar-quoting ($j$...$j$) evita escapar aspas simples do conteúdo.

update client_stores set
  icp_awareness = $j$
  {
    "dominant": "Solution aware",
    "levels": [
      { "key": "unaware",  "label": "Unaware",       "pct": 5  },
      { "key": "problem",  "label": "Problem aware",  "pct": 25 },
      { "key": "solution", "label": "Solution aware", "pct": 40 },
      { "key": "product",  "label": "Product aware",  "pct": 20 },
      { "key": "most",     "label": "Most aware",     "pct": 10 }
    ],
    "copy_implication": "Tráfego frio do Meta e TikTok já sabe que quer moda cristã, mas não conhece a Blessed Choice. A copy de aquisição precisa nomear a dor específica — **camiseta religiosa com cara de moda** — antes de falar da marca ou da oferta."
  }
  $j$::jsonb,

  icp_starving_crowd = $j$
  {
    "verdict": "Warm",
    "scores": [
      { "key": "urgency",   "label": "Urgência",    "value": 3, "note": "Quer estilo, não precisa amanhã" },
      { "key": "pain_cost", "label": "Custo da dor", "value": 3, "note": "Frustração com bijuteria que escurece" },
      { "key": "frequency", "label": "Frequência",  "value": 4, "note": "Compra com regularidade" },
      { "key": "trend",     "label": "Tendência",   "value": 5, "note": "Moda cristã em alta + TikTok" }
    ],
    "total": 15
  }
  $j$::jsonb,

  icp_unique_mechanism = $j$
  {
    "headline": "Por que a Blessed Choice resolve o que ninguém resolveu",
    "body": "Diferente das marcas tradicionais de moda cristã — que apostam em estética conservadora e preços medianos — e diferente das marcas seculares que ignoram a identidade de fé, a Blessed Choice entrega **camisetas com mensagens contemporâneas em malha premium nacional**, vendidas com frete fixo R$ 9,90 e atendimento humanizado por WhatsApp — para que a cliente leve a fé no corpo sem perder o estilo nem o orçamento."
  }
  $j$::jsonb,

  icp_objections = $j$
  [
    { "objection": "Será que esse tecido é fininho como os baratinhos do Mercado Livre?",
      "treatment": "Mostrar vídeo UGC de cliente real usando após várias lavagens. Detalhar gramatura (160g/m² · malha penteada nacional) e exibir certificado de qualidade." },
    { "objection": "Versículo na camiseta vai parecer 'cara de igreja'?",
      "treatment": "Priorizar fotos de uso real em contextos urbanos — café, trabalho, viagem. UGC com mulheres montando looks com jaqueta, calça jeans, salto." },
    { "objection": "R$ 9,90 de frete + R$ 89 da peça = R$ 99. Não tô achando barato.",
      "treatment": "Comunicar frete grátis acima de R$ 89,90 logo no anúncio. Reforçar que a peça dura 2+ anos em malha premium versus 6 meses do concorrente." },
    { "objection": "E se não servir? Nunca comprei dessa marca.",
      "treatment": "Política de troca em 7 dias visível na página. Tabela de medidas detalhada por modelo. Print de WhatsApp da Bruna respondendo dúvida de tamanho." },
    { "objection": "Vai chegar a tempo? Moro no interior, sempre demora.",
      "treatment": "Prazo real por CEP no checkout. Rastreio automatizado via 17Track. Casos de entrega em 5-7 dias para o Nordeste no destaque do Instagram." }
  ]
  $j$::jsonb,

  icp_vocabulary = $j$
  [
    { "type": "Dor",     "channel": "ad hook",            "quote": "Cansei de comprar camiseta cristã com cara de uniforme de escola dominical." },
    { "type": "Desejo",  "channel": "email subject",      "quote": "Quero uma peça que combine com a minha rotina, não que se imponha a ela." },
    { "type": "Dor",     "channel": "ad hook",            "quote": "As camisetas que acho bonitas geralmente custam o salário inteiro." },
    { "type": "Desejo",  "channel": "email body",         "quote": "Queria que dessem vontade de usar no trabalho — não só no domingo de manhã." },
    { "type": "Objeção", "channel": "email body",         "quote": "Se é barato assim, deve durar duas lavagens e estragar." },
    { "type": "Objeção", "channel": "anúncio · CTA",      "quote": "Frete vai sair mais caro que a camiseta." },
    { "type": "Marca",   "channel": "landing page · hero","quote": "A fé na rotina, não no figurino." },
    { "type": "Marca",   "channel": "email subject",      "quote": "Roupa que veste quem você é antes de você abrir a boca." }
  ]
  $j$::jsonb
where id = '00000000-0000-0000-0000-000000000000'; -- TROQUE pelo store_id real
