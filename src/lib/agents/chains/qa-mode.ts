export type QaMode = "off" | "shadow" | "enforce"

/** `EMAIL_QA_ENABLED=true` permanece como alias legado de `enforce`. */
export function getQaMode(
  env: Record<string, string | undefined> = process.env,
): QaMode {
  const configured = env.EMAIL_QA_MODE?.trim().toLowerCase()
  if (configured === "off" || configured === "shadow" || configured === "enforce") return configured
  return env.EMAIL_QA_ENABLED === "true" ? "enforce" : "off"
}
