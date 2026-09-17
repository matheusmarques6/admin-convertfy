/**
 * Quem pode escrever numa sessão de formulário, do ponto de vista do
 * domínio que fez a chamada.
 *
 * O formulário é público por natureza — qualquer um abre a página e
 * responde. O que esta guarda impede é outra coisa: um site terceiro
 * embutir o nosso endpoint e usar a sessão para gravar lixo no CRM, ou
 * um script raspar a estrutura das perguntas de dentro de outra página.
 *
 * ## Lista vazia PERMITE, e isso é decisão, não esquecimento
 *
 * Formulário existe para ser embutido — em landing page, em Webflow, no
 * site do cliente. Nascer fechado quebraria o embed no dia do deploy e
 * o sintoma seria "o formulário parou de enviar" numa página que
 * ninguém lembra que existe. A lista é **opt-in por formulário**
 * (`crm_forms.settings.allowed_domains`): enquanto vazia, tudo passa e
 * a origem fica REGISTRADA na sessão; preenchida, só ela passa.
 *
 * ## Comparação por HOST, nunca por prefixo de string
 *
 * `origin.startsWith("https://convertfy.me")` aceita
 * `https://convertfy.me.atacante.com`. A comparação é do hostname
 * inteiro, e um curinga só vale como `*.dominio.com` — que casa
 * subdomínio, nunca o domínio irmão.
 */

export interface VeredictoDeOrigem {
  permitida: boolean
  /** O host que decidiu, para registrar na sessão. `null` = sem cabeçalho. */
  host: string | null
  /** Por que recusou, em texto de log. */
  motivo?: "fora_da_lista" | "sem_origem"
}

/** Extrai o hostname de uma URL. `null` quando não é URL utilizável. */
export function hostDe(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    return new URL(url).hostname.toLowerCase() || null
  } catch {
    return null
  }
}

/**
 * Normaliza uma entrada da lista: aceita `dominio.com`,
 * `https://dominio.com/x` e `*.dominio.com`.
 */
export function normalizarPermitido(entrada: string): string {
  const s = entrada.trim().toLowerCase()
  if (!s) return ""
  if (s.startsWith("*.")) return s
  return hostDe(s.includes("://") ? s : `https://${s}`) ?? s.replace(/\/.*$/, "")
}

function casa(host: string, permitido: string): boolean {
  if (!permitido) return false
  if (permitido.startsWith("*.")) {
    const base = permitido.slice(2)
    // `*.loja.com` casa `a.loja.com` e `loja.com`, nunca `xloja.com`.
    return host === base || host.endsWith(`.${base}`)
  }
  return host === permitido
}

/**
 * Decide se a chamada pode escrever.
 *
 * `Origin` vence `Referer`: o browser manda `Origin` em toda requisição
 * de escrita cross-site e ele não carrega o caminho da página, que pode
 * conter dado de quem preenche. O `Referer` é o fallback para o caso do
 * navegador que omite `Origin` em same-origin.
 */
export function origemPermitida(
  origin: string | null | undefined,
  referer: string | null | undefined,
  permitidos: string[] | null | undefined,
): VeredictoDeOrigem {
  const host = hostDe(origin) ?? hostDe(referer)
  const lista = (permitidos ?? []).map(normalizarPermitido).filter(Boolean)

  if (lista.length === 0) return { permitida: true, host }

  // Com lista configurada, chamada sem origem NÃO passa: é o `curl` que
  // a lista existe para barrar. Sem lista, ela passaria — e passa.
  if (!host) return { permitida: false, host: null, motivo: "sem_origem" }

  return lista.some((p) => casa(host, p))
    ? { permitida: true, host }
    : { permitida: false, host, motivo: "fora_da_lista" }
}
