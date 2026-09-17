/**
 * O bloco leva um SCHEMA, não uma lista de campos.
 *
 * Depois da 20261065 o bloco passou a carregar o contrato de copy
 * (`email_blocks.fields`), mas ele viajava até o n8n do jeito que está
 * gravado: um array de 9-11 objetos, cada um com 11 propriedades planas
 * (`key,label,type,nature,max_len,min_len,required,example,guidance,tag,
 * source`), incluindo as que são de uso interno (`nature`, `source`) e as
 * que só existem para imagem. Como INPUT DE AGENTE isso não serve: o
 * contrato de resposta — quais chaves devolver — fica implícito num campo
 * (`key`) perdido no meio de dez outros, e o modelo tem que inferir.
 *
 * Aqui o mesmo dado vira um objeto endereçável:
 *
 *   schema: {
 *     variante, diretriz, total_campos, obrigatorios[],
 *     campos: { <key>: { label, tipo, obrigatorio, max_caracteres, ... } }
 *   }
 *
 * O mapa `campos` É o contrato de resposta: as chaves do objeto são
 * exatamente as chaves que o n8n tem de devolver em `content`. Não há mais
 * `key` dentro do item — ela é a posição dele.
 *
 * `placeholder_no_html` SAIU (20/08): o endereço do campo passou a ser o
 * próprio `exemplo` (merge por example) — não há mais {{TAG}} a informar.
 *
 * Campos internos ficam de fora: `nature` já filtrou o que é copy antes de
 * chegar aqui, `source` é telemetria do blueprint e `image_*` é do agente
 * de imagem. O que o copywriter não usa não entra no prompt dele.
 */

import { avaliarClaims, type IncentivoParaClaims } from "@/lib/agents/shared/validadores/claims"
import { orientacaoParaCampo } from "@/lib/agents/shared/orientacao-por-papel"

export interface BlockCopySchemaField {
  label: string
  tipo: string
  obrigatorio: boolean
  max_caracteres: number | null
  min_caracteres: number | null
  exemplo: string | null
  orientacao: string | null
  /**
   * Passo 13: instrução POR CAMPO que vence o `exemplo`. Hoje só nasce
   * quando o exemplo foi removido por prometer o que a decisão nega
   * ("SHOP 10% OFF" numa posição `cupom: false`) — diz ao n8n o que
   * escrever no lugar. Ausente quando o exemplo vale.
   */
  directive?: string | null
}

export interface BlockCopySchema {
  variante: string | null
  diretriz: string | null
  /** Papel narrativo da posição (Estruturador) — 09/09, aditivo. */
  papel?: string | null
  /** Requisitos tipados da posição (cupom/cta/n_itens/preco/avaliacao/campos/exige) — 09/09, aditivo. */
  requisitos?: Record<string, unknown> | null
  total_campos: number
  obrigatorios: string[]
  campos: Record<string, BlockCopySchemaField>
  /**
   * Passo 13: exemplos que a régua de claims removeu (`avaliarClaims`), com
   * o motivo. O n8n obedeceu ao exemplo "SHOP 10% OFF" numa loja sem
   * incentivo (batch 6249aef2) — o exemplo é a instrução mais forte do
   * prompt dele, e mandá-lo era mandar a oferta.
   */
  exemplos_removidos?: Array<{ campo: string; exemplo: string; motivo: string }>
}

/** Só o que o builder precisa de um BlueprintBlockField/BlueprintFieldV2. */
export interface CopySchemaInputField {
  key?: string | null
  label?: string | null
  type?: string | null
  max_len?: number | null
  min_len?: number | null
  required?: boolean | null
  example?: string | null
  guidance?: string | null
  /** Campo omitido pela arbitragem papel × forma (09/09): NÃO entra no schema. */
  omitir?: boolean | null
}

function texto(v: unknown): string | null {
  if (typeof v !== "string") return null
  const t = v.trim()
  return t.length > 0 ? t : null
}

function numeroPositivo(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null
}

/**
 * Monta o `schema` do bloco a partir dos campos de copy já filtrados.
 *
 * Chave duplicada mantém a PRIMEIRA ocorrência (a ordem do schema da
 * variante é a ordem do HTML; a segunda seria uma sobrescrita silenciosa).
 * Campo sem `key` é descartado — sem chave não há como devolver o valor.
 */
export function buildBlockCopySchema(
  fields: CopySchemaInputField[],
  meta: {
    variantName?: string | null
    purpose?: string | null
    papel?: string | null
    requisitos?: Record<string, unknown> | null
    /**
     * Passo 13: a decisão de incentivo do e-mail e as proibições. Com ela,
     * `exemplo` que promete oferta/percentual/código que a decisão nega é
     * REMOVIDO e vira `directive`. Ausente → exemplos passam como vieram.
     */
    incentivo?: IncentivoParaClaims | null
    proibido?: readonly string[] | null
  },
): BlockCopySchema {
  const campos: Record<string, BlockCopySchemaField> = {}
  const obrigatorios: string[] = []
  const exemplosRemovidos: NonNullable<BlockCopySchema["exemplos_removidos"]> = []
  const exigeDaPosicao = Array.isArray(meta?.requisitos?.exige)
    ? (meta.requisitos!.exige as unknown[]).filter((x): x is string => typeof x === "string" && x.trim().length > 0)
    : []

  for (const f of fields) {
    const key = texto(f?.key)
    if (!key || key in campos) continue
    // Omitido pela arbitragem: o n8n não escreve o que não vê. Pedir
    // "devolva vazio" seria mais frágil — ele infere do purpose.
    if (f?.omitir === true) continue

    const obrigatorio = f?.required === true
    let exemplo = texto(f?.example)
    let directive: string | null = null
    if (exemplo && meta?.incentivo) {
      const violacoes = avaliarClaims(exemplo, meta.incentivo, meta.proibido ?? []).filter((v) => v.severidade === "high")
      if (violacoes.length > 0) {
        const motivo = violacoes.map((v) => `${v.tipo}: "${v.trecho}" — ${v.esperado}`).join("; ")
        exemplosRemovidos.push({ campo: key, exemplo, motivo })
        exemplo = null
        directive =
          (exigeDaPosicao.length > 0 ? `Exigências desta posição: ${exigeDaPosicao.join("; ")}. ` : "") +
          `Sem oferta neste campo (${violacoes[0].esperado}). Escreva no mesmo formato e tamanho de um ${texto(f?.type) ?? "text_short"}, sem cupom, percentual ou código.`
      }
    }
    campos[key] = {
      label: texto(f?.label) ?? key,
      tipo: texto(f?.type) ?? "text_short",
      obrigatorio,
      max_caracteres: numeroPositivo(f?.max_len),
      min_caracteres: numeroPositivo(f?.min_len),
      exemplo,
      // A orientação cadastrada à mão na variante SEMPRE vence: esta camada é
      // o piso da biblioteca, não o teto. Quem escreveu `guidance` no
      // `output_schema` sabia de algo que a chave não conta. Sem ela, a régua
      // do PAPEL entra — e papel que ninguém classifica não recebe nada, em
      // vez de receber conselho genérico (que o modelo obedeceria igual).
      orientacao: texto(f?.guidance) ?? orientacaoParaCampo(key, texto(f?.type)),
      ...(directive ? { directive } : {}),
    }
    if (obrigatorio) obrigatorios.push(key)
  }

  return {
    variante: texto(meta?.variantName),
    diretriz: texto(meta?.purpose),
    ...(texto(meta?.papel) ? { papel: texto(meta?.papel) } : {}),
    ...(meta?.requisitos && typeof meta.requisitos === "object" ? { requisitos: meta.requisitos } : {}),
    total_campos: Object.keys(campos).length,
    obrigatorios,
    campos,
    ...(exemplosRemovidos.length > 0 ? { exemplos_removidos: exemplosRemovidos } : {}),
  }
}
