/**
 * Tokenização de uma variante EXISTENTE (B5): hex e família fixos viram
 * `{{COR_*}}`/`{{FONTE_*}}`/`{{RAIO_BOTAO}}` — o caminho de migração das
 * 41 anatomias cadastradas antes dos tokens.
 *
 * É HEURÍSTICA, e por isso a saída é um DIFF para revisão humana, não uma
 * gravação: o `mapa` diz o que virou o quê e por quê, `nao_inferidos` lista
 * o hex que não coube em papel nenhum (fica hex, e o Cores & Botões segue
 * cuidando dele), e a tela renderiza o resultado em duas paletas antes do
 * POST. Inferência errada aqui sai em TODA peça que usar a variante — daí o
 * viés para deixar de fora em vez de adivinhar.
 *
 * O que ela infere, na ordem:
 *   COR_FUNDO      — fundo do CONTAINER (maior `cobre_px` ≥ 560), senão o
 *                    fundo mais frequente.
 *   COR_PRINCIPAL  — fundo do botão preenchido (`extrairCtas`); e o label
 *                    dele → COR_TEXTO_SOBRE_PRINCIPAL. Botões com fundos
 *                    diferentes entre si: só o mais frequente é principal.
 *   COR_TEXTO      — cor de texto mais frequente que não é label de botão.
 *   COR_SUPERFICIE — fundo ≠ container ≠ botão que pousa dentro do
 *                    container (`dentro_de`); o mais frequente.
 *   RAIO_BOTAO     — `border-radius` no `<a>` dos botões.
 *   FONTE_TITULO / FONTE_CORPO — toda `font-family`, pela mesma régua do
 *                    `normalizeFonts` (tamanho ≥ 20px, peso alto ou h1-h3).
 *   COR_DESTAQUE   — NÃO é inferida: acento é a cor que menos se distingue
 *                    de "cor que sobrou", e errar aqui pinta filete de
 *                    marca com a cor errada em todas as peças.
 *   PESO_*         — NÃO são inferidos: `font-weight:700` num `<strong>`
 *                    do corpo não é o peso do título.
 *
 * Um hex tem UM destino por família de contexto (fundo × texto): o branco
 * pode ser COR_FUNDO como fundo e COR_TEXTO_SOBRE_PRINCIPAL como texto ao
 * mesmo tempo — são declarações diferentes. Dentro da mesma família, o
 * primeiro papel (na ordem acima) vence e o conflito é reportado.
 *
 * Puro (zero I/O). Idempotente: variante já tokenizada devolve o mesmo
 * HTML com `ja_tokenizado: true`.
 */

import { extrairCtas } from "./color-faixas"
import {
  canonicalHex,
  contextOf,
  extractColorInventory,
  mesmoPapelDeEscrita,
  type ColorContext,
  type ColorInventoryEntry,
} from "./color-inventory"
import { temTokensDeIdentidade, tokensNoHtml, type TokenDeIdentidade } from "./identity-tokens"

export type FamiliaDeContexto = "fundo" | "texto" | "fonte" | "raio"

export interface MapaDeToken {
  token: TokenDeIdentidade
  /** O valor que saiu: hex canônico, família de fonte ou raio em px. */
  de: string
  familia: FamiliaDeContexto
  ocorrencias: number
  /** Por que este valor recebeu este papel — texto para a revisão. */
  motivo: string
}

export interface NaoInferido {
  valor: string
  contextos: string[]
  ocorrencias: number
  /** `sem_papel` = não coube na régua; `conflito` = já tinha outro papel na mesma família. */
  razao: "sem_papel" | "conflito"
  conflito_com?: TokenDeIdentidade
}

export interface Tokenizacao {
  html: string
  mapa: MapaDeToken[]
  nao_inferidos: NaoInferido[]
  /** O HTML já trazia tokens antes (a heurística não os toca). */
  ja_tokenizado: boolean
  /** Tokens presentes DEPOIS (os que já existiam + os inferidos). */
  tokens_presentes: TokenDeIdentidade[]
  /** Nada mudou (já tokenizada ou nada inferível). */
  inalterado: boolean
}

const CONTAINER_MIN_PX = 560
const HEADING_MIN_PX = 20
const FONT_FAMILY_RE = /font-family\s*:\s*((?:'[^']*'|"[^"]*"|[^;}"'])+)/gi
const FONT_SIZE_RE = /font-size\s*:\s*(\d+(?:\.\d+)?)px/i
const BOLD_RE = /font-weight\s*:\s*(?:[6-9]00|bold)/i
const HEADING_TAG_RE = /<h[1-3][\s>]/i
const DECL_OPEN = `"'{>`
const DECL_CLOSE = `"'}<`

const ehFundo = (c: ColorContext) => c === "background" || c === "bgcolor"
const ocorrenciasEm = (e: ColorInventoryEntry, familia: "fundo" | "texto") =>
  familia === "fundo"
    ? (e.contextos.background ?? 0) + (e.contextos.bgcolor ?? 0)
    : (e.contextos.color ?? 0)

/** Contexto da declaração (o mesmo recorte do `normalizeFonts`). */
function declarationContext(html: string, offset: number): string {
  let start = offset
  while (start > 0 && !DECL_OPEN.includes(html[start - 1])) start--
  let end = offset
  while (end < html.length && !DECL_CLOSE.includes(html[end])) end++
  const lt = html.lastIndexOf("<", offset)
  const tag = lt === -1 ? "" : html.slice(lt, Math.min(offset, lt + 8))
  return `${tag} ${html.slice(start, end)}`
}

function looksLikeHeading(ctx: string): boolean {
  const size = FONT_SIZE_RE.exec(ctx)
  if (size && Number(size[1]) >= HEADING_MIN_PX) return true
  return BOLD_RE.test(ctx) || HEADING_TAG_RE.test(ctx)
}

/**
 * Troca todas as formas do hex (6 e 3 dígitos) por `{{token}}` só nas
 * ocorrências cujo contexto é da família pedida. Não passa por
 * `applyRecolor` porque ele canonicaliza o destino como hex (`rgba(...)`
 * com alpha viraria `rgba(NaN…)` com um token no lugar).
 */
function substituirHex(
  html: string,
  hex: string,
  token: TokenDeIdentidade,
  familia: "fundo" | "texto",
): { html: string; n: number } {
  const full = canonicalHex(hex).slice(1)
  if (full.length !== 6) return { html, n: 0 }
  const formas = [new RegExp(`(?<!&)#${full}\\b`, "gi")]
  if (full[0] === full[1] && full[2] === full[3] && full[4] === full[5]) {
    formas.push(new RegExp(`(?<!&)#${full[0]}${full[2]}${full[4]}\\b`, "gi"))
  }
  const alvo: ColorContext = familia === "fundo" ? "background" : "color"
  const hits: Array<{ start: number; end: number }> = []
  for (const re of formas) {
    for (const m of html.matchAll(re)) {
      const start = m.index ?? 0
      const ctx = contextOf(html, start)
      if (familia === "fundo" ? !ehFundo(ctx) : !mesmoPapelDeEscrita(alvo, ctx)) continue
      hits.push({ start, end: start + m[0].length })
    }
  }
  if (hits.length === 0) return { html, n: 0 }
  hits.sort((a, b) => b.start - a.start)
  let out = html
  let lastStart = Number.POSITIVE_INFINITY
  let n = 0
  for (const h of hits) {
    if (h.end > lastStart) continue
    out = out.slice(0, h.start) + `{{${token}}}` + out.slice(h.end)
    lastStart = h.start
    n++
  }
  return { html: out, n }
}

export function tokenizarIdentidade(html: string): Tokenizacao {
  const jaTokenizado = temTokensDeIdentidade(html)
  const inventario = extractColorInventory(html)
  const ctas = extrairCtas(html, [])
  const mapa: MapaDeToken[] = []
  const naoInferidos: NaoInferido[] = []
  const destino: Record<"fundo" | "texto", Map<string, TokenDeIdentidade>> = {
    fundo: new Map(),
    texto: new Map(),
  }
  const atribuir = (
    familia: "fundo" | "texto",
    hex: string | null | undefined,
    token: TokenDeIdentidade,
    motivo: string,
  ): boolean => {
    if (!hex) return false
    const c = canonicalHex(hex)
    if (!c || c.length !== 7) return false
    const atual = destino[familia].get(c)
    if (atual) {
      if (atual !== token) {
        naoInferidos.push({
          valor: c,
          contextos: [familia],
          ocorrencias: ocorrenciasEm(inventario.find((e) => e.valor === c) ?? { valor: c, ocorrencias: 0, contextos: {} }, familia),
          razao: "conflito",
          conflito_com: atual,
        })
      }
      return false
    }
    // O mesmo token não pode ter dois hex na mesma família (dois fundos de
    // botão diferentes → só um é principal; o outro fica hex).
    if ([...destino[familia].values()].includes(token)) return false
    destino[familia].set(c, token)
    mapa.push({
      token,
      de: c,
      familia,
      ocorrencias: ocorrenciasEm(inventario.find((e) => e.valor === c) ?? { valor: c, ocorrencias: 0, contextos: {} }, familia),
      motivo,
    })
    return true
  }

  // ── COR_FUNDO — o container ────────────────────────────────────────
  const fundos = inventario.filter((e) => ocorrenciasEm(e, "fundo") > 0)
  const container = fundos
    .filter((e) => (e.cobre_px ?? 0) >= CONTAINER_MIN_PX)
    .sort((a, b) => (b.cobre_px ?? 0) - (a.cobre_px ?? 0) || ocorrenciasEm(b, "fundo") - ocorrenciasEm(a, "fundo"))[0]
  const fundoEscolhido = container ?? [...fundos].sort((a, b) => ocorrenciasEm(b, "fundo") - ocorrenciasEm(a, "fundo"))[0]
  if (fundoEscolhido) {
    atribuir(
      "fundo",
      fundoEscolhido.valor,
      "COR_FUNDO",
      container
        ? `fundo do container de ${container.cobre_px}px`
        : "fundo mais frequente (nenhum container com largura declarada)",
    )
  }

  // ── COR_PRINCIPAL / COR_TEXTO_SOBRE_PRINCIPAL / RAIO_BOTAO — os botões ──
  const preenchidos = ctas.filter((c) => c.tipo === "preenchido" && c.fundo)
  const porFundo = new Map<string, number>()
  for (const c of preenchidos) porFundo.set(c.fundo as string, (porFundo.get(c.fundo as string) ?? 0) + 1)
  const fundoBotao = [...porFundo.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
  if (fundoBotao && canonicalHex(fundoBotao) !== fundoEscolhido?.valor) {
    atribuir("fundo", fundoBotao, "COR_PRINCIPAL", `fundo de ${porFundo.get(fundoBotao)} botão(ões) preenchido(s)`)
    const label = preenchidos.find((c) => c.fundo === fundoBotao && c.label)?.label
    if (label) atribuir("texto", label, "COR_TEXTO_SOBRE_PRINCIPAL", "label do botão principal")
  } else if (fundoBotao) {
    naoInferidos.push({ valor: canonicalHex(fundoBotao), contextos: ["fundo"], ocorrencias: porFundo.get(fundoBotao) ?? 0, razao: "conflito", conflito_com: "COR_FUNDO" })
  }

  // ── COR_TEXTO — o texto corrido ────────────────────────────────────
  const labelHex = destino.texto.size > 0 ? [...destino.texto.keys()] : []
  const textos = inventario
    .filter((e) => ocorrenciasEm(e, "texto") > 0 && !labelHex.includes(e.valor))
    .sort((a, b) => ocorrenciasEm(b, "texto") - ocorrenciasEm(a, "texto"))
  if (textos[0]) atribuir("texto", textos[0].valor, "COR_TEXTO", `cor de texto mais frequente (${ocorrenciasEm(textos[0], "texto")}×)`)

  // ── COR_SUPERFICIE — painel dentro do container ────────────────────
  const superficies = fundos
    .filter((e) => !destino.fundo.has(e.valor))
    .filter((e) => (fundoEscolhido ? Boolean(e.dentro_de?.[fundoEscolhido.valor]) : true))
    .sort((a, b) => ocorrenciasEm(b, "fundo") - ocorrenciasEm(a, "fundo"))
  if (superficies[0]) atribuir("fundo", superficies[0].valor, "COR_SUPERFICIE", "fundo de painel que pousa dentro do container")

  // ── o que sobrou ───────────────────────────────────────────────────
  for (const e of inventario) {
    const contextos = Object.keys(e.contextos)
    const temFundo = ocorrenciasEm(e, "fundo") > 0 && !destino.fundo.has(e.valor)
    const temTexto = ocorrenciasEm(e, "texto") > 0 && !destino.texto.has(e.valor)
    const outros = contextos.filter((c) => !ehFundo(c as ColorContext) && c !== "color")
    if (!temFundo && !temTexto && outros.length === 0) continue
    if (naoInferidos.some((n) => n.valor === e.valor && n.razao === "conflito")) continue
    naoInferidos.push({
      valor: e.valor,
      contextos: [...(temFundo ? ["fundo"] : []), ...(temTexto ? ["texto"] : []), ...outros],
      ocorrencias: e.ocorrencias,
      razao: "sem_papel",
    })
  }

  // ── aplicar cores ──────────────────────────────────────────────────
  let out = html
  for (const familia of ["fundo", "texto"] as const) {
    for (const [hex, token] of destino[familia]) {
      const r = substituirHex(out, hex, token, familia)
      out = r.html
      const item = mapa.find((m) => m.token === token && m.familia === familia)
      if (item) item.ocorrencias = r.n
    }
  }

  // ── Outlook: o botão VML declara a cor DUAS vezes ─────────────────
  // `fillcolor` do `v:roundrect` e `color` do `v:fill` não têm contexto
  // CSS (o inventário os vê como "outro"), mas são a mesma decisão de cor
  // escrita para outro cliente — sem isto o Outlook mostraria o botão na
  // cor da variante de origem.
  const principalHex = [...destino.fundo.entries()].find(([, t]) => t === "COR_PRINCIPAL")?.[0]
  const fundoHex = [...destino.fundo.entries()].find(([, t]) => t === "COR_FUNDO")?.[0]
  const mesmoHex = (a: string, b: string) => canonicalHex(a) === canonicalHex(b)
  if (principalHex) {
    out = out.replace(/(fillcolor\s*=\s*")(#[0-9a-f]{3,6})(")/gi, (m, a: string, hex: string, z: string) =>
      mesmoHex(hex, principalHex) ? `${a}{{COR_PRINCIPAL}}${z}` : m,
    )
  }
  if (fundoHex) {
    out = out.replace(/(<v:fill\b[^>]*\bcolor\s*=\s*")(#[0-9a-f]{3,6})(")/gi, (m, a: string, hex: string, z: string) =>
      mesmoHex(hex, fundoHex) ? `${a}{{COR_FUNDO}}${z}` : m,
    )
  }

  // ── RAIO_BOTAO — no elemento que carrega o fundo do botão ──────────
  // O `border-radius` mora no `<a>` OU no `<td>` que pinta o botão (a
  // biblioteca faz dos dois jeitos); o que identifica o botão é o fundo
  // que acabou de virar {{COR_PRINCIPAL}}.
  const raios = preenchidos.map((c) => c.radius_px).filter((r): r is number => typeof r === "number")
  if (raios.length > 0 && principalHex) {
    let n = 0
    out = out.replace(/(<(?:a|td|table)\b[^>]*style\s*=\s*")([^"]*)(")/gi, (m, abre: string, style: string, fecha: string) => {
      if (!/\{\{COR_PRINCIPAL\}\}/.test(style)) return m
      const novo = style.replace(/border-radius\s*:\s*\d+(?:\.\d+)?px/i, (d) => {
        n++
        return d.replace(/\d+(?:\.\d+)?px/, "{{RAIO_BOTAO}}")
      })
      return `${abre}${novo}${fecha}`
    })
    if (n > 0) mapa.push({ token: "RAIO_BOTAO", de: `${raios[0]}px`, familia: "raio", ocorrencias: n, motivo: "border-radius do elemento que pinta o botão" })
  }

  // ── fontes ─────────────────────────────────────────────────────────
  const fontes = { titulo: new Map<string, number>(), corpo: new Map<string, number>() }
  out = out.replace(FONT_FAMILY_RE, (match, stack: string, offset: number) => {
    if (/\{\{FONTE_/.test(stack)) return match
    const ctx = declarationContext(out, offset)
    const papel = looksLikeHeading(ctx) ? "titulo" : "corpo"
    const familia = stack.trim()
    fontes[papel].set(familia, (fontes[papel].get(familia) ?? 0) + 1)
    return `font-family:${papel === "titulo" ? "{{FONTE_TITULO}}" : "{{FONTE_CORPO}}"}`
  })
  for (const papel of ["titulo", "corpo"] as const) {
    if (fontes[papel].size === 0) continue
    const total = [...fontes[papel].values()].reduce((a, b) => a + b, 0)
    mapa.push({
      token: papel === "titulo" ? "FONTE_TITULO" : "FONTE_CORPO",
      de: [...fontes[papel].keys()].join(" | "),
      familia: "fonte",
      ocorrencias: total,
      motivo: papel === "titulo" ? "font-family em declaração de título (≥20px, peso alto ou h1-h3)" : "font-family em declaração de corpo",
    })
  }

  return {
    html: out,
    mapa,
    nao_inferidos: naoInferidos,
    ja_tokenizado: jaTokenizado,
    tokens_presentes: tokensNoHtml(out),
    inalterado: out === html,
  }
}
