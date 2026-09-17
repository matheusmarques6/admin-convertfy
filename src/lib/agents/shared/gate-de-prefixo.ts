/**
 * Gate de prefixo (14/09): quatro chamadas com o MESMO prefixo cacheável
 * disparadas no mesmo instante escrevem o cache quatro vezes (a 125% do
 * preço de entrada) em vez de 1 escrita + 3 leituras (a 10%). É o que a
 * fila faz com os 4 e-mails de uma loja (`ARCHITECT_BATCH = 4`,
 * `Promise.all`) — e o Curador de cada e-mail começa quando o Estruturador
 * dele termina, com minutos de variância, então escalonar a FILA não
 * garantiria nada ali.
 *
 * A regra: o primeiro chamador de uma chave passa na hora; os demais com a
 * mesma chave esperam até o primeiro RESOLVER ou até `esperaMs` depois de
 * ele ter começado — o que vier antes. A entrada de cache fica legível
 * assim que o prompt é processado (segundos para 60–100k tokens), muito
 * antes de a resposta chegar, então a espera é curta.
 *
 * Vive no processo: a fila roda o lote inteiro numa invocação só, que é o
 * caso que importa. Processos diferentes não se veem — e não precisam: a
 * fila processa uma loja por tick. Puro (zero I/O); o relógio é injetável.
 */

interface Entrada {
  inicio: number
  terminou: Promise<void>
  terminar: () => void
}

export interface GateDePrefixoOpts {
  /** Espera máxima dos seguidores desde o INÍCIO do primeiro. 0 desliga. */
  esperaMs: number
  agora?: () => number
  dormir?: (ms: number) => Promise<void>
}

export class GateDePrefixo {
  private readonly entradas = new Map<string, Entrada>()
  private readonly opts: Required<GateDePrefixoOpts>

  constructor(opts: GateDePrefixoOpts) {
    this.opts = {
      esperaMs: opts.esperaMs,
      agora: opts.agora ?? (() => Date.now()),
      dormir: opts.dormir ?? ((ms) => new Promise((r) => setTimeout(r, ms))),
    }
  }

  /**
   * Entra na chave. Devolve `{ primeiro, sair }`: `primeiro` diz se este
   * chamador é quem escreve o cache; `sair()` é OBRIGATÓRIO (num `finally`)
   * para soltar quem espera — erro do primeiro solta os seguidores igual.
   */
  async entrar(chave: string): Promise<{ primeiro: boolean; esperouMs: number; sair: () => void }> {
    if (this.opts.esperaMs <= 0) return { primeiro: true, esperouMs: 0, sair: () => {} }
    const existente = this.entradas.get(chave)
    if (!existente) {
      let terminar = () => {}
      const terminou = new Promise<void>((r) => {
        terminar = r
      })
      const entrada: Entrada = { inicio: this.opts.agora(), terminou, terminar }
      this.entradas.set(chave, entrada)
      return {
        primeiro: true,
        esperouMs: 0,
        sair: () => {
          entrada.terminar()
          if (this.entradas.get(chave) === entrada) this.entradas.delete(chave)
        },
      }
    }
    const t0 = this.opts.agora()
    const restante = Math.max(0, existente.inicio + this.opts.esperaMs - t0)
    if (restante > 0) {
      await Promise.race([existente.terminou, this.opts.dormir(restante)])
    }
    return { primeiro: false, esperouMs: this.opts.agora() - t0, sair: () => {} }
  }

  /** Quantas chaves estão em voo (telemetria/teste). */
  get emVoo(): number {
    return this.entradas.size
  }
}

/** Env `CACHE_STAGGER_MS` (default 15 s; 0 desliga). */
export function esperaDoGatePorEnv(env: Record<string, string | undefined> = process.env): number {
  const v = Number(env.CACHE_STAGGER_MS)
  return Number.isFinite(v) && v >= 0 ? v : 15_000
}
