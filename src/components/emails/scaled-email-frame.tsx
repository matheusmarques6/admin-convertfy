"use client"

/**
 * ScaledEmailFrame — preview de email HTML que simula um client REAL.
 *
 * Dois problemas que resolve:
 *
 * 1. **Media query mobile disparando no desktop** (bug "parece celular"):
 *    emails table-based usam `@media (max-width: 600px)` (às vezes 620px)
 *    pro layout mobile. Um iframe com viewport de exatamente 600px DISPARA
 *    o media query (`<=`) e o preview renderiza a versão celular empilhada.
 *    Clients desktop reais (Gmail/Outlook web) têm viewport muito maior que
 *    o container de 600px do email. Correção: quando `baseWidth >= 600`
 *    (modo desktop), o iframe ganha um viewport com folga
 *    (`baseWidth + DESKTOP_GUTTER`) — o email mantém a própria max-width,
 *    centralizado, com as calhas de fundo visíveis como num client real, e
 *    os media queries mobile NÃO disparam. Abaixo de 600 é simulação mobile
 *    intencional: o viewport é exatamente a largura pedida para DISPARAR os
 *    media queries.
 *
 * 2. **Scroll horizontal em colunas estreitas**: medimos a largura
 *    disponível (ResizeObserver) e aplicamos `transform: scale` pra encaixar
 *    o email inteiro sem scroll lateral.
 *
 * A altura é automática: lemos o `scrollHeight` do conteúdo (precisa de
 * `sandbox="allow-same-origin"`; scripts seguem bloqueados — emails não
 * rodam JS). Com `maxHeight`, a caixa é limitada e ganha scroll vertical
 * interno (uso em cards compactos).
 */

import { useCallback, useEffect, useRef, useState } from "react"
import {
  REGION_ATTR,
  moverIndice,
  resolveDropTarget,
} from "@/lib/agents/html/block-regions"
import { FONT_ATTR } from "@/lib/agents/typography/annotate"

// Folga de viewport no modo desktop. Precisa ser maior que a diferença entre
// o breakpoint mobile mais alto usado nos emails gerados (620px) e a largura
// padrão do email (600px), com margem.
const DESKTOP_GUTTER = 80

// Abaixo disso o slider está simulando celular — media queries DEVEM disparar.
const MOBILE_SIM_THRESHOLD = 600

export function ScaledEmailFrame({
  html,
  baseWidth,
  maxHeight,
  editable = false,
  selecionavelPorFonte = false,
  fonteSelecionada = null,
  onSelecionarFonte,
  rotuloDaRegiao,
  onReorder,
  onRemove,
}: {
  html: string
  baseWidth: number
  /** Limita a altura visível; o excedente ganha scroll vertical interno. */
  maxHeight?: number
  /**
   * Modo de edição de estrutura: as linhas marcadas com `data-cfy-idx`
   * (ver `annotateRegionsForEditing`) viram arrastáveis dentro do preview.
   *
   * A condução é do PAI: o iframe roda com `sandbox="allow-same-origin"` e
   * scripts BLOQUEADOS de propósito (emails não rodam JS, e ligar
   * `allow-scripts` faria JS presente no HTML do email executar). Como o
   * documento é mesma-origem, dá para ler `contentDocument` e anexar tudo
   * daqui — e, de quebra, o `scale` e o scroll não entram em conta nenhuma,
   * porque o gesto inteiro acontece dentro do documento.
   */
  editable?: boolean
  /**
   * Modo de SELEÇÃO de tipografia: as tags marcadas com `data-cfy-font`
   * (ver `annotateFontDeclarations`) ficam clicáveis, e o clique devolve o
   * índice da declaração no inventário.
   *
   * Exclusivo com `editable`. Os dois gestos brigam pelo mesmo `mousedown`:
   * o modo de estrutura dá `preventDefault` em qualquer clique dentro de uma
   * região — ou seja, em quase todo o e-mail —, então ligar os dois juntos
   * faria clicar num texto virar arrasto de bloco.
   */
  selecionavelPorFonte?: boolean
  /** Declaração selecionada agora (contorno cheio no preview). */
  fonteSelecionada?: number | null
  /** Clique numa declaração: índice no inventário de tipografia. */
  onSelecionarFonte?: (indice: number) => void
  /** Nome legível de cada região, para o chip. Chave = índice do marcador. */
  rotuloDaRegiao?: (indice: number) => string
  /** Nova ordem dos índices de região, após um arrasto. */
  onReorder?: (novaOrdem: number[]) => void
  /** Índice de região removida pelo ✕ do chip. */
  onRemove?: (indice: number) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [avail, setAvail] = useState(baseWidth)
  const [contentHeight, setContentHeight] = useState(baseWidth)
  // Trocar o srcDoc RECARREGA o iframe e mata o que injetamos no documento.
  // O tick re-dispara a instalação do modo de edição depois de cada load.
  const [loadTick, setLoadTick] = useState(0)
  // Callbacks em ref: o efeito de edição não pode re-instalar (removendo
  // chips e listeners no meio de um arrasto) porque o pai re-renderizou.
  const cbRef = useRef({ onReorder, onRemove, rotuloDaRegiao, onSelecionarFonte })
  cbRef.current = { onReorder, onRemove, rotuloDaRegiao, onSelecionarFonte }

  // Largura disponível da coluna (reativo a resize da janela/painéis).
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    setAvail(el.clientWidth)
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) setAvail(e.contentRect.width)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Altura real do conteúdo do email (auto-size, sem scroll vertical interno).
  const measureHeight = useCallback(() => {
    const doc = iframeRef.current?.contentDocument
    if (!doc?.body) return
    const h = Math.max(
      doc.body.scrollHeight,
      doc.documentElement?.scrollHeight ?? 0,
    )
    if (h > 0) setContentHeight(h)
  }, [])

  // Re-mede ao trocar o html e algumas vezes depois (imagens carregam tarde).
  useEffect(() => {
    measureHeight()
    const timers = [80, 300, 900].map((ms) => setTimeout(measureHeight, ms))
    return () => timers.forEach(clearTimeout)
  }, [html, avail, measureHeight])

  // ── Modo de edição: o preview vira o editor ─────────────────────────
  //
  // Tudo é criado e escutado DAQUI, do pai, sobre o `contentDocument` do
  // iframe (mesma origem). Nenhum script entra no documento do email e o
  // `sandbox` continua sem `allow-scripts`.
  useEffect(() => {
    if (!editable || selecionavelPorFonte) return
    const iframe = iframeRef.current
    const doc = iframe?.contentDocument
    if (!iframe || !doc?.body) return

    const linhas = () =>
      Array.from(doc.querySelectorAll<HTMLElement>(`[${REGION_ATTR}]`))
    if (linhas().length === 0) return

    const style = doc.createElement("style")
    style.textContent = `
      [${REGION_ATTR}] { cursor: grab; }
      [${REGION_ATTR}]:hover { outline: 2px dashed #2563eb; outline-offset: -2px; }
      [${REGION_ATTR}].cfy-dragging { opacity: .45; cursor: grabbing; }
      .cfy-chip {
        position: absolute; pointer-events: auto; z-index: 2147483000;
        display: inline-flex; align-items: center; gap: 6px;
        height: 20px; padding: 0 6px; border-radius: 4px;
        background: #1f2937; color: #fff; cursor: grab;
        font: 600 10px/1 -apple-system, Segoe UI, Roboto, sans-serif;
        letter-spacing: .02em; white-space: nowrap;
      }
      .cfy-chip button {
        all: unset; cursor: pointer; padding: 0 2px; opacity: .7;
      }
      .cfy-chip button:hover { opacity: 1; }
      .cfy-linha {
        position: absolute; height: 3px; background: #2563eb;
        border-radius: 2px; pointer-events: none; z-index: 2147483001;
        display: none;
      }
    `
    doc.head?.appendChild(style)

    // Camada de UI fora do fluxo do email: o documento é table-based e
    // qualquer nó injetado DENTRO das tabelas mudaria o layout.
    const camada = doc.createElement("div")
    camada.style.cssText =
      "position:absolute;top:0;left:0;width:0;height:0;pointer-events:none"
    const linhaAlvo = doc.createElement("div")
    linhaAlvo.className = "cfy-linha"
    camada.appendChild(linhaAlvo)
    doc.body.appendChild(camada)
    const posicaoOriginal = doc.body.style.position
    if (!posicaoOriginal) doc.body.style.position = "relative"

    const topoDe = (el: HTMLElement) =>
      el.getBoundingClientRect().top + (doc.documentElement?.scrollTop ?? 0)

    const chips: HTMLElement[] = []
    const posicionarChips = () => {
      linhas().forEach((linha, i) => {
        const chip = chips[i]
        if (!chip) return
        chip.style.top = `${Math.max(0, topoDe(linha) + 4)}px`
        chip.style.left = `${linha.getBoundingClientRect().left + 8}px`
      })
    }

    linhas().forEach((linha) => {
      const indice = Number(linha.getAttribute(REGION_ATTR))
      const chip = doc.createElement("div")
      chip.className = "cfy-chip"
      const nome = doc.createElement("span")
      nome.textContent = cbRef.current.rotuloDaRegiao?.(indice) ?? `bloco ${indice + 1}`
      const x = doc.createElement("button")
      x.textContent = "✕"
      x.title = "Tirar este bloco do email"
      x.addEventListener("mousedown", (e) => e.stopPropagation())
      x.addEventListener("click", (e) => {
        e.preventDefault()
        e.stopPropagation()
        cbRef.current.onRemove?.(indice)
      })
      chip.append(nome, x)
      camada.appendChild(chip)
      chips.push(chip)
    })
    posicionarChips()

    // ── Arrasto ──
    let arrastando: HTMLElement | null = null
    let de = -1
    let alvo = -1
    let meios: number[] = []
    let topos: number[] = []
    let autoScroll = 0

    /** O ancestral que realmente rola — a caixa com maxHeight ou a janela. */
    const rolavel = (): HTMLElement | null => {
      let el: HTMLElement | null = containerRef.current
      while (el) {
        const overflow = getComputedStyle(el).overflowY
        if (
          (overflow === "auto" || overflow === "scroll") &&
          el.scrollHeight > el.clientHeight
        ) {
          return el
        }
        el = el.parentElement
      }
      return null
    }

    const passoScroll = () => {
      if (!arrastando) return
      if (autoScroll !== 0) {
        const alvoScroll = rolavel()
        if (alvoScroll) alvoScroll.scrollTop += autoScroll
        else window.scrollBy(0, autoScroll)
      }
      requestAnimationFrame(passoScroll)
    }

    const onMouseDown = (e: MouseEvent) => {
      const linha = (e.target as HTMLElement | null)?.closest?.(
        `[${REGION_ATTR}]`,
      ) as HTMLElement | null
      const doChip = (e.target as HTMLElement | null)?.closest?.(".cfy-chip")
      const atual = linhas()
      const origem = linha
        ? linha
        : doChip
          ? atual[chips.indexOf(doChip as HTMLElement)]
          : null
      if (!origem) return
      e.preventDefault()
      arrastando = origem
      de = atual.indexOf(origem)
      topos = atual.map((l) => topoDe(l))
      meios = atual.map((l) => topoDe(l) + l.getBoundingClientRect().height / 2)
      origem.classList.add("cfy-dragging")
      doc.body.style.userSelect = "none"
      requestAnimationFrame(passoScroll)
    }

    const onMouseMove = (e: MouseEvent) => {
      if (!arrastando) return
      const y = e.clientY + (doc.documentElement?.scrollTop ?? 0)
      alvo = resolveDropTarget(meios, y)
      const linhasAtuais = linhas()
      const referencia = linhasAtuais[Math.min(alvo, linhasAtuais.length - 1)]
      const fimDaLista = alvo >= linhasAtuais.length
      const yLinha = fimDaLista
        ? topos[topos.length - 1] +
          linhasAtuais[linhasAtuais.length - 1].getBoundingClientRect().height
        : topos[alvo] ?? 0
      linhaAlvo.style.display = "block"
      linhaAlvo.style.top = `${yLinha - 1}px`
      linhaAlvo.style.left = `${referencia?.getBoundingClientRect().left ?? 0}px`
      linhaAlvo.style.width = `${referencia?.getBoundingClientRect().width ?? 0}px`

      // Auto-scroll: sem isto um email de 3.000px é indragável. A conta usa
      // a coordenada na JANELA do pai (o iframe está escalado).
      const rect = iframe.getBoundingClientRect()
      const escala = rect.height / (doc.body.scrollHeight || 1)
      const yNaJanela = rect.top + (e.clientY * (escala || 1))
      const margem = 90
      autoScroll =
        yNaJanela < margem ? -14 : yNaJanela > window.innerHeight - margem ? 14 : 0
    }

    const onMouseUp = () => {
      if (!arrastando) return
      const atual = linhas()
      arrastando.classList.remove("cfy-dragging")
      linhaAlvo.style.display = "none"
      doc.body.style.userSelect = ""
      autoScroll = 0

      const indices = atual.map((l) => Number(l.getAttribute(REGION_ATTR)))
      const nova = moverIndice(indices, de, alvo)
      const mudou = nova.some((v, i) => v !== indices[i])
      if (mudou) {
        // Move o nó AGORA: é o que faz a prévia ser ao vivo. O srcDoc não é
        // reescrito, então nada pisca e o scroll não se perde.
        const destino = nova.indexOf(indices[de])
        const pai = arrastando.parentElement
        const irmaos = atual.filter((l) => l !== arrastando)
        if (pai) {
          if (destino >= irmaos.length) pai.appendChild(arrastando)
          else pai.insertBefore(arrastando, irmaos[destino])
        }
        posicionarChips()
        cbRef.current.onReorder?.(nova)
      }
      arrastando = null
      de = -1
      alvo = -1
    }

    doc.addEventListener("mousedown", onMouseDown)
    doc.addEventListener("mousemove", onMouseMove)
    doc.addEventListener("mouseup", onMouseUp)
    doc.addEventListener("mouseleave", onMouseUp)

    return () => {
      doc.removeEventListener("mousedown", onMouseDown)
      doc.removeEventListener("mousemove", onMouseMove)
      doc.removeEventListener("mouseup", onMouseUp)
      doc.removeEventListener("mouseleave", onMouseUp)
      style.remove()
      camada.remove()
      doc.body.style.position = posicaoOriginal
      doc.body.style.userSelect = ""
    }
  }, [editable, selecionavelPorFonte, html, loadTick, contentHeight])

  // ── Modo tipografia: escolher a declaração clicando no texto ─────────
  //
  // Irmão do efeito acima e com o mesmo desenho (CSS no `contentDocument`,
  // listeners do PAI, nada de script dentro do iframe), mas outro gesto:
  // aqui não se arrasta nada, só se aponta.
  //
  // O que o clique seleciona é uma DECLARAÇÃO de estilo, não um trecho de
  // texto — e uma declaração num `<td>` governa por herança tudo que está
  // dentro dele. Por isso o contorno cheio marca o elemento inteiro: é o
  // alcance real da mudança, e vê-lo antes de aplicar evita a surpresa de
  // mexer no subtítulo e o parágrafo ao lado ir junto.
  useEffect(() => {
    if (!selecionavelPorFonte) return
    const doc = iframeRef.current?.contentDocument
    if (!doc?.body) return
    if (doc.querySelectorAll(`[${FONT_ATTR}]`).length === 0) return

    const style = doc.createElement("style")
    style.textContent = `
      [${FONT_ATTR}] { cursor: pointer; }
      [${FONT_ATTR}]:hover {
        outline: 2px dashed #7C3AED; outline-offset: -2px;
      }
      [${FONT_ATTR}].cfy-font-sel {
        outline: 2px solid #7C3AED; outline-offset: -2px;
        background-image: linear-gradient(rgba(124,58,237,.08), rgba(124,58,237,.08));
      }
    `
    doc.head?.appendChild(style)

    const marcarSelecionado = () => {
      doc.querySelectorAll(`.cfy-font-sel`).forEach((el) => {
        el.classList.remove("cfy-font-sel")
      })
      if (fonteSelecionada == null) return
      doc
        .querySelector(`[${FONT_ATTR}="${fonteSelecionada}"]`)
        ?.classList.add("cfy-font-sel")
    }
    marcarSelecionado()

    const aoClicar = (e: MouseEvent) => {
      const alvo = (e.target as HTMLElement | null)?.closest?.(
        `[${FONT_ATTR}]`,
      ) as HTMLElement | null
      // `preventDefault` mesmo sem alvo: o e-mail é feito de links, e um
      // clique fora de qualquer declaração não pode navegar para a loja.
      e.preventDefault()
      e.stopPropagation()
      if (!alvo) return
      const indice = Number(alvo.getAttribute(FONT_ATTR))
      if (Number.isFinite(indice)) cbRef.current.onSelecionarFonte?.(indice)
    }

    doc.addEventListener("click", aoClicar)
    return () => {
      doc.removeEventListener("click", aoClicar)
      doc.querySelectorAll(`.cfy-font-sel`).forEach((el) => {
        el.classList.remove("cfy-font-sel")
      })
      style.remove()
    }
  }, [selecionavelPorFonte, fonteSelecionada, html, loadTick, contentHeight])

  const viewportWidth =
    baseWidth < MOBILE_SIM_THRESHOLD ? baseWidth : baseWidth + DESKTOP_GUTTER
  const scale = Math.min(1, avail / viewportWidth)
  const scaledHeight = contentHeight * scale
  const boxHeight =
    maxHeight != null ? Math.min(scaledHeight, maxHeight) : scaledHeight

  return (
    // Div externa: mede a largura disponível (transparente, ocupa a coluna).
    <div ref={containerRef} style={{ width: "100%" }}>
      {/* Caixa visível: largura do viewport simulado (escalada quando a
          coluna é menor). Com maxHeight, vira janela com scroll interno. */}
      <div
        style={{
          width: viewportWidth * scale,
          height: boxHeight,
          margin: "0 auto",
          overflowX: "hidden",
          overflowY: maxHeight != null && scaledHeight > maxHeight ? "auto" : "hidden",
          background: "#fff",
          border: "1px solid var(--crm-border)",
          borderRadius: 10,
          boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
        }}
      >
        {/* Wrapper na altura ESCALADA total — dá a área rolável correta
            quando maxHeight corta o conteúdo. */}
        <div style={{ width: viewportWidth * scale, height: scaledHeight }}>
          <iframe
            ref={iframeRef}
            title="email-render-preview"
            srcDoc={html}
            sandbox="allow-same-origin"
            onLoad={() => {
              measureHeight()
              setLoadTick((t) => t + 1)
            }}
            scrolling="no"
            style={{
              width: viewportWidth,
              height: contentHeight,
              border: 0,
              display: "block",
              background: "#fff",
              transform: `scale(${scale})`,
              transformOrigin: "top left",
            }}
          />
        </div>
      </div>
    </div>
  )
}
