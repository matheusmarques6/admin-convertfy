/**
 * Handlebars-lite renderer para prompts de imagem (story AE-11).
 *
 * Suporta 3 primitivas:
 *
 *   1. Substituicao simples
 *      `{{NICHO}}`  ->  "moda feminina"
 *      `{{VAR}}` indefinida resolve para string vazia (nunca "undefined").
 *
 *   2. Switch / case
 *      ```
 *      {{#case flow_type}}
 *        {{#when "welcome"}}texto A{{/when}}
 *        {{#when "abandoned_cart"}}texto B{{/when}}
 *      {{/case}}
 *      ```
 *      A comparacao e feita como string. `{{#when 1}}` casa tanto com
 *      `1` (number) quanto `"1"` (string). Aspas duplas/simples no rotulo
 *      sao opcionais (`{{#when welcome}}` == `{{#when "welcome"}}`).
 *      Valor da var nao mapeado por nenhum `{{#when}}` -> bloco vira "".
 *
 *   3. Condicional
 *      `{{#if VAR}}texto{{/if}}` -> exibe `texto` somente se VAR for truthy.
 *      "Truthy" = nao vazia / nao "0" / nao "false" / nao indefinida.
 *
 * Blocos podem aninhar: `{{#case}}` dentro de `{{#when}}`, `{{#if}}`
 * dentro de `{{#when}}` etc. Substituicao simples acontece **por ultimo**,
 * apos toda a resolucao estrutural, garantindo que vars dentro dos
 * blocos resolvidos tambem sejam substituidas.
 *
 * Por que nao Handlebars/Mustache "de verdade"?
 *   - dep zero (bundle Next ja e grande)
 *   - 2 primitivas cobrem 100% do uso atual
 *   - sintaxe identica facilita migrar depois se precisar
 *
 * @see docs/stories/AE-11.image-template-renderer-seed.md
 */

type VarValue = string | number

function normalize(v: VarValue | undefined | null): string {
  if (v === null || v === undefined) return ""
  return typeof v === "number" ? String(v) : v
}

function stripQuotes(s: string): string {
  const trimmed = s.trim()
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

/**
 * Resolve recursivamente o bloco mais interno `{{#case}}...{{/case}}`.
 * Retorna a string com todos os switches resolvidos.
 */
function resolveCaseBlocks(template: string, vars: Record<string, VarValue>): string {
  // Loop ate nao haver mais {{#case}} nao processados.
  // Regex captura o bloco mais interno (sem {{#case}} aninhado dentro).
  // Usa [\s\S] para casar quebras de linha.
  const innerCaseRe =
    /\{\{#case\s+([^\s}]+)\s*\}\}((?:(?!\{\{#case\b)[\s\S])*?)\{\{\/case\}\}/

  let out = template
  let safety = 0
  while (innerCaseRe.test(out)) {
    if (++safety > 1000) {
      throw new Error("renderImageTemplate: too many nested {{#case}} blocks")
    }
    out = out.replace(innerCaseRe, (_match, varName: string, body: string) => {
      const target = normalize(vars[varName.trim()])
      // Resolve cada {{#when X}}...{{/when}} dentro de body.
      // Encontra o primeiro cujo rotulo casa com target. Se nenhum, vazio.
      const whenRe = /\{\{#when\s+([^}]+?)\s*\}\}([\s\S]*?)\{\{\/when\}\}/g
      let match: RegExpExecArray | null
      while ((match = whenRe.exec(body)) !== null) {
        const label = stripQuotes(match[1])
        if (label === target) {
          return match[2]
        }
      }
      return ""
    })
  }
  return out
}

/**
 * Resolve `{{#if VAR}}...{{/if}}`. Loop ate nao haver mais.
 * O regex captura o bloco mais interno (sem `{{#if}}` aninhado).
 */
function resolveIfBlocks(template: string, vars: Record<string, VarValue>): string {
  const innerIfRe =
    /\{\{#if\s+([^\s}]+)\s*\}\}((?:(?!\{\{#if\b)[\s\S])*?)\{\{\/if\}\}/

  let out = template
  let safety = 0
  while (innerIfRe.test(out)) {
    if (++safety > 1000) {
      throw new Error("renderImageTemplate: too many nested {{#if}} blocks")
    }
    out = out.replace(innerIfRe, (_match, varName: string, body: string) => {
      const raw = normalize(vars[varName.trim()])
      const truthy = raw !== "" && raw !== "0" && raw.toLowerCase() !== "false"
      return truthy ? body : ""
    })
  }
  return out
}

/**
 * Substitui `{{VAR}}` pelo valor (ou string vazia se indefinida).
 * Roda por ultimo, sobre o template ja estruturalmente resolvido.
 * Ignora qualquer tag que comece com `#` ou `/` (defensiva — tudo
 * estrutural ja foi consumido antes).
 */
function resolveSimpleVars(template: string, vars: Record<string, VarValue>): string {
  return template.replace(/\{\{\s*([^#/\s}][^}]*?)\s*\}\}/g, (_m, name: string) => {
    return normalize(vars[name.trim()])
  })
}

/**
 * Renderiza um template handlebars-lite com as vars dadas.
 *
 * Ordem de resolucao:
 *   1. `{{#case}}...{{/case}}` (innermost first, loop ate zero)
 *   2. `{{#if}}...{{/if}}` (innermost first, loop ate zero)
 *   3. `{{VAR}}` substituicao simples
 *
 * @throws Error se houver mais de 1000 niveis de aninhamento (safety).
 */
export function renderImageTemplate(
  template: string,
  vars: Record<string, VarValue>,
): string {
  return resolveSimpleVars(resolveBlockHelpers(template, vars), vars)
}

/**
 * Só os passos ESTRUTURAIS (`{{#case}}` e `{{#if}}`), sem substituir as vars.
 *
 * Existe para a segmentação por proveniência
 * (`shared/prompt-provenance.ts`): o cortador sabe cortar `{{var}}`, mas não
 * sabe executar condicional. Pré-resolvendo os blocos com a MESMA função que
 * o render usa, o template vira plano e o corte volta a ser exato — o trecho
 * que sobreviveu ao condicional é template, e é assim que ele é marcado.
 *
 * A ordem aqui é a do render (case → if) porque é dela que o resultado
 * depende; qualquer divergência apareceria no guard de recomposição do call
 * site, que compara o prompt segmentado com o enviado.
 */
export function resolveBlockHelpers(
  template: string,
  vars: Record<string, VarValue>,
): string {
  return resolveIfBlocks(resolveCaseBlocks(template, vars), vars)
}
