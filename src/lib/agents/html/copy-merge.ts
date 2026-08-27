/**
 * copy-merge — merge DETERMINÍSTICO da copy no documento, por EXAMPLE.
 *
 * O endereço de um campo é a FRASE do `example` do schema — que é a própria
 * frase autorada no HTML da variante (a biblioteca nunca adotou `{{TAG}}`).
 * O anchor-match encontra o range dela no source; aqui a troca vira SPLICE
 * (dom-locator), sem LLM e sem o protocolo de ops do Integrador — a única
 * colisão possível é splice sobreposto.
 *
 * Diferente do merge por tag, este escreve TAMBÉM dentro da região da hero
 * (sentinelas cfy:hero): o splice determinístico não tem o risco que a
 * proteção `allowHero` cobria, e o agente de hero passa a receber a região
 * com a copy FINAL — o guard `heroCopyPreserved` cobra que ela sobreviva ao
 * fragmento devolvido.
 *
 * Campo sem lugar/ambíguo é FAIL-OPEN por decisão (20/08): registra no
 * relatório campo a campo (aba Execuções) e segue — a frase de exemplo fica
 * no email e o radar operacional é a telemetria, nunca um LLM de recurso.
 *
 * Puro (zero I/O) — testável.
 */

import { deriveFieldNature } from "../shared/component-dimensions"
import {
  assignTextAnchors,
  buildTextIndex,
  normalizeForMatch,
  withOriginalSlices,
} from "./anchor-match"
import type { AnchorField } from "./anchor-match"
import { isStructuralToken } from "./attr-token-vocabulary"
import { extractHeroBySentinels, locateHeroRegion } from "./hero-locator"
import {
  applySplices,
  commentRanges,
  textNodes,
  type Range,
  type Splice,
} from "./dom-locator"
import { findAttrSlots } from "./slot-finder"

/** Campo mínimo do snapshot fields v2 que o merge precisa. */
export interface MergeField {
  key: string
  /** Frase do example do schema — a âncora no HTML da variante. */
  example?: string | null
  type: string
  nature?: string | null
}

/** Bloco de entrada: fields do blueprint casado + content do n8n. */
export interface MergeBlock {
  fields: MergeField[]
  content: Record<string, unknown>
  /** email_blocks.id — a MESMA chave do callback do n8n (rastreabilidade). */
  block_id?: string | null
  /** Tipo do bloco (hero, beneficios...) — decide o escopo do hero_pending. */
  block_type?: string | null
  /** email_blocks.position (1-based) — amarra a URL do imageMap ao bloco. */
  position?: number | null
}

/** Desfecho de um campo no merge (vocabulário único da telemetria). */
export type CampoDesfecho =
  | "ancorado_exemplo"
  | "ancorado_token"
  | "estrutural"
  | "imagem_sem_url"
  | "ambiguo"
  | "sem_lugar"

/** Linha da tabela campo a campo da aba Execuções. */
export interface CampoMergeLog {
  block_id: string | null
  key: string
  desfecho: CampoDesfecho
  motivo?: string
  /** Trecho original substituído (trunc 120) — null quando nada foi escrito. */
  de: string | null
  /** Valor aplicado (trunc 120) — null quando nada foi escrito. */
  para: string | null
  /** true = âncora costurada através de `<br>`/wrapper inline. */
  costurado?: boolean
  /**
   * Quantas cópias da frase foram escritas (regra 5 — arte que repete o
   * texto). Ausente quando é 1, que é o caso normal.
   */
  ocorrencias?: number
}

export interface CopyMergeReport {
  /** Campos de texto (nature copy) processados — o denominador de tudo. */
  slots_total: number
  /** Splices montados (campo ancorado + valor utilizável). */
  ops_built: number
  /** Splices aplicados de fato (sobreposição rejeita). */
  merged: number
  /** Relatório campo a campo — vira a tabela da aba Execuções. */
  campos: CampoMergeLog[]
  /** Campos sem lugar no documento (example não encontrável). */
  sem_lugar: Array<{ block_id: string | null; key: string; motivo: string }>
  /** Keys ambíguas (ocorrências não batem com os campos — nunca chutar). */
  ambiguos: string[]
  /** Pulados na aplicação (valor com markup, splice sobreposto). */
  skipped: Array<{ block_id: string | null; key: string; reason: string }>
  /** Valores aplicados DENTRO das sentinelas cfy:hero — insumo do guard. */
  hero_values: string[]
}

/** Estado completo por campo — insumo do runner (hero_pending), não do banco. */
export interface MergeAnchor {
  block_id: string | null
  block_type: string | null
  key: string
  desfecho: CampoDesfecho
  motivo?: string
  range: Range | null
  /** O valor foi escrito no documento. */
  applied: boolean
  value: string | null
  /** A âncora (quando existe) vive dentro das sentinelas cfy:hero. */
  inHero: boolean
}

export interface CopyMergeResult {
  html: string
  report: CopyMergeReport
  anchors: MergeAnchor[]
}

/**
 * Adaptador: email_blocks × blueprint blocks → MergeBlock[]. Mesma
 * convenção do dispatch/QA: position 1-based → índice position-1, guardada
 * pela igualdade de type (estrutura divergente → bloco fica sem fields e
 * os campos dele não são escritos — fail-open).
 */
export function mergeBlocksFromContext(
  blocks:
    | Array<{
        id?: string
        position: number
        block_type: string
        content: Record<string, unknown> | null
      }>
    | null
    | undefined,
  blueprintBlocks:
    | Array<{ type: string; fields?: MergeField[] | null }>
    | null
    | undefined,
): MergeBlock[] {
  return (blocks ?? []).map((b) => {
    const byIndex = (i: number) => {
      const cand = blueprintBlocks?.[i]
      return cand && cand.type === b.block_type ? cand : null
    }
    const matched = byIndex(b.position - 1) ?? byIndex(b.position)
    return {
      fields: Array.isArray(matched?.fields) ? matched.fields : [],
      content: b.content ?? {},
      block_id: b.id ?? null,
      block_type: b.block_type ?? null,
      position: b.position ?? null,
    }
  })
}

const truncate = (s: string, max = 120): string =>
  s.length > max ? s.slice(0, max) : s

/** Valor de copy utilizável: string/número não-vazio do content do n8n. */
function copyValueOf(content: Record<string, unknown>, key: string): string | null {
  const raw = content[key]
  if (typeof raw === "number" && Number.isFinite(raw)) return String(raw)
  if (typeof raw !== "string") return null
  const v = raw.trim()
  return v ? v : null
}

/**
 * Neutraliza `<`/`>` soltos do valor (contrato herdado do set_text): o valor
 * é TEXTO, e um sinal de menor cru quebraria o parse do cliente de email.
 * Valor que é MARCAÇÃO de verdade nem chega aqui — vira skipped.
 */
function neutralizeAngles(value: string): string {
  return value.replaceAll("<", "&lt;").replaceAll(">", "&gt;")
}

/**
 * Valor de copy que é MARCAÇÃO em vez de texto (nasceu no set_text do
 * Integrador; mora aqui desde que o merge virou o único escritor de texto).
 * Conservador de propósito: só pega tag HTML de verdade (`<img ...>`,
 * `<a ...>`), não "preço < 100" nem comparação solta.
 */
export function looksLikeMarkup(value: string): boolean {
  return /<\s*\/?\s*[a-z][a-z0-9-]*(\s[^<>]*)?\/?\s*>/i.test(value)
}

function inRange(offset: number, range: Range | null): boolean {
  return !!range && offset >= range.start && offset < range.end
}

/**
 * Espelhos MSO do trecho ancorado: o parser não entra em conditional
 * comments, então a âncora nunca cai lá — mas o Outlook renderiza o que
 * está DENTRO deles. Ocorrência EXATA do trecho original dentro de um
 * comentário vira splice também (troca de texto é segura em MSO; estrutura
 * não — e aqui só trocamos texto).
 */
function msoMirrorSplices(
  html: string,
  de: string,
  replacement: string,
): Splice[] {
  if (de.length < 4) return []
  const out: Splice[] = []
  for (const c of commentRanges(html)) {
    const region = html.slice(c.start, c.end)
    let at = region.indexOf(de)
    while (at !== -1) {
      out.push({ start: c.start + at, end: c.start + at + de.length, replacement })
      at = region.indexOf(de, at + de.length)
    }
  }
  return out
}

/**
 * Monta e aplica o merge por example. Todos os campos de texto entram no
 * casamento (mesmo sem valor — irmãos com example idêntico precisam do
 * grupo completo para a contagem de ocorrências fechar); só os com valor
 * viram splice.
 */
export function copyMergeByExample(
  html: string,
  blocks: MergeBlock[],
  opts?: {
    /**
     * Região da hero para o `inHero`/`hero_values`. No primeiro passe as
     * sentinelas cfy:hero ainda não existem (só o splice/graft as injeta) —
     * o runner passa a região do hero-locator. Ausente → sentinelas.
     */
    heroRange?: Range | null
  },
): CopyMergeResult {
  const hero =
    opts && "heroRange" in opts ? (opts.heroRange ?? null) : extractHeroBySentinels(html)

  // ── 1. Universo de campos de texto ─────────────────────────────────
  interface FieldEntry {
    block: MergeBlock
    field: MergeField
    value: string | null
  }
  const entries: FieldEntry[] = []
  for (const b of blocks) {
    for (const f of b.fields) {
      if (deriveFieldNature(f) !== "copy") continue
      entries.push({ block: b, field: f, value: copyValueOf(b.content, f.key) })
    }
  }

  const anchorFields: AnchorField[] = entries.map((e) => ({
    block_id: e.block.block_id ?? null,
    key: e.field.key,
    example: (e.field.example ?? "").trim(),
    value: e.value ?? "",
  }))

  const index = buildTextIndex(html)
  const assignments = withOriginalSlices(
    html,
    assignTextAnchors(index, anchorFields),
  )

  // ── 2. Splices + relatório campo a campo ───────────────────────────
  const campos: CampoMergeLog[] = []
  const anchors: MergeAnchor[] = []
  const semLugar: CopyMergeReport["sem_lugar"] = []
  const ambiguos: string[] = []
  const skipped: CopyMergeReport["skipped"] = []
  const splices: Array<Splice & { entryIdx: number }> = []
  let opsBuilt = 0

  assignments.forEach((a, i) => {
    const e = entries[i]
    const blockId = e.block.block_id ?? null
    const anchor: MergeAnchor = {
      block_id: blockId,
      block_type: e.block.block_type ?? null,
      key: e.field.key,
      desfecho: a.desfecho,
      motivo: a.motivo,
      range: a.range,
      applied: false,
      value: e.value,
      inHero: !!a.range && inRange(a.range.start, hero),
    }
    const campo: CampoMergeLog = {
      block_id: blockId,
      key: e.field.key,
      desfecho: a.desfecho,
      ...(a.motivo ? { motivo: a.motivo } : {}),
      ...(a.costurado ? { costurado: true } : {}),
      ...(a.extraRanges?.length
        ? { ocorrencias: a.extraRanges.length + 1 }
        : {}),
      de: a.de,
      para: null,
    }

    if (a.desfecho === "sem_lugar") {
      semLugar.push({ block_id: blockId, key: e.field.key, motivo: a.motivo ?? "" })
    } else if (a.desfecho === "ambiguo") {
      ambiguos.push(e.field.key)
    } else if (a.range) {
      if (e.value == null) {
        // Ancorado mas o n8n não mandou valor: a frase de exemplo fica no
        // documento (ela É copy apresentável da biblioteca) — só registra.
        campo.motivo = "copy_ausente"
        anchor.motivo = "copy_ausente"
      } else if (looksLikeMarkup(e.value)) {
        // Valor que é marcação escreveria a tag ESCAPADA na tela (caso do
        // logo virado texto `&lt;img ...&gt;` na Luxe Lift) — recusa.
        campo.motivo = "value_is_html"
        skipped.push({ block_id: blockId, key: e.field.key, reason: "value_is_html" })
      } else {
        const replacement = neutralizeAngles(e.value)
        splices.push({ ...a.range, replacement, entryIdx: i })
        // Frase repetida pela arte e um único campo dono (regra 5): escreve
        // em todas as cópias, senão o email sai metade traduzido.
        for (const extra of a.extraRanges ?? []) {
          splices.push({ ...extra, replacement, entryIdx: i })
        }
        // Espelho MSO: mesma frase dentro de conditional comment.
        const de = html.slice(a.range.start, a.range.end)
        for (const m of msoMirrorSplices(html, de, replacement)) {
          splices.push({ ...m, entryIdx: i })
        }
        opsBuilt++
        campo.para = truncate(e.value)
        anchor.applied = true // confirmado abaixo se o splice sobreviver
      }
    }

    campos.push(campo)
    anchors.push(anchor)
  })

  const res = applySplices(html, splices)

  // Splices rejeitados (sobreposição) desfazem o "applied" do campo dono.
  for (const r of res.rejected as Array<Splice & { entryIdx?: number }>) {
    const idx = r.entryIdx
    if (idx == null) continue
    const e = entries[idx]
    // O espelho MSO pode ser rejeitado sem invalidar a âncora principal —
    // só desfaz quando o splice PRINCIPAL (range da âncora) caiu.
    const a = anchors[idx]
    if (a.range && r.start === a.range.start && r.end === a.range.end) {
      a.applied = false
      campos[idx].para = null
      skipped.push({
        block_id: e.block.block_id ?? null,
        key: e.field.key,
        reason: "overlapping_edit",
      })
    }
  }

  const heroValues = anchors
    .filter((a) => a.applied && a.inHero && a.value)
    .map((a) => a.value as string)

  return {
    html: res.html,
    report: {
      slots_total: entries.length,
      ops_built: opsBuilt,
      merged: anchors.filter((a) => a.applied).length,
      campos,
      sem_lugar: semLugar,
      ambiguos,
      skipped,
      hero_values: heroValues,
    },
    anchors,
  }
}

/**
 * O fragmento devolvido pelo agente de hero PRESERVOU a copy que o merge
 * aplicou na região? Comparação pela mesma régua do casamento
 * (normalizeForMatch) — re-espaçar/re-indentar passa; sumir com o texto
 * não. É o guard do desenho "merge antes da hero" (D1).
 *
 * A comparação é feita sobre o TEXTO, com o markup removido. O guard
 * nasceu comparando o fragmento CRU, e isso o transformava num falso
 * positivo garantido justamente onde o agente faz o trabalho dele: pintar
 * e destacar. Na Luxe Lift (21/08) o campo `coupon_line` tem guidance
 * "valor da oferta em bold e na cor de acento"; o agente obedeceu e
 * devolveu `Enjoy <strong style="color:#B08D57">15%</strong> off your
 * first order using the code:`. A frase estava inteira e visível, mas
 * deixou de ser substring contígua — o guard acusou `hero_copy_lost`
 * quatro vezes seguidas e matou o e-mail em duas gerações.
 *
 * Duas formas de remoção porque nenhuma sozinha cobre os dois casos: tag
 * trocada por ESPAÇO é a forma normal (o wrapper fica entre palavras, e o
 * espaço extra some no colapso de whitespace), e tag trocada por NADA
 * cobre o wrapper no meio de uma palavra (`Enjo<em>y</em>`), onde o espaço
 * partiria a palavra em duas. Basta UMA das duas conter a frase.
 *
 * O guard mede sobrevivência do TEXTO, não do layout: valor que o agente
 * espalhou por células vizinhas conta como preservado. Reprovar é para
 * quando a frase sumiu de verdade.
 *
 * Terceira forma, o texto de ATRIBUTO (23/08): o campo `logo` da hero é
 * copy — o nome da marca —, e o prompt da hero manda, com todas as letras,
 * trocar o wordmark em texto pelo `<img>` do logo real. O agente obedeceu e
 * devolveu `<img src="...logo.png" alt="Luxe Lift">`. A marca não sumiu:
 * está na tela como logo e no `alt` (leitor de tela, e Gmail/Outlook com
 * imagens desligadas mostram o alt). Mas o strip de tags apaga o atributo
 * JUNTO com a tag, e o guard matou o e-mail duas vezes. O prompt mandava
 * fazer; o guard matava por ter feito.
 *
 * Só `alt`/`title`/`aria-label` — o que um leitor (humano ou de tela)
 * alcança. `src`/`href` ficam de fora: URL que por acaso contenha a frase
 * não é a frase entregue.
 */

/** Texto que um leitor alcança nos atributos — nunca `src`/`href`. */
const READABLE_ATTR_RE = /\b(?:alt|title|aria-label)\s*=\s*"([^"]*)"/gi

function attributeText(fragment: string): string {
  const partes: string[] = []
  for (const m of fragment.matchAll(READABLE_ATTR_RE)) partes.push(m[1])
  return normalizeForMatch(partes.join(" "))
}

export function heroCopyPreserved(
  heroValues: string[],
  fragment: string,
): { ok: boolean; missing: string[]; viaAtributo: string[] } {
  const spaced = normalizeForMatch(fragment.replace(/<[^>]*>/g, " "))
  const glued = normalizeForMatch(fragment.replace(/<[^>]*>/g, ""))
  const attrs = attributeText(fragment)

  const missing: string[] = []
  // Salvos SÓ pelo atributo. Sem esta lista a correção vira silêncio e
  // ninguém sabe com que frequência o agente converte copy em imagem.
  const viaAtributo: string[] = []

  for (const v of heroValues) {
    const norm = normalizeForMatch(v)
    if (norm.length < 4) continue
    if (spaced.includes(norm) || glued.includes(norm)) continue
    if (attrs.includes(norm)) {
      viaAtributo.push(v)
      continue
    }
    missing.push(v)
  }
  return { ok: missing.length === 0, missing, viaAtributo }
}

// ── Estruturais — posse do CÓDIGO, nunca do LLM ────────────────────────
//
// O vocabulário real da biblioteca (inventário F0, 20/08): o logo é
// `src="URL_DO_LOGO_AQUI"` e a marca é `NOME_DA_MARCA` (texto corrido E
// alt). Dentro da hero nada é tocado — contraste de logo em banda escura é
// juízo do agente de hero, não do código.
//
// Os tokens `{{}}` (EMAIL_TITLE, PREHEADER, BRAND_NAME, YEAR, LOGO,
// UNSUBSCRIBE_URL) seguem preenchidos como SOBREVIDA do caminho full-doc
// legado (templates globais ainda usam `{{TAG}}`); morrem com ele.

export interface StructuralFillContext {
  brandName?: string | null
  /** URL crua da logo clara (não markup) — preenche src="URL_DO_LOGO_AQUI". */
  logoUrl?: string | null
  // Legado {{}} (full-doc): título/preheader/ano/markup do logo.
  subject?: string | null
  preheader?: string | null
  /** Markup completo da logo — só o {{LOGO}} legado consome. */
  logoMarkup?: string | null
  year?: number
}

export interface StructuralFillResult {
  html: string
  /** Tokens preenchidos por código. */
  filled: Array<{ token: string; para: string }>
  /** Tokens presentes que ficaram sem valor (o strip limpa depois). */
  cleaned: string[]
}

/**
 * Merge tags do provedor de envio para os tokens de href legais do rodapé.
 * São substituídas no DISPARO (Klaviyo/ESP), não aqui — o valor literal é a
 * convenção que o template padrão (`default-reference.ts`) já usa e que o
 * strip de placeholders preserva de propósito. O QA também as reconhece
 * como destino válido (MERGE_TAG_HREF).
 */
const ESP_MERGE_TAG: Record<string, string> = {
  URL_UNSUBSCRIBE: "[unsubscribe_link]",
  URL_PREFERENCIAS: "[preferences_link]",
}

const LEGACY_TAG_TOKEN = /\{\{\s*([A-Z][A-Z0-9_]*)\s*\}\}/g
const LEGACY_STRUCTURAL = new Set([
  "EMAIL_TITLE",
  "PREHEADER",
  "BRAND_NAME",
  "YEAR",
  "LOGO",
  "UNSUBSCRIBE_URL",
])

/**
 * Preenche por CÓDIGO os tokens estruturais (fora da hero) e devolve o
 * relatório. Nunca remove linha — preservação > limpeza. Contexto parcial
 * (loja sem logo) NUNCA derruba: o token fica em `cleaned` pro strip.
 */
export function applyStructuralFills(
  html: string,
  ctx: StructuralFillContext,
): StructuralFillResult {
  // No primeiro passe as sentinelas ainda não existem — a região da hero
  // vem da mesma cascata do STEP 1 (marcadores cfy:block / tags).
  const hero = extractHeroBySentinels(html) ?? locateHeroRegion(html)
  const brandName = (ctx.brandName ?? "").trim()
  const logoUrl = (ctx.logoUrl ?? "").trim()

  const splices: Splice[] = []
  const filled: StructuralFillResult["filled"] = []
  const cleanedSet = new Set<string>()

  // ── Tokens de atributo (vocabulário real) ──────────────────────────
  const structuralValue = (token: string): string => {
    switch (token) {
      case "URL_DO_LOGO_AQUI":
        return logoUrl
      case "NOME_DA_MARCA":
        return brandName
      default:
        // Merge tag do provedor — nunca depende de dado da loja, então
        // não passa por `cleaned`: sempre resolve.
        return ESP_MERGE_TAG[token] ?? ""
    }
  }
  for (const slot of findAttrSlots(html)) {
    if (!isStructuralToken(slot.token)) continue
    if (inRange(slot.valueRange.start, hero)) continue
    const value = structuralValue(slot.token)
    if (!value) {
      cleanedSet.add(slot.token)
      continue
    }
    splices.push({ ...slot.valueRange, replacement: neutralizeAngles(value) })
    filled.push({ token: slot.token, para: truncate(value) })
  }

  // ── NOME_DA_MARCA como TEXTO corrido ───────────────────────────────
  for (const node of textNodes(html)) {
    if (inRange(node.range.start, hero)) continue
    let at = node.text.indexOf("NOME_DA_MARCA")
    while (at !== -1) {
      if (brandName) {
        splices.push({
          start: node.range.start + at,
          end: node.range.start + at + "NOME_DA_MARCA".length,
          replacement: neutralizeAngles(brandName),
        })
        filled.push({ token: "NOME_DA_MARCA", para: truncate(brandName) })
      } else {
        cleanedSet.add("NOME_DA_MARCA")
      }
      at = node.text.indexOf("NOME_DA_MARCA", at + 1)
    }
  }

  // ── Legado {{}} (sobrevida do full-doc) ────────────────────────────
  const legacyValues: Record<string, string> = {
    EMAIL_TITLE: (ctx.subject ?? "").trim(),
    PREHEADER: (ctx.preheader ?? "").trim(),
    BRAND_NAME: brandName,
    YEAR: ctx.year != null ? String(ctx.year) : "",
    LOGO: (ctx.logoMarkup ?? "").trim(),
    // Merge tag do provedor — substituída no disparo; o QA já a trata como
    // conteúdo dinâmico válido.
    UNSUBSCRIBE_URL: "[unsubscribe_link]",
  }
  for (const m of html.matchAll(LEGACY_TAG_TOKEN)) {
    const tag = m[1]
    if (!LEGACY_STRUCTURAL.has(tag)) continue
    const start = m.index ?? 0
    if (inRange(start, hero)) continue
    const value = legacyValues[tag]
    if (!value) {
      cleanedSet.add(tag)
      continue
    }
    splices.push({ start, end: start + m[0].length, replacement: value })
    filled.push({ token: tag, para: truncate(value) })
  }

  const res = applySplices(html, splices)
  return { html: res.html, filled, cleaned: Array.from(cleanedSet) }
}
