/**
 * Quando duas assinaturas na tela são, na verdade, a mesma.
 *
 * O financeiro do cliente lista DUAS fontes: as linhas locais
 * (`client_subscriptions`) e as assinaturas vivas do Asaas. O merge do
 * GET descarta a do Asaas quando alguma local aponta para ela por
 * `asaas_subscription_id` — e só por aí.
 *
 * O fechamento da venda criava a linha local SEM esse id (medido em
 * 08/09: Camila, Danilo, Frederico, João Paulo e Thiago). Resultado: a
 * mesma mensalidade aparecendo duas vezes, com MRR dobrado, e nenhuma
 * das duas dizendo que tem irmã.
 *
 * O código novo não gera mais esse estado, mas as linhas de antes
 * continuam no banco — e apagá-las por conta própria seria destrutivo
 * (quatro das cinco têm cobrança emitida). Então este módulo faz o que
 * dá para fazer com honestidade: aponta a SUSPEITA na tela e deixa o
 * operador confirmar. Confirmar grava o `asaas_subscription_id` no
 * espelho local, e a partir daí o merge esconde a duplicata sozinho.
 *
 * Puro e testado porque é régua que erra em silêncio nas duas direções:
 * apontar de menos deixa o MRR dobrado para sempre; apontar de mais faz
 * alguém fundir duas assinaturas legítimas — e o JMJC tem exatamente
 * isso, duas de R$ 3.500 para lojas diferentes.
 */

export interface AssinaturaLocal {
  id: string
  name?: string | null
  value: number | string
  cycle?: string | null
  status?: string | null
  asaas_subscription_id?: string | null
}

export interface AssinaturaAsaas {
  id: string
  name?: string | null
  value: number | string
  cycle?: string | null
  status?: string | null
}

/** Centavos, para não comparar float. "3500.00" e 3500 são o mesmo. */
function centavos(v: number | string): number | null {
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."))
  return Number.isFinite(n) ? Math.round(n * 100) : null
}

function ativa(status?: string | null): boolean {
  if (!status) return true
  const s = status.toLowerCase()
  return s === "active" || s === "ativa"
}

function ciclo(c?: string | null): string {
  return (c ?? "MONTHLY").toUpperCase()
}

export interface SuspeitaDeDuplicata {
  /** A linha local que provavelmente é o espelho não-vinculado. */
  localId: string
  /** A assinatura do Asaas que ela espelha. */
  asaasId: string
  asaasNome: string
}

/**
 * Casa cada linha local órfã com a assinatura do Asaas que ela espelha.
 *
 * O critério é EXCLUSIVO nos dois lados: só aponta quando uma local
 * órfã e uma do Asaas se correspondem sozinhas em valor e ciclo. Se
 * duas locais de R$ 3.500 disputam a mesma assinatura do Asaas — ou uma
 * local casa com duas do Asaas —, não há como saber qual é qual, e
 * escolher no chute faria o operador fundir a assinatura errada.
 *
 * Silêncio aqui custa um card duplicado que dá para resolver à mão;
 * palpite errado custa uma assinatura que some do financeiro.
 */
export function suspeitasDeDuplicata(
  locais: AssinaturaLocal[],
  asaas: AssinaturaAsaas[],
): SuspeitaDeDuplicata[] {
  // Já vinculada não é suspeita — o merge do GET já a esconde.
  const orfas = locais.filter((l) => !l.asaas_subscription_id && ativa(l.status))
  // Assinatura do Asaas que ALGUMA local já reivindica está fora: ela
  // nem chega à tela, e oferecê-la de novo criaria vínculo duplo.
  const reivindicadas = new Set(
    locais.map((l) => l.asaas_subscription_id).filter(Boolean) as string[],
  )
  const livres = asaas.filter((a) => !reivindicadas.has(a.id) && ativa(a.status))

  const chave = (v: number | string, c?: string | null) => `${centavos(v)}|${ciclo(c)}`

  const contaOrfas = new Map<string, number>()
  for (const o of orfas) {
    const k = chave(o.value, o.cycle)
    contaOrfas.set(k, (contaOrfas.get(k) ?? 0) + 1)
  }
  const contaLivres = new Map<string, number>()
  for (const a of livres) {
    const k = chave(a.value, a.cycle)
    contaLivres.set(k, (contaLivres.get(k) ?? 0) + 1)
  }

  const out: SuspeitaDeDuplicata[] = []
  for (const o of orfas) {
    const k = chave(o.value, o.cycle)
    if (centavos(o.value) === null) continue
    // Um de cada lado: a correspondência é inequívoca.
    if (contaOrfas.get(k) !== 1 || contaLivres.get(k) !== 1) continue
    const par = livres.find((a) => chave(a.value, a.cycle) === k)
    if (!par) continue
    out.push({
      localId: o.id,
      asaasId: par.id,
      asaasNome: par.name?.trim() || "Assinatura Asaas",
    })
  }
  return out
}

/**
 * Assinaturas ativas do cliente que o fechamento da venda deveria
 * mostrar antes de criar mais uma.
 *
 * O WonDealDialog nasce com "assinatura mensal" já marcada e não
 * consulta o financeiro: o operador que fecha a venda de um cliente que
 * JÁ tem mensalidade não tem como saber disso pela tela. As duas
 * duplicatas mais caras (Frederico, R$ 10.000, e João Paulo, R$ 3.500)
 * nasceram assim — dias depois de a assinatura existir.
 *
 * Isto é AVISO, não bloqueio: cliente que compra a segunda loja precisa
 * mesmo de uma segunda assinatura, e o valor idêntico é a regra nesse
 * caso, não a exceção.
 */
export function avisoDeAssinaturaExistente(
  ativas: AssinaturaLocal[],
  valorNovo: number,
): string | null {
  const vivas = ativas.filter((a) => ativa(a.status))
  if (vivas.length === 0) return null

  const alvo = centavos(valorNovo)
  const mesmoValor = vivas.filter((a) => centavos(a.value) === alvo)

  if (mesmoValor.length > 0) {
    return mesmoValor.length === 1
      ? "Este cliente já tem uma assinatura ativa deste mesmo valor. Confirme que esta venda é de outra loja — senão, desmarque a assinatura aqui."
      : `Este cliente já tem ${mesmoValor.length} assinaturas ativas deste mesmo valor. Confirme que esta venda é de outra loja.`
  }
  return vivas.length === 1
    ? "Este cliente já tem 1 assinatura ativa. Uma nova será criada além dela."
    : `Este cliente já tem ${vivas.length} assinaturas ativas. Uma nova será criada além delas.`
}


/**
 * Uma assinatura, um card.
 *
 * O financeiro do cliente lê DUAS fontes independentes — as linhas de
 * `client_subscriptions` e a lista crua do Asaas — e renderizava as duas
 * inteiras, uma embaixo da outra. Toda assinatura do Asaas que ganha
 * espelho local passa a ocupar DOIS cards, com o MRR somado em dobro.
 *
 * O espelho nasce em vários caminhos legítimos: o POST de assinatura
 * Asaas cria na hora, "Vincular lojas" cria (é onde o vínculo mora — a FK
 * de `client_subscription_stores` aponta para `client_subscriptions`), o
 * onboarding cria, o sync cria. Medido em 08/09: criar uma assinatura
 * pelo perfil do cliente gravou UMA linha correta
 * (`sub_nx3acxf97wuc96j7`) e ainda assim a tela mostrava duas.
 *
 * A **linha local vence** porque é ela que carrega lojas, classificação e
 * notas; a do provedor vira o `asaas_subscription_id` exibido no card
 * local. É a mesma regra que o `GET /api/client-subscriptions` já
 * aplicava — mas aquele endpoint a tela não usa.
 */
export function assinaturasAsaasSemEspelho<T extends { id: string }>(
  locais: Pick<AssinaturaLocal, "asaas_subscription_id">[],
  doAsaas: T[],
): T[] {
  const espelhadas = new Set(
    locais.map((l) => l.asaas_subscription_id).filter((id): id is string => Boolean(id)),
  )
  return doAsaas.filter((s) => !espelhadas.has(s.id))
}
