/** @type {import('next').NextConfig} */
const nextConfig = {
  compress: true,
  cleanDistDir: true,
  eslint: {
    ignoreDuringBuilds: true,
  },

  // Sharp must run as a native module on the server (not bundled by Next.js)
  // Needed by the Figma Email Slicer image processing API.
  serverExternalPackages: ["sharp"],

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
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "X-XSS-Protection",
            value: "1; mode=block",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
