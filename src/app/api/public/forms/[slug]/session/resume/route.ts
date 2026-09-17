/**
 * GET /api/public/forms/[slug]/session/resume?token=…
 *
 * O link que o vendedor manda para quem abandonou. Devolve as respostas
 * já dadas e onde a pessoa parou, para o formulário abrir DALI — pedir
 * que ela recomece do zero é o jeito mais rápido de perdê-la de novo.
 *
 * O token viaja em CLARO no link (é isso que um link é) e o banco guarda
 * só o SHA-256: vazamento do banco não vira acesso às sessões. E ele é
 * de uso contínuo, não único — a pessoa pode abrir o link duas vezes,
 * trocar de aparelho, ou clicar de novo dias depois dentro da validade.
 *
 * Nunca diz se o token existe: token vencido, token inventado e sessão
 * apagada devolvem a MESMA resposta. Distinguir transformaria o endpoint
 * em sonda de tokens válidos.
 */

import { NextRequest } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { errorResponse, successResponse } from "@/lib/api/errors"
import { logger } from "@/lib/logger"
import { checkRateLimit } from "@/lib/rate-limit"
import { assinarTokenSessao, hashDeRetomada } from "@/lib/forms/session-token"

const log = logger.child("FormSessionResume")

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest, context: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await context.params

    // Teto baixo: o link é clicado uma vez. Acima disso é varredura.
    const limite = await checkRateLimit(request, `form-resume:${slug}`, { limit: 20, windowSeconds: 60 })
    if (limite) return limite

    const token = request.nextUrl.searchParams.get("token")
    if (!token) return successResponse(request, { retomavel: false })

    const admin = createAdminClient()
    const { data: sessao } = await admin
      .from("form_sessions")
      .select("id, form_id, answers, variables, hidden, current_field_ref, resume_expires_at, completed_at, status")
      .eq("resume_token_hash", hashDeRetomada(token))
      .limit(1)
      .maybeSingle()

    if (!sessao) return successResponse(request, { retomavel: false })

    const vencido = sessao.resume_expires_at ? Date.parse(sessao.resume_expires_at) < Date.now() : false
    if (vencido || sessao.completed_at) {
      // Já enviou ou o link venceu: não é erro, é o formulário começando
      // do zero. Dizer "expirado" não muda o que a pessoa pode fazer.
      return successResponse(request, { retomavel: false })
    }

    // O formulário tem de ser o do link. Sem isto, um token de um
    // formulário abriria a sessão dentro de outro.
    const { data: form } = await admin
      .from("crm_forms")
      .select("id, slug")
      .eq("id", sessao.form_id)
      .maybeSingle()
    if (!form || form.slug !== slug) return successResponse(request, { retomavel: false })

    // Marca a recuperação: é a métrica que diz se o link vale a pena.
    await admin.from("form_sessions").update({ recovered: true }).eq("id", sessao.id)

    return successResponse(request, {
      retomavel: true,
      session_id: sessao.id,
      // Token de ESCRITA novo: o de retomada é para abrir, não para
      // gravar, e ele vive num link que pode ser encaminhado.
      token: assinarTokenSessao(sessao.id),
      answers: sessao.answers ?? {},
      variables: sessao.variables ?? {},
      hidden: sessao.hidden ?? {},
      current_field_ref: sessao.current_field_ref,
    })
  } catch (error) {
    log.warn("resume.erro", { message: (error as Error)?.message })
    return errorResponse(request, error, "form-session-resume")
  }
}
