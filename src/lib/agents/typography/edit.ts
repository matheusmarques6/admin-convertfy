/**
 * A edição humana de tipografia, do documento antigo ao novo — módulo PURO.
 *
 * Uma função só, usada pela rota da tela e pelos testes. O que ela garante,
 * na ordem:
 *
 *   1. o índice que a tela usou ainda aponta para o mesmo elemento
 *      (`esperado`) — a tela não tem polling, e entre carregar o e-mail e
 *      salvar um re-render pode ter reescrito o documento; sem essa
 *      conferência, o item 14 vira outro elemento e a escrita acerta o
 *      lugar errado em silêncio;
 *   2. a troca de família da PEÇA (varre head e corpo, casando por nome);
 *   3. as ops por item, com a régua consultiva (`avaliarOpsHumanas`);
 *   4. os `<link>` de webfont reconciliados;
 *   5. os invariantes estruturais — se a contagem de tabelas ou de
 *      declarações de fonte mudou, o resultado inteiro é recusado.
 *
 * Puro (zero I/O) — testável.
 */

import { applyTypographyOps } from "./apply"
import { classifyFontFamily, familiaPrincipal } from "./font-name"
import { checarInvariantesDeTipografia } from "./guards"
import { extractTypographyInventory, type TypographyOccurrence } from "./inventory"
import { avaliarOpsHumanas, type OpDescartada, type TypographyOpHumana } from "./rules"
import { remapFamilies } from "./swap-fonts"
import { reconciliarWebfonts } from "./webfont"

/** O que a tela viu naquele item quando a pessoa clicou nele. */
export interface EsperadoDoItem {
  family?: string
  sizePx?: number | null
  weight?: number | null
  tag?: string
}

export interface OpComEsperado extends TypographyOpHumana {
  esperado?: EsperadoDoItem
}

export interface TrocaDeFamilia {
  /** família atual no documento → família nova. */
  de: string
  para: string
}

export interface EdicaoInput {
  html: string
  familias?: ReadonlyArray<TrocaDeFamilia>
  ops?: ReadonlyArray<OpComEsperado>
  /** Fonte de título da peça — decide a classe no aviso do par. */
  fonteDeTitulo?: string | null
  /** Famílias que a montagem já declarou (não ganham `<link>` novo). */
  webfontsDaMontagem?: ReadonlyArray<string>
}

export interface EdicaoResult {
  html: string
  aplicadas: number
  familiasTrocadas: number
  avisos: OpDescartada[]
  descartadas: OpDescartada[]
  /** Itens cujo `esperado` não bateu — a tela precisa recarregar. */
  desatualizados: Array<{ item: number; esperado: EsperadoDoItem; atual: EsperadoDoItem }>
  /** Preenchido quando um invariante reprovou: o resultado NÃO deve ser gravado. */
  invarianteViolado: string | null
}

function retrato(oc: TypographyOccurrence): EsperadoDoItem {
  return {
    family: familiaPrincipal(oc.family),
    sizePx: oc.sizePx,
    weight: oc.weight,
    tag: oc.tag,
  }
}

/**
 * Compara só os campos que a tela mandou. Mandar menos é legítimo (a tela
 * pode não ter o peso); o que não pode é divergir no que foi mandado.
 */
function bate(esperado: EsperadoDoItem, atual: EsperadoDoItem): boolean {
  if (esperado.family !== undefined && familiaPrincipal(esperado.family) !== atual.family) {
    return false
  }
  if (esperado.sizePx !== undefined && esperado.sizePx !== atual.sizePx) return false
  if (esperado.weight !== undefined && esperado.weight !== atual.weight) return false
  if (esperado.tag !== undefined && esperado.tag.toLowerCase() !== atual.tag) return false
  return true
}

export function aplicarEdicaoTipografica(input: EdicaoInput): EdicaoResult {
  const inventarioOriginal = extractTypographyInventory(input.html)
  const porItem = new Map(inventarioOriginal.map((o) => [o.index, o]))

  // 1. O índice ainda aponta para o mesmo elemento?
  const desatualizados: EdicaoResult["desatualizados"] = []
  const opsValidas: OpComEsperado[] = []
  for (const op of input.ops ?? []) {
    const occ = porItem.get(op.item)
    if (op.esperado && occ && !bate(op.esperado, retrato(occ))) {
      desatualizados.push({ item: op.item, esperado: op.esperado, atual: retrato(occ) })
      continue
    }
    opsValidas.push(op)
  }

  // 2. Troca de família da peça — head e corpo, por nome.
  const mapa: Record<string, string> = {}
  for (const t of input.familias ?? []) {
    if (t.de?.trim() && t.para?.trim()) mapa[t.de] = t.para
  }
  const remap = remapFamilies(input.html, mapa)

  // 3. Ops por item. O inventário é o de DEPOIS do remap: a família mudou,
  // e o aviso do par tem de olhar para o que está no documento agora.
  const inventario = extractTypographyInventory(remap.html)
  const avaliacao = avaliarOpsHumanas(opsValidas, inventario, {
    classePrincipal: input.fonteDeTitulo
      ? classifyFontFamily(input.fonteDeTitulo)
      : undefined,
  })
  const aplicado = applyTypographyOps(remap.html, avaliacao.ops, null)

  // 4. Webfonts: as famílias que ficaram no documento, com os pesos que ele
  // usa. Reconciliar DEPOIS da escrita é o que impede o href de sair sem o
  // peso que a peça acabou de ganhar.
  // Edição que não escreveu nada não mexe no head. A reconciliação existe
  // para manter os links em dia com as fontes QUE ACABAMOS DE ESCREVER;
  // rodá-la à toa faria um "salvar" sem mudança reescrever o documento.
  const escreveu = remap.trocadas > 0 || aplicado.aplicadas > 0
  const familiasEmUso = escreveu
    ? Array.from(
        new Set(
          extractTypographyInventory(aplicado.html)
            .map((o) => (o.family.split(",")[0] ?? "").replace(/["']/g, "").trim())
            .filter(Boolean),
        ),
      )
    : []
  const comLinks = escreveu
    ? reconciliarWebfonts(aplicado.html, familiasEmUso, input.webfontsDaMontagem ?? [])
    : aplicado.html

  // 5. Invariantes.
  const invariantes = checarInvariantesDeTipografia(
    input.html,
    comLinks,
    inventarioOriginal.length,
  )

  return {
    html: comLinks,
    aplicadas: aplicado.aplicadas,
    familiasTrocadas: remap.trocadas + aplicado.familiasTrocadas,
    avisos: avaliacao.avisos,
    descartadas: avaliacao.descartadas,
    desatualizados,
    invarianteViolado: invariantes.ok ? null : invariantes.violacao,
  }
}
