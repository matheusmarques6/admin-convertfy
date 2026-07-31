/**
 * Topo do funil: quem ENTROU no funil no período.
 *
 * A primeira versão contava linhas de `crm_leads` criadas no período, e
 * isso estava errado por dois motivos:
 *
 * 1. **Nem toda entrada passa por `crm_leads`.** Negócio criado direto no
 *    pipeline (manual, importação, integração) entra no funil sem gerar
 *    lead. O resultado era o funil mostrando 0 leads e 8 MQLs — número
 *    impossível, porque os 8 vieram de algum lugar.
 * 2. **Lead que virou negócio era contado como se fosse outra pessoa**
 *    se somássemos as duas fontes sem cuidado.
 *
 * Regra correta: uma ENTRADA é uma oportunidade que apareceu no funil.
 *   - todo negócio criado no período conta 1 (é a oportunidade em si);
 *   - lead criado no período conta 1 apenas se ainda NÃO virou negócio —
 *     senão a mesma pessoa contaria duas vezes.
 *
 * Não é "quem está numa etapa": quem entrou e já avançou (ou já foi
 * perdido) continua tendo entrado.
 */

export interface FunnelEntryDeal {
  id: string
  created_at: string
  /** Lead que originou o negócio, quando houve. */
  lead_id: string | null
}

export interface FunnelEntryLead {
  id: string
  created_at: string
  /** Preenchido quando o lead já foi convertido em negócio. */
  converted_to_deal_id?: string | null
}

export interface FunnelEntriesResult {
  /** Total de entradas no funil no período. */
  total: number
  /** Entradas que são negócios criados no período. */
  fromDeals: number
  /** Entradas que são leads ainda não convertidos. */
  fromLeads: number
  /** Leads do período já convertidos — contados pelo negócio, não aqui. */
  dedupedLeads: number
}

function inWindow(iso: string | null | undefined, from: string, to: string): boolean {
  if (!iso) return false
  return iso >= from && iso <= to
}

/**
 * @param deals  negócios do escopo (o filtro de período é feito aqui)
 * @param leads  leads do escopo criados no período
 * @param window ISO strings de início e fim
 */
export function countFunnelEntries(
  deals: FunnelEntryDeal[],
  leads: FunnelEntryLead[],
  window: { from: string; to: string },
): FunnelEntriesResult {
  const dealsCreated = deals.filter((d) => inWindow(d.created_at, window.from, window.to))

  // Lead que já tem negócio é a MESMA oportunidade: o negócio responde
  // por ela. Cobre os dois lados do vínculo porque nem todo fluxo
  // preenche os dois (deals.lead_id vs crm_leads.converted_to_deal_id).
  const leadIdsWithDeal = new Set(
    deals.map((d) => d.lead_id).filter((id): id is string => !!id),
  )

  let fromLeads = 0
  let dedupedLeads = 0
  for (const lead of leads) {
    if (!inWindow(lead.created_at, window.from, window.to)) continue
    const converted = leadIdsWithDeal.has(lead.id) || !!lead.converted_to_deal_id
    if (converted) dedupedLeads++
    else fromLeads++
  }

  return {
    total: dealsCreated.length + fromLeads,
    fromDeals: dealsCreated.length,
    fromLeads,
    dedupedLeads,
  }
}
