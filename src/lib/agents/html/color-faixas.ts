/**
 * color-faixas — a SEQUÊNCIA do documento para o agente Cores & Botões.
 *
 * O `color_format` decide por LUGAR ("esta faixa escurece", "o botão daquela
 * faixa inverte") e o inventário de cores só sabe falar de VALOR: diz que
 * `#FFFFFF` aparece 42 vezes, não em que ordem as faixas estão nem qual
 * delas é a hero ou o rodapé. Com essa lista sozinha, "há dois escuros
 * colados?" e "a última faixa contrasta com o rodapé?" são impossíveis de
 * responder.
 *
 * Este módulo produz o que faltava, cruzando duas coisas que já existem:
 * `locateBlockRegions` (os limites de cada bloco, dos marcadores `cfy:block`
 * que o runner mantém no documento até a fronteira de saída) e
 * `backgroundDeclarations` (os fundos, já na ordem do documento, com o fundo
 * que está atrás de cada um).
 *
 * Duas decisões que os testes travam:
 *
 * 1. **Sem marcadores, as listas saem VAZIAS.** Documento legado não expõe
 *    seus blocos; deduzir a ordem das faixas dali seria inventar endereço, e
 *    op endereçada ao lugar errado pinta a seção errada. O prompt diz ao
 *    agente o que fazer quando a lista chega vazia.
 * 2. **Só fundo de SEÇÃO é faixa** (`LARGURA_DE_SECAO`, 400px). Sem isso,
 *    um chip de 60px e o fundo de um botão entrariam no ritmo do e-mail
 *    como se fossem bandas.
 *
 * Puro (zero I/O) — testável.
 */

import { backgroundDeclarations, contrastRatio, relativeLuminance } from "./color-contrast"
import { canonicalHex, declaredWidth, LARGURA_DE_SECAO, openTagAt } from "./color-inventory"
import { buildAncestorChain, visibleTextOf, type Range } from "./dom-locator"
import { locateBlockRegions } from "./slot-finder"

/** Uma banda do e-mail: o fundo de um bloco, na ordem em que se rola. */
export interface Faixa {
  /** Posição na leitura, 1-based. */
  ordem: number
  /**
   * Índice do marcador `cfy:block` — o ENDEREÇO que as ops usam.
   *
   * Não é o `email_blocks.id`: aquele é UUID e vive no banco, este é o que
   * existe no documento e é o que o aplicador consegue localizar. Manter os
   * dois separados evita a op endereçada a um id que o HTML não conhece.
   */
  bloco: number
  /** Section do marcador (hero, body, products, footer…). */
  tipo: string
  /**
   * Hex canônico do fundo da faixa; `null` quando o bloco não declara fundo
   * de seção e pousa no canvas do documento. `null` NÃO é "branco": é "não
   * há declaração aqui para uma op trocar" — ver `editavel`.
   */
  fundo: string | null
  /** O fundo do bloco é uma FOTO. A hero é o caso normal. */
  foto: boolean
  /** Luminância relativa (WCAG) do fundo; null em foto ou sem fundo. */
  luminancia: number | null
  /** Maior largura declarada do container que pinta a faixa. */
  cobre_px: number | null
  /**
   * Existe declaração de fundo que uma op consegue trocar.
   *
   * Faixa não editável entra na lista mesmo assim: o agente precisa dela
   * para CONTAR o ritmo (tons, adjacência de escuros, contraste com o
   * rodapé) mesmo sem poder mudá-la. Omiti-la faria a conta dele dar errado.
   */
  editavel: boolean
  /**
   * Onde a cor da faixa está ESCRITA — os valores que uma op reescreve.
   *
   * São os ranges das declarações no tag do container (`bgcolor="#FFF"` e
   * `style="background-color:#FFF"` convivem no mesmo `<td>`), e não o hex
   * solto. A diferença não é detalhe: trocar "todo #FFFFFF do bloco"
   * repinta também o card branco e o botão branco que moram dentro dele —
   * e foi exatamente isso que desfez a inversão de um botão no primeiro
   * teste desta frente.
   */
  decls: Range[]
}

/** Um botão do e-mail, com a faixa em que ele pousa. */
export interface Cta {
  /** Id estável na ordem do documento: cta1, cta2… */
  id: string
  /** Bloco que o contém (índice do marcador); null fora de bloco. */
  bloco: number | null
  /** `ordem` da faixa em que ele está; null quando não há faixa. */
  faixa: number | null
  /** O label visível. */
  texto: string
  /** Destino do link. */
  href: string
  /** Hex do fundo do botão; null quando é vazado (só borda). */
  fundo: string | null
  /** Hex da cor do label. */
  label: string | null
  tipo: "preenchido" | "vazado"
  largura_px: number | null
  radius_px: number | null
  /**
   * Existe um `v:roundrect` do Outlook em volta.
   *
   * Importa porque a cor do botão fica declarada DUAS vezes nesse caso, e
   * uma op escopada que troque só a do `<td>` deixa o Outlook mostrando a
   * cor antiga — quebra em silêncio, num cliente só.
   */
  vml: boolean
  /** Contraste label × fundo do botão; null quando vazado. */
  contraste: number | null
  /** Região do elemento clicável, para o aplicador escopar a troca. */
  range: Range
}

const HEX_EM_ESTILO = "#(?:[0-9a-f]{6}|[0-9a-f]{3})"
const BG_NO_TAG = new RegExp(
  `(?:background(?:-color)?\\s*:\\s*(?:[^;"']*?\\s)?|bgcolor\\s*=\\s*"?)(${HEX_EM_ESTILO})`,
  "i",
)
const COR_NO_TAG = new RegExp(`(?:^|[;\\s"])color\\s*:\\s*(${HEX_EM_ESTILO})`, "i")
const RADIUS_NO_TAG = /border-radius\s*:\s*(\d{1,3})px/i
const BORDA_NO_TAG = new RegExp(`border(?:-\\w+)?\\s*:[^;"']*?(${HEX_EM_ESTILO})`, "i")
const IMAGEM_DE_FUNDO = /background(?:-image)?\s*:\s*[^;"']*url\(|(?:^|\s)background\s*=\s*"[^"]+\.(?:jpe?g|png|webp|gif)/i
const ABRE_LINK = /<a\b[^>]*\bhref\s*=\s*"([^"]*)"[^>]*>/gi
const FECHA_LINK = /<\/a\s*>/i
/** Label de botão é curto. Acima disso é parágrafo com link, não CTA. */
const LABEL_MAX_CHARS = 60
/** Quanto olhar para trás atrás do `v:roundrect` que embrulha o botão. */
const JANELA_VML = 500

function dentro(offset: number, r: Range): boolean {
  return offset >= r.start && offset < r.end
}

/** Limites do tag de abertura que contém `idx`. */
function rangeDoTag(html: string, idx: number): Range | null {
  const abre = html.lastIndexOf("<", idx)
  if (abre === -1) return null
  const fecha = html.indexOf(">", idx)
  if (fecha === -1) return null
  return { start: abre, end: fecha + 1 }
}

function hexOu(valor: string | undefined): string | null {
  return valor ? canonicalHex(valor) : null
}

/**
 * A sequência de faixas do documento.
 *
 * Sem marcadores `cfy:block`, devolve `[]` — ver a nota de cabeçalho.
 */
export function extrairFaixas(html: string): Faixa[] {
  const blocos = locateBlockRegions(html)
  if (blocos.length === 0) return []

  const fundos = backgroundDeclarations(html)
  const faixas: Faixa[] = []

  blocos.forEach((bloco, i) => {
    // O fundo da FAIXA é o primeiro de seção dentro do bloco: o container
    // que o bloco abre. Os seguintes são painéis, cards e botões, e quem
    // cuida deles é o inventário (`dentro_de`, `cobre_px`).
    let fundo: string | null = null
    let luminancia: number | null = null
    let cobre: number | null = null
    let editavel = false
    let decls: Range[] = []

    for (const decl of fundos) {
      if (!dentro(decl.valueRange.start, bloco.range)) continue
      const tag = openTagAt(html, decl.valueRange.start)
      const largura = tag ? declaredWidth(tag) : null
      if (largura == null || largura < LARGURA_DE_SECAO) continue
      fundo = canonicalHex(decl.hex)
      luminancia = relativeLuminance(fundo)
      cobre = largura
      editavel = true
      // Todas as declarações do MESMO tag: `bgcolor` e `style` convivem, e
      // reescrever só uma deixaria os dois valores discordando — o cliente
      // de e-mail escolhe um deles e o resultado vira loteria.
      const tagRange = rangeDoTag(html, decl.valueRange.start)
      decls = fundos
        .filter((d) => tagRange && dentro(d.valueRange.start, tagRange))
        .map((d) => d.valueRange)
      break
    }

    const regiao = html.slice(bloco.range.start, bloco.range.end)
    const foto = fundo == null && IMAGEM_DE_FUNDO.test(regiao)

    faixas.push({
      ordem: i + 1,
      bloco: bloco.indice,
      tipo: bloco.tipo,
      fundo,
      foto,
      luminancia,
      cobre_px: cobre,
      editavel,
      decls,
    })
  })

  return faixas
}

/**
 * Os botões do documento, cada um com a faixa em que pousa.
 *
 * Um botão é um link cujo elemento em volta declara fundo ou borda: é a
 * assinatura do botão em e-mail (`<td style="background-color:…;
 * border-radius:…"><a>…</a></td>`, como no template da casa). Link dentro de
 * parágrafo não tem nem um nem outro e fica de fora — e é por isso que o
 * label também tem teto: texto longo com fundo é uma banda com link, não um
 * CTA.
 */
export function extrairCtas(html: string, faixas: Faixa[]): Cta[] {
  const chainAt = buildAncestorChain(html)
  // Uma vez só: o casamento botão↔faixa acontece por offset, e refazer a
  // varredura de marcadores por botão é O(n²) num documento de 86 KB.
  const regioes = new Map(locateBlockRegions(html).map((b) => [b.indice, b.range]))
  const ctas: Cta[] = []
  let n = 0

  for (const m of html.matchAll(ABRE_LINK)) {
    const abre = m.index ?? 0
    const depoisDaTag = abre + m[0].length
    const fecha = FECHA_LINK.exec(html.slice(depoisDaTag))
    if (!fecha) continue
    const fimTexto = depoisDaTag + fecha.index
    const texto = visibleTextOf(html, { start: depoisDaTag, end: fimTexto }).trim()
    if (!texto || texto.length > LABEL_MAX_CHARS) continue

    // A cadeia começa no próprio elemento e sobe. `null` = o offset está
    // dentro de um bloco MSO; ali o botão VML é detectado pela vizinhança do
    // botão HTML, não como elemento próprio.
    const cadeia = chainAt(abre)
    if (!cadeia) continue

    const proprio = m[0]
    // O `<a>` que virou botão declara isso em si: caixa com respiro. É a
    // assinatura do template da casa e do resto da biblioteca.
    const pareceBotao = /display\s*:\s*(?:inline-)?block/i.test(proprio) && /padding\s*:/i.test(proprio)
    let fundo = hexOu(BG_NO_TAG.exec(proprio)?.[1])
    let radius = RADIUS_NO_TAG.exec(proprio)?.[1]
    let borda = hexOu(BORDA_NO_TAG.exec(proprio)?.[1])
    let largura = declaredWidth(proprio)
    let alvo: Range = cadeia[0].range

    // Sobe até o container que carrega a aparência do botão. Dois níveis
    // cobrem `<td><a>` e `<table><td><a>`; acima disso já é a seção.
    //
    // A guarda de largura é o que separa botão de link: o `<td>` de 600px
    // que pinta a seção NÃO é o fundo de um botão, e sem isso qualquer link
    // dentro de uma faixa colorida viraria CTA — o parágrafo com link do
    // corpo entrava como botão preenchido de 600px, e uma op de cor sobre
    // ele repintaria a seção inteira.
    for (const ancestral of cadeia.slice(1, 3)) {
      const tag = openTagAt(html, ancestral.range.start)
      if (!tag) continue
      const larguraAncestral = declaredWidth(tag)
      const ehSecao = larguraAncestral != null && larguraAncestral >= LARGURA_DE_SECAO
      const radiusAncestral = RADIUS_NO_TAG.exec(tag)?.[1]
      if (!radius && radiusAncestral) radius = radiusAncestral
      if (ehSecao) continue
      const bgAncestral = hexOu(BG_NO_TAG.exec(tag)?.[1])
      const bordaAncestral = hexOu(BORDA_NO_TAG.exec(tag)?.[1])
      if (!fundo && bgAncestral) {
        fundo = bgAncestral
        alvo = ancestral.range
      }
      if (!borda && bordaAncestral) borda = bordaAncestral
      if (largura == null) largura = larguraAncestral
      if (fundo && radius) break
    }

    // Nem fundo nem borda próprios, e o `<a>` não se declara caixa: é link
    // de texto.
    if (!fundo && !borda && !pareceBotao) continue

    const label = hexOu(COR_NO_TAG.exec(proprio)?.[1])
    const faixa = faixas.find((f) => {
      const r = regioes.get(f.bloco)
      return r ? dentro(abre, r) : false
    })

    n += 1
    ctas.push({
      id: `cta${n}`,
      bloco: faixa?.bloco ?? null,
      faixa: faixa?.ordem ?? null,
      texto,
      href: m[1],
      fundo,
      label,
      tipo: fundo ? "preenchido" : "vazado",
      largura_px: largura,
      radius_px: radius ? Number(radius) : null,
      vml: /v:roundrect/i.test(html.slice(Math.max(0, abre - JANELA_VML), abre)),
      // Só o par que o botão declara. Botão vazado pousa no fundo da faixa e
      // quem mede aquilo é o inventário — afirmar um contraste inventando o
      // fundo daria um número que ninguém pode conferir.
      contraste: fundo && label ? Number(contrastRatio(label, fundo).toFixed(2)) : null,
      range: alvo,
    })
  }

  return ctas
}
