/**
 * Layout do print do relatório — rota PRÓPRIA fora de /admin.
 *
 * Antes vivia em /admin/stores/relatorios/[id]/print e tentava "substituir"
 * o admin layout renderizando <html> aninhado — no App Router o layout pai
 * SEMPRE embrulha o filho, então o chrome do admin (header/sidebar) vazava
 * no PDF e o wrapper `h-[100dvh] overflow-hidden` do admin cortava a
 * impressão em 1 página. Fora de /admin só o root layout embrulha (html/
 * body limpos) e o documento flui — as 7 páginas paginam.
 *
 * Auth: /print/* é protegido no middleware igual /admin (sessão exigida).
 */

import "@/app/globals.css"
import { inter, playfair } from "@/lib/fonts"

export default function PrintLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${inter.variable} ${playfair.variable}`}>
      <style>{`
        html, body { margin: 0; padding: 0; background: #fff !important; font-family: var(--font-inter), sans-serif; -webkit-font-smoothing: antialiased; }
        @page { size: 297mm 167mm; margin: 0; }
        @media print {
          body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
          /* O wrapper dos slides é flex-col (gap/padding) — Chromium não
             fragmenta flex entre páginas; em bloco, cada [data-slide] vira
             uma página via break-after. */
          [data-slides-root] {
            display: block !important;
            padding: 0 !important;
            margin: 0 !important;
          }
          [data-slide] {
            page-break-after: always;
            page-break-inside: avoid;
            /* margin extra + altura exata de @page = páginas em branco */
            margin: 0 auto !important;
          }
          [data-slide]:last-child { page-break-after: auto; }
          [data-slide-viewport] { box-shadow: none !important; }
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
          body { padding: 20px; background: #f1f5f9 !important; }
        }
      `}</style>
      {children}
    </div>
  )
}

export const metadata = {
  title: "Relatório · Print",
}
