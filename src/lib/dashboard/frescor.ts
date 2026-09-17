/**
 * Frescor do cache de receita — quem pode envelhecer e quem não pode.
 *
 * O dashboard mede a idade do dado pelo `fetched_at` MAIS ANTIGO das
 * linhas de `store_revenue_summary`, e acima de uma hora acende o banner
 * "o cache deste período está desatualizado" — que também é o gatilho da
 * sincronização automática a cada abertura da tela.
 *
 * O defeito medido em 15/09: a lista que o refresh percorre é filtrada
 * por CREDENCIAL (`ANY_EMAIL_PLATFORM_FILTER`), e a lista que mede a
 * idade não é. Uma loja que perdeu a chave — Cronos Alemã, chave removida
 * depois de 02/09, `sync_status: 'ok'`, 8.567,63 EUR gravados — ficava
 * fora de toda passada de sync e continuava ancorando a idade do
 * dashboard inteiro. Com 54 das 55 linhas sincronizadas minutos antes, a
 * carteira aparecia como desatualizada há 13 dias, **para sempre**: o
 * banner nunca apagava, o auto-sync disparava em toda abertura e segurava
 * o lock, e o clique em "Sincronizar agora" voltava `alreadyRunning`. É a
 * segunda metade do "clico em sincronizar e ele não sincroniza" — a
 * primeira (uma passada não cobria a carteira) foi corrigida antes.
 *
 * A regra daqui: **só ancora a idade quem pode ser renovado.** Linha que
 * nenhuma passada de sync alcança não fica velha — ela fica ÓRFÃ, e isso
 * é outra coisa, com outra ação (reconectar a chave ou desativar a loja).
 *
 * O valor dela continua entrando nos cards. Descartá-lo derrubaria o
 * faturamento total sem nenhuma explicação na tela, que é pior que contar
 * um número antigo e DIZER que ele é antigo.
 */

/** Uma linha do cache, do ponto de vista da idade. */
export interface LinhaDeCache {
  storeId: string
  storeName: string
  clientName?: string | null
  fetchedAt: string | null
  syncStatus: string
}

/** Linha que nenhuma passada de sync alcança. */
export interface CacheOrfao {
  storeId: string
  storeName: string
  clientName?: string | null
  fetchedAt: string | null
  /** Dias inteiros parados. `null` quando não há carimbo de coleta. */
  diasParado: number | null
}

export interface Frescor {
  /** `fetched_at` mais antigo entre as linhas que PODEM ser renovadas. */
  maisAntiga: string | null
  /** Linhas órfãs velhas o bastante para merecerem a tela. */
  orfaos: CacheOrfao[]
}

/**
 * Abaixo disto a órfã não é notícia: a chave pode ter sido removida
 * agora mesmo, e avisar de um dado de dez minutos atrás é o alarme falso
 * que ensina a ignorar o alarme. É a mesma hora do `ADMIN_STALENESS_MS`
 * do dashboard, de propósito — a órfã só aparece quando, não fosse a
 * regra daqui, ela já estaria acendendo o banner.
 */
export const IDADE_MINIMA_DO_ORFAO_MS = 60 * 60 * 1000

function instante(iso: string | null): number | null {
  if (!iso) return null
  const t = new Date(iso).getTime()
  return Number.isFinite(t) ? t : null
}

/**
 * PURA. Separa o que envelhece do que ficou órfão.
 *
 * `idsRenovaveis` é o MESMO conjunto que a rota de refresh percorre —
 * passar outro conjunto faz as duas telas discordarem, que é exatamente o
 * defeito que isto desfaz.
 */
export function medirFrescor(
  linhas: readonly LinhaDeCache[],
  idsRenovaveis: ReadonlySet<string>,
  agora: number = Date.now(),
  idadeMinimaMs: number = IDADE_MINIMA_DO_ORFAO_MS,
): Frescor {
  let maisAntiga: string | null = null
  let maisAntigaMs = Infinity
  const orfaos: CacheOrfao[] = []

  for (const l of linhas) {
    if (!idsRenovaveis.has(l.storeId)) {
      // Órfã: fora de toda passada de sync. Não ancora a idade em
      // nenhuma hipótese — nem a que foi coletada há um minuto, porque o
      // que a desqualifica não é a idade, é não ter como ser renovada.
      const t = instante(l.fetchedAt)
      // Sem carimbo entra assim mesmo: "não sei de quando é este número"
      // é informação, e some se a régua de idade for aplicada a ela.
      if (t === null || agora - t >= idadeMinimaMs) {
        orfaos.push({
          storeId: l.storeId,
          storeName: l.storeName,
          clientName: l.clientName ?? null,
          fetchedAt: l.fetchedAt,
          diasParado: t === null ? null : Math.floor((agora - t) / 86_400_000),
        })
      }
      continue
    }
    // Linha de erro zerada com carimbo recente deixaria a tela "ready"
    // mostrando R$ 0 como se fosse fresco.
    if (l.syncStatus === "error") continue
    const t = instante(l.fetchedAt)
    if (t === null) continue
    if (t < maisAntigaMs) {
      maisAntigaMs = t
      maisAntiga = l.fetchedAt
    }
  }

  return { maisAntiga, orfaos }
}

/** Frase para a tela. `null` quando não há nada a dizer. */
export function avisoDeCacheOrfao(orfaos: readonly CacheOrfao[]): string | null {
  if (orfaos.length === 0) return null
  const nomes = orfaos.slice(0, 3).map((o) => o.storeName)
  const resto = orfaos.length - nomes.length
  const lista = resto > 0 ? `${nomes.join(", ")} e mais ${resto}` : nomes.join(", ")
  const quantas =
    orfaos.length === 1
      ? "1 loja está sem plataforma de e-mail conectada"
      : `${orfaos.length} lojas estão sem plataforma de e-mail conectada`
  return `${quantas} (${lista}): o faturamento delas ainda entra nos cards, mas é o último número coletado e nenhuma sincronização vai atualizá-lo.`
}
