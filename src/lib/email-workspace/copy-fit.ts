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

/** Bloco como ele vem do banco — só o que a medida precisa. */
export interface BlocoComContrato {
  id?: string | null
  position?: number | null
  block_type?: string | null
  content?: Record<string, unknown> | null
  fields?: BlueprintBlockField[] | null
}

/** Um campo que estourou o limite, endereçado para o prompt e para a tela. */
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
}

/**
 * Os campos a encurtar, na ordem dos blocos.
 *
 * Só `kind: "max_len"`. `missing`/`required_empty` ficam de fora de
 * propósito: encurtador não inventa copy que não veio — isso é problema do
 * flow do n8n, e mascará-lo aqui esconderia o campo que sumiu.
 */
export function alvosDeEncurtamento(
  blocos: ReadonlyArray<BlocoComContrato>,
): AlvoDeEncurtamento[] {
  const out: AlvoDeEncurtamento[] = []
  blocos.forEach((b, i) => {
    const fields = b.fields ?? []
    if (fields.length === 0) return
    const position = typeof b.position === "number" ? b.position : i
    const porChave = new Map(fields.map((f) => [f.key, f]))
    for (const d of findFieldDeviations(b.content, fields)) {
      if (d.kind !== "max_len") continue
      const f = porChave.get(d.key)
      const texto = String(b.content?.[d.key] ?? "").trim()
      if (!f || !texto) continue
      out.push({
        id: `${position}.${d.key}`,
        position,
        block_id: b.id ?? null,
        type: b.block_type ?? "",
        key: d.key,
        label: f.label || d.key,
        orientacao: f.guidance || "",
        texto,
        max: d.max_len,
        min: f.min_len ?? null,
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
  limites: { max: number; min?: number | null },
): VeredictoDeReescrita {
  const texto = typeof novo === "string" ? novo.trim() : ""
  if (!texto) return { ok: false, motivo: "vazio" }
  if (texto === original.trim()) return { ok: false, motivo: "identico" }
  if (limites.max > 0 && texto.length > limites.max) {
    return { ok: false, motivo: "ainda_acima_do_limite" }
  }
  // Encurtar é encurtar: texto maior que o que entrou nunca é a correção
  // pedida, mesmo que por acaso caiba num limite mal cadastrado.
  if (texto.length > original.trim().length) return { ok: false, motivo: "cresceu" }
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
  return alvosDeEncurtamento(blocos).map((a) => ({
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
