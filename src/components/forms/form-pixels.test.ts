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

/**
 * O passo e o lead parcial — o que o formulário longo mede no caminho.
 *
 * Um funil de 21 telas perde metade de quem começa. Sem o `FormStep` a
 * Meta não sabe quem parou onde, e sem o `Lead` na captura do contato
 * ela só vê a conversão de quem termina — a campanha passa a otimizar
 * para "terminar o questionário" em vez de "deixar contato".
 */
describe("passo e lead parcial no conversacional", () => {
  const src = ler("conversational-form-view.tsx")

  it("dispara `FormStep` a cada tela nova", () => {
    expect(src).toContain("fireFormStep(")
    // Uma vez por tela: voltar e avançar de novo não é passo novo, e
    // contá-lo infla o público de "chegou até a tela 9" com quem só
    // corrigiu a resposta anterior.
    expect(src, "sem o Set, voltar e avançar dispara de novo").toMatch(
      /passosDisparados[\s\S]{0,400}fireFormStep\(/,
    )
  })

  it("dispara o `Lead` parcial com o id da SESSÃO", () => {
    expect(src).toContain("contatoCapturado(")
    expect(src).toMatch(/fireLeadParcial\(\s*form\.tracking,\s*sessao\.sessionId\s*\)/)
    // Marcar como disparado ANTES de o id existir faria o evento nunca
    // sair — o id chega assíncrono, e é ele que impede o parcial e o
    // completo virarem duas conversões.
    expect(src).toMatch(/if \(!sessao\.sessionId\) return[\s\S]{0,200}parcialDisparado\.current = true/)
  })

  it("o submit reusa o id da sessão como `event_id` do Lead", () => {
    const rota = semComentarios(
      readFileSync(
        join(process.cwd(), "src", "app", "api", "public", "forms", "[slug]", "submit", "route.ts"),
        "utf8",
      ),
    )
    // Com ids diferentes, o parcial e o completo do MESMO cadastro
    // viram duas conversões: a dedupe da Meta é por (evento, event_id).
    expect(rota).toMatch(/eventId = sessaoAutenticada && parsed\.session_id \? parsed\.session_id :/)
    // Só o id autenticado: ele viaja pelo browser, e aceitar qualquer um
    // deixaria alguém colar a conversão de um cadastro em cima da de outro.
    expect(rota).toContain("sessaoAutenticada = tk.valido && tk.sessionId === parsed.session_id")
  })
})
