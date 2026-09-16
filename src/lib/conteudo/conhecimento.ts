/**
 * A base do Obsidian no prompt do Estúdio — o que entra e com que aviso.
 *
 * Medido em 16/09, antes de escrever qualquer linha: **256 notas aprovadas,
 * 251 com vetor**, e o Estúdio escrevia carrossel com QUARENTA PALAVRAS de
 * contexto hardcoded (`contextoDaOrg`: "agência de e-mail marketing e
 * retenção… segmentação, LTV, carrinho abandonado"). A base cobre exatamente
 * esses assuntos — 14 notas de flows, 14 de deliverability, 12 de list
 * growth, 11 de copy, 5 de estruturas da casa, cada uma com 700 a 1.900
 * palavras — e nenhuma ação do módulo Conteúdo a consultava.
 *
 * ## As quatro regras, e por que cada uma existe
 *
 * 1. **Procedência SEPARA o bloco em dois.** `Convertfy/*` e `Referencias/*`
 *    são como A CASA faz — afirmável na primeira pessoa. `Advisors/Max/*` é
 *    doutrina de CURSO de terceiro: virar "nós fazemos assim" num carrossel
 *    é apropriação, e virar "o mercado diz" quando é a casa é modéstia que
 *    joga fora a autoridade. É a mesma razão do cabeçalho fixo do
 *    `buscar_doutrina` no Curador de e-mail.
 * 2. **Número da doutrina é BENCHMARK, nunca resultado nosso.** "3x por
 *    semana é o sweet spot" é o que o curso ensina, não o que a Convertfy
 *    mediu. Um slide que troque um pelo outro publica um case falso.
 * 3. **As três regras do corpus viajam com o número** (`REGRAS_DO_NUMERO`,
 *    copiadas verbatim da nota-índice): verbatim sem arredondar, registro
 *    identificado — `outro-narrador` **não é citável como fala do Max** — e
 *    nada de média. Servir a tabela sem elas faz o modelo escrever "cerca de
 *    5 campanhas" onde o corpus diz "o piso é 3"; é o erro que este repo já
 *    pagou duas vezes no sentido inverso (regra servida sem o dado).
 * 4. **Teto por nota E no total.** A nota do Max tem ~10 mil caracteres e o
 *    pedido de um carrossel tem ~3 mil: sem teto a doutrina engole o pedido.
 *    O corte é pelo COMEÇO de propósito — as notas do vault abrem com um
 *    resumo do que carregam (a mesma propriedade que o catálogo do Curador
 *    usa em `primeiraFrase`).
 *
 * Puro: sem I/O. O serviço busca no banco e a rota decide a consulta.
 */

import { consultaDaPauta } from "./editorial/evidencias"

/** Pastas cuja doutrina é da CASA — afirmável como nossa. */
export const PASTAS_DA_CASA = ["Convertfy", "Referencias"] as const
/** Pasta do advisor externo — doutrina de curso, citável só como mercado. */
export const PASTA_DO_ADVISOR = "Advisors/Max"

/** Teto da consulta. Doze palavras normais nunca chegam perto disto. */
export const CONSULTA_MAX_CHARS = 400
export const CONHECIMENTO_MAX_NOTAS = 3
export const CONHECIMENTO_MAX_CHARS_NOTA = 3500
export const CONHECIMENTO_MAX_CHARS_TOTAL = 9000

/**
 * As três regras da nota `numeros-de-email-marketing-mais-pedidos`, que o
 * próprio corpus declara sem exceção. Reproduzidas aqui porque a nota-índice
 * pode não ser a recuperada, e o número sem elas é pior que número nenhum.
 */
export const REGRAS_DO_NUMERO = [
  "Verbatim: o valor sai como está escrito. Nunca arredonde, converta, normalize nem traduza.",
  'Registro: todo valor diz de onde veio. O que está marcado `outro-narrador` NÃO é citável como fala do Max — use como "o mercado" ou não use.',
  'Nada de média: duas versões são duas linhas. Se o corpus diz 3, 4-5 e 15, escreva "o piso é 3", nunca "cerca de 5".',
] as const

export interface NotaParaPrompt {
  path: string
  titulo: string
  corpo: string
}

export type Procedencia = "casa" | "advisor" | "outra"

/** De onde a nota fala — decide em qual metade do bloco ela entra. */
export function procedenciaDaNota(path: string): Procedencia {
  if (PASTAS_DA_CASA.some((p) => path === p || path.startsWith(`${p}/`))) return "casa"
  if (path === PASTA_DO_ADVISOR || path.startsWith(`${PASTA_DO_ADVISOR}/`)) return "advisor"
  return "outra"
}

/**
 * A nota traz TABELA DE NÚMERO?
 *
 * Pelo nome do arquivo, não pelo conteúdo: as 16 notas da série se chamam
 * `numeros-*` e a índice é `numeros-de-email-marketing-mais-pedidos`.
 * Varrer o corpo atrás de dígito acusaria qualquer nota que cite uma linha
 * do bruto (`L4236`) e as três regras entrariam em toda geração, virando
 * ruído que o modelo aprende a pular.
 */
export function temTabelaDeNumero(nota: Pick<NotaParaPrompt, "path" | "titulo">): boolean {
  const arquivo = nota.path.split("/").pop() ?? ""
  return /^numeros[-_]/i.test(arquivo) || /^n[uú]meros\b/i.test(nota.titulo.trim())
}

/**
 * Seções que o corte NUNCA pode comer, reconhecidas pelo título.
 *
 * As notas da casa terminam declarando o que elas não provam — a de welcome
 * fecha com "Esta nota é padrão de execução, não evidência de conversão —
 * não a use para afirmar que esta estrutura converte mais que outra". O
 * resumo mora no começo e a ressalva no fim: cortar pelo começo preserva o
 * primeiro e joga fora o segundo, e uma nota assim decapitada vira material
 * para afirmar exatamente o que ela proíbe.
 */
const TITULO_DE_RESSALVA = /^#{1,3}\s+.*\b(n[ãa]o prova|n[ãa]o faz|ressalva|limita[çc][ãa]o|limites|o que este material)/im

/** A última seção de ressalva da nota, quando existe. */
export function ressalvaDaNota(corpo: string): string {
  const linhas = corpo.split("\n")
  for (let i = linhas.length - 1; i >= 0; i--) {
    if (TITULO_DE_RESSALVA.test(linhas[i])) return linhas.slice(i).join("\n").trim()
  }
  return ""
}

/**
 * Descarta a última linha quando ela ficou pela metade.
 *
 * Sem isto, uma tabela sem linha em branco no meio (o formato das 16 notas
 * de número) é cortada dentro de uma célula e sai `| 7 |` — e uma linha de
 * tabela partida é lida como dado incompleto, não como texto faltando.
 * Verificado com a nota real de welcome, que terminava exatamente assim.
 */
function semLinhaPartida(janela: string): string {
  const ultimaQuebra = janela.lastIndexOf("\n")
  if (ultimaQuebra <= 0) return janela
  const ultima = janela.slice(ultimaQuebra + 1)
  const partida = ultima.trimStart().startsWith("|") && !ultima.trimEnd().endsWith("|")
  return partida ? janela.slice(0, ultimaQuebra) : janela
}

function cortar(s: string, max: number): string {
  const t = s.trim()
  if (t.length <= max) return t

  // A ressalva entra no orçamento ANTES do corpo: ela é a parte que muda o
  // que pode ser afirmado, e o corpo sem ela é pior que menos corpo.
  const ressalva = ressalvaDaNota(t)
  const cabe = ressalva && ressalva.length < max * 0.5 ? ressalva : ""
  const espaco = max - (cabe ? cabe.length + 24 : 0)

  // Corta em fronteira de parágrafo quando dá — meia tabela markdown é pior
  // que um parágrafo a menos, porque o modelo lê a linha partida como dado.
  const janela = t.slice(0, Math.max(espaco, 200))
  const quebra = janela.lastIndexOf("\n\n")
  const inicio = quebra > espaco * 0.6 ? janela.slice(0, quebra) : semLinhaPartida(janela)
  return [inicio.trimEnd(), "[trecho do meio omitido]", cabe].filter(Boolean).join("\n\n")
}

/**
 * Quais notas entram, na ordem em que entram.
 *
 * A ordem de chegada É a relevância (a busca já ordenou por similaridade),
 * então isto só aplica os tetos. Nota que não cabe é PULADA e a seguinte é
 * tentada: com o corte por nota em 3.500, uma nota grande não pode bloquear
 * duas menores que caberiam.
 */
export function selecionarNotas(
  notas: NotaParaPrompt[],
  limites: { maxNotas?: number; maxChars?: number; maxCharsNota?: number } = {},
): Array<NotaParaPrompt & { procedencia: Procedencia }> {
  const maxNotas = limites.maxNotas ?? CONHECIMENTO_MAX_NOTAS
  const maxChars = limites.maxChars ?? CONHECIMENTO_MAX_CHARS_TOTAL
  const maxNota = limites.maxCharsNota ?? CONHECIMENTO_MAX_CHARS_NOTA

  const out: Array<NotaParaPrompt & { procedencia: Procedencia }> = []
  let usados = 0
  for (const n of notas) {
    if (out.length >= maxNotas) break
    const corpo = cortar(n.corpo, maxNota)
    if (!corpo.trim()) continue
    if (usados + corpo.length > maxChars) continue
    out.push({ ...n, corpo, procedencia: procedenciaDaNota(n.path) })
    usados += corpo.length
  }
  return out
}

/**
 * O bloco que vai ao prompt. Vazio sem nota utilizável — o chamador não
 * acrescenta nada e o comportamento é o de antes.
 *
 * `semanticaRodou = false` é DITO: com o corpus misturando português e
 * inglês (medido: "carrinho abandonado" devolve zero na full-text, "cart
 * abandon" devolve três), sem busca por significado o que chega é pobre por
 * motivo técnico, e o modelo precisa saber disso antes de concluir que a
 * casa não tem doutrina sobre o assunto.
 */
export function blocoDeConhecimento(
  selecionadas: Array<NotaParaPrompt & { procedencia: Procedencia }>,
  opts: { semanticaRodou?: boolean } = {},
): string {
  if (!selecionadas.length) return ""

  const daCasa = selecionadas.filter((n) => n.procedencia === "casa")
  const doAdvisor = selecionadas.filter((n) => n.procedencia !== "casa")
  const comNumero = selecionadas.some(temTabelaDeNumero)

  const secao = (titulo: string, aviso: string, notas: typeof selecionadas) =>
    notas.length
      ? [`### ${titulo}`, aviso, ...notas.map((n) => `#### ${n.titulo}\nFonte: ${n.path}\n${n.corpo}`)].join("\n\n")
      : ""

  const partes = [
    secao(
      "Doutrina DA CASA",
      "Isto é como a Convertfy trabalha. Pode ser afirmado na primeira pessoa (\"a gente faz assim\") e é o que dá autoridade à peça.",
      daCasa,
    ),
    secao(
      "Doutrina de MERCADO (curso de terceiro)",
      "Isto NÃO é da casa: é material de formação externa que a casa estuda. Use como referência de mercado (\"o padrão do setor é…\"), nunca como o que a Convertfy faz ou mediu.",
      doAdvisor,
    ),
  ].filter(Boolean)

  const regras = comNumero
    ? `\n\n**Os números acima têm três regras, sem exceção:**\n${REGRAS_DO_NUMERO.map((r, i) => `${i + 1}. ${r}`).join("\n")}`
    : ""

  // Sem semântica sobra a full-text, que é AND e vive de casar termo exato
  // num corpus que mistura português e inglês ("cart abandon" está escrito,
  // "carrinho abandonado" não). Medido: praticamente nada chega. O aviso diz
  // isso com essa força — "pode estar incompleto" faria o modelo concluir
  // que a casa não trata o tema.
  const aviso =
    opts.semanticaRodou === false
      ? "\n\n(A busca por significado NÃO rodou nesta consulta — sobrou a busca por palavra exata, e o corpus mistura português e inglês. O que chegou acima é quase certamente uma fração do que a base tem. NÃO conclua que a casa não trata o assunto.)"
      : ""

  return `## O que a base da casa diz sobre isto (leia antes de escrever)
Estas notas são a fonte de SUBSTÂNCIA: o mecanismo, o porquê e os limites do que a peça vai afirmar. Nenhum número daqui é resultado deste cliente nem desta campanha — é doutrina. Dado da PAUTA continua sendo a única fonte de resultado próprio; sem ele, [confirmar].

${partes.join("\n\n")}${regras}${aviso}

Fim da base. Escreva o pedido abaixo com esta substância, sem copiar as frases.`
}

/**
 * Isto parece uma citação de nota da base?
 *
 * Estreito de propósito: caminho com barra terminando em `.md`, ou começando
 * numa pasta conhecida. "Smile.io, 2024" (o formato de fonte que vem do
 * insumo) não tem nem barra nem extensão e continua valendo sem conferência,
 * como já valia.
 */
export function pareceNotaDaBase(fonte: string): boolean {
  const f = fonte.trim()
  if (/^https?:\/\//i.test(f)) return false
  if (/\.md$/i.test(f) && f.includes("/")) return true
  return [...PASTAS_DA_CASA, PASTA_DO_ADVISOR].some((p) => f.startsWith(`${p}/`))
}

/**
 * Confere as citações de nota contra o que foi REALMENTE servido.
 *
 * `verificarFontes` (das evidências) só confere URL — uma fonte que não
 * começa com `http` passa intacta. Servir a base sem esta segunda régua
 * abriria a porta que a primeira fecha, e por um caminho pior: um path de
 * nota inventado parece mais confiável que um link inventado, porque parece
 * interno. Fonte que não bate é REMOVIDA e o dado sobrevive sem ela — o
 * mesmo desfecho da régua da web.
 */
export function conferirNotasCitadas<T extends { fonte?: string }>(
  evidencias: T[],
  pathsServidos: string[],
): { evidencias: T[]; descartadas: string[] } {
  const servidos = new Set(pathsServidos.map((p) => p.trim().toLowerCase()))
  const descartadas: string[] = []
  const saneadas = evidencias.map((ev) => {
    const fonte = (ev.fonte ?? "").trim()
    if (!fonte || !pareceNotaDaBase(fonte)) return ev
    if (servidos.has(fonte.toLowerCase())) return ev
    descartadas.push(fonte)
    const { fonte: _f, ...resto } = ev
    return resto as T
  })
  return { evidencias: saneadas, descartadas }
}

/**
 * A consulta que cada ação faz à base.
 *
 * Sai do PEDIDO, não de uma pergunta genérica: a busca é semântica e uma
 * consulta como "e-mail marketing" devolve a média do corpus, que não ajuda
 * ninguém. Devolve `null` quando não há do que perguntar — buscar com string
 * vazia gasta um embedding para receber ruído.
 */
export function consultaDaAcao(entrada: {
  acao: string
  insumo?: string
  pauta?: string
  resumo?: string
  headline?: string
  titulo?: string
  templateNome?: string
  pilar?: string | null
}): string | null {
  const pedacos = [entrada.insumo, entrada.pauta, entrada.headline, entrada.titulo, entrada.resumo, entrada.pilar]
    .map((p) => (typeof p === "string" ? p.trim() : ""))
    .filter(Boolean)
  if (!pedacos.length) return null
  // Palavras com sentido, não a frase inteira — `buscarConhecimento` manda a
  // MESMA string para a semântica e para a full-text, e a full-text do
  // Postgres é AND: uma pauta de dez palavras exige que as dez apareçam na
  // nota, e o resultado é zero. Medido em 16/09 contra a base real: três
  // pautas naturais devolveram 0/3; as mesmas em palavras-chave, 1/3. O
  // vetor perde pouco (as palavras carregam o significado) e o teto de
  // caracteres deixa de ser necessário — insumo de 5 mil caracteres diluía
  // o vetor até ele apontar para o centro do corpus.
  // O teto em CARACTERES continua, porque `consultaDaPauta` conta palavras:
  // um insumo colado sem espaço é uma palavra só, passa pelo filtro de 12 e
  // chegaria inteiro ao embedding.
  const chave = consultaDaPauta(pedacos.join(" ")).slice(0, CONSULTA_MAX_CHARS).trim()
  return chave || null
}
