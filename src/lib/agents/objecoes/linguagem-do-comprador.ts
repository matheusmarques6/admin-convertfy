/**
 * Régua de LINGUAGEM DO COMPRADOR — o fato entra, o fornecedor não.
 *
 * Por que existe (Hero Boxers · Welcome 1, batch `6c746be0`, 17/09): o bloco
 * de remoção de risco saiu dizendo *"Your checkout runs on Shopify:
 * PCI-compliant, SSL built in"* para um homem de 50+ comprando cueca. Ele não
 * sabe o que é Shopify nem o que é PCI, e a dúvida que ele tem naquele
 * segundo é outra.
 *
 * O jargão não apareceu por acaso: ele é ENSINADO. A regra 13 do
 * `seletor-prompt` usava `"checkout Shopify (pesquisa: plataforma)"` como
 * exemplo canônico de insumo permitido; o Seletor a copiou quase literal para
 * `insumos_permitidos`, o `alerta_de_lastro` mandou a remoção de risco
 * apoiar-se nela, e o redator escreveu o que recebeu.
 *
 * Duas decisões que o módulo carrega:
 *
 * 1. **Traduzir, nunca só apagar.** Tirar o único fato de segurança da lista
 *    deixaria `remocao_de_risco` sem insumo, e bloco que some em silêncio faz
 *    o modelo caçar o que não recebeu — é a lição do `momento` e do `exige`.
 *    O nome do fornecedor sai; o fato que ele sustenta fica.
 * 2. **A origem entre parênteses é preservada.** `seletor-regras` descarta
 *    insumo sem origem declarada (`/\(.+\)/`), então uma tradução que comesse
 *    o parêntese derrubaria o insumo em vez de consertá-lo.
 *
 * LIMITE DECLARADO: não há escape para loja cujo PRODUTO é a plataforma
 * (agência, app de Shopify). Por isso a tradução só é destrutiva sobre
 * `insumos_permitidos` — insumo é fato de lastro, e "a loja roda em X" nunca é
 * argumento de compra para consumidor final. No HTML final (`lint-envio`) o
 * jargão é apenas AVISO.
 *
 * Puro. No molde de `shared/validadores/claims.ts`: os idiomas convivem numa
 * regex só e a âncora decide.
 */

export type FamiliaDeJargao = "plataforma" | "seguranca" | "infra"

/**
 * Nome de plataforma de e-commerce. Quem compra não sabe nem precisa saber
 * onde a loja é hospedada.
 */
const PLATAFORMA_RE =
  /\b(?:shopify|woocommerce|wordpress|magento|vtex|nuvemshop|nuvem\s?shop|bigcommerce|squarespace|prestashop|opencart|shopware|salesforce\s+commerce|loja\s+integrada|tray\s?commerce)\b/gi

/**
 * Infraestrutura de segurança. Aqui existe FATO por baixo do jargão — o
 * pagamento é protegido — e é esse fato que sobrevive à tradução.
 *
 * `https` ficou de FORA de propósito: ele casaria toda URL servida como
 * insumo (o link do produto é um deles) e transformaria "Product URL
 * https://..." em "pagamento protegido no checkout". Dizer "https" como
 * argumento de confiança é raro; comer o link do produto seria caro.
 */
const SEGURANCA_RE =
  /\b(?:pci(?:[-\s]?dss)?|ssl|tls|3d\s?secure|certificado\s+(?:ssl|de\s+seguran[cç]a|digital)|(?:ssl|security|digital)\s+certificate|criptografi\w*|encrypt(?:ed|ion)|bezpieczn\w*|krypt\w*)\b/gi

/**
 * Infraestrutura sem fato comunicável: dizer que existe um gateway ou uma CDN
 * não responde a nenhuma dúvida de quem está com o cartão na mão.
 */
const INFRA_RE =
  /\b(?:payment\s+gateway|gateway\s+de\s+pagamento|gateway|checkout\s+provider|cdn|cms|erp|api|firewall|servidor|server|hospedagem|hosting|data\s?center)\b/gi

const FAMILIAS: Array<{ nome: FamiliaDeJargao; re: RegExp }> = [
  { nome: "seguranca", re: SEGURANCA_RE },
  { nome: "plataforma", re: PLATAFORMA_RE },
  { nome: "infra", re: INFRA_RE },
]

/**
 * O fato que sobra quando o jargão de segurança sai. Sai na língua do próprio
 * insumo: a lista já mistura PT e EN (o Seletor copia da pesquisa, e as
 * proibições do contrato vêm em português), e devolver a frase no idioma
 * errado transformaria a tradução num ruído a mais.
 */
const FATO_DE_SEGURANCA = {
  pt: "pagamento protegido no checkout",
  en: "secure, protected checkout",
} as const

/** Palavras-função inglesas frequentes o bastante para decidir o idioma. */
const MARCAS_EN = /\b(?:the|is|are|with|by|on|of|and|runs?|built|default|your|every|day|store)\b/gi

function idiomaDe(texto: string): "pt" | "en" {
  const en = (texto.match(MARCAS_EN) ?? []).length
  return en >= 2 ? "en" : "pt"
}

/** Palavras que não contam como substância própria da oração. */
const VAZIAS = new Set([
  "a", "o", "as", "os", "um", "uma", "de", "do", "da", "dos", "das", "em", "no", "na",
  "nos", "nas", "por", "para", "com", "sem", "e", "ou", "que", "se", "ao", "aos",
  "the", "a", "an", "is", "are", "was", "of", "on", "in", "at", "to", "by", "with",
  "and", "or", "for", "from", "its", "it", "this", "that", "your", "our", "runs",
  "run", "built", "default", "store", "loja", "roda", "usa", "uses", "use",
])

function temSubstanciaPropria(oracao: string): boolean {
  if (/\d/.test(oracao)) return true
  const palavras = oracao
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .split(/\s+/)
    .filter((p) => p.length > 1 && !VAZIAS.has(p))
  return palavras.length >= 3
}

function limpar(s: string): string {
  return s
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,;.])/g, "$1")
    .replace(/^[\s,;.:-]+/, "")
    .replace(/[\s,;:-]+$/, "")
    .replace(/\s+(?:on|in|at|of|by|with|no|na|do|da|de|the|com|em)$/i, "")
    .trim()
}

/** Famílias de jargão presentes num texto, sem julgar o que fazer com elas. */
export function familiasNoTexto(texto: string): FamiliaDeJargao[] {
  const t = texto ?? ""
  if (!t.trim()) return []
  return FAMILIAS.filter((f) => new RegExp(f.re.source, "i").test(t)).map((f) => f.nome)
}

/**
 * Todo trecho de jargão encontrado, com a família. Serve ao lint de envio,
 * que só AVISA — por isso aqui não se decide nada, só se aponta.
 */
export function acharJargao(texto: string): Array<{ trecho: string; familia: FamiliaDeJargao }> {
  const t = texto ?? ""
  if (!t.trim()) return []
  const out: Array<{ trecho: string; familia: FamiliaDeJargao }> = []
  const vistos = new Set<string>()
  for (const f of FAMILIAS) {
    for (const m of t.matchAll(new RegExp(f.re.source, "gi"))) {
      const chave = `${f.nome}|${m[0].toLowerCase()}`
      if (vistos.has(chave)) continue
      vistos.add(chave)
      out.push({ trecho: m[0], familia: f.nome })
    }
  }
  return out
}

export interface InsumoTraduzido {
  /** Vazio quando o insumo era só infraestrutura e não sobrou fato. */
  texto: string
  trocou: boolean
  familias: FamiliaDeJargao[]
}

/**
 * Reescreve um insumo permitido na língua de quem compra.
 *
 * Age por ORAÇÃO, não pelo insumo inteiro: "Free shipping over $100 on the
 * Shopify store" perderia o frete grátis se a menção à plataforma derrubasse
 * a linha toda. A oração com jargão de segurança vira o fato; a oração que é
 * SÓ plataforma/infra cai; a que tem substância própria perde apenas a
 * menção.
 *
 * A origem entre parênteses nunca é tocada.
 */
export function traduzirInsumo(insumo: string): InsumoTraduzido {
  const original = (insumo ?? "").trim()
  if (!original) return { texto: "", trocou: false, familias: [] }

  const familias = familiasNoTexto(original)
  if (familias.length === 0) return { texto: original, trocou: false, familias: [] }

  // A origem é o ÚLTIMO parêntese — é o que `seletor-regras` exige e o que
  // diz de onde o fato veio. Fica intacta.
  const mOrigem = original.match(/\s*(\([^()]*\))\s*$/)
  const origem = mOrigem ? mOrigem[1] : ""
  const substancia = mOrigem ? original.slice(0, mOrigem.index).trim() : original

  const idioma = idiomaDe(substancia)
  const oracoes = substancia.split(/\s*[,;]\s*|\s+[—–-]\s+/).filter((o) => o.trim())

  const mantidas: string[] = []
  for (const bruta of oracoes) {
    const o = bruta.trim()
    const fam = familiasNoTexto(o)
    if (fam.length === 0) {
      mantidas.push(o)
      continue
    }
    if (fam.includes("seguranca")) {
      // O jargão de segurança tem fato por baixo: ele é o que fica.
      mantidas.push(FATO_DE_SEGURANCA[idioma])
      continue
    }
    const semJargao = limpar(o.replace(PLATAFORMA_RE, " ").replace(INFRA_RE, " "))
    if (semJargao && temSubstanciaPropria(semJargao)) mantidas.push(semJargao)
    // Sem substância própria, a oração era só o fornecedor: cai.
  }

  // Dedupe: duas orações de segurança na mesma frase viram um fato só.
  const vistas = new Set<string>()
  const finais = mantidas.filter((m) => {
    const k = m.toLowerCase()
    if (vistas.has(k)) return false
    vistas.add(k)
    return true
  })

  if (finais.length === 0) return { texto: "", trocou: true, familias }

  let texto = limpar(finais.join(", "))
  texto = texto.charAt(0).toUpperCase() + texto.slice(1)
  const completo = origem ? `${texto} ${origem}` : texto
  return { texto: completo, trocou: completo !== original, familias }
}
