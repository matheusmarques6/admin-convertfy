/**
 * Identidade visual dos agentes do pipeline AE + helpers de label.
 * Fonte ÚNICA — UI da página de logs (`/admin/settings/email-generation-logs`)
 * e qualquer outro consumidor que precise renderizar agente de forma consistente.
 *
 * Cores replicam a maquete `Logs_de_Geração_de_Emails_Abordagem_A`.
 */

export type PipelineAgentKey =
  | "copy"
  | "catalogador"
  | "seletor"
  | "estruturador"
  | "blueprint"
  | "subject"
  | "assembler_chooser"
  | "assembler"
  | "image"
  // Cadeia de formatação (split do HTML agent, migration 20261039).
  | "hero_section"
  | "copy_merge"
  | "copy_fit"
  | "merge_verifier"
  | "text_format"
  | "image_format"
  | "typography"
  | "color_format"
  | "background_fit"
  | "html"
  | "refiner"
  | "qa"
  | "qavision"
  | "seed"
  | "copy_dispatch"
  | "campaign_image"

export interface AgentVisual {
  name: string
  desc: string
  color: string
  bg: string
  border: string
  /** true = roda em provedor externo (n8n). Custos não rastreados. */
  external?: boolean
  /** kind dita ícone/representação de tokens. */
  kind: "texto" | "imagem" | "externo" | "sistema"
}

export const AGENT_VISUAL: Record<PipelineAgentKey, AgentVisual> = {
  copy: {
    name: "Copy",
    desc: "Subject, preheader e copy de cada bloco · roda fora (n8n)",
    color: "#9CA3AF",
    bg: "#F3F4F6",
    border: "#E5E7EB",
    external: true,
    kind: "externo",
  },
  catalogador: {
    name: "Catalogador",
    desc: "Catálogo de argumento da loja: objeções tipadas por risco/aliviador com lastro, veículos, medos, incentivo (1× por pesquisa)",
    color: "#7C2D12",
    bg: "#FFF7ED",
    border: "#FDBA74",
    kind: "texto",
  },
  seletor: {
    name: "Seletor",
    desc: "Decide o alvo do toque — qual objeção este email ataca, aliviador e profundidade (roda antes do Estruturador; modo shadow/on)",
    color: "#9A3412",
    bg: "#FFEDD5",
    border: "#FDBA74",
    kind: "texto",
  },
  estruturador: {
    name: "Estruturador",
    desc: "Decide a estrutura adaptada à loja a partir do material do vault (modo shadow/on)",
    color: "#0E7490",
    bg: "#ECFEFF",
    border: "#A5F3FC",
    kind: "texto",
  },
  blueprint: {
    name: "Blueprint",
    desc: "Estrutura do email — determinístico (variantes) ou LLM fallback",
    color: "#4E62D8",
    bg: "#EEF0FB",
    border: "#C7CDEF",
    kind: "texto",
  },
  subject: {
    name: "Assunto",
    desc: "Subject hint + messaging da loja (rota determinística do blueprint)",
    color: "#4E62D8",
    bg: "#EEF0FB",
    border: "#C7CDEF",
    kind: "texto",
  },
  assembler_chooser: {
    name: "Curador",
    desc: "Escolhe a variante de cada bloco pela descrição (passo A)",
    color: "#4E62D8",
    bg: "#EEF0FB",
    border: "#C7CDEF",
    kind: "texto",
  },
  assembler: {
    name: "Montador",
    desc: "Escolhe 1 entre os finalistas do Curador (passo B); desligado, o rank 1 vai direto para a montagem por código",
    color: "#2137B6",
    bg: "#EEF0FB",
    border: "#C7CDEF",
    kind: "texto",
  },
  image: {
    name: "Image",
    desc: "Gera imagens hero/banner — máx 3 por email",
    color: "#7C3AED",
    bg: "#F3E8FF",
    border: "#E0CBFF",
    kind: "imagem",
  },
  hero_section: {
    name: "Hero Section",
    desc: "Monta a hero da variante escolhida — imagem, copy, identidade, logo",
    color: "#D97706",
    bg: "#FFFBEB",
    border: "#FDE68A",
    kind: "texto",
  },
  copy_merge: {
    name: "Merge de Copy",
    desc: "Casa o example do schema com a frase real do HTML e escreve por splice — código, custo zero",
    color: "#0F766E",
    bg: "#F0FDFA",
    border: "#99F6E4",
    kind: "texto",
  },
  background_fit: {
    name: "Fundo no Tamanho",
    desc: "Faixa chapada + foto no tamanho que o td declara (background-size) — código, custo zero",
    color: "#0F766E",
    bg: "#F0FDFA",
    border: "#99F6E4",
    kind: "sistema",
  },
  copy_fit: {
    name: "Encurtador de Copy",
    desc: "Reescreve os campos que o n8n devolveu acima do limite da caixa — só eles, e o código decide se a reescrita entra",
    color: "#B45309",
    bg: "#FFFBEB",
    border: "#FDE68A",
    kind: "texto",
  },
  // LEGADO (20/08): o merge por example matou a fila de exceção e o
  // verificador junto. A entrada fica para renderizar runs históricas —
  // mesmo tratamento de html/refiner.
  merge_verifier: {
    name: "Verificador de Merge (legado)",
    desc: "Substituído pelo merge por example — auditava a fila do agente de exceção",
    color: "#4338CA",
    bg: "#EEF2FF",
    border: "#C7D2FE",
    kind: "texto",
  },
  text_format: {
    name: "Formatação de Texto",
    desc: "Pulado quando o merge por example cobre o blueprint — full-doc só p/ documento legado sem schema",
    color: "#B45309",
    bg: "#FFFBEB",
    border: "#FDE68A",
    kind: "texto",
  },
  image_format: {
    name: "Formatação de Imagem",
    desc: "Escreve as imagens nos tokens URL_* do HTML — determinístico, sem LLM",
    color: "#92400E",
    bg: "#FFFBEB",
    border: "#FDE68A",
    kind: "texto",
  },
  typography: {
    name: "Tipografia",
    desc: "Decide onde o email rompe a tipografia — família, peso, caixa e espaçamento",
    color: "#0F766E",
    bg: "#F0FDFA",
    border: "#99F6E4",
    kind: "texto",
  },
  color_format: {
    name: "Cores & Botões",
    desc: "Conforma cores e botões à identidade — substitui o Refinador",
    color: "#BE185D",
    bg: "#FDF2F8",
    border: "#FBCFE8",
    kind: "texto",
  },
  html: {
    name: "HTML (legado)",
    desc: "Agente monolítico substituído pela cadeia de formatação",
    color: "#D97706",
    bg: "#FFFBEB",
    border: "#FDE68A",
    kind: "texto",
  },
  refiner: {
    name: "Refinador (legado)",
    desc: "Substituído pelo agente Cores & Botões",
    color: "#BE185D",
    bg: "#FDF2F8",
    border: "#FBCFE8",
    kind: "texto",
  },
  qa: {
    name: "QA",
    desc: "Spam score, links, blocos vazios, tom, compliance",
    color: "#065F46",
    bg: "#ECFDF5",
    border: "#A7F3D0",
    kind: "texto",
  },
  qavision: {
    name: "QA Vision",
    desc: "Valida imagem hero — paleta, overlay, cena (default OFF)",
    color: "#059669",
    bg: "#ECFDF5",
    border: "#A7F3D0",
    kind: "texto",
  },
  seed: {
    name: "Seed",
    desc: "Watchdog — recovery e enfileiramento",
    color: "#71778A",
    bg: "#F3F4F6",
    border: "#E5E7EB",
    kind: "sistema",
  },
  copy_dispatch: {
    name: "Dispatch",
    desc: "Envio do lote de copy pro n8n (manual ou pesquisa-completa)",
    color: "#71778A",
    bg: "#F3F4F6",
    border: "#E5E7EB",
    kind: "sistema",
  },
  campaign_image: {
    name: "Imagem de campanha",
    desc: "Gera imagem por loja na produção da campanha",
    color: "#0D9488",
    bg: "#F0FDFA",
    border: "#99F6E4",
    kind: "imagem",
  },
}

/** Ordem canônica de exibição dos agentes operacionais (sem 'seed'). */
export const PIPELINE_AGENT_ORDER: PipelineAgentKey[] = [
  "copy",
  "estruturador",
  "blueprint",
  "subject",
  "assembler_chooser",
  "assembler",
  "image",
  "hero_section",
  "copy_merge",
  "copy_fit",
  "merge_verifier",
  "text_format",
  "image_format",
  "typography",
  "color_format",
  "background_fit",
  "html",
  "refiner",
  "qa",
  "qavision",
  "campaign_image",
]

/** Slug do flow → label PT-BR (mostrado nas badges). */
export const FLOW_TYPE_LABEL: Record<string, string> = {
  welcome: "Welcome",
  abandoned_cart: "Carrinho Abandonado",
  browse_abandonment: "Browse Abandoned",
  site_abandoned: "Site Abandoned",
  upsell: "Upsell",
  win_back: "Winback",
  shipping_stages: "Pós-compra",
  custom: "Custom",
}

export function flowTypeLabel(slug: string | null | undefined): string {
  if (!slug) return "—"
  return FLOW_TYPE_LABEL[slug] ?? slug
}
