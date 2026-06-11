/**
 * Gera o rascunho default do email a partir da sugestão (port do
 * buildCampaignEmail do mockup). Estrutura por tipo de sugestão; o COO
 * edita tudo no builder depois.
 */

import type { CampaignSuggestion, EmailDraft, EmailDraftBlock } from "@/types/campaign-central"

let counter = 0
export function newBlockId(): string {
  counter += 1
  return `b${counter}_${Math.random().toString(36).slice(2, 6)}`
}

export function defaultBlock(type: EmailDraftBlock["type"]): EmailDraftBlock {
  const base = { id: newBlockId(), type }
  switch (type) {
    case "heading":
      return { ...base, headline: "Título do bloco", sub: "Subtítulo de apoio" }
    case "text":
      return { ...base, value: "Escreva o texto deste bloco aqui." }
    case "image":
      return { ...base, caption: "imagem · 600×280" }
    case "offer":
      return { ...base, value: "🎁 Oferta em destaque" }
    case "button":
      return { ...base, value: "Clique aqui" }
    case "footer":
      return { ...base, value: "Rodapé do email." }
    case "products":
      return {
        ...base,
        columns: 3,
        items: [
          { name: "Produto 1", price: "R$ —" },
          { name: "Produto 2", price: "R$ —" },
          { name: "Produto 3", price: "R$ —" },
        ],
      }
    default:
      return base
  }
}

const TEMPLATE_BY_TYPE: Record<
  string,
  { headline: string; sub: string; text: string; offer: string; cta: string }
> = {
  data: {
    headline: "A data mais esperada está chegando",
    sub: "Garanta o seu antes que acabe",
    text: "Ainda dá tempo de presentear (ou se presentear). Separamos uma curadoria especial com entrega garantida — escolha o seu favorito em poucos cliques.",
    offer: "🚚 Frete grátis nas compras acima de R$ 199 · só esta semana",
    cta: "Ver seleção de presentes",
  },
  tema: {
    headline: "A tendência que está em todo lugar",
    sub: "Chegou na nossa loja",
    text: "Você viu por aí e agora pode ter. Montamos um kit completo pensando em quem quer entrar na onda sem complicação.",
    offer: "✨ Kit completo com 15% OFF + brinde exclusivo",
    cta: "Quero conferir",
  },
  email: {
    headline: "A seleção da semana",
    sub: "Os queridinhos que estão voando",
    text: "Reunimos os produtos que mais saíram nos últimos dias. Mas atenção: o estoque está acabando rápido.",
    offer: "⏳ Condição válida só por 48h",
    cta: "Ver agora",
  },
  performance: {
    headline: "A gente sentiu sua falta",
    sub: "E preparamos algo especial",
    text: "Faz um tempo que você não aparece — e mudou muita coisa por aqui. Que tal dar uma olhada no que separamos pra você?",
    offer: "🎁 15% de boas-vindas de volta · cupom VOLTEI",
    cta: "Voltar a comprar",
  },
}

export function buildDefaultDraft(s: CampaignSuggestion): EmailDraft {
  const t = TEMPLATE_BY_TYPE[s.type] ?? TEMPLATE_BY_TYPE.email
  return {
    subject: s.subject ?? "",
    strategy: s.angle ?? "",
    preheader: `${t.sub} — aproveite enquanto dá tempo.`,
    blocks: [
      { id: newBlockId(), type: "image", caption: "imagem do produto · 600×280" },
      { id: newBlockId(), type: "heading", headline: t.headline, sub: t.sub },
      { id: newBlockId(), type: "text", value: t.text },
      { id: newBlockId(), type: "offer", value: t.offer },
      { id: newBlockId(), type: "button", value: t.cta },
      {
        id: newBlockId(),
        type: "footer",
        value:
          "Você recebe este email porque é cliente da {{loja}}. Para não receber mais, cancele a inscrição.",
      },
    ],
  }
}
