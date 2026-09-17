/**
 * Qual logo o formulário mostra — e em que tela.
 *
 * O formulário nasce sem `logo_url` (as três linhas em produção estão
 * NULL), e o renderizador conversacional só a desenhava nas telas de
 * abertura e de fim. Resultado: a pergunta, que é onde a pessoa passa o
 * tempo todo, não tinha marca nenhuma — uma página em branco pedindo
 * telefone. Marca ausente na hora de dar o telefone é exatamente onde
 * ela vale mais.
 *
 * Três estados, e cada um tem um jeito de ser dito:
 *
 * - **logo própria** (`logo_url` preenchida) — a do cliente, quando a
 *   peça é dele;
 * - **a da Convertfy** (o padrão, sem `logo_url`) — a marca de quem
 *   está pedindo o dado;
 * - **sem logo** (`theme.hideLogo`) — a escolha explícita de quem monta.
 *
 * O padrão é a Convertfy e não "nada" porque este admin é de UMA
 * organização e todos os formulários são dela: exigir que alguém cole a
 * URL da própria logo para o formulário ter marca é atrito que termina
 * em formulário sem marca — que foi o que aconteceu.
 *
 * A variante segue o FUNDO, não o tema do admin: a logo preta sobre o
 * `#0B0B14` do modo escuro simplesmente some, e ninguém percebe porque
 * o `<img>` carrega sem erro.
 */

export const LOGO_CONVERTFY_CLARA = "/images/logo da convertfy com escrito branco.png"
export const LOGO_CONVERTFY_ESCURA = "/images/logo da convertfy com escrito preto.png"

export interface EscolhaDeLogo {
  /** URL a desenhar, ou `null` quando não há logo nenhuma. */
  url: string | null
  /** `true` quando é a marca da casa e não a do cliente. */
  daCasa: boolean
}

export function logoDoFormulario(opts: {
  logoUrl?: string | null
  /** `theme.hideLogo` — a escolha explícita de não ter marca. */
  ocultar?: boolean | null
  /** Modo do tema do FORMULÁRIO (é o fundo atrás da imagem). */
  modo?: "light" | "dark" | string | null
}): EscolhaDeLogo {
  if (opts.ocultar) return { url: null, daCasa: false }
  const propria = (opts.logoUrl ?? "").trim()
  if (propria) return { url: propria, daCasa: false }
  return {
    url: opts.modo === "dark" ? LOGO_CONVERTFY_CLARA : LOGO_CONVERTFY_ESCURA,
    daCasa: true,
  }
}

/**
 * Altura padrão da logo, por formato.
 *
 * Os dois números são os que já estavam no código, e a diferença é
 * intencional: no conversacional a logo é uma marca pequena no alto de
 * uma página que é toda da pergunta; no clássico ela é o cabeçalho de
 * um card. Um número só deixaria a logo do conversacional grande a
 * ponto de empurrar a pergunta para fora da primeira dobra no celular.
 */
export const ALTURA_PADRAO_DA_LOGO = { conversational: 26, classic: 40 } as const

/** Piso e teto. */
export const ALTURA_MINIMA_DA_LOGO = 12
export const ALTURA_MAXIMA_DA_LOGO = 120

/**
 * Resolve a altura da logo.
 *
 * O valor é CLAMPEADO porque os dois extremos falham em silêncio: uma
 * logo de 4px é indistinguível de nenhuma logo, e uma de 400px empurra
 * a pergunta para fora da tela sem nada dizer que a causa foi um número
 * digitado no editor. Valor ilegível volta ao padrão do formato.
 */
export function alturaDaLogo(
  altura: number | null | undefined,
  formato: "classic" | "conversational",
): number {
  const padrao = ALTURA_PADRAO_DA_LOGO[formato]
  if (typeof altura !== "number" || !Number.isFinite(altura)) return padrao
  return Math.min(ALTURA_MAXIMA_DA_LOGO, Math.max(ALTURA_MINIMA_DA_LOGO, Math.round(altura)))
}
