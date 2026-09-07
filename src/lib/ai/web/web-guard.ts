/**
 * Guarda de URL para o conector Internet — PURO, testado.
 *
 * Quem escolhe a URL aqui é o MODELO, não uma pessoa. Sem esta guarda,
 * `web_abrir` é um SSRF pronto: bastaria a IA ser convencida (por uma
 * página, por um texto colado, por um resultado de busca) a abrir
 * `http://169.254.169.254/latest/meta-data/` e as credenciais do runtime
 * saem no corpo da resposta.
 *
 * Por isso a régua é uma LISTA DE PERMISSÃO estreita:
 *   - só http/https (nada de file:, gopher:, data:);
 *   - porta só 80/443 (a porta alta é como se varre a rede interna);
 *   - host que não seja localhost, IP privado, link-local, IPv6 interno
 *     nem sufixo interno de nuvem;
 *   - e a MESMA régua é aplicada de novo a cada redirecionamento — um
 *     host público pode responder 302 para 127.0.0.1, e validar só a
 *     primeira URL não protege nada.
 */

export interface UrlRecusada {
  ok: false
  motivo: string
}
export interface UrlAceita {
  ok: true
  url: URL
}
export type ChecagemUrl = UrlRecusada | UrlAceita

/** IPv4 privado, loopback, link-local (metadata da nuvem) e reservado. */
const IPV4_INTERNO =
  /^(0\.|10\.|127\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|192\.0\.0\.|198\.1[89]\.|224\.|24[0-9]\.|25[0-5]\.)/

/** Sufixos que só existem dentro de uma rede. */
const SUFIXOS_INTERNOS = [".local", ".internal", ".localdomain", ".lan", ".home.arpa"]

/** Hosts de metadata de nuvem — o alvo clássico de SSRF. */
const HOSTS_PROIBIDOS = new Set([
  "localhost",
  "metadata.google.internal",
  "metadata.goog",
  "instance-data",
])

function ehIpv6Interno(host: string): boolean {
  // O hostname de uma URL IPv6 vem entre colchetes.
  const h = host.replace(/^\[|\]$/g, "").toLowerCase()
  if (!h.includes(":")) return false
  if (h === "::1" || h === "::") return true
  // fc00::/7 (unique local), fe80::/10 (link-local)
  if (/^f[cd]/.test(h) || /^fe[89ab]/.test(h)) return true

  // IPv4 mapeado. Cuidado: o construtor de URL NORMALIZA
  // `::ffff:127.0.0.1` para a forma hexadecimal `::ffff:7f00:1`, então
  // casar só o quarteto decimal deixa passar exatamente o bypass que esta
  // função existe para impedir.
  const mapeado = /::ffff:(.+)$/.exec(h)
  if (!mapeado) return false
  const resto = mapeado[1]
  if (resto.includes(".")) return IPV4_INTERNO.test(resto)
  const grupos = resto.split(":")
  if (grupos.length !== 2) return false
  const alto = Number.parseInt(grupos[0], 16)
  const baixo = Number.parseInt(grupos[1], 16)
  if (!Number.isFinite(alto) || !Number.isFinite(baixo)) return false
  const ipv4 = `${(alto >> 8) & 0xff}.${alto & 0xff}.${(baixo >> 8) & 0xff}.${baixo & 0xff}`
  return IPV4_INTERNO.test(ipv4)
}

/**
 * Aceita a URL para leitura pública, ou explica por que recusou. A
 * mensagem vai para o modelo — precisa dizer o motivo, senão ele tenta
 * a mesma coisa de novo achando que foi falha transitória.
 */
export function checarUrlPublica(bruta: string): ChecagemUrl {
  const texto = String(bruta ?? "").trim()
  if (!texto) return { ok: false, motivo: "URL vazia." }

  let url: URL
  try {
    url = new URL(texto)
  } catch {
    // Sem esquema é o erro mais comum do modelo; tentar https é razoável.
    try {
      url = new URL(`https://${texto}`)
    } catch {
      return { ok: false, motivo: `"${texto.slice(0, 120)}" não é uma URL válida.` }
    }
  }

  const protocolo = url.protocol.toLowerCase()
  if (protocolo !== "http:" && protocolo !== "https:") {
    return { ok: false, motivo: `Protocolo ${protocolo} não é permitido — só http e https.` }
  }

  // O host é checado ANTES da porta de propósito: em `localhost:3000` as
  // duas regras recusam, mas "host interno" é o motivo verdadeiro e o que
  // ensina o modelo a não tentar variações da mesma coisa.
  const host = url.hostname.toLowerCase()
  if (!host) return { ok: false, motivo: "URL sem host." }
  if (HOSTS_PROIBIDOS.has(host)) return { ok: false, motivo: `Host interno (${host}) não é acessível.` }
  if (SUFIXOS_INTERNOS.some((s) => host === s.slice(1) || host.endsWith(s))) {
    return { ok: false, motivo: `Host interno (${host}) não é acessível.` }
  }
  if (IPV4_INTERNO.test(host)) return { ok: false, motivo: `Endereço de rede interna (${host}) não é acessível.` }
  if (ehIpv6Interno(url.hostname)) return { ok: false, motivo: `Endereço IPv6 interno (${host}) não é acessível.` }
  // Host sem ponto e que não é IP: nome de máquina de rede interna.
  if (!host.includes(".") && !/^\d+$/.test(host)) {
    return { ok: false, motivo: `"${host}" não é um domínio público.` }
  }

  if (url.port && url.port !== "80" && url.port !== "443") {
    return { ok: false, motivo: `Porta ${url.port} não é permitida — só 80 e 443.` }
  }

  return { ok: true, url }
}

/**
 * Resolve um redirecionamento contra a mesma régua. `fetch` com
 * `redirect: "manual"` devolve o Location relativo às vezes — daí a base.
 */
export function checarRedirecionamento(location: string, base: URL): ChecagemUrl {
  try {
    return checarUrlPublica(new URL(location, base).toString())
  } catch {
    return { ok: false, motivo: "Redirecionamento com destino inválido." }
  }
}
