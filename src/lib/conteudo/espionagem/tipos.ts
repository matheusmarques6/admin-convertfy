/**
 * O payload da espionagem.
 *
 * Mora aqui, e não no serviço, porque a TELA também o importa: tipo que
 * vive no serviço arrasta o cliente do Supabase para o bundle do cliente na
 * primeira vez que alguém esquecer o `import type`.
 */

import type { AnaliseDoRival, Comparacao } from "./analise"

export interface EspionagemResultado {
  analise: AnaliseDoRival
  /** Comparação com o NOSSO perfil, na mesma fórmula parcial. */
  comparacao: Comparacao | null
  /** Nossa taxa parcial, exibida ao lado para a conta ficar conferível. */
  taxaNossaParcial: number | null
  /** Quando esta varredura foi feita (ISO). */
  varridoEm: string
  /** True quando veio do cache em vez de custar uma chamada. */
  doCache: boolean
}
