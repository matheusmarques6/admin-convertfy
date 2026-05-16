/**
 * Layout root próprio pra página de print — bypassa o admin layout (sidebar,
 * chrome, etc.) renderizando apenas <html>/<body> minimalistas. Necessario
 * pra Cmd+P → PDF sair limpo, sem sidebar e nem header.
 *
 * Como esse layout substitui o admin/layout.tsx parent, define a estrutura
 * HTML completa.
 */

import "@/app/globals.css"

export default function PrintLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Playfair+Display:wght@400;600;700&display=swap"
        />
        <style>{`
          html, body { margin: 0; padding: 0; background: #fff; font-family: 'Inter', sans-serif; -webkit-font-smoothing: antialiased; }
          @page { size: 297mm 167mm; margin: 0; }
          @media print {
            body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
            [data-slide] { page-break-after: always; page-break-inside: avoid; }
            [data-slide]:last-child { page-break-after: auto; }
          }
          [data-slide] {
            width: 297mm;
            max-width: 297mm;
            height: 167mm;
            margin: 0 auto 8mm;
            border-radius: 0 !important;
            border: none !important;
            box-shadow: 0 4px 24px rgba(0,0,0,0.08) !important;
            page-break-inside: avoid;
          }
          @media screen {
            body { padding: 20px; background: #f1f5f9; }
          }
        `}</style>
      </head>
      <body>{children}</body>
    </html>
  )
}

export const metadata = {
  title: "Relatório · Print",
}
