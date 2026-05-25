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
    1: {
      objective: "Dar boas-vindas e apresentar a marca",
      messaging:
        "Agradecer a inscrição, mostrar diferencial, oferecer cupom, apresentar produtos top",
      subject_hint: "Bem-vindo(a)! Seu presente de boas-vindas está aqui",
      blocks: [
        {
          type: "hero",
          label: "Hero",
          purpose: "Banner de boas-vindas com imagem da marca",
          needs_image: true,
        },
        {
          type: "text",
          label: "Texto",
          purpose: "Apresentação da marca e diferencial",
        },
        {
          type: "coupon",
          label: "Cupom",
          purpose: "Cupom de primeira compra",
        },
        {
          type: "products",
          label: "Produtos",
          purpose: "Top 3-4 produtos da loja",
        },
        {
          type: "footer",
          label: "Rodapé",
          purpose: "Links de navegação e redes sociais",
        },
      ],
    },
    2: {
      objective: "Reforçar proposta de valor e criar urgência",
      messaging:
        "Lembrar do cupom, mostrar benefícios exclusivos, destacar depoimentos ou diferenciais",
      subject_hint: "Você esqueceu algo especial...",
      blocks: [
        { type: "hero", label: "Hero", purpose: "Reforço visual da marca", needs_image: true },
        { type: "text", label: "Texto", purpose: "Benefícios de ser cliente" },
        { type: "coupon", label: "Cupom", purpose: "Lembrete do cupom de boas-vindas" },
        { type: "footer", label: "Rodapé", purpose: "Rodapé padrão" },
      ],
    },
    3: {
      objective: "Aprofundar conhecimento de marca e gerar confiança",
      messaging: "Contar a história da marca, mostrar bastidores, apresentar valores",
      subject_hint: "Conheça quem está por trás da marca",
      blocks: [
        { type: "hero", label: "Hero", purpose: "Imagem editorial / storytelling", needs_image: true },
        { type: "text", label: "Texto", purpose: "História e valores da marca" },
        { type: "cta", label: "CTA", purpose: "Convite para explorar a loja" },
        { type: "footer", label: "Rodapé", purpose: "Rodapé padrão" },
      ],
    },
    4: {
      objective: "Educação de produto e cross-sell",
      messaging: "Mostrar produtos complementares, dicas de uso, conteúdo educativo",
      subject_hint: "Dicas exclusivas para você",
      blocks: [
        { type: "text", label: "Texto", purpose: "Dicas e educação de produto" },
        { type: "products", label: "Produtos", purpose: "Produtos recomendados" },
        { type: "footer", label: "Rodapé", purpose: "Rodapé padrão" },
      ],
    },
    5: {
      objective: "Último empurrão com urgência",
      messaging: "Cupom expirando, escassez, prova social",
      subject_hint: "Última chance: seu cupom está expirando!",
      blocks: [
        { type: "hero", label: "Hero", purpose: "Visual de urgência", needs_image: true },
        { type: "text", label: "Texto", purpose: "Mensagem de urgência" },
        { type: "coupon", label: "Cupom", purpose: "Cupom com prazo final" },
        { type: "footer", label: "Rodapé", purpose: "Rodapé padrão" },
      ],
    },
    6: {
      objective: "Engajar com lifestyle e comunidade",
      messaging: "Conteúdo de lifestyle, dicas, comunidade da marca",
      subject_hint: "Faça parte da nossa comunidade",
      blocks: [
        { type: "text", label: "Texto", purpose: "Convite para a comunidade" },
        { type: "cta", label: "CTA", purpose: "Link para redes sociais" },
        { type: "footer", label: "Rodapé", purpose: "Rodapé padrão" },
      ],
    },
    7: {
      objective: "Recompra e fidelização",
      messaging: "Incentivo para segunda compra, programa de fidelidade",
      subject_hint: "Um agradecimento especial de volta",
      blocks: [
        { type: "text", label: "Texto", purpose: "Agradecimento e convite de recompra" },
        { type: "products", label: "Produtos", purpose: "Novidades ou best-sellers" },
        { type: "footer", label: "Rodapé", purpose: "Rodapé padrão" },
      ],
    },
    8: {
      objective: "Feedback e NPS",
      messaging: "Pedir avaliação, feedback, incentivar review",
      subject_hint: "Conte pra gente: como está sendo a experiência?",
      blocks: [
        { type: "text", label: "Texto", purpose: "Pedido de feedback" },
        { type: "cta", label: "CTA", purpose: "Link para pesquisa" },
        { type: "footer", label: "Rodapé", purpose: "Rodapé padrão" },
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
    1: {
      objective: "Mostrar produtos que o visitante navegou",
      messaging: "Personalização com produtos vistos, recomendação complementar",
      subject_hint: "Vimos que você gostou de...",
      blocks: [
        { type: "text", label: "Texto", purpose: "Referência à navegação recente" },
        { type: "products", label: "Produtos", purpose: "Produtos navegados + similares" },
        { type: "cta", label: "CTA", purpose: "Continuar comprando" },
        { type: "footer", label: "Rodapé", purpose: "Rodapé padrão" },
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
