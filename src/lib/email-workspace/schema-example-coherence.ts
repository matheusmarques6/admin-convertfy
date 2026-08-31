/**
 * schema-example-coherence — a régua ÚNICA de coerência schema × HTML no
 * vocabulário sem placeholder (D7 do plano de 20/08).
 *
 * A pergunta mudou: não é mais "o {{UPPER(key)}} existe no HTML?" e sim
 * "o EXAMPLE do campo é encontrável (e único, após os desempates) no HTML
 * da variante?" — porque é o example que o merge usa como âncora em
 * produção. Auditar com a MESMA lógica do merge (assignTextAnchors /
 * assignImageSlots) garante que o aviso do save da aba Componentes, a
 * telemetria do blueprint e o guard do pool do Montador nunca discordam
 * do que a geração fará de fato.
 *
 * Puro (zero I/O) — client-safe (o parse5 do dom-locator roda no browser).
 */

import {
  assignTextAnchors,
  buildTextIndex,
  orphanTextFragments,
  type AnchorField,
  type OrphanTextFragment,
} from "@/lib/agents/html/anchor-match"
import type { Range } from "@/lib/agents/html/dom-locator"
import {
  assignImageSlots,
  findAttrSlots,
  type ImageField,
} from "@/lib/agents/html/slot-finder"
import { deriveFieldNature } from "@/lib/agents/shared/component-dimensions"
import type { ComponentOutputField } from "@/types/email-generation"

export interface SchemaAnchorAudit {
  /** Campos de texto cujo example ancora no HTML. */
  anchored: Array<{ key: string; phrase: string }>
  /** Campos sem âncora, com o motivo do merge (nao_encontrado, ambiguo...). */
  missing: Array<{ key: string; motivo: string }>
  ok: boolean
}

/**
 * Audita os campos de TEXTO (nature copy) contra o HTML — mesma régua do
 * copy_merge (contenção mais-longo-primeiro, irmãos por ocorrência, mínimo
 * de 4 chars). Schema vazio → ok (não há o que auditar).
 */
export function auditSchemaAnchors(
  html: string,
  schema: ComponentOutputField[],
): SchemaAnchorAudit {
  const fields: AnchorField[] = []
  for (const f of schema) {
    const key = f.key?.trim()
    if (!key || deriveFieldNature(f) !== "copy") continue
    fields.push({
      block_id: null,
      key,
      example: (f.example ?? "").trim(),
      value: "",
    })
  }
  if (fields.length === 0) {
    return { anchored: [], missing: [], ok: true }
  }
  const assignments = assignTextAnchors(buildTextIndex(html), fields)
  const anchored: SchemaAnchorAudit["anchored"] = []
  const missing: SchemaAnchorAudit["missing"] = []
  for (const a of assignments) {
    if (a.desfecho === "ancorado_exemplo") {
      anchored.push({ key: a.field.key, phrase: a.field.example })
    } else {
      missing.push({ key: a.field.key, motivo: a.motivo ?? a.desfecho })
    }
  }
  return { anchored, missing, ok: missing.length === 0 }
}

export interface ImageAnchorAudit {
  /** Campos imagem_gerada com token de atributo casável. */
  anchored: Array<{ key: string; token: string }>
  missing: Array<{ key: string; motivo: string }>
  ok: boolean
}

/**
 * Audita os campos de IMAGEM GERADA contra os tokens de atributo do HTML
 * (`src="URL_DA_IMAGEM_1"`) — mesma régua do image-merge. asset_fixo fica
 * de fora (arte da biblioteca não é slot).
 */
export function auditImageAnchors(
  html: string,
  schema: ComponentOutputField[],
): ImageAnchorAudit {
  const fields: ImageField[] = []
  for (const f of schema) {
    const key = f.key?.trim()
    if (!key || deriveFieldNature(f) !== "imagem_gerada") continue
    // URL fictícia: o audit só quer saber se o campo TEM token casável.
    fields.push({ block_id: null, blockIndice: null, key, url: "audit" })
  }
  if (fields.length === 0) {
    return { anchored: [], missing: [], ok: true }
  }
  const assignments = assignImageSlots(findAttrSlots(html), fields)
  const anchored: ImageAnchorAudit["anchored"] = []
  const missing: ImageAnchorAudit["missing"] = []
  for (const a of assignments) {
    if (a.desfecho === "ancorado_token" && a.slot) {
      anchored.push({ key: a.field.key, token: a.slot.token })
    } else {
      missing.push({ key: a.field.key, motivo: "token_nao_encontrado" })
    }
  }
  return { anchored, missing, ok: missing.length === 0 }
}

/**
 * A variante é PREENCHÍVEL pelo pipeline? (guard do pool do Montador, D8)
 *
 * Preenchível = tem schema E pelo menos uma âncora real no HTML (example de
 * texto encontrável OU token de imagem casável). Variante sem nada disso é
 * exemplo hardcoded que vazaria intacto para o cliente — fica fora do pool
 * até o cadastro ser consertado.
 */
export function variantIsFillable(v: {
  html: string
  output_schema?: ComponentOutputField[] | null
}): boolean {
  const schema = v.output_schema ?? []
  if (schema.length === 0) return false
  const html = v.html ?? ""
  if (auditSchemaAnchors(html, schema).anchored.length > 0) return true
  return auditImageAnchors(html, schema).anchored.length > 0
}

// ── Auditoria INVERSA: texto que nenhum campo endereça ─────────────────

export type OrphanTextEntry = OrphanTextFragment

export interface OrphanTextAudit {
  trechos: OrphanTextEntry[]
  /** Nenhum trecho SUSPEITO (texto fixo legítimo não reprova). */
  ok: boolean
}

/**
 * Que texto VISÍVEL do HTML nenhum campo do schema escreve?
 *
 * A pergunta inversa da `auditSchemaAnchors`, e a que faltava. Em 28/08 a
 * variante "produtos 5" tinha os 17 campos ancorando perfeitamente (o run
 * de merge reportou 56/56) e três selos escritos à mão no HTML —
 * "SELO 1<br>OFF 1" — que nenhum campo endereçava. Sem contrato, o selo não
 * vai no payload do n8n, não volta como copy, não é ancorado pelo merge e
 * nenhum agente de formatação tem alçada para tocar: atravessa o pipeline
 * inteiro e chega ao cliente como recheio de mockup.
 *
 * Reivindica os ranges com a MESMA `assignTextAnchors` do merge e delega o
 * resto ao `orphanTextFragments` — a geração usa a mesma função sobre os
 * próprios ranges, então a aba Componentes e a telemetria nunca discordam.
 *
 * `por`: "example" audita o HTML da variante (cadastro, antes de gerar);
 * "valor" audita o documento DEPOIS do merge, onde a âncora já é a copy
 * entregue (sem isso toda copy gerada apareceria como órfã).
 */
export function auditOrphanText(
  html: string,
  schema: ComponentOutputField[],
  opts: { por?: "example" | "valor"; valores?: Record<string, string> } = {},
): OrphanTextAudit {
  const por = opts.por ?? "example"
  const fields: AnchorField[] = []
  for (const f of schema) {
    const key = f.key?.trim()
    if (!key || deriveFieldNature(f) !== "copy") continue
    const frase =
      por === "valor"
        ? (opts.valores?.[key] ?? "").trim()
        : (f.example ?? "").trim()
    if (!frase) continue
    fields.push({ block_id: null, key, example: frase, value: "" })
  }

  const claimed: Range[] = []
  if (fields.length > 0) {
    for (const a of assignTextAnchors(buildTextIndex(html), fields)) {
      if (a.range) claimed.push(a.range)
      for (const extra of a.extraRanges ?? []) claimed.push(extra)
    }
  }

  const trechos = orphanTextFragments(html, claimed)
  return { trechos, ok: !trechos.some((t) => t.suspeito) }
}
