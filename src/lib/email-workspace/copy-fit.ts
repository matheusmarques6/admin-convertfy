/**
 * copy-fit — a copy que voltou maior que o limite, e o que fazer com ela.
 *
 * Os limites CHEGAM ao n8n: `buildBlockCopySchema` monta
 * `blocks[].schema.campos.{key}.max_caracteres` para todos os campos de
 * copy, sem exceção (conferido no payload real do batch cc71e995 — 40 de
 * 40). O n8n é que não os respeita: entre 20 e 27/08, TODO run de copy
 * voltou com estouro — 74 campos em 27/08, 56 em 24/08, 37 em 23/08.
 *
 * E o pipeline sabia disso o tempo inteiro. `findFieldDeviations` mede e
 * grava em `parsed_output.desvios` do run `copy`, com o comentário
 * "observabilidade apenas: NÃO rejeita nem trunca" — só que nada lia esse
 * campo: o Estúdio não tinha view para o agente `copy` e a tela de produção
 * não tinha aviso nenhum. O texto longo atravessava o `copy_merge` e era
 * escrito no HTML, e o único lugar onde o estouro aparecia era o email
 * renderizado, com a frase vazando da caixa.
 *
 * Este módulo é a parte pura das duas metades da correção: escolher o que
 * mandar encurtar (o chain reescreve) e dizer o que ainda está fora do
 * limite (a tela mostra). Zero I/O — client-safe, como o `copy-spec` de
 * quem ele reusa a medida.
 */

import type { BlueprintBlockField } from "@/types/email-generation"
import { deriveFieldNature } from "@/lib/agents/shared/component-dimensions"
import { findFieldDeviations } from "./copy-spec"
import { idiomaDivergente, type IdiomaDetectado } from "./idioma-copy"

/** Bloco como ele vem do banco — só o que a medida precisa. */
export interface BlocoComContrato {
  id?: string | null
  position?: number | null
  block_type?: string | null
  content?: Record<string, unknown> | null
  fields?: BlueprintBlockField[] | null
}

/**
 * Travessão e meia-risca — a pontuação que a copy do n8n usa para emendar
 * frase ("ready to send it back — but…"). O HÍFEN fica de fora de
 * propósito: `OBD-II`, `zero-risk` e `e-mail` são palavras, não pontuação,
 * e há um caso desses no próprio email que originou esta regra.
 */
const TRACOS_RE = /[—–]/g

export function contarTracos(texto: string): number {
  return (texto.match(TRACOS_RE) ?? []).length
}

/**
 * Por que o campo entrou na lista. Um campo pode ter mais de um motivo.
 *
 * `idioma` é o terceiro (01/09): a ordem de idioma sai no payload do n8n,
 * em três lugares, e volta copy em português numa loja `en`. O flow não
 * referencia os campos novos — então a correção passou a ser nossa, no
 * agente que já reescreve campo e cujo veredicto é do código.
 */
export type MotivoDeAlvo = "max_len" | "travessao" | "idioma"

/** Um campo a corrigir, endereçado para o prompt e para a tela. */
export interface AlvoDeEncurtamento {
  /** `{position}.{key}` — a chave que o LLM devolve. Única no email. */
  id: string
  position: number
  block_id: string | null
  type: string
  key: string
  label: string
  orientacao: string
  texto: string
  max: number
  min: number | null
  /** Estourou o limite, tem travessão, ou os dois. Nunca vazio. */
  motivos: MotivoDeAlvo[]
  /** Quantos travessões/meias-riscas o texto tem agora. */
  tracos: number
  /** Só quando o motivo `idioma` está presente: o que o detector viu. */
  idioma_detectado?: IdiomaDetectado
  /** O idioma da loja (`client_stores.language`), como está gravado. */
  idioma_esperado?: string
}

/**
 * Os campos a corrigir, na ordem dos blocos.
 *
 * Dois motivos: passou do `max_len` (só `kind: "max_len"` —
 * `missing`/`required_empty` ficam de fora de propósito, porque encurtador
 * não inventa copy que não veio) e TRAVESSÃO no texto, que entra mesmo
 * quando o campo cabe no limite: o traço é do jeito que o modelo escreve,
 * não do tamanho da frase.
 */
export function alvosDeEncurtamento(
  blocos: ReadonlyArray<BlocoComContrato>,
  opts?: { idiomaDaLoja?: string | null },
): AlvoDeEncurtamento[] {
  const idiomaDaLoja = opts?.idiomaDaLoja ?? null
  const out: AlvoDeEncurtamento[] = []
  blocos.forEach((b, i) => {
    const fields = b.fields ?? []
    if (fields.length === 0) return
    const position = typeof b.position === "number" ? b.position : i
    // Estouros indexados por chave: a varredura agora é sobre os CAMPOS
    // (todo campo de copy pode ter traço), não sobre a lista de desvios.
    const estouroPorChave = new Map(
      findFieldDeviations(b.content, fields)
        .filter((d) => d.kind === "max_len")
        .map((d) => [d.key, d.max_len]),
    )
    for (const f of fields) {
      if (deriveFieldNature(f) !== "copy") continue
      const texto = String(b.content?.[f.key] ?? "").trim()
      if (!texto) continue
      const max = estouroPorChave.get(f.key)
      const tracos = contarTracos(texto)
      const idioma = idiomaDivergente(texto, idiomaDaLoja)
      const motivos: MotivoDeAlvo[] = []
      if (max != null) motivos.push("max_len")
      if (tracos > 0) motivos.push("travessao")
      if (idioma.divergente) motivos.push("idioma")
      if (motivos.length === 0) continue
      out.push({
        id: `${position}.${f.key}`,
        position,
        block_id: b.id ?? null,
        type: b.block_type ?? "",
        key: f.key,
        label: f.label || f.key,
        orientacao: f.guidance || "",
        texto,
        max: max ?? f.max_len,
        min: f.min_len ?? null,
        motivos,
        tracos,
        ...(idioma.divergente
          ? {
              idioma_detectado: idioma.detectado,
              idioma_esperado: (idiomaDaLoja ?? "").trim(),
            }
          : {}),
      })
    }
  })
  return out
}

export type MotivoDeRecusa =
  | "vazio"
  | "ainda_acima_do_limite"
  | "abaixo_do_minimo"
  | "cresceu"
  | "identico"
  /** Alvo de travessão cuja reescrita ainda tem travessão. */
  | "traco_permaneceu"
  /** Alvo de idioma cuja reescrita voltou no idioma errado. */
  | "idioma_permaneceu"

export interface VeredictoDeReescrita {
  ok: boolean
  motivo?: MotivoDeRecusa
}

/**
 * Aceita a reescrita? Quem decide é o CÓDIGO, não o modelo.
 *
 * O agente pode devolver qualquer coisa — a frase inteira de volta, um
 * texto ainda maior, uma string vazia. Cada recusa vira um `motivo` que o
 * run guarda: reescrita descartada em silêncio seria o mesmo buraco que
 * este módulo existe para fechar.
 *
 * `min` é cobrado quando existe porque um "OK" de 2 caracteres cabe no
 * limite e destrói o bloco.
 */
export function aceitarReescrita(
  original: string,
  novo: unknown,
  limites: {
    max: number
    min?: number | null
    motivos?: MotivoDeAlvo[]
    /** Idioma da loja — cobrado só quando o motivo `idioma` está na lista. */
    idiomaEsperado?: string | null
  },
): VeredictoDeReescrita {
  const motivos = limites.motivos ?? ["max_len"]
  const texto = typeof novo === "string" ? novo.trim() : ""
  if (!texto) return { ok: false, motivo: "vazio" }
  if (texto === original.trim()) return { ok: false, motivo: "identico" }
  // Pediu para tirar o traço e o traço continua lá: o agente não fez o
  // trabalho. Vale mesmo que o texto tenha encurtado.
  if (motivos.includes("travessao") && contarTracos(texto) > 0) {
    return { ok: false, motivo: "traco_permaneceu" }
  }
  // Traduziu para o idioma errado (ou não traduziu). O detector só reprova
  // quando se pronuncia: reescrita curta demais para ter veredicto passa —
  // o mesmo conservadorismo que decide quem VIRA alvo decide quem sai.
  if (motivos.includes("idioma")) {
    const veredicto = idiomaDivergente(texto, limites.idiomaEsperado)
    if (veredicto.divergente) return { ok: false, motivo: "idioma_permaneceu" }
  }
  if (limites.max > 0 && texto.length > limites.max) {
    return { ok: false, motivo: "ainda_acima_do_limite" }
  }
  // "Nunca crescer" só vale para quem entrou por ESTOURO — aí encurtar é o
  // pedido, e texto maior nunca é a correção. Para o alvo que entrou só
  // por travessão ou por IDIOMA, crescer é legítimo: trocar "back — but"
  // por "back, and then" custa caracteres, e verter uma frase para outra
  // língua muda o tamanho nos dois sentidos. O teto do `max` acima
  // continua valendo nos dois casos.
  if (
    motivos.includes("max_len") &&
    texto.length > original.trim().length
  ) {
    return { ok: false, motivo: "cresceu" }
  }
  if (limites.min != null && limites.min > 0 && texto.length < limites.min) {
    return { ok: false, motivo: "abaixo_do_minimo" }
  }
  return { ok: true }
}

/** Aplica só as reescritas aceitas — o resto do content passa intacto. */
export function aplicarReescritas(
  content: Record<string, unknown> | null | undefined,
  aceitas: ReadonlyArray<{ key: string; texto: string }>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...(content ?? {}) }
  for (const a of aceitas) out[a.key] = a.texto
  return out
}

/** Um campo acima do limite, do jeito que a tela precisa mostrar. */
export interface EstouroNaTela {
  position: number
  type: string
  key: string
  label: string
  length: number
  max_len: number
}

/**
 * O que a TELA usa. Lê `fields` + `content` dos blocos que a rota de
 * detalhe do email já devolve (`select("*")`), então não há query nova e o
 * número reflete o estado ATUAL — inclusive o que a pessoa acabou de
 * escrever na aba Copy, não um retrato do run.
 */
export function resumoDeEstouros(
  blocos: ReadonlyArray<BlocoComContrato>,
): EstouroNaTela[] {
  // SÓ quem passou do limite. `alvosDeEncurtamento` passou a incluir também
  // o campo que entrou por travessão — e esse cabe na caixa. Sem o filtro, a
  // pílula da tela do email diria "acima do limite" para uma frase que não
  // está, e o número que serve para decidir o que precisa de olho humano
  // viraria ruído.
  return alvosDeEncurtamento(blocos)
    .filter((a) => a.motivos.includes("max_len"))
    .map((a) => ({
      position: a.position,
      type: a.type,
      key: a.key,
      label: a.label,
      length: a.texto.length,
      max_len: a.max,
    }))
}

/**
 * Limite de um campo do bloco, para o contador da aba Copy. `null` = campo
 * sem contrato ou que não é copy (imagem/asset) — sem limite a cobrar.
 */
export function limiteDoCampo(
  fields: BlueprintBlockField[] | null | undefined,
  key: string,
): number | null {
  const f = (fields ?? []).find((x) => x.key === key)
  if (!f || !(f.max_len > 0)) return null
  if (deriveFieldNature(f) !== "copy") return null
  return f.max_len
}
