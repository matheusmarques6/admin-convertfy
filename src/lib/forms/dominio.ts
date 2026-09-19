/**
 * O domínio PRÓPRIO dos formulários (ex.: `forms.convertfy.me`).
 *
 * O formulário público rodava em `app.convertfy.me/forms/<slug>` — o
 * mesmo host do admin. Todo lead, todo anúncio e todo embed em site de
 * cliente apontava para o endereço do painel interno: a URL entrega que
 * existe um `/admin` ao lado, o cookie de sessão do time viaja para a
 * página pública, e uma falha de cabeçalho num lado vaza para o outro.
 *
 * Com `NEXT_PUBLIC_FORMS_ORIGIN` configurado o host de formulários vira
 * uma SUPERFÍCIE FECHADA: só o que está em `PREFIXOS_SERVIDOS` responde;
 * o resto é 404 antes de qualquer rota rodar — nem login, nem admin, nem
 * API interna existem ali. Módulo puro: quem decide é este arquivo, quem
 * executa é o middleware, e o teste cobre a régua sem subir servidor.
 *
 * Duas regras que erram em silêncio se ficarem no middleware:
 *
 * 1. **Host é comparado sem porta e sem caixa.** `forms.convertfy.me:443`
 *    e `FORMS.convertfy.me` são o mesmo host; comparar a string crua
 *    deixaria o admin inteiro servido no domínio público por causa de um
 *    proxy que reescreve o cabeçalho.
 * 2. **Redireciona só PÁGINA de formulário, nunca API.** A página pública
 *    faz `fetch` relativo para `/api/public/forms/...` no host em que
 *    abriu; redirecionar a API quebraria o formulário no host antigo
 *    justamente enquanto os embeds dos clientes ainda apontam para ele.
 */

/** O que o host de formulários SERVE. Fora disto, 404. */
export const PREFIXOS_SERVIDOS = [
  "/forms/",
  "/api/public/forms/",
  /** O script de embed e o widget: são carregados de sites de terceiros. */
  "/api/script/",
  /** Assets do Next e os estáticos que o formulário desenha (logo da casa, fontes). */
  "/_next/",
  "/images/",
  "/fonts/",
  "/favicon.ico",
  "/robots.txt",
] as const

function normalizarOrigem(valor: string | undefined | null): string | null {
  const v = (valor ?? "").trim().replace(/\/+$/, "")
  if (!v) return null
  try {
    const u = new URL(v)
    if (u.protocol !== "https:" && u.protocol !== "http:") return null
    return `${u.protocol}//${u.host}`
  } catch {
    return null
  }
}

/** `https://forms.convertfy.me` ou `null` quando não há domínio próprio. */
export function origemDosFormularios(
  env: string | undefined = process.env.NEXT_PUBLIC_FORMS_ORIGIN,
): string | null {
  return normalizarOrigem(env)
}

/** Só o host (`forms.convertfy.me`), minúsculo, sem porta — é o que se compara. */
export function hostDosFormularios(env?: string): string | null {
  const origem = origemDosFormularios(env)
  if (!origem) return null
  return new URL(origem).hostname.toLowerCase()
}

function hostSemPorta(host: string | null | undefined): string {
  return (host ?? "").split(":")[0].trim().toLowerCase()
}

/** A requisição chegou pelo domínio próprio dos formulários? */
export function ehHostDeFormularios(host: string | null | undefined, hostConfigurado: string | null): boolean {
  if (!hostConfigurado) return false
  return hostSemPorta(host) === hostConfigurado
}

/** O caminho pode ser servido no host de formulários? */
export function caminhoServidoNoHostDeFormularios(pathname: string): boolean {
  return PREFIXOS_SERVIDOS.some((p) =>
    p.endsWith("/") ? pathname.startsWith(p) : pathname === p,
  )
}

/**
 * Página de formulário aberta pelo host ANTIGO (o do admin) enquanto
 * existe domínio próprio → o endereço para onde redirecionar, com a
 * query preservada. `null` = não redireciona (não é página de
 * formulário, já está no host certo, ou não há domínio configurado).
 */
export function destinoNoHostDeFormularios(args: {
  pathname: string
  search: string
  host: string | null | undefined
  origemConfigurada: string | null
}): string | null {
  const { pathname, search, host, origemConfigurada } = args
  if (!origemConfigurada) return null
  if (!pathname.startsWith("/forms/")) return null
  const alvo = new URL(origemConfigurada).hostname.toLowerCase()
  if (hostSemPorta(host) === alvo) return null
  return `${origemConfigurada}${pathname}${search ?? ""}`
}
