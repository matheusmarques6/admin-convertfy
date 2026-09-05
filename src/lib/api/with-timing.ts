import { logger } from "@/lib/logger"

const log = logger.child("ApiTiming")

/** Requests acima deste limiar são logados como warn para facilitar triagem. */
const SLOW_REQUEST_MS = 1_000

type RouteHandler<Req extends Request, Ctx> = (
  request: Req,
  context: Ctx
) => Promise<Response> | Response

/**
 * Mede a duração total de um route handler e loga rota, método, status e
 * duration_ms em formato estruturado (JSON em produção via logger).
 *
 * Uso:
 *   async function handleGet(request: NextRequest) { ... }
 *   export const GET = withTiming("portal/dashboard", handleGet)
 *
 * O nome da rota é fixo (não derivado da URL) para agrupar corretamente
 * rotas dinâmicas ([id]) nos logs.
 */
export function withTiming<Req extends Request = Request, Ctx = unknown>(
  route: string,
  handler: RouteHandler<Req, Ctx>,
  /**
   * Limiar de "slow request" desta rota. O padrão (1 s) é para rota que
   * lê o banco; agregadores que chamam API externa AO VIVO (Klaviyo,
   * Omnisend) levam 10–30 s por natureza e viravam warn em TODA chamada,
   * escondendo as lentidões que importam.
   */
  opts: { slowMs?: number } = {},
): RouteHandler<Req, Ctx> {
  const slowMs = opts.slowMs ?? SLOW_REQUEST_MS
  return async (request, context) => {
    const start = Date.now()
    let status = 500

    try {
      const response = await handler(request, context)
      status = response.status
      return response
    } finally {
      const durationMs = Date.now() - start
      const entry = {
        route,
        method: request.method,
        status,
        duration_ms: durationMs,
      }

      if (durationMs >= slowMs) {
        log.warn("slow request", entry)
      } else {
        log.info("request", entry)
      }
    }
  }
}
