/**
 * loadTopProducts — fonte ÚNICA de "top products" para a geração de emails.
 *
 * Antes, cada etapa (imagem/HTML/copy-fallback) lia o snapshot estático
 * `store_brand_identity.top_products`, que depende de edição manual e costuma
 * ficar vazio — enquanto a tabela viva `store_top_products` (sincronizada pelo
 * webhook n8n) tem os produtos reais. Isso fazia o agente gerar "no escuro"
 * (PRODUTO_HEROI vazio → imagem genérica, copy com {{product_name}}).
 *
 * Este helper centraliza a leitura e o mapeamento (antes duplicado em
 * email-copy-webhook.service.ts): lê a tabela viva como fonte primária e cai
 * no snapshot só como fallback, sempre devolvendo o shape canônico
 * `TopProduct` (`name`, não `title`; `url` montada a partir de `handle`).
 */

import { createAdminClient } from "@/lib/supabase/server"
import type { TopProduct } from "@/types/email-workspace"

type AdminClient = ReturnType<typeof createAdminClient>

interface TopProductTableRow {
  rank: number
  title: string
  price: number | null
  currency: string | null
  handle: string | null
  external_id: string | null
  image_url: string | null
}

/** Mapeia uma linha de `store_top_products` para o shape canônico. */
function mapTableRow(p: TopProductTableRow, storeUrl: string | null): TopProduct {
  return {
    id: p.external_id ?? undefined,
    name: p.title,
    price: p.price ?? "",
    image_url: p.image_url ?? "",
    url: p.handle && storeUrl ? `${storeUrl}/products/${p.handle}` : undefined,
  }
}

/**
 * Carrega os top products da loja (máx 5, por rank).
 *
 * @param admin    cliente admin Supabase
 * @param storeId  id da loja
 * @param storeUrl url da loja (pra montar a URL do produto a partir do handle);
 *                 se null, `url` fica undefined
 */
export async function loadTopProducts(
  admin: AdminClient,
  storeId: string,
  storeUrl: string | null,
): Promise<TopProduct[]> {
  // 1. Fonte primária: tabela viva sincronizada.
  const { data: rows } = await admin
    .from("store_top_products")
    .select("rank, title, price, currency, handle, external_id, image_url")
    .eq("store_id", storeId)
    .order("rank", { ascending: true })
    .limit(5)

  if (rows && rows.length > 0) {
    return (rows as TopProductTableRow[]).map((p) => mapTableRow(p, storeUrl))
  }

  // 2. Fallback: snapshot estático em store_brand_identity (já canônico).
  const { data: bi } = await admin
    .from("store_brand_identity")
    .select("top_products")
    .eq("store_id", storeId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle()

  return ((bi?.top_products as TopProduct[] | undefined) ?? []) ?? []
}
