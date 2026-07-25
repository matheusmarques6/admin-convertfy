import type { Metadata, Viewport } from "next"
import localFont from "next/font/local"
import { Montserrat } from "next/font/google"
import "./globals.css"
import { SpeedInsights } from "@vercel/speed-insights/next"
import { inter, playfair } from "@/lib/fonts"
import { SWRProvider } from "@/components/providers/swr-provider"
import { ThemeProvider } from "@/components/providers/theme-provider"
import { Toaster } from "@/components/ui/toaster"

const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  display: "swap",
})

const montserrat = Montserrat({
  subsets: ["latin"],
  variable: "--font-montserrat",
  display: "swap",
})

export const metadata: Metadata = {
  title: "Convertfy Admin - Sistema de Gestão para Agências",
  description: "Sistema administrativo SaaS completo para gestão de clientes, automações e métricas de marketing.",
  icons: {
    icon: "/favicon.ico",
  },
}

// viewport-fit=cover é o que HABILITA env(safe-area-inset-*) no iOS
// (notch/home indicator). Sem isso o padding de safe-area do inbox e das
// barras inferiores é sempre 0. Mantemos o zoom do usuário (sem
// maximumScale/userScalable) por acessibilidade.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body className={`${inter.variable} ${geistMono.variable} ${playfair.variable} ${montserrat.variable} font-sans antialiased`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
        >
          <SWRProvider>{children}</SWRProvider>
          <Toaster />
        </ThemeProvider>
        <SpeedInsights />
      </body>
    </html>
  )
}
