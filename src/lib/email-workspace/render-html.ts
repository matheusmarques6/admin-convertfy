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
  ComparisonBlockContent,
  CouponBlockContent,
  EmailBlock,
  EmailFlowEmail,
  FeaturesBlockContent,
  HeaderBlockContent,
  HeadlineBlockContent,
  HeroBlockContent,
  LetterBlockContent,
  ProductsBlockContent,
  SocialProofBlockContent,
  StoryBlockContent,
  TestimonialsBlockContent,
  TextBlockContent,
  UrgencyBlockContent,
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
    switch (block.block_type) {
      case "hero": {
        const h = c as HeroBlockContent
        return `      <!-- ${block.block_type.toUpperCase()} · ${esc(block.label)} -->
      <tr><td class="hero"><img src="${esc(h.image_url) || "{{hero_image_url}}"}" alt="${esc(h.image_alt ?? h.headline ?? "")}" width="600" style="display:block;width:100%;height:auto;border:0;"/></td></tr>
      <tr><td style="padding:32px 36px 16px; text-align:center;">
        ${h.eyebrow ? `<p style="margin:0; font:700 11px/1 'Inter'; letter-spacing:.22em;">${esc(h.eyebrow)}</p>` : ""}
        ${h.headline ? `<h1 class="display" style="margin:10px 0 0;">${esc(h.headline)}</h1>` : ""}
      </td></tr>
      ${h.body ? `<tr><td style="padding:14px 56px 28px; text-align:center;"><p style="margin:0; font-size:14px; line-height:1.65;">${esc(h.body)}</p></td></tr>` : ""}
      ${h.cta_text ? `<tr><td style="padding:0 36px 36px; text-align:center;"><a href="${esc(h.cta_url) || "{{cta_url}}"}" class="cta">${esc(h.cta_text)}</a></td></tr>` : ""}`
      }
      case "text": {
        const t = c as TextBlockContent
        return `      <!-- ${block.block_type.toUpperCase()} · ${esc(block.label)} -->
      <tr><td style="padding:40px 56px; text-align:center; border-top:1px solid #F0F0F0;">
        ${t.headline ? `<h2 style="margin:0; font:900 32px/1 'Inter'; letter-spacing:-.02em; text-transform:uppercase;">${esc(t.headline)}</h2>` : ""}
        ${t.body ? `<p style="margin:20px auto 0; max-width:440px; font-size:14px; line-height:1.65;">${esc(t.body)}</p>` : ""}
      </td></tr>`
      }
      case "coupon": {
        const co = c as CouponBlockContent
        return `      <!-- ${block.block_type.toUpperCase()} · ${esc(block.label)} -->
      <tr><td style="padding:32px 56px; text-align:center; background:#FAFAFA; border-top:1px solid #F0F0F0;">
        <p style="margin:0 0 8px; font:700 10px/1 'Inter'; letter-spacing:.22em; color:#666;">CUPOM</p>
        <span class="coupon"><span class="code">${esc(co.code) || "{{coupon_code}}"}</span></span>
        ${co.hint ? `<p style="margin:12px 0 0; font-size:11px; letter-spacing:.06em; text-transform:uppercase; color:#666;">${esc(co.hint)}</p>` : ""}
        ${co.cta_text ? `<a href="${esc(co.cta_url) || "{{cta_url}}"}" class="cta" style="margin-top:16px;">${esc(co.cta_text)}</a>` : ""}
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
        const f = c as Record<string, unknown>
        const cols = (f.columns as Array<{ links?: Array<{ label: string; url: string }> }>) ?? []
        const links = cols.flatMap((col) => col.links ?? [])
        const copyright = (f.copyright as string) ?? ""
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
        const ct = c as { text?: string; url?: string }
        return `      <!-- ${block.block_type.toUpperCase()} · ${esc(block.label)} -->
      <tr><td style="padding:24px 36px; text-align:center;"><a href="${esc(ct.url) || "{{cta_url}}"}" class="cta">${esc(ct.text) || "CONTINUAR"}</a></td></tr>`
      }
      case "divider":
        return `      <!-- DIVIDER -->
      <tr><td style="padding:0 36px;"><div style="height:1px;background:#F0F0F0;"></div></td></tr>`
      case "spacer":
        return `      <!-- SPACER -->
      <tr><td style="height:24px;line-height:24px;font-size:0;">&nbsp;</td></tr>`
      // ── Expansão welcome universal 2026-06 ──
      case "header": {
        const h = c as HeaderBlockContent
        return `      <!-- ${block.block_type.toUpperCase()} · ${esc(block.label)} -->
      <tr><td style="padding:20px 36px; text-align:center; border-bottom:1px solid #F0F0F0;">
        ${h.logo_url ? `<img src="${esc(h.logo_url)}" alt="${esc(h.tagline ?? "")}" style="height:32px; display:inline-block;"/>` : `<span style="font:800 16px/1 'Inter'; letter-spacing:.08em; text-transform:uppercase;">{{brand_name}}</span>`}
        ${h.tagline ? `<p style="margin:6px 0 0; font-size:11px; letter-spacing:.08em; text-transform:uppercase; color:#888;">${esc(h.tagline)}</p>` : ""}
      </td></tr>`
      }
      case "headline": {
        const h = c as HeadlineBlockContent
        return `      <!-- ${block.block_type.toUpperCase()} · ${esc(block.label)} -->
      <tr><td style="padding:40px 36px 16px; text-align:center;">
        ${h.eyebrow ? `<p style="margin:0 0 10px; font:700 11px/1 'Inter'; letter-spacing:.22em; color:#666;">${esc(h.eyebrow)}</p>` : ""}
        ${h.headline ? `<h2 class="display" style="margin:0;">${esc(h.headline)}</h2>` : ""}
      </td></tr>`
      }
      case "features": {
        const f = c as FeaturesBlockContent
        const items = f.items ?? []
        return `      <!-- ${block.block_type.toUpperCase()} · ${esc(block.label)} -->
      <tr><td style="padding:24px 36px; background:#FAFAFA; border-top:1px solid #F0F0F0; border-bottom:1px solid #F0F0F0;">
        <table cellpadding="0" cellspacing="0" role="presentation" style="width:100%;"><tr>
        ${items
          .map(
            (it) => `<td style="text-align:center; padding:0 8px;">
          ${it.icon ? `<div style="font-size:22px; line-height:1;">${esc(it.icon)}</div>` : ""}
          <p style="margin:8px 0 0; font:600 11px/1.3 'Inter'; letter-spacing:.04em;">${esc(it.label)}</p>
        </td>`,
          )
          .join("\n        ")}
        </tr></table>
      </td></tr>`
      }
      case "social_proof": {
        const sp = c as SocialProofBlockContent
        const stars = sp.rating
          ? "★".repeat(Math.round(sp.rating)) +
            "☆".repeat(Math.max(0, 5 - Math.round(sp.rating)))
          : ""
        return `      <!-- ${block.block_type.toUpperCase()} · ${esc(block.label)} -->
      <tr><td style="padding:32px 36px; text-align:center; background:#F8F8F8;">
        ${sp.number ? `<p style="margin:0; font:900 28px/1 'Inter';">${esc(sp.number)}</p>` : ""}
        ${stars ? `<p style="margin:8px 0 0; font-size:16px; letter-spacing:.06em; color:#F5A623;">${stars}</p>` : ""}
        ${sp.label ? `<p style="margin:8px 0 0; font:600 12px/1.3 'Inter'; text-transform:uppercase; letter-spacing:.1em;">${esc(sp.label)}</p>` : ""}
        ${sp.body ? `<p style="margin:6px 0 0; font-size:12px; color:#666;">${esc(sp.body)}</p>` : ""}
      </td></tr>`
      }
      case "testimonials": {
        const t = c as TestimonialsBlockContent
        const items = t.items ?? []
        return `      <!-- ${block.block_type.toUpperCase()} · ${esc(block.label)} -->
      <tr><td style="padding:32px 36px; border-top:1px solid #F0F0F0;">
        ${t.headline ? `<h3 style="margin:0 0 18px; text-align:center; font:900 20px/1 'Inter'; text-transform:uppercase; letter-spacing:-.01em;">${esc(t.headline)}</h3>` : ""}
        ${items
          .map(
            (it) => `<div style="background:#FAFAFA; border:1px solid #F0F0F0; border-radius:6px; padding:18px; margin-bottom:10px;">
          ${it.rating ? `<p style="margin:0 0 8px; font-size:14px; color:#F5A623;">${"★".repeat(Math.round(it.rating))}</p>` : ""}
          <p style="margin:0 0 10px; font-size:13px; line-height:1.55; font-style:italic;">&ldquo;${esc(it.quote)}&rdquo;</p>
          <p style="margin:0; font:700 11px/1 'Inter'; letter-spacing:.06em; text-transform:uppercase; color:#666;">— ${esc(it.author)}</p>
        </div>`,
          )
          .join("\n        ")}
      </td></tr>`
      }
      case "urgency": {
        const u = c as UrgencyBlockContent
        return `      <!-- ${block.block_type.toUpperCase()} · ${esc(block.label)} -->
      <tr><td style="padding:24px 36px; background:#FFF4F0; border-top:1px solid #F5C4B0; border-bottom:1px solid #F5C4B0; text-align:center;">
        ${u.headline ? `<p style="margin:0; font:800 16px/1.2 'Inter'; text-transform:uppercase; letter-spacing:.04em; color:#D94818;">${esc(u.headline)}</p>` : ""}
        ${u.body ? `<p style="margin:8px 0 0; font-size:13px; line-height:1.5; color:#8B3414;">${esc(u.body)}</p>` : ""}
      </td></tr>`
      }
      case "comparison": {
        const cmp = c as ComparisonBlockContent
        const rows = cmp.rows ?? []
        const us = cmp.us_label ?? "Nós"
        const them = cmp.them_label ?? "Outros"
        return `      <!-- ${block.block_type.toUpperCase()} · ${esc(block.label)} -->
      <tr><td style="padding:32px 36px;">
        ${cmp.headline ? `<h3 style="margin:0 0 18px; text-align:center; font:900 20px/1 'Inter'; text-transform:uppercase;">${esc(cmp.headline)}</h3>` : ""}
        <table cellpadding="0" cellspacing="0" role="presentation" style="width:100%; border-collapse:collapse; font-size:12px;">
          <tr style="background:#0F0F0F; color:#fff;">
            <th style="padding:10px 12px; text-align:left; font:700 11px/1 'Inter'; letter-spacing:.06em; text-transform:uppercase;"></th>
            <th style="padding:10px 12px; text-align:center; font:700 11px/1 'Inter'; letter-spacing:.06em; text-transform:uppercase;">${esc(us)}</th>
            <th style="padding:10px 12px; text-align:center; font:700 11px/1 'Inter'; letter-spacing:.06em; text-transform:uppercase; opacity:.7;">${esc(them)}</th>
          </tr>
          ${rows
            .map(
              (r, i) => `<tr style="background:${i % 2 ? "#FAFAFA" : "#fff"};">
            <td style="padding:10px 12px; border-bottom:1px solid #F0F0F0;">${esc(r.label)}</td>
            <td style="padding:10px 12px; border-bottom:1px solid #F0F0F0; text-align:center; font-weight:700; color:#0F0F0F;">${esc(r.us)}</td>
            <td style="padding:10px 12px; border-bottom:1px solid #F0F0F0; text-align:center; color:#888;">${esc(r.them)}</td>
          </tr>`,
            )
            .join("\n          ")}
        </table>
      </td></tr>`
      }
      case "story": {
        const st = c as StoryBlockContent
        return `      <!-- ${block.block_type.toUpperCase()} · ${esc(block.label)} -->
      <tr><td style="padding:32px 36px;">
        <div style="background:#FAFAFA; border:1px solid #F0F0F0; border-radius:8px; padding:32px;">
          ${st.image_url ? `<img src="${esc(st.image_url)}" alt="" style="display:block; width:100%; height:auto; border-radius:6px; margin:0 0 18px;"/>` : ""}
          ${st.headline ? `<h3 style="margin:0 0 12px; font:900 22px/1.1 'Inter'; text-transform:uppercase; letter-spacing:-.01em;">${esc(st.headline)}</h3>` : ""}
          ${st.body ? `<p style="margin:0 0 18px; font-size:13px; line-height:1.7; color:#333;">${esc(st.body)}</p>` : ""}
          ${st.cta_text ? `<a href="${esc(st.cta_url) || "{{cta_url}}"}" class="cta">${esc(st.cta_text)}</a>` : ""}
        </div>
      </td></tr>`
      }
      case "letter": {
        const l = c as LetterBlockContent
        return `      <!-- ${block.block_type.toUpperCase()} · ${esc(block.label)} -->
      <tr><td style="padding:48px 56px;">
        ${l.greeting ? `<p style="margin:0 0 18px; font-size:14px; line-height:1.65;">${esc(l.greeting)}</p>` : ""}
        ${l.body ? `<p style="margin:0 0 24px; font-size:14px; line-height:1.75; white-space:pre-wrap;">${esc(l.body)}</p>` : ""}
        ${l.signoff ? `<p style="margin:0 0 6px; font-size:14px; line-height:1.5;">${esc(l.signoff)}</p>` : ""}
        ${l.author ? `<p style="margin:0; font:700 13px/1 'Inter'; letter-spacing:.04em;">${esc(l.author)}</p>` : ""}
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
