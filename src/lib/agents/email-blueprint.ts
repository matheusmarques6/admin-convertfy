/**
 * Default email blueprints — fallback constante usada quando o banco
 * (`email_blueprints`) não tem blueprint para o flow_type/email_number.
 *
 * Cada blueprint define a estrutura de blocos do email, o objetivo editorial
 * e hint de subject. O agente Copy usa esses dados pra gerar copy contextual.
 */

export interface BlueprintBlockDef {
  type: string
  label: string
  purpose: string
  needs_image?: boolean
  // Prompt da imagem DESTE bloco (só relevante quando needs_image=true).
  // Editável no popup do editor de blueprints; usado como direção de arte
  // autoritativa na geração da imagem (var IMAGE_BRIEF).
  image_brief?: string | null
}

export interface BlueprintDef {
  objective: string
  messaging: string
  subject_hint: string
  blocks: BlueprintBlockDef[]
}

export const DEFAULT_BLUEPRINTS: Record<
  string,
  Record<number, BlueprintDef>
> = {
  welcome: {
    // Composição padrão universal (welcome 1-8) — fonte canônica
    // espelha a migration 20260627b_welcome_blueprints_default.sql.
    // Usado como fallback quando email_blueprints não tem row pra
    // (welcome, N). Toda loja seedada herda essa estrutura por default.
    1: {
      objective:
        "Boas-vindas + apresentação da marca. Cria pertencimento e desejo no primeiro contato.",
      messaging:
        "Tom aspiracional, foco no universo do público. Apresenta marca + produto-herói + cupom + produtos top.",
      subject_hint: "Bem-vindo(a) à <brand>!",
      blocks: [
        { type: "header", label: "Header", purpose: "Cabeçalho com logo da loja" },
        { type: "hero", label: "Hero", purpose: "Banner aspiracional com produto-herói + headline + CTA", needs_image: true },
        { type: "text", label: "See the World Differently", purpose: "Seção de copy explicando a tese da marca" },
        { type: "coupon", label: "Coupon", purpose: "Cupom de boas-vindas (ex: 10% OFF primeira compra)" },
        { type: "cta", label: "Main CTA", purpose: "CTA principal logo após o cupom" },
        { type: "features", label: "Features Icon Strip", purpose: "Faixa horizontal com 3-4 features (frete, troca, parcelamento)" },
        { type: "products", label: "Product Grid 2x2", purpose: "4 produtos top da loja em grade 2x2" },
        { type: "cta", label: "Main Shop CTA", purpose: "CTA pra explorar a loja completa" },
        { type: "social_proof", label: "Social Proof", purpose: "Número de clientes felizes ou rating médio" },
        { type: "footer", label: "Footer", purpose: "Rodapé padrão com links e copyright" },
      ],
    },
    2: {
      objective:
        "Prova social e razões de escolha. Reforça diferenciais com manchete forte e cupom destacado.",
      messaging:
        "Foco em razões objetivas: por que escolher esta marca. Termina em CTA pra produtos.",
      subject_hint: "Por que escolher a <brand>",
      blocks: [
        { type: "header", label: "Header", purpose: "Cabeçalho com logo" },
        { type: "hero", label: "Hero", purpose: "Banner com produto destaque + CTA interno", needs_image: true },
        { type: "headline", label: "Headline Block", purpose: "Manchete grandona destacada" },
        { type: "text", label: "5 Reasons", purpose: "Seção com 5 razões pra escolher (numeradas)" },
        { type: "coupon", label: "10% OFF Coupon", purpose: "Cupom de 10% OFF" },
        { type: "cta", label: "CTA", purpose: "CTA logo após o cupom" },
        { type: "headline", label: "Section Title", purpose: "Título da seção de produtos" },
        { type: "products", label: "Product Grid 2x2", purpose: "4 produtos em grade 2x2" },
        { type: "cta", label: "Main CTA", purpose: "CTA final pra loja" },
        { type: "footer", label: "Footer", purpose: "Rodapé padrão" },
      ],
    },
    3: {
      objective:
        "Storytelling de fundação da marca. Constrói confiança e humaniza a relação com o cliente.",
      messaging:
        "História da marca em formato card + diferenciais. Tom mais íntimo, narrativo.",
      subject_hint: "A história por trás da <brand>",
      blocks: [
        { type: "header", label: "Header", purpose: "Cabeçalho com logo" },
        { type: "story", label: "Brand Story Card", purpose: "Card com fundação, missão e valores da marca + CTA interno" },
        { type: "text", label: "What Makes Different", purpose: "Seção destacando diferenciais únicos" },
        { type: "coupon", label: "Coupon", purpose: "Cupom de boas-vindas" },
        { type: "cta", label: "CTA", purpose: "CTA após o cupom" },
        { type: "headline", label: "Section Title", purpose: "Título da seção de produtos" },
        { type: "products", label: "Product Grid 2x2", purpose: "4 produtos em grade" },
        { type: "cta", label: "Main CTA", purpose: "CTA final" },
        { type: "footer", label: "Footer", purpose: "Rodapé padrão" },
      ],
    },
    4: {
      objective:
        "Prova social via depoimentos reais. Hero com cupom em destaque, cards de depoimento, badge de avaliação.",
      messaging:
        "Foco em testimonials autênticos + selo de avaliação. Tom de confiança.",
      subject_hint: "Veja o que estão falando da <brand>",
      blocks: [
        { type: "header", label: "Header", purpose: "Cabeçalho com logo" },
        { type: "hero", label: "Hero", purpose: "Hero com fundo destacado", needs_image: true },
        { type: "coupon", label: "Coupon over Hero", purpose: "Cupom destacado em cima do hero" },
        { type: "cta", label: "Top CTA orange", purpose: "CTA laranja logo após o cupom" },
        { type: "features", label: "Features Icon Strip", purpose: "Strip de features com ícones" },
        { type: "headline", label: "Testimonials Headline", purpose: "Título da seção de depoimentos" },
        { type: "testimonials", label: "Testimonial Cards", purpose: "2-3 cards com quotes de clientes (autor + texto + rating)" },
        { type: "social_proof", label: "Review Badge", purpose: "Selo de avaliação (4.8/5 stars com X avaliações)" },
        { type: "cta", label: "Final CTA", purpose: "CTA final pra explorar a loja" },
        { type: "footer", label: "Footer", purpose: "Rodapé padrão" },
      ],
    },
    5: {
      objective:
        "Diferenciação via comparação direta com concorrentes. Mostra superioridade de forma objetiva.",
      messaging:
        "Tabela comparativa <brand> vs outras lojas. Tom direto, factual.",
      subject_hint: "<brand> vs outras lojas — você decide",
      blocks: [
        { type: "header", label: "Header", purpose: "Cabeçalho com logo" },
        { type: "headline", label: "Headline Block", purpose: "Manchete principal da comparação" },
        { type: "headline", label: "OZORIC Label", purpose: "Label de marca destacado" },
        { type: "comparison", label: "Comparison Section", purpose: "Tabela com 4-6 linhas comparando atributos (preço, prazo, qualidade)" },
        { type: "coupon", label: "Coupon", purpose: "Cupom de boas-vindas" },
        { type: "cta", label: "CTA", purpose: "CTA após cupom" },
        { type: "products", label: "Product Grid 2x2", purpose: "4 produtos em grade" },
        { type: "cta", label: "Main CTA", purpose: "CTA final" },
        { type: "footer", label: "Footer", purpose: "Rodapé padrão" },
      ],
    },
    6: {
      objective:
        "Última chamada com urgência forte: prazo de 12h. Combina prova social + escassez + cupom.",
      messaging:
        "Tom de urgência leve mas firme. Mostra clientes recentes, escassez, tempo restante.",
      subject_hint: "Últimas 12 horas: seu cupom está expirando",
      blocks: [
        { type: "header", label: "Header", purpose: "Cabeçalho com logo" },
        { type: "hero", label: "Hero", purpose: "Hero com produto destaque", needs_image: true },
        { type: "social_proof", label: "412 Customers Block", purpose: "Bloco mostrando número de clientes recentes" },
        { type: "urgency", label: "Scarcity Line", purpose: "Linha curta de escassez" },
        { type: "coupon", label: "Coupon", purpose: "Cupom com prazo de expiração" },
        { type: "cta", label: "CTA", purpose: "CTA após o cupom" },
        { type: "testimonials", label: "Testimonial Cards", purpose: "Cards de depoimentos pra reforçar confiança" },
        { type: "urgency", label: "Expiration Urgency Block", purpose: "Bloco de urgência destacado (countdown)" },
        { type: "cta", label: "CTA", purpose: "CTA final urgente" },
        { type: "features", label: "Features Icon Strip", purpose: "Features pra reforçar valor" },
        { type: "footer", label: "Footer", purpose: "Rodapé padrão" },
      ],
    },
    7: {
      objective:
        "Última chance — formato curto e direto. Foco total no cupom expirando.",
      messaging:
        "Email enxuto: só cupom + CTA. Tom de urgência máxima.",
      subject_hint: "Última chance — seu cupom expira hoje",
      blocks: [
        { type: "header", label: "Header", purpose: "Cabeçalho com logo" },
        { type: "coupon", label: "Coupon", purpose: "Cupom com prazo expirando" },
        { type: "cta", label: "CTA", purpose: "CTA urgente pra resgatar" },
        { type: "footer", label: "Footer", purpose: "Rodapé padrão" },
      ],
    },
    8: {
      objective:
        "Carta pessoal do fundador. Quebra padrão visual com formato puramente textual.",
      messaging:
        "Tom íntimo, formato carta. Sem CTAs comerciais — só conexão humana.",
      subject_hint: "Uma mensagem pessoal pra você",
      blocks: [
        { type: "letter", label: "Letter Card", purpose: "Carta pessoal do fundador (greeting + body longo + assinatura)" },
        { type: "footer", label: "Plain Footer Line", purpose: "Footer simples, sem links, só copyright minimalista" },
      ],
    },
  },

  abandoned_cart: {
    // Composição padrão universal (abandoned_cart 1-8) — fonte canônica
    // espelha 20260627d_abandoned_cart_blueprints_default.sql.
    1: {
      objective:
        "Primeiro lembrete amigável do carrinho com brinde/incentivo. Tom acolhedor, sem pressão.",
      messaging:
        "Hero do produto abandonado + produtos + cupom-brinde + review pra confiança + fechamento textual.",
      subject_hint: "Você esqueceu algo no carrinho 🎁",
      blocks: [
        { type: "hero", label: "Hero", purpose: "Hero com produto abandonado em destaque", needs_image: true },
        { type: "products", label: "Produtos", purpose: "Produtos do carrinho abandonado" },
        { type: "coupon", label: "Cupom", purpose: "Cupom-brinde (\"golden gift\") pra fechar a compra" },
        { type: "testimonials", label: "Review", purpose: "Cards de review/depoimento pra reforçar confiança" },
        { type: "text", label: "Texto", purpose: "Texto de fechamento amigável" },
        { type: "footer", label: "Rodapé padrão", purpose: "Rodapé padrão" },
      ],
    },
    2: {
      objective:
        "Check-in pessoal e curto. Pergunta se ficou alguma dúvida — formato conversa, sem CTAs.",
      messaging:
        "Email textual minimalista. Tom de atendimento humano, oferta de ajuda.",
      subject_hint: "Tudo certo por aí?",
      blocks: [
        { type: "text", label: "Texto", purpose: "Texto único de check-in (pergunta amigável: \"posso ajudar com algo?\"). Sem CTAs comerciais." },
      ],
    },
    3: {
      objective:
        "Cria sensação de \"pedido prestes a sair\" pra acelerar decisão. Tom de antecipação positiva.",
      messaging:
        "Hero com energia + produtos do carrinho + cupom + produtos extras + trust badges.",
      subject_hint: "Estamos preparando seu pedido...",
      blocks: [
        { type: "hero", label: "Hero", purpose: "Hero com energia de envio (caixa, embalagem, prep)", needs_image: true },
        { type: "products", label: "Produtos", purpose: "Produtos do carrinho abandonado" },
        { type: "coupon", label: "Cupom", purpose: "Cupom pra fechar a compra antes do prazo" },
        { type: "text", label: "Texto", purpose: "Texto explicativo sobre o pedido / prazo" },
        { type: "products", label: "Produtos", purpose: "Sugestões complementares pra adicionar ao pedido" },
        { type: "features", label: "Trust Badges", purpose: "Selos de confiança (frete, troca, pagamento seguro)" },
        { type: "footer", label: "Rodapé padrão", purpose: "Rodapé padrão" },
      ],
    },
    4: {
      objective:
        "Frete grátis como gatilho principal. Combina hero + produtos + prova social + review.",
      messaging:
        "Hero destacando frete grátis + produtos + CTA + trust badges + social proof + texto + review.",
      subject_hint: "Frete grátis pra você — só hoje",
      blocks: [
        { type: "hero", label: "Hero", purpose: "Hero destacando frete grátis", needs_image: true },
        { type: "products", label: "Produtos", purpose: "Produtos do carrinho" },
        { type: "cta", label: "CTA", purpose: "CTA pra resgatar frete grátis" },
        { type: "features", label: "Trust Badges", purpose: "Selos de confiança" },
        { type: "social_proof", label: "Social Proof", purpose: "Contagem de clientes ou rating médio" },
        { type: "text", label: "Texto", purpose: "Texto curto reforçando o benefício de frete grátis" },
        { type: "testimonials", label: "Review", purpose: "Cards de review de clientes" },
        { type: "footer", label: "Rodapé padrão", purpose: "Rodapé padrão" },
      ],
    },
    5: {
      objective:
        "Cupom de 10% como última chance antes de subir desconto. Inclui produtos do carrinho + similares.",
      messaging:
        "Hero + texto introdutório + cupom 10% + produtos do carrinho + produtos similares + reforço + trust badges.",
      subject_hint: "Última chance — 10% OFF no seu carrinho",
      blocks: [
        { type: "hero", label: "Hero", purpose: "Hero com produto e tom de urgência leve", needs_image: true },
        { type: "text", label: "Texto", purpose: "Texto introdutório explicando a oferta de 10%" },
        { type: "coupon", label: "Cupom", purpose: "Cupom de 10% OFF" },
        { type: "products", label: "Produtos", purpose: "Produtos do carrinho abandonado" },
        { type: "products", label: "Produtos", purpose: "Produtos similares ou complementares" },
        { type: "text", label: "Texto", purpose: "Texto reforçando urgência / prazo do cupom" },
        { type: "features", label: "Trust Badges", purpose: "Selos de confiança" },
        { type: "footer", label: "Rodapé padrão", purpose: "Rodapé padrão" },
      ],
    },
    6: {
      objective:
        "Urgência forte com janela de 12 horas. Foco em fechar antes do cupom expirar.",
      messaging:
        "Hero + texto urgência + produtos + cupom + trust + reforço + sugestões extras.",
      subject_hint: "Últimas 12 horas pro seu carrinho",
      blocks: [
        { type: "hero", label: "Hero", purpose: "Hero com tom de urgência (12 horas)", needs_image: true },
        { type: "text", label: "Texto", purpose: "Texto curto destacando o prazo de 12h" },
        { type: "products", label: "Produtos", purpose: "Produtos do carrinho" },
        { type: "coupon", label: "Cupom", purpose: "Cupom com expiração em 12h" },
        { type: "features", label: "Trust Badges", purpose: "Selos de confiança" },
        { type: "text", label: "Texto", purpose: "Texto reforçando escassez/urgência" },
        { type: "products", label: "Produtos", purpose: "Produtos complementares pra adicionar" },
        { type: "footer", label: "Rodapé padrão", purpose: "Rodapé padrão" },
      ],
    },
    7: {
      objective:
        "Aviso final com cupom de 12% (último escalonamento de desconto). Foco em prova social pra desfazer dúvida.",
      messaging:
        "Hero + produtos + cupom 12% + social proof + review + sugestões complementares.",
      subject_hint: "Aviso final — 12% OFF",
      blocks: [
        { type: "hero", label: "Hero", purpose: "Hero com tom de aviso final", needs_image: true },
        { type: "products", label: "Produtos", purpose: "Produtos do carrinho" },
        { type: "coupon", label: "Cupom", purpose: "Cupom de 12% OFF (último escalonamento)" },
        { type: "social_proof", label: "Social Proof", purpose: "Contagem de clientes ou rating" },
        { type: "testimonials", label: "Review", purpose: "Cards de review pra desfazer dúvida" },
        { type: "products", label: "Produtos", purpose: "Produtos complementares" },
        { type: "footer", label: "Rodapé padrão", purpose: "Rodapé padrão" },
      ],
    },
    8: {
      objective:
        "Último lembrete em formato textual curto + cupom destacado. Tom enxuto — só o essencial pra resgatar.",
      messaging:
        "Texto curto de despedida amigável + cupom destacado como código final. Sem hero, sem produtos.",
      subject_hint: "Último aviso — seu código",
      blocks: [
        { type: "text", label: "Texto", purpose: "Texto curto de lembrete final amigável (\"última oportunidade pra usar seu desconto\")" },
        { type: "coupon", label: "Cupom", purpose: "Cupom final destacado com código (ex: BACK15) e validade" },
      ],
    },
  },

  site_abandoned: {
    // Composição padrão universal (site_abandoned 1) — fonte canônica
    // espelha 20260627i_site_abandoned_blueprints_default.sql.
    1: {
      objective:
        "Reengajar visitante que saiu do site sem interagir. Tom convidativo + incentivo via cupom.",
      messaging:
        "Hero com tom de \"sentimos sua falta\" + cupom + produtos + trust badges + texto de fechamento.",
      subject_hint: "Sentimos sua falta — volta a dar uma olhada",
      blocks: [
        { type: "hero", label: "Hero", purpose: "Hero convidativo com produto ou lifestyle da marca", needs_image: true },
        { type: "coupon", label: "Cupom", purpose: "Cupom incentivo pra voltar e fechar a compra" },
        { type: "products", label: "Produtos", purpose: "Best-sellers ou produtos navegados/recomendados" },
        { type: "features", label: "Trust Badges", purpose: "Strip de selos de confiança (frete, garantia, troca)" },
        { type: "text", label: "Texto", purpose: "Texto de fechamento amigável + tom da marca" },
        { type: "footer", label: "Rodapé padrão", purpose: "Rodapé padrão" },
      ],
    },
  },

  browse_abandonment: {
    // Composição padrão universal (browse_abandonment 1-5) — fonte
    // canônica espelha 20260627c_browse_abandonment_blueprints_default.sql.
    1: {
      objective:
        "Reengajar visitante que navegou produtos sem comprar. Tom amigável, sem pressão.",
      messaging:
        "Lembrete suave do produto visto. Hero com produto + cupom + CTA pra voltar.",
      subject_hint: "Algo chamou sua atenção?",
      blocks: [
        { type: "header", label: "Header / Logo", purpose: "Cabeçalho com logo da loja" },
        { type: "hero", label: "Hero", purpose: "Hero com produto que o visitante navegou + headline + CTA interno", needs_image: true },
        { type: "coupon", label: "Cupom", purpose: "Cupom incentivo pra fechar a compra" },
        { type: "cta", label: "CTA", purpose: "CTA logo após o cupom" },
        { type: "products", label: "Produtos", purpose: "Produtos navegados + similares" },
        { type: "cta", label: "CTA", purpose: "CTA final pra explorar produtos" },
        { type: "footer", label: "Footer", purpose: "Rodapé padrão" },
      ],
    },
    2: {
      objective:
        "Segundo toque com razões objetivas pra decidir. Foca em desfazer dúvidas.",
      messaging:
        "Hero + produtos + cupom + 3 razões pra escolher + urgência leve.",
      subject_hint: "Ainda pensando naqueles produtos?",
      blocks: [
        { type: "hero", label: "Hero", purpose: "Hero com produto navegado em destaque", needs_image: true },
        { type: "products", label: "Produtos", purpose: "Produtos navegados ou recomendados" },
        { type: "coupon", label: "Cupom", purpose: "Cupom de incentivo" },
        { type: "cta", label: "CTA", purpose: "CTA após cupom" },
        { type: "text", label: "3 Reasons", purpose: "Seção com 3 razões objetivas pra escolher (qualidade, garantia, prazo)" },
        { type: "urgency", label: "Box Urgência", purpose: "Bloco destacado de urgência (estoque limitado ou cupom expirando)" },
        { type: "cta", label: "CTA", purpose: "CTA final urgente" },
        { type: "footer", label: "Footer", purpose: "Rodapé padrão" },
      ],
    },
    3: {
      objective:
        "Terceiro toque com urgência maior + prova social. Reward + review + fechamento emocional.",
      messaging:
        "Barra de urgência + recompensa + cupom + cards de review + texto de fechamento.",
      subject_hint: "Seu produto está esperando por você",
      blocks: [
        { type: "hero", label: "Hero", purpose: "Hero com produto em destaque", needs_image: true },
        { type: "urgency", label: "Barra de Urgência", purpose: "Barra fina de urgência no topo (últimas unidades ou countdown)" },
        { type: "text", label: "Reward", purpose: "Bloco de recompensa/bônus pra incentivar a compra (frete grátis, brinde, etc.)" },
        { type: "coupon", label: "Cupom", purpose: "Cupom de desconto com código" },
        { type: "cta", label: "CTA", purpose: "CTA após cupom" },
        { type: "products", label: "Produtos", purpose: "Produtos navegados ou similares" },
        { type: "testimonials", label: "Review", purpose: "Cards de review/depoimento de clientes que compraram" },
        { type: "text", label: "Fechamento", purpose: "Texto curto de fechamento emocional pra reforçar urgência" },
        { type: "cta", label: "CTA", purpose: "CTA final" },
        { type: "footer", label: "Footer", purpose: "Rodapé padrão" },
      ],
    },
    4: {
      objective:
        "Surpresa positiva pra reativar lead frio. Tom leve, foco em produto + trust badges.",
      messaging:
        "Formato curto: hero + produtos + selos de confiança. Sem cupom — só lembrança visual.",
      subject_hint: "Surpresa pra você",
      blocks: [
        { type: "header", label: "Header / Logo", purpose: "Cabeçalho com logo" },
        { type: "hero", label: "Hero", purpose: "Hero com produto novo ou destaque surpresa", needs_image: true },
        { type: "products", label: "Produtos", purpose: "Produtos navegados ou novidades" },
        { type: "features", label: "Trust Badges", purpose: "Strip de selos de confiança (frete grátis, troca grátis, pagamento seguro)" },
        { type: "footer", label: "Footer", purpose: "Rodapé padrão" },
      ],
    },
    5: {
      objective:
        "Última tentativa de reengajamento. Foco em produto + trust badges, sem cupom.",
      messaging:
        "Mesmo formato do E4 (hero + produtos + trust badges) mas com tom de última chamada.",
      subject_hint: "Última chance — não perca essa oportunidade",
      blocks: [
        { type: "header", label: "Header / Logo", purpose: "Cabeçalho com logo" },
        { type: "hero", label: "Hero", purpose: "Hero com produto em destaque (tom de última chance)", needs_image: true },
        { type: "products", label: "Produtos", purpose: "Produtos navegados ou recomendados" },
        { type: "features", label: "Trust Badges", purpose: "Strip de selos de confiança" },
        { type: "footer", label: "Footer", purpose: "Rodapé padrão" },
      ],
    },
  },

  upsell: {
    // Composição padrão universal (upsell 1-4) — fonte canônica
    // espelha 20260627e_upsell_blueprints_default.sql.
    1: {
      objective:
        "Apresenta a próxima compra como continuação natural. Combina prova social forte + desconto destacado + countdown.",
      messaging:
        "Hero + stats + pílula de oferta + manchete de desconto + cupom + reviews + rating + produtos + countdown + reforço de coupon+cta + urgência de fechamento.",
      subject_hint: "Seu próximo par está esperando",
      blocks: [
        { type: "header", label: "Header", purpose: "Cabeçalho com logo da loja" },
        { type: "hero", label: "Hero Section", purpose: "Hero com produto destaque + headline de continuação", needs_image: true },
        { type: "social_proof", label: "Stat Block", purpose: "Bloco com estatística forte (ex: \"412 clientes recompraram esta semana\")" },
        { type: "urgency", label: "Exclusive Offer Pill", purpose: "Pílula/label destacada com tom de exclusividade (ex: \"OFERTA EXCLUSIVA\")" },
        { type: "headline", label: "17% OFF Big Visual", purpose: "Manchete grandona com o desconto destacado (ex: \"17% OFF\")" },
        { type: "cta", label: "CTA", purpose: "CTA principal logo após o desconto" },
        { type: "coupon", label: "Coupon Block", purpose: "Cartão de cupom com código" },
        { type: "headline", label: "Reviews Section Header", purpose: "Título da seção de depoimentos" },
        { type: "testimonials", label: "4 Testimonial Cards", purpose: "Até 4 cards de depoimento (autor + quote + rating)" },
        { type: "social_proof", label: "Big Rating Badge", purpose: "Selo de rating grandão (ex: \"4.9/5 com 1.2k avaliações\")" },
        { type: "products", label: "Product Grid 2x2", purpose: "4 produtos recomendados em grade 2x2" },
        { type: "urgency", label: "Countdown Block", purpose: "Bloco de countdown com prazo do cupom" },
        { type: "coupon", label: "Coupon", purpose: "Cupom de reforço próximo do fim" },
        { type: "cta", label: "CTA", purpose: "CTA logo após o cupom de reforço" },
        { type: "urgency", label: "Closing Urgency", purpose: "Bloco de urgência de fechamento (última chamada)" },
        { type: "footer", label: "Footer", purpose: "Rodapé padrão" },
      ],
    },
    2: {
      objective:
        "Reforço do desconto com countdown vivo. Combina cupom + lembrete + benefícios + visual grandão.",
      messaging:
        "Hero + cupom + CTA hero + reminder + countdown + cupom + CTA + benefícios + 17% OFF visual + produtos + CTA + social proof.",
      subject_hint: "17% OFF expira em breve",
      blocks: [
        { type: "header", label: "Header", purpose: "Cabeçalho com logo" },
        { type: "hero", label: "Hero Section", purpose: "Hero com produto destaque", needs_image: true },
        { type: "coupon", label: "Coupon Block", purpose: "Cupom destacado no topo" },
        { type: "cta", label: "CTA Hero", purpose: "CTA principal do hero" },
        { type: "text", label: "Reminder Section", purpose: "Seção de lembrete explicando a oferta" },
        { type: "urgency", label: "Countdown Live", purpose: "Countdown vivo com tempo restante" },
        { type: "coupon", label: "Coupon", purpose: "Cupom de reforço" },
        { type: "cta", label: "CTA", purpose: "CTA após cupom" },
        { type: "features", label: "Benefits", purpose: "Strip de benefícios (frete, garantia, troca)" },
        { type: "headline", label: "17% OFF Big Visual", purpose: "Manchete grandona com o desconto destacado" },
        { type: "products", label: "Product Grid 2x2", purpose: "4 produtos em grade 2x2" },
        { type: "cta", label: "CTA", purpose: "CTA final após produtos" },
        { type: "social_proof", label: "Social Proof Block", purpose: "Bloco de prova social (contagem ou rating)" },
        { type: "footer", label: "Footer", purpose: "Rodapé padrão" },
      ],
    },
    3: {
      objective:
        "Última chance hoje. Tom de urgência máxima com 2 blocos de \"last chance\" cercando produtos.",
      messaging:
        "Hero + last chance + cupom + CTA + produtos + features + last chance + CTA final.",
      subject_hint: "Última chance — expira hoje",
      blocks: [
        { type: "header", label: "Header", purpose: "Cabeçalho com logo" },
        { type: "hero", label: "Hero Section", purpose: "Hero com tom de última chamada", needs_image: true },
        { type: "urgency", label: "Last Chance Big Block", purpose: "Bloco grandão de última chance (destaque vermelho/laranja)" },
        { type: "coupon", label: "Coupon Block", purpose: "Cupom expirando hoje" },
        { type: "cta", label: "CTA", purpose: "CTA após cupom" },
        { type: "products", label: "Product Grid 2x2", purpose: "4 produtos em grade" },
        { type: "features", label: "Features Icon Strip", purpose: "Strip de features (selos de confiança)" },
        { type: "urgency", label: "Last Chance Block", purpose: "Segundo bloco de last chance (reforço)" },
        { type: "cta", label: "Final CTA", purpose: "CTA final urgente" },
        { type: "footer", label: "Footer", purpose: "Rodapé padrão" },
      ],
    },
    4: {
      objective:
        "Carta pessoal de fechamento. Quebra padrão comercial pra reconectar emocionalmente.",
      messaging:
        "Letter card único — tom íntimo, sem CTAs comerciais.",
      subject_hint: "Uma mensagem pessoal pra você",
      blocks: [
        { type: "letter", label: "Letter Card", purpose: "Carta pessoal do fundador (greeting + body longo + assinatura)" },
      ],
    },
  },

  win_back: {
    // Composição padrão universal (win_back 1-3) — fonte canônica
    // espelha 20260627g_win_back_blueprints_default.sql.
    1: {
      objective:
        "Reativar cliente inativo com tom emocional + novidades. Sem cupom — foco em saudade e curiosidade.",
      messaging:
        "Hero emocional + novidades da loja + produtos + prova social via testimonials + urgência de fechamento.",
      subject_hint: "Sentimos sua falta",
      blocks: [
        { type: "header", label: "Header", purpose: "Cabeçalho com logo da loja" },
        { type: "hero", label: "Hero Section", purpose: "Hero emocional com tom de \"sentimos sua falta\"", needs_image: true },
        { type: "cta", label: "Hero CTA", purpose: "CTA principal logo após o hero" },
        { type: "text", label: "What's New Block", purpose: "Seção de novidades da loja desde a última visita do cliente" },
        { type: "cta", label: "Shop New Arrivals CTA", purpose: "CTA pra explorar as novidades" },
        { type: "products", label: "Product Grid 2 Produtos", purpose: "Grade com 2 produtos destaque (novidades ou best-sellers)" },
        { type: "testimonials", label: "Customers Who Didn't Wait Section", purpose: "Cards de testimonials de clientes que voltaram e compraram (autor + quote + rating)" },
        { type: "urgency", label: "Closing Urgency", purpose: "Bloco de urgência de fechamento (última chamada)" },
        { type: "cta", label: "CTA", purpose: "CTA após urgência" },
        { type: "features", label: "Features Icon Strip", purpose: "Strip de features (frete, garantia, troca)" },
        { type: "footer", label: "Footer", purpose: "Rodapé padrão" },
      ],
    },
    2: {
      objective:
        "Segundo toque com cupom de 15% + countdown de 48h. Tom de oferta exclusiva pra retorno.",
      messaging:
        "Hero + cupom 15% + CTA hero + urgência 48h + benefícios + título + produtos + CTA final.",
      subject_hint: "Sentimos sua falta — 15% OFF",
      blocks: [
        { type: "header", label: "Header", purpose: "Cabeçalho com logo" },
        { type: "hero", label: "Hero Section", purpose: "Hero com tom de retorno + 15% OFF destacado", needs_image: true },
        { type: "coupon", label: "Coupon Block", purpose: "Cupom de 15% OFF" },
        { type: "cta", label: "Hero CTA", purpose: "CTA principal do hero" },
        { type: "urgency", label: "48h Remaining Block", purpose: "Bloco destacado com countdown de 48 horas" },
        { type: "features", label: "Features Icon Strip", purpose: "Strip de features (frete, garantia, troca)" },
        { type: "headline", label: "Section Title", purpose: "Título da seção de produtos" },
        { type: "products", label: "Product Grid 2x2", purpose: "4 produtos em grade 2x2" },
        { type: "cta", label: "CTA Final", purpose: "CTA final urgente pra resgatar antes do prazo" },
        { type: "footer", label: "Footer", purpose: "Rodapé padrão" },
      ],
    },
    3: {
      objective:
        "Carta pessoal de fechamento. Quebra padrão comercial pra reconectar emocionalmente após 2 tentativas comerciais.",
      messaging:
        "Letter card único — tom íntimo, sem CTAs comerciais.",
      subject_hint: "Uma mensagem pessoal pra você",
      blocks: [
        { type: "letter", label: "Letter Card", purpose: "Carta pessoal do fundador (greeting + body longo + assinatura)" },
      ],
    },
  },

  shipping_stages: {
    // Composição padrão universal (shipping_stages 1-5) — fonte canônica
    // espelha 20260627h_shipping_stages_blueprints_default.sql.
    //
    // IMPORTANTE: blocos transacionais (Order Details, Totais) não são
    // preenchidos pelo agente Copy. São renderizados pelo Omnisend com
    // variáveis Liquid ({{order.number}}, {{order.total}}, etc).
    // O `purpose` documenta isso explicitamente — o agente Copy deve
    // pular esses blocos (gerar conteúdo vazio).
    1: {
      objective:
        "Confirmação de pagamento recebido. Tom de tranquilidade — pedido em andamento.",
      messaging:
        "Hero confirmando + order details (Omnisend) + produtos + totais (Omnisend) + trust badges + texto agradecimento.",
      subject_hint: "Pagamento confirmado — seu pedido está sendo preparado",
      blocks: [
        { type: "hero", label: "Hero", purpose: "Hero confirmando pagamento (ex: \"HAS BEEN APPROVED\")", needs_image: true },
        { type: "text", label: "Order Details", purpose: "Placeholder Omnisend — bloco transacional. Renderizado com variáveis tipo {{order.number}}, {{order.date}}, {{order.shipping_address}}. IA NÃO gera conteúdo aqui." },
        { type: "products", label: "Produtos", purpose: "Lista de produtos do pedido (preenchido pelo Omnisend com {{order.items}})" },
        { type: "text", label: "Totais", purpose: "Placeholder Omnisend — totais do pedido. Variáveis tipo {{order.subtotal}}, {{order.shipping_cost}}, {{order.discount}}, {{order.total}}. IA NÃO gera conteúdo aqui." },
        { type: "features", label: "Trust Badges", purpose: "Strip de selos de confiança (\"tem alguma dúvida?\" / \"trocas e devoluções\")" },
        { type: "text", label: "Texto", purpose: "Texto de agradecimento + próximos passos (este sim a IA preenche, com tom da marca)" },
        { type: "footer", label: "Rodapé padrão", purpose: "Rodapé padrão" },
      ],
    },
    2: {
      objective:
        "Pedido em separação no estoque. Tom de progresso — engajamento + upsell sutil.",
      messaging:
        "Hero \"in preparation\" + order details (Omnisend) + produtos + totais (Omnisend) + trust badges + texto + sugestões de produtos.",
      subject_hint: "Seu pedido está em separação",
      blocks: [
        { type: "hero", label: "Hero", purpose: "Hero indicando \"IS IN PREPARATION\"", needs_image: true },
        { type: "text", label: "Order Details", purpose: "Placeholder Omnisend — bloco transacional. Variáveis {{order.number}}, {{order.date}}, {{order.shipping_address}}. IA NÃO gera conteúdo aqui." },
        { type: "products", label: "Produtos", purpose: "Lista de produtos do pedido (preenchido pelo Omnisend com {{order.items}})" },
        { type: "text", label: "Totais", purpose: "Placeholder Omnisend — totais do pedido. Variáveis {{order.subtotal}}, {{order.shipping_cost}}, {{order.discount}}, {{order.total}}. IA NÃO gera conteúdo aqui." },
        { type: "features", label: "Trust Badges", purpose: "Strip de selos de confiança" },
        { type: "text", label: "Texto", purpose: "Texto explicando o status \"em separação\" + tempo estimado (IA preenche com tom da marca)" },
        { type: "products", label: "Produtos", purpose: "Sugestões de produtos complementares (upsell sutil)" },
        { type: "footer", label: "Rodapé padrão", purpose: "Rodapé padrão" },
      ],
    },
    3: {
      objective:
        "Pedido coletado pela transportadora. Tom de progresso — pedido a caminho.",
      messaging:
        "Hero \"transporter\" + order details (Omnisend) + produtos + totais (Omnisend) + trust badges + texto + sugestões.",
      subject_hint: "Seu pedido foi coletado pela transportadora",
      blocks: [
        { type: "hero", label: "Hero", purpose: "Hero indicando \"TRANSPORTER\" / em coleta", needs_image: true },
        { type: "text", label: "Order Details", purpose: "Placeholder Omnisend — bloco transacional. Variáveis {{order.number}}, {{order.tracking_code}}, {{order.tracking_url}}. IA NÃO gera conteúdo aqui." },
        { type: "products", label: "Produtos", purpose: "Lista de produtos do pedido (preenchido pelo Omnisend com {{order.items}})" },
        { type: "text", label: "Totais", purpose: "Placeholder Omnisend — totais do pedido. Variáveis {{order.subtotal}}, {{order.shipping_cost}}, {{order.discount}}, {{order.total}}. IA NÃO gera conteúdo aqui." },
        { type: "features", label: "Trust Badges", purpose: "Strip de selos de confiança" },
        { type: "text", label: "Texto", purpose: "Texto explicando \"em coleta\" + ETA (IA preenche com tom da marca)" },
        { type: "products", label: "Produtos", purpose: "Sugestões de produtos complementares" },
        { type: "footer", label: "Rodapé padrão", purpose: "Rodapé padrão" },
      ],
    },
    4: {
      objective:
        "Aviso de atraso na entrega. Tom de transparência e empatia — só comunicação operacional.",
      messaging:
        "Email textual minimalista — apenas a comunicação do atraso + próximos passos. Sem produtos, sem upsell.",
      subject_hint: "Aviso importante sobre seu pedido",
      blocks: [
        { type: "text", label: "Texto", purpose: "Texto único explicando o atraso + nova previsão de entrega + canais de suporte. Pode incluir variáveis Omnisend tipo {{order.number}}, {{order.tracking_url}}, {{order.new_eta}}. IA preenche tom + estrutura editorial; placeholders Omnisend ficam inline no texto." },
      ],
    },
    5: {
      objective:
        "Pedido enviado com código de rastreio. Tom de comemoração — produto a caminho.",
      messaging:
        "Hero \"shipped\" + CTA pra rastreio + order details (Omnisend) + produtos + totais (Omnisend) + trust badges + texto + sugestões.",
      subject_hint: "Seu pedido foi enviado 🚚",
      blocks: [
        { type: "hero", label: "Hero", purpose: "Hero indicando \"SHIPPED\" / pedido a caminho", needs_image: true },
        { type: "cta", label: "CTA", purpose: "CTA \"TRACK ORDER\" linkando pra rastreamento (link usa {{order.tracking_url}})" },
        { type: "text", label: "Order Details", purpose: "Placeholder Omnisend — bloco transacional. Variáveis {{order.number}}, {{order.tracking_code}}, {{order.tracking_url}}, {{order.estimated_delivery}}. IA NÃO gera conteúdo aqui." },
        { type: "products", label: "Produtos", purpose: "Lista de produtos do pedido (preenchido pelo Omnisend com {{order.items}})" },
        { type: "text", label: "Totais", purpose: "Placeholder Omnisend — totais do pedido. Variáveis {{order.subtotal}}, {{order.shipping_cost}}, {{order.discount}}, {{order.total}}. IA NÃO gera conteúdo aqui." },
        { type: "features", label: "Trust Badges", purpose: "Strip de selos de confiança" },
        { type: "text", label: "Texto", purpose: "Texto explicando o envio + ETA + dicas pra rastrear (IA preenche com tom da marca)" },
        { type: "products", label: "Produtos", purpose: "Sugestões de produtos complementares" },
        { type: "footer", label: "Rodapé padrão", purpose: "Rodapé padrão" },
      ],
    },
  },

  post_purchase: {
    1: {
      objective: "Agradecer pela compra e reforçar confiança",
      messaging: "Obrigado pela compra, suporte disponível, conteúdo de uso do produto",
      subject_hint: "Obrigado pela compra! Confira dicas exclusivas",
      blocks: [
        { type: "text", label: "Texto", purpose: "Agradecimento e dicas do produto" },
        { type: "cta", label: "CTA", purpose: "Suporte ou FAQ" },
        { type: "footer", label: "Rodapé", purpose: "Rodapé padrão" },
      ],
    },
  },
}
