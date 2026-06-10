/**
 * Metadados de implementação por tipo de flow — gatilho (trigger) e público
 * (audience) que o time de implementação configura no ESP (Omnisend/Klaviyo).
 *
 * Display-only e DERIVADO do `flow_type` (sem schema). Espelha as descrições
 * canônicas dos flows (`flow-seed.service.ts`). NÃO substitui a configuração
 * real na plataforma — é um guia de handoff. Onde a Convertfy ainda não modela
 * o dado estruturado (segmento/gatilho por flow), mostramos o texto-guia.
 *
 * Função pura — testável e reusável (client e server).
 */

import type { FlowType } from "@/types/email-workspace"

export interface FlowImplementationMeta {
  /** Rótulo curto do flow (igual ao seed). */
  label: string
  /** O que dispara a automação no ESP. */
  trigger: string
  /** Quem entra na automação. */
  audience: string
  /** Métrica/evento nativo do ESP que ancora o gatilho. */
  metricEvent: string
}

const META: Record<FlowType, FlowImplementationMeta> = {
  welcome: {
    label: "Welcome Flow",
    trigger: "Inscrição em lista ou envio de formulário/pop-up",
    audience: "Novos inscritos (ainda sem compra)",
    metricEvent: "Subscribed to List",
  },
  site_abandoned: {
    label: "Site Abandoned",
    trigger: "Visitou o site sem visualizar produto nem comprar",
    audience: "Visitantes identificados que saíram sem interagir",
    metricEvent: "Active on Site",
  },
  abandoned_cart: {
    label: "Carrinho Abandonado",
    trigger: "Iniciou checkout / adicionou ao carrinho e não comprou",
    audience: "Quem abandonou o carrinho ou o checkout",
    metricEvent: "Started Checkout",
  },
  browse_abandonment: {
    label: "Browse Abandoned",
    trigger: "Visualizou produto sem adicionar ao carrinho",
    audience: "Quem navegou produtos sem comprar",
    metricEvent: "Viewed Product",
  },
  upsell: {
    label: "Upsell / Pós-compra",
    trigger: "Realizou uma compra (pós-compra)",
    audience: "Compradores recentes",
    metricEvent: "Placed Order",
  },
  win_back: {
    label: "Winback",
    trigger: "Cliente inativo há X dias sem nova compra",
    audience: "Clientes sem compra recente (em risco/churn)",
    metricEvent: "Placed Order (janela inversa)",
  },
  shipping_stages: {
    label: "Etapas de Envio",
    trigger: "Atualização de status do pedido (transacional)",
    audience: "Quem tem pedido em andamento",
    metricEvent: "Fulfilled Order / Order status",
  },
  post_purchase: {
    label: "Pós-compra",
    trigger: "Após a confirmação da compra",
    audience: "Compradores",
    metricEvent: "Placed Order",
  },
  custom: {
    label: "Flow personalizado",
    trigger: "Gatilho personalizado — definir no ESP",
    audience: "Segmento customizado — definir no ESP",
    metricEvent: "—",
  },
}

/** Defaults editáveis em Configurações (fallback quando não há override). */
export const FLOW_META_DEFAULTS: Record<FlowType, FlowImplementationMeta> = META

/**
 * Flow types que aparecem na config de implementação (os 7 flows reais + post
 * purchase; `custom` fica de fora da UI por não ter setup canônico).
 */
export const IMPLEMENTATION_FLOW_TYPES: FlowType[] = [
  "welcome",
  "site_abandoned",
  "browse_abandonment",
  "abandoned_cart",
  "upsell",
  "win_back",
  "shipping_stages",
]

export function flowImplementationMeta(flowType: FlowType): FlowImplementationMeta {
  return META[flowType] ?? META.custom
}

export function flowTriggerLabel(flowType: FlowType): string {
  return flowImplementationMeta(flowType).trigger
}

export function flowAudienceLabel(flowType: FlowType): string {
  return flowImplementationMeta(flowType).audience
}
