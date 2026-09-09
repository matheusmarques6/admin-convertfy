export type QaMode = "off" | "shadow" | "enforce"

/**
 * O QA nasce em `shadow`: executa e registra a revisão sem bloquear a entrega.
 * `EMAIL_QA_ENABLED=true` permanece como alias legado de `enforce`.
 */
export function getQaMode(
  env: Record<string, string | undefined> = process.env,
): QaMode {
  const configured = env.EMAIL_QA_MODE?.trim().toLowerCase()
  if (configured === "off" || configured === "shadow" || configured === "enforce") return configured
  if (env.EMAIL_QA_ENABLED === "true") return "enforce"
  if (env.EMAIL_QA_ENABLED === "false") return "off"
  return "shadow"
}
