/**
 * curador-leque — as peças puras da escolha POSIÇÃO A POSIÇÃO.
 *
 * O Curador de hoje decide todas as posições numa chamada; o leque faz uma
 * chamada por posição, em série, com o prefixo cacheado e a cauda fatiada
 * pela seção. Este módulo é a parte sem I/O: parse de UMA posição, as
 * regras de conjunto contra o que já foi decidido, e o laço com a chamada
 * **injetada** — assim o desenho inteiro é testável sem LLM.
 *
 * Quem monta o prompt é `curador-leque-prompt.ts`; quem orquestra, grava a
 * run e fala com o banco é `curador-shadow.ts`.
 *
 * **A saída costurada é o MESMO `CuradorVaultOutput` de hoje.** Não é
 * economia de digitação: `conformarEstrutura`, `parseCuratorRanking`,
 * `restrictRankingToShortlist` e `measureProtocolViolations` já leem esse
 * formato, e um segundo formato faria o leque precisar de um segundo
 * caminho de conformidade, de medição e de telemetria — três lugares onde
 * as duas vias divergiriam calados.
 */

import type { CuradorVaultOutput } from "./curador-shadow"
import { normalizarSecao } from "./repeticao"
import { idsBloqueadosPelaRepeticao, type DecididaAntes } from "./curador-leque-prompt"

/** O que uma chamada precisa saber sobre a posição que vai decidir. */
export interface PosicaoDoLeque {
  block_index: number
  section: string
  /** O papel decidido pelo Estruturador. Vazio quando ele está desligado. */
  papel: string
  /** `requisitos` renderizados (dispositivo, cupom, n_itens…). */
  requisitos: string
  /** O catálogo FATIADO desta seção, já restrito às finalistas. */
  candidatas: string
  /** As notas das finalistas desta posição, já dentro do orçamento. */
  notas: string
  notaDaSecao: string
  lacunas: string
  eliminadas: string
  /**
   * Os ids que esta posição pode escolher. É a régua de validação da
   * resposta — o modelo não escolhe fora do que recebeu, e id inventado
   * vira posição vazia em vez de escolha silenciosa de outra variante.
   */
  idsPermitidos: string[]
}

export interface EscolhaDaPosicao {
  block_index: number
  section: string
  papel: string
  justificativa: string
  conversa_com: string
  variant_id: string | null
  motivo: string
  /**
   * A segunda melhor, quando o modelo a nomeia.
   *
   * Ela existe porque hoje `SHADOW_TOP_N = 1` e três mecanismos procuram
   * um rank 2 que nunca existe — conflito de convivência, repetição em
   * hero/products e id inválido. Sem reserva, cada um deles só sabe
   * APAGAR a posição.
   */
  reserva: string | null
  /** Quando a resposta veio ilegível ou sem id utilizável. */
  erro?: string
  /**
   * O modelo ecoou outro `block_index`/`section`. A posição continua sendo
   * a do CÓDIGO — isto é registro, não decisão.
   */
  eco_divergente?: string
}

/** Uma chamada ao modelo para uma posição. Injetada para poder testar. */
export type ChamarPosicao = (
  posicao: PosicaoDoLeque,
  jaDecididas: DecididaAntes[],
) => Promise<{ raw: string }>

const VAZIO: Omit<EscolhaDaPosicao, "block_index" | "section"> = {
  papel: "",
  justificativa: "",
  conversa_com: "",
  variant_id: null,
  motivo: "",
  reserva: null,
}

/**
 * Extrai a decisão de UMA posição. Tolerante a fence e prosa em volta,
 * como o parser do caminho de hoje.
 *
 * **`block_index` e `section` são os do CÓDIGO**, sempre. O que o modelo
 * ecoa serve para detectar que ele se perdeu — nunca para reendereçar a
 * escolha: aceitar o eco faria a variante da posição 2 ser montada na 4
 * porque o modelo copiou o número errado.
 */
export function parseEscolhaDaPosicao(
  raw: string,
  posicao: Pick<PosicaoDoLeque, "block_index" | "section" | "idsPermitidos">,
): EscolhaDaPosicao {
  const base = { ...VAZIO, block_index: posicao.block_index, section: posicao.section }
  const start = raw.indexOf("{")
  const end = raw.lastIndexOf("}")
  if (start < 0 || end <= start) return { ...base, erro: "json_ilegivel" }
  let obj: Record<string, unknown>
  try {
    obj = JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>
  } catch {
    return { ...base, erro: "json_ilegivel" }
  }

  const ecos: string[] = []
  if (typeof obj.block_index === "number" && obj.block_index !== posicao.block_index) {
    ecos.push(`block_index ${obj.block_index}`)
  }
  if (typeof obj.section === "string" && normalizarSecao(obj.section) !== normalizarSecao(posicao.section)) {
    ecos.push(`section ${obj.section}`)
  }

  const opts = Array.isArray(obj.escolhas) ? obj.escolhas : []
  const validas = opts
    .filter(
      (o): o is Record<string, unknown> =>
        !!o && typeof o === "object" && typeof (o as Record<string, unknown>).variant_id === "string",
    )
    .map((o) => ({
      variant_id: String(o.variant_id).trim(),
      motivo: typeof o.motivo === "string" ? o.motivo.trim() : "",
    }))
    // Escolher fora das candidatas servidas é o erro que o passo 2 do
    // protocolo proíbe; descartar aqui é o mesmo que o
    // `restrictRankingToShortlist` faz no caminho de hoje.
    .filter((o) => posicao.idsPermitidos.includes(o.variant_id))

  const texto = (k: string) => (typeof obj[k] === "string" ? String(obj[k]).trim() : "")
  const reservaCrua = texto("reserva")

  return {
    ...base,
    papel: texto("papel"),
    justificativa: texto("justificativa"),
    conversa_com: texto("conversa_com"),
    variant_id: validas[0]?.variant_id ?? null,
    motivo: validas[0]?.motivo ?? "",
    // A reserva pode vir no campo próprio ou como 2ª entrada de `escolhas`;
    // nunca pode ser a mesma que a escolhida.
    reserva:
      [reservaCrua, validas[1]?.variant_id]
        .filter((id): id is string => !!id && posicao.idsPermitidos.includes(id))
        .find((id) => id !== validas[0]?.variant_id) ?? null,
    ...(validas.length === 0 ? { erro: opts.length > 0 ? "ids_fora_das_candidatas" : "sem_escolha" } : {}),
    ...(ecos.length > 0 ? { eco_divergente: ecos.join(" · ") } : {}),
  }
}

export interface ResolucaoDeConflito {
  escolha: EscolhaDaPosicao
  /** O que o código mudou, para a telemetria. Vazio quando não mexeu. */
  ajuste: "" | "reserva_por_repeticao" | "vazia_por_repeticao"
}

/**
 * A regra de conjunto que o código ainda precisa impor depois da resposta.
 *
 * O prompt já pede para não repetir, mas pedir não é garantir — e no leque
 * o modelo vê `<ja_decididas>` como texto, não como restrição executável.
 * Aqui a mesma variante em duas posições de `hero` ou `products` cai para a
 * RESERVA em vez de sumir: é para isso que a reserva existe.
 *
 * Fora dessas duas seções repetir é composição legítima (`podeRepetir`) e
 * nada é feito.
 */
export function conflitoComAsDecididas(
  escolha: EscolhaDaPosicao,
  jaDecididas: ReadonlyArray<DecididaAntes>,
): ResolucaoDeConflito {
  if (!escolha.variant_id) return { escolha, ajuste: "" }
  const bloqueados = idsBloqueadosPelaRepeticao(escolha.section, jaDecididas)
  if (!bloqueados.includes(escolha.variant_id)) return { escolha, ajuste: "" }
  if (escolha.reserva && !bloqueados.includes(escolha.reserva)) {
    return {
      escolha: {
        ...escolha,
        variant_id: escolha.reserva,
        motivo: `${escolha.motivo} (reserva: a escolhida já ocupa outra posição de ${normalizarSecao(escolha.section)})`.trim(),
        reserva: null,
      },
      ajuste: "reserva_por_repeticao",
    }
  }
  return {
    escolha: { ...escolha, variant_id: null, motivo: "", erro: "repetida_sem_reserva" },
    ajuste: "vazia_por_repeticao",
  }
}

export interface ResultadoDoLeque {
  escolhas: EscolhaDaPosicao[]
  ajustes: Array<{ block_index: number; ajuste: string }>
  /** Posições em que a chamada LANÇOU — erro de rede, relógio, provedor. */
  falhas: Array<{ block_index: number; erro: string }>
}

/**
 * O laço em série.
 *
 * **`try` por posição, não um try em volta do laço.** No caminho de hoje
 * qualquer erro devolve `null` e o caller mata a geração inteira
 * (`CuratorFailedError`); com N chamadas isso transformaria uma falha de
 * rede na 5ª posição em perda das quatro decisões já tomadas. Aqui a
 * posição que falha vira posição vazia — o mesmo desfecho de "nenhuma
 * candidata sobreviveu", que o pipeline já sabe tratar — e quem decide se
 * o e-mail ainda é viável é a régua de fracasso do caller.
 *
 * Em SÉRIE de propósito: a posição N+1 recebe o que a N decidiu, e é isso
 * que faz o arco existir. Em paralelo, `<ja_decididas>` chegaria vazio em
 * todas e as regras de conjunto não teriam contra o que valer.
 */
export async function escolherPorPosicao(params: {
  posicoes: ReadonlyArray<PosicaoDoLeque>
  chamar: ChamarPosicao
  /** Nome legível da variante, só para o `<ja_decididas>` ficar lido. */
  nomePorVariante?: ReadonlyMap<string, string>
}): Promise<ResultadoDoLeque> {
  const { posicoes, chamar, nomePorVariante } = params
  const jaDecididas: DecididaAntes[] = []
  const escolhas: EscolhaDaPosicao[] = []
  const ajustes: ResultadoDoLeque["ajustes"] = []
  const falhas: ResultadoDoLeque["falhas"] = []

  for (const pos of posicoes) {
    let escolha: EscolhaDaPosicao
    try {
      const { raw } = await chamar(pos, [...jaDecididas])
      escolha = parseEscolhaDaPosicao(raw, pos)
    } catch (e) {
      const erro = e instanceof Error ? e.message : String(e)
      falhas.push({ block_index: pos.block_index, erro })
      escolha = {
        ...VAZIO,
        block_index: pos.block_index,
        section: pos.section,
        erro: `chamada_falhou: ${erro}`,
      }
    }
    const resolvida = conflitoComAsDecididas(escolha, jaDecididas)
    if (resolvida.ajuste) ajustes.push({ block_index: pos.block_index, ajuste: resolvida.ajuste })
    escolhas.push(resolvida.escolha)
    if (resolvida.escolha.variant_id) {
      jaDecididas.push({
        block_index: pos.block_index,
        section: pos.section,
        variant_id: resolvida.escolha.variant_id,
        nome: nomePorVariante?.get(resolvida.escolha.variant_id) ?? null,
        papel: resolvida.escolha.papel || pos.papel || null,
      })
    }
  }

  return { escolhas, ajustes, falhas }
}

/**
 * Costura as N decisões no formato que o pipeline já consome.
 *
 * `fio` não vem do modelo aqui: no leque nenhuma chamada vê o e-mail
 * inteiro, então pedir o fio a uma delas seria pedir uma síntese sobre o
 * que ela não recebeu. Ele vem do Estruturador, que é de quem o fio é.
 */
export function costurarLeque(
  posicoes: ReadonlyArray<Pick<PosicaoDoLeque, "block_index" | "section">>,
  escolhas: ReadonlyArray<EscolhaDaPosicao>,
  fio: string,
): CuradorVaultOutput {
  const porIndice = new Map(escolhas.map((e) => [e.block_index, e]))
  const justificativas: Record<number, string> = {}
  const escolhasDetalhadas: CuradorVaultOutput["escolhasDetalhadas"] = []

  for (const pos of posicoes) {
    const e = porIndice.get(pos.block_index)
    if (e?.justificativa) justificativas[pos.block_index] = e.justificativa
    escolhasDetalhadas.push({
      block_index: pos.block_index,
      justificativa: e?.justificativa ?? "",
      escolhas: e?.variant_id ? [{ variant_id: e.variant_id, motivo: e.motivo }] : [],
    })
  }

  return {
    estrutura: posicoes.map((pos) => ({
      section: pos.section,
      papel: porIndice.get(pos.block_index)?.papel ?? "",
      block_index: pos.block_index,
    })),
    fioNarrativo: fio,
    escolhasRaw: JSON.stringify(escolhasDetalhadas),
    justificativas,
    escolhasDetalhadas,
  }
}
