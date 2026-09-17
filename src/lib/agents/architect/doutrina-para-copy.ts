/**
 * `emails[].doutrina` — a doutrina de copy do vault, montada para quem
 * ESCREVE a peça.
 *
 * Por que existe (17/09): o contrato desta chave estava definido dos dois
 * lados — descrito em `docs/email-copy-payload-v2.md` e já lido pelo prompt
 * do redator (`{{ $json.doutrina_txt }}`) — e o dispatch nunca a montava.
 * Chegava `null` em toda geração. `buildDoutrinaBlock` e
 * `buildJulgamentoBlock` existiam, testados, versionados, com teto e ausência
 * declarada, e o único chamador de ambos era um arquivo de teste.
 *
 * O resultado: quem escreve recebia um payload de CONTRATO — chaves,
 * `max_caracteres`, `exemplo`, proibições — e nenhuma linha de MÉTODO. Tudo
 * que o pipeline sabia sobre qualidade era negativo (não inventar oferta, não
 * estourar a caixa, não vazar placeholder). A doutrina da casa chegava só ao
 * QA, que roda em `shadow`: a revisão que a conhece não reprova nada, e o
 * redator nunca a tinha visto.
 *
 * Três decisões:
 *
 * 1. **Por SEÇÃO, não a pilha inteira.** O bloco de produtos não precisa da
 *    doutrina de assunto. O roteamento já existe — é o `secao:` do
 *    frontmatter — e servir tudo a todos transformaria o bloco num segundo
 *    catálogo, que é o que o teto de notas de `buildDoutrinaBlock` evita.
 * 2. **Específica antes de geral, e o teto corta a geral primeiro.** Quando
 *    o orçamento aperta, o que se perde é o conselho que vale para toda peça,
 *    não o que fala desta seção.
 * 3. **Ausência é DECLARADA pelo consumidor, não escondida aqui.** Lista
 *    vazia significa "o vault não tem doutrina para estas seções" — e é
 *    isso que a telemetria do dispatch registra, em vez de um silêncio que
 *    ninguém consegue distinguir de uma falha de leitura.
 *
 * Puro.
 */

import { doutrinasDaSecao, primeiraFrase, secoesDaDoutrina } from "./curador-vault"
import type { CuradorVaultKnowledge } from "./curador-vault"

/** O contrato de `docs/email-copy-payload-v2.md`. */
export interface DoutrinaDoPayload {
  slug: string
  secao: string
  fonte: string | null
  resumo: string | null
  corpo: string
}

/** Teto do corpo, como o contrato publicado declara. */
const CORPO_MAX = 3_000
/**
 * Teto de notas no e-mail inteiro. Seis seções a três notas cada seriam 18
 * notas e ~54k de entrada por e-mail — o dedupe por slug já corta a maior
 * parte (as gerais se repetem em toda seção), e este teto é o que impede o
 * bloco de virar o maior item do payload.
 */
const NOTAS_MAX = 8

function corta(s: string, max: number): string {
  const t = (s ?? "").trim()
  return t.length <= max ? t : `${t.slice(0, max)}…`
}

function fonteDe(fm: Record<string, unknown>): string | null {
  const v = fm.fonte
  return typeof v === "string" && v.trim() ? v.trim() : null
}

/**
 * As notas de doutrina que servem a este e-mail.
 *
 * `secoes` são as seções que ele tem de verdade (os `block_type` dos blocos),
 * mais `assunto`, que todo e-mail tem. `geral` entra sozinha — é o que
 * `doutrinasDaSecao` devolve junto de cada seção pedida.
 */
export function doutrinaParaCopy(
  k: CuradorVaultKnowledge,
  secoes: readonly string[],
): DoutrinaDoPayload[] {
  const pedidas = [...new Set(secoes.map((s) => (s ?? "").trim().toLowerCase()).filter(Boolean))]
  if (pedidas.length === 0) return []

  const especificas: DoutrinaDoPayload[] = []
  const gerais: DoutrinaDoPayload[] = []
  const vistos = new Set<string>()

  for (const secao of pedidas) {
    for (const d of doutrinasDaSecao(k, secao)) {
      if (vistos.has(d.slug)) continue
      vistos.add(d.slug)
      const declaradas = secoesDaDoutrina(d)
      const item: DoutrinaDoPayload = {
        slug: d.slug,
        // A seção que a nota DECLARA, não a que pediu por ela: é o que
        // permite ao redator saber se a regra é desta peça ou de qualquer uma.
        secao: declaradas.includes(secao) ? secao : "geral",
        fonte: fonteDe(d.frontmatter),
        resumo: primeiraFrase(d.body_md),
        corpo: corta(d.body_md, CORPO_MAX),
      }
      if (item.secao === "geral") gerais.push(item)
      else especificas.push(item)
    }
  }

  return [...especificas, ...gerais].slice(0, NOTAS_MAX)
}
