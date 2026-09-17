"use client"

/**
 * Os pixels de browser dos formulários públicos — um lugar só, para os
 * dois renderizadores.
 *
 * Isto existe porque o conversacional nasceu SEM pixel nenhum: nem o
 * `PageView` no mount, nem o `Lead`/qualificado no sucesso, nem o
 * `_fbc`/`_fbp` no corpo do submit. O servidor continuava mandando a
 * CAPI, então nada falhava em tela — e o efeito era o pior possível na
 * página que recebe a verba:
 *
 * - **sem `PageView`**, a Meta não vê a visita: nada de público de
 *   retargeting, nada de otimização por quem chegou e não enviou;
 * - **sem o evento no browser**, some a redundância que este repositório
 *   decidiu manter de propósito (commit 0a206f73, revertido em 21d5ee7d):
 *   pixel e CAPI mandam o MESMO nome e o MESMO `event_id`, a Meta
 *   deduplica e conta uma conversão — e houve caso real de o navegador
 *   registrar um lead que a CAPI não registrou;
 * - **sem `_fbc`**, o clique pago perde a chave determinística de
 *   correspondência. O `_fbc` deriva do `fbclid` da URL do anúncio; é
 *   ele que liga a conversão ao clique.
 *
 * Duplicar o disparo no segundo renderizador seria a mesma armadilha de
 * sempre: dois detectores divergem no primeiro ajuste. Quem dispara é
 * esta função, chamada dos dois lados.
 */

import { useEffect } from "react"
import {
  ensureFbc,
  ensureFbp,
  fireGtagConversion,
  fireMetaEvent,
  loadGtag,
  loadMetaPixel,
  setMetaUserData,
} from "@/lib/tracking/browser-pixels"
import type { MetaAdvancedMatching } from "@/types/form-tracking"

/** Descritor de tracking retornado pelo GET público (sem token/regras). */
export interface FormTracking {
  meta_browser_pixel: boolean
  meta_pixel_id: string | null
  google_enabled: boolean
  google_ads_id: string | null
  google_ads_conversion_label: string | null
}

/** Resposta de tracking do submit — event ids p/ deduplicar com o browser. */
export interface SubmitTracking {
  event_id: string | null
  qualified: boolean
  qualified_event_id: string | null
  qualified_event_name: string | null
  /** Advanced matching do lead — presente SÓ quando qualified. */
  qualified_user_data?: MetaAdvancedMatching | null
  /** Params do evento custom (lead_source, company, utm_*, custom fields). */
  qualified_custom_data?: Record<string, unknown> | null
}

/**
 * Carrega os pixels uma vez, no mount, e dispara o `PageView`.
 *
 * O preview do editor nunca dispara pixel real — senão editar o
 * formulário inflaria a visita da campanha.
 */
export function useFormPixels(tracking: FormTracking | undefined, preview = false): void {
  useEffect(() => {
    if (preview || !tracking) return
    if (tracking.meta_browser_pixel && tracking.meta_pixel_id) {
      loadMetaPixel(tracking.meta_pixel_id)
      fireMetaEvent("PageView")
    }
    if (tracking.google_enabled && tracking.google_ads_id) {
      loadGtag(tracking.google_ads_id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}

/**
 * O `_fbc`/`_fbp` que vão no corpo do submit e de lá para a CAPI.
 *
 * `ensureFbp` GERA o cookie quando o ad-blocker impediu o fbevents de
 * criá-lo, e `ensureFbc` deriva do `fbclid` da URL: sem os dois, o
 * evento do servidor chega sem chave de correspondência.
 */
export function matchingDoBrowser(fbclid: string | null | undefined): {
  fbc: string | null
  fbp: string | null
} {
  return { fbc: ensureFbc(fbclid), fbp: ensureFbp() }
}

/** Dispara os pixels de conversão no sucesso do submit. */
export function fireConversionPixels(
  tracking: FormTracking | undefined,
  submit: SubmitTracking | undefined,
): void {
  if (!tracking) return
  // Meta: evento Lead (deduplicado por event_id) + qualificado se aplicável.
  if (tracking.meta_browser_pixel && tracking.meta_pixel_id) {
    // "Lead" comum sai antes do advanced matching — permanece anônimo do
    // lado do browser, como sempre foi.
    fireMetaEvent("Lead", { eventId: submit?.event_id ?? undefined })
    if (submit?.qualified && submit.qualified_event_name) {
      // Só o evento qualificado carrega os dados do lead: re-init do pixel
      // com o advanced matching (o fbevents hasheia no browser) e params
      // de contexto (origem, empresa, UTMs) no próprio evento.
      if (submit.qualified_user_data) {
        setMetaUserData(tracking.meta_pixel_id, submit.qualified_user_data)
      }
      fireMetaEvent(submit.qualified_event_name, {
        eventId: submit.qualified_event_id ?? undefined,
        custom: true,
        params: submit.qualified_custom_data ?? undefined,
      })
    }
  }
  // Google Ads: conversão via gtag ("AW-XXXX/label").
  if (
    tracking.google_enabled &&
    tracking.google_ads_id &&
    tracking.google_ads_conversion_label
  ) {
    fireGtagConversion(`${tracking.google_ads_id}/${tracking.google_ads_conversion_label}`)
  }
}
