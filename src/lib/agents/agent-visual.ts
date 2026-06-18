/**
 * Identidade visual dos agentes do pipeline AE + helpers de label.
 * Fonte ÚNICA — UI da página de logs (`/admin/settings/email-generation-logs`)
 * e qualquer outro consumidor que precise renderizar agente de forma consistente.
 *
 * Cores replicam a maquete `Logs_de_Geração_de_Emails_Abordagem_A`.
 */

export type PipelineAgentKey =
  | "copy"
  | "blueprint"
  | "assembler_chooser"
  | "assembler"
  | "image"
  | "html"
  | "qa"
  | "qavision"
  | "seed"
  | "copy_dispatch"

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
  blueprint: {
    name: "Blueprint",
    desc: "Extrai estrutura de 9–19 blocos do email de referência",
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
    desc: "Monta o HTML reusando as variantes escolhidas (passo B)",
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
  html: {
    name: "HTML",
    desc: "Monta o HTML final — 600px, CSS vars, flexbox",
    color: "#D97706",
    bg: "#FFFBEB",
    border: "#FDE68A",
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
}

/** Ordem canônica de exibição dos agentes operacionais (sem 'seed'). */
export const PIPELINE_AGENT_ORDER: PipelineAgentKey[] = [
  "copy",
  "blueprint",
  "assembler_chooser",
  "assembler",
  "image",
  "html",
  "qa",
  "qavision",
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
