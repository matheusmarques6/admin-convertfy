/**
 * Vercel Cron — lacunas da biblioteca propostas pela telemetria do Curador.
 *
 * Schedule: diário. Agrega `protocol_violations` + `posicoes_sem_variante`
 * das runs `assembler_chooser` de 14 dias e, a partir da 3ª ocorrência da
 * mesma chave, grava o rascunho em `vault_propostas` (aba Conhecimento →
 * "Lacunas propostas"). Ver `lacuna-draft.ts` para a régua.
 */

import { NextRequest, NextResponse } from "next/server"
import { requireCronAuth } from "@/lib/api/cron-auth"
import { createAdminClient } from "@/lib/supabase/server"
import { proporLacunas } from "@/lib/vault/vault-propostas.service"
import { logger } from "@/lib/logger"

const log = logger.child("CronVaultLacunas")

export const dynamic = "force-dynamic"
export const maxDuration = 120

export async function GET(request: NextRequest) {
  const authError = requireCronAuth(request)
  if (authError) return authError
  try {
    const r = await proporLacunas(createAdminClient())
    log.info("lacunas propostas", r)
    return NextResponse.json({ ok: !r.error, ...r })
  } catch (error) {
    // Cron de observabilidade que derruba a si mesmo não observa nada.
    const msg = error instanceof Error ? error.message : String(error)
    log.error("proposta de lacunas falhou", { error: msg })
    return NextResponse.json({ ok: false, error: msg }, { status: 200 })
  }
}
