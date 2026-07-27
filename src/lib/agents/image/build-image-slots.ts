/**
 * Monta o bloco IMAGE_SLOTS do prompt do agente de imagem: uma seção
 * estruturada POR campo type=image do bloco, com o que vem do schema
 * (nome/especificidade/exemplo/formato), o comentário do slot (slot_note) e
 * a copy REAL do próprio grupo (por prefixo do key: product_1_image →
 * product_1_name / product_1_cta …).
 *
 * A copy só existe pós-n8n, então o `content` (copy gerada) é resolvido no
 * phase2 e passado aqui. Puro — testável.
 */

import type { BlueprintBlockField } from "@/types/email-generation"
import { deriveFieldNature } from "@/lib/agents/shared/component-dimensions"

// Sufixos que marcam o "papel imagem" de um key — removidos pra achar o
// prefixo do grupo (hero_image → hero; product_1_image → product_1).
const IMAGE_ROLE_SUFFIXES = [
  "_image",
  "_img",
  "_thumbnail",
  "_thumb",
  "_background",
  "_bg",
  "_photo",
  "_picture",
]

function groupPrefix(imageKey: string): string {
  const k = imageKey.trim().toLowerCase()
  for (const suf of IMAGE_ROLE_SUFFIXES) {
    if (k.endsWith(suf)) return k.slice(0, -suf.length)
  }
  return ""
}

function ratioLabel(w: number, h: number): string {
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b))
  const g = gcd(w, h) || 1
  return `${w / g}:${h / g}`
}

/** "formato" do slot: dims exatas (+ proporção) ou proporção livre. */
function formatoLine(f: BlueprintBlockField): string | null {
  const w = f.image_width ?? 0
  const h = f.image_height ?? 0
  if (w > 0 && h > 0) return `${w}x${h}px · proporção ${ratioLabel(w, h)}`
  const aspect = (f.image_aspect ?? "").trim()
  if (aspect) return `proporção ${aspect}`
  if (w > 0) return `largura ${w}px`
  if (h > 0) return `altura ${h}px`
  return null
}

function copyValue(v: unknown): string | null {
  if (typeof v === "string") return v.trim() || null
  if (typeof v === "number") return String(v)
  return null
}

/**
 * Copy dos campos irmãos do MESMO grupo do slot (por prefixo). Usa os
 * `fields` do bloco pra saber quais keys são copy (text/number) e lê os
 * valores do `content`. Prefixo vazio (key genérico "image") → todos os
 * campos de copy do bloco.
 */
function groupCopy(
  imageField: BlueprintBlockField,
  fields: BlueprintBlockField[],
  content: Record<string, unknown>,
): Array<[string, string]> {
  const prefix = groupPrefix(imageField.key)
  const out: Array<[string, string]> = []
  for (const f of fields) {
    if (f.type !== "text_short" && f.type !== "text_long" && f.type !== "number") {
      continue
    }
    if (prefix && !f.key.toLowerCase().startsWith(`${prefix}_`)) continue
    const val = copyValue(content[f.key])
    if (val) out.push([f.key, val])
  }
  return out
}

/**
 * Bloco IMAGE_SLOTS: uma seção por campo type=image. Vazio ("") quando o
 * bloco não tem campo de imagem (o caller cai no IMAGE_BRIEF legado).
 */
export function buildImageSlots(
  fields: BlueprintBlockField[] | null | undefined,
  content: Record<string, unknown> | null | undefined,
): string {
  const list = Array.isArray(fields) ? fields : []
  const cont = content ?? {}
  // T8 (naturezas): só campos de imagem GERADA viram slot — asset_fixo é
  // arte da biblioteca e fica intacta (briefá-la induziria o agente a
  // recriá-la). Sem nature no snapshot, type=image deriva imagem_gerada
  // (comportamento antigo preservado).
  const imageFields = list.filter(
    (f) => f.type === "image" && deriveFieldNature(f) === "imagem_gerada",
  )
  if (imageFields.length === 0) return ""

  const sections = imageFields.map((f) => {
    const tag = f.tag ?? f.key.toUpperCase()
    const spec = (f.image_spec ?? "").trim() || (f.guidance ?? "").trim()
    const example = (f.example ?? "").trim()
    const formato = formatoLine(f)
    const note = (f.slot_note ?? "").trim()
    const grupo = groupCopy(f, list, cont)

    const lines: string[] = [`<slot_imagem tag="${tag}">`, `campo: ${f.key}`]
    if (spec) lines.push(`especificidade: ${spec}`)
    if (example) lines.push(`exemplo: ${example}`)
    if (formato) lines.push(`formato: ${formato}`)
    if (note) lines.push(`comentario: ${note}`)
    if (grupo.length > 0) {
      lines.push("copy_do_grupo:")
      for (const [k, v] of grupo) lines.push(`- ${k}: "${v}"`)
    }
    lines.push("</slot_imagem>")
    return lines.join("\n")
  })

  return sections.join("\n\n")
}
