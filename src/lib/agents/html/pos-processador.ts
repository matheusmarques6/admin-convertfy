/**
 * Pós-processador do HTML final — módulo PURO (Trilha B2, set/2026).
 *
 * Só correções SEGURAS: as que um humano faria sem olhar o desenho, porque
 * não mudam o que o leitor vê — mudam o que o cliente de e-mail consegue
 * renderizar. Cada uma reporta `{id, n}`, e o resultado é idempotente:
 * rodar duas vezes não muda nada na segunda (teste).
 *
 * Ordem, e o porquê dela:
 *  1. funde os `<style>` num só (preservando `@media` e a ordem) — os
 *     passos seguintes leem UM bloco;
 *  2. resolve `var(--x)` pelo `:root` (o `assemble-document.ts` gera
 *     `--bg,--text,--heading,--button-bg,--button-text,--accent`) e apaga
 *     o `:root` — Gmail e Outlook ignoram custom properties e o fundo vira
 *     branco;
 *  3. remove comentários fora de MSO e fora de `cfy:` — 91 no batch
 *     6249aef2, todos rótulos de desenvolvimento;
 *  4. sincroniza o `<center>` do `v:roundrect` com o `<a>` irmão — o
 *     Outlook mostrava "DIGITAL GIFT CARD" numa marca de cuecas;
 *  5. remove `<tr>`/`<div>` cuja única filha renderizável é `<img src="">`
 *     (o Outlook desenha o ícone de imagem quebrada), e o `<img src="">`
 *     solto que sobrar;
 *  6. `alt` das imagens: rótulo conhecido pela URL, senão o padrão da loja;
 *  7. ano do copyright = corrente;
 *  8. `line-height` menor que 1,1× a fonte → 1,1× (texto cortado no Outlook);
 *     título ≥ 20px sem line-height ganha um.
 *
 * Fora daqui, de propósito: âncora sem destino, texto de exemplo,
 * placeholder, contraste e largura — corrigir isso é inventar conteúdo ou
 * redesenhar, e o lint os reporta como bloqueio.
 */

import {
  COMENTARIO_RE,
  blocosDeStyle,
  ehComentarioCondicional,
  ehMarcadorInterno,
  paresMsoAnchor,
} from "./lint-envio"

/** Passo 14: entrelinha mínima em relação ao corpo. */
export const FATOR_LINE_HEIGHT = 1.1
/** Fonte a partir da qual a ausência de line-height é corrigida. */
export const TITULO_MIN_PX = 20

export type FixId =
  | "styles_fundidos"
  | "css_vars_resolvidas"
  | "comentarios_removidos"
  | "mso_sincronizado"
  | "img_vazias_removidas"
  | "alt_preenchido"
  | "ano_atualizado"
  | "line_height_corrigido"

export interface FixAplicado {
  id: FixId
  n: number
  detalhe?: string
}

export interface PosProcessadorContexto {
  ano?: number
  /** URL da imagem → texto do alt (vem do `content.images[campo].alt` dos blocos). */
  altPorUrl?: Map<string, string>
  /** Alt de última instância (ex.: nome da loja). Sem ele, alt vazio fica vazio. */
  altPadrao?: string | null
}

export interface PosProcessadorResultado {
  html: string
  aplicados: FixAplicado[]
}

export function posProcessar(htmlEntrada: string, ctx: PosProcessadorContexto = {}): PosProcessadorResultado {
  const aplicados: FixAplicado[] = []
  let html = htmlEntrada
  if (!html || !html.trim()) return { html, aplicados }

  // 1. <style> fundidos ------------------------------------------------------
  {
    const styles = blocosDeStyle(html)
    if (styles.length > 1) {
      const corpo = styles.map((s) => s.corpo.trim()).filter(Boolean).join("\n\n")
      const abertura = styles[0].abertura
      let out = html.slice(0, styles[0].start) + `<style${abertura}>\n${corpo}\n</style>`
      let cursor = styles[0].end
      for (let i = 1; i < styles.length; i++) {
        out += html.slice(cursor, styles[i].start)
        cursor = styles[i].end
      }
      out += html.slice(cursor)
      html = out
      aplicados.push({ id: "styles_fundidos", n: styles.length })
    }
  }

  // 2. var(--x) resolvidas ------------------------------------------------------
  {
    const vars = new Map<string, string>()
    for (const s of blocosDeStyle(html)) {
      for (const root of s.corpo.matchAll(/:root\s*\{([^}]*)\}/gi)) {
        for (const d of root[1].matchAll(/(--[a-z0-9_-]+)\s*:\s*([^;]+);?/gi)) vars.set(d[1].trim(), d[2].trim())
      }
    }
    let n = 0
    const naoResolvidas = new Set<string>()
    html = html.replace(/var\(\s*(--[a-z0-9_-]+)\s*(?:,\s*([^)]+))?\)/gi, (m, nome: string, fallback?: string) => {
      const v = vars.get(nome) ?? fallback?.trim()
      if (!v) {
        naoResolvidas.add(nome)
        return m
      }
      n++
      return v
    })
    if (n > 0) {
      // O :root só sai quando nada mais depende dele.
      if (naoResolvidas.size === 0) {
        html = html.replace(/:root\s*\{[^}]*\}\s*/gi, "")
      }
      aplicados.push({ id: "css_vars_resolvidas", n, detalhe: Array.from(vars.keys()).join(", ") })
    }
  }

  // 3. comentários de desenvolvimento ---------------------------------------
  {
    let n = 0
    html = html.replace(COMENTARIO_RE, (c) => {
      if (ehComentarioCondicional(c) || ehMarcadorInterno(c)) return c
      n++
      return ""
    })
    if (n > 0) aplicados.push({ id: "comentarios_removidos", n })
  }

  // 4. MSO ⇄ <a> ---------------------------------------------------------------
  {
    const pares = paresMsoAnchor(html)
    // De trás para frente: reescrever não desloca os ranges anteriores.
    let n = 0
    for (const p of [...pares].reverse()) {
      if (p.anchorTexto == null) continue
      if (p.centerTexto === p.anchorTexto) continue
      html = html.slice(0, p.centerRange.start) + p.anchorTexto + html.slice(p.centerRange.end)
      n++
    }
    if (n > 0) aplicados.push({ id: "mso_sincronizado", n })
  }

  // 5. <img src=""> ---------------------------------------------------------
  {
    let n = 0
    const IMG_VAZIA = /<img\b(?:(?!\bsrc\s*=\s*["'][^"']+["'])[^>])*>/i
    const soImgVazia = (inner: string) =>
      inner.replace(/<\/?(?:td|tbody|table|span|p)\b[^>]*>/gi, "").replace(/&nbsp;/gi, "").replace(IMG_VAZIA, "").trim() === "" &&
      IMG_VAZIA.test(inner)
    html = html.replace(/<tr\b[^>]*>([\s\S]*?)<\/tr\s*>/gi, (m, inner: string) => {
      if (!/<img\b/i.test(inner) || /<tr\b/i.test(inner)) return m
      if (soImgVazia(inner)) {
        n++
        return ""
      }
      return m
    })
    html = html.replace(/<div\b[^>]*>([\s\S]*?)<\/div\s*>/gi, (m, inner: string) => {
      if (!/<img\b/i.test(inner) || /<div\b/i.test(inner)) return m
      if (soImgVazia(inner)) {
        n++
        return ""
      }
      return m
    })
    // O que sobrou fora de linha própria sai como tag.
    html = html.replace(/<img\b(?:(?!\bsrc\s*=\s*["'][^"']+["'])[^>])*>/gi, () => {
      n++
      return ""
    })
    if (n > 0) aplicados.push({ id: "img_vazias_removidas", n })
  }

  // 6. alt ---------------------------------------------------------------------
  {
    let n = 0
    html = html.replace(/<img\b[^>]*>/gi, (tag) => {
      const src = /\bsrc\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1]
      if (!src) return tag
      const w = /\bwidth\s*=\s*["']?(\d+)/i.exec(tag)
      if (w && Number(w[1]) <= 1) return tag
      const alt = /\balt\s*=\s*["']([^"']*)["']/i.exec(tag)
      if (alt && alt[1].trim() && !/^(?:image|imagem|img|photo|foto|banner|icon|placeholder)?\s*\d*$/i.test(alt[1].trim())) return tag
      const novo = ctx.altPorUrl?.get(src) ?? ctx.altPadrao ?? null
      if (!novo) return tag
      n++
      const seguro = novo.replace(/"/g, "&quot;")
      return alt ? tag.replace(/\balt\s*=\s*["'][^"']*["']/i, `alt="${seguro}"`) : tag.replace(/<img\b/i, `<img alt="${seguro}"`)
    })
    if (n > 0) aplicados.push({ id: "alt_preenchido", n })
  }

  // 7. ano ---------------------------------------------------------------------
  {
    const ano = ctx.ano ?? new Date().getFullYear()
    let n = 0
    html = html.replace(/((?:©|&copy;|&#169;)\s*(?:[A-Za-z ,.]{0,30}?))(20\d\d)/g, (m, prefixo: string, a: string) => {
      if (Number(a) === ano) return m
      n++
      return `${prefixo}${ano}`
    })
    if (n > 0) aplicados.push({ id: "ano_atualizado", n })
  }

  // 8. line-height -------------------------------------------------------------
  // Passo 14: a régua é `line-height ≥ 1,1 × font-size` (o título de 50px
  // com 43px passava). Três formas da mesma falta: px abaixo da fonte;
  // `normal`/unitless abaixo de 1,1 (o Outlook resolve `normal` apertado em
  // fontes grandes); e TÍTULO (≥ 20px) sem line-height nenhum — ali o
  // cliente escolhe, e escolhe mal. Só mexe na mesma declaração; herança
  // por CSS não é tocada.
  {
    let n = 0
    html = html.replace(/style\s*=\s*"([^"]*)"/gi, (m, decl: string) => {
      const fs = /font-size\s*:\s*(\d+(?:\.\d+)?)px/i.exec(decl)
      if (!fs) return m
      const fonte = Number(fs[1])
      const minimo = Math.round(fonte * FATOR_LINE_HEIGHT)
      const lpx = /line-height\s*:\s*(\d+(?:\.\d+)?)px/i.exec(decl)
      if (lpx) {
        if (Number(lpx[1]) >= minimo) return m
        n++
        return `style="${decl.replace(/line-height\s*:\s*\d+(?:\.\d+)?px/i, `line-height:${minimo}px`)}"`
      }
      const lu = /line-height\s*:\s*(normal|\d+(?:\.\d+)?)(?![\w%.])/i.exec(decl)
      if (lu) {
        const valor = lu[1].toLowerCase() === "normal" ? 1.0 : Number(lu[1])
        if (valor >= FATOR_LINE_HEIGHT) return m
        n++
        return `style="${decl.replace(/line-height\s*:\s*(?:normal|\d+(?:\.\d+)?)(?![\w%.])/i, `line-height:${minimo}px`)}"`
      }
      if (/line-height\s*:/i.test(decl)) return m // em/%/rem: fora da régua
      if (fonte < TITULO_MIN_PX) return m
      n++
      return `style="${decl.replace(/\s*;?\s*$/, "")};line-height:${minimo}px"`
    })
    if (n > 0) aplicados.push({ id: "line_height_corrigido", n })
  }

  return { html, aplicados }
}
