/**
 * GET /api/onboarding-help/[token]
 * Endpoint público (sem auth) que retorna o tutorial renderizado pra
 * o cliente, com variáveis ({{client_name}}, {{store_name}}, etc) já
 * substituídas.
 */

import { NextRequest, NextResponse } from "next/server"
import { renderTutorialByToken } from "@/lib/services/tutorial-page.service"

export const dynamic = "force-dynamic"

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await context.params
    const rendered = await renderTutorialByToken(token)
    if (!rendered) {
      return NextResponse.json(
        { error: "Tutorial não encontrado" },
        { status: 404 },
      )
    }
    return NextResponse.json({ success: true, ...rendered })
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 },
    )
  }
}
