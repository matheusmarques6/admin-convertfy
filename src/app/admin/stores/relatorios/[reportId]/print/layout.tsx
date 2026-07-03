/**
 * Layout root próprio pra página de print — bypassa o admin layout (sidebar,
 * chrome, etc.) renderizando apenas <html>/<body> minimalistas. Necessario
 * pra Cmd+P → PDF sair limpo, sem sidebar e nem header.
 *
 * Como esse layout substitui o admin/layout.tsx parent, define a estrutura
 * HTML completa.
 */

import "@/app/globals.css"
import { inter, playfair } from "@/lib/fonts"

export default function PrintLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        {/* Fontes via next/font (self-hosted em @/lib/fonts): elimina a race
            condition do <link> do Google Fonts antes do Cmd+P. */}
        <style>{`
          html, body { margin: 0; padding: 0; background: #fff; font-family: var(--font-inter), sans-serif; -webkit-font-smoothing: antialiased; }
          @page { size: 297mm 167mm; margin: 0; }
          @media print {
            body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
            [data-slide] { page-break-after: always; page-break-inside: avoid; }
            [data-slide]:last-child { page-break-after: auto; }
          }
          /* Barra "Slide 01 · 07" fica fora do print: texto branco invisível
             no fundo branco e consumiria altura da @page. Escondida também na
             tela pra medição do ResizeObserver refletir o layout impresso. */
          [data-slide-indicator] { display: none; }
          /* width/height FORA de @media print de propósito: o ResizeObserver
             do SlideShell mede estas dimensões já na tela e o transform scale
             inline persiste na impressão (JS não roda durante o print). */
          [data-slide] {
            width: 297mm;
            max-width: 297mm;
            margin: 0 auto 8mm;
            page-break-inside: avoid;
          }
          [data-slide-viewport] {
            height: 167mm;
            aspect-ratio: auto !important;
            border-radius: 0 !important;
            border: none !important;
            box-shadow: 0 4px 24px rgba(0,0,0,0.08) !important;
          }
          @media screen {
            body { padding: 20px; background: #f1f5f9; }
          }
        `}</style>
      </head>
      <body className={`${inter.variable} ${playfair.variable}`}>{children}</body>
    </html>
  )
}

export const metadata = {
  title: "Relatório · Print",
}
