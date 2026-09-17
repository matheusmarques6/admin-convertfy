/**
 * Todo renderizador de formulário público dispara os pixels — e pelo
 * módulo compartilhado.
 *
 * O conversacional nasceu sem NENHUM: sem `PageView`, sem o `Lead`
 * deduplicado por `event_id` e sem o `_fbc` derivado do `fbclid` do
 * anúncio. Nada falhava em tela (a CAPI continuava saindo do servidor),
 * e o prejuízo era invisível: a Meta não via a visita, a redundância
 * pixel+CAPI que este repositório mantém de propósito sumia, e o clique
 * pago perdia a chave determinística de correspondência. Foi descoberto
 * lendo o código, não por erro nenhum — exatamente o tipo de buraco de
 * FRONTEIRA que um teste de string pega e um teste de unidade não.
 *
 * A régua é de ARQUIVO porque o defeito é a AUSÊNCIA de uma chamada: não
 * há função a exercitar num renderizador que não dispara nada.
 */
import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const DIR = join(process.cwd(), "src", "components", "forms")

/** Os renderizadores públicos: o que a pessoa que veio do anúncio vê. */
const RENDERIZADORES = ["public-form-view.tsx", "conversational-form-view.tsx"]

/**
 * O código SEM comentário.
 *
 * Sem isto a régua é cega para o defeito que ela existe para pegar:
 * comentar a chamada (`// useFormPixels(...)`) desliga o pixel e o
 * `toContain` continua passando — foi o que aconteceu ao testar esta
 * própria régua. Trunca a linha num `//` dentro de string (uma URL);
 * aqui isso só descarta o resto da linha, nunca cria um falso positivo.
 */
function semComentarios(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ")
}

const ler = (arq: string) => semComentarios(readFileSync(join(DIR, arq), "utf8"))

describe("pixels dos formulários públicos", () => {
  it.each(RENDERIZADORES)("%s carrega o pixel e dispara a conversão", (arq) => {
    const src = ler(arq)
    expect(src, "sem `useFormPixels` não há PageView: a Meta não vê a visita").toContain(
      "useFormPixels(",
    )
    expect(src, "sem `fireConversionPixels` o navegador não confirma a conversão").toContain(
      "fireConversionPixels(",
    )
    expect(src).toMatch(/from "\.\/form-pixels"/)
  })

  it.each(RENDERIZADORES)("%s manda `_fbc`/`_fbp` no submit", (arq) => {
    const src = ler(arq)
    // É o que dá à CAPI a correspondência do clique pago. Sem isso o
    // evento chega ao Gerenciador com qualidade baixa e sem atribuição.
    expect(src).toContain("matchingDoBrowser(")
    expect(src).toMatch(/\bfbc\b/)
    expect(src).toMatch(/\bfbp\b/)
  })

  it("nenhum renderizador dispara por fora do módulo compartilhado", () => {
    // Dois disparos divergem no primeiro ajuste — foi assim que um dos
    // dois ficou sem pixel por uma versão inteira.
    for (const arq of RENDERIZADORES) {
      const src = ler(arq)
      for (const direto of ["loadMetaPixel(", "fireMetaEvent(", "setMetaUserData(", "loadGtag("]) {
        expect(src, `${arq} chama ${direto} direto em vez de usar ./form-pixels`).not.toContain(
          direto,
        )
      }
    }
  })

  it("a lista de renderizadores não fica para trás", () => {
    // Renderizador novo sem pixel é o defeito voltando pela terceira
    // porta; que ele ao menos apareça aqui.
    const vistos = readdirSync(DIR).filter((f) => /-form-view\.tsx$/.test(f))
    expect(vistos.sort()).toEqual([...RENDERIZADORES].sort())
  })
})
