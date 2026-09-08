/**
 * Quais lojas uma assinatura cobre, quando ninguém vinculou ainda.
 *
 * A tela do financeiro mostra "Sem loja — vincular" e a Gestão de Carteira
 * fica sem a mensalidade daquela loja, mesmo quando a resposta está no banco
 * ao lado: o cliente tem lojas ativas, e a assinatura cobre alguma delas.
 *
 * TRÊS decisões de desenho, e as três importam:
 *
 * 1. **Isto é derivação de LEITURA, não gravação.** A inferência nunca vira
 *    linha em `client_subscription_stores` sozinha — é calculada na hora e
 *    marcada como inferida. Assim o vínculo EXPLÍCITO (feito à mão hoje, ou
 *    pelo onboarding amanhã) sempre vence, sem ninguém precisar desfazer o
 *    que um backfill teria gravado. Era o pedido: não deixar definitivo.
 *
 * 2. **Só infere sozinha quando o cliente tem UMA assinatura.** Medido em
 *    08/09: das 7 assinaturas sem vínculo, NENHUMA é o caso trivial de uma
 *    loja — seis têm múltiplas. João Paulo Lima tem DUAS assinaturas e duas
 *    lojas, e o JMJC tem MRR de R$ 7.000 em duas assinaturas de 3.500 para
 *    três lojas Boxer Shop. Dar "todas as lojas do cliente" a cada assinatura
 *    faria a mensalidade contar DUAS VEZES na carteira, inflando a receita da
 *    loja — e receita inflada é o erro que ninguém percebe olhando, porque o
 *    número continua plausível. Qual plano paga qual loja é decisão de
 *    negócio; só quem cadastrou sabe.
 *
 * 3. **Calar-se não é o mesmo que não ajudar.** Onde a inferência não vale,
 *    `candidatas` continua trazendo as lojas do cliente, para o diálogo abrir
 *    já com elas marcadas. O trabalho vira revisar, não garimpar num select —
 *    que é o que a tela pedia antes.
 */

export type OrigemDoVinculo = "explicito" | "inferido" | "nenhum"

export interface LojaDoCliente {
  id: string
  store_name: string
  is_active?: boolean | null
}

export interface VinculoDeLojas {
  origem: OrigemDoVinculo
  storeIds: string[]
  /** Por que não foi possível inferir. Vira o texto da tela. */
  motivo?:
    | "cliente_sem_loja_ativa"
    | "cliente_tem_varias_assinaturas"
    | "assinatura_encerrada"
  /**
   * As lojas que SERIAM inferidas, mesmo quando a inferência não vale.
   *
   * Existe para o caso do JMJC: ele tem duas assinaturas de R$ 3.500 (MRR de
   * 7.000) e três lojas Boxer Shop. Inferir "as três" para CADA uma dobraria
   * a mensalidade na carteira, então a inferência corretamente se cala — mas
   * calar-se e mostrar uma lista vazia obrigaria a pessoa a garimpar as três
   * lojas num select. Com `candidatas`, o diálogo já abre com elas marcadas e
   * o trabalho vira revisar, não procurar.
   */
  candidatas: string[]
}

/** Assinatura que não corre mais não deve puxar loja nenhuma. */
const ENCERRADAS = new Set(["cancelled", "canceled", "expired", "inactive"])

export function resolverLojasDaAssinatura(params: {
  /** Vínculos já gravados (client_subscription_stores). */
  explicitos?: string[]
  /** Lojas do cliente, como vêm do banco. */
  lojasDoCliente?: LojaDoCliente[]
  /** Quantas assinaturas o cliente tem no total (inclusive esta). */
  assinaturasDoCliente?: number
  status?: string | null
}): VinculoDeLojas {
  const explicitos = (params.explicitos ?? []).filter(Boolean)

  // Vínculo explícito vence sempre — inclusive em assinatura encerrada e
  // inclusive quando o cliente tem várias. Alguém decidiu; não se desfaz.
  if (explicitos.length > 0) {
    const unicos = Array.from(new Set(explicitos))
    return { origem: "explicito", storeIds: unicos, candidatas: unicos }
  }

  const ativasParaCandidatas = (params.lojasDoCliente ?? []).filter(
    (l) => l.is_active !== false,
  )

  if (params.status && ENCERRADAS.has(params.status)) {
    // Encerrada não sugere nada: oferecer um clique de "confirmar" numa
    // assinatura que não corre mais é convidar ao erro.
    return {
      origem: "nenhum",
      storeIds: [],
      motivo: "assinatura_encerrada",
      candidatas: [],
    }
  }

  // `is_active !== false`, e não `=== true`: loja que veio sem o campo é
  // tratada como ativa. Sumir da inferência por um campo ausente seria o
  // tipo de silêncio que esta função existe para acabar.
  const ativas = ativasParaCandidatas
  const candidatas = ativas.map((l) => l.id)

  if (ativas.length === 0) {
    return {
      origem: "nenhum",
      storeIds: [],
      motivo: "cliente_sem_loja_ativa",
      candidatas: [],
    }
  }

  if ((params.assinaturasDoCliente ?? 1) > 1) {
    return {
      origem: "nenhum",
      storeIds: [],
      motivo: "cliente_tem_varias_assinaturas",
      candidatas,
    }
  }

  return { origem: "inferido", storeIds: candidatas, candidatas }
}

/** Texto da tela. Fala do que fazer, não do estado interno. */
export function explicarVinculo(v: VinculoDeLojas): string {
  if (v.origem === "explicito") {
    return v.storeIds.length === 1
      ? "1 loja vinculada"
      : `${v.storeIds.length} lojas vinculadas`
  }
  if (v.origem === "inferido") {
    return v.storeIds.length === 1
      ? "1 loja do cliente — confirme o vínculo"
      : `${v.storeIds.length} lojas do cliente — confirme o vínculo`
  }
  switch (v.motivo) {
    case "cliente_tem_varias_assinaturas":
      return "Cliente tem mais de uma assinatura — escolha as lojas desta"
    case "assinatura_encerrada":
      return "Assinatura encerrada"
    default:
      return "Cliente sem loja ativa"
  }
}

/**
 * A inferência é apenas uma SUGESTÃO até alguém confirmar.
 *
 * Serve à tela para decidir se mostra o botão de confirmar — e serve de
 * lembrete no código de que `origem: 'inferido'` não é um vínculo.
 */
export function precisaConfirmar(v: VinculoDeLojas): boolean {
  return v.origem === "inferido"
}
