"use client"

/**
 * Dispara o diálogo de impressão do navegador (Cmd/Ctrl+P → "Salvar como
 * PDF") assim que a página de print termina de carregar. Usado pelo botão
 * "Baixar PDF" da aba Relatório (?autoprint=1) — o CSS de @page da página
 * já formata o deck em 297×167mm, 1 slide por página.
 *
 * Espera fontes (Google Fonts) e imagens decodificarem antes do print,
 * senão o PDF sai com texto em fallback ou logos em branco.
 */

import { useEffect } from "react"

export function AutoPrint() {
  useEffect(() => {
    let cancelled = false

    const run = async () => {
      try {
        await document.fonts?.ready
      } catch {
        /* fontes bloqueadas — imprime mesmo assim */
      }
      await Promise.allSettled(
        Array.from(document.images).map((img) => img.decode().catch(() => {})),
      )
      // Um respiro pro layout assentar após hidratação dos slides.
      await new Promise((r) => setTimeout(r, 300))
      if (!cancelled) window.print()
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [])

  return null
}
