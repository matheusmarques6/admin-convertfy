/**
 * Guards do agente de tipografia — as regras que NÃO dependem do modelo.
 *
 * Base de conhecimento fechada com o especialista em 03/09/2026
 * (`docs/email-generation/agente-tipografia.md`). O prompt pede; estes guards
 * garantem. Op que viola é DESCARTADA com motivo na telemetria — as outras
 * seguem, porque tipografia é acabamento e derrubar a rodada inteira por uma
 * op errada custa mais do que a op errada.
 *
 * Puro (zero I/O) — testável.
 */

import type { TypographyOccurrence } from "./inventory"

/** Uma mudança pedida pelo agente, endereçada por item do inventário. */
export interface TypographyOp {
  item: number
  /** Só "secundaria": voltar à principal não tem op (é o estado atual). */
  fonte?: "secundaria"
  peso?: number
  caixa?: "alta" | "normal"
  tracking?: string
  motivo: string
}

/**
 * A op que o HUMANO escreve no painel de tipografia da tela do email.
 *
 * Os dois campos a mais são deliberadamente INVISÍVEIS para o agente — não
 * por convenção de prompt, mas porque `TypographyDecision.ops` é
 * `TypographyOp[]` e o parser não tem onde colocá-los. Família livre e
 * tamanho são decisão de quem está olhando a peça: o agente escolhe a fonte
 * da biblioteca curada e não redesenha escala.
 *
 * Consequência prática: `aplicarGuards` recebe e devolve `TypographyOp` e
 * nunca vê estes campos, então não pode engoli-los. As ops humanas seguem
 * por `avaliarOpsHumanas`, que AVISA em vez de descartar.
 */
export interface TypographyOpHumana extends TypographyOp {
  familia?: string
  tamanho_px?: number
}

export interface SegundaFonte {
  familia: string
  onde: "destaque" | "corpo"
  /** Classe da fonte — decide o par que sobrevive ao substituto. */
  classe: "serif" | "sans" | "mono" | "display"
  fallback: string
}

export interface TypographyDecision {
  segunda_fonte: SegundaFonte | null
  justificativa: string
  ops: TypographyOp[]
}

export interface OpDescartada {
  item: number
  campo: "fonte" | "familia" | "peso" | "tamanho" | "caixa" | "tracking" | "op"
  motivo: string
}

export interface GuardResult {
  ops: TypographyOp[]
  segundaFonte: SegundaFonte | null
  descartadas: OpDescartada[]
  /** Motivo da recusa da segunda fonte, quando houve. */
  segundaFonteRecusada: string | null
}

/** Piso duro: abaixo disso a troca de família não é percebida como intenção. */
export const PISO_FAMILIA_PX = 16
/** Teto de ocorrências de família secundária na peça (conta ocorrência). */
export const TETO_FAMILIA = 3
/** Teto de pesos distintos por peça. */
export const TETO_PESOS = 3
/** Distância mínima entre dois degraus de peso para serem distinguíveis. */
export const DISTANCIA_PESO = 200

/**
 * Nome de família aceitável — guard de CORREÇÃO, não de gosto: vale para o
 * agente e para o humano, sem exceção.
 *
 * O valor entra dentro de `style="…"`, delimitado por aspa DUPLA. Um nome
 * como `Arial";x="` fecharia o atributo e injetaria markup num documento que
 * depois é enviado por "Enviar teste" e exportado para o Klaviyo — e o guard
 * estrutural não pegaria, porque a contagem de `font-family:` não muda. `;`,
 * `}`, `<` e `url(`/`expression(` quebram ou envenenam a declaração pelo
 * mesmo caminho.
 *
 * A régua é a dos nomes do Google Fonts (letra, dígito, espaço, hífen,
 * sublinhado) — mais estreita, de propósito, que a de
 * `injectSecondaryFontLink`.
 */
const FAMILIA_VALIDA = /^[A-Za-z0-9][A-Za-z0-9 _-]{0,48}$/

/** Devolve o nome limpo, ou null quando ele não pode entrar no documento. */
export function sanitizarFamilia(nome: string | null | undefined): string | null {
  const limpo = (nome ?? "").trim()
  if (!limpo) return null
  return FAMILIA_VALIDA.test(limpo) ? limpo : null
}

const PESOS_VALIDOS = [100, 200, 300, 400, 500, 600, 700, 800, 900]

/** Um degrau acima/abaixo na escala de 100 em 100, dentro dos limites. */
function degrau(peso: number, direcao: 1 | -1): number {
  const i = PESOS_VALIDOS.indexOf(peso)
  if (i === -1) return peso
  const j = Math.max(0, Math.min(PESOS_VALIDOS.length - 1, i + direcao))
  return PESOS_VALIDOS[j]
}

/**
 * Ajuste de peso por fundo escuro (regra 8): no escuro o texto claro sangra.
 * Fino some → sobe; pesado em corpo grande borra e fecha as contraformas →
 * desce. A faixa do meio fica como está.
 */
export function ajustarPesoNoEscuro(
  peso: number,
  sizePx: number | null,
  bgDark: boolean,
): number {
  if (!bgDark) return peso
  if (peso <= 300) return degrau(peso, 1)
  if (peso >= 700 && (sizePx ?? 0) >= 24) return degrau(peso, -1)
  return peso
}

/** Sans + sans some para quem vê o substituto: os dois viram Arial. */
export function parSobreviveAoFallback(
  classePrincipal: string,
  classeSecundaria: string,
): boolean {
  return classePrincipal.toLowerCase() !== classeSecundaria.toLowerCase()
}

export interface GuardOpts {
  /** Classe da fonte principal da loja (sans/serif/mono/display). */
  classePrincipal: string
  /** Peso de título da marca — o que só pode aparecer no maior título. */
  pesoMarca: number | null
}

/**
 * Aplica os guards sobre a decisão do agente.
 *
 * Ordem importa: a recusa da segunda fonte (par ruim) esvazia toda troca de
 * família ANTES do teto de ocorrências, senão o teto contaria ops que já não
 * trocam nada.
 */
export function aplicarGuards(
  decision: TypographyDecision,
  occurrences: TypographyOccurrence[],
  opts: GuardOpts,
): GuardResult {
  const porItem = new Map(occurrences.map((o) => [o.index, o]))
  const descartadas: OpDescartada[] = []
  let segundaFonte = decision.segunda_fonte
  let segundaFonteRecusada: string | null = null

  // G1 — o par tem que sobreviver ao substituto (~40% nunca carrega a fonte).
  if (
    segundaFonte &&
    !parSobreviveAoFallback(opts.classePrincipal, segundaFonte.classe)
  ) {
    segundaFonteRecusada = `par ${opts.classePrincipal}+${segundaFonte.classe} desaparece no substituto — os dois caem na mesma fonte de sistema`
    segundaFonte = null
  }

  const maiorSize = occurrences.reduce((max, o) => Math.max(max, o.sizePx ?? 0), 0)
  const itemDoMaiorTitulo = occurrences.find((o) => (o.sizePx ?? 0) === maiorSize)?.index ?? null

  const saida: TypographyOp[] = []
  let familiasUsadas = 0
  const pesosUsados = new Set<number>(
    occurrences.map((o) => o.weight).filter((w): w is number => w !== null),
  )

  for (const op of decision.ops) {
    const occ = porItem.get(op.item)
    // G8 — op fora do inventário não tem onde ser aplicada.
    if (!occ) {
      descartadas.push({ item: op.item, campo: "op", motivo: "item não existe no inventário" })
      continue
    }

    const limpa: TypographyOp = { item: op.item, motivo: op.motivo }

    if (op.fonte === "secundaria") {
      const recusa =
        !segundaFonte
          ? (segundaFonteRecusada ?? "nenhuma segunda fonte foi decidida")
          : occ.isCta
            ? "rótulo de link/botão nunca troca de família — rompe por caixa e peso"
            : occ.soPontuacao
              ? "ornamento (só pontuação): a família é o desenho do glifo"
              : (occ.sizePx ?? 0) < PISO_FAMILIA_PX
                ? `abaixo do piso de ${PISO_FAMILIA_PX}px a troca de família não é percebida`
                : familiasUsadas >= TETO_FAMILIA
                  ? `teto de ${TETO_FAMILIA} ocorrências de família secundária já atingido`
                  : null
      if (recusa) {
        descartadas.push({ item: op.item, campo: "fonte", motivo: recusa })
      } else {
        limpa.fonte = "secundaria"
        familiasUsadas++
      }
    }

    if (op.peso !== undefined) {
      let peso = op.peso
      const recusa =
        !PESOS_VALIDOS.includes(peso)
          ? `peso ${peso} fora da escala`
          : // G5 — o peso de título da marca só no maior título da peça.
            opts.pesoMarca !== null &&
              peso === opts.pesoMarca &&
              itemDoMaiorTitulo !== null &&
              op.item !== itemDoMaiorTitulo &&
              (occ.sizePx ?? 0) < maiorSize
            ? `peso de título da marca (${opts.pesoMarca}) só vale no maior título (item ${itemDoMaiorTitulo})`
            : null
      if (recusa) {
        descartadas.push({ item: op.item, campo: "peso", motivo: recusa })
      } else {
        // G7 — fundo escuro comprime a escala em direção ao meio.
        const ajustado = ajustarPesoNoEscuro(peso, occ.sizePx, occ.bgDark)
        if (ajustado !== peso) {
          descartadas.push({
            item: op.item,
            campo: "peso",
            motivo: `fundo escuro: ${peso} ajustado para ${ajustado}`,
          })
          peso = ajustado
        }
        // G6 — escala: no máximo 3 pesos, com distância mínima entre eles.
        // O colapso respeita a DIREÇÃO do pedido: quem queria descer não
        // pode acabar subindo por causa do degrau vizinho.
        const atual = occ.weight
        const direcao = atual === null ? 0 : Math.sign(peso - atual)
        const vizinho = [...pesosUsados]
          .filter((w) => w !== peso && Math.abs(w - peso) < DISTANCIA_PESO)
          .filter((w) => (atual === null || direcao === 0 ? true : Math.sign(w - atual) === direcao))
          .sort((a, b) => Math.abs(a - peso) - Math.abs(b - peso))[0]
        const colide = [...pesosUsados].some(
          (w) => w !== peso && Math.abs(w - peso) < DISTANCIA_PESO,
        )
        if (colide && vizinho !== undefined) {
          descartadas.push({
            item: op.item,
            campo: "peso",
            motivo: `degrau desperdiçado: ${peso} fica a menos de ${DISTANCIA_PESO} de ${vizinho} — usando ${vizinho}`,
          })
          peso = vizinho
        } else if (colide) {
          descartadas.push({
            item: op.item,
            campo: "peso",
            motivo: `degrau desperdiçado: ${peso} fica a menos de ${DISTANCIA_PESO} de um peso já usado, e nenhum degrau existente vai na direção pedida`,
          })
          peso = NaN
        } else if (!pesosUsados.has(peso) && pesosUsados.size >= TETO_PESOS) {
          descartadas.push({
            item: op.item,
            campo: "peso",
            motivo: `teto de ${TETO_PESOS} pesos por peça já atingido`,
          })
          peso = NaN
        }
        if (!Number.isNaN(peso) && peso !== occ.weight) {
          limpa.peso = peso
          pesosUsados.add(peso)
        }
      }
    }

    if (op.caixa !== undefined) limpa.caixa = op.caixa
    if (op.tracking !== undefined) {
      if (/^-?\d+(\.\d+)?(px|em)$/.test(op.tracking.trim())) limpa.tracking = op.tracking.trim()
      else descartadas.push({ item: op.item, campo: "tracking", motivo: `tracking inválido: ${op.tracking}` })
    }

    // Op que não muda nada não vira escrita no documento.
    if (limpa.fonte === undefined && limpa.peso === undefined && limpa.caixa === undefined && limpa.tracking === undefined) {
      descartadas.push({ item: op.item, campo: "op", motivo: "op sem efeito depois dos guards" })
      continue
    }
    saida.push(limpa)
  }

  // Segunda fonte que nenhuma op usou não entra no documento (o @import dela
  // seria uma requisição a mais para nada).
  if (segundaFonte && familiasUsadas === 0) {
    segundaFonteRecusada =
      segundaFonteRecusada ?? "nenhuma ocorrência elegível recebeu a segunda fonte"
    segundaFonte = null
  }

  return { ops: saida, segundaFonte, descartadas, segundaFonteRecusada }
}
