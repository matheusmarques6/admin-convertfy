import { NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { errorResponse, successResponse, requireAuth, AppError } from "@/lib/api/errors"
import { requireStoreAccess } from "@/lib/api/require-store-access"
import {
  validateShopifyCredentials,
  validateKlaviyoCredentials,
  validateOmnisendCredentials,
} from "@/lib/services/credential-validator.service"
import { getStoreCredentials } from "@/lib/services/credentials.service"
import { logger } from "@/lib/logger"

const log = logger.child("CredentialsTest")

export const maxDuration = 30

/**
 * POST /api/client-stores/credentials/test
 *
 * Testa UMA integracao especifica em tempo real. Usa as credenciais salvas
 * no banco (se existirem) ou as enviadas no payload (pre-save dry run).
 *
 * Body:
 *   {
 *     store_id: string,
 *     integration: "shopify" | "klaviyo" | "omnisend",
 *     payload?: {
 *       // opcional: credenciais a testar antes de salvar
 *       shopify_store_domain?: string
 *       shopify_access_token?: string
 *       klaviyo_private_key?: string
 *       omnisend_api_key?: string
 *     }
 *   }
 *
 * Resposta:
 *   {
 *     valid: boolean,
 *     message: string,
 *     details?: any  // account info, shop info, etc
 *   }
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const user = await requireAuth(supabase)
    const body = await request.json()
    const { store_id, integration, payload } = body

    if (!store_id) throw new AppError("store_id e obrigatorio", 400)
    if (!integration) throw new AppError("integration e obrigatorio", 400)

    await requireStoreAccess(store_id, user.id)

    // Busca credenciais salvas se payload nao fornecido
    const saved = payload ? null : await getStoreCredentials(store_id)

    switch (integration) {
      case "shopify": {
        const domain = payload?.shopify_store_domain ?? saved?.shopify_store_domain
        const token = payload?.shopify_access_token ?? saved?.shopify_access_token
        if (!domain || !token) {
          return successResponse(request, {
            valid: false,
            message: "Dominio e token sao obrigatorios para testar Shopify.",
          })
        }
        const result = await validateShopifyCredentials(String(domain), String(token))
        return successResponse(request, {
          valid: result.valid,
          message: result.valid
            ? `Conectado com sucesso a ${domain}`
            : result.error || "Credenciais invalidas.",
          details: { tested_at: result.tested_at },
        })
      }

      case "klaviyo": {
        const key = payload?.klaviyo_private_key ?? saved?.klaviyo_private_key
        if (!key) {
          return successResponse(request, {
            valid: false,
            message: "Private API Key e obrigatoria para testar Klaviyo.",
          })
        }
        const result = await validateKlaviyoCredentials(String(key))
        return successResponse(request, {
          valid: result.valid,
          message: result.valid
            ? "Credenciais Klaviyo validas"
            : result.error || "Credenciais invalidas.",
          details: {
            tested_at: result.tested_at,
            hasReportingAccess: result.hasReportingAccess,
            missingScopes: result.missingScopes,
          },
        })
      }

      case "omnisend": {
        const key = payload?.omnisend_api_key ?? saved?.omnisend_api_key
        if (!key) {
          return successResponse(request, {
            valid: false,
            message: "API Key e obrigatoria para testar Omnisend.",
          })
        }
        const result = await validateOmnisendCredentials(String(key))
        return successResponse(request, {
          valid: result.valid,
          message: result.valid
            ? "Credenciais Omnisend validas"
            : result.error || "Credenciais invalidas.",
          details: {
            tested_at: result.tested_at,
            hasReportingAccess: result.hasReportingAccess,
          },
        })
      }

      case "ga4":
      case "meta":
      case "google_ads":
        return successResponse(request, {
          valid: false,
          message: "Teste nao disponivel para esta integracao ainda.",
        })

      default:
        throw new AppError(`Integracao '${integration}' nao suportada`, 400)
    }
  } catch (error) {
    log.error("Test error", { error })
    return errorResponse(request, error, "credentials.test")
  }
}
