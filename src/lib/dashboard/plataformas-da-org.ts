/**
 * Quais plataformas de email marketing esta org realmente usa.
 *
 * Três rotas do dashboard (`weekly-perf`, `ops-series`, `portfolio-extras`)
 * consultavam SEMPRE as duas tabelas de métricas de campanha, uma por
 * plataforma. Medido em 10/09: a org tem **54 lojas Omnisend e nenhuma
 * Klaviyo**, e `klaviyo_campaign_metrics` tem **zero linhas** — metade das
 * leituras de campanha do dashboard eram para uma tabela vazia, a cada
 * carregamento, somando com as demais 115.821 chamadas no
 * `pg_stat_statements`.
 *
 * A régua não é "esta org não tem Klaviyo": é **não perguntar pela
 * plataforma que nenhuma loja usa**. No dia em que uma loja Klaviyo for
 * cadastrada, a consulta volta sozinha.
 *
 * Puro: sem I/O.
 */

/** As colunas de credencial que decidem — as mesmas dos filtros do PostgREST. */
export interface LojaComPlataforma {
  klaviyo_private_key?: string | null
  klaviyo_api_key?: string | null
  omnisend_api_key?: string | null
}

export interface PlataformasPresentes {
  klaviyo: boolean
  omnisend: boolean
}

/** As duas, para quando não dá para afirmar (ver `plataformasPresentes`). */
export const AMBAS_AS_PLATAFORMAS: PlataformasPresentes = {
  klaviyo: true,
  omnisend: true,
}

/**
 * Quais plataformas aparecem nesta lista de lojas.
 *
 * **Lista vazia devolve as duas**, não nenhuma: ninguém pede as métricas de
 * uma carteira vazia, então a chamada com lista vazia é a que não conseguiu
 * ler as colunas (migration pendente, select degradado). Responder "nenhuma
 * plataforma" ali faria o dashboard mostrar zero achando que mediu — o erro
 * caro é o número plausível. Consultar as duas é o comportamento de antes.
 */
export function plataformasPresentes(
  lojas: readonly LojaComPlataforma[] | null | undefined,
): PlataformasPresentes {
  if (!lojas || lojas.length === 0) return AMBAS_AS_PLATAFORMAS
  let klaviyo = false
  let omnisend = false
  for (const l of lojas) {
    if (l.klaviyo_private_key || l.klaviyo_api_key) klaviyo = true
    if (l.omnisend_api_key) omnisend = true
    if (klaviyo && omnisend) break
  }
  // Nenhuma das duas reconhecida: as colunas não vieram no select (o
  // chamador degradou). Mesma razão do caso vazio.
  if (!klaviyo && !omnisend) return AMBAS_AS_PLATAFORMAS
  return { klaviyo, omnisend }
}

/** Colunas a acrescentar ao `select` de `client_stores` para decidir. */
export const COLUNAS_DE_PLATAFORMA =
  "klaviyo_private_key, klaviyo_api_key, omnisend_api_key"
