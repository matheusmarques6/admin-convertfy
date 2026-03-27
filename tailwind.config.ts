import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    /* ═══ SCREENS — mobile-first (Shopify Polaris, DS v3.0 Regra 21) ═══ */
    screens: {
      sm: "490px",
      md: "768px",
      lg: "1040px",
      xl: "1440px",
    },
    container: {
      center: true,
      padding: "2rem",
      screens: {
        xl: "1400px",
      },
    },
    extend: {
      /* ═══ FONT FAMILY — Inter + Geist Mono ═══ */
      fontFamily: {
        sans: [
          "var(--font-inter)",
          "-apple-system",
          "BlinkMacSystemFont",
          "sans-serif",
        ],
        mono: [
          "var(--font-geist-mono)",
          "'SF Mono'",
          "'Fira Code'",
          "monospace",
        ],
      },

      /* ═══ COLORS — DS v3.0 palette completa ═══ */
      colors: {
        /* Brand — gradient: #4E62D8 → #2137B6 → #041366 */
        brand: {
          50: "var(--brand-50)",
          100: "var(--brand-100)",
          200: "var(--brand-200)",
          300: "var(--brand-300)",
          400: "var(--brand-400)",
          DEFAULT: "var(--brand-500)",
          500: "var(--brand-500)",
          600: "var(--brand-600)",
          700: "var(--brand-700)",
          800: "var(--brand-800)",
          900: "var(--brand-900)",
        },

        /* Gray scale completa */
        gray: {
          white: "var(--gray-white)",
          25: "var(--gray-25)",
          50: "var(--gray-50)",
          100: "var(--gray-100)",
          200: "var(--gray-200)",
          300: "var(--gray-300)",
          400: "var(--gray-400)",
          500: "var(--gray-500)",
          600: "var(--gray-600)",
          700: "var(--gray-700)",
          800: "var(--gray-800)",
          900: "var(--gray-900)",
        },

        /* Semantic — tinted bg + dark text (padrão Stripe/Linear) */
        positive: {
          bg: "var(--positive-bg)",
          text: "var(--positive-text)",
          border: "var(--positive-border)",
        },
        negative: {
          bg: "var(--negative-bg)",
          text: "var(--negative-text)",
          border: "var(--negative-border)",
        },
        warning: {
          DEFAULT: "var(--warning-bg)",
          bg: "var(--warning-bg)",
          text: "var(--warning-text)",
          border: "var(--warning-border)",
          foreground: "var(--warning-text)",
        },
        neutral: {
          bg: "var(--neutral-bg)",
          text: "var(--neutral-text)",
          border: "var(--neutral-border)",
        },
        info: {
          DEFAULT: "var(--info-bg)",
          bg: "var(--info-bg)",
          text: "var(--info-text)",
          border: "var(--info-border)",
          foreground: "var(--info-text)",
        },

        /* Channel colors (campanhas/automações) */
        channel: {
          email: "var(--channel-email)",
          sms: "var(--channel-sms)",
          push: "var(--channel-push)",
          "push-bg": "var(--channel-push-bg)",
          whatsapp: "var(--channel-whatsapp)",
          "whatsapp-bg": "var(--channel-whatsapp-bg)",
          "whatsapp-border": "#A8E6C2",
        },

        /* Accent (CTAs solids para banners) */
        "accent-amber": "var(--accent-amber)",
        "accent-red": "var(--accent-red)",

        /* Dark mode surfaces (usar com dark: prefix) */
        dark: {
          bg: "#0F1117",
          surface: "#1A1D27",
          "surface-el": "#242836",
          "surface-hv": "#2A2F3D",
          text: "#EAEDF3",
          "text-sec": "#8B92A5",
          "text-muted": "#5C6378",
          brand: "#7B8CEA",
          "brand-hover": "#6A7CE0",
          "brand-muted": "rgba(123,140,234,0.12)",
        },

        /* shadcn/ui vars — raw values (sem hsl) */
        border: "var(--border)",
        input: "var(--input)",
        ring: "var(--ring)",
        background: "var(--background)",
        foreground: "var(--foreground)",
        primary: {
          DEFAULT: "var(--primary)",
          foreground: "var(--primary-foreground)",
        },
        secondary: {
          DEFAULT: "var(--secondary)",
          foreground: "var(--secondary-foreground)",
        },
        destructive: {
          DEFAULT: "var(--destructive)",
          foreground: "var(--destructive-foreground)",
        },
        muted: {
          DEFAULT: "var(--muted)",
          foreground: "var(--muted-foreground)",
        },
        accent: {
          DEFAULT: "var(--accent)",
          foreground: "var(--accent-foreground)",
        },
        popover: {
          DEFAULT: "var(--popover)",
          foreground: "var(--popover-foreground)",
        },
        card: {
          DEFAULT: "var(--card)",
          foreground: "var(--card-foreground)",
        },

        /* Sidebar */
        sidebar: {
          DEFAULT: "var(--sidebar-background)",
          background: "var(--sidebar-background)",
          foreground: "var(--sidebar-foreground)",
          primary: "var(--sidebar-primary)",
          "primary-foreground": "var(--sidebar-primary-foreground)",
          accent: "var(--sidebar-accent)",
          "accent-foreground": "var(--sidebar-accent-foreground)",
          border: "var(--sidebar-border)",
          ring: "var(--sidebar-ring)",
          muted: "var(--sidebar-muted)",
          "muted-foreground": "var(--sidebar-muted-foreground)",
        },

        /* Chart */
        chart: {
          1: "var(--chart-1)",
          2: "var(--chart-2)",
          3: "var(--chart-3)",
          4: "var(--chart-4)",
          5: "var(--chart-5)",
        },
      },

      /* ═══ BORDER RADIUS — 4 tokens (6/8/12/9999) ═══ */
      borderRadius: {
        sm: "6px",
        md: "8px",
        lg: "12px",
        xl: "12px",
        "2xl": "12px",
        pill: "9999px",
        full: "9999px",
      },

      /* ═══ SHADOWS — Layered (auditoria Stripe/Shopify) ═══ */
      boxShadow: {
        sm: "0 1px 2px rgba(0,0,0,0.03), 0 1px 3px rgba(0,0,0,0.05)",
        md: "0 2px 4px rgba(0,0,0,0.03), 0 4px 6px rgba(0,0,0,0.05)",
        lg: "0 1px 2px rgba(0,0,0,0.03), 0 4px 8px rgba(0,0,0,0.04), 0 12px 24px rgba(0,0,0,0.06)",
        none: "none",
        "ring-brand": "0 0 0 2px #4E62D8",
        "ring-brand-dark": "0 0 0 2px #7B8CEA",
      },

      /* ═══ SPACING — Grid 8px (DS v3.0) ═══ */
      spacing: {
        "0.5": "2px",
        "1": "4px",
        "2": "8px",
        "3": "12px",
        "4": "16px",
        "6": "24px",
        "8": "32px",
        "12": "48px",
        "16": "64px",
      },

      /* ═══ FONT SIZE — Escala tipográfica do DS ═══ */
      fontSize: {
        "2xs": ["0.6875rem", { lineHeight: "1rem" }],
        kpi: [
          "32px",
          { lineHeight: "1.1", fontWeight: "600", letterSpacing: "-0.03em" },
        ],
        "kpi-label": [
          "13px",
          { lineHeight: "1.4", fontWeight: "500" },
        ],
        badge: [
          "11px",
          {
            lineHeight: "1.2",
            fontWeight: "600",
            letterSpacing: "0.02em",
          },
        ],
        "table-header": [
          "12px",
          {
            lineHeight: "1.4",
            fontWeight: "600",
            letterSpacing: "0.04em",
          },
        ],
        "page-title": [
          "22px",
          {
            lineHeight: "1.3",
            fontWeight: "600",
            letterSpacing: "-0.02em",
          },
        ],
        "sidebar-label": [
          "10px",
          {
            lineHeight: "1.4",
            fontWeight: "500",
            letterSpacing: "0.06em",
          },
        ],
        delta: ["13px", { lineHeight: "1.4", fontWeight: "500" }],
      },

      /* ═══ TRANSITIONS — DS v3.0 ═══ */
      transitionTimingFunction: {
        "out-expo": "cubic-bezier(0.16, 1, 0.3, 1)",
      },
      transitionDuration: {
        fast: "150ms",
      },

      /* ═══ TOUCH TARGETS — Acessibilidade mobile ═══ */
      minHeight: {
        touch: "44px",
        "touch-comfortable": "48px",
      },
      minWidth: {
        touch: "44px",
        "touch-comfortable": "48px",
      },

      /* ═══ KEYFRAMES — Animações necessárias (shadcn/radix) ═══ */
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "slide-in-from-left": {
          from: { transform: "translateX(-100%)" },
          to: { transform: "translateX(0)" },
        },
        "slide-in-from-right": {
          from: { transform: "translateX(100%)" },
          to: { transform: "translateX(0)" },
        },
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "fade-in": "fade-in 0.3s ease-out",
        "slide-in-from-left": "slide-in-from-left 0.3s ease-out",
        "slide-in-from-right": "slide-in-from-right 0.3s ease-out",
        shimmer: "shimmer 2s infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
