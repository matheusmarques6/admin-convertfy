/**
 * Achar o JSON dentro do que o modelo escreveu.
 *
 * O contrato dito no prompt é "responda só JSON". O que chega é outra
 * coisa: o modelo abre com um rascunho, pensa em prosa no meio e fecha com
 * a resposta. Medido em 11/09 (run b49b0131, `copy_fit`, sonnet-4.6, 3.811
 * chars) — ele abriu com um ÍNDICE das chaves que ia corrigir, sem valor
 * nenhum:
 *
 *     {"campos":{"1.cta_label":"SEE HOW IT WORKS","2.glass_subtitle",…}}
 *
 * …trabalhou campo a campo em prosa ("**2.glass_subtitle** — 50 → max 38…")
 * e fechou com o JSON correto, os oito campos preenchidos e dentro do
 * limite. O recorte antigo ia do primeiro `{` ao último `}`, então engolia
 * o rascunho quebrado, a prosa e a resposta boa num blob só — e o
 * `JSON.parse` morria em "Expected ':' after property name in position 62",
 * a posição exata onde o índice do começo tropeça.
 *
 * A resposta paga (2.702 tokens de entrada, 1.158 de saída) ia para o lixo,
 * e os oito campos chegavam ao cliente sem correção — com travessão e
 * estourando o limite, que foi a queixa de quem leu o e-mail.
 *
 * ── A regra ──────────────────────────────────────────────────────────
 *
 * O ÚLTIMO bloco balanceado que parseia vence. É a conclusão do modelo: o
 * que vem antes é rascunho por construção, porque ele escreve em ordem. O
 * primeiro que parseia seria a escolha errada justamente no caso que este
 * módulo existe para resolver.
 *
 * Módulo PURO. Quem decide onde o JSON começa e termina não precisa de I/O
 * para ser testado, e aqui um engano custa a resposta inteira.
 */

/**
 * Os blocos `{…}` e `[…]` balanceados do texto, na ordem em que aparecem.
 *
 * Aspas e escapes são respeitados: uma chave dentro de string ("use `}` to
 * close") não fecha bloco nenhum. Sem isso, copy com chave ou colchete —
 * que é exatamente o que estes agentes escrevem — partiria o bloco no meio
 * e o recorte sairia inválido.
 */
export function blocosBalanceados(texto: string): string[] {
  const blocos: string[] = []
  let inicio = -1
  let profundidade = 0
  let abertura: "{" | "[" | null = null
  let emString = false
  let escapado = false

  for (let i = 0; i < texto.length; i++) {
    const c = texto[i]

    if (emString) {
      if (escapado) escapado = false
      else if (c === "\\") escapado = true
      else if (c === '"') emString = false
      continue
    }
    if (c === '"') {
      emString = true
      continue
    }

    if (c === "{" || c === "[") {
      if (profundidade === 0) {
        inicio = i
        abertura = c
      }
      profundidade++
      continue
    }
    if (c === "}" || c === "]") {
      if (profundidade === 0) continue
      profundidade--
      if (profundidade === 0 && inicio >= 0) {
        const fechaCerto = abertura === "{" ? c === "}" : c === "]"
        // Fechamento trocado (`{…]`) é lixo, não bloco: incluí-lo faria o
        // `JSON.parse` do chamador falhar num candidato que nunca teve
        // chance, escondendo o candidato bom que vem depois.
        if (fechaCerto) blocos.push(texto.slice(inicio, i + 1))
        inicio = -1
        abertura = null
      }
    }
  }
  return blocos
}

/**
 * O JSON utilizável da resposta, ou `null` quando não há nenhum.
 *
 * Devolve a STRING (não o objeto) porque é o que os 25 chamadores de
 * `extractJson` esperam — eles fazem o `JSON.parse` e tratam o erro do
 * jeito deles. Trocar isso por objeto mudaria 25 tratamentos de erro de uma
 * vez, num caminho que já está frágil.
 */
export function jsonUtilizavel(texto: string): string | null {
  const blocos = blocosBalanceados(texto)
  // Do fim para o começo: a conclusão do modelo vem depois do rascunho.
  for (let i = blocos.length - 1; i >= 0; i--) {
    try {
      JSON.parse(blocos[i])
      return blocos[i]
    } catch {
      // Candidato inválido não interrompe a varredura — é justamente o
      // rascunho do começo que a gente quer pular.
    }
  }
  return null
}
