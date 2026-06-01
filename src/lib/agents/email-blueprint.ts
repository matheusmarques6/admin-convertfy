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
    1: {
      objective: "Lembrar do carrinho abandonado com urgência leve",
      messaging: "Produto esperando, link direto pro checkout, imagem do produto",
      subject_hint: "Esqueceu algo no carrinho?",
      blocks: [
        { type: "hero", label: "Hero", purpose: "Imagem do produto abandonado", needs_image: true },
        { type: "text", label: "Texto", purpose: "Lembrete amigável do carrinho" },
        { type: "cta", label: "CTA", purpose: "Voltar ao checkout" },
        { type: "footer", label: "Rodapé", purpose: "Rodapé padrão" },
      ],
    },
  },

  site_abandoned: {
    1: {
      objective: "Reengajar visitante que saiu do site",
      messaging: "Destacar best-sellers, criar curiosidade, oferecer incentivo sutil",
      subject_hint: "Sentimos sua falta! Confira as novidades",
      blocks: [
        { type: "text", label: "Texto", purpose: "Mensagem de re-engajamento" },
        { type: "products", label: "Produtos", purpose: "Best-sellers da loja" },
        { type: "footer", label: "Rodapé", purpose: "Rodapé padrão" },
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
    1: {
      objective: "Cross-sell pós-compra",
      messaging: "Produtos complementares à compra recente, dicas de uso",
      subject_hint: "Combine com sua compra recente",
      blocks: [
        { type: "text", label: "Texto", purpose: "Agradecimento e sugestão" },
        { type: "products", label: "Produtos", purpose: "Produtos complementares" },
        { type: "footer", label: "Rodapé", purpose: "Rodapé padrão" },
      ],
    },
  },

  win_back: {
    1: {
      objective: "Reativar cliente inativo",
      messaging: "Saudade, novidades, incentivo de retorno, cupom exclusivo",
      subject_hint: "Faz tempo que não nos vemos...",
      blocks: [
        { type: "hero", label: "Hero", purpose: "Imagem emocional de retorno", needs_image: true },
        { type: "text", label: "Texto", purpose: "Mensagem de saudade e novidades" },
        { type: "coupon", label: "Cupom", purpose: "Cupom de retorno exclusivo" },
        { type: "products", label: "Produtos", purpose: "Novidades da loja" },
        { type: "footer", label: "Rodapé", purpose: "Rodapé padrão" },
      ],
    },
  },

  shipping_stages: {
    1: {
      objective: "Confirmar pagamento recebido",
      messaging: "Confirmação de pagamento, próximos passos, prazo estimado",
      subject_hint: "Pagamento confirmado! Seu pedido está a caminho",
      blocks: [
        { type: "text", label: "Texto", purpose: "Confirmação de pagamento e próximos passos" },
        { type: "cta", label: "CTA", purpose: "Acompanhar pedido" },
        { type: "footer", label: "Rodapé", purpose: "Rodapé padrão" },
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
