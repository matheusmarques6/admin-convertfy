import { NextRequest, NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"

const log = logger.child("GoogleAuthorize")

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Verify authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.redirect(new URL("/login", request.url))
    }

    const searchParams = request.nextUrl.searchParams
    const scope = searchParams.get("scope") || "ads"
    const storeId = searchParams.get("store_id")
    const context = searchParams.get("context") || "admin" // AC 42.3.1
    // target=org conecta a conta Google compartilhada da organizacao ("convertfy"),
    // que concentra todas as reunioes de clientes. Só admin/dev/coo podem.
    const target = searchParams.get("target") // null | "org"
    // Pagina para voltar apos o OAuth (preserva o contexto do app + modal).
    // Sanitizado: so aceita caminhos internos, evitando open redirect.
    const rawReturnTo = searchParams.get("return_to") || ""
    const returnTo =
      rawReturnTo.startsWith("/admin") || rawReturnTo.startsWith("/client")
        ? rawReturnTo
        : ""

    // Define scopes based on integration type
    const scopes: string[] = [
      "https://www.googleapis.com/auth/userinfo.email",
      "https://www.googleapis.com/auth/userinfo.profile",
    ]

    if (scope === "calendar" || scope === "all") {
      scopes.push(
        "https://www.googleapis.com/auth/calendar",
        "https://www.googleapis.com/auth/calendar.events"
      )
    }

    if (scope === "ads" || scope === "all") {
      scopes.push("https://www.googleapis.com/auth/adwords")
    }

    // [M1] Resolve org_id conditionally based on context
    let orgId = ""
    if (context === "portal") {
      // Portal users are NOT in org_members — resolve via client_portal_users -> clients
      const adminClient = createAdminClient()
      const { data: portalUser } = await adminClient
        .from("client_portal_users")
        .select("clients(org_id)")
        .eq("auth_user_id", user.id)
        .single()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      orgId = (portalUser?.clients as any)?.org_id || ""
    } else {
      // org_members usa profile_id (= auth.uid, pois profiles.id = auth.uid).
      const { data: orgMember } = await supabase
        .from("org_members")
        .select("org_id, role")
        .eq("profile_id", user.id)
        .eq("is_active", true)
        .maybeSingle()
      orgId = orgMember?.org_id || ""

      // Conectar a conta central da org exige papel de gestao
      if (target === "org") {
        const ORG_CONNECT_ROLES = ["admin", "dev", "coo", "owner"]
        if (!orgMember?.role || !ORG_CONNECT_ROLES.includes(orgMember.role)) {
          log.warn("Non-admin tried to connect org Google account", { userId: user.id, role: orgMember?.role })
          const denyReturn =
            returnTo && returnTo.startsWith("/admin") ? returnTo : "/admin/dashboard"
          const denyUrl = new URL(denyReturn, "http://local")
          denyUrl.searchParams.set("settings", "integrations")
          denyUrl.searchParams.set("error", "forbidden_org_connect")
          return NextResponse.redirect(new URL(denyUrl.pathname + denyUrl.search, request.url))
        }
      }
    }

    // Dono do token: conta compartilhada da org (target=org) usa user_type='org'
    // e user_id=org_id; senao segue o padrao por-usuario.
    const tokenUserType = target === "org"
      ? "org"
      : context === "portal"
        ? "portal_user"
        : "profile"
    const tokenUserId = target === "org" ? orgId : user.id

    // Calendar precisa de org_id (coluna NOT NULL em user_google_tokens).
    // Falha cedo com mensagem clara em vez de estourar no callback.
    if ((scope === "calendar" || scope === "all") && !orgId) {
      log.error("Cannot resolve org_id for calendar OAuth", { userId: user.id, context })
      const noOrgReturn =
        returnTo && returnTo.startsWith("/admin") ? returnTo : "/admin/dashboard"
      const noOrgUrl = new URL(noOrgReturn, "http://local")
      noOrgUrl.searchParams.set("settings", "integrations")
      noOrgUrl.searchParams.set("error", "no_org")
      return NextResponse.redirect(new URL(noOrgUrl.pathname + noOrgUrl.search, request.url))
    }

    // Generate state for CSRF protection with cryptographic nonce (C2)
    const state = Buffer.from(
      JSON.stringify({
        user_id: tokenUserId,
        user_type: tokenUserType,
        scope,
        org_id: orgId,
        store_id: storeId || "",
        target: target || "",
        return_to: returnTo,
        nonce: crypto.randomUUID(), // AC 42.3.2 — C2 anti-CSRF nonce
        timestamp: Date.now(),
        context,
      })
    ).toString("base64")

    // Store state in cookie for validation
    const response = NextResponse.redirect(
      `${GOOGLE_AUTH_URL}?` +
        new URLSearchParams({
          client_id: process.env.GOOGLE_CLIENT_ID!,
          redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/integrations/google/callback`,
          response_type: "code",
          scope: scopes.join(" "),
          access_type: "offline",
          prompt: "consent", // AC 42.3.6 — ensures refresh_token
          state,
        }).toString()
    )

    response.cookies.set("google_oauth_state", state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 600, // 10 minutes
    })

    return response
  } catch (error) {
    log.error("Error initiating Google OAuth:", error)
    return NextResponse.redirect(
      new URL("/settings/integrations?error=oauth_init_failed", request.url)
    )
  }
}
