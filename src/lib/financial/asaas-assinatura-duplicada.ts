/**
 * A assinatura duplicada que COBRA o cliente.
 *
 * As duplicatas anteriores (migration 20261132) eram linhas locais: feias
 * na tela, inflavam o MRR, mas ninguém pagava a mais. Esta é outra —
 * `POST /api/integrations/asaas/subscriptions` chamava
 * `asaas.createSubscription` sem checar NADA, e o Asaas não deduplica.
 * Duas assinaturas ativas de R$ 2.497 para a EP Negócios Digital (medido
 * em 08/09, com ZERO linhas locais: as duas vieram do provedor) são duas
 * cobranças mensais de verdade na fatura de quem comprou uma.
 *
 * O erro é fácil de cometer e invisível: a chamada ao Asaas leva segundos,
 * o botão não travava, e quem clica de novo — ou dá F5 e reenvia — assina
 * o cliente duas vezes sem nenhum aviso.
 *
 * **Não dá para recusar tudo.** O JMJC tem duas assinaturas legítimas de
 * R$ 3.500 para lojas diferentes, e a segunda loja de um cliente costuma
 * custar exatamente o mesmo que a primeira: valor idêntico é a regra
 * desse caso, não a exceção. Recusar em silêncio faria a segunda venda
 * não ser cobrada — e receita que some ninguém percebe.
 *
 * Daí três desfechos em vez de dois, separados por TEMPO:
 *
 *  - `reusar` — idêntica criada agora há pouco. Não existe decisão de
 *    negócio que se tome duas vezes em dez minutos; isto é clique duplo
 *    ou retry, e criar de novo é sempre errado.
 *  - `confirmar` — idêntica mais antiga. Pode ser a segunda loja, pode
 *    ser engano. Quem sabe é quem está vendendo, então a rota devolve o
 *    que achou e a pessoa decide.
 *  - `criar` — nada parecido.
 *
 * Puro e testado porque errar para qualquer um dos lados custa dinheiro:
 * de menos, cobra o cliente em dobro; de mais, deixa de cobrar.
 */

export interface AssinaturaAsaas {
  id: string
  value: number | string
  cycle?: string | null
  status?: string | null
  description?: string | null
  /** ISO do provedor (`dateCreated`). Ausente = não dá para medir recência. */
  dateCreated?: string | null
  nextDueDate?: string | null
}

export interface PedidoDeAssinatura {
  value: number
  cycle?: string | null
  description?: string | null
}

export type DecisaoAsaas =
  | { acao: "criar" }
  | { acao: "reusar"; existente: AssinaturaAsaas }
  | { acao: "confirmar"; existente: AssinaturaAsaas }

/** Janela em que uma segunda criação idêntica é sempre acidente. */
export const JANELA_CLIQUE_DUPLO_MS = 10 * 60 * 1000

function centavos(v: number | string): number | null {
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."))
  return Number.isFinite(n) ? Math.round(n * 100) : null
}

function ciclo(c?: string | null): string {
  return (c ?? "MONTHLY").toUpperCase()
}

function ativa(status?: string | null): boolean {
  // Sem status, assume ativa: tratar como inativa faria a régua ignorar a
  // assinatura e liberar a criação da duplicata — o erro caro.
  if (!status) return true
  return status.toUpperCase() === "ACTIVE"
}

/**
 * Texto comparável da descrição.
 *
 * Sem acento e sem caixa porque a descrição é digitada à mão e a mesma
 * pessoa escreve "Portatil" numa vez e "Portátil" na outra. Descrição
 * ausente dos dois lados conta como igual — o par valor+ciclo já é
 * sinal suficiente, e exigir texto deixaria passar a duplicata de quem
 * não preencheu o campo.
 */
function descricao(d?: string | null): string {
  return (d ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
}

function ehIdentica(a: AssinaturaAsaas, pedido: PedidoDeAssinatura): boolean {
  const alvo = centavos(pedido.value)
  if (alvo === null) return false
  return (
    centavos(a.value) === alvo &&
    ciclo(a.cycle) === ciclo(pedido.cycle) &&
    descricao(a.description) === descricao(pedido.description)
  )
}

/**
 * Decide o que fazer com o pedido de nova assinatura.
 *
 * `agora` é injetado para o teste não depender do relógio.
 */
export function decidirCriacaoNoAsaas(
  existentes: AssinaturaAsaas[],
  pedido: PedidoDeAssinatura,
  agora: Date = new Date(),
): DecisaoAsaas {
  const candidatas = existentes.filter((a) => ativa(a.status) && ehIdentica(a, pedido))
  if (candidatas.length === 0) return { acao: "criar" }

  // A mais recente é a que interessa nos dois desfechos: é ela que pode
  // ser o clique duplo, e é ela que a tela mostra para o operador decidir.
  const ordenadas = [...candidatas].sort(
    (a, b) => instante(b.dateCreated) - instante(a.dateCreated),
  )
  const recente = ordenadas[0]

  const criadaEm = instante(recente.dateCreated)
  if (criadaEm > 0 && agora.getTime() - criadaEm <= JANELA_CLIQUE_DUPLO_MS) {
    return { acao: "reusar", existente: recente }
  }
  // Sem `dateCreated` não dá para afirmar que é recente — e afirmar
  // errado aqui reusaria uma assinatura que deveria ser criada. Pedir
  // confirmação é o desfecho seguro: ninguém é cobrado sem alguém ver.
  return { acao: "confirmar", existente: recente }
}

function instante(iso?: string | null): number {
  if (!iso) return 0
  const t = new Date(iso).getTime()
  return Number.isFinite(t) ? t : 0
}

/** Texto do 409, para o operador decidir sem abrir o Asaas. */
export function explicarDuplicataAsaas(a: AssinaturaAsaas): string {
  const partes = [`Este cliente já tem uma assinatura ativa idêntica no Asaas`]
  if (a.dateCreated) {
    const d = new Date(a.dateCreated)
    if (!Number.isNaN(d.getTime())) {
      partes.push(`criada em ${d.toLocaleDateString("pt-BR")}`)
    }
  }
  return (
    partes.join(", ") +
    ". Criar outra passa a cobrar o cliente duas vezes por ciclo — confirme só se esta venda for de outra loja."
  )
}
