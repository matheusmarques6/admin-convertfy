/**
 * Auditoria de COBERTURA de uma variante da biblioteca.
 *
 * A pergunta que faltava: *todo* texto visível do HTML da variante tem um
 * campo do `output_schema` que o endereça? E todo campo do schema acha o
 * seu lugar no HTML?
 *
 * Por que não bastava o que já existia. `auditSchemaTags`
 * (`email-workspace/schema-tag-coherence.ts`) compara schema × TAGS
 * `{{PLACEHOLDER}}` — e a biblioteca não usa tags: o endereço de um campo é
 * a FRASE do `example`, casada por `assignTextAnchors`. Um selo escrito
 * "ICON 1" direto no HTML não é tag nenhuma, então ele passa por aquele
 * auditor sem uma linha de aviso, atravessa o pipeline inteiro (sem
 * contrato não entra no payload do n8n, não volta como copy, não é ancorado
 * e nenhum agente de formatação tem alçada para tocar) e chega ao cliente
 * como recheio de mockup.
 *
 * O casador é o MESMO da produção (`buildTextIndex` + `assignTextAnchors` +
 * `orphanTextFragments`), de propósito: uma auditoria com régua própria —
 * `position(example in html)`, por exemplo — acusa como quebrado o que o
 * merge resolve por normalização (entidades, aspas curvas, whitespace) e
 * enche a worklist de falso positivo. O que este módulo reporta é
 * exatamente o que o merge vai fazer.
 */

import {
  assignTextAnchors,
  buildTextIndex,
  orphanTextFragments,
  type AnchorField,
} from "./anchor-match"
import type { Range } from "./dom-locator"
import { fitFragment } from "./fragment-fit"

/** Natureza do campo, derivada quando o cadastro não a declara. */
function natureOf(f: Record<string, unknown>): string {
  const declarada = typeof f.nature === "string" ? f.nature : null
  if (declarada) return declarada
  return f.type === "image" ? "imagem_gerada" : "copy"
}

export type CampoDesfecho = "ancorado_exemplo" | "ambiguo" | "sem_lugar"

export interface CampoAuditado {
  key: string
  example: string
  desfecho: CampoDesfecho
  /** `motivo` do assignTextAnchors — a causa mecânica da não-ancoragem. */
  motivo: string | null
  /** Trecho do HTML que o merge vai substituir (só quando ancorado). */
  de: string | null
  costurado: boolean
}

export interface OrfaoAuditado {
  texto: string
  /** `pareceExemplo`: recheio de mockup × texto fixo legítimo. */
  suspeito: boolean
}

export interface VarianteAuditada {
  id: string
  name: string
  blockType: string | null
  camposCopy: number
  ancorados: number
  campos: CampoAuditado[]
  /** Só os problemáticos, na ordem de declaração. */
  camposComProblema: CampoAuditado[]
  orfaos: OrfaoAuditado[]
  orfaosSuspeitos: number
  /** true quando nada precisa de ação. */
  ok: boolean
}

export interface VarianteEntrada {
  id: string
  name: string
  block_type?: string | null
  /** HTML EFETIVO (`html_tagged` aprovado, senão `html`). */
  html: string
  schema: Array<Record<string, unknown>>
}

/**
 * Audita uma variante. Puro: recebe o HTML efetivo e o schema, devolve o
 * laudo. Sem I/O — quem lê o banco é o chamador.
 */
export function auditVariantCoverage(v: VarianteEntrada): VarianteAuditada {
  // Audita o FRAGMENTO que a montagem usa, não o documento da variante.
  // As variantes são documentos completos e o `<title>` delas é nota de
  // curadoria ("[PREVIEW] Seção — Reviews monospace"): auditar o documento
  // inteiro põe 10 dessas notas na worklist como texto que vaza, quando o
  // desembrulho da montagem já as descarta. `fitFragment` é a MESMA função
  // do `assembleDocument` — o que ela devolve é o que vai para a peça.
  const bruto = v.html ?? ""
  const html = fitFragment(bruto)?.html ?? bruto
  const schema = Array.isArray(v.schema) ? v.schema : []

  const copyFields = schema.filter((f) => natureOf(f) === "copy")

  const fields: AnchorField[] = copyFields.map((f) => ({
    block_id: null,
    key: String(f.key ?? ""),
    example: String(f.example ?? ""),
    // O merge casa a âncora com o valor que a copy trouxe; aqui não há
    // geração, então o que se audita é a ANCORAGEM, não a escrita. Valor
    // vazio mantém o campo no casamento — irmãos com example idêntico
    // precisam disputar a vaga para o desfecho real aparecer.
    value: "",
  }))

  const index = buildTextIndex(html)
  const atribuicoes = fields.length > 0 ? assignTextAnchors(index, fields) : []

  const campos: CampoAuditado[] = atribuicoes.map((a) => ({
    key: a.field.key,
    example: a.field.example,
    desfecho: a.desfecho as CampoDesfecho,
    motivo: a.motivo ?? null,
    de: a.de ?? null,
    costurado: a.costurado === true,
  }))

  // `claimed` são os ranges que o merge reivindicaria — o que sobra fora
  // deles é, por construção, o que a geração nunca escreveria. Os
  // `extraRanges` entram: são as demais ocorrências da MESMA frase que o
  // merge também reescreve (regra 5), e omiti-los inflaria a lista de
  // órfãos com o texto que a arte repete de propósito.
  const claimed: Range[] = []
  for (const a of atribuicoes) {
    if (a.range) claimed.push(a.range)
    for (const extra of a.extraRanges ?? []) claimed.push(extra)
  }

  const orfaos: OrfaoAuditado[] = orphanTextFragments(html, claimed).map(
    (o) => ({ texto: o.texto, suspeito: o.suspeito }),
  )

  const camposComProblema = campos.filter(
    (c) => c.desfecho !== "ancorado_exemplo",
  )
  const orfaosSuspeitos = orfaos.filter((o) => o.suspeito).length

  return {
    id: v.id,
    name: v.name,
    blockType: v.block_type ?? null,
    camposCopy: campos.length,
    ancorados: campos.length - camposComProblema.length,
    campos,
    camposComProblema,
    orfaos,
    orfaosSuspeitos,
    ok: camposComProblema.length === 0 && orfaosSuspeitos === 0,
  }
}

export interface ResumoDaBiblioteca {
  variantes: number
  variantesOk: number
  camposCopy: number
  camposAncorados: number
  camposSemLugar: number
  camposAmbiguos: number
  orfaosSuspeitos: number
  orfaosTotal: number
  /** Contagem por `motivo` — é isto que diz o que consertar primeiro. */
  porMotivo: Record<string, number>
}

/** Agrega o laudo das variantes. Puro. */
export function resumirBiblioteca(
  laudos: VarianteAuditada[],
): ResumoDaBiblioteca {
  const porMotivo: Record<string, number> = {}
  let semLugar = 0
  let ambiguos = 0

  for (const l of laudos) {
    for (const c of l.camposComProblema) {
      if (c.desfecho === "sem_lugar") semLugar++
      else ambiguos++
      const k = c.motivo ?? "sem_motivo"
      porMotivo[k] = (porMotivo[k] ?? 0) + 1
    }
  }

  return {
    variantes: laudos.length,
    variantesOk: laudos.filter((l) => l.ok).length,
    camposCopy: laudos.reduce((s, l) => s + l.camposCopy, 0),
    camposAncorados: laudos.reduce((s, l) => s + l.ancorados, 0),
    camposSemLugar: semLugar,
    camposAmbiguos: ambiguos,
    orfaosSuspeitos: laudos.reduce((s, l) => s + l.orfaosSuspeitos, 0),
    orfaosTotal: laudos.reduce((s, l) => s + l.orfaos.length, 0),
    porMotivo,
  }
}
