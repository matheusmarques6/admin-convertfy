import { NextRequest, NextResponse } from "next/server"
import { corsHeaders, handleCorsPreFlight } from "@/lib/cors"
import { createAdminClient } from "@/lib/supabase/server"
import { decrypt } from "@/lib/crypto"
import { logger } from "@/lib/logger"
import { trackViaCainiao, trackViaTrackingMore, trackViaPostNL } from "@/lib/tracking/carriers"

const log = logger.child("IntegrationsTrackingTest")

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request)
}

// Sample tracking numbers for testing connectivity
const SAMPLE_TRACKING_NUMBERS: Record<string, string[]> = {
  cainiao: [
    "LP00228026498498",     // Cainiao/AliExpress format
    "CAINIAO0123456789",    // Cainiao prefix
  ],
}

// Tradução de status para português
const STATUS_PT: Record<string, string> = {
  pending: "Pendente",
  in_transit: "Em trânsito",
  delivered: "Entregue",
  pick_up: "Retirada",
  out_for_delivery: "Saiu para entrega",
  undelivered: "Não entregue",
  expired: "Expirado",
  alert: "Alerta",
  unknown: "Desconhecido",
}

function translateStatus(status?: string): string {
  if (!status) return "Desconhecido"
  return STATUS_PT[status] || status
}

interface TestResult {
  success: boolean
  carrier: string
  message: string
  details?: {
    tracking_number?: string
    carrier_detected?: string
    status?: string
    events_count?: number
    last_event?: string
    response_time_ms?: number
  }
}

/**
 * Resolve the API key for a carrier: use provided key, or fetch from DB via store_id.
 * Uses decrypt() which handles the enc:v1: prefix automatically.
 */
async function resolveApiKey(
  carrierId: string,
  apiKey?: string,
  storeId?: string
): Promise<string | undefined> {
  // If key was provided directly, use it
  if (apiKey) return apiKey

  // If no store_id, can't look up from DB
  if (!storeId) return undefined

  try {
    const adminClient = createAdminClient()
    const { data: trackingStore } = await adminClient
      .from("tracking_stores")
      .select("seventeen_track_api_key, carrier_api_keys")
      .eq("client_store_id", storeId)
      .single()

    if (!trackingStore) return undefined

    // For 17track, check the dedicated column
    if (carrierId === "seventeen_track") {
      if (trackingStore.seventeen_track_api_key) {
        try {
          return decrypt(trackingStore.seventeen_track_api_key)
        } catch {
          log.warn("Falha ao descriptografar seventeen_track_api_key")
        }
      }
      return undefined
    }

    // For other carriers, check carrier_api_keys JSON
    const carrierKeys = (trackingStore.carrier_api_keys as Record<string, unknown>) || {}
    const storedKey = carrierKeys[carrierId]

    // Boolean keys (like cainiao: true) don't need decryption
    if (typeof storedKey === "boolean") return undefined

    if (typeof storedKey === "string" && storedKey) {
      try {
        // decrypt() handles both encrypted (enc:v1:...) and plain text values
        return decrypt(storedKey)
      } catch {
        log.warn(`Falha ao descriptografar chave do ${carrierId}`)
      }
    }

    return undefined
  } catch (error) {
    log.warn("Erro ao buscar chave da API no banco", { carrierId, error })
    return undefined
  }
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin")

  try {
    const body = await request.json()
    const { carrier_id, api_key, tracking_number, store_id } = body

    if (!carrier_id) {
      return NextResponse.json(
        { success: false, error: "carrier_id é obrigatório" },
        { status: 400, headers: corsHeaders(origin) }
      )
    }

    log.info("Testando transportadora", { carrier_id, hasApiKey: !!api_key, hasStoreId: !!store_id, hasTrackingNumber: !!tracking_number })

    // Resolve the actual API key (from request or from DB)
    const resolvedKey = await resolveApiKey(carrier_id, api_key, store_id)

    let result: TestResult

    switch (carrier_id) {
      case "cainiao":
        result = await testCainiao(tracking_number)
        break
      case "trackingmore":
        result = await testTrackingMore(resolvedKey, tracking_number)
        break
      case "postnl":
        result = await testPostNL(resolvedKey, tracking_number)
        break
      case "seventeen_track":
        result = await testSeventeenTrack(resolvedKey)
        break
      default:
        return NextResponse.json(
          { success: false, error: `Transportadora desconhecida: ${carrier_id}` },
          { status: 400, headers: corsHeaders(origin) }
        )
    }

    return NextResponse.json(result, { headers: corsHeaders(origin) })
  } catch (error) {
    log.error("Erro ao testar transportadora:", error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Erro ao testar conexão" },
      { status: 500, headers: corsHeaders(origin) }
    )
  }
}

async function testCainiao(trackingNumber?: string): Promise<TestResult> {
  const numbersToTry = trackingNumber
    ? [trackingNumber]
    : SAMPLE_TRACKING_NUMBERS.cainiao

  for (const num of numbersToTry) {
    const startTime = Date.now()

    try {
      const response = await fetch("https://global.cainiao.com/global/detail.json", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Accept": "application/json",
        },
        body: `mailNoList=${encodeURIComponent(num)}&language=en`,
        signal: AbortSignal.timeout(15000),
      })

      const responseTime = Date.now() - startTime

      if (!response.ok) {
        return {
          success: false,
          carrier: "Cainiao",
          message: `API Cainiao retornou erro HTTP ${response.status}`,
          details: { response_time_ms: responseTime },
        }
      }

      const data = await response.json()

      if (data?.module) {
        const cainiaoModule = data.module[0]

        if (cainiaoModule?.detailList && cainiaoModule.detailList.length > 0) {
          const result = await trackViaCainiao(num)
          return {
            success: true,
            carrier: "Cainiao",
            message: `Conexão OK! Rastreamento encontrado com ${result?.events?.length || 0} evento(s).`,
            details: {
              tracking_number: num,
              carrier_detected: result?.carrier_name || cainiaoModule.carrierName || "Cainiao",
              status: translateStatus(result?.status || "unknown"),
              events_count: result?.events?.length || 0,
              last_event: result?.last_event || undefined,
              response_time_ms: responseTime,
            },
          }
        }

        return {
          success: true,
          carrier: "Cainiao",
          message: trackingNumber
            ? `Conexão OK! A API respondeu mas não encontrou dados para "${num}". Verifique se o código está correto.`
            : `Conexão OK! API Cainiao está acessível e respondendo (${responseTime}ms).`,
          details: {
            tracking_number: num,
            response_time_ms: responseTime,
          },
        }
      }

      return {
        success: true,
        carrier: "Cainiao",
        message: `Conexão OK! API Cainiao respondeu em ${responseTime}ms.`,
        details: { response_time_ms: responseTime },
      }
    } catch (error) {
      const responseTime = Date.now() - startTime

      if (error instanceof DOMException && error.name === "TimeoutError") {
        return {
          success: false,
          carrier: "Cainiao",
          message: "Tempo esgotado: API Cainiao não respondeu em 15 segundos. Tente novamente.",
          details: { response_time_ms: responseTime },
        }
      }

      log.warn("Falha no teste Cainiao", { num, error })
      continue
    }
  }

  return {
    success: false,
    carrier: "Cainiao",
    message: "Não foi possível conectar à API Cainiao. Verifique sua conexão de rede e tente novamente.",
  }
}

async function testTrackingMore(apiKey?: string, trackingNumber?: string): Promise<TestResult> {
  if (!apiKey) {
    return {
      success: false,
      carrier: "TrackingMore",
      message: "API Key é obrigatória para testar o TrackingMore. Configure a chave primeiro.",
    }
  }

  const startTime = Date.now()

  try {
    const testNumber = trackingNumber || "LP00228026498498"
    const result = await trackViaTrackingMore(testNumber, apiKey)
    const responseTime = Date.now() - startTime

    if (result) {
      return {
        success: true,
        carrier: "TrackingMore",
        message: `Conexão OK! API Key válida. ${result.events.length} evento(s) encontrado(s).`,
        details: {
          tracking_number: testNumber,
          carrier_detected: result.carrier_name || undefined,
          status: translateStatus(result.status),
          events_count: result.events.length,
          last_event: result.last_event || undefined,
          response_time_ms: responseTime,
        },
      }
    }

    // API responded but no tracking - key might still be valid
    const detectResponse = await fetch("https://api.trackingmore.com/v4/couriers/detect", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Tracking-Api-Key": apiKey,
      },
      body: JSON.stringify({ tracking_number: testNumber }),
      signal: AbortSignal.timeout(15000),
    })

    const detectTime = Date.now() - startTime

    if (detectResponse.ok) {
      const detectData = await detectResponse.json()
      if (detectData.meta?.code === 200) {
        return {
          success: true,
          carrier: "TrackingMore",
          message: "Conexão OK! API Key válida. Detecção de transportadora funcionando.",
          details: { response_time_ms: detectTime },
        }
      }
    }

    if (detectResponse.status === 401) {
      return {
        success: false,
        carrier: "TrackingMore",
        message: "API Key inválida. Verifique sua chave no painel do TrackingMore.",
        details: { response_time_ms: detectTime },
      }
    }

    if (detectResponse.status === 429) {
      return {
        success: false,
        carrier: "TrackingMore",
        message: "Limite de requisições atingido. Aguarde alguns minutos e tente novamente.",
        details: { response_time_ms: detectTime },
      }
    }

    return {
      success: false,
      carrier: "TrackingMore",
      message: `A API retornou status ${detectResponse.status}. Verifique sua API Key.`,
      details: { response_time_ms: detectTime },
    }
  } catch (error) {
    const responseTime = Date.now() - startTime

    if (error instanceof DOMException && error.name === "TimeoutError") {
      return {
        success: false,
        carrier: "TrackingMore",
        message: "Tempo esgotado: API TrackingMore não respondeu em 15 segundos. Tente novamente.",
        details: { response_time_ms: responseTime },
      }
    }

    return {
      success: false,
      carrier: "TrackingMore",
      message: error instanceof Error ? error.message : "Erro ao conectar ao TrackingMore. Verifique sua conexão.",
      details: { response_time_ms: responseTime },
    }
  }
}

async function testPostNL(apiKey?: string, trackingNumber?: string): Promise<TestResult> {
  if (!apiKey) {
    return {
      success: false,
      carrier: "PostNL",
      message: "API Key é obrigatória para testar o PostNL. Configure a chave primeiro.",
    }
  }

  const startTime = Date.now()

  // Se não tem tracking number, tentar validar a chave com uma chamada simples
  if (!trackingNumber) {
    try {
      // Testar com um número fictício para validar a API key
      const response = await fetch(
        `https://api.postnl.nl/shipment/v2/status/barcode/3STEST000000000?detail=false`,
        {
          method: "GET",
          headers: {
            apikey: apiKey,
            Accept: "application/json",
          },
          signal: AbortSignal.timeout(15000),
        }
      )

      const responseTime = Date.now() - startTime

      if (response.status === 401) {
        return {
          success: false,
          carrier: "PostNL",
          message: "API Key inválida. Verifique sua chave no portal PostNL Developer.",
          details: { response_time_ms: responseTime },
        }
      }

      // 200 or 400/404 means the key is valid (just no data for test number)
      if (response.ok || response.status === 400 || response.status === 404) {
        return {
          success: true,
          carrier: "PostNL",
          message: `Conexão OK! API Key válida (${responseTime}ms). Para testar o rastreamento completo, informe um número de rastreio PostNL.`,
          details: { response_time_ms: responseTime },
        }
      }

      return {
        success: false,
        carrier: "PostNL",
        message: `A API retornou status ${response.status}. Verifique sua API Key.`,
        details: { response_time_ms: responseTime },
      }
    } catch (error) {
      const responseTime = Date.now() - startTime

      if (error instanceof DOMException && error.name === "TimeoutError") {
        return {
          success: false,
          carrier: "PostNL",
          message: "Tempo esgotado: API PostNL não respondeu em 15 segundos. Tente novamente.",
          details: { response_time_ms: responseTime },
        }
      }

      return {
        success: false,
        carrier: "PostNL",
        message: error instanceof Error ? error.message : "Erro ao conectar ao PostNL. Verifique sua conexão.",
        details: { response_time_ms: responseTime },
      }
    }
  }

  try {
    const result = await trackViaPostNL(trackingNumber, apiKey)
    const responseTime = Date.now() - startTime

    if (result) {
      return {
        success: true,
        carrier: "PostNL",
        message: `Conexão OK! ${result.events.length} evento(s) encontrado(s).`,
        details: {
          tracking_number: trackingNumber,
          status: translateStatus(result.status),
          events_count: result.events.length,
          last_event: result.last_event || undefined,
          response_time_ms: responseTime,
        },
      }
    }

    return {
      success: false,
      carrier: "PostNL",
      message: "API Key pode ser inválida ou número de rastreio não encontrado. Verifique os dados.",
      details: { response_time_ms: responseTime },
    }
  } catch (error) {
    const responseTime = Date.now() - startTime

    if (error instanceof DOMException && error.name === "TimeoutError") {
      return {
        success: false,
        carrier: "PostNL",
        message: "Tempo esgotado: API PostNL não respondeu em 15 segundos. Tente novamente.",
        details: { response_time_ms: responseTime },
      }
    }

    return {
      success: false,
      carrier: "PostNL",
      message: error instanceof Error ? error.message : "Erro ao conectar ao PostNL. Verifique sua conexão.",
      details: { response_time_ms: responseTime },
    }
  }
}

async function testSeventeenTrack(apiKey?: string): Promise<TestResult> {
  if (!apiKey) {
    return {
      success: false,
      carrier: "17track",
      message: "API Key é obrigatória para testar o 17track. Configure a chave primeiro.",
    }
  }

  const startTime = Date.now()

  try {
    const response = await fetch("https://api.17track.net/track/v2.2/gettrackinfo", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "17token": apiKey,
      },
      body: JSON.stringify([{ number: "TEST17TRACK000" }]),
      signal: AbortSignal.timeout(15000),
    })

    const responseTime = Date.now() - startTime

    if (response.status === 401 || response.status === 403) {
      return {
        success: false,
        carrier: "17track",
        message: "API Key inválida. Verifique sua chave em 17track.net/apiuser.",
        details: { response_time_ms: responseTime },
      }
    }

    if (response.ok) {
      const data = await response.json()

      // 17track returns code 0 for success, even if tracking not found
      if (data.code === 0 || data.code === undefined) {
        return {
          success: true,
          carrier: "17track",
          message: `Conexão OK! API Key válida (${responseTime}ms).`,
          details: { response_time_ms: responseTime },
        }
      }

      // Code -18010001 means "Unauthorized" from 17track
      if (data.code === -18010001) {
        return {
          success: false,
          carrier: "17track",
          message: "API Key inválida ou expirada. Gere uma nova chave em 17track.net/apiuser.",
          details: { response_time_ms: responseTime },
        }
      }

      return {
        success: true,
        carrier: "17track",
        message: `Conexão OK! API respondeu em ${responseTime}ms.`,
        details: { response_time_ms: responseTime },
      }
    }

    if (response.status === 429) {
      return {
        success: false,
        carrier: "17track",
        message: "Limite de requisições atingido. Aguarde alguns minutos e tente novamente.",
        details: { response_time_ms: responseTime },
      }
    }

    return {
      success: false,
      carrier: "17track",
      message: `A API retornou status ${response.status}. Verifique sua API Key.`,
      details: { response_time_ms: responseTime },
    }
  } catch (error) {
    const responseTime = Date.now() - startTime

    if (error instanceof DOMException && error.name === "TimeoutError") {
      return {
        success: false,
        carrier: "17track",
        message: "Tempo esgotado: API 17track não respondeu em 15 segundos. Tente novamente.",
        details: { response_time_ms: responseTime },
      }
    }

    return {
      success: false,
      carrier: "17track",
      message: error instanceof Error ? error.message : "Erro ao conectar ao 17track. Verifique sua conexão.",
      details: { response_time_ms: responseTime },
    }
  }
}
