/**
 * O domínio PRÓPRIO dos formulários (ex.: `forms.convertfy.me`).
 *
 * O formulário público rodava em `app.convertfy.me/forms/<slug>` — o
 * mesmo host do admin. Todo lead, todo anúncio e todo embed em site de
 * cliente apontava para o endereço do painel interno: a URL entrega que
 * existe um `/admin` ao lado, o cookie de sessão do time viaja para a
 * página pública, e uma falha de cabeçalho num lado vaza para o outro.
 *
 * No host de formulários a superfície é FECHADA: só o que está em
 * `PREFIXOS_SERVIDOS` responde; o resto é 404 antes de qualquer rota
 * rodar — nem login, nem admin, nem API interna existem ali. Módulo puro:
 * quem decide é este arquivo, quem executa é o middleware, e o teste cobre
 * a régua sem subir servidor.
 *
 * ## Quem é o host de formulários — duas fontes, e a ordem importa
 *
 * 1. `NEXT_PUBLIC_FORMS_ORIGIN`, quando existe. É `NEXT_PUBLIC_`, então só
 *    entra no bundle num deploy feito DEPOIS de a variável existir.
 * 2. **Convenção**: o host cujo primeiro rótulo é `forms` (`forms.<apex>`).
 *
 * A segunda existe por um incidente real (19/09): o domínio foi conectado
 * na Vercel, a variável não tinha entrado no deploy, e `forms.convertfy.me`
 * servia `/admin` e `/login` — o oposto do que o domínio existe para fazer.
 * Uma régua que depende de uma variável chegar ao bundle falha justamente
 * no dia em que o domínio é ligado. A convenção fecha o host no instante
 * em que a Vercel começa a roteá-lo, sem deploy novo. A variável continua
 * valendo para PINAR o host quando ele não segue a convenção, e `off`
 * desliga as duas (convenção incluída).
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

/** Valores da variável que DESLIGAM o domínio próprio, convenção incluída. */
const DESLIGADO = new Set(["off", "false", "0", "none", "-"])

/** Rótulos do host do admin que a convenção troca por `forms`. */
const ROTULOS_DO_ADMIN = new Set(["app", "admin", "www", "painel"])

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

/** A variável pediu para NÃO haver domínio próprio (nem por convenção). */
export function dominioDesligado(env: string | undefined = process.env.NEXT_PUBLIC_FORMS_ORIGIN): boolean {
  return DESLIGADO.has((env ?? "").trim().toLowerCase())
}

/** `https://forms.convertfy.me` ou `null` quando a variável não pina um host. */
export function origemDosFormularios(
  env: string | undefined = process.env.NEXT_PUBLIC_FORMS_ORIGIN,
): string | null {
  if (dominioDesligado(env)) return null
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

/**
 * Host em que a convenção `forms.<apex>` faz sentido: um domínio de
 * verdade. `localhost`, IP e os previews `*.vercel.app` ficam fora — ali
 * não existe `forms.` ligado, e derivar um redirecionaria o formulário
 * para um host que não responde.
 */
function hostDeDominioProprio(host: string): boolean {
  if (!host || !host.includes(".")) return false
  if (host === "localhost" || host.endsWith(".localhost")) return false
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return false
  if (host.endsWith(".vercel.app")) return false
  return true
}

/** O host segue a convenção `forms.<apex>`? */
export function ehHostDeFormulariosPorConvencao(host: string | null | undefined): boolean {
  const h = hostSemPorta(host)
  return hostDeDominioProprio(h) && h.startsWith("forms.") && h.split(".").length >= 3
}

/** O host é exatamente o configurado na variável? (Sem porta, sem caixa.) */
export function ehHostDeFormularios(host: string | null | undefined, hostConfigurado: string | null): boolean {
  if (!hostConfigurado) return false
  return hostSemPorta(host) === hostConfigurado
}

/**
 * A requisição chegou pelo domínio próprio dos formulários — pela
 * variável OU pela convenção. É esta a pergunta que o middleware faz.
 */
export function chegouPeloHostDeFormularios(
  host: string | null | undefined,
  env: string | undefined = process.env.NEXT_PUBLIC_FORMS_ORIGIN,
): boolean {
  if (dominioDesligado(env)) return false
  return ehHostDeFormularios(host, hostDosFormularios(env)) || ehHostDeFormulariosPorConvencao(host)
}

/**
 * A origem dos formulários DERIVADA do host atual, pela convenção:
 * `app.convertfy.me` → `https://forms.convertfy.me`; `convertfy.me` →
 * `https://forms.convertfy.me`; `forms.convertfy.me` → ele mesmo. `null`
 * onde a convenção não vale (localhost, IP, preview da Vercel).
 */
export function origemDerivadaDoHost(
  host: string | null | undefined,
  protocolo: "https" | "http" = "https",
): string | null {
  const h = hostSemPorta(host)
  if (!hostDeDominioProprio(h)) return null
  const partes = h.split(".")
  if (partes[0] === "forms" && partes.length >= 3) return `${protocolo}://${h}`
  if (ROTULOS_DO_ADMIN.has(partes[0]) && partes.length >= 3) {
    partes[0] = "forms"
    return `${protocolo}://${partes.join(".")}`
  }
  return `${protocolo}://forms.${h}`
}

/**
 * A origem VIGENTE dos formulários vista de um host: a variável pina;
 * sem ela, a convenção deriva do host atual; `off` desliga as duas.
 * É o que monta link, QR, embed e `event_source_url` — e o alvo do 308.
 */
export function origemVigente(
  hostAtual: string | null | undefined,
  env: string | undefined = process.env.NEXT_PUBLIC_FORMS_ORIGIN,
): string | null {
  if (dominioDesligado(env)) return null
  return origemDosFormularios(env) ?? origemDerivadaDoHost(hostAtual)
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
