/**
 * Auditoria dos `requisitos` do Estruturador (Passo 7 do plano de set/2026).
 *
 * O filtro por contrato do Curador (`elegiveisPorPosicao`) e o `omitir` do
 * Blueprint leem os `requisitos` de cada posição como VERDADE. Se o
 * Estruturador os declara errado — `cupom: false` num toque que tem cupom,
 * `cupom: "false"` (string, descartado em silêncio), `preco: true` numa
 * seção onde nenhuma variante mostra preço —, o filtro elimina a variante
 * certa ou deixa passar a errada, e nada acusa. Batch 6249aef2 (Hero
 * Boxers · Welcome 1, 11/09): as seis posições saíram `cupom: false` com o
 * incentivo do toque existindo no catálogo de outlines; a hero prometeu 10%
 * OFF numa estrutura montada sem cupom.
 *
 * Esta auditoria confere o output do agente contra o que ELE recebeu
 * (alvo, incentivo, capacidade da biblioteca, seções disponíveis) e contra
 * o que a normalização descartou. Duas severidades:
 *
 * - **dura** — o filtro receberia uma instrução errada. Em `on`, vira
 *   retentativa com a lista no prompt e, esgotada, `estruturador_incoerente`.
 * - **aviso** — só registro (telemetria); não bloqueia.
 *
 * Puro (zero I/O). Quem decide o que fazer com o resultado é o serviço.
 */

import type { AlvoDoEmail } from "../objecoes/vocabulario"
import type { DecisaoDeIncentivo } from "../objecoes/incentivo"
import type { CapacidadeDaSecao } from "../shared/field-roles"
import type { DescarteDePosicao, EstruturadorOutput, RequisitosDaPosicao } from "./estruturador-prompt"

export type RegraDaAuditoria =
  | "sem_requisitos"
  | "valor_descartado"
  | "cupom_contradiz_incentivo"
  | "incentivo_sem_lugar"
  | "exige_fora_da_capacidade"
  | "secao_fora_da_lista"
  | "papel_diz_requisito_nao"
  | "descarte_sem_dispositivo"
  | "dispositivo_ausente"
  | "dispositivo_sem_variante"

export interface AchadoDaAuditoria {
  regra: RegraDaAuditoria
  /** Índice na `estrutura` final; null quando o achado é do output inteiro. */
  block_index: number | null
  section: string | null
  detalhe: string
}

export interface AuditoriaDosRequisitos {
  ok: boolean
  duras: AchadoDaAuditoria[]
  avisos: AchadoDaAuditoria[]
  descartados: DescarteDePosicao[]
  posicoes: number
  com_requisito: number
}

export interface AuditarRequisitosInput {
  saida: EstruturadorOutput
  alvo: AlvoDoEmail | null
  incentivo: DecisaoDeIncentivo | null
  capacidade: Record<string, CapacidadeDaSecao>
  secoesDisponiveis: string[]
  descartados: DescarteDePosicao[]
}

/** Campos cujo descarte muda o FILTRO do Curador (o resto é copy/imagem). */
const CAMPOS_DE_FILTRO = new Set(["dispositivo", "cupom", "cta", "n_itens", "preco", "avaliacao", "requisitos"])

/** Seções que o system manda NUNCA emitir (absorvidas pela vizinha). */
const SECOES_PROIBIDAS = new Set(["header", "cta"])

const norm = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim()

/**
 * "sem cupom" / "no coupon" / "without a discount code" no papel ou no
 * `exige` enquanto o requisito tipado ficou `null`: a decisão existe em
 * prosa e não chegou à máquina — é o estado que este módulo existe para
 * apagar. Só a NEGAÇÃO é lida: "com preço" pode ser desejo, "sem preço" é
 * ordem.
 */
const NEGACOES: Array<{ campo: keyof Pick<RequisitosDaPosicao, "cupom" | "cta" | "preco" | "avaliacao">; re: RegExp }> = [
  { campo: "cupom", re: /\b(sem|nenhum|no|without|zero)\s+(cupom|coupon|codigo|code|desconto|discount|oferta|offer|incentivo|incentive)\b/ },
  { campo: "cta", re: /\b(sem|nenhum|no|without)\s+(cta|botao|button)\b/ },
  { campo: "preco", re: /\b(sem|nenhum|no|without)\s+(preco|price)\b/ },
  { campo: "avaliacao", re: /\b(sem|nenhuma|no|without)\s+(avaliacao|avaliacoes|rating|ratings|review|reviews|estrela|estrelas|star|stars)\b/ },
]

export function auditarRequisitos(input: AuditarRequisitosInput): AuditoriaDosRequisitos {
  const duras: AchadoDaAuditoria[] = []
  const avisos: AchadoDaAuditoria[] = []
  const { saida, alvo, incentivo, capacidade, descartados } = input
  const estrutura = saida.estrutura
  const disponiveis = new Set(input.secoesDisponiveis.map(norm))
  const comRequisito = estrutura.filter((p) => p.requisitos != null)

  // ── sem_requisitos ────────────────────────────────────────────────────
  if (comRequisito.length === 0) {
    duras.push({
      regra: "sem_requisitos",
      block_index: null,
      section: null,
      detalhe: `nenhuma das ${estrutura.length} posições declarou "requisitos" — o Curador e o Blueprint não têm o que filtrar`,
    })
  } else {
    estrutura.forEach((p, i) => {
      if (!p.requisitos) {
        avisos.push({
          regra: "sem_requisitos",
          block_index: i,
          section: p.section,
          detalhe: `posição ${i + 1} (${p.section}) sem "requisitos"`,
        })
      }
    })
  }

  // ── valor_descartado ──────────────────────────────────────────────────
  for (const d of descartados) {
    const achado: AchadoDaAuditoria = {
      regra: "valor_descartado",
      block_index: d.block_index,
      section: d.section,
      detalhe: `posição ${d.block_index + 1} (${d.section}): "${d.campo}" = ${JSON.stringify(d.valor_cru)} não é um valor tipado e foi descartado (virou indiferente)`,
    }
    if (CAMPOS_DE_FILTRO.has(d.campo)) duras.push(achado)
    else avisos.push(achado)
  }

  // ── cupom × incentivo ─────────────────────────────────────────────────
  if (incentivo) {
    const comCupom = estrutura
      .map((p, i) => ({ p, i }))
      .filter(({ p }) => p.requisitos?.cupom === true)
    if (incentivo.existe === false) {
      for (const { p, i } of comCupom) {
        duras.push({
          regra: "cupom_contradiz_incentivo",
          block_index: i,
          section: p.section,
          detalhe: `posição ${i + 1} (${p.section}) exige cupom e este toque NÃO tem incentivo (${incentivo.origem})`,
        })
      }
    } else if (incentivo.existe === true && comCupom.length === 0) {
      const toqueEntrega = (alvo?.trabalhos_fixos ?? []).some(
        (t) => t === "entrega_de_incentivo" || t === "lembrete_de_incentivo_vivo",
      )
      const achado: AchadoDaAuditoria = {
        regra: "incentivo_sem_lugar",
        block_index: null,
        section: null,
        detalhe: `o toque tem incentivo (${incentivo.codigo ?? "código não cadastrado"}${incentivo.valor ? ` · ${incentivo.valor}` : ""}, origem ${incentivo.origem})${toqueEntrega ? " e o alvo pede a ENTREGA dele" : ""}, mas nenhuma posição declara "cupom": true`,
      }
      // Com o alvo mandando entregar o incentivo é contradição; sem alvo o
      // toque pode legitimamente não entregar o cupom neste e-mail.
      if (toqueEntrega) duras.push(achado)
      else avisos.push(achado)
    }
  }

  // ── por posição ───────────────────────────────────────────────────────
  estrutura.forEach((p, i) => {
    const sec = norm(p.section)
    const cap = capacidade[p.section] ?? capacidade[sec]

    if (SECOES_PROIBIDAS.has(sec)) {
      duras.push({
        regra: "secao_fora_da_lista",
        block_index: i,
        section: p.section,
        detalhe: `posição ${i + 1}: "${p.section}" nunca é emitida — o papel vai para a posição vizinha (regra do system)`,
      })
    } else if (disponiveis.size > 0 && !disponiveis.has(sec)) {
      duras.push({
        regra: "secao_fora_da_lista",
        block_index: i,
        section: p.section,
        detalhe: `posição ${i + 1}: "${p.section}" não está em <secoes_disponiveis> (${input.secoesDisponiveis.join(", ")})`,
      })
    }

    const r = p.requisitos
    // Dispositivo (B3): obrigatório onde a seção tem variantes classificadas.
    // Seção sem NENHUMA classificada (biblioteca ainda não passou pelo
    // backfill) só avisa — reprovar a geração por dado que não existe seria
    // o erro caro.
    if (r && cap) {
      const secaoClassificada = (cap.classificadas ?? 0) > 0
      if (!r.dispositivo) {
        const achado: AchadoDaAuditoria = {
          regra: "dispositivo_ausente",
          block_index: i,
          section: p.section,
          detalhe: `posição ${i + 1} (${p.section}) sem "requisitos.dispositivo" — o Curador não tem o primeiro filtro (dispositivos da seção: ${Object.keys(cap.por_dispositivo ?? {}).join(", ") || "nenhum classificado"})`,
        }
        if (secaoClassificada) duras.push(achado)
        else avisos.push(achado)
      } else if (!(cap.por_dispositivo ?? {})[r.dispositivo]) {
        const achado: AchadoDaAuditoria = {
          regra: "dispositivo_sem_variante",
          block_index: i,
          section: p.section,
          detalhe: `posição ${i + 1} (${p.section}) pede "${r.dispositivo}" e a biblioteca não tem variante ativa desse dispositivo (tem: ${Object.keys(cap.por_dispositivo ?? {}).join(", ") || "nenhuma classificada"})`,
        }
        if (secaoClassificada) duras.push(achado)
        else avisos.push(achado)
      }
    }
    if (r && cap) {
      const fora = (o: string) =>
        duras.push({
          regra: "exige_fora_da_capacidade",
          block_index: i,
          section: p.section,
          detalhe: `posição ${i + 1} (${p.section}) exige ${o}, e a biblioteca não tem variante dessa seção que o ofereça`,
        })
      if (r.preco === true && cap.com_preco === 0) fora("preço")
      if (r.avaliacao === true && cap.com_avaliacao === 0) fora("avaliação")
      if (r.cupom === true && cap.com_cupom === 0) fora("cupom")
      if (r.cta === true && cap.com_cta === 0) fora("CTA")
      if (r.n_itens && cap.itens && (r.n_itens.min > cap.itens.max || r.n_itens.max < cap.itens.min)) {
        fora(`${r.n_itens.min}–${r.n_itens.max} itens (a seção vai de ${cap.itens.min} a ${cap.itens.max})`)
      }
    }

    // Decisão em prosa que não chegou ao requisito tipado.
    const prosa = norm([p.papel, ...(r?.exige ?? [])].join(" · "))
    for (const neg of NEGACOES) {
      if ((r?.[neg.campo] ?? null) == null && neg.re.test(prosa)) {
        avisos.push({
          regra: "papel_diz_requisito_nao",
          block_index: i,
          section: p.section,
          detalhe: `posição ${i + 1} (${p.section}): o texto nega ${neg.campo} ("${prosa.match(neg.re)?.[0]}"), mas "requisitos.${neg.campo}" ficou indiferente — o filtro não lê prosa`,
        })
      }
    }
  })

  // ── descartes ─────────────────────────────────────────────────────────
  saida.descartes.forEach((d, i) => {
    if (!d.porque.trim() || (!d.section && !d.papel_na_referencia)) {
      avisos.push({
        regra: "descarte_sem_dispositivo",
        block_index: null,
        section: d.section,
        detalhe: `descarte ${i + 1} sem ${!d.porque.trim() ? "porquê" : "seção nem papel na referência"} — não dá para saber o que ficou de fora`,
      })
    } else if (d.section && !d.dispositivo && (capacidade[d.section]?.classificadas ?? 0) > 0) {
      avisos.push({
        regra: "descarte_sem_dispositivo",
        block_index: null,
        section: d.section,
        detalhe: `descarte ${i + 1} (${d.section}) sem "dispositivo" — o Curador não sabe qual forma NÃO recolocar`,
      })
    }
  })

  return {
    ok: duras.length === 0,
    duras,
    avisos,
    descartados,
    posicoes: estrutura.length,
    com_requisito: comRequisito.length,
  }
}

/**
 * O bloco `<auditoria_anterior>` da retentativa: só as duras (são as que
 * bloqueiam), numeradas, com a instrução de manter o resto.
 */
export function renderAuditoria(a: AuditoriaDosRequisitos): string {
  if (a.duras.length === 0) return "(primeira tentativa — nada a corrigir)"
  const linhas = a.duras.map((d, i) => `${i + 1}. [${d.regra}] ${d.detalhe}`)
  return [
    `Sua resposta anterior tinha ${a.duras.length} incoerência(s) nos "requisitos". Corrija TODAS, mantendo o que não foi apontado:`,
    ...linhas,
  ].join("\n")
}

/** Resumo curto para `error_message` e para o log. */
export function resumoDasDuras(a: AuditoriaDosRequisitos): string {
  const porRegra = new Map<string, number>()
  for (const d of a.duras) porRegra.set(d.regra, (porRegra.get(d.regra) ?? 0) + 1)
  return Array.from(porRegra.entries())
    .map(([r, n]) => (n > 1 ? `${r}×${n}` : r))
    .join(", ")
}
