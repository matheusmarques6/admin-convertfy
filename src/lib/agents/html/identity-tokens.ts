/**
 * Tokens de identidade (Trilha B5, set/2026).
 *
 * Uma anatomia da biblioteca escrita com `{{COR_PRINCIPAL}}`,
 * `{{FONTE_TITULO}}`… em vez de hex e família fixos serve a QUALQUER loja
 * sem passar pelo agente de cor: os valores da loja entram por código, no
 * encaixe do fragmento (`fitFragment`), antes de o documento existir. É o
 * contrário do fluxo de hoje, em que a cor é reescrita a cada peça por um
 * agente que decide por valor (`recolor` global) sobre um HTML que ele não
 * vê — e que acertou 6 de 10 cinzas na Luxe Lift em quatro gerações.
 *
 * Onze tokens, vocabulário FECHADO. Cada um tem um valor PADRÃO: um token
 * sem valor da loja nunca fica cru no HTML (`{{COR_FUNDO}}` dentro de um
 * `style` viraria `background-color:;` depois do strip de placeholders), e
 * a ausência é REPORTADA em `sem_valor` em vez de escondida.
 *
 * Puro (zero I/O). Quem carrega a identidade e deriva os papéis é
 * `apply-identity-tokens.ts`.
 */

import type { ColorRoles } from "./color-roles"
import { pesoNumerico, pilhaDeFonte } from "./font-fallback"

export const TOKENS_DE_IDENTIDADE = [
  "COR_PRINCIPAL",
  "COR_FUNDO",
  "COR_TEXTO",
  "COR_TEXTO_SOBRE_PRINCIPAL",
  "COR_DESTAQUE",
  "COR_SUPERFICIE",
  "RAIO_BOTAO",
  "FONTE_TITULO",
  "FONTE_CORPO",
  "PESO_TITULO",
  "PESO_CORPO",
] as const

export type TokenDeIdentidade = (typeof TOKENS_DE_IDENTIDADE)[number]

export type ValoresDeTokens = Record<TokenDeIdentidade, string>

/** Como cada token é escrito no HTML. Espaço interno tolerado. */
export const TOKEN_RE = new RegExp(`\\{\\{\\s*(${TOKENS_DE_IDENTIDADE.join("|")})\\s*\\}\\}`, "g")

/** O que cada token significa — para o prompt do gerador (B4) e a tela. */
export const DESCRICAO_DO_TOKEN: Record<TokenDeIdentidade, string> = {
  COR_PRINCIPAL: "cor de marca: fundo de botão preenchido e títulos de destaque",
  COR_FUNDO: "canvas do e-mail (fundo do container)",
  COR_TEXTO: "cor do texto corrido sobre o fundo",
  COR_TEXTO_SOBRE_PRINCIPAL: "cor do texto em cima da cor principal (label do botão)",
  COR_DESTAQUE: "acento pontual: filete, ícone, palavra em destaque",
  COR_SUPERFICIE: "fundo de painel/faixa que se separa do canvas",
  RAIO_BOTAO: "border-radius dos botões, em px (ex.: 6px)",
  FONTE_TITULO: "font-family de título, já com a pilha de fallback",
  FONTE_CORPO: "font-family de corpo, já com a pilha de fallback",
  PESO_TITULO: "font-weight numérico do título (ex.: 700)",
  PESO_CORPO: "font-weight numérico do corpo (ex.: 400)",
}

/**
 * Valores neutros — a mesma paleta que `deriveColorRoles` devolve para uma
 * loja sem cor cadastrada, e a sans padrão de e-mail. Só entram quando o
 * chamador não tem o valor; nunca substituem a loja.
 */
export const VALOR_PADRAO: ValoresDeTokens = {
  COR_PRINCIPAL: "#1F1F1F",
  COR_FUNDO: "#FFFFFF",
  COR_TEXTO: "#1F1F1F",
  COR_TEXTO_SOBRE_PRINCIPAL: "#FFFFFF",
  COR_DESTAQUE: "#5A5A5A",
  COR_SUPERFICIE: "#F2F2F2",
  RAIO_BOTAO: "6px",
  FONTE_TITULO: "Arial,Helvetica,sans-serif",
  FONTE_CORPO: "Arial,Helvetica,sans-serif",
  PESO_TITULO: "700",
  PESO_CORPO: "400",
}

export interface EntradaDeTokens {
  /** Papéis já derivados da paleta (`deriveColorRoles`). */
  roles: ColorRoles
  fontHeading?: string | null
  fontBody?: string | null
  fontHeadingWeight?: string | null
  fontBodyWeight?: string | null
  /**
   * Raio dos botões em px. Vem da hero da peça quando ela declara
   * (`raioDoBotao`); ausente → 6px, assunção declarada em VALOR_PADRAO.
   */
  raioBotaoPx?: number | null
}

/**
 * Papéis da loja → os 11 valores.
 *
 * `COR_PRINCIPAL` é o `button_bg` (não o `heading`): o papel "principal" da
 * paleta é o que pinta o botão, e o `heading` cai para o texto quando a
 * principal não contrasta com o fundo — o token de título fica com a cor de
 * texto por herança, que é o comportamento certo.
 */
export function resolverTokens(e: EntradaDeTokens): ValoresDeTokens {
  const r = e.roles
  const fonte = (nome: string | null | undefined, padrao: string) => {
    const pilha = pilhaDeFonte(nome ?? "")
    return pilha || padrao
  }
  const raio =
    typeof e.raioBotaoPx === "number" && Number.isFinite(e.raioBotaoPx) && e.raioBotaoPx >= 0
      ? `${Math.round(e.raioBotaoPx)}px`
      : VALOR_PADRAO.RAIO_BOTAO
  return {
    COR_PRINCIPAL: r.button_bg || VALOR_PADRAO.COR_PRINCIPAL,
    COR_FUNDO: r.bg || VALOR_PADRAO.COR_FUNDO,
    COR_TEXTO: r.text || VALOR_PADRAO.COR_TEXTO,
    COR_TEXTO_SOBRE_PRINCIPAL: r.button_text || VALOR_PADRAO.COR_TEXTO_SOBRE_PRINCIPAL,
    COR_DESTAQUE: r.accent || VALOR_PADRAO.COR_DESTAQUE,
    COR_SUPERFICIE: r.surface || VALOR_PADRAO.COR_SUPERFICIE,
    RAIO_BOTAO: raio,
    FONTE_TITULO: fonte(e.fontHeading ?? e.fontBody, VALOR_PADRAO.FONTE_TITULO),
    FONTE_CORPO: fonte(e.fontBody ?? e.fontHeading, VALOR_PADRAO.FONTE_CORPO),
    PESO_TITULO: pesoNumerico(e.fontHeadingWeight) ?? VALOR_PADRAO.PESO_TITULO,
    PESO_CORPO: pesoNumerico(e.fontBodyWeight) ?? VALOR_PADRAO.PESO_CORPO,
  }
}

export interface AplicacaoDeTokens {
  html: string
  /** Quantas ocorrências de cada token foram resolvidas. */
  aplicados: Partial<Record<TokenDeIdentidade, number>>
  /** Soma de `aplicados`. */
  total: number
  /**
   * Tokens que o HTML pedia e o chamador NÃO tinha — resolvidos pelo
   * VALOR_PADRAO. Zero quando o chamador passou `resolverTokens(...)`
   * inteiro; existe para o caso do chamador parcial.
   */
  sem_valor: TokenDeIdentidade[]
}

/**
 * Troca cada `{{TOKEN}}` pelo valor. Sem tokens no HTML devolve a MESMA
 * string (comparação por referência vale para "nada mudou").
 */
export function aplicarTokens(
  html: string,
  valores: Partial<ValoresDeTokens> | null | undefined,
): AplicacaoDeTokens {
  const aplicados: Partial<Record<TokenDeIdentidade, number>> = {}
  const semValor = new Set<TokenDeIdentidade>()
  let total = 0
  const out = html.replace(TOKEN_RE, (_m, nome: string) => {
    const token = nome as TokenDeIdentidade
    const v = valores?.[token]
    if (v == null || v === "") semValor.add(token)
    aplicados[token] = (aplicados[token] ?? 0) + 1
    total++
    return v == null || v === "" ? VALOR_PADRAO[token] : v
  })
  return {
    html: total === 0 ? html : out,
    aplicados,
    total,
    sem_valor: [...semValor],
  }
}

/** Tokens presentes no HTML, sem repetição, na ordem do vocabulário. */
export function tokensNoHtml(html: string): TokenDeIdentidade[] {
  const achados = new Set<string>()
  for (const m of html.matchAll(TOKEN_RE)) achados.add(m[1])
  return TOKENS_DE_IDENTIDADE.filter((t) => achados.has(t))
}

export function temTokensDeIdentidade(html: string): boolean {
  TOKEN_RE.lastIndex = 0
  const r = TOKEN_RE.test(html)
  TOKEN_RE.lastIndex = 0
  return r
}

/**
 * Raio mediano dos botões de um HTML — `border-radius` declarado em `<a>`
 * com fundo. Mediana, não média: um selo redondo (`50%`, ou 999px) num
 * canto não pode arredondar todos os botões da loja. `null` quando nenhum
 * `<a>` declara — o chamador cai no padrão e DIZ que caiu.
 */
export function raioDoBotao(html: string): number | null {
  const raios: number[] = []
  for (const m of html.matchAll(/<a\b[^>]*style\s*=\s*"([^"]*)"/gi)) {
    const style = m[1]
    if (!/background(?:-color)?\s*:/i.test(style)) continue
    const r = /border-radius\s*:\s*(\d+(?:\.\d+)?)px/i.exec(style)
    if (!r) continue
    const px = Number(r[1])
    if (Number.isFinite(px) && px < 200) raios.push(px)
  }
  if (raios.length === 0) return null
  raios.sort((a, b) => a - b)
  const meio = Math.floor(raios.length / 2)
  return raios.length % 2 ? raios[meio] : Math.round((raios[meio - 1] + raios[meio]) / 2)
}
