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
   * Tipografia e respiro DECLARADOS no `<a>` — a escala real desta peça.
   *
   * Existem porque o botão que o agente manda criar nascia com tamanho fixo
   * do template da casa (15px, padding 14/36) enquanto a peça rodava em
   * 24px: 41% da largura e 62% da altura do botão nativo, "nem parece um
   * CTA". O dado para acertar sempre esteve aqui e era lido só para
   * recolorir. `null` quando o `<a>` não declara.
   */
  font_size_px: number | null
  peso: number | null
  padding_v: number | null
  padding_h: number | null
  /**
   * Existe um `v:roundrect` do Outlook em volta.
   *
   * Importa porque a cor do botão fica declarada DUAS vezes nesse caso, e
   * uma op escopada que troque só a do `<td>` deixa o Outlook mostrando a
   * cor antiga — quebra em silêncio, num cliente só.
   */
  vml: boolean
  /**
   * O botão existe SÓ no ramo do Outlook — fora dele o lugar está vazio.
   *
   * Encontrado em 11/09 na peça da Hero Boxers: o CTA do bloco `body` vive
   * apenas dentro de `<!--[if mso]>`, escrito "DIGITAL GIFT CARD" (texto de
   * exemplo de outra peça), e o ramo `<!--[if !mso]>` ao lado está vazio.
   * O Outlook mostra um botão de gift card numa marca de cuecas; todo o
   * resto não mostra botão nenhum.
   *
   * Existe para ser DITO, não para calar a inserção: um CTA que 90% dos
   * leitores não vê não cumpre a regra da casa, e tratá-lo como botão
   * presente deixaria o bloco sem CTA para quase todo mundo. Ver
   * `plano-de-cor.ts`, onde ele não entra em `blocosComCta`.
   */
  somente_outlook: boolean
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
const ROUNDRECT = /<v:roundrect\b[^>]*>/gi
const ABRE_LINK_UMA = /<a\b[^>]*\bhref\s*=\s*"[^"]*"[^>]*style="[^"]*display\s*:\s*(?:inline-)?block/i
const TEXTO_VML = /<center\b[^>]*>([\s\S]{0,200}?)<\/center\s*>/i
const HREF_VML = /\bhref\s*=\s*"([^"]*)"/i
const FILL_VML = /\bfillcolor\s*=\s*"([^"]*)"/i

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
const FONT_SIZE_NO_TAG = /font-size\s*:\s*(\d+(?:\.\d+)?)\s*px/i
const PESO_NO_TAG = /font-weight\s*:\s*(\d{3})/i
const PADDING_NO_TAG = /padding\s*:\s*([^;"']+)/i

/** "14px 36px" / "14px" / "14px 36px 14px 36px" → [vertical, horizontal]. */
function padding(tag: string): [number | null, number | null] {
  const bruto = PADDING_NO_TAG.exec(tag)?.[1]
  if (!bruto) return [null, null]
  const n = bruto
    .trim()
    .split(/\s+/)
    .map((v) => (/^(\d+(?:\.\d+)?)px$/i.test(v) ? Number(v.replace(/px/i, "")) : null))
  if (n.length === 0 || n[0] == null) return [null, null]
  return [n[0], n.length >= 2 ? n[1] : n[0]]
}

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
      font_size_px: Number(FONT_SIZE_NO_TAG.exec(proprio)?.[1]) || null,
      peso: Number(PESO_NO_TAG.exec(proprio)?.[1]) || null,
      padding_v: padding(proprio)[0],
      padding_h: padding(proprio)[1],
      vml: /v:roundrect/i.test(html.slice(Math.max(0, abre - JANELA_VML), abre)),
      somente_outlook: false,
      // Só o par que o botão declara. Botão vazado pousa no fundo da faixa e
      // quem mede aquilo é o inventário — afirmar um contraste inventando o
      // fundo daria um número que ninguém pode conferir.
      contraste: fundo && label ? Number(contrastRatio(label, fundo).toFixed(2)) : null,
      range: alvo,
    })
  }

  // ── Botões que só existem no Outlook ────────────────────────────────
  // O padrão da casa é VML + `<a>` lado a lado, e aí o `<a>` já entrou
  // acima com `vml: true`. O que sobra aqui é o roundrect ÓRFÃO: o par
  // desapareceu e ninguém percebeu, porque botão dentro de comentário
  // condicional não existe para o DOM — nem para este extrator, que é como
  // o Cores & Botões leu "bloco sem CTA" e inseriu um segundo.
  for (const m of html.matchAll(ROUNDRECT)) {
    const abre = m.index ?? 0
    const trecho = html.slice(abre, abre + JANELA_VML)
    // Par visível por perto → já foi contado pelo `<a>`.
    if (ABRE_LINK_UMA.test(html.slice(abre, abre + JANELA_VML * 2))) continue
    const texto = (TEXTO_VML.exec(trecho)?.[1] ?? "").replace(/<[^>]*>/g, "").trim()
    if (!texto || texto.length > LABEL_MAX_CHARS) continue
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
      href: HREF_VML.exec(m[0])?.[1] ?? "",
      fundo: hexOu(FILL_VML.exec(m[0])?.[1]),
      label: null,
      tipo: "preenchido",
      largura_px: null,
      radius_px: null,
      font_size_px: null,
      peso: null,
      padding_v: null,
      padding_h: null,
      vml: true,
      somente_outlook: true,
      contraste: null,
      range: { start: abre, end: abre + m[0].length },
    })
  }

  return ctas
}

/**
 * Fundo de seção sai da IDENTIDADE da loja — não de quantos tons cabem.
 *
 * A primeira versão desta régua contava até três, que é a letra da R2. A
 * conta estava no eixo errado, e a peça de 10/09 mostra por quê: a Hero
 * Boxers tem EXATAMENTE duas cores principais cadastradas — `#000000` e
 * `#FFFFFF`, zero secundárias — e a peça saiu com fundos `#FFFFFF`,
 * `#E1DEDE` e `#B1B3B6`. Três tons: passa no teto. E dois deles são cinzas
 * genéricos herdados de variantes escritas para outras lojas, enquanto o
 * preto — metade da identidade — não aparece como fundo de seção nenhuma.
 * Contar quantidade aprova três cinzas estranhos e reprovaria preto, branco
 * e um acento da marca.
 *
 * A regra da casa, na ordem: **os fundos são as cores principais da loja**,
 * e só com MUITA necessidade entra outra — **em lugar especial**. Fundo de
 * seção não é lugar especial: é a banda que o leitor atravessa por inteiro,
 * e uma cor estranha ali veste a peça de outra marca. Por isso QUALQUER
 * fundo fora da identidade conta como desvio, e a exceção da terceira cor
 * vale para o que é pontual — um card, um selo, um filete —, que esta
 * função nem enxerga. Daí `estranhos` ser o número que importa e o teto de
 * tons virar o limite de trás.
 *
 * **O que conta como "da marca"** é a paleta cadastrada MAIS os papéis que
 * o código deriva dela (`bg`, `surface`, `surface_strong` de
 * `deriveColorRoles`). Uma loja preto-e-branco precisa de um cinza para
 * separar seções; o que ela não precisa é de um cinza QUALQUER. Foi
 * exatamente o que o agente escreveu na lacuna dele e depois não fez:
 * "#B1B3B6 não é um dos color_roles declarados — registrar para decisão da
 * loja se deve virar #E3E3E3". Aqui isso deixa de ser lacuna e vira conta.
 *
 * **Limite declarado: conta fundo de SEÇÃO, não banda interna.** Medindo a
 * peça no Chromium aparecem quatro fundos, porque a hero tem uma banda
 * preta de 230px no topo (onde mora o logo). Ela não entra: o container do
 * bloco hero é branco, e é ele que uma op alcança. Contar banda interna
 * faria todo card colorido e todo rodapé escuro de dentro de um bloco
 * gastarem um tom, e a régua acusaria quase toda peça — alarme que ninguém
 * consegue atender vira alarme ignorado. A contrapartida honesta é que uma
 * banda grande o bastante para ler como seção passa despercebida.
 *
 * **Foto não é tom.** Faixa cujo fundo é imagem não entra mesmo quando há
 * cor declarada atrás dela: quem lê vê a foto, e contá-la faria a hero
 * fotográfica gastar um tom que o leitor não percebe.
 *
 * Puro. Lista vazia (documento sem marcadores) devolve zero tons e nada
 * acusado — sem endereço não há conta a fazer, e acusar ali seria inventar
 * defeito sobre o que não foi medido.
 */

/** Teto de trás: mesmo todos sendo da marca, quatro fundos é ruído (R2). */
export const TETO_DE_TONS = 3

export interface TomDeFundo {
  hex: string
  /** Pertence à paleta da loja ou a um papel derivado dela. */
  da_marca: boolean
  /** Em quantas faixas este tom aparece. */
  faixas: number
}

export interface TonsDeFundo {
  tons: TomDeFundo[]
  teto: number
  /** Mais tons do que o teto de trás. */
  excede: boolean
  /** Os fundos que não vêm da identidade — o número que importa. */
  estranhos: string[]
  /** Existe fundo de seção fora da identidade. */
  foraDaIdentidade: boolean
}

/**
 * Distância máxima por canal para dois fundos serem o MESMO tom.
 *
 * Medido no documento real: a peça usa `#FFFFFF` e `#FDFDFD`, dois brancos
 * que ninguém distingue, vindos de variantes de origens diferentes.
 * Contá-los como dois tons faria a régua acusar violação onde não há — e
 * alarme falso é como se aprende a ignorar o alarme verdadeiro. 8 em 255 é
 * ~3%: pega o ruído de arredondamento e não junta `#E1DEDE` com `#B1B3B6`
 * (48 de distância), que são dois cinzas de verdade.
 *
 * A mesma tolerância decide se um fundo é da marca: exigir o hex exato
 * reprovaria o branco que a variante escreveu como `#FDFDFD` sendo o mesmo
 * branco da identidade.
 */
const TOLERANCIA_DE_TOM = 8

function mesmoTom(a: string, b: string): boolean {
  const rgb = (h: string) => {
    const m = /^#?([0-9a-f]{6})$/i.exec(h.trim())
    if (!m) return null
    const n = parseInt(m[1], 16)
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  }
  const x = rgb(a)
  const y = rgb(b)
  // Hex que não sabemos ler não é igualado a nada: juntar por engano
  // esconderia um tom de verdade.
  if (!x || !y) return a.toUpperCase() === b.toUpperCase()
  return x.every((v, i) => Math.abs(v - y[i]) <= TOLERANCIA_DE_TOM)
}

/**
 * @param aceitas Cores da identidade MAIS os papéis derivados dela. Lista
 *   vazia = a loja não tem paleta cadastrada: nada é acusado de estranho,
 *   porque sem identidade não há de onde um fundo divergir.
 */
export function tonsDeFundo(faixas: Faixa[], aceitas: string[] = []): TonsDeFundo {
  const tons: TomDeFundo[] = []
  for (const f of faixas) {
    if (f.foto || !f.fundo) continue
    const hex = f.fundo.toUpperCase()
    const existente = tons.find((t) => mesmoTom(t.hex, hex))
    if (existente) {
      existente.faixas += 1
      continue
    }
    tons.push({
      hex,
      da_marca: aceitas.length === 0 || aceitas.some((a) => mesmoTom(a, hex)),
      faixas: 1,
    })
  }
  const estranhos = tons.filter((t) => !t.da_marca).map((t) => t.hex)
  return {
    tons,
    teto: TETO_DE_TONS,
    excede: tons.length > TETO_DE_TONS,
    estranhos,
    foraDaIdentidade: estranhos.length > 0,
  }
}
