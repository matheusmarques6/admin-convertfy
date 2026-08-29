/**
 * Tipos do domínio "Arquitetura dos Emails" — client-safe.
 *
 * Mesma razão de `@/lib/email-blueprints/types`: o service de leitura
 * importa `createAdminClient`, que puxa `next/headers`. Um client component
 * que importe qualquer coisa de lá quebra o build do Next
 * ("You're importing a component that needs next/headers"). Tipos e
 * constantes ficam aqui; funções com I/O ficam no service.
 *
 * A linha unificada é o que a tela edita: um e-mail da régua de um fluxo,
 * com a régua (nome, intervalo), os três guias editoriais e a sequência de
 * blocos. Ela nasce de TRÊS tabelas (`email_flow_templates`,
 * `email_blueprints`, `email_outline_templates`) e volta para as três —
 * `mergeRows` e `splitRow` (em `./merge`) fazem a ida e a volta.
 */

import type { BlueprintBlockDef } from "@/lib/agents/email-blueprint"

/**
 * Um bloco na sequência do e-mail.
 *
 * `category` é uma das 8 de `COMPONENT_CATEGORIES` — o vocabulário do
 * Curador e do Estruturador, e desde a migration 20261090 também um
 * `block_type` válido em `email_blocks`. Por isso a categoria vai direto
 * como tipo, sem tradução.
 *
 * `id` é estável por instância e vive só no cliente: o MESMO bloco pode
 * aparecer várias vezes no e-mail (products → cta → products → cta) e a
 * reordenação precisa distinguir as cópias.
 */
export interface ArchBlock {
  id: string
  category: string
  /** Rótulo curto do bloco. Vazio → a UI cai no rótulo da categoria. */
  label: string
  /** "O que entra nele" na maquete — é o `purpose` do blueprint. */
  purpose: string
  needs_image: boolean
  /** Direção de arte deste bloco (só relevante com needs_image). */
  image_brief: string | null
  /**
   * Tipo técnico original quando o bloco veio de um blueprint gravado com
   * o vocabulário antigo (`coupon`, `testimonials`, `headline`…). Guardado
   * para não reescrever o tipo de quem já existe: `splitRow` só troca pelo
   * da categoria quando o usuário muda a categoria na tela.
   */
  legacy_type?: string | null
}

/** A linha que a tela edita — um e-mail de um fluxo. */
export interface EmailArchitectureRow {
  flow_type: string
  email_number: number

  // ── Régua (email_flow_templates) ──
  name: string
  delay_hours: number
  is_active: boolean

  // ── Guias editoriais ──
  /** "Intenção do e-mail". Espelhada em blueprint.objective + outline.objective. */
  intent: string
  /** "O e-mail deve", uma diretriz por linha. Espelhada em guidance + messaging. */
  should: string[]
  /** "O e-mail não deve", uma restrição por linha. Só em outline.restrictions. */
  should_not: string[]

  // ── Sequência ──
  blocks: ArchBlock[]
  /**
   * Categorias que a Estrutura geral listava e o blueprint não tem. Não são
   * inseridas às cegas (o outline não dá posição confiável) — a tela mostra
   * e o curador decide onde entram. Vazio no caso normal, e sempre vazio
   * depois da primeira gravação pela tela nova.
   */
  outline_extras: string[]

  // ── "Mais opções" (o pipeline lê; a maquete não mostra) ──
  subject_hint: string | null
  tone: string | null
  coupon_code: string | null
  text_only: boolean

  // ── Proveniência (a tela mostra; nada edita) ──
  blueprint_id: string | null
  outline_id: string | null
  flow_template_id: string | null
  updated_at: string | null
}

/** Fluxo no seletor: chave, rótulo PT, gatilho e contagem de e-mails. */
export interface ArchFlow {
  flow_type: string
  label: string
  trigger: string
  emails: number
}

/** Linha crua de `email_flow_templates`. */
export interface FlowTemplateRow {
  id: string
  flow_type: string
  email_number: number
  name: string
  delay_hours: number
  is_active: boolean
  updated_at: string | null
}

/** Linha crua de `email_blueprints` (só o que a tela usa). */
export interface RawBlueprint {
  id: string
  flow_type: string
  email_number: number
  objective: string
  messaging: string
  subject_hint: string | null
  blocks: BlueprintBlockDef[]
  tone_override: string | null
  text_only: boolean
  updated_at: string | null
}

/** Linha crua de `email_outline_templates` (só o que a tela usa). */
export interface RawOutline {
  id: string
  flow_type: string
  email_number: number
  objective: string
  guidance: string | null
  restrictions: string | null
  suggested_blocks: string[]
  tone_hint: string | null
  coupon_code: string | null
  is_active: boolean
}

/** O que `splitRow` devolve — um payload por tabela de destino. */
export interface SplitPayloads {
  blueprint: {
    flow_type: string
    email_number: number
    objective: string
    messaging: string
    subject_hint: string | null
    tone_override: string | null
    blocks: BlueprintBlockDef[]
    text_only: boolean
  }
  outline: {
    flow_type: string
    email_number: number
    objective: string
    guidance: string | null
    restrictions: string | null
    suggested_blocks: string[]
    tone_hint: string | null
    coupon_code: string | null
    is_active: boolean
  }
  flowTemplate: {
    flow_type: string
    email_number: number
    name: string
    delay_hours: number
    is_active: boolean
  }
}
