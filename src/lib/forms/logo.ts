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
