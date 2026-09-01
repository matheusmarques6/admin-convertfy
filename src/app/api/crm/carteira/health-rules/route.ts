/**
 * GET/PUT /api/crm/carteira/health-rules — regras editáveis do health
 * score de loja (pesos dos componentes, faixas da carteira, limiares de
 * alerta). Persistidas na tabela `settings` (key/value JSONB, zero
 * migration); defaults em código. O painel "Regras do score" da Gestão
 * de Carteira consome daqui.
 *
 * O PUT sanitiza SEMPRE (sanitizeStoreHealthRules nunca lança — campo
 * inválido cai no default e invariantes são restauradas), então o que
 * volta na resposta é o que valeu de fato.
 */

import { NextRequest } from "next/server"
import { withTiming } from "@/lib/api/with-timing"
import { createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import {
  getStoreHealthRules,
  saveStoreHealthRules,
} from "@/lib/services/store-health-rules.service"
import { DEFAULT_STORE_HEALTH_RULES } from "@/lib/services/store-health-rules"

export const dynamic = "force-dynamic"

async function handleGet(request: NextRequest) {
  try {
    const sb = await createClient()
    await requireAuth(sb)
    const rules = await getStoreHealthRules()
    return successResponse(request, { rules, defaults: DEFAULT_STORE_HEALTH_RULES })
  } catch (error) {
    return errorResponse(request, error, "carteira-health-rules-get")
  }
}

async function handlePut(request: NextRequest) {
  try {
    const sb = await createClient()
    await requireAuth(sb)
    const body = await request.json()
    const rules = await saveStoreHealthRules(body)
    return successResponse(request, { rules, defaults: DEFAULT_STORE_HEALTH_RULES })
  } catch (error) {
    return errorResponse(request, error, "carteira-health-rules-put")
  }
}

export const GET = withTiming("crm/carteira/health-rules", handleGet)
export const PUT = withTiming("crm/carteira/health-rules", handlePut)
