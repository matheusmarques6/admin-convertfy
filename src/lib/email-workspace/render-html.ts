/**
 * Renderiza um EmailFlowEmail (envelope + blocos) como HTML email-safe.
 *
 * Pure function — sem deps React. Usavel tanto no client (preview/copy)
 * quanto no server (send-test, eventual snapshot pra Klaviyo).
 *
 * Se email.html ja existe (HTML salvo do builder externo), retorna ele
 * direto sem regerar.
 */

import type {
  EmailBlock,
  EmailFlowEmail,
  ProductsBlockContent,
} from "@/types/email-workspace"

export function renderEmailHtml(
  email: Pick<EmailFlowEmail, "html" | "name">,
  blocks: EmailBlock[],
): string {
  if (email.html) {
    const trimmed = email.html.trim()
    if (trimmed.match(/^<!DOCTYPE/i) || trimmed.match(/^<html/i)) {
      return email.html
    }
    return wrapInEmailShell(email.name, email.html)
  }

  const esc = (s: string | undefined | null) =>
    (s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")

  const renderBlock = (block: EmailBlock): string => {
    const c = block.content as Record<string, unknown>
    // Leitura tolerante: o gerador grava chaves GENÉRICAS e em duas gerações
    // (ex.: coupon `{code,hint}` antigo vs `{cta,body,text}` novo; cta com
    // `{cta,url,body,text,heading,headline}`; items como STRINGS). `pick` pega
    // a 1ª chave não-vazia; `list` lê arrays.
    const pick = (...keys: string[]): string => {
      for (const k of keys) {
        const v = c[k]
        if (typeof v === "string" && v.trim()) return v.trim()
        if (typeof v === "number") return String(v)
      }
      return ""
    }
    const list = (key: string): unknown[] =>
      Array.isArray(c[key]) ? (c[key] as unknown[]) : []
    /** Coage um item de array (string ou objeto) a texto legível. */
    const itemText = (it: unknown): string => {
      if (typeof it === "string" || typeof it === "number") return String(it).trim()
      if (it && typeof it === "object") {
        const o = it as Record<string, unknown>
        const quote = typeof o.quote === "string" ? o.quote : ""
        const author = typeof o.author === "string" ? o.author : ""
        if (quote || author) return `${quote}${author ? ` — ${author}` : ""}`.trim()
        const label = typeof o.label === "string" ? o.label : ""
        const icon = typeof o.icon === "string" ? o.icon : ""
        if (label) return `${icon} ${label}`.trim()
        return Object.values(o)
          .filter((v): v is string => typeof v === "string")
          .join(" — ")
      }
      return ""
    }

    switch (block.block_type) {
      case "hero": {
        const headline = pick("headline")
        const body = pick("body", "text")
        const eyebrow = pick("eyebrow", "heading")
        const cta = pick("cta_text", "cta")
        return `      <!-- ${block.block_type.toUpperCase()} · ${esc(block.label)} -->
      <tr><td class="hero"><img src="${esc(pick("image_url")) || "{{hero_image_url}}"}" alt="${esc(pick("image_alt") || headline)}" width="600" style="display:block;width:100%;height:auto;border:0;"/></td></tr>
      <tr><td style="padding:32px 36px 16px; text-align:center;">
        ${eyebrow ? `<p style="margin:0; font:700 11px/1 'Inter'; letter-spacing:.22em;">${esc(eyebrow)}</p>` : ""}
        ${headline ? `<h1 class="display" style="margin:10px 0 0;">${esc(headline)}</h1>` : ""}
      </td></tr>
      ${body ? `<tr><td style="padding:14px 56px 28px; text-align:center;"><p style="margin:0; font-size:14px; line-height:1.65;">${esc(body)}</p></td></tr>` : ""}
      ${cta ? `<tr><td style="padding:0 36px 36px; text-align:center;"><a href="${esc(pick("cta_url", "url")) || "{{cta_url}}"}" class="cta">${esc(cta)}</a></td></tr>` : ""}`
      }
      case "text":
      case "headline": {
        const eyebrow = pick("eyebrow")
        const headline = pick("headline", "heading")
        const body = pick("body", "text")
        return `      <!-- ${block.block_type.toUpperCase()} · ${esc(block.label)} -->
      <tr><td style="padding:40px 56px; text-align:center; border-top:1px solid #F0F0F0;">
        ${eyebrow ? `<p style="margin:0 0 10px; font:700 11px/1 'Inter'; letter-spacing:.22em; color:#666;">${esc(eyebrow)}</p>` : ""}
        ${headline ? `<h2 style="margin:0; font:900 32px/1 'Inter'; letter-spacing:-.02em; text-transform:uppercase;">${esc(headline)}</h2>` : ""}
        ${body ? `<p style="margin:20px auto 0; max-width:440px; font-size:14px; line-height:1.65;">${esc(body)}</p>` : ""}
      </td></tr>`
      }
      case "coupon": {
        const headline = pick("headline", "title")
        const body = pick("body")
        const code = pick("code")
        const text = pick("text")
        const hint = pick("hint")
        const cta = pick("cta", "cta_text")
        return `      <!-- ${block.block_type.toUpperCase()} · ${esc(block.label)} -->
      <tr><td style="padding:32px 56px; text-align:center; background:#FAFAFA; border-top:1px solid #F0F0F0;">
        ${headline ? `<p style="margin:0 0 8px; font:700 10px/1 'Inter'; letter-spacing:.22em; color:#666;">${esc(headline)}</p>` : `<p style="margin:0 0 8px; font:700 10px/1 'Inter'; letter-spacing:.22em; color:#666;">CUPOM</p>`}
        ${body ? `<p style="margin:0 0 12px; font-size:13px; line-height:1.55;">${esc(body)}</p>` : ""}
        ${
          code
            ? `<span class="coupon"><span class="code">${esc(code)}</span></span>`
            : text
              ? `<p style="margin:0; font:800 15px/1.2 'Inter'; letter-spacing:.04em;">${esc(text)}</p>`
              : `<span class="coupon"><span class="code">{{coupon_code}}</span></span>`
        }
        ${hint ? `<p style="margin:12px 0 0; font-size:11px; letter-spacing:.06em; text-transform:uppercase; color:#666;">${esc(hint)}</p>` : ""}
        ${cta ? `<a href="${esc(pick("cta_url", "url")) || "{{cta_url}}"}" class="cta" style="margin-top:16px;">${esc(cta)}</a>` : ""}
      </td></tr>`
      }
      case "products": {
        const p = c as ProductsBlockContent
        const products = p.products ?? []
        return `      <!-- ${block.block_type.toUpperCase()} · ${esc(block.label)} -->
      <tr><td style="padding:40px 32px; border-top:1px solid #F0F0F0;">
        ${p.title ? `<h3 style="margin:0 0 24px; text-align:center; font:900 22px/1 'Inter'; text-transform:uppercase; letter-spacing:-.02em;">${esc(p.title)}</h3>` : ""}
        <table cellpadding="0" cellspacing="0" role="presentation" style="width:100%;"><tr>
        ${products
          .map(
            (prod) => `<td style="width:25%; padding:0 6px; text-align:center; vertical-align:top;">
          <img src="${esc(prod.image_url) || "{{product_image}}"}" alt="${esc(prod.name)}" width="120" style="display:block;width:100%;height:auto;border-radius:6px;background:#F0F0F0;"/>
          <p style="margin:10px 0 4px; font:600 12px/1.2 'Inter';">${esc(prod.name)}</p>
          <p style="margin:0; font:700 13px/1 'Inter'; color:#4E62D8;">${esc(String(prod.price))}</p>
          <a href="${esc(prod.url) || "{{product_url}}"}" class="cta" style="margin-top:8px; font-size:10px; padding:8px 14px;">${esc(prod.cta_text || "BUY NOW")}</a>
        </td>`,
          )
          .join("\n        ")}
        </tr></table>
      </td></tr>`
      }
      case "footer": {
        const cols = (c.columns as Array<{ links?: Array<{ label: string; url: string }> }>) ?? []
        const links = cols.flatMap((col) => col.links ?? [])
        const copyright = pick("copyright", "body")
        return `      <!-- ${block.block_type.toUpperCase()} · ${esc(block.label)} -->
      <tr><td style="padding:32px 24px 24px; background:#0F0F0F; color:#fff; text-align:center;">
        ${
          links.length > 0
            ? `<p style="margin:0 0 20px;">${links.map((l) => `<a href="${esc(l.url)}" style="color:#fff; text-decoration:none; font:700 11px/1 'Inter'; letter-spacing:.1em; text-transform:uppercase; margin:0 12px;">${esc(l.label)}</a>`).join(" ")}</p>`
            : ""
        }
        ${copyright ? `<p style="margin:0; font-size:11px; color:#999; letter-spacing:.04em;">${esc(copyright)}</p>` : ""}
      </td></tr>`
      }
      case "image": {
        const i = c as { image_url?: string; image_alt?: string; link_url?: string }
        const img = `<img src="${esc(i.image_url) || "{{image_url}}"}" alt="${esc(i.image_alt ?? "")}" width="600" style="display:block;width:100%;height:auto;border:0;"/>`
        return `      <!-- ${block.block_type.toUpperCase()} · ${esc(block.label)} -->
      <tr><td>${i.link_url ? `<a href="${esc(i.link_url)}">${img}</a>` : img}</td></tr>`
      }
      case "cta": {
        const headline = pick("headline")
        const heading = pick("heading")
        const body = pick("body")
        const label = pick("cta", "cta_text") || pick("text") || "CONTINUAR"
        const text = pick("text")
        const showText = text && text !== label
        return `      <!-- ${block.block_type.toUpperCase()} · ${esc(block.label)} -->
      <tr><td style="padding:24px 36px; text-align:center;">
        ${heading ? `<p style="margin:0 0 8px; font:700 11px/1 'Inter'; letter-spacing:.18em; text-transform:uppercase; color:#666;">${esc(heading)}</p>` : ""}
        ${headline ? `<h3 style="margin:0 0 10px; font:900 20px/1.1 'Inter'; text-transform:uppercase; letter-spacing:-.01em;">${esc(headline)}</h3>` : ""}
        ${body ? `<p style="margin:0 0 14px; font-size:14px; line-height:1.6;">${esc(body)}</p>` : ""}
        ${showText ? `<p style="margin:0 0 14px; font-size:13px; color:#666;">${esc(text)}</p>` : ""}
        <a href="${esc(pick("url", "cta_url")) || "{{cta_url}}"}" class="cta">${esc(label)}</a>
      </td></tr>`
      }
      case "divider":
        return `      <!-- DIVIDER -->
      <tr><td style="padding:0 36px;"><div style="height:1px;background:#F0F0F0;"></div></td></tr>`
      case "spacer":
        return `      <!-- SPACER -->
      <tr><td style="height:24px;line-height:24px;font-size:0;">&nbsp;</td></tr>`
      case "header": {
        const logo = pick("logo_url", "image_url")
        const brand = pick("headline", "tagline")
        const tagline = pick("tagline")
        const url = pick("url")
        const brandHtml = logo
          ? `<img src="${esc(logo)}" alt="${esc(tagline || brand)}" style="height:32px; display:inline-block;"/>`
          : `<span style="font:800 16px/1 'Inter'; letter-spacing:.08em; text-transform:uppercase;">${esc(brand) || "{{brand_name}}"}</span>`
        return `      <!-- ${block.block_type.toUpperCase()} · ${esc(block.label)} -->
      <tr><td style="padding:20px 36px; text-align:center; border-bottom:1px solid #F0F0F0;">
        ${url ? `<a href="${esc(url)}" style="text-decoration:none; color:inherit;">${brandHtml}</a>` : brandHtml}
        ${tagline && tagline !== brand ? `<p style="margin:6px 0 0; font-size:11px; letter-spacing:.08em; text-transform:uppercase; color:#888;">${esc(tagline)}</p>` : ""}
      </td></tr>`
      }
      case "features": {
        const heading = pick("heading")
        const headline = pick("headline")
        const items = list("items").map(itemText).filter(Boolean)
        return `      <!-- ${block.block_type.toUpperCase()} · ${esc(block.label)} -->
      <tr><td style="padding:24px 36px; background:#FAFAFA; border-top:1px solid #F0F0F0; border-bottom:1px solid #F0F0F0;">
        ${heading ? `<p style="margin:0 0 6px; text-align:center; font:700 10px/1 'Inter'; letter-spacing:.18em; text-transform:uppercase; color:#666;">${esc(heading)}</p>` : ""}
        ${headline ? `<h3 style="margin:0 0 16px; text-align:center; font:900 18px/1.1 'Inter'; text-transform:uppercase; letter-spacing:-.01em;">${esc(headline)}</h3>` : ""}
        ${items
          .map(
            (it) => `<p style="margin:0 0 8px; font:600 13px/1.4 'Inter'; text-align:center;">${esc(it)}</p>`,
          )
          .join("\n        ")}
      </td></tr>`
      }
      case "social_proof": {
        const heading = pick("heading")
        const headline = pick("headline")
        const number = pick("number")
        const ratingRaw = c.rating
        const stars =
          typeof ratingRaw === "number" && ratingRaw > 0
            ? "★".repeat(Math.round(ratingRaw)) +
              "☆".repeat(Math.max(0, 5 - Math.round(ratingRaw)))
            : ""
        const body = pick("body")
        const text = pick("text", "label")
        const items = list("items").map(itemText).filter(Boolean)
        return `      <!-- ${block.block_type.toUpperCase()} · ${esc(block.label)} -->
      <tr><td style="padding:32px 36px; text-align:center; background:#F8F8F8;">
        ${heading ? `<p style="margin:0 0 6px; font:700 10px/1 'Inter'; letter-spacing:.18em; text-transform:uppercase; color:#666;">${esc(heading)}</p>` : ""}
        ${headline ? `<h3 style="margin:0 0 10px; font:900 20px/1.1 'Inter'; text-transform:uppercase; letter-spacing:-.01em;">${esc(headline)}</h3>` : ""}
        ${number ? `<p style="margin:0; font:900 28px/1 'Inter';">${esc(number)}</p>` : ""}
        ${stars ? `<p style="margin:8px 0 0; font-size:16px; letter-spacing:.06em; color:#F5A623;">${stars}</p>` : ""}
        ${body ? `<p style="margin:8px 0 0; font-size:13px; line-height:1.5; color:#444;">${esc(body)}</p>` : ""}
        ${text ? `<p style="margin:6px 0 0; font-size:12px; color:#666;">${esc(text)}</p>` : ""}
        ${
          items.length
            ? `<div style="margin:14px 0 0;">${items.map((it) => `<p style="margin:0 0 6px; font-size:12px; color:#444;">${esc(it)}</p>`).join("")}</div>`
            : ""
        }
      </td></tr>`
      }
      case "testimonials": {
        const headline = pick("headline", "heading")
        const items = list("items").map(itemText).filter(Boolean)
        return `      <!-- ${block.block_type.toUpperCase()} · ${esc(block.label)} -->
      <tr><td style="padding:32px 36px; border-top:1px solid #F0F0F0;">
        ${headline ? `<h3 style="margin:0 0 18px; text-align:center; font:900 20px/1 'Inter'; text-transform:uppercase; letter-spacing:-.01em;">${esc(headline)}</h3>` : ""}
        ${items
          .map(
            (it) => `<div style="background:#FAFAFA; border:1px solid #F0F0F0; border-radius:6px; padding:18px; margin-bottom:10px;">
          <p style="margin:0; font-size:13px; line-height:1.55;">${esc(it)}</p>
        </div>`,
          )
          .join("\n        ")}
      </td></tr>`
      }
      case "urgency": {
        const headline = pick("headline", "heading")
        const body = pick("body")
        const text = pick("text")
        return `      <!-- ${block.block_type.toUpperCase()} · ${esc(block.label)} -->
      <tr><td style="padding:24px 36px; background:#FFF4F0; border-top:1px solid #F5C4B0; border-bottom:1px solid #F5C4B0; text-align:center;">
        ${headline ? `<p style="margin:0; font:800 16px/1.2 'Inter'; text-transform:uppercase; letter-spacing:.04em; color:#D94818;">${esc(headline)}</p>` : ""}
        ${body ? `<p style="margin:8px 0 0; font-size:13px; line-height:1.5; color:#8B3414;">${esc(body)}</p>` : ""}
        ${text && text !== body ? `<p style="margin:8px 0 0; font-size:13px; line-height:1.5; color:#8B3414;">${esc(text)}</p>` : ""}
      </td></tr>`
      }
      case "comparison": {
        const headline = pick("headline", "heading")
        const rows = (c.rows as Array<{ label?: string; us?: string; them?: string }>) ?? []
        const items = list("items").map(itemText).filter(Boolean)
        const bodyHtml =
          rows.length > 0
            ? `<table cellpadding="0" cellspacing="0" role="presentation" style="width:100%; border-collapse:collapse; font-size:12px;">
          ${rows
            .map(
              (r, i) => `<tr style="background:${i % 2 ? "#FAFAFA" : "#fff"};">
            <td style="padding:10px 12px; border-bottom:1px solid #F0F0F0;">${esc(r.label)}</td>
            <td style="padding:10px 12px; border-bottom:1px solid #F0F0F0; text-align:center; font-weight:700;">${esc(r.us)}</td>
            <td style="padding:10px 12px; border-bottom:1px solid #F0F0F0; text-align:center; color:#888;">${esc(r.them)}</td>
          </tr>`,
            )
            .join("\n          ")}
        </table>`
            : items
                .map(
                  (it) => `<p style="margin:0 0 8px; padding:10px 12px; background:#FAFAFA; border:1px solid #F0F0F0; border-radius:4px; font-size:12px; line-height:1.5;">${esc(it)}</p>`,
                )
                .join("\n        ")
        return `      <!-- ${block.block_type.toUpperCase()} · ${esc(block.label)} -->
      <tr><td style="padding:32px 36px;">
        ${headline ? `<h3 style="margin:0 0 18px; text-align:center; font:900 20px/1 'Inter'; text-transform:uppercase;">${esc(headline)}</h3>` : ""}
        ${bodyHtml}
      </td></tr>`
      }
      case "story": {
        const headline = pick("headline", "heading")
        const body = pick("body", "text")
        const cta = pick("cta_text", "cta")
        return `      <!-- ${block.block_type.toUpperCase()} · ${esc(block.label)} -->
      <tr><td style="padding:32px 36px;">
        <div style="background:#FAFAFA; border:1px solid #F0F0F0; border-radius:8px; padding:32px;">
          ${pick("image_url") ? `<img src="${esc(pick("image_url"))}" alt="" style="display:block; width:100%; height:auto; border-radius:6px; margin:0 0 18px;"/>` : ""}
          ${headline ? `<h3 style="margin:0 0 12px; font:900 22px/1.1 'Inter'; text-transform:uppercase; letter-spacing:-.01em;">${esc(headline)}</h3>` : ""}
          ${body ? `<p style="margin:0 0 18px; font-size:13px; line-height:1.7; color:#333; white-space:pre-wrap;">${esc(body)}</p>` : ""}
          ${cta ? `<a href="${esc(pick("cta_url", "url")) || "{{cta_url}}"}" class="cta">${esc(cta)}</a>` : ""}
        </div>
      </td></tr>`
      }
      case "letter": {
        const greeting = pick("greeting")
        const body = pick("body", "text")
        const signoff = pick("signoff")
        const author = pick("author")
        const cta = pick("cta", "cta_text")
        return `      <!-- ${block.block_type.toUpperCase()} · ${esc(block.label)} -->
      <tr><td style="padding:48px 56px;">
        ${greeting ? `<p style="margin:0 0 18px; font-size:14px; line-height:1.65;">${esc(greeting)}</p>` : ""}
        ${body ? `<p style="margin:0 0 24px; font-size:14px; line-height:1.75; white-space:pre-wrap;">${esc(body)}</p>` : ""}
        ${signoff ? `<p style="margin:0 0 6px; font-size:14px; line-height:1.5;">${esc(signoff)}</p>` : ""}
        ${author ? `<p style="margin:0 0 18px; font:700 13px/1 'Inter'; letter-spacing:.04em;">${esc(author)}</p>` : ""}
        ${cta ? `<a href="${esc(pick("url", "cta_url")) || "{{cta_url}}"}" class="cta">${esc(cta)}</a>` : ""}
      </td></tr>`
      }
      default:
        return `      <!-- ${block.block_type.toUpperCase()} · ${esc(block.label)} -->`
    }
  }

  const body = blocks.map(renderBlock).join("\n")

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${esc(email.name)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
  <style>
    body { margin: 0; background: #F8F8F8; font-family: 'Inter', Arial, sans-serif; color: #2A2A2A; }
    .wrap { width: 600px; max-width: 100%; margin: 0 auto; background: #FFFFFF; }
    .hero { background: #4E62D8; }
    .cta { display: inline-block; padding: 15px 32px; background: #4E62D8; color: #FFFFFF;
      font: 700 13px/1 'Inter'; letter-spacing: 0.06em; text-decoration: none; border-radius: 999px; }
    .display { font: 900 32px/1 'Inter'; color: #0F0F0F; text-transform: uppercase; letter-spacing: -0.02em; }
    .coupon { display: inline-flex; border: 1.5px dashed #2A2A2A; border-radius: 4px; overflow: hidden; }
    .coupon .code { background: #0F0F0F; color: #FFFFFF; padding: 14px 20px;
      font: 800 14px/1 'Inter'; letter-spacing: 0.06em; }
  </style>
</head>
<body>
  <table class="wrap" cellpadding="0" cellspacing="0" role="presentation">
${body}
  </table>
</body>
</html>`
}

function wrapInEmailShell(name: string, bodyHtml: string): string {
  const escName = (name ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escName}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
  <style>
    body { margin: 0; background: #F8F8F8; font-family: 'Inter', Arial, sans-serif; color: #2A2A2A; }
    .wrap { width: 600px; max-width: 100%; margin: 0 auto; background: #FFFFFF; }
    .hero { background: #4E62D8; }
    .cta { display: inline-block; padding: 15px 32px; background: #4E62D8; color: #FFFFFF;
      font: 700 13px/1 'Inter'; letter-spacing: 0.06em; text-decoration: none; border-radius: 999px; }
    .display { font: 900 32px/1 'Inter'; color: #0F0F0F; text-transform: uppercase; letter-spacing: -0.02em; }
    .coupon { display: inline-flex; border: 1.5px dashed #2A2A2A; border-radius: 4px; overflow: hidden; }
    .coupon .code { background: #0F0F0F; color: #FFFFFF; padding: 14px 20px;
      font: 800 14px/1 'Inter'; letter-spacing: 0.06em; }
    h1, h2, h3 { font-family: 'Inter', Arial, sans-serif; color: #0F0F0F; }
    a { color: #4E62D8; }
  </style>
</head>
<body>
  <table class="wrap" cellpadding="0" cellspacing="0" role="presentation">
    <tr><td style="padding: 24px 36px;">
${bodyHtml}
    </td></tr>
  </table>
</body>
</html>`
}
