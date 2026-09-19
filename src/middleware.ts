import { NextResponse, type NextRequest } from "next/server"
import { updateSession } from "@/lib/supabase/middleware"
import {
  caminhoServidoNoHostDeFormularios,
  chegouPeloHostDeFormularios,
  destinoNoHostDeFormularios,
  origemVigente,
} from "@/lib/forms/dominio"

// Routes that must be embeddable in iframes (widget preview + external stores)
const EMBEDDABLE_ROUTES = ["/tracking/embed", "/api/script/"]

function isEmbeddableRoute(pathname: string): boolean {
  return EMBEDDABLE_ROUTES.some((route) => pathname.startsWith(route))
}

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl
  const host = request.headers.get("host")

  // ── Domínio próprio dos formulários ───────────────────────────────────
  // Superfície FECHADA: só o formulário público, as APIs dele, o script de
  // embed e os estáticos existem neste host. Login, admin, portal e API
  // interna respondem 404 ANTES de qualquer rota rodar — a régua mora em
  // `lib/forms/dominio.ts`, com teste.
  //
  // O host é reconhecido pela variável `NEXT_PUBLIC_FORMS_ORIGIN` OU pela
  // convenção `forms.<apex>`: a variável só entra no bundle num deploy
  // posterior a ela, e foi assim que `forms.convertfy.me` passou a servir
  // o admin no dia em que o domínio foi conectado.
  if (chegouPeloHostDeFormularios(host)) {
    if (!caminhoServidoNoHostDeFormularios(pathname)) {
      return new NextResponse("Not found", {
        status: 404,
        headers: { "X-Robots-Tag": "noindex", "Cache-Control": "no-store" },
      })
    }
    const response = NextResponse.next()
    // O formulário é feito para ser embutido em site de cliente.
    response.headers.set("Content-Security-Policy", "frame-ancestors *")
    response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin")
    return response
  }

  // Página de formulário aberta pelo host do admin com domínio próprio
  // (pinado ou por convenção) → 308 para o domínio próprio. Só a PÁGINA:
  // a API pública continua respondendo aqui, porque os embeds antigos em
  // sites de clientes ainda apontam para este host e o iframe segue o
  // redirect.
  const destino = destinoNoHostDeFormularios({
    pathname,
    search,
    host,
    origemConfigurada: origemVigente(host),
  })
  if (destino) {
    return NextResponse.redirect(destino, 308)
  }

  // Embeddable routes — skip auth, allow iframes
  if (isEmbeddableRoute(pathname)) {
    const response = NextResponse.next()
    response.headers.set(
      "Content-Security-Policy",
      "frame-ancestors *"
    )
    return response
  }

  // O formulário público no host do admin (sem domínio próprio): sem
  // sessão e embutível — é o que o script de embed já fazia por omissão
  // antes de o caminho entrar no matcher.
  if (pathname.startsWith("/forms/") || pathname.startsWith("/api/public/forms/")) {
    const response = NextResponse.next()
    response.headers.set("Content-Security-Policy", "frame-ancestors *")
    return response
  }

  // All other routes — block iframes
  const response = await updateSession(request)
  response.headers.set("X-Frame-Options", "DENY")
  response.headers.set(
    "Content-Security-Policy",
    "frame-ancestors 'none'"
  )
  return response
}

export const config = {
  matcher: [
    /*
     * Match paths that need auth checking + embeddable routes for frame headers.
     * Excludes: static files (_next/static, _next/image, favicon.ico)
     *
     * `/forms` e `/api` entram para que o host de formulários consiga
     * RECUSAR o que não é dele (o middleware só decide sobre o que casa).
     * Em `/api/*` o `updateSession` já devolve `next()` sem tocar em auth.
     */
    "/",
    "/admin/:path*",
    "/print/:path*",
    "/client/:path*",
    "/login",
    "/register",
    "/change-password",
    "/public/:path*",
    "/track/:path*",
    "/tracking/embed",
    "/forms/:path*",
    "/api/:path*",
  ],
}
