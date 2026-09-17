/**
 * Fixture REAL: batch 6249aef2 (Hero Boxers · Welcome 1, 11/09/2026), lido de
 * `email_generation_runs.parsed_output` das runs `seletor` e `estruturador`
 * em 14/09. É o batch de referência do plano de evolução do pipeline
 * (`docs/email-generation/execucao-plano-pipeline-set2026.md`): 3 das 6
 * posições saíram contrárias à decisão.
 *
 * Os textos de `papel`/`porque`/`adaptacao` foram encurtados à primeira
 * frase; o que os testes leem — `requisitos`, `descartes`, `section`,
 * `fio_narrativo`, o alvo com as 28 proibições em dois idiomas e os 11
 * insumos — está íntegro.
 */

import type { AlvoDoEmail } from "../../objecoes/vocabulario"
import type { EstruturadorOutput } from "../../estruturador/estruturador-prompt"

export const ALVO_HERO_BOXERS_W1: AlvoDoEmail = {
  modo: "quebra_de_objecao",
  trabalhos_fixos: ["entrega_de_incentivo", "prova_secundaria", "remocao_de_risco"],
  alvos: [
    {
      id: "obj_1",
      ordem: 1,
      primaria: true,
      objecao: "I've never heard of this brand and the site looks small — I'm not sure I trust it with my card.",
      tipo_de_risco: "seguranca",
      tratamento: "Surface real buyer testimonials with age and body context alongside visible secure-payment badge and plain-language return policy",
      aliviador_pedido: "reputacao_da_loja",
      profundidade_de_prova: "afirmacao",
    },
  ],
  medos_alvo: [],
  promessa_a_pagar: null,
  criterio_de_selecao: "O contrato exige a dominante da categoria e obj_1 é a única marcada assim.",
  dimensao_confianca: "integridade",
  angulo_do_tratamento: [
    { ordem: 1, veiculo: "origem_da_marca", papel: "nomear a lacuna que a marca existe para fechar", insumo_disponivel: true },
    { ordem: 2, veiculo: "mecanismo_unico", papel: "mostrar que a marca sabe o que está fazendo", insumo_disponivel: "parcial" },
  ],
  suspeita_a_antecipar: "Nunca ouvi falar dessa marca, o site parece pequeno e estão pedindo $60 por uma cueca — isso é golpe ou dropshipping?",
  ja_atacadas: [],
  proibido_neste_toque: [
    "história longa da fundação (profundidade tem toque próprio)",
    "pedido de engajamento paralelo (rede social, preferências) — um pedido só",
    "urgência artificial",
    "esgotar os argumentos — uma objeção só, bem atacada",
    "condição nova no incentivo",
    "Ad copy references 'Buy 5 & Get 5 FREE' and 'Offer Ends Soon' in historical inactive ads, but no currently active offer, code, or confirmed conditions appear in the research. Do not use any incentive claim until the client confirms an active promotion with exact code, value, and expiry.",
    "Claim '83% more resistant' sourced from ad copy testimonial (Jeff C.), not independent test. Flag for verification before use in email. Cut engineering described from brand thesis; specific pattern details unverified.",
    "No on-site quality-control statement found in research. Cannot fully confirm without checking product page copy.",
    "No shipping SLA, carrier information, or tracking policy found in the research material. Cannot assert the brand is outside this fear without evidence.",
    "Shipping described as 'personalizado por região' but no explicit statement about all-in pricing or duty disclosure found. Do not use until confirmed.",
    "No support channel, response time, or contact policy mentioned in any research field. Cannot assert the brand is outside this fear.",
    "Shopify security is platform-level and verifiable, but the brand should display trust badges explicitly on checkout to activate this reassurance for the buyer.",
    "Policy described in brand thesis as a goal, not confirmed as live on site. Verify return policy page exists and matches these terms before using in email.",
    "No long founding story — brand origin in two sentences at most, depth has its own touch",
    "No parallel engagement ask (social follow, preference center) — one CTA only",
    "No artificial urgency, countdown or 'offer ends soon'",
    "No stacking arguments — attack obj_1 only; do not open price, sizing or shipping as separate objections",
    "No new condition attached to the incentive",
    "No incentive claim, code, value or expiry until the client confirms an active promotion — 'Buy 5 & Get 5 FREE' is from inactive ads",
    "No '83% more resistant' claim — it is a customer testimonial quoted in ad copy, not an independent test",
    "No specific cut-pattern or engineering details beyond the brand thesis (waistband above the abdomen, leg opening that doesn't ride up)",
    "No quality-control or inspection claims — none found in research",
    "No shipping SLA, carrier, tracking or delivery-time promise",
    "No all-in pricing, duty or 'no hidden fees' claim",
    "No support-channel or response-time promise",
    "Do not assert secure payment as the brand's own achievement — attribute it to Shopify's PCI-compliant checkout, and do not invent trust badges that aren't on the page",
    "No return or exchange terms stated as policy (window, 'free', 'no questions asked') until the live policy page is verified — at most, say the brand's stance is that a wrong fit is not the customer's problem, without numbers",
    "No fabricated testimonial names, ages or quotes — use only testimonials that actually exist on the site, or refer to them generically",
    "Do not invent the 'age and body context' of reviewers if the research doesn't contain actual quotes with that context",
  ],
  alerta_de_lastro: "obj_1 tem lastro NÃO verificado e nenhuma objeção do catálogo tem lastro verificado.",
  razao: "Quem acabou de assinar não sabe se pode confiar o cartão a uma marca pequena que nunca viu.",
  lacuna: null,
  incentivo: { existe: null, codigo: null, valor: null },
  insumos_permitidos: [
    "Store runs on Shopify — PCI-compliant checkout and SSL by default (pesquisa: plataforma)",
    "Brand sells its own proprietary bamboo boxer design, no third-party resellers (pesquisa: medos de categoria)",
    "Real buyer testimonials are published on the site (catálogo: lastro obj_1)",
    "Customer testimonials describe a concrete day-to-day fit difference — waistband that doesn't dig, fabric that doesn't ride up (catálogo: lastro obj_4)",
    "Hero Boxers was built for men over 50 whose bodies no longer match the generic mold underwear is cut for (pesquisa: origem_da_marca)",
    "Sizing up at a department store adds fabric in the legs but keeps the same tight waistband (pesquisa: origem_da_marca)",
    "Bamboo fibre construction — softer against skin than cotton, naturally moisture-wicking (produto: descrição / mecanismo_unico)",
    "Cut designed for a body with a belly: waistband sits above the abdomen, leg opening proportioned to avoid riding up during a full day of sitting (pesquisa: diferencial — as brand thesis, not measured spec)",
    "Bamboo Fibre Boxer Shorts — $59.90 (produto: catálogo)",
    "Premium Bamboo Fibre Socks — $31.98 (produto: catálogo)",
    "Brand positions durability and fit as the justification for price (catálogo: lastro obj_2)",
  ],
  contradicoes: [
    {
      motivo: "tratamento_sem_insumo",
      detalhe: "o tratamento pede política de troca/devolução e este toque proíbe afirmá-la — falta o dado na loja (ficha operacional)",
    },
  ],
} as unknown as AlvoDoEmail

export const ESTRUTURADOR_HERO_BOXERS_W1: EstruturadorOutput = {
  diagnostico: {
    alvo_id: "obj_1",
    referencia_base: "avelmore-inspecao-antecipada",
    traducao_do_mecanismo: "A referência #1 é UM argumento monotemático que atravessa três blocos em papéis diferentes.",
  },
  estrutura: [
    {
      section: "hero",
      papel: "Absorve o header. Entrega da promessa SEM incentivo: boas-vindas + a tese da marca em uma linha + CTA dominante único.",
      porque: "Quem abriu o e-mail precisa nos primeiros segundos de um motivo para não fechar.",
      referencia: "avelmore-inspecao-antecipada",
      adaptacao: "Na amostra o hero entregava o cupom prometido no opt-in. Aqui o incentivo é desconhecido, então o slot de cupom sai.",
      requisitos: {
        dispositivo: "abertura_editorial",
        cta: true, cupom: false, preco: null, avaliacao: null, n_itens: null, campos: [],
        imagem: "uso real: homem 50+ com barriga, cintura do boxer assentada acima do abdômen, luz natural",
        exige: ["curto", "sem oferta, sem código, sem prazo", "tese em texto real, não só na imagem"],
      },
    },
    {
      section: "body",
      papel: "O pivô: tese que dá à marca desconhecida um motivo de existir. Três itens escaneáveis.",
      porque: "Uma marca sem nome só deixa de parecer suspeita quando o leitor entende para que ela foi feita.",
      referencia: "avelmore-inspecao-antecipada",
      requisitos: {
        dispositivo: "lista_enumerada",
        cta: null, cupom: false, preco: null, avaliacao: null, n_itens: { min: 3, max: 3 }, campos: ["categoria", "mecanismo"], imagem: null,
        exige: ["curto", "títulos que contam a história sozinhos", "itens de naturezas distintas: lacuna / desenho / efeito no dia", "sem história de fundação", "sem spec medida nem '83%'", "CTA secundário, não disputa com o hero"],
      },
    },
    {
      section: "body",
      papel: "Faixa de remoção de risco do CANAL em 3 itens, fundo contrastante: checkout seguro (Shopify), desenho próprio vendido direto, postura sobre caimento.",
      porque: "Ticket de $60 por uma peça de roupa íntima de marca desconhecida: remoção de risco sobe para antes do preço.",
      referencia: "avelmore-inspecao-antecipada",
      requisitos: {
        dispositivo: "remocao_de_risco",
        cta: null, cupom: false, preco: null, avaliacao: null, n_itens: { min: 3, max: 3 }, campos: ["garantia", "selo_nomeado"], imagem: null,
        exige: ["curto", "fundo contrastante / isolamento visual", "segurança de pagamento atribuída ao Shopify, não à marca", "sem número de dias, sem 'grátis', sem 'sem perguntas' na troca", "sem prazo de entrega, sem transportadora", "sem selo que não exista na página"],
      },
    },
    {
      section: "reviews",
      papel: "Prova de terceiro ANTES da vitrine: 2 depoimentos reais do site.",
      porque: "prova_secundaria é trabalho fixo deste toque e esta é a única voz externa do e-mail.",
      referencia: "avelmore-inspecao-antecipada",
      requisitos: {
        dispositivo: "prova_por_relato",
        cta: null, cupom: false, preco: null, avaliacao: null, n_itens: { min: 2, max: 2 }, campos: ["nome", "contexto"], imagem: null,
        exige: ["somente depoimentos que existam no site — nada fabricado", "idade e contexto de corpo só se constarem no depoimento real", "citação curta que nomeie a mudança física", "CTA secundário se a variante tiver"],
      },
    },
    {
      section: "products",
      papel: "Aterrissar a tese em objeto comprável: 2 cards — Bamboo Fibre Boxer Shorts ($59.90) e Premium Bamboo Fibre Socks ($31.98) — com preço visível e botão por produto.",
      porque: "A grade é a saída de quem já decidiu; o preço na cara revela posicionamento.",
      referencia: "avelmore-inspecao-antecipada",
      requisitos: {
        dispositivo: "vitrine_paralela",
        cta: true, cupom: false, preco: true, avaliacao: null, n_itens: { min: 2, max: 2 }, campos: ["preco", "nome"],
        imagem: "produto em uso ou vestido em corpo adulto real, não flat em fundo branco",
        exige: ["exatamente 2 produtos: boxer + meias", "preço em texto real", "sem avaliação nos cards (biblioteca não tem)", "sem menção a bundle 'Buy 5 & Get 5'"],
      },
    },
    {
      section: "footer",
      papel: "Rota para quem não clicou em nada: logo + navegação por categoria + suporte.",
      porque: "Saída padrão; a única adaptação é a poda pelo lastro.",
      referencia: "avelmore-inspecao-antecipada",
      requisitos: {
        dispositivo: "menu_de_saida",
        cta: null, cupom: false, preco: null, avaliacao: null, n_itens: null, campos: ["categoria"], imagem: null,
        exige: ["sem credencial de tempo de mercado (não verificada)", "sem promessa de tempo de resposta do suporte", "sem pedido de seguir rede social"],
      },
    },
  ],
  fio_narrativo: "você foi visto: cueca feita para o corpo que você tem hoje → por isso essa marca existe e é assim que ela veste → o cartão está protegido pelo checkout do Shopify, o desenho é nosso, e caimento errado não é problema seu → quem já comprou confirma que funciona no dia → dois produtos, preço na cara, escolhe.",
  fontes: [
    { ref: "avelmore-inspecao-antecipada", o_que_pegou: "O esqueleto inteiro.", porque: "É a única referência que serve a intenção welcome-1." },
    { ref: "medicube-comparacao-categoria", o_que_pegou: "Nada como bloco — apenas o inventário de medos de canal.", porque: "A comparação fica reservada para o #5." },
  ],
  aprendizados_aplicados: [
    { slug: "prova-de-terceiro-antes-do-cta", como: "Reviews posicionado antes da grade de produtos." },
    { slug: "posicao-muda-o-efeito-do-dispositivo", como: "Recusei a comparação categoria-vs-loja no 1º toque." },
    { slug: "um-cta-dominante-em-email-curto", como: "CTA do hero é o dominante." },
  ],
  text_only: false,
  descartes: [
    { origem: "modelo", section: "offer", dispositivo: "codigo_entregue", papel_na_referencia: "Incentivo como fechamento do argumento / entrega do cupom no hero", porque: "Incentivo desconhecido — a decisão proíbe afirmar oferta, código ou prazo até o cliente confirmar." },
    { origem: "modelo", section: "body", dispositivo: "comparacao_pareada", papel_na_referencia: "Comparação categoria-vs-loja (medicube-comparacao-categoria), sugerida pela própria referência #1 para objeção de canal", porque: "Bloco defensivo no 1º toque cria a dúvida que pretende curar." },
    { origem: "modelo", section: "products", dispositivo: "vitrine_paralela", papel_na_referencia: "Grade 2×2 com avaliação por card (prova distribuída)", porque: "Catálogo é um produto + meias; 4 cards iguais leriam como loja vazia. Biblioteca não tem card com avaliação." },
    { origem: "modelo", section: "body", dispositivo: "remocao_de_risco", papel_na_referencia: "Item de garantia com política de devolução em linguagem simples", porque: "A política não foi verificada como página viva." },
    { origem: "modelo", section: "footer", dispositivo: "menu_de_saida", papel_na_referencia: "Credencial discreta de tempo de mercado", porque: "Nenhum dado de tempo de mercado verificado na pesquisa." },
  ],
}
