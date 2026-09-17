/**
 * Vault por TOQUE (14/09, passo 6): que referências e aprendizados servem
 * a UM e-mail do flow, e não ao flow inteiro.
 *
 * Até aqui o Estruturador recebia TODAS as `estruturas/{flow}/*.md` e todos
 * os aprendizados do flow — ~43k chars no welcome, e boa parte deles sobre
 * outro toque (uma referência de welcome-3 servida ao welcome-1 é convite a
 * traduzir o mecanismo errado). O dado para filtrar já existia nas
 * estruturas (`emails: [1]`, obrigatório no parser) e o vocabulário dos
 * aprendizados foi decidido no diagnóstico do vault:
 * `serve_a: [welcome-1, welcome-3]` ou `serve_a: [todos]`; ausente = global.
 *
 * Regras que os testes fixam:
 * - `emails` vazio ou ausente = global (serve a todos os toques do flow);
 * - `serve_a` ausente ou contendo `todos` = global; senão precisa conter o
 *   slug do toque (`welcome-1`);
 * - valor fora do formato (string solta, número, lista com lixo) → GLOBAL
 *   com aviso: erro de digitação no Obsidian nunca esvazia um toque;
 * - a classificação é `global | toque | fora` — a tela e a telemetria
 *   mostram as três, o prompt recebe as duas primeiras.
 *
 * Puro (zero I/O). `momentoDoEmail` NÃO serve para isto: agrupa
 * `welcome-2..4` em `welcome-meio`.
 */

export type ClasseDoToque = "global" | "toque" | "fora"

/** `welcome-1`, `carrinho-abandonado-2`… — o slug que o vault escreve. */
export function toqueSlug(flowType: string, emailNumber: number): string {
  return `${flowType}-${emailNumber}`
}

const SLUG_DE_TOQUE = /^[a-z0-9_]+(?:-[a-z0-9_]+)*-\d+$/i

export interface ClassificacaoDeToque {
  classe: ClasseDoToque
  /** Por que caiu em `global` quando o valor declarado não era legível. */
  aviso?: string
}

/**
 * Estrutura de referência: `emails` (int[]) diz os toques que ela cobre.
 */
export function classificarReferencia(
  emails: unknown,
  emailNumber: number,
): ClassificacaoDeToque {
  if (emails === null || emails === undefined) return { classe: "global" }
  if (!Array.isArray(emails)) {
    return { classe: "global", aviso: `\`emails\` não é lista (${typeof emails}) — tratada como global` }
  }
  const numeros = emails
    .map((e) => (typeof e === "number" ? e : Number.parseInt(String(e), 10)))
    .filter((n) => Number.isInteger(n) && n > 0)
  if (numeros.length === 0) return { classe: "global" }
  return { classe: numeros.includes(emailNumber) ? "toque" : "fora" }
}

/**
 * Aprendizado: `frontmatter.serve_a` (lista de slugs de toque, ou `todos`).
 */
export function classificarAprendizado(
  serveA: unknown,
  flowType: string,
  emailNumber: number,
): ClassificacaoDeToque {
  if (serveA === null || serveA === undefined || serveA === "") return { classe: "global" }
  const lista = Array.isArray(serveA) ? serveA : typeof serveA === "string" ? [serveA] : null
  if (!lista) {
    return { classe: "global", aviso: `\`serve_a\` não é lista (${typeof serveA}) — tratado como global` }
  }
  const slugs = lista.map((v) => String(v).trim().toLowerCase()).filter(Boolean)
  if (slugs.length === 0) return { classe: "global" }
  if (slugs.includes("todos")) return { classe: "global" }
  const invalidos = slugs.filter((s) => !SLUG_DE_TOQUE.test(s))
  if (invalidos.length > 0) {
    return {
      classe: "global",
      aviso: `\`serve_a\` com valor fora do formato flow-N (${invalidos.join(", ")}) — tratado como global`,
    }
  }
  return { classe: slugs.includes(toqueSlug(flowType, emailNumber).toLowerCase()) ? "toque" : "fora" }
}

export interface ItemClassificado<T> {
  item: T
  classe: ClasseDoToque
  aviso?: string
}

export interface FiltroPorToque<R, A> {
  referencias: { globais: R[]; doToque: R[]; fora: R[]; avisos: string[] }
  aprendizados: { globais: A[]; doToque: A[]; fora: A[]; avisos: string[] }
  /**
   * Fail-open: nenhuma referência sobrou (global + toque) → o Estruturador
   * ficaria sem material e seria PULADO. Serve todas e marca.
   */
  failOpen: boolean
}

/**
 * Aplica a classificação a listas inteiras. `ligado: false` (kill-switch
 * `VAULT_POR_TOQUE=off`) devolve tudo como global.
 */
export function filtrarPorToque<
  R extends { slug: string; emails?: unknown },
  A extends { slug: string; serve_a?: unknown },
>(p: { referencias: R[]; aprendizados: A[]; flowType: string; emailNumber: number; ligado?: boolean }): FiltroPorToque<R, A> {
  const ligado = p.ligado ?? true
  const refs = { globais: [] as R[], doToque: [] as R[], fora: [] as R[], avisos: [] as string[] }
  const aprs = { globais: [] as A[], doToque: [] as A[], fora: [] as A[], avisos: [] as string[] }
  for (const r of p.referencias) {
    const c = ligado ? classificarReferencia(r.emails, p.emailNumber) : { classe: "global" as const }
    if (c.aviso) refs.avisos.push(`${r.slug}: ${c.aviso}`)
    refs[c.classe === "global" ? "globais" : c.classe === "toque" ? "doToque" : "fora"].push(r)
  }
  for (const a of p.aprendizados) {
    const c = ligado ? classificarAprendizado(a.serve_a, p.flowType, p.emailNumber) : { classe: "global" as const }
    if (c.aviso) aprs.avisos.push(`${a.slug}: ${c.aviso}`)
    aprs[c.classe === "global" ? "globais" : c.classe === "toque" ? "doToque" : "fora"].push(a)
  }
  const failOpen = ligado && p.referencias.length > 0 && refs.globais.length + refs.doToque.length === 0
  if (failOpen) {
    return {
      referencias: { globais: [...p.referencias], doToque: [], fora: [], avisos: refs.avisos },
      aprendizados: aprs,
      failOpen: true,
    }
  }
  return { referencias: refs, aprendizados: aprs, failOpen: false }
}

/** Kill-switch por env: `VAULT_POR_TOQUE=off` desliga o filtro. */
export function vaultPorToqueLigado(env: Record<string, string | undefined> = process.env): boolean {
  return (env.VAULT_POR_TOQUE ?? "on").trim().toLowerCase() !== "off"
}
