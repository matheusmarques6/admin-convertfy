/**
 * Monta o bloco IMAGE_SLOTS do prompt do agente de imagem: uma seção
 * estruturada POR campo type=image do bloco, com o que vem do schema
 * (nome/especificidade/exemplo/formato), o comentário do slot (slot_note) e
 * as ÁREAS DE TEXTO do próprio grupo (por prefixo do key: product_1_image →
 * product_1_name / product_1_cta …).
 *
 * ── Por que as áreas são forma, e não a copy ──────────────────────────
 *
 * Até 01/09 este bloco mandava a copy REAL, entre aspas:
 *
 *     copy_do_grupo:
 *     - hero_headline: "STOP WASTING, START SAVING ENERGY AND MONEY"
 *     - ps_line: "P.S. Discount code INNOVA10 expires August 31st."
 *
 * E o modelo desenhou exatamente isso dentro do PNG — headline, selos e o
 * cupom com data de validade —, apesar de a proibição de texto estar
 * escrita TRÊS vezes no prompt (topo e fim do system, mais o
 * `UNIVERSAL RESTRICTIONS` do user), ela própria uma resposta ao mesmo
 * incidente na Luxe Lift, quando saiu "SHOK NOW" queimado na arte.
 *
 * Pedir a um modelo de imagem que leia uma headline e não a desenhe é a
 * instrução que já falhou duas vezes. Então a headline não vai mais: o que
 * vai é a FORMA da área (papel e tamanho), que é o que a var servia para —
 * compor deixando o espaço certo, na proporção certa — sem uma única frase
 * copiável. `image_spec`, `example`, `slot_note` e `formato` seguem
 * intactos: são direção de arte, não copy.
 *
 * O `content` (copy gerada, pós-n8n) continua entrando porque é ele que diz
 * QUAIS áreas existem de fato e QUE TAMANHO cada uma tem. Nenhum valor dele
 * aparece na saída — há teste para isso. Puro — testável.
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

// Keys que marcam botão. O modelo compõe diferente quando sabe que ali vai
// um retângulo clicável, e não uma linha de texto solta.
const CTA_HINTS = ["cta", "button", "btn", "_label"]

/**
 * O PAPEL da área, derivado do contrato — nunca do texto. Sem limiar por
 * tamanho: "título acima de 30 caracteres" seria uma régua inventada, e o
 * número de caracteres já acompanha a linha.
 */
function formaDaArea(f: BlueprintBlockField): string {
  if (f.type === "number") return "número curto"
  if (f.type === "text_long") return "parágrafo"
  const k = f.key.toLowerCase()
  if (CTA_HINTS.some((h) => k.includes(h))) return "rótulo de botão"
  return "linha de texto"
}

/**
 * Áreas de texto dos campos irmãos do MESMO grupo do slot (por prefixo).
 * Usa os `fields` do bloco pra saber quais keys são copy (text/number) e o
 * `content` pra saber quais existem de fato e que tamanho têm — o VALOR em
 * si nunca sai daqui. Prefixo vazio (key genérico "image") → todos os
 * campos de copy do bloco; foi por esse caminho que o "P.S. Discount code
 * INNOVA10 expires August 31st." chegou ao modelo e virou carimbo.
 */
function areasDeTexto(
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
    if (!val) continue
    out.push([f.key, `${formaDaArea(f)}, ~${val.length} caracteres`])
  }
  return out
}

/**
 * Bloco IMAGE_SLOTS: uma seção por campo type=image. Vazio ("") quando o
 * bloco não tem campo de imagem (o caller cai no IMAGE_BRIEF legado).
 */
/**
 * Primeira frase da "Ideia" do cadastro (ou do spec inteiro) — o resumo de
 * UMA linha que o slot irmão recebe sobre o outro.
 */
function ideiaResumida(f: BlueprintBlockField): string {
  const spec = (f.image_spec ?? "").trim() || (f.guidance ?? "").trim()
  const ideia = /ideia\s*:\s*([^\n]+)/i.exec(spec)?.[1] ?? spec
  const frase = ideia.split(/(?<=[.!?])\s/)[0] ?? ideia
  return frase.trim().slice(0, 220)
}

export interface BuildImageSlotsOptions {
  /**
   * Um slot por chamada: emite SÓ a seção deste campo, mas diz a ele o que
   * os irmãos do bloco mostram. Sem isto, `hero_lifestyle_consumo` e
   * `main_image_rounded` (hero 5) saíram como duas mulheres com o mesmo
   * produto — cada prompt via só o próprio slot (Innova Bay, 02/09). É
   * pedido ao modelo, não garantia.
   */
  fieldKey?: string | null
  /**
   * Quando este campo é DEPENDENTE de outro do mesmo grupo (a thumb que
   * nasce da foto principal), o key da âncora. O slot ganha a linha que diz
   * o papel: mesma sessão e mesmo produto, mas enquadramento diferente —
   * sem isto o modelo, vendo a foto da âncora anexada, devolvia um recorte
   * dela (Innova, 02/09: 4 thumbs iguais à principal).
   */
  anchorKey?: string | null
}

export function buildImageSlots(
  fields: BlueprintBlockField[] | null | undefined,
  content: Record<string, unknown> | null | undefined,
  opts?: BuildImageSlotsOptions,
): string {
  const list = Array.isArray(fields) ? fields : []
  const cont = content ?? {}
  // T8 (naturezas): só campos de imagem GERADA viram slot — asset_fixo é
  // arte da biblioteca e fica intacta (briefá-la induziria o agente a
  // recriá-la). Sem nature no snapshot, type=image deriva imagem_gerada
  // (comportamento antigo preservado).
  const allImageFields = list.filter(
    (f) => f.type === "image" && deriveFieldNature(f) === "imagem_gerada",
  )
  const fieldKey = opts?.fieldKey ?? null
  const imageFields = fieldKey
    ? allImageFields.filter((f) => f.key === fieldKey)
    : allImageFields
  if (imageFields.length === 0) return ""

  const sections = imageFields.map((f) => {
    // A `tag` saiu do snapshot (20/08): o identificador do slot é a própria
    // key em maiúsculas — snapshot antigo com tag residual no jsonb ignora.
    const tag = f.key.toUpperCase()
    const specRaw = (f.image_spec ?? "").trim()
    const guidanceRaw = (f.guidance ?? "").trim()
    const spec = specRaw || guidanceRaw
    // As duas entram (03/09): o "briefing e formato" diz O QUE fotografar e
    // a orientação diz ONDE a imagem fica na peça. Antes era um OU outro, e
    // "Onde fica: fundo de todo o e-mail; lockup e headline sobrepostos ao
    // terço superior" nunca chegava ao gerador quando havia briefing.
    const ondeFica = specRaw && guidanceRaw && guidanceRaw !== specRaw ? guidanceRaw : ""
    const example = (f.example ?? "").trim()
    const formato = formatoLine(f)
    const note = (f.slot_note ?? "").trim()
    const grupo = areasDeTexto(f, list, cont)

    const lines: string[] = [`<slot_imagem tag="${tag}">`, `campo: ${f.key}`]
    if (spec) lines.push(`especificidade: ${spec}`)
    if (ondeFica) lines.push(`onde_fica: ${ondeFica}`)
    if (example) lines.push(`exemplo: ${example}`)
    if (formato) lines.push(`formato: ${formato}`)
    if (note) lines.push(`comentario: ${note}`)
    if (grupo.length > 0) {
      lines.push(
        "areas_de_texto (o HTML escreve estes textos POR CIMA da imagem — deixe estas regiões limpas, sem desenhar nada nelas):",
      )
      for (const [k, v] of grupo) lines.push(`- ${k}: ${v}`)
    }
    const anchorKey = (opts?.anchorKey ?? "").trim()
    if (anchorKey && anchorKey !== f.key) {
      const ancora = allImageFields.find((o) => o.key === anchorKey)
      lines.push(
        `papel_neste_grupo: esta imagem é DEPENDENTE de ${anchorKey}${ancora ? ` (${ideiaResumida(ancora) || "a foto principal do grupo"})` : ""}, cuja foto já existe e vai anexada como CFY_REF_ANCHOR. Mesma sessão, mesmo produto, mesma luz e mesmo tratamento de cor — mas enquadramento, ângulo e distância DIFERENTES, conforme a especificidade acima. Nunca um recorte nem uma repetição da principal.`,
      )
    }
    const irmaos = fieldKey ? allImageFields.filter((o) => o.key !== f.key) : []
    if (irmaos.length > 0) {
      lines.push(
        "outras_imagens_deste_bloco (já existem no mesmo bloco — esta imagem deve ser DIFERENTE delas em cena e enquadramento; se a outra mostra uma pessoa, esta mostra o produto ou o ambiente):",
      )
      for (const o of irmaos) lines.push(`- ${o.key}: ${ideiaResumida(o) || "(sem descrição)"}`)
    }
    lines.push("</slot_imagem>")
    return lines.join("\n")
  })

  return sections.join("\n\n")
}
