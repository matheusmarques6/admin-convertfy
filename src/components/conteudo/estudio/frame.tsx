"use client"

/**
 * Renderer de um frame do carrossel — base 1080 de largura, altura 1350
 * (4:5) ou 1920 (9:16, fundo estendido e conteúdo igual). Tudo é escalado
 * por `scale`: o mesmo componente desenha o canvas, as miniaturas, a prévia
 * e a exportação (que serializa este DOM). Só estilos inline: o documento
 * exportado não tem acesso ao CSS da página.
 *
 * Identidade dos slides (exceção consciente aos tokens da UI): Barlow
 * Condensed 800 caixa alta nos títulos, Georgia itálica nos apoios, selo com
 * tracking, pílula do CTA, barra de progresso nos numerados.
 *
 * Auto-fit: acima do limite do tipo, o texto encolhe pela curva de
 * `fitFactor` (nunca estoura o slide). Alças de mover/redimensionar operam
 * em px de TELA divididos por `scale`, então o arraste é 1:1 em qualquer zoom.
 */

import type { CSSProperties, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, ReactNode } from "react"
import { FONTE_APOIO, FONTE_META, FONTE_TITULO, SLIDE, fundoEscuro, gradienteCss } from "@/lib/conteudo/brand"
import { fitFactor, limiteDe } from "@/lib/conteudo/limites"
import type { Campo, DocFrame, Documento, EstiloTexto } from "@/lib/conteudo/types"

export const FRAME_W = 1080
export const alturaFrame = (doc: Pick<Documento, "proporcaoExport">) => (doc.proporcaoExport === "9:16" ? 1920 : 1350)

export interface SelTexto {
  frameId: string
  campo: Campo
  editing: boolean
}

export interface SelImagem {
  frameId: string
  vazio?: boolean
}

export interface FrameProps {
  doc: Documento
  ix: number
  scale?: number
  sel?: SelTexto | null
  imgSel?: SelImagem | null
  interactive?: boolean
  zonas?: boolean
  onSelText?: (s: SelTexto) => void
  onSelImg?: (s: SelImagem) => void
  onEditText?: (frameId: string, campo: Campo, valor: string) => void
  onDragEst?: (frameId: string, campo: Campo, patch: EstiloTexto, final: boolean) => void
  /** Id do DOM do frame (a exportação localiza por ele). */
  domId?: string
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))

type EstiloBase = Omit<CSSProperties, "fontSize" | "marginTop" | "maxWidth">
type BaseTexto = EstiloBase & { fontSize: number; marginTop?: number; maxWidth?: number }

// Ícones inline (a exportação serializa o DOM: nada pode depender de CSS externo).
const IconCheck = ({ s }: { s: number }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
)
const IconInbox = ({ s }: { s: number }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
    <path d="M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z" />
  </svg>
)

export function Frame({ doc, ix, scale = 1, sel, imgSel, interactive, zonas, onSelText, onSelImg, onEditText, onDragEst, domId }: FrameProps) {
  const f: DocFrame | undefined = doc.frames[ix]
  if (!f) return null
  const W = FRAME_W
  const H = alturaFrame(doc)
  const off = (H - 1350) / 2
  const fundo = doc.fundoPorFrame[f.frameId] ?? SLIDE.fundoClaro
  const escuro = fundoEscuro(fundo)
  const bg = fundo === "gradiente" ? gradienteCss(doc.gradiente) : fundo
  const fg = escuro ? "#FFFFFF" : doc.cores.hook
  const fg2 = escuro ? "rgba(255,255,255,0.82)" : SLIDE.textoApoioClaro
  const meta = escuro ? "rgba(255,255,255,0.7)" : doc.cores.metadado
  const S = (v: number) => v * scale
  const img = f.imagens.slot1
  const bk = doc.brandKit
  const oc = doc.ocultos
  const est = (campo: Campo): EstiloTexto => doc.estilos[f.frameId]?.[campo] ?? {}
  const visiveis = doc.frames.filter((x) => !x.oculto)
  const idx = Math.max(1, visiveis.indexOf(f) + 1)
  const total = visiveis.length
  const variante = f.variante ?? "a"

  const cond: EstiloBase = { fontFamily: FONTE_TITULO, fontWeight: 800, textTransform: "uppercase", letterSpacing: "-0.01em", lineHeight: 0.96 }
  const serif: EstiloBase = { fontFamily: FONTE_APOIO, fontStyle: "italic", fontWeight: 400 }
  const isSel = (campo: Campo) => Boolean(sel && sel.frameId === f.frameId && sel.campo === campo)

  const T = (campo: Campo, base: BaseTexto) => {
    const e = est(campo)
    const texto = f.textos[campo] ?? ""
    const sz = base.fontSize * ((e.escala ?? 100) / 100) * fitFactor(texto.length, limiteDe(f.tipo, campo))
    const cor = e.cor && doc.cores[e.cor] ? doc.cores[e.cor] : base.color
    const on = isSel(campo) && Boolean(interactive)
    const editing = on && Boolean(sel?.editing)

    const drag = (ev: ReactPointerEvent, modo: "y" | "s") => {
      ev.preventDefault()
      ev.stopPropagation()
      const y0 = ev.clientY
      const x0 = ev.clientX
      const dy0 = e.dy ?? 0
      const es0 = e.escala ?? 100
      const calc = (m: PointerEvent): EstiloTexto =>
        modo === "y"
          ? { dy: clamp(Math.round(dy0 + (m.clientY - y0) / scale), -420, 420) }
          : { escala: clamp(Math.round(es0 + (m.clientX - x0) / scale / 6), 50, 170) }
      const mv = (m: PointerEvent) => onDragEst?.(f.frameId, campo, calc(m), false)
      const up = (m: PointerEvent) => {
        window.removeEventListener("pointermove", mv)
        window.removeEventListener("pointerup", up)
        onDragEst?.(f.frameId, campo, calc(m), true)
      }
      window.addEventListener("pointermove", mv)
      window.addEventListener("pointerup", up)
    }

    const { marginTop, maxWidth, fontSize: _fs, ...inner } = base
    const wrap: CSSProperties = { position: "relative", transform: `translateY(${S(e.dy ?? 0)}px)` }
    if (maxWidth) wrap.maxWidth = maxWidth
    if (marginTop) wrap.marginTop = marginTop

    return (
      <div key={campo} style={wrap}>
        <div
          data-campo={campo}
          onClick={
            interactive
              ? (ev: ReactMouseEvent) => {
                  ev.stopPropagation()
                  if (!editing) onSelText?.({ frameId: f.frameId, campo, editing: false })
                }
              : undefined
          }
          onDoubleClick={
            interactive
              ? (ev: ReactMouseEvent) => {
                  ev.stopPropagation()
                  onSelText?.({ frameId: f.frameId, campo, editing: true })
                }
              : undefined
          }
          contentEditable={editing}
          suppressContentEditableWarning
          onBlur={interactive ? (ev) => onEditText?.(f.frameId, campo, ev.currentTarget.textContent ?? "") : undefined}
          onKeyDown={
            editing
              ? (ev) => {
                  if (ev.key === "Escape") (ev.currentTarget as HTMLElement).blur()
                  ev.stopPropagation()
                }
              : undefined
          }
          style={{
            ...inner,
            fontSize: S(sz),
            color: cor,
            fontWeight: e.peso ?? base.fontWeight,
            textAlign: e.align ?? base.textAlign,
            lineHeight: e.lh ?? base.lineHeight,
            outline: on ? `${Math.max(1, S(3))}px solid ${SLIDE.selecao}` : "none",
            outlineOffset: S(8),
            borderRadius: S(4),
            cursor: interactive ? (editing ? "text" : "default") : "default",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            minHeight: S(sz * 0.9),
          }}
        >
          {texto}
        </div>
        {on && (
          <>
            <div
              title="Arraste para subir ou descer"
              onPointerDown={(ev) => drag(ev, "y")}
              style={{
                position: "absolute",
                left: "50%",
                top: -6,
                transform: "translate(-50%, -100%)",
                height: 26,
                padding: "0 10px",
                borderRadius: 13,
                background: SLIDE.selecao,
                color: "#fff",
                display: "flex",
                alignItems: "center",
                gap: 6,
                cursor: "ns-resize",
                fontSize: 11,
                fontWeight: 600,
                fontFamily: FONTE_META,
                boxShadow: "0 4px 14px rgba(0,0,0,0.3)",
                userSelect: "none",
                whiteSpace: "nowrap",
                zIndex: 3,
                touchAction: "none",
              }}
            >
              <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3v18M8 7l4-4 4 4M8 17l4 4 4-4" />
              </svg>
              {e.dy ? `${e.dy > 0 ? "+" : ""}${e.dy}px` : "mover · duplo clique edita"}
            </div>
            <div
              title="Arraste para aumentar ou diminuir"
              onPointerDown={(ev) => drag(ev, "s")}
              style={{
                position: "absolute",
                right: -12,
                bottom: -12,
                width: 22,
                height: 22,
                borderRadius: 6,
                background: "#fff",
                border: `2px solid ${SLIDE.selecao}`,
                cursor: "nwse-resize",
                boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: SLIDE.selecao,
                zIndex: 3,
                touchAction: "none",
              }}
            >
              <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
                <path d="M20 4L4 20M20 12l-8 8M20 20h0" />
              </svg>
            </div>
            {e.escala != null && e.escala !== 100 && (
              <span style={{ position: "absolute", right: -12, bottom: 14, fontSize: 10.5, fontWeight: 700, color: "#fff", background: SLIDE.selecao, borderRadius: 5, padding: "1px 6px", fontFamily: FONTE_META, zIndex: 3 }}>
                {e.escala}%
              </span>
            )}
          </>
        )}
      </div>
    )
  }

  const brandRow = (
    <div
      style={{
        position: "absolute",
        top: S(off + 72),
        left: S(80),
        right: S(80),
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        color: meta,
        fontSize: S(22),
        fontWeight: 600,
        fontFamily: FONTE_META,
        letterSpacing: "0.02em",
      }}
    >
      {!oc.brandName ? <span>{bk.brandName}</span> : <span />}
      <span style={{ display: "flex", gap: S(28) }}>
        {!oc.brandName2 && <span>{bk.brandName2}</span>}
        {!oc.copyright && <span style={{ opacity: 0.8 }}>{bk.copyright}</span>}
      </span>
    </div>
  )

  const avatarRow = (dark: boolean) =>
    !oc.avatar && (
      <div style={{ display: "flex", alignItems: "center", gap: S(14), marginBottom: S(30) }}>
        {bk.avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={bk.avatar} alt="" crossOrigin="anonymous" style={{ width: S(56), height: S(56), borderRadius: "50%", objectFit: "cover", border: `${S(3)}px solid ${dark ? "#fff" : doc.cores.hook}` }} />
        ) : (
          <span
            style={{
              width: S(56),
              height: S(56),
              borderRadius: "50%",
              background: dark ? "#fff" : doc.cores.hook,
              color: dark ? doc.cores.hook : "#fff",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: S(28),
              fontWeight: 800,
              fontFamily: FONTE_META,
            }}
          >
            C
          </span>
        )}
        <span style={{ fontSize: S(28), fontWeight: 600, color: dark ? "#fff" : doc.cores.hook, fontFamily: FONTE_META }}>{bk.brandName}</span>
        {bk.verificado && !oc.verificado && (
          <span style={{ width: S(26), height: S(26), borderRadius: "50%", background: SLIDE.verificado, color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
            <IconCheck s={S(14)} />
          </span>
        )}
      </div>
    )

  const imgSlot = (style: CSSProperties, overlay?: string): ReactNode =>
    img ? (
      <div
        data-slot="imagem"
        onClick={
          interactive
            ? (ev) => {
                ev.stopPropagation()
                onSelImg?.({ frameId: f.frameId })
              }
            : undefined
        }
        style={{
          position: "absolute",
          overflow: "hidden",
          cursor: interactive ? "pointer" : "default",
          outline: imgSel && imgSel.frameId === f.frameId ? `${Math.max(1, S(3))}px dashed ${SLIDE.selecao}` : "none",
          ...style,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={img.url}
          alt=""
          crossOrigin="anonymous"
          style={{ width: "100%", height: "100%", objectFit: "cover", transform: `translate(${S(img.x)}px, ${S(img.y)}px) scale(${img.zoom / 100})`, display: "block" }}
        />
        {overlay && <div style={{ position: "absolute", inset: 0, background: overlay }} />}
      </div>
    ) : f.slotsImagem > 0 ? (
      <div
        data-slot="vazio"
        onClick={
          interactive
            ? (ev) => {
                ev.stopPropagation()
                onSelImg?.({ frameId: f.frameId, vazio: true })
              }
            : undefined
        }
        style={{
          position: "absolute",
          ...style,
          border: `${S(2)}px dashed ${escuro ? "rgba(255,255,255,0.35)" : "rgba(33,55,182,0.3)"}`,
          borderRadius: S(24),
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: escuro ? "rgba(255,255,255,0.5)" : "rgba(33,55,182,0.45)",
          fontSize: S(26),
          fontFamily: FONTE_META,
          fontWeight: 600,
          cursor: interactive ? "pointer" : "default",
        }}
      >
        + Imagem
      </div>
    ) : null

  const progress = (dark: boolean) => (
    <div style={{ display: "flex", gap: S(8), marginBottom: S(48) }}>
      {visiveis.map((x, i) => (
        <span key={x.frameId} style={{ flex: 1, height: S(8), borderRadius: S(4), background: i < idx ? (dark ? "#fff" : doc.cores.hook) : dark ? "rgba(255,255,255,0.25)" : "rgba(33,55,182,0.15)" }} />
      ))}
    </div>
  )

  let body: ReactNode
  if (f.tipo === "capa") {
    body = (
      <>
        {imgSlot({ inset: 0 }, "linear-gradient(180deg, rgba(4,19,102,0.05) 0%, rgba(4,19,102,0.35) 45%, rgba(4,19,102,0.95) 100%)")}
        <div
          style={{
            position: "absolute",
            left: S(80),
            right: S(80),
            ...(variante === "b" ? { top: "50%", transform: "translateY(-50%)", textAlign: "center" as const } : variante === "c" ? { top: S(off + 200) } : { bottom: S(off + 110) }),
          }}
        >
          {avatarRow(true)}
          {T("titulo", { ...cond, fontSize: 104, color: "#fff", textAlign: variante === "b" ? "center" : "left" })}
          {T("subtitulo", { ...serif, fontSize: 40, color: "rgba(255,255,255,0.88)", marginTop: S(28), lineHeight: 1.3, textAlign: variante === "b" ? "center" : "left" })}
        </div>
      </>
    )
  } else if (f.tipo === "dado") {
    body = (
      <div style={{ position: "absolute", left: S(80), right: S(80), top: S(off + 330) }}>
        {T("titulo", { ...cond, fontSize: 360, color: fg, letterSpacing: "-0.04em", lineHeight: 0.9 })}
        <div style={{ width: S(120), height: S(10), background: escuro ? "#fff" : doc.cores.destaque, margin: `${S(48)}px 0`, borderRadius: S(5) }} />
        {T("corpo", { ...serif, fontSize: 48, color: fg2, lineHeight: 1.3, maxWidth: S(860) })}
      </div>
    )
  } else if (f.tipo === "prova") {
    body = (
      <>
        {imgSlot({ inset: 0 }, "linear-gradient(180deg, rgba(4,19,102,0.75) 0%, rgba(4,19,102,0.92) 100%)")}
        <div style={{ position: "absolute", left: S(80), right: S(80), top: "50%", transform: "translateY(-50%)" }}>
          <div style={{ fontSize: S(200), lineHeight: 0.6, color: "rgba(255,255,255,0.35)", fontFamily: FONTE_APOIO, marginBottom: S(10) }}>“</div>
          {T("titulo", { ...cond, fontSize: 92, color: "#fff" })}
          {T("corpo", { ...serif, fontSize: 40, color: "rgba(255,255,255,0.85)", marginTop: S(30), lineHeight: 1.3 })}
        </div>
      </>
    )
  } else if (f.tipo === "lista" || f.tipo === "mec") {
    const meioTotal = Math.max(1, visiveis.filter((x) => x.tipo !== "capa" && x.tipo !== "cta").length)
    const meioIdx = Math.max(1, visiveis.filter((x) => x.tipo !== "capa" && x.tipo !== "cta").indexOf(f) + 1)
    body = (
      <div style={{ position: "absolute", left: S(80), right: S(80), top: S(off + 160), bottom: S(off + 100), display: "flex", flexDirection: "column" }}>
        {progress(escuro)}
        <div style={{ display: "flex", alignItems: "center", gap: S(18), marginBottom: S(36) }}>
          <span style={{ ...cond, fontSize: S(140), color: escuro ? "#fff" : doc.cores.destaque, lineHeight: 1 }}>{String(meioIdx).padStart(2, "0")}</span>
          <span style={{ fontSize: S(24), fontWeight: 700, letterSpacing: "0.2em", color: meta, fontFamily: FONTE_META, textTransform: "uppercase" }}>
            {f.tipo === "mec" ? "papel" : "item"} de {meioTotal}
          </span>
        </div>
        {T("titulo", { ...cond, fontSize: 88, color: fg })}
        {T("corpo", { fontSize: 40, color: fg2, marginTop: S(34), lineHeight: 1.4, fontFamily: FONTE_META, fontWeight: 500 })}
        {(img || f.slotsImagem > 0) && <div style={{ flex: 1, position: "relative", marginTop: S(50) }}>{imgSlot({ inset: 0, borderRadius: S(28) })}</div>}
      </div>
    )
  } else if (f.tipo === "cta") {
    body = (
      <div style={{ position: "absolute", left: S(80), right: S(80), top: "50%", transform: "translateY(-50%)", textAlign: "center" }}>
        {T("titulo", { ...cond, fontSize: 112, color: "#fff", textAlign: "center" })}
        {T("subtitulo", { ...serif, fontSize: 42, color: "rgba(255,255,255,0.88)", marginTop: S(30), lineHeight: 1.3, textAlign: "center" })}
        {doc.cta.mostrar && (
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: S(16),
              marginTop: S(70),
              background: doc.cta.fundo,
              color: doc.cta.cor,
              borderRadius: 999,
              padding: `${S(30)}px ${S(64)}px`,
              fontSize: S(34),
              fontWeight: 700,
              fontFamily: FONTE_META,
              boxShadow: `0 ${S(12)}px ${S(40)}px rgba(0,0,0,0.3)`,
            }}
          >
            <IconInbox s={S(30)} />
            {f.textos.botao || doc.cta.texto}
          </div>
        )}
      </div>
    )
  } else {
    const comImg = f.slotsImagem > 0
    const bloco = (
      <>
        {avatarRow(escuro)}
        {T("titulo", { ...cond, fontSize: 96, color: fg, textAlign: variante === "c" ? "center" : "left" })}
        {T("corpo", { ...serif, fontSize: 42, color: fg2, marginTop: S(36), lineHeight: 1.35, textAlign: variante === "c" ? "center" : "left" })}
      </>
    )
    const imagem = comImg && variante !== "c" && (
      <div style={{ flex: 1, position: "relative", minHeight: S(300), marginTop: variante === "a" ? S(56) : 0, marginBottom: variante === "b" ? S(56) : 0 }}>{imgSlot({ inset: 0, borderRadius: S(28) })}</div>
    )
    body = (
      <div style={{ position: "absolute", left: S(80), right: S(80), top: S(off + 180), bottom: S(off + 100), display: "flex", flexDirection: "column", justifyContent: variante === "c" ? "center" : "flex-start" }}>
        {variante === "b" ? (
          <>
            {imagem}
            {bloco}
          </>
        ) : (
          <>
            {bloco}
            {imagem}
          </>
        )}
      </div>
    )
  }

  const numeroClaro = f.tipo === "capa" || f.tipo === "prova" || f.tipo === "cta" || escuro

  return (
    <div id={domId} data-frame={f.frameId} style={{ width: S(W), height: S(H), background: bg, position: "relative", overflow: "hidden", flexShrink: 0, fontFamily: FONTE_META }}>
      {body}
      {brandRow}
      {zonas && (
        <>
          <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: S(off + 150), background: `repeating-linear-gradient(135deg, ${SLIDE.zona} 0 8px, transparent 8px 16px)`, borderBottom: `2px dashed ${SLIDE.zonaLinha}`, pointerEvents: "none" }}>
            <span style={{ position: "absolute", left: 12, bottom: 6, fontSize: 11, fontWeight: 700, color: "#fff", background: SLIDE.zonaEtiqueta, borderRadius: 4, padding: "2px 7px", fontFamily: FONTE_META }}>Zona da UI do Instagram · topo</span>
          </div>
          <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: S(off + 300), background: `repeating-linear-gradient(135deg, ${SLIDE.zona} 0 8px, transparent 8px 16px)`, borderTop: `2px dashed ${SLIDE.zonaLinha}`, pointerEvents: "none" }}>
            <span style={{ position: "absolute", left: 12, top: 6, fontSize: 11, fontWeight: 700, color: "#fff", background: SLIDE.zonaEtiqueta, borderRadius: 4, padding: "2px 7px", fontFamily: FONTE_META }}>Legenda, ações e handle · evite texto aqui</span>
          </div>
        </>
      )}
      <span style={{ position: "absolute", bottom: S(off + 52), right: S(80), fontSize: S(22), color: numeroClaro ? "rgba(255,255,255,0.65)" : meta, fontFamily: FONTE_META, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
        {idx}/{total}
      </span>
    </div>
  )
}
