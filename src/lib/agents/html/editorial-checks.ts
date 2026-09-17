/**
 * Régua RETÓRICA do texto entregue — o que nenhum check media.
 *
 * Os checks de conteúdo (`content-checks.ts`) olham FATO e HIGIENE: oferta
 * sem incentivo, código inventado, placeholder, texto de exemplo, link morto,
 * parágrafo repetido. O lint (`lint-envio.ts`) olha FORMA. Nenhum dos dois,
 * em lugar nenhum, olhava se a frase está bem escrita — e é por isso que
 * "Your checkout runs on Shopify: PCI-compliant, SSL built in" saiu para um
 * homem de 50+ comprando cueca sem nada acender.
 *
 * O método já existia na casa: o motor editorial do Estúdio de carrosséis
 * (`lib/conteudo/editorial/anti-slop.ts`) tem 26 regras com severidade e
 * sugestão, e **zero imports** em `src/lib/agents`. Aqui entra o que é
 * UNIVERSAL — vale para qualquer peça escrita, não só para carrossel.
 *
 * Duas decisões:
 *
 * 1. **Bilíngue por construção, e idioma não coberto não gera achado.** O
 *    anti-slop do Estúdio é só em português; a carteira manda e-mail em 14
 *    idiomas. Cada regra é ancorada em palavras do idioma, então uma peça em
 *    polonês simplesmente não casa nada — em vez de ser reprovada por regex
 *    de português, que seria alarme falso em escala. O molde é o do
 *    `validadores/claims.ts`: os idiomas convivem numa regex só.
 * 2. **CTA cordial fica FORA.** `label_generico` (`content-checks.ts`) já
 *    reprova "Saiba mais", "Learn more" e "Clique aqui" como `high`.
 *    Duplicar produziria duas issues para o mesmo defeito, e duas contagens
 *    para a mesma coisa é como a medição deixa de servir.
 *
 * Severidade `medium` e, no começo, em shadow: estes checks não têm dono de
 * estilo declarado, e a primeira semana é medição — como foi com o QA.
 *
 * Puro.
 */

import type { QaIssue } from "@/types/email-generation"

export type RegraEditorial = "binario" | "cacoete" | "abertura" | "dado_sem_origem"

interface Regra {
  id: RegraEditorial
  /** O que o operador faz com o achado. */
  conserto: string
  re: RegExp
}

/**
 * As quatro famílias. Cada uma casa PT e EN na mesma regex — a âncora é
 * léxica, então idioma que não está aqui não produz achado.
 */
const REGRAS: Regra[] = [
  {
    id: "binario",
    conserto: "diga o que é, sem a antítese",
    re: /\b(?:n[ãa]o\s+[ée]\s+\w[\w\s]{0,20}?,\s*[ée]\s|it['’]?s\s+not\s+\w[\w\s]{0,20}?,\s*it['’]?s\s|menos\s+\w+[\w\s]{0,15},\s*mais\s+\w|less\s+\w+[\w\s]{0,15},\s*more\s+\w|deixa\s+de\s+ser\b|stops?\s+being\b)/i,
  },
  {
    id: "cacoete",
    conserto: "corte a frase inteira: ela não acrescenta fato",
    re: /\b(?:isso\s+muda\s+tudo|no\s+fim\s+das\s+contas|a\s+pergunta\s+que\s+fica|que\s+muda\s+tudo|that\s+changes\s+everything|at\s+the\s+end\s+of\s+the\s+day|the\s+bottom\s+line\s+is|here['’]?s\s+the\s+thing)\b/i,
  },
  {
    id: "abertura",
    conserto: "comece pelo fato; ninguém precisa da apresentação",
    re: /\b(?:neste\s+e-?mail|nesta\s+mensagem|hoje\s+vamos\s+falar|hoje\s+queremos\s+falar|in\s+this\s+e-?mail|today\s+we(?:['’]re|\s+are)\s+going\s+to|we\s+wanted\s+to\s+tell\s+you)\b/i,
  },
  {
    id: "dado_sem_origem",
    conserto: "nomeie a fonte ou tire o número",
    re: /\b(?:estudos\s+mostram|pesquisas\s+(?:mostram|indicam)|a\s+maioria\s+d(?:os|as)\s+\w+|especialistas\s+(?:dizem|concordam)|studies\s+show|research\s+shows|most\s+(?:customers|people|men|women)|experts\s+agree)\b/i,
  },
]

export interface AchadoEditorial {
  regra: RegraEditorial
  trecho: string
  conserto: string
}

/** Todo achado retórico de um texto. Puro, sem HTML. */
export function acharPadroesEditoriais(texto: string): AchadoEditorial[] {
  const t = (texto ?? "").trim()
  if (!t) return []
  const out: AchadoEditorial[] = []
  for (const r of REGRAS) {
    const m = t.match(r.re)
    if (m) out.push({ regra: r.id, trecho: m[0].trim(), conserto: r.conserto })
  }
  return out
}

function normaliza(s: string): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

/**
 * O assunto começa pelo código do cupom.
 *
 * `WELCOME10: Cut for Your Body` foi o assunto entregue em 17/09. O código é
 * o que a pessoa ENCONTRA dentro do e-mail, não o motivo de abrir — e quem
 * abre pela caixa de entrada lê os primeiros caracteres antes de qualquer
 * outra coisa.
 */
export function assuntoComecaPeloCodigo(assunto: string, codigo: string | null | undefined): boolean {
  const a = (assunto ?? "").trim()
  const c = (codigo ?? "").trim()
  if (!a || !c) return false
  return new RegExp(`^\\W*${c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(a)
}

/**
 * O preheader repete o assunto em vez de completá-lo.
 *
 * A caixa de entrada mostra os dois lado a lado: repetir gasta a única linha
 * que ainda podia dizer algo novo. Mede por palavras COMUNS — reescrever com
 * sinônimos continua sendo repetição de conteúdo, mas medir isso exigiria
 * julgamento; aqui fica o caso literal, que é o frequente.
 */
export function preheaderRepeteAssunto(assunto: string, preheader: string): boolean {
  const a = normaliza(assunto).split(" ").filter((w) => w.length > 2)
  const p = new Set(normaliza(preheader).split(" ").filter(Boolean))
  if (a.length < 3 || p.size === 0) return false
  const comuns = a.filter((w) => p.has(w)).length
  return comuns / a.length >= 0.7
}

export interface EditorialCheckOptions {
  assunto?: string | null
  preheader?: string | null
  /** Código confirmado do cupom deste toque. */
  incentivoCodigo?: string | null
}

/**
 * Os achados retóricos como issues de QA. `fragmentos` são os textos visíveis
 * do documento — quem os extrai é `content-checks`, que já paga esse custo.
 */
export function computeEditorialChecks(
  fragmentos: readonly string[],
  opts: EditorialCheckOptions = {},
): QaIssue[] {
  const issues: QaIssue[] = []
  const achados = new Map<RegraEditorial, AchadoEditorial>()
  for (const f of fragmentos) {
    for (const a of acharPadroesEditoriais(f)) {
      if (!achados.has(a.regra)) achados.set(a.regra, a)
    }
  }
  for (const a of achados.values()) {
    issues.push({
      type: "padrao_editorial",
      severity: "medium",
      disposition: "warning",
      // A regra vai NOMEADA na mensagem: o enum é um só para não inchar, e
      // é por este prefixo que se conta quantas vezes cada uma aparece.
      message: `[${a.regra}] "${a.trecho}" — ${a.conserto}.`,
      location: "html",
    })
  }

  const assunto = (opts.assunto ?? "").trim()
  if (assunto && assuntoComecaPeloCodigo(assunto, opts.incentivoCodigo)) {
    issues.push({
      type: "assunto_comeca_pelo_codigo",
      severity: "medium",
      disposition: "warning",
      message: `O assunto começa pelo código do cupom: "${assunto.slice(0, 60)}". O código é o que a pessoa encontra dentro, não o motivo de abrir.`,
      location: "subject",
    })
  }

  const preheader = (opts.preheader ?? "").trim()
  if (assunto && preheader && preheaderRepeteAssunto(assunto, preheader)) {
    issues.push({
      type: "preheader_repete_o_assunto",
      severity: "medium",
      disposition: "warning",
      message: `O preheader repete o assunto em vez de completá-lo: "${preheader.slice(0, 60)}". Na caixa de entrada os dois aparecem juntos.`,
      location: "preheader",
    })
  }

  return issues
}
