import { NextRequest } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import {
  errorResponse,
  successResponse,
  requireAuth,
  AppError,
} from "@/lib/api/errors"
import { requireOnboardingPermission } from "@/lib/api/onboarding-permissions"
import {
  render,
  resolveColumnMessage,
} from "@/lib/services/onboarding-whatsapp.service"
import {
  classificarPendencias,
  formatarTelefone,
  labelDaVar,
  marcadorDaVar,
  motivoDoBloqueio,
} from "@/lib/onboarding/preview-do-avanco"

/**
 * GET /api/onboardings/[id]/advance/preview
 *
 * O que o avanco faria: pra qual coluna vai e, se essa coluna tiver mensagem,
 * o TEXTO EXATO que o cliente receberia — renderizado por
 * `resolveColumnMessage`, o mesmo caminho do envio.
 *
 * Nao escreve nada. Existe pra que autorizar a mensagem seja uma decisao
 * informada: ate 15/09/2026 ela saia sem ninguem ver o conteudo.
 */

export const dynamic = "force-dynamic"

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    const sb = await createClient()
    const user = await requireAuth(sb)
    await requireOnboardingPermission(user.id, "read")

    const admin = createAdminClient()
    const { data: onb } = await admin
      .from("onboardings")
      .select("id, status, pipeline_id, current_column_id")
      .eq("id", id)
      .maybeSingle()
    if (!onb) throw new AppError("Onboarding nao encontrado", 404)

    const { data: cols } = await admin
      .from("operational_pipeline_columns")
      .select("id, name, slug, position, is_final, whatsapp_template")
      .eq("pipeline_id", onb.pipeline_id)
      .order("position", { ascending: true })

    const lista = cols ?? []
    const idx = lista.findIndex((c) => c.id === onb.current_column_id)
    const atual = idx >= 0 ? lista[idx] : null
    const proxima = idx >= 0 ? (lista[idx + 1] ?? null) : null

    // Ultima coluna (ou marcada final): avancar CONCLUI o onboarding e nao ha
    // coluna de destino — logo nao ha mensagem a autorizar.
    const conclui = !proxima || atual?.is_final === true

    const base = {
      coluna_atual: atual?.name ?? null,
      proxima_coluna: proxima?.name ?? null,
      conclui,
      pode_avancar: onb.status === "in_progress",
    }

    if (conclui || !proxima) {
      return successResponse(request, { ...base, mensagem: null })
    }

    const msg = await resolveColumnMessage({
      onboardingId: id,
      columnId: proxima.id as string,
    })

    if (!msg || !msg.template) {
      return successResponse(request, { ...base, mensagem: null })
    }

    const { bloqueiam, resolvemNoAvanco } = classificarPendencias(
      msg.faltando,
      msg.columnSlug,
    )
    // O que o avanco vai criar aparece MARCADO, nao em branco: a linha vazia
    // e indistinguivel de template quebrado — e e exatamente a cara das
    // mensagens do incidente.
    const texto =
      resolvemNoAvanco.length > 0 && msg.vars
        ? render(msg.template, {
            ...msg.vars,
            ...Object.fromEntries(
              resolvemNoAvanco.map((v) => [v, marcadorDaVar(v)]),
            ),
          }).texto
        : msg.texto

    const bloqueio = motivoDoBloqueio({
      temTemplate: true,
      temTelefone: Boolean(msg.phone),
      bloqueiam,
    })

    return successResponse(request, {
      ...base,
      mensagem: {
        texto,
        destinatario: msg.clientName,
        telefone: formatarTelefone(msg.phone),
        pode_enviar: bloqueio === null,
        bloqueio,
        // Nao impedem o envio, mas a tela diz que estao vazias agora e por
        // que: o texto do preview mostra a lacuna, e sem esta linha ela
        // pareceria defeito.
        resolvem_no_avanco: resolvemNoAvanco.map((v) => ({
          variavel: v,
          label: labelDaVar(v),
        })),
      },
    })
  } catch (error) {
    return errorResponse(request, error, "onboarding-advance-preview")
  }
}
