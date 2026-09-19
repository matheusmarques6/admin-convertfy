/**
 * GET /api/public/forms/[slug]
 *
 * Retorna o form público (publicado) + fields + schema para renderizar a
 * página de captação. NÃO exige auth — acessível por anon.
 *
 * A leitura mora em `public-form.service` (cacheada por slug) e é a MESMA
 * da página `/forms/[slug]`, que deixou de chamar esta rota por HTTP:
 * eram dois saltos de lambda por visita para o mesmo código. A rota fica
 * para quem a consome de fora (embed, integrações) e para o host de
 * formulários, que a serve.
 *
 * Importante: o serviço filtra status='published' para evitar expor
 * forms em rascunho. RLS não se aplica (admin client server-side).
 */

import { after, NextRequest } from "next/server"
import { errorResponse, successResponse, AppError } from "@/lib/api/errors"
import { carregarFormularioPublico, contarVisitaDoFormulario } from "@/lib/services/public-form.service"
import { logger } from "@/lib/logger"

const log = logger.child("PublicForms")

export const dynamic = "force-dynamic"

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await context.params
    const data = await carregarFormularioPublico(slug)
    if (!data) throw new AppError("Form nao encontrado", 404, "not-found")

    // A visita conta DEPOIS de a resposta sair: `after()` mantém a função
    // viva até o UPDATE terminar sem o visitante esperar por ele.
    const formId = data.form.id
    after(() => contarVisitaDoFormulario(formId))

    return successResponse(request, data)
  } catch (error) {
    log.error("Public form GET error:", error)
    return errorResponse(request, error, "public-form-get")
  }
}
