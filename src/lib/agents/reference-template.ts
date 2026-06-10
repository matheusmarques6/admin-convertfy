/**
 * Fonte única do template de referência curado global
 * (`email_reference_templates`), por (flow × email).
 *
 * Compartilhado por dois consumidores que antes duplicavam a query:
 *  - `html/build-vars.ts` (HTML Agent) — fallback do `reference_html` quando
 *    não há reference por loja (`store_email_references`).
 *  - `architect/generate.service.ts` (Montador) — input/inspiração: o
 *    assembler usa o curado como guia de estrutura/estilo para escolher as
 *    variantes, sem copiar.
 *
 * Os dois papéis (input + fallback) são independentes e coexistem.
 */

import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * Retorna o HTML do template curado ativo para o (flow × email), ou `null`
 * se faltar flow/email ou não houver linha ativa. Pega o mais recente.
 */
export async function loadGlobalReferenceTemplate(
  admin: SupabaseClient,
  flowType: string | null,
  emailNumber: number | null,
): Promise<string | null> {
  if (!flowType || emailNumber == null) return null
  const { data } = await admin
    .from("email_reference_templates")
    .select("html")
    .eq("flow_type", flowType)
    .eq("email_number", emailNumber)
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  return ((data as { html?: string | null } | null)?.html as string | null) ?? null
}
