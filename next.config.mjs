/** @type {import('next').NextConfig} */
const nextConfig = {
  compress: true,
  cleanDistDir: true,
  eslint: {
    ignoreDuringBuilds: true,
  },

  // Geração de PDF de relatórios (Chromium headless): esses pacotes carregam
  // binários nativos e NÃO podem ser bundlados pelo webpack — ficam externos
  // e são resolvidos em runtime na função serverless.
  serverExternalPackages: ["@sparticuz/chromium", "puppeteer-core"],

  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.supabase.co",
      },
      {
        protocol: "https",
        hostname: "**.supabase.in",
      },
      {
        protocol: "https",
        hostname: "**.supabaseusercontent.com",
      },
    ],
  },

  async rewrites() {
    return [
      {
        source: "/tracking/widget.js",
        destination: "/api/script/widget.js",
      },
    ];
  },

  async redirects() {
    return [
      // ── Admin routes (old → new) ──────────────────────────────────
      { source: "/dashboard", destination: "/admin/dashboard", permanent: true },
      { source: "/dashboard/operational", destination: "/admin/dashboard/operational", permanent: true },
      { source: "/clients", destination: "/admin/clients", permanent: true },
      { source: "/clients/new", destination: "/admin/clients/new", permanent: true },
      { source: "/clients/:id/edit", destination: "/admin/clients/:id/edit", permanent: true },
      { source: "/clients/:id", destination: "/admin/clients/:id", permanent: true },
      { source: "/stores/:id", destination: "/admin/stores/:id", permanent: true },
      { source: "/stores", destination: "/admin/stores", permanent: true },
      { source: "/campaigns", destination: "/admin/campaigns", permanent: true },
      { source: "/automations/new", destination: "/admin/automations/new", permanent: true },
      { source: "/automations/:id", destination: "/admin/automations/:id", permanent: true },
      { source: "/automations", destination: "/admin/automations", permanent: true },
      { source: "/board", destination: "/admin/board", permanent: true },
      { source: "/meetings/new", destination: "/admin/meetings/new", permanent: true },
      { source: "/meetings", destination: "/admin/meetings", permanent: true },
      { source: "/financial", destination: "/admin/financial", permanent: true },
      { source: "/reports/new", destination: "/admin/reports/new", permanent: true },
      { source: "/reports/:id/edit", destination: "/admin/reports/:id/edit", permanent: true },
      { source: "/reports/:id", destination: "/admin/reports/:id", permanent: true },
      { source: "/reports", destination: "/admin/reports", permanent: true },
      { source: "/pipeline", destination: "/admin/pipeline", permanent: true },
      { source: "/team", destination: "/admin/team", permanent: true },
      { source: "/notifications", destination: "/admin/notifications", permanent: true },
      { source: "/onboarding", destination: "/admin/onboarding", permanent: true },
      { source: "/tools", destination: "/admin/tools", permanent: true },
      { source: "/settings/:path*", destination: "/admin/settings/:path*", permanent: true },
      { source: "/settings", destination: "/admin/settings", permanent: true },

      // ── Rotas removidas (bookmarks antigos) ───────────────────────
      { source: "/admin/me", destination: "/admin/productivity/board", permanent: true },
      // Notificacoes/WhatsApp persistidos no banco contem a URL antiga de logs
      { source: "/admin/tools/email-generation-logs", destination: "/admin/settings/email-generation-logs", permanent: true },
      { source: "/admin/settings/users", destination: "/admin/settings/team", permanent: true },
      // CRM legado — subURLs granulares ja 404avam; catch-all para bookmarks
      { source: "/admin/crm/:path*", destination: "/admin/comercial/pipelines", permanent: false },
      { source: "/admin/cs-crm/:path*", destination: "/admin/operacional/cs-crm/:path*", permanent: true },

      // ── Portal → Client routes ────────────────────────────────────
      { source: "/portal/login", destination: "/client/login", permanent: true },
      { source: "/portal/dashboard", destination: "/client/dashboard", permanent: true },
      { source: "/portal/onboarding/wizard", destination: "/client/onboarding/wizard", permanent: true },
      { source: "/portal/onboarding", destination: "/client/onboarding", permanent: true },
      { source: "/portal/stores/new", destination: "/client/stores/new", permanent: true },
      { source: "/portal/stores/:id", destination: "/client/stores/:id", permanent: true },
      { source: "/portal/stores", destination: "/client/stores", permanent: true },
      { source: "/portal/campaigns", destination: "/client/campaigns", permanent: true },
      { source: "/portal/flows", destination: "/client/flows", permanent: true },
      { source: "/portal/tracking/:path*", destination: "/client/tracking/:path*", permanent: true },
      { source: "/portal/tracking", destination: "/client/tracking", permanent: true },
      { source: "/portal/analytics", destination: "/client/analytics", permanent: true },
      { source: "/portal/integrations", destination: "/client/integrations", permanent: true },
      { source: "/portal/invoices", destination: "/client/invoices", permanent: true },
      { source: "/portal/settings", destination: "/client/settings", permanent: true },
      { source: "/portal/change-password", destination: "/client/change-password", permanent: true },
    ];
  },

  async headers() {
    // X-Frame-Options and frame-ancestors are handled in middleware
    // to reliably distinguish embeddable routes from protected ones.
    //
    // Content-Security-Policy (Story 57.5):
    //   - 'self'                   o proprio dominio (admin + portal + APIs)
    //   - 'unsafe-inline' (script) NECESSARIO p/ Next.js hydration scripts
    //   - 'unsafe-eval' (script)   NECESSARIO p/ React DevTools em dev e
    //                              algumas libs (Recharts/Reactflow); pode
    //                              ser removido em uma proxima iteracao
    //   - 'unsafe-inline' (style)  NECESSARIO p/ Tailwind atomic classes,
    //                              shadcn/ui, framer-motion inline styles
    //   - data: e blob: para imagens/icones embedados
    //   - https: para imagens (logos de loja vindos de qualquer dominio)
    //   - Whitelist de connect-src:
    //       * https://*.supabase.co + wss:// → backend Supabase + realtime
    //       * https://*.supabase.in / .supabaseusercontent.com → storage assets
    //       * https://a.klaviyo.com → metricas Klaviyo (admin/portal)
    //       * https://api.omnisend.com → metricas Omnisend
    //       * https://api.asaas.com / https://sandbox.asaas.com → cobrancas
    //       * https://api.wise.com → reconciliacao
    //       * https://api.openai.com → IA (geracao de copy)
    //       * https://*.shopify.com / *.myshopify.com → conexao OAuth/Admin API
    //       * https://graph.facebook.com → Meta Ads (futuro)
    //       * https://www.googleapis.com → Google Calendar / Analytics
    //       * https://global.cainiao.com / .correios.com.br / .postnl.nl /
    //         .trackingmore.com / .17track.net → providers de tracking
    //       * https://api.resend.com → emails transacionais
    //       * https://*.vercel-insights.com / *.vercel-analytics.com → analytics
    //   - frame-ancestors 'none' (redundante com middleware mas mais moderno)
    //
    // Comecamos em Report-Only para identificar violacoes em producao SEM
    // quebrar nada. Apos 7 dias de monitoramento sem violacoes legitimas,
    // migrar para 'Content-Security-Policy' (enforcement).
    const cspDirectives = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "script-src-elem 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "style-src-elem 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "media-src 'self' data: blob:",
      [
        "connect-src 'self'",
        "https://*.supabase.co wss://*.supabase.co",
        "https://*.supabase.in https://*.supabaseusercontent.com",
        "https://a.klaviyo.com",
        "https://api.omnisend.com",
        "https://api.asaas.com https://sandbox.asaas.com",
        "https://api.wise.com",
        "https://api.openai.com",
        "https://*.shopify.com https://*.myshopify.com",
        "https://graph.facebook.com",
        "https://www.googleapis.com",
        "https://global.cainiao.com https://api.cainiao.com",
        "https://proxyapp.correios.com.br",
        "https://api.postnl.nl",
        "https://api.trackingmore.com",
        "https://api.17track.net",
        "https://api.resend.com",
        "https://*.vercel-insights.com https://*.vercel-analytics.com",
      ].join(" "),
      "frame-ancestors 'none'",
      "form-action 'self'",
      "base-uri 'self'",
      "object-src 'none'",
    ].join("; ")

    return [
      // ── Headers para todas as paginas (admin + portal + APIs) ────────────
      // Inclui CSP, mas EXCLUI as rotas publicas do widget de tracking que
      // precisam funcionar em qualquer dominio externo.
      {
        source: "/((?!api/script|api/tracking|tracking/embed).*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-XSS-Protection", value: "1; mode=block" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          // Report-Only: nao quebra nada, apenas reporta violacoes no
          // console do browser. Apos validacao, trocar para
          // 'Content-Security-Policy' para enforcement.
          { key: "Content-Security-Policy-Report-Only", value: cspDirectives },
        ],
      },
      // ── Widget publico e tracking embed: SEM CSP (precisa rodar em
      //    qualquer dominio externo onde a loja instalou o script) ──
      {
        source: "/api/script/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
      {
        source: "/api/tracking/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
