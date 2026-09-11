/**
 * Leitura das respostas da varredura "Imagem embutida".
 *
 * Existe por causa de um defeito medido em 11/09: o dialog lia
 * `json.data.items`, mas `successResponse` ESPALHA o payload no topo
 * (`{success, items, summary}`) — não há `data`. `undefined ?? []` virava
 * lista vazia, e a tela pintava o verde de "biblioteca e referências
 * limpas" com 39 payloads de base64 no banco, entre eles os 4 ícones do
 * `footer 1` e os 61 KB da `review 8`.
 *
 * A correção do caminho é trivial (ler do topo). O que este módulo trava é
 * a OUTRA metade, que é a cara: **lista vazia não prova nada**. Ela tem
 * duas causas indistinguíveis no cliente — varri tudo e não achei, ou não
 * entendi a resposta — e as ações são opostas. `summary` é o que separa as
 * duas: a rota sempre o envia com `varridos`, então resposta sem ele, ou
 * com zero alvos varridos, é falha de leitura e tem de ser DITA. Verde só
 * quando houve varredura de verdade.
 *
 * É a mesma lição do `textoSemResultado` da base de conhecimento: "0
 * resultados" lido como permissão para concluir é como um subsistema
 * inteiro passa meses parado sem ninguém ver.
 */

export interface Base64PreviaItem {
  tabela: "email_component_variants" | "store_email_references"
  id: string
  rotulo: string
  html_chars: number
  total: number
  extraiveis: number
  bytesExtraiveis: number
  charsEconomizados: number
  ok: boolean
}

export interface Base64PreviaSummary {
  varridos: number
  com_base64: number
  arquivos_a_extrair: number
  bytes: number
  chars_economizados: number
}

export type Base64Previa =
  | { estado: "limpo"; items: Base64PreviaItem[]; summary: Base64PreviaSummary }
  | { estado: "achou"; items: Base64PreviaItem[]; summary: Base64PreviaSummary }
  | { estado: "nao_entendi"; motivo: string }

function obj(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null
}

/**
 * O que o GET devolveu.
 *
 * `summary.varridos === 0` é tratado como não-entendido, não como limpo: a
 * biblioteca tem variantes ativas: varrer zero alvos significa que o filtro
 * ou a leitura falharam, e dizer "limpo" ali é a mentira que este módulo
 * existe para impedir.
 */
export function lerPrevia(json: unknown): Base64Previa {
  const raiz = obj(json)
  if (!raiz) return { estado: "nao_entendi", motivo: "resposta não é um objeto" }

  const summary = obj(raiz.summary)
  const items = Array.isArray(raiz.items) ? (raiz.items as Base64PreviaItem[]) : null

  if (!summary || !items) {
    return {
      estado: "nao_entendi",
      motivo: "resposta sem `items`/`summary` — o formato da rota mudou",
    }
  }
  const varridos = typeof summary.varridos === "number" ? summary.varridos : 0
  if (varridos === 0) {
    return { estado: "nao_entendi", motivo: "a varredura não alcançou nenhum item" }
  }

  const s = summary as unknown as Base64PreviaSummary
  return { estado: items.length === 0 ? "limpo" : "achou", items, summary: s }
}

export interface Base64Aplicacao {
  itens: number
  arquivos: number
  chars_economizados: number
  falhas: { id: string; rotulo: string; erro: string }[]
  /** A rota respondeu num formato que não sabemos ler. */
  naoEntendi: boolean
}

/**
 * O que o POST devolveu.
 *
 * Sem `resumo` o retorno é marcado `naoEntendi` em vez de virar "0 itens
 * limpos": o toast de zero é indistinguível de sucesso vazio e faria a
 * pessoa concluir que não havia nada a fazer.
 */
export function lerAplicacao(json: unknown): Base64Aplicacao {
  const raiz = obj(json)
  const resumo = obj(raiz?.resumo)
  const falhas = Array.isArray(raiz?.falhas)
    ? (raiz.falhas as Base64Aplicacao["falhas"])
    : []
  if (!resumo) {
    return { itens: 0, arquivos: 0, chars_economizados: 0, falhas, naoEntendi: true }
  }
  const num = (v: unknown) => (typeof v === "number" ? v : 0)
  return {
    itens: num(resumo.itens),
    arquivos: num(resumo.arquivos),
    chars_economizados: num(resumo.chars_economizados),
    falhas,
    naoEntendi: false,
  }
}
