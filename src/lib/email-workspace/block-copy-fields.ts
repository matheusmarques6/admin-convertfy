/**
 * block-copy-fields — extrai os campos de COPY (texto) de um bloco de email
 * para a view "Copy do email" (texto formatado pro designer).
 *
 * CONTENT-DRIVEN: mostra TODO campo de texto presente no `content`, seja qual
 * for o `block_type`. Antes era type-aware (lia chaves canônicas por tipo), mas
 * o gerador (n8n/fallback) grava chaves GENÉRICAS e em duas gerações de schema
 * diferentes (ex.: coupon antigo `{code,hint,cta_text}` vs novo
 * `{cta,body,text,headline}`). Um leitor fixo-por-tipo escondia blocos cuja
 * copy estava sob outra chave. Aqui lemos o que ESTÁ no content, pulando só
 * chaves de URL/imagem/meta.
 *
 * Chaves reais confirmadas no banco (via SQL):
 *   strings: eyebrow, heading, headline, title, body, text, cta, cta_text,
 *            code, hint, greeting, signoff, author, tagline, number, label,
 *            copyright
 *   arrays:  items (STRINGS, ex "✅... | ❌..."), products (objetos),
 *            columns (footer: links)
 *   pular:   url, cta_url, link_url, image_url, image_alt, image_instruction,
 *            image_last_*, expires_at, style, unsubscribe_url, logo_url
 *
 * Função pura (sem deps de server/client) — testável e reusável.
 */

import type { EmailBlock } from "@/types/email-workspace"

export interface BlockCopyField {
  key: string
  label: string
  value: string
}

/** Rótulos amigáveis das chaves de copy conhecidas, na ORDEM de exibição. */
const KEY_LABELS: Array<[string, string]> = [
  ["eyebrow", "Eyebrow"],
  ["heading", "Seção"],
  ["headline", "Headline"],
  ["title", "Título"],
  ["body", "Body"],
  ["text", "Texto"],
  ["cta_text", "CTA"],
  ["cta", "CTA"],
  ["code", "Cupom"],
  ["hint", "Validade"],
  ["greeting", "Saudação"],
  ["signoff", "Despedida"],
  ["author", "Assinatura"],
  ["tagline", "Tagline"],
  ["number", "Número"],
  ["label", "Label"],
  ["copyright", "Copyright"],
]

/**
 * Chaves que NÃO são copy (URL, imagem, metadados de geração). Nunca exibidas.
 */
const SKIP_KEYS = new Set([
  "url",
  "cta_url",
  "link_url",
  "image_url",
  "image_alt",
  // Mapa de imagens por slot (geração por campo). É objeto, não copy —
  // sem isto o fallback genérico tentaria imprimi-lo como texto.
  "images",
  "image_instruction",
  "image_last_generated_at",
  "image_last_prompt",
  "expires_at",
  "style",
  "unsubscribe_url",
  "logo_url",
])

/** Coage a string trimada não-vazia, ou "". */
function s(v: unknown): string {
  if (typeof v === "string") return v.trim()
  if (typeof v === "number") return String(v)
  return ""
}

/** Humaniza uma chave desconhecida (snake/camel → "Title Case"). */
function humanize(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .trim()
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ")
}

/** Formata um array de items (strings ou objetos) em texto multilinha. */
function formatItems(arr: unknown[]): string {
  return arr
    .map((it) => {
      if (typeof it === "string" || typeof it === "number") return s(it)
      if (it && typeof it === "object") {
        const o = it as Record<string, unknown>
        // objetos conhecidos: testimonials {author,quote,rating},
        // features {icon,label}, comparison rows {label,us,them}
        const quote = s(o.quote)
        const author = s(o.author)
        if (quote || author) {
          const rating =
            typeof o.rating === "number" && o.rating > 0
              ? ` (${"★".repeat(Math.round(o.rating))})`
              : ""
          return `"${quote}" — ${author}${rating}`.trim()
        }
        const label = s(o.label)
        const icon = s(o.icon)
        if (label) return `${icon} ${label}`.trim()
        // fallback: junta os valores string do objeto
        return Object.values(o).map(s).filter(Boolean).join(" — ")
      }
      return ""
    })
    .filter(Boolean)
    .join("\n")
}

/** Formata a lista de produtos (objetos com name/price/cta_text). */
function formatProducts(arr: unknown[]): string {
  return arr
    .map((p, i) => {
      const o = (p ?? {}) as Record<string, unknown>
      const name = s(o.name)
      const price = s(o.price)
      const cta = s(o.cta_text)
      return `${i + 1}. ${name}${price ? ` (${price})` : ""}${cta ? ` — ${cta}` : ""}`
    })
    .filter((l) => l.replace(/^\d+\.\s*/, "").trim())
    .join("\n")
}

/** Formata os links das colunas do footer. */
function formatFooterLinks(columns: unknown[]): string {
  const links = columns
    .flatMap((col) => {
      const o = (col ?? {}) as Record<string, unknown>
      return Array.isArray(o.links) ? o.links : []
    })
    .map((l) => s((l as Record<string, unknown>)?.label))
    .filter(Boolean)
  return links.join(" · ")
}

/**
 * Retorna os campos de copy legíveis de um bloco, content-driven: mostra todo
 * campo de texto/lista presente no `content`, pulando URL/imagem/meta.
 */
export function blockCopyFields(block: EmailBlock): BlockCopyField[] {
  const content = (block.content ?? {}) as Record<string, unknown>
  const out: BlockCopyField[] = []
  const seen = new Set<string>()

  const pushField = (key: string, label: string) => {
    if (seen.has(key)) return
    const raw = content[key]
    let value = ""
    if (Array.isArray(raw)) {
      if (key === "products") value = formatProducts(raw)
      else if (key === "columns") value = formatFooterLinks(raw)
      else value = formatItems(raw)
    } else {
      value = s(raw)
    }
    if (value) {
      out.push({ key, label, value })
      seen.add(key)
    }
  }

  // 1. Chaves conhecidas, na ordem de exibição.
  for (const [key, label] of KEY_LABELS) pushField(key, label)
  // 2. Arrays conhecidos.
  pushField("items", "Itens")
  pushField("products", "Produtos")
  pushField("columns", "Links")

  // 3. Qualquer outra chave string/array com conteúdo (fora do skip) — garante
  //    que nada com copy fique escondido, mesmo que o gerador mude de schema.
  for (const key of Object.keys(content)) {
    if (seen.has(key) || SKIP_KEYS.has(key)) continue
    const raw = content[key]
    const value = Array.isArray(raw) ? formatItems(raw) : s(raw)
    if (value) {
      out.push({ key, label: humanize(key), value })
      seen.add(key)
    }
  }

  return out
}
