/**
 * separador-catalogo — as formas que separam duas seções do e-mail.
 *
 * O K9 do guia diz "troca de fundo sem transição = 0", e a alçada respondia
 * que inserir forma onde não existe nenhuma tem outro dono. Resultado
 * medido na run `794b8ae1` (Innova Bay, 17/09): as duas trocas de fundo da
 * peça saíram secas, e o agente registrou a mesma lacuna R4 duas vezes na
 * telemetria, pedindo o que não podia fazer.
 *
 * O catálogo é uma lista fechada de desenhos. O agente escolhe o `id`; o
 * código valida contra esta lista, monta o SVG com as cores que o PLANO
 * decidiu e carimba. Ele não escreve SVG, não escolhe medida e não inventa
 * forma — a mesma divisão de trabalho da cor do botão (`cor-do-botao.ts`) e
 * do raio (`raio-do-botao.ts`).
 *
 * **Os dois grupos, e por que a diferença importa.** `escondeEmenda: true`
 * tem DUAS cores e serve onde o fundo troca: metade do desenho é a faixa de
 * cima, metade a de baixo, e a linha reta entre elas deixa de existir.
 * `escondeEmenda: false` tem uma cor de fundo e uma tinta, e serve onde o
 * fundo NÃO muda: é o caso das faixas 3, 4 e 5 daquela peça, três seções
 * brancas encostadas sem nada dizendo onde uma acaba. Usar uma no lugar da
 * outra é erro de composição, não de gosto — uma onda entre duas seções da
 * mesma cor desenha um degrau que não existe —, e por isso o código recusa
 * o par errado em vez de deixar passar.
 *
 * Puro (zero I/O) — o SVG é uma string; quem rasteriza e sobe é o serviço.
 */

/** As cores que uma forma recebe. */
export interface CoresDaForma {
  /** O que está ATRÁS: a faixa de cima (emenda) ou a faixa inteira (marca). */
  fundo: string
  /** O que é DESENHADO: a faixa de baixo (emenda) ou o ornamento (marca). */
  tinta: string
}

export interface FormaDeSeparacao {
  /** O que o agente escreve na escolha. */
  id: string
  /** Como aparece para gente. */
  nome: string
  /** Quanto a forma ocupa entre as duas seções. */
  alturaPx: number
  /**
   * `true` = as duas cores são os fundos das faixas, e a forma só faz
   * sentido onde eles DIFEREM. `false` = fundo igual dos dois lados, e a
   * tinta é um ornamento.
   */
  escondeEmenda: boolean
  /** A frase que vai ao prompt. Uma linha: é o que ele lê para escolher. */
  quandoUsar: string
  /**
   * `html` não vira imagem: a forma é desenhada com as próprias `<tr>`.
   * Rasterizar uma linha de 1px devolveria anti-aliasing e um arquivo à
   * toa — e uma linha reta é a única forma que cliente de e-mail nenhum
   * erra. Todo o resto é `png`, porque SVG não renderiza no Outlook nem
   * no Gmail.
   */
  render: "html" | "png"
  /** O desenho. Ausente em `render: "html"`. */
  svg?: (c: CoresDaForma) => string
}

const LARGURA = 600

/** Os dentes do zigue-zague, gerados em vez de escritos à mão. */
function dentes(altura: number, passo: number): string {
  const topo = altura * 0.45
  const p: string[] = [`M0,${altura}`, `L0,${topo}`]
  for (let x = 0; x < LARGURA; x += passo) {
    p.push(`L${x + passo / 2},${altura}`, `L${x + passo},${topo}`)
  }
  p.push(`L${LARGURA},${altura}`, "Z")
  return p.join(" ")
}

const abre = (altura: number) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${LARGURA}" height="${altura}" viewBox="0 0 ${LARGURA} ${altura}">`

export const CATALOGO_DE_SEPARACAO: readonly FormaDeSeparacao[] = [
  // ── Escondem a emenda: duas cores ──────────────────────────────────
  {
    id: "onda",
    nome: "Onda",
    alturaPx: 40,
    escondeEmenda: true,
    render: "png",
    quandoUsar:
      "costura uma troca de fundo sem deixar linha reta; a mais neutra das quatro, serve em qualquer registro",
    svg: ({ fundo, tinta }) =>
      `${abre(40)}<rect width="${LARGURA}" height="40" fill="${fundo}"/>` +
      `<path d="M0,16 C100,4 200,28 300,16 C400,4 500,28 600,16 L600,40 L0,40 Z" fill="${tinta}"/></svg>`,
  },
  {
    id: "diagonal",
    nome: "Diagonal",
    alturaPx: 32,
    escondeEmenda: true,
    render: "png",
    quandoUsar:
      "corte inclinado; dá movimento e combina com registro esportivo ou promocional",
    svg: ({ fundo, tinta }) =>
      `${abre(32)}<rect width="${LARGURA}" height="32" fill="${fundo}"/>` +
      `<path d="M0,32 L600,0 L600,32 Z" fill="${tinta}"/></svg>`,
  },
  {
    id: "arco",
    nome: "Arco",
    alturaPx: 36,
    escondeEmenda: true,
    render: "png",
    quandoUsar:
      "curva única e ampla; a mais suave, para registro premium ou editorial",
    svg: ({ fundo, tinta }) =>
      `${abre(36)}<rect width="${LARGURA}" height="36" fill="${fundo}"/>` +
      `<path d="M0,12 Q300,44 600,12 L600,36 L0,36 Z" fill="${tinta}"/></svg>`,
  },
  {
    id: "zigue",
    nome: "Zigue-zague",
    alturaPx: 28,
    escondeEmenda: true,
    render: "png",
    quandoUsar:
      "dentes regulares; o mais gráfico, para queima de estoque e alto contraste",
    svg: ({ fundo, tinta }) =>
      `${abre(28)}<rect width="${LARGURA}" height="28" fill="${fundo}"/>` +
      `<path d="${dentes(28, 50)}" fill="${tinta}"/></svg>`,
  },

  // ── Marcam a seção: fundo igual dos dois lados ─────────────────────
  {
    id: "filete",
    nome: "Filete",
    alturaPx: 49,
    escondeEmenda: false,
    render: "html",
    quandoUsar:
      "linha de 1px de margem a margem, com respiro em cima e embaixo; marca a troca de assunto sem chamar atenção",
  },
  {
    id: "traco",
    nome: "Traço curto",
    alturaPx: 48,
    escondeEmenda: false,
    render: "png",
    quandoUsar:
      "filete curto centrado; o separador editorial clássico, mais discreto que a linha inteira",
    svg: ({ fundo, tinta }) =>
      `${abre(48)}<rect width="${LARGURA}" height="48" fill="${fundo}"/>` +
      `<rect x="270" y="23" width="60" height="2" fill="${tinta}"/></svg>`,
  },
  {
    id: "pontos",
    nome: "Pontos",
    alturaPx: 48,
    escondeEmenda: false,
    render: "png",
    quandoUsar:
      "três pontos centrados; a pausa mais leve, para quando duas seções claras contam coisas diferentes",
    svg: ({ fundo, tinta }) =>
      `${abre(48)}<rect width="${LARGURA}" height="48" fill="${fundo}"/>` +
      `<circle cx="288" cy="24" r="3" fill="${tinta}"/>` +
      `<circle cx="300" cy="24" r="3" fill="${tinta}"/>` +
      `<circle cx="312" cy="24" r="3" fill="${tinta}"/></svg>`,
  },
  {
    id: "losango",
    nome: "Losango",
    alturaPx: 44,
    escondeEmenda: false,
    render: "png",
    quandoUsar:
      "losango entre dois filetes; o mais ornamental, para registro premium ou artesanal",
    svg: ({ fundo, tinta }) =>
      `${abre(44)}<rect width="${LARGURA}" height="44" fill="${fundo}"/>` +
      `<rect x="40" y="21" width="240" height="1" fill="${tinta}"/>` +
      `<rect x="320" y="21" width="240" height="1" fill="${tinta}"/>` +
      `<path d="M300,15 L307,22 L300,29 L293,22 Z" fill="${tinta}"/></svg>`,
  },
]

export function formaPorId(id: string | undefined): FormaDeSeparacao | null {
  const alvo = (id ?? "").trim().toLowerCase()
  return CATALOGO_DE_SEPARACAO.find((f) => f.id === alvo) ?? null
}

/**
 * O catálogo como o agente o lê.
 *
 * Gerado da MESMA lista que o código valida — escrever a tabela à mão no
 * prompt criaria duas listas, e a segunda envelheceria calada na primeira
 * forma acrescentada. É a armadilha que `FAMILIA_OPCOES`, `ehFamilia` e
 * `MOLDE_KEYS` já pagaram neste repositório.
 */
export function catalogoParaPrompt(): string {
  const linha = (f: FormaDeSeparacao) => `- \`${f.id}\` (${f.alturaPx}px) — ${f.quandoUsar}`
  const emenda = CATALOGO_DE_SEPARACAO.filter((f) => f.escondeEmenda).map(linha)
  const marca = CATALOGO_DE_SEPARACAO.filter((f) => !f.escondeEmenda).map(linha)
  return [
    "ONDE O FUNDO TROCA (as duas cores entram no desenho):",
    ...emenda,
    "",
    "ONDE O FUNDO É O MESMO NOS DOIS LADOS (a tinta é ornamento):",
    ...marca,
  ].join("\n")
}
