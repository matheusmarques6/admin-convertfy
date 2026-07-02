"use client"

import { SWRConfig } from "swr"
import { apiFetcher } from "@/lib/hooks/use-api-data"

/**
 * Config global de SWR. Componentes podem sobrescrever qualquer opção
 * localmente; isto define os defaults para toda a árvore:
 * - fetcher padrão (permite useSWR("/api/...") sem fetcher inline)
 * - dedupe de 30s (requests idênticos entre componentes/abas colapsam em 1)
 * - sem revalidação ao focar a janela (evita rajadas de refetch ao alt-tab)
 */
export function SWRProvider({ children }: { children: React.ReactNode }) {
  return (
    <SWRConfig
      value={{
        fetcher: apiFetcher,
        revalidateOnFocus: false,
        revalidateOnReconnect: true,
        dedupingInterval: 30_000,
        errorRetryCount: 2,
        keepPreviousData: true,
      }}
    >
      {children}
    </SWRConfig>
  )
}
