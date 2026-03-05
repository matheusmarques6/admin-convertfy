/** @type {import('next').NextConfig} */
const nextConfig = {
  compress: true,
  cleanDistDir: true,

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
