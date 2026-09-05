/**
 * Leitura de TODOS os blocos de uma transcrição.
 *
 * O PostgREST desta instância corta a resposta em 1.000 linhas, e pedir
 * `.limit(20000)` não muda isso: a chamada volta com 1.000 e nenhum aviso.
 * Numa aula de 47 min (≈600 blocos) tudo parece funcionar; num vídeo de
 * três horas a página mostra a transcrição pela metade, a exportação sai
 * truncada, o `texto_completo` é reescrito sem o fim e a indexação deixa
 * dois terços do conteúdo fora da busca — tudo em silêncio.
 *
 * Por isso a leitura é PAGINADA por `range`, e o teto existe para não
 * varrer o banco sem fim se algo der errado na paginação.
 */

import type { SupabaseClient } from "@supabase/supabase-js"

export interface BlocoLido {
  id: number
  s: number
  fim: number
  locutor: string | null
  texto: string
  editado: boolean
}

/** Abaixo do corte do PostgREST, para a página nunca vir truncada por ele. */
const PAGINA = 1000
/** ~28 h de fala em blocos de 5 s. Acima disso é defeito, não conteúdo. */
const TETO = 40_000

export async function lerBlocos(
  db: SupabaseClient,
  transcricaoId: string,
  campos = "id, s, fim, locutor, texto, editado",
): Promise<BlocoLido[]> {
  const out: BlocoLido[] = []
  for (let de = 0; de < TETO; de += PAGINA) {
    const { data, error } = await db
      .from("transcricoes_blocos")
      .select(campos)
      .eq("transcricao_id", transcricaoId)
      .order("s", { ascending: true })
      // Desempate estável: dois blocos com o mesmo `s` poderiam trocar de
      // ordem entre páginas e um deles apareceria duas vezes.
      .order("id", { ascending: true })
      .range(de, de + PAGINA - 1)
    if (error) throw error

    const lote = (data ?? []) as unknown as BlocoLido[]
    for (const b of lote) out.push({ ...b, s: Number(b.s), fim: Number(b.fim) })
    // Página incompleta = acabou. Comparar com o total exigiria um count a
    // mais por página sem ganho nenhum.
    if (lote.length < PAGINA) break
  }
  return out
}
