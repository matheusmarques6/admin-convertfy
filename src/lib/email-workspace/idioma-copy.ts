/**
 * idioma-copy — descobrir, sem chamar ninguém, em que língua a copy voltou.
 *
 * Por que existe: a ordem de idioma vai no payload do n8n desde 01/09, em
 * três lugares (raiz, `store` e prefixando o `pesquisa_diagnostico`), em
 * inglês, dizendo "Not one sentence, not one word in another language". Os
 * dois últimos runs de `copy_dispatch` confirmam que ela SAIU. E a copy da
 * Innova Bay — loja `en` — voltou em português dentro do mesmo bloco:
 *
 *   offer_headline  → "Does it work on my car?"
 *   offer_body      → "Use code WELCOME10 na compra. Sem mínimo, sem expiração."
 *
 * O flow não referencia os campos novos. Pedir mais alto é repetir o que já
 * falhou — a saída é parar de pedir e passar a CORRIGIR do nosso lado, no
 * agente que já reescreve campo (`copy_fit`) e cujo veredicto é do código.
 *
 * O detector é CONSERVADOR por construção: falso positivo aqui manda
 * reescrever copy que estava certa. Texto curto, rótulo de botão, cupom e
 * frase ambígua saem como `indefinido` e NÃO viram alvo. Só há veredicto
 * com marca EXCLUSIVA da língua e volume mínimo de texto.
 *
 * Puro (zero I/O) — client-safe.
 */

export type IdiomaDetectado = "pt" | "en" | "indefinido"

/**
 * Palavras que existem em português e NÃO em espanhol nem em inglês. A
 * lista é curta de propósito: `de`, `para`, `que`, `por`, `como` e `quando`
 * são idênticas em espanhol, e `no`, `as`, `a`, `e`, `os`? — `no` e `as`
 * são palavras inglesas. Casar por elas transformaria copy espanhola em
 * "português" e mandaria traduzir o que já estava certo.
 */
const PT_EXCLUSIVAS = new Set([
  "não", "nao", "você", "voce", "vocês", "voces", "com", "sem", "uma", "mais",
  "também", "tambem", "já", "muito", "muita", "seu", "sua", "seus", "suas",
  "da", "do", "das", "na", "nas", "pelo", "pela", "até", "ate", "agora",
  "aqui", "tudo", "ela", "eles", "elas", "ter", "tem", "fazer", "faz", "são",
  "sao", "estão", "estao", "isso", "esse", "essa", "depois", "grátis",
  "frete", "produto", "produtos", "hoje", "só", "nós", "nosso", "nossa",
  "nossos", "nossas", "aproveite", "confira", "garanta", "veja", "saiba",
  "melhor", "novo", "nova",
])

/**
 * Sinal fraco: existe em português e também em espanhol. Vale 1 (contra os 2
 * da exclusiva) porque `pt` × `es` não é a distinção que este módulo faz —
 * ele separa "português" de "inglês", e nenhuma dessas é palavra inglesa.
 */
const PT_COMPARTILHADAS = new Set([
  "de", "para", "que", "em", "por", "os", "um", "como", "quando", "onde",
  "cada", "entre", "sobre", "todos", "toda", "todas", "ser", "está", "esta",
  "este", "antes", "mas", "ou", "seja", "pode", "vai", "foi",
])

/** Palavras inglesas frequentes que não existem em português. */
const EN_EXCLUSIVAS = new Set([
  "the", "your", "you", "yours", "and", "for", "with", "this", "that",
  "these", "those", "our", "ours", "are", "is", "was", "were", "to", "of",
  "it", "its", "on", "we", "get", "all", "from", "now", "free", "more",
  "off", "just", "have", "has", "will", "can", "new", "every", "about",
  "what", "why", "how", "out", "only", "best", "shop", "order", "back",
  "here", "there", "they", "them", "his", "her", "their", "don", "doesn",
  "does", "do", "make", "made", "into", "over", "than", "then", "been",
  "because", "before", "after", "again", "still", "yet", "buy", "save",
])

/** `ç`, `ã`, `õ` e os dígrafos `nh`/`lh` não aparecem em inglês nem em espanhol. */
const MORFOLOGIA_PT: RegExp[] = [
  /[ãõç]/,
  /ção|ções|ões\b|inho\b|inha\b/,
  /\w(nh|lh)\w/,
  /mente\b/,
]

function palavras(texto: string): string[] {
  return texto
    .toLowerCase()
    .split(/[^\p{L}\p{N}']+/u)
    .filter((w) => w.length > 0)
}

/**
 * Em que língua o texto está — ou `indefinido`, que é a resposta honesta na
 * maior parte dos rótulos de e-mail ("SHOP NOW", "10% OFF", "WELCOME10").
 *
 * Exige 4 palavras e 15 caracteres antes de arriscar um veredicto: abaixo
 * disso a evidência não distingue um CTA em inglês de um nome de produto.
 */
export function detectarIdioma(texto: unknown): IdiomaDetectado {
  const t = typeof texto === "string" ? texto.trim() : ""
  if (t.length < 15) return "indefinido"
  const ws = palavras(t)
  if (ws.length < 4) return "indefinido"

  let pt = 0
  let en = 0
  for (const w of ws) {
    if (PT_EXCLUSIVAS.has(w)) pt += 2
    else if (PT_COMPARTILHADAS.has(w)) pt += 1
    if (EN_EXCLUSIVAS.has(w)) en += 1
  }
  for (const re of MORFOLOGIA_PT) if (re.test(t.toLowerCase())) pt += 2

  // `pt` precisa de mais evidência que `en` porque o inglês é reconhecido
  // por palavras funcionais frequentes, enquanto o português aqui é
  // reconhecido por marcas exclusivas — e uma delas pode ser só o nome de
  // um produto ("Café da Manhã Blend") no meio de uma frase inglesa.
  if (pt >= 3 && pt > en) return "pt"
  if (en >= 2 && pt === 0) return "en"
  return "indefinido"
}

/**
 * A família que o detector consegue enxergar, a partir do código da loja
 * (`client_stores.language`, que pode ser ISO ou texto livre).
 *
 * `outro` não é ignorância inútil: copy detectada em `pt` numa loja alemã
 * diverge do mesmo jeito — o que muda é que a comparação vale só quando o
 * detector se pronuncia.
 */
export function familiaDoIdioma(code: string | null | undefined): "pt" | "en" | "outro" {
  const c = (code ?? "").trim().toLowerCase()
  if (!c) return "outro"
  if (c === "pt" || c.startsWith("pt-") || c.startsWith("portug")) return "pt"
  if (c === "en" || c.startsWith("en-") || c === "english" || c === "inglês" || c === "ingles") {
    return "en"
  }
  return "outro"
}

/**
 * O campo está no idioma errado? `false` sempre que o detector não se
 * pronuncia — a dúvida nunca vira reescrita.
 */
export function idiomaDivergente(
  texto: unknown,
  idiomaDaLoja: string | null | undefined,
): { divergente: boolean; detectado: IdiomaDetectado } {
  const detectado = detectarIdioma(texto)
  if (detectado === "indefinido") return { divergente: false, detectado }
  if (!(idiomaDaLoja ?? "").trim()) return { divergente: false, detectado }
  return { divergente: detectado !== familiaDoIdioma(idiomaDaLoja), detectado }
}
