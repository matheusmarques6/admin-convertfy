import type { Viewport } from "next"
import { SpeedInsights } from "@vercel/speed-insights/next"
import "./formularios.css"

/**
 * A raiz do FORMULÁRIO PÚBLICO — separada da raiz do admin.
 *
 * `/forms/[slug]` é o destino de anúncio pago, aberto no celular, em
 * rede móvel, por quem nunca viu a Convertfy. Até 19/09 ele herdava a
 * raiz do painel: `globals.css` inteiro (258 KB), quatro famílias de
 * fonte pré-carregadas (Inter, Geist Mono, Playfair, Montserrat — o
 * formulário usa uma), `next-themes`, o provider do SWR e o toaster. Nada
 * disso desenha uma pergunta.
 *
 * Aqui entra o que a página usa: o CSS de `formularios.css` (Tailwind
 * restrito aos componentes de formulário + as fontes que a aba Design
 * oferece) e o Speed Insights, que é como se mede o que esta separação
 * comprou. Tema claro/escuro é do FORMULÁRIO (`theme.mode`), não do
 * sistema — por isso não há `ThemeProvider`.
 *
 * Os dois renderizadores são client components que já carregam tudo o que
 * precisam por `import`; a raiz não precisa de provider nenhum.
 */

// viewport-fit=cover habilita env(safe-area-inset-*) no iOS. Mantemos o
// zoom do usuário (sem maximumScale/userScalable) por acessibilidade.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
}

export default function LayoutPublico({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body style={{ margin: 0 }}>
        {children}
        <SpeedInsights />
      </body>
    </html>
  )
}
