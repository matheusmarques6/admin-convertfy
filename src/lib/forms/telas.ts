/**
 * Mover pergunta entre telas, arrastando.
 *
 * O agrupamento do conversacional ("estas quatro perguntas aparecem
 * juntas") é o `mesma_tela` do bloco, e ele mora em DOIS lugares que
 * precisam andar juntos: a ORDEM está na lista de perguntas do editor
 * (`crm_form_fields.position`) e a FLAG está no rascunho do schema
 * (`draft_schema.blocks[].mesma_tela`), porque a tabela de campos não
 * tem coluna para ela.
 *
 * Arrastar mexe nas duas. Fazer isso na tela, com a lista de um lado e
 * o rascunho do outro, é como as duas divergem: a pergunta muda de
 * lugar e continua agrupada com quem ficou para trás. Daqui sai a
 * sequência nova INTEIRA, e quem chama só aplica.
 *
 * Três invariantes, e as três erram em silêncio:
 *
 * 1. **A primeira pergunta é sempre cabeça.** `mesma_tela` na posição 0
 *    não tem com quem se juntar; deixá-lo gravado faz a flag reaparecer
 *    quando outra pergunta for posta na frente, meses depois.
 * 2. **O título é da TELA, e a tela é a cabeça.** Tirar a cabeça de um
 *    grupo sem passar o título adiante apaga o título sem nada dizer —
 *    a tela continua existindo, com as perguntas restantes, e sem nome.
 * 3. **Soltar dentro de um grupo entra no grupo.** É o gesto que o
 *    operador está fazendo; largar ali e ficar de fora seria o arrasto
 *    "não funcionar" na leitura dele.
 */

export interface PerguntaNaTela {
  ref: string
  mesma_tela?: boolean
  titulo_da_tela?: string | null
}

/** Onde a pergunta arrastada é solta. */
export type Alvo =
  | { tipo: "pergunta"; ref: string }
  /** A faixa entre duas telas: a pergunta vira cabeça de uma tela nova. */
  | { tipo: "nova_tela"; antesDe: string | null }

/**
 * A sequência nova depois do arrasto.
 *
 * Devolve a MESMA referência de array quando nada muda (soltar em cima
 * de si mesma, ou ref que não existe): a tela usa isso para não gravar
 * rascunho nem marcar "alterado" por um arrasto que não moveu nada.
 */
export function moverPergunta(
  atual: readonly PerguntaNaTela[],
  refArrastada: string,
  alvo: Alvo,
): PerguntaNaTela[] {
  const lista = atual as PerguntaNaTela[]
  const de = lista.findIndex((p) => p.ref === refArrastada)
  if (de < 0) return lista

  if (alvo.tipo === "pergunta" && alvo.ref === refArrastada) return lista
  if (alvo.tipo === "nova_tela" && alvo.antesDe === refArrastada) return lista

  const semEla = lista.filter((_, i) => i !== de)
  const arrastada = lista[de]

  // Quem sai de cabeça leva o nome da tela junto? Não: o nome é da TELA,
  // e a tela continua ali com as outras perguntas. Passa para a nova
  // cabeça, que é a próxima do grupo.
  const eraCabeca = !arrastada.mesma_tela
  const tituloOrfao = eraCabeca ? (arrastada.titulo_da_tela ?? null) : null
  const proxima = lista[de + 1]
  const herdeira = tituloOrfao && proxima?.mesma_tela ? proxima.ref : null

  let destino: number
  let juntar: boolean
  if (alvo.tipo === "pergunta") {
    const alvoIdx = semEla.findIndex((p) => p.ref === alvo.ref)
    if (alvoIdx < 0) return lista
    destino = alvoIdx + 1
    juntar = true
  } else {
    if (alvo.antesDe === null) {
      destino = semEla.length
    } else {
      const alvoIdx = semEla.findIndex((p) => p.ref === alvo.antesDe)
      if (alvoIdx < 0) return lista
      destino = alvoIdx
    }
    juntar = false
  }

  const movida: PerguntaNaTela = {
    ...arrastada,
    mesma_tela: juntar ? true : undefined,
    // Sai de um grupo e vira cabeça de tela nova: o título que ela
    // carregava é de outra tela, e reaproveitá-lo nomearia a errada.
    titulo_da_tela: juntar ? undefined : (eraCabeca ? arrastada.titulo_da_tela : undefined),
  }

  const saida = [...semEla.slice(0, destino), movida, ...semEla.slice(destino)]

  return saida.map((p, i) => {
    const herdou = herdeira && p.ref === herdeira ? { titulo_da_tela: tituloOrfao } : null
    // Invariante 1: a primeira nunca é "junta com a de cima".
    const flag = i === 0 ? { mesma_tela: undefined } : null
    if (!herdou && !flag) return p
    return { ...p, ...herdou, ...flag }
  })
}

/**
 * Em que tela cada pergunta cai, e quantas dividem a tela.
 *
 * Mesma leitura que a engine do conversacional faz (`inicioDaTela`): a
 * primeira sempre abre uma tela, mesmo que tenha a flag — senão uma
 * lista que começa com `mesma_tela: true` (o que um arrasto malfeito
 * pode produzir) não teria tela nenhuma.
 */
export function telasDaSequencia(lista: readonly PerguntaNaTela[]): Record<
  string,
  { numero: number; tamanho: number; cabeca: boolean; titulo: string }
> {
  const parcial: Array<{ ref: string; numero: number; cabeca: string }> = []
  let numero = 0
  let cabeca = ""
  for (const p of lista) {
    if (!p.mesma_tela || !cabeca) {
      numero += 1
      cabeca = p.ref
    }
    parcial.push({ ref: p.ref, numero, cabeca })
  }
  const tamanho: Record<number, number> = {}
  for (const p of parcial) tamanho[p.numero] = (tamanho[p.numero] ?? 0) + 1
  const titulos = new Map(lista.map((p) => [p.ref, p.titulo_da_tela ?? ""]))
  const out: Record<string, { numero: number; tamanho: number; cabeca: boolean; titulo: string }> = {}
  for (const p of parcial) {
    out[p.ref] = {
      numero: p.numero,
      tamanho: tamanho[p.numero],
      cabeca: p.ref === p.cabeca,
      titulo: titulos.get(p.cabeca) ?? "",
    }
  }
  return out
}
