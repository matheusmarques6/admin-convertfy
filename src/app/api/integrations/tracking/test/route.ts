import { NextRequest, NextResponse } from "next/server"
import { corsHeaders, handleCorsPreFlight } from "@/lib/cors"
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

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin")

  try {
    const body = await request.json()
    const { carrier_id, api_key, tracking_number } = body

    if (!carrier_id) {
      return NextResponse.json(
        { success: false, error: "carrier_id \u00e9 obrigat\u00f3rio" },
        { status: 400, headers: corsHeaders(origin) }
      )
    }

    log.info("Testing tracking carrier", { carrier_id, hasApiKey: !!api_key, hasTrackingNumber: !!tracking_number })

    let result: TestResult

    switch (carrier_id) {
      case "cainiao":
        result = await testCainiao(tracking_number)
        break
      case "trackingmore":
        result = await testTrackingMore(api_key, tracking_number)
        break
      case "postnl":
        result = await testPostNL(api_key, tracking_number)
        break
      case "seventeen_track":
        result = await testSeventeenTrack(api_key)
        break
      default:
        return NextResponse.json(
          { success: false, error: `Transportadora desconhecida: ${carrier_id}` },
          { status: 400, headers: corsHeaders(origin) }
        )
    }

    return NextResponse.json(result, { headers: corsHeaders(origin) })
  } catch (error) {
    log.error("Error testing tracking carrier:", error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Erro ao testar conex\u00e3o" },
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
      // First test: can we reach the Cainiao API at all?
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

      // Even if we don't get tracking data, the API responding means connectivity works
      if (data?.module) {
        const cainiaoModule = data.module[0]

        if (cainiaoModule?.detailList && cainiaoModule.detailList.length > 0) {
          // Found real tracking data
          const result = await trackViaCainiao(num)
          return {
            success: true,
            carrier: "Cainiao",
            message: `Conex\u00e3o OK! Rastreamento encontrado com ${result?.events?.length || 0} evento(s)`,
            details: {
              tracking_number: num,
              carrier_detected: result?.carrier_name || cainiaoModule.carrierName || "Cainiao",
              status: result?.status || "unknown",
              events_count: result?.events?.length || 0,
              last_event: result?.last_event || undefined,
              response_time_ms: responseTime,
            },
          }
        }

        // API responded but no data for this number
        return {
          success: true,
          carrier: "Cainiao",
          message: trackingNumber
            ? `Conex\u00e3o OK! API respondeu mas n\u00e3o encontrou dados para "${num}". Verifique se o c\u00f3digo est\u00e1 correto.`
            : `Conex\u00e3o OK! API Cainiao est\u00e1 acess\u00edvel e respondendo (${responseTime}ms).`,
          details: {
            tracking_number: num,
            response_time_ms: responseTime,
          },
        }
      }

      // API responded with something unexpected
      return {
        success: true,
        carrier: "Cainiao",
        message: `Conex\u00e3o OK! API Cainiao respondeu em ${responseTime}ms.`,
        details: { response_time_ms: responseTime },
      }
    } catch (error) {
      const responseTime = Date.now() - startTime

      if (error instanceof DOMException && error.name === "TimeoutError") {
        return {
          success: false,
          carrier: "Cainiao",
          message: "Timeout: API Cainiao n\u00e3o respondeu em 15 segundos",
          details: { response_time_ms: responseTime },
        }
      }

      // Network error - continue to next sample number
      log.warn("Cainiao test failed for number", { num, error })
      continue
    }
  }

  return {
    success: false,
    carrier: "Cainiao",
    message: "N\u00e3o foi poss\u00edvel conectar \u00e0 API Cainiao. Verifique sua conex\u00e3o de rede.",
  }
}

async function testTrackingMore(apiKey?: string, trackingNumber?: string): Promise<TestResult> {
  if (!apiKey) {
    return {
      success: false,
      carrier: "TrackingMore",
      message: "API Key \u00e9 obrigat\u00f3ria para testar o TrackingMore",
    }
  }

  const startTime = Date.now()

  try {
    // Test by detecting courier for a known number
    const testNumber = trackingNumber || "LP00228026498498"
    const result = await trackViaTrackingMore(testNumber, apiKey)
    const responseTime = Date.now() - startTime

    if (result) {
      return {
        success: true,
        carrier: "TrackingMore",
        message: `Conex\u00e3o OK! API Key v\u00e1lida. ${result.events.length} evento(s) encontrado(s).`,
        details: {
          tracking_number: testNumber,
          carrier_detected: result.carrier_name || undefined,
          status: result.status,
          events_count: result.events.length,
          last_event: result.last_event || undefined,
          response_time_ms: responseTime,
        },
      }
    }

    // API responded but no tracking - key might still be valid
    // Try a simple detect call
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
          message: `Conex\u00e3o OK! API Key v\u00e1lida. Detec\u00e7\u00e3o de transportadora funcionando.`,
          details: { response_time_ms: detectTime },
        }
      }
    }

    if (detectResponse.status === 401) {
      return {
        success: false,
        carrier: "TrackingMore",
        message: "API Key inv\u00e1lida. Verifique sua chave no painel do TrackingMore.",
        details: { response_time_ms: detectTime },
      }
    }

    return {
      success: false,
      carrier: "TrackingMore",
      message: `API retornou status ${detectResponse.status}. Verifique sua API Key.`,
      details: { response_time_ms: detectTime },
    }
  } catch (error) {
    const responseTime = Date.now() - startTime
    return {
      success: false,
      carrier: "TrackingMore",
      message: error instanceof Error ? error.message : "Erro ao conectar ao TrackingMore",
      details: { response_time_ms: responseTime },
    }
  }
}

async function testPostNL(apiKey?: string, trackingNumber?: string): Promise<TestResult> {
  if (!apiKey) {
    return {
      success: false,
      carrier: "PostNL",
      message: "API Key \u00e9 obrigat\u00f3ria para testar o PostNL",
    }
  }

  if (!trackingNumber) {
    return {
      success: false,
      carrier: "PostNL",
      message: "Informe um n\u00famero de rastreio PostNL para testar (ex: 3STEST123456789)",
    }
  }

  const startTime = Date.now()

  try {
    const result = await trackViaPostNL(trackingNumber, apiKey)
    const responseTime = Date.now() - startTime

    if (result) {
      return {
        success: true,
        carrier: "PostNL",
        message: `Conex\u00e3o OK! ${result.events.length} evento(s) encontrado(s).`,
        details: {
          tracking_number: trackingNumber,
          status: result.status,
          events_count: result.events.length,
          last_event: result.last_event || undefined,
          response_time_ms: responseTime,
        },
      }
    }

    return {
      success: false,
      carrier: "PostNL",
      message: "API Key pode ser inv\u00e1lida ou n\u00famero de rastreio n\u00e3o encontrado.",
      details: { response_time_ms: responseTime },
    }
  } catch (error) {
    const responseTime = Date.now() - startTime
    return {
      success: false,
      carrier: "PostNL",
      message: error instanceof Error ? error.message : "Erro ao conectar ao PostNL",
      details: { response_time_ms: responseTime },
    }
  }
}

async function testSeventeenTrack(apiKey?: string): Promise<TestResult> {
  if (!apiKey) {
    return {
      success: false,
      carrier: "17track",
      message: "API Key \u00e9 obrigat\u00f3ria para testar o 17track",
    }
  }

  const startTime = Date.now()

  try {
    // Test the API key by registering a known tracking number
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
        message: "API Key inv\u00e1lida. Verifique sua chave em 17track.net/apiuser.",
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
          message: `Conex\u00e3o OK! API Key v\u00e1lida (${responseTime}ms).`,
          details: { response_time_ms: responseTime },
        }
      }

      // Code -18010001 means "Unauthorized" from 17track
      if (data.code === -18010001) {
        return {
          success: false,
          carrier: "17track",
          message: "API Key inv\u00e1lida ou expirada.",
          details: { response_time_ms: responseTime },
        }
      }

      return {
        success: true,
        carrier: "17track",
        message: `Conex\u00e3o OK! API respondeu em ${responseTime}ms.`,
        details: { response_time_ms: responseTime },
      }
    }

    return {
      success: false,
      carrier: "17track",
      message: `API retornou status ${response.status}`,
      details: { response_time_ms: responseTime },
    }
  } catch (error) {
    const responseTime = Date.now() - startTime
    return {
      success: false,
      carrier: "17track",
      message: error instanceof Error ? error.message : "Erro ao conectar ao 17track",
      details: { response_time_ms: responseTime },
    }
  }
}
