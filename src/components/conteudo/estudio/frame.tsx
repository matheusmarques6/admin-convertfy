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
import { SLIDE, clarear, fundoEscuro, gradienteCss, hex6 } from "@/lib/conteudo/brand"
import { familiaDe, tracoDe } from "@/lib/conteudo/familias"
import { coresDoPost, medidasPost, posePost, subidaOptica } from "@/lib/conteudo/formato-post"
import { TWEET, contadoresDoTweet, infoDoTweet, mostrarInfo, mostrarMetricas } from "@/lib/conteudo/formato-tweet"
import { THREAD, THREAD_CORES, THREAD_PESO_CORPO, temBarraDeMetadados } from "@/lib/conteudo/formato-thread"
import { MANCHETE, corDoTituloManchete, fatoresDaEscada, linhasDoTitulo } from "@/lib/conteudo/formato-manchete"
import { fitFactor, limiteDe } from "@/lib/conteudo/limites"
import { partesDeTweet } from "@/lib/conteudo/entidades-do-x"
import { partesDestacadas, textoLimpo } from "@/lib/conteudo/rich"
import { textoDoEditavel } from "@/lib/conteudo/texto-editavel"
import type { Campo, DocFrame, Documento, EstiloTexto, FrameTipo } from "@/lib/conteudo/types"

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
  /** Qual foto da colagem (1 = a de sempre). Só o formato largo tem 2. */
  slot?: 1 | 2
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
type BaseTexto = EstiloBase & {
  fontSize: number
  marginTop?: number
  maxWidth?: number
  /**
   * Fatores por LINHA do texto (a escada da Manchete). Cada `\n` vira uma
   * linha com o seu corpo; a quebra automática não entra na conta porque
   * não há como dar corpo diferente a uma linha que o navegador criou.
   */
  escada?: number[]
}

/** `**x**` na cor de destaque. Fora da edição, sempre. */
function partesRicas(texto: string, corDestaque: string, corLink?: string) {
  // Nas identidades que simulam o X, `@menção`, `#hashtag` e link saem em
  // AZUL — num tweet de verdade nenhuma delas é da cor do texto, e escrever
  // tudo branco é o detalhe que mais denuncia um print falso. Fora delas o
  // comportamento é o de sempre (só o `**destaque**`).
  if (corLink) {
    return partesDeTweet(texto).map((parte, k) => (
      <span
        key={k}
        style={{
          ...(parte.link ? { color: corLink } : null),
          ...(parte.destaque ? { color: parte.link ? corLink : corDestaque, fontWeight: 700 } : null),
        }}
      >
        {parte.texto}
      </span>
    ))
  }
  return partesDestacadas(texto).map((parte, k) =>
    parte.destaque ? (
      <strong key={k} style={{ color: corDestaque, fontWeight: 700 }}>
        {parte.texto}
      </strong>
    ) : (
      <span key={k}>{parte.texto}</span>
    ),
  )
}

/**
 * O título em ESCADA: uma linha por `\n`, cada uma um passo menor.
 *
 * O `fontSize` do bloco já é o da primeira linha, então o fator entra como
 * `em` — assim o auto-fit por comprimento continua valendo para a escada
 * inteira, em vez de encolher só a linha maior e desmontar a proporção.
 */
function escadaDeLinhas(texto: string, fatores: number[], _sz: number, corDestaque: string, _S: (v: number) => number) {
  return linhasDoTitulo(texto).map((linha, i) => (
    <span key={i} style={{ display: "block", fontSize: `${fatores[Math.min(i, fatores.length - 1)]}em` }}>
      {/* Linha vazia ainda ocupa altura: sem o zero-width a quebra dupla
          do operador some do desenho e o respiro que ele pediu não existe. */}
      {linha.length > 0 ? partesRicas(linha, corDestaque) : "\u200b"}
    </span>
  ))
}

// Ícones inline (a exportação serializa o DOM: nada pode depender de CSS externo).
const IconCheck = ({ s }: { s: number }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
)
/**
 * Selo verificado da rede: a borda em lóbulos, não um círculo liso — é a
 * forma que o olho reconhece como "conta verificada", e um círculo com um
 * check dentro lê como ícone genérico.
 */
const IconSelo = ({ s, cor }: { s: number; cor: string }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" style={{ display: "block" }}>
    <path
      fill={cor}
      d="M22.25 12c0-1.43-.88-2.67-2.19-3.34.46-1.39.2-2.9-.81-3.91s-2.52-1.27-3.91-.81C14.67 2.63 13.43 1.75 12 1.75s-2.67.88-3.34 2.19c-1.39-.46-2.9-.2-3.91.81s-1.27 2.52-.81 3.91C2.63 9.33 1.75 10.57 1.75 12s.88 2.67 2.19 3.34c-.46 1.39-.2 2.9.81 3.91s2.52 1.27 3.91.81c.67 1.31 1.91 2.19 3.34 2.19s2.67-.88 3.34-2.19c1.39.46 2.9.2 3.91-.81s1.27-2.52.81-3.91c1.31-.67 2.19-1.91 2.19-3.34z"
    />
    <path fill="#FFFFFF" d="M10.54 16.2 6.8 12.46l1.41-1.42 2.26 2.26 4.8-5.23 1.47 1.36-6.2 6.77z" />
  </svg>
)
/**
 * Ícones do X, com os traçados da própria plataforma.
 *
 * O logotipo e os dois primeiros foram lidos do pacote `react-tweet`, que
 * é o embed oficial; os três de baixo são os do aplicativo. Desenhá-los
 * "parecidos" é o que faz um print falso ser reconhecido de longe.
 */
const IconX = ({ s }: { s: number }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor" style={{ display: "block" }}>
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
)

/**
 * Os cinco traçados são os do APLICATIVO, em contorno — não os do embed.
 *
 * O `react-tweet` desenha resposta e curtida PREENCHIDAS (no embed elas são
 * botões), e no print elas saíam como manchas sólidas ao lado de três
 * ícones em contorno. Foi o render que mostrou: nenhum teste pega peso de
 * ícone. No X, preenchido é o estado "eu interagi"; o print de um post de
 * terceiro — que é o que a peça imita — tem os cinco em cinza e contorno.
 */
const TRACADOS_DA_BARRA = {
  respostas:
    "M1.751 10c0-4.42 3.584-8 8.005-8h4.366c4.49 0 8.129 3.64 8.129 8.13 0 2.96-1.607 5.68-4.196 7.11l-8.054 4.46v-3.69h-.067c-4.49.1-8.183-3.51-8.183-8.01zm8.005-6c-3.317 0-6.005 2.69-6.005 6 0 3.37 2.77 6.08 6.138 6.01l.351-.01h1.761v2.3l5.087-2.81c1.951-1.08 3.163-3.13 3.163-5.36 0-3.39-2.744-6.13-6.129-6.13H9.756z",
  reposts:
    "M4.5 3.88l4.432 4.14-1.364 1.46L5.5 7.55V16c0 1.1.896 2 2 2H13v2H7.5c-2.209 0-4-1.79-4-4V7.55L1.432 9.48.068 8.02 4.5 3.88zM16.5 6H11V4h5.5c2.209 0 4 1.79 4 4v8.45l2.068-1.93 1.364 1.46-4.432 4.14-4.432-4.14 1.364-1.46 2.068 1.93V8c0-1.1-.896-2-2-2z",
  curtidas:
    "M16.697 5.5c-1.222-.06-2.679.51-3.89 2.16l-.805 1.09-.806-1.09C9.984 6.01 8.526 5.44 7.304 5.5c-1.243.07-2.349.78-2.91 1.91-.552 1.12-.633 2.78.479 4.82 1.074 1.97 3.257 4.27 7.129 6.61 3.87-2.34 6.052-4.64 7.126-6.61 1.111-2.04 1.03-3.7.477-4.82-.561-1.13-1.666-1.84-2.908-1.91zm4.187 7.69c-1.351 2.48-4.001 5.12-8.379 7.67l-.503.3-.504-.3c-4.379-2.55-7.029-5.19-8.382-7.67-1.36-2.5-1.41-4.86-.514-6.67.887-1.79 2.647-2.91 4.601-3.01 1.651-.09 3.368.56 4.798 2.01 1.429-1.45 3.146-2.1 4.796-2.01 1.954.1 3.714 1.22 4.601 3.01.896 1.81.846 4.17-.514 6.67z",
  visualizacoes: "M8.75 21V3h2v18h-2zM18 21V8.5h2V21h-2zM4 21l.004-10h2L6 21H4zm9.248 0v-7h2v7h-2z",
  salvos: "M4 4.5C4 3.12 5.119 2 6.5 2h11C18.881 2 20 3.12 20 4.5v18.44l-8-5.71-8 5.71V4.5zM6.5 4c-.276 0-.5.22-.5.5v14.56l6-4.29 6 4.29V4.5c0-.28-.224-.5-.5-.5h-11z",
} as const

const IconBarra = ({ s, d }: { s: number; d: string }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor" style={{ display: "block" }}>
    <path d={d} />
  </svg>
)

const IconCompartilhar = ({ s }: { s: number }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor" style={{ display: "block" }}>
    <path d="M12 2.59l5.7 5.7-1.41 1.42L13 6.41V16h-2V6.41l-3.3 3.3-1.41-1.42L12 2.59zM21 15l-.02 3.51c0 1.38-1.12 2.49-2.5 2.49H5.5C4.11 21 3 19.88 3 18.5V15h2v3.5c0 .28.22.5.5.5h12.98c.28 0 .5-.22.5-.5L19 15h2z" />
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
  // A tinta de apoio no fundo CLARO pode ser da família (`cores.apoio`):
  // a azul-marinho da casa num bloco preto-e-azul não é a mesma peça.
  const fg2 = escuro ? "rgba(255,255,255,0.82)" : (doc.cores.apoio ?? SLIDE.textoApoioClaro)
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

  // A família decide a tipografia e a forma dos elementos; o renderer não
  // tem mais fonte fixa. `padrao` reproduz exatamente o que existia antes.
  const tr = tracoDe(familiaDe(doc))
  const cond: EstiloBase = { fontFamily: tr.fonteTitulo, fontWeight: tr.tituloPeso, textTransform: tr.tituloCaixaAlta ? "uppercase" : "none", letterSpacing: tr.tituloTracking, lineHeight: tr.tituloEntrelinha }
  const serif: EstiloBase = { fontFamily: tr.fonteCorpo, fontStyle: tr.corpoItalico ? "italic" : "normal", fontWeight: 400 }
  const ganchoEstilo: EstiloBase = { fontFamily: tr.fonteGancho, fontStyle: "italic", fontWeight: 400, lineHeight: 1.1 }
  // Destaque legível nos dois fundos: a mesma cor, clareada no escuro.
  const corDestaque = escuro ? clarear(doc.cores.destaque ?? SLIDE.destaque, 0.55) : (doc.cores.destaque ?? SLIDE.destaque)
  // Tema do X (claro · Dim · Lights out · o medido no print). Só as duas
  // identidades que simulam a rede o consultam; nas demais é `undefined` e
  // o texto não ganha cor de link nenhuma.
  const coresX = coresDoPost(doc.temaPost)
  const corLinkDoX = tr.cartaoPerfil || tr.cartaoThread || tr.cartaoTweet ? coresX.link : undefined
  // Margem lateral da IDENTIDADE. A casa usa 80; a Manchete respira mais
  // (135 medidos na referência), e é essa folga que faz a peça ler como
  // editorial em vez de card cheio até a borda.
  const ML = S(tr.cartaoThread ? THREAD.margem : tr.logoNoTopo ? MANCHETE.margem : 80)
  /**
   * A cor do TÍTULO pode não ser a tinta do corpo. Na Manchete ele sai no
   * azul do destaque sobre o claro e no creme sobre o escuro — medido na
   * referência, onde o título do slide do erro é um bloco azul que ocupa
   * um terço da peça. `fg` continua valendo para as outras famílias.
   */
  const corTitulo = tr.tituloDestacado ? corDoTituloManchete(escuro, doc.cores.destaque ?? SLIDE.destaque) : fg
  /**
   * A escada só entra na CAPA. Lido da referência: o slide preto da
   * pergunta tem as duas linhas do mesmo corpo e o branco tem as três
   * iguais — ela é o gesto de ABRIR a peça, não um traço do fundo escuro.
   * Amarrar ao fundo (a primeira versão) errava o slide do problema.
   */
  const escadaDoTitulo = (campo: "titulo") => (tr.escadaNoTitulo && f.tipo === "capa" ? { escada: fatoresDaEscada(linhasDoTitulo(f.textos[campo] ?? "").length) } : {})
  /**
   * A CAIXA sólida de destaque: retângulo na cor de acento com o texto do
   * campo `destaque` dentro. Sem texto não desenha nada — caixa vazia é
   * uma barra de cor que o operador não sabe de onde veio.
   */
  const caixaDestaque = () => {
    if (!tr.caixaDeDestaque || !f.campos.includes("destaque")) return null
    if (!(f.textos.destaque ?? "").trim()) return null
    return (
      <div style={{ marginTop: S(48), background: doc.cores.destaque ?? SLIDE.destaque, borderRadius: S(MANCHETE.destaqueRaio), padding: `${S(MANCHETE.destaquePadY)}px ${S(MANCHETE.destaquePadX)}px` }}>
        {T("destaque", { ...serif, fontSize: MANCHETE.destaqueTexto, color: "#FFFFFF", lineHeight: 1.35 })}
      </div>
    )
  }
  /**
   * O ÍCONE da marca no topo — só ele, sem nome nem `@handle`. Sem avatar
   * no brand kit nada é desenhado: inventar uma marca é pior que o vazio.
   */
  const logoTopo = (centro = false) =>
    tr.logoNoTopo && !oc.avatar && bk.avatar ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={bk.avatar}
        alt=""
        crossOrigin="anonymous"
        style={{
          position: "absolute",
          top: S(off + (centro ? MANCHETE.logoTopoCapa : MANCHETE.logoTopo)),
          ...(centro ? { left: "50%", transform: "translateX(-50%)" } : { left: ML }),
          width: S(MANCHETE.logoTam),
          height: S(MANCHETE.logoTam),
          objectFit: "cover",
          borderRadius: S(8),
        }}
      />
    ) : null

  const isSel = (campo: Campo) => Boolean(sel && sel.frameId === f.frameId && sel.campo === campo)

  const T = (campo: Campo, base: BaseTexto) => {
    const e = est(campo)
    const texto = f.textos[campo] ?? ""
    const sz = base.fontSize * ((e.escala ?? 100) / 100) * fitFactor(textoLimpo(texto).length, limiteDe(f.tipo, campo, familiaDe(doc)))
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
          // `textContent` DESCARTA quebra de linha (o Chrome escreve um
          // `<div>` por parágrafo), e foi assim que o subtítulo da capa
          // gravou "PARAVOCÊ"/"MAISE" no banco. A escada do título depende
          // de `\n`, então ela era inalcançável por quem edita na tela.
          onBlur={interactive ? (ev) => onEditText?.(f.frameId, campo, textoDoEditavel(ev.currentTarget)) : undefined}
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
          {/* Editando, o texto vai CRU: o contentEditable devolve
              `textContent`, e formatar aqui apagaria os `**` no primeiro
              clique. Fora da edição, `**x**` sai na cor de destaque. */}
          {editing ? texto : base.escada ? escadaDeLinhas(texto, base.escada, sz, corDestaque, S) : partesRicas(texto, corDestaque, corLinkDoX)}
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
                fontFamily: tr.fonteMeta,
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
              <span style={{ position: "absolute", right: -12, bottom: 14, fontSize: 10.5, fontWeight: 700, color: "#fff", background: SLIDE.selecao, borderRadius: 5, padding: "1px 6px", fontFamily: tr.fonteMeta, zIndex: 3 }}>
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
        fontFamily: tr.fonteMeta,
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
    tr.assinaturaNoSlide &&
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
              fontFamily: tr.fonteMeta,
            }}
          >
            C
          </span>
        )}
        <span style={{ fontSize: S(28), fontWeight: 600, color: dark ? "#fff" : doc.cores.hook, fontFamily: tr.fonteMeta }}>{bk.brandName}</span>
        {bk.verificado && !oc.verificado && (
          <span style={{ width: S(26), height: S(26), borderRadius: "50%", background: SLIDE.verificado, color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
            <IconCheck s={S(14)} />
          </span>
        )}
      </div>
    )

  /**
   * Cabeçalho do print de tweet: avatar redondo, nome em 700 com o selo ao
   * lado e o `@handle` LOGO ABAIXO, no mesmo corpo do nome — é o que a
   * referência faz, e um handle menor vira legenda.
   *
   * O nome, o handle, a foto e o selo saem do brand kit (o perfil do canal
   * conectado), então trocar de perfil reescreve os quatro slides sem
   * ninguém digitar nada.
   */
  const cartaoPerfil = (m: ReturnType<typeof medidasPost>) => (
    <div style={{ display: "flex", alignItems: "center", gap: S(m.gapAvatar) }}>
      {!oc.avatar &&
        (bk.avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={bk.avatar}
            alt=""
            crossOrigin="anonymous"
            style={{
              width: S(m.avatar),
              height: S(m.avatar),
              borderRadius: "50%",
              objectFit: "cover",
              flexShrink: 0,
              display: "block",
              // Halo claro do formato largo: é o que faz a foto "acender"
              // sobre o preto, como na referência.
              ...(m.halo ? { boxShadow: `0 0 ${S(m.halo)}px rgba(255,255,255,0.16)` } : {}),
            }}
          />
        ) : (
          <span
            style={{
              width: S(m.avatar),
              height: S(m.avatar),
              borderRadius: "50%",
              background: coresX.avatarVazio,
              color: coresX.handle,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: S(m.avatar * 0.42),
              fontWeight: 700,
              flexShrink: 0,
            }}
          >
            {(bk.brandName2 || bk.brandName || "?").replace("@", "").charAt(0).toUpperCase()}
          </span>
        ))}
      <span style={{ minWidth: 0, lineHeight: 1.18 }}>
        {!oc.brandName2 && (
          <span style={{ display: "flex", alignItems: "center", gap: S(m.nome * 0.26) }}>
            <span style={{ fontSize: S(m.nome), fontWeight: 700, color: coresX.texto, whiteSpace: "nowrap" }}>{bk.brandName2}</span>
            {bk.verificado && !oc.verificado && (
              <span style={{ display: "inline-flex", flexShrink: 0 }}>
                <IconSelo s={S(m.selo)} cor={coresX.selo} />
              </span>
            )}
          </span>
        )}
        {!oc.brandName && <span style={{ display: "block", fontSize: S(m.nome), fontWeight: 400, color: coresX.handle, whiteSpace: "nowrap" }}>{bk.brandName}</span>}
      </span>
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
          borderRadius: S(tr.raio),
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: escuro ? "rgba(255,255,255,0.5)" : "rgba(33,55,182,0.45)",
          fontSize: S(26),
          fontFamily: tr.fonteMeta,
          fontWeight: 600,
          cursor: interactive ? "pointer" : "default",
        }}
      >
        + Imagem
      </div>
    ) : null

  /** Slot em fluxo (texto/lista/mec): respeita largura/altura máximas do painel de imagem. */
  const slotEmFluxo = (marginTop: number, marginBottom = 0) => {
    const lw = img?.larguraSlot ?? 1080
    const lh = img?.alturaSlot ?? 1350
    return (
      <div style={{ flex: 1, position: "relative", minHeight: S(300), marginTop: S(marginTop), marginBottom: S(marginBottom), display: "flex", justifyContent: "center" }}>
        <div style={{ position: "relative", width: `min(100%, ${S(lw)}px)`, maxHeight: S(lh), flex: 1 }}>{imgSlot({ inset: 0, borderRadius: S(tr.raio) })}</div>
      </div>
    )
  }

  /** Véu sobre a foto, na cor mais escura do documento (a família decide). */
  /**
   * Capa, prova e CTA escreviam em BRANCO fixo: nas duas primeiras
   * famílias esses três moram no gradiente (escuro) e o branco era certo
   * por construção. Na Alternado o CTA fecha no claro e a prova pode cair
   * no claro — e o texto sumia no fundo. Quem manda é o que está mesmo
   * atrás da letra: com imagem existe o véu escuro; sem imagem, o fundo
   * do slide.
   */
  const comVeu = Boolean(img)
  const escritaEscura = (tipo: FrameTipo): boolean =>
    (tipo === "capa" || tipo === "prova") && comVeu ? true : escuro
  const heroEscuro = escritaEscura(f.tipo)
  const heroFg = heroEscuro ? "#FFFFFF" : fg
  const heroFg2 = heroEscuro ? "rgba(255,255,255,0.88)" : fg2
  const heroGancho = heroEscuro ? "rgba(255,255,255,0.92)" : fg2

  const veu = (op: number): string => {
    const h = hex6(doc.gradiente.ate) ?? "041366"
    return `rgba(${parseInt(h.slice(0, 2), 16)}, ${parseInt(h.slice(2, 4), 16)}, ${parseInt(h.slice(4, 6), 16)}, ${op})`
  }

  /**
   * Linha de gancho: a serif itálica que faz o "par" com o título. O
   * tamanho e a cor vêm da família — `cor` é o que usar quando ela pede a
   * tinta (varia com o fundo do slide).
   */
  const gancho = (tamanho: number, cor: string, alinhamento: "left" | "center" = "left") =>
    (f.textos.gancho ?? "").trim()
      ? T("gancho", {
          ...ganchoEstilo,
          fontSize: tamanho * tr.ganchoFator,
          color: tr.ganchoCor === "tinta" ? cor : escuro ? "rgba(255,255,255,0.9)" : doc.cores.destaque,
          textAlign: alinhamento,
          marginTop: 0,
        })
      : null

  /** Anotação à mão, inclinada, na cor de destaque. */
  const anotacao = (tamanho: number, alinhamento: "left" | "right" = "right") =>
    (f.textos.anotacao ?? "").trim() ? (
      <div style={{ marginTop: S(26), textAlign: alinhamento, transform: `rotate(${tr.anotacaoRotacao}deg)`, transformOrigin: alinhamento === "right" ? "right center" : "left center" }}>
        {T("anotacao", { fontFamily: tr.fonteAnotacao, fontWeight: 600, fontSize: tamanho, color: corDestaque, lineHeight: 1.15, textAlign: alinhamento })}
      </div>
    ) : null

  const progress = (dark: boolean) => (
    <div style={{ display: "flex", gap: S(8), marginBottom: S(48) }}>
      {visiveis.map((x, i) => (
        <span key={x.frameId} style={{ flex: 1, height: S(8), borderRadius: S(4), background: i < idx ? (dark ? "#fff" : doc.cores.hook) : dark ? "rgba(255,255,255,0.25)" : veu(0.15) }} />
      ))}
    </div>
  )

  // Via B, modo "slide inteiro": o modelo desenhou o slide com o texto e a
  // marca; escrever por cima duplicaria a copy. A imagem ocupa tudo e o
  // rodapé de marca some — o prompt já pediu o rodapé ao modelo.
  const slideInteiro = f.imagemModo === "completo" && Boolean(img)

  let body: ReactNode
  if (slideInteiro) {
    body = imgSlot({ inset: 0 })
  } else if (tr.cartaoThread) {
    // Cartão de THREAD. Dois desenhos: o cartão claro (barra de metadados,
    // autoria e o fio de parágrafos com a foto no meio) e o FECHO preto,
    // que tem avatar, `@handle` e a frase — e mais nada.
    const fechoPreto = f.tipo === "cta"
    const tinta = fechoPreto ? "#FFFFFF" : THREAD_CORES.tinta
    const cinza = fechoPreto ? "rgba(255,255,255,0.62)" : THREAD_CORES.metadado
    const comImagem = Boolean(img) || f.slotsImagem > 0
    const avatarRedondo = (tam: number) =>
      oc.avatar ? null : bk.avatar ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={bk.avatar} alt="" crossOrigin="anonymous" style={{ width: S(tam), height: S(tam), borderRadius: "50%", objectFit: "cover", flexShrink: 0, display: "block" }} />
      ) : (
        // Sem foto vale a INICIAL, como no cartão de perfil. Um círculo
        // cinza chapado lê como imagem que não carregou — e é o que a
        // prateleira mostra, onde nenhum molde tem avatar.
        <span
          style={{
            width: S(tam),
            height: S(tam),
            borderRadius: "50%",
            background: fechoPreto ? "rgba(255,255,255,0.16)" : "#E7E9EC",
            color: fechoPreto ? "rgba(255,255,255,0.82)" : THREAD_CORES.metadado,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: tr.fonteTitulo,
            fontSize: S(tam * 0.42),
            fontWeight: 700,
            flexShrink: 0,
          }}
        >
          {(bk.brandName2 || bk.brandName || "?").replace("@", "").charAt(0).toUpperCase()}
        </span>
      )
    body = (
      <>
        {/* Barra de metadados: `@handle` · marca · copyright, cada um com o
            seu interruptor de visibilidade (os mesmos Campos globais). No
            fecho preto ela não entra: ali a marca já aparece na autoria. */}
        {temBarraDeMetadados(f.tipo) && (
          <div
            style={{
              position: "absolute",
              left: ML,
              right: ML,
              top: S(off + THREAD.metaTopo),
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: S(16),
              fontFamily: tr.fonteMeta,
              fontSize: S(THREAD.metaTexto),
              color: cinza,
              whiteSpace: "nowrap",
            }}
          >
            <span>{oc.brandName ? "" : bk.brandName}</span>
            <span>{oc.brandName2 ? "" : bk.brandName2}</span>
            <span>{oc.copyright ? "" : bk.copyright}</span>
          </div>
        )}
        {fechoPreto ? (
          <>
            <div style={{ position: "absolute", left: ML, right: ML, top: S(off + THREAD.fechoTopo), display: "flex", alignItems: "center", gap: S(THREAD.avatarGap) }}>
              {avatarRedondo(THREAD.avatar)}
              {!oc.brandName && <span style={{ fontFamily: tr.fonteMeta, fontSize: S(THREAD.handle), color: "rgba(255,255,255,0.82)" }}>{bk.brandName}</span>}
            </div>
            <div style={{ position: "absolute", left: ML, right: ML, top: "50%", transform: "translateY(-50%)" }}>
              {T("titulo", { fontFamily: tr.fonteTitulo, fontWeight: 700, fontSize: THREAD.fechoTexto, color: tinta, lineHeight: 1.26 })}
            </div>
          </>
        ) : (
          <div style={{ position: "absolute", left: ML, right: ML, top: S(off + THREAD.autoriaTopo), bottom: S(off + THREAD.metaTopo) }}>
            <div style={{ display: "flex", alignItems: "center", gap: S(THREAD.avatarGap) }}>
              {avatarRedondo(THREAD.avatar)}
              <span style={{ minWidth: 0, lineHeight: 1.16 }}>
                {!oc.brandName2 && (
                  <span style={{ display: "flex", alignItems: "center", gap: S(10) }}>
                    <span style={{ fontFamily: tr.fonteTitulo, fontSize: S(THREAD.nome), fontWeight: 700, color: tinta, whiteSpace: "nowrap" }}>{bk.brandName2}</span>
                    {/* O selo é chrome da INTERFACE simulada, como a barra de
                        metadados e o handle — não é a paleta da peça. Preso ao
                        `destaque` do documento ele viraria vermelho quando
                        alguém trocasse a cor global, e nenhuma rede faz isso. */}
                    {!oc.verificado && bk.verificado && <IconSelo s={S(THREAD.nome * 0.62)} cor={THREAD_CORES.metadado} />}
                  </span>
                )}
                {!oc.brandName && <span style={{ display: "block", fontFamily: tr.fonteMeta, fontSize: S(THREAD.handle), color: cinza, whiteSpace: "nowrap" }}>{bk.brandName}</span>}
              </span>
            </div>
            {/* O FIO: `titulo` é o que vem antes da foto e `corpo` o que vem
                depois. É assim que o cartão de thread quebra o parágrafo em
                volta da imagem — sem o corte a foto ia parar no fim. */}
            {T("titulo", { fontFamily: tr.fonteCorpo, fontWeight: THREAD_PESO_CORPO, fontSize: THREAD.corpo, color: tinta, lineHeight: THREAD.corpoEntrelinha, marginTop: S(THREAD.autoriaGap) })}
            {comImagem && (
              <div style={{ position: "relative", height: S(460), marginTop: S(THREAD.imagemGap) }}>{imgSlot({ inset: 0, borderRadius: S(THREAD.imagemRaio) })}</div>
            )}
            {T("corpo", { fontFamily: tr.fonteCorpo, fontWeight: THREAD_PESO_CORPO, fontSize: THREAD.corpo, color: tinta, lineHeight: THREAD.corpoEntrelinha, marginTop: S(comImagem ? THREAD.imagemGap : THREAD.paragrafoGap) })}
          </div>
        )}
      </>
    )
  } else if (tr.cartaoTweet) {
    // Cartão COMPLETO do X: moldura, logo no canto, texto, foto, a linha de
    // `hora · data · visualizações` e a barra de contadores. Ele não tem
    // pose: o cartão cresce com o conteúdo e fica centrado no slide, que é
    // como um print de post aparece.
    const comImagem = Boolean(img) || f.slotsImagem > 0
    const img2 = f.imagens.slot2
    const galeria = Boolean(img2)
    const info = infoDoTweet(f.tweet)
    const temInfo = mostrarInfo(f.tweet)
    const temBarra = mostrarMetricas(f.tweet)
    const t1 = (f.textos.titulo ?? "").trim().length > 0
    const t2 = (f.textos.corpo ?? "").trim().length > 0
    const textoBase = { fontFamily: tr.fonteCorpo, fontWeight: 400, fontSize: TWEET.texto, color: coresX.texto, lineHeight: TWEET.textoEntrelinha }
    body = (
      <div style={{ position: "absolute", left: S(TWEET.margemDoSlide), right: S(TWEET.margemDoSlide), top: "50%", transform: "translateY(-50%)" }}>
        <div
          style={{
            background: coresX.fundo,
            border: `${Math.max(1, S(TWEET.borda))}px solid ${coresX.borda}`,
            borderRadius: S(TWEET.raioCartao),
            padding: `${S(TWEET.recuoVertical)}px ${S(TWEET.recuoLateral)}px`,
          }}
        >
          {/* Cabeçalho: avatar · nome com selo sobre o `@handle` · logo do X.
              O nome e o handle ficam EMPILHADOS (é o que o X faz) e a
              coluna centraliza na altura do avatar. */}
          <div style={{ display: "flex", alignItems: "stretch", paddingBottom: S(TWEET.gapCabecalho), fontSize: S(TWEET.cabecalho), lineHeight: TWEET.cabecalhoEntrelinha, fontFamily: tr.fonteMeta }}>
            {!oc.avatar &&
              (bk.avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={bk.avatar} alt="" crossOrigin="anonymous" style={{ width: S(TWEET.avatar), height: S(TWEET.avatar), borderRadius: "50%", objectFit: "cover", flexShrink: 0, display: "block" }} />
              ) : (
                <span
                  style={{
                    width: S(TWEET.avatar),
                    height: S(TWEET.avatar),
                    borderRadius: "50%",
                    background: coresX.avatarVazio,
                    color: coresX.handle,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: S(TWEET.avatar * 0.42),
                    fontWeight: 700,
                    flexShrink: 0,
                  }}
                >
                  {(bk.brandName2 || bk.brandName || "?").replace("@", "").charAt(0).toUpperCase()}
                </span>
              ))}
            <span style={{ display: "flex", flexDirection: "column", justifyContent: "center", margin: `0 ${S(TWEET.gapAutor)}px`, minWidth: 0 }}>
              {!oc.brandName2 && (
                <span style={{ display: "flex", alignItems: "center", gap: S(TWEET.cabecalho * 0.2) }}>
                  <span style={{ fontWeight: 700, color: coresX.texto, whiteSpace: "nowrap" }}>{bk.brandName2}</span>
                  {bk.verificado && !oc.verificado && (
                    <span style={{ display: "inline-flex", flexShrink: 0 }}>
                      <IconSelo s={S(TWEET.selo)} cor={coresX.selo} />
                    </span>
                  )}
                </span>
              )}
              {!oc.brandName && <span style={{ color: coresX.handle, whiteSpace: "nowrap" }}>{bk.brandName}</span>}
            </span>
            <span style={{ marginLeft: "auto", color: coresX.texto, display: "flex", alignItems: "flex-start", flexShrink: 0 }}>
              <IconX s={S(TWEET.logo)} />
            </span>
          </div>

          {/* O texto do post: dois parágrafos no MESMO peso — o X não tem
              negrito. A divisão existe para a foto poder entrar no meio. */}
          {t1 && T("titulo", textoBase)}
          {t2 && T("corpo", { ...textoBase, marginTop: t1 ? S(TWEET.gapParagrafo) : 0 })}

          {comImagem && (
            <div style={{ display: "flex", gap: S(TWEET.gapGaleria), height: S(TWEET.alturaImagem), marginTop: S(TWEET.gapImagem), borderRadius: S(TWEET.raioImagem), overflow: "hidden", border: `${Math.max(1, S(TWEET.borda))}px solid ${coresX.borda}` }}>
              <div style={{ flex: 1, position: "relative" }}>{imgSlot({ inset: 0 })}</div>
              {galeria && img2 && (
                <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={img2.url}
                    alt=""
                    crossOrigin="anonymous"
                    onClick={interactive ? (ev) => { ev.stopPropagation(); onSelImg?.({ frameId: f.frameId, slot: 2 }) } : undefined}
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                      display: "block",
                      cursor: interactive ? "pointer" : "default",
                      transform: `translate(${S(img2.x)}px, ${S(img2.y)}px) scale(${img2.zoom / 100})`,
                      outline: imgSel && imgSel.frameId === f.frameId && imgSel.slot === 2 ? `${Math.max(1, S(3))}px dashed ${SLIDE.selecao}` : "none",
                    }}
                  />
                </div>
              )}
            </div>
          )}

          {temInfo && (
            <div style={{ marginTop: S(TWEET.gapInfo), color: coresX.handle, fontSize: S(TWEET.info), lineHeight: TWEET.infoEntrelinha, fontFamily: tr.fonteMeta, whiteSpace: "nowrap", overflow: "hidden" }}>
              {[info.hora, info.data].filter(Boolean).join(" · ")}
              {info.visualizacoes && (
                <>
                  {(info.hora || info.data) && " · "}
                  <span style={{ fontWeight: 700, color: coresX.texto }}>{info.visualizacoes}</span> Visualizações
                </>
              )}
            </div>
          )}

          {temBarra && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginTop: S(TWEET.gapBarra),
                paddingTop: S(TWEET.recuoBarra),
                borderTop: `${Math.max(1, S(TWEET.borda))}px solid ${coresX.borda}`,
                color: coresX.handle,
                fontFamily: tr.fonteMeta,
                fontSize: S(TWEET.contador),
                lineHeight: TWEET.contadorEntrelinha,
                fontWeight: 700,
              }}
            >
              {contadoresDoTweet(f.tweet).map((x) => (
                <span key={x.chave} style={{ display: "flex", alignItems: "center", gap: S(TWEET.gapIcone), color: coresX.handle }}>
                  <IconBarra s={S(TWEET.iconeContador)} d={TRACADOS_DA_BARRA[x.chave]} />
                  {x.valor && <span style={{ fontVariantNumeric: "tabular-nums" }}>{x.valor}</span>}
                </span>
              ))}
              <span style={{ display: "flex", alignItems: "center", color: coresX.handle }}>
                <IconCompartilhar s={S(TWEET.iconeContador)} />
              </span>
            </div>
          )}
        </div>
      </div>
    )
  } else if (tr.cartaoPerfil) {
    // Print de tweet: UM desenho para todo tipo de frame. A pose vem da
    // imagem (com print abre no topo, só texto fica no centro óptico), e as
    // medidas são as da referência, convertidas em `formato-post.ts`.
    const comImagem = Boolean(img) || f.slotsImagem > 0
    const pose = posePost(comImagem, f.variante)
    const m = medidasPost(pose, f.tipo, tr.estiloPost)
    const img2 = f.imagens.slot2
    // Colagem: só o formato que a declara (`gapGaleria`) desenha a segunda
    // foto. Fora dele ela fica guardada sem aparecer — trocar de
    // identidade não pode apagar o que alguém enviou.
    const galeria = m.gapGaleria > 0 && Boolean(img2)
    const temTitulo = (f.textos.titulo ?? "").trim().length > 0
    body = (
      <div
        style={{
          position: "absolute",
          left: S(m.margem),
          right: S(m.margem),
          ...(pose === "topo"
            ? { top: S(off + m.topo), bottom: S(off + m.rodape) }
            : { top: "50%", transform: `translateY(calc(-50% - ${S(H * subidaOptica(tr.estiloPost ?? "post"))}px))` }),
          display: "flex",
          flexDirection: "column",
        }}
      >
        {cartaoPerfil(m)}
        <div style={{ marginTop: S(m.gapCabecalho) }}>
          {temTitulo && T("titulo", { fontFamily: tr.fonteTitulo, fontWeight: 700, fontSize: m.texto, color: coresX.texto, lineHeight: m.entrelinha, letterSpacing: "0" })}
          {T("corpo", { fontFamily: tr.fonteCorpo, fontWeight: 400, fontSize: m.texto, color: coresX.texto, lineHeight: m.entrelinha, marginTop: temTitulo ? S(m.gapTitulo) : 0 })}
        </div>
        {comImagem && (
          // A imagem tem margem lateral PRÓPRIA — no desenhado ela é maior
          // que a do texto, e é o recuo que faz o print parecer um anexo
          // do post em vez de o fundo do slide.
          <div style={{ flex: 1, display: "flex", gap: S(m.gapGaleria), minHeight: S(300), marginTop: S(m.gapImagem), marginLeft: S(m.margemImagem - m.margem), marginRight: S(m.margemImagem - m.margem) }}>
            <div style={{ flex: 1, position: "relative" }}>{imgSlot({ inset: 0, borderRadius: S(m.raioImagem) })}</div>
            {galeria && img2 && (
              <div style={{ flex: 1, position: "relative", overflow: "hidden", borderRadius: S(m.raioImagem) }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={img2.url}
                  alt=""
                  crossOrigin="anonymous"
                  onClick={interactive ? (ev) => { ev.stopPropagation(); onSelImg?.({ frameId: f.frameId, slot: 2 }) } : undefined}
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    display: "block",
                    cursor: interactive ? "pointer" : "default",
                    transform: `translate(${S(img2.x)}px, ${S(img2.y)}px) scale(${img2.zoom / 100})`,
                    outline: imgSel && imgSel.frameId === f.frameId && imgSel.slot === 2 ? `${Math.max(1, S(3))}px dashed ${SLIDE.selecao}` : "none",
                  }}
                />
              </div>
            )}
          </div>
        )}
        {f.tipo === "cta" && doc.cta.mostrar && (f.textos.botao || doc.cta.texto) && (
          <div style={{ marginTop: S(m.gapCabecalho) }}>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: S(14),
                background: doc.cta.fundo,
                color: doc.cta.cor,
                borderRadius: 999,
                padding: `${S(m.texto * 0.5)}px ${S(m.texto * 1.15)}px`,
                fontSize: S(m.texto * 0.78),
                fontWeight: 600,
              }}
            >
              <IconInbox s={S(m.texto * 0.7)} />
              {f.textos.botao || doc.cta.texto}
            </span>
          </div>
        )}
      </div>
    )
  } else if (f.tipo === "capa" && tr.escadaNoTitulo) {
    // Capa da Manchete: a foto sangra, o véu desce até o preto e a tese
    // fecha no rodapé em ESCADA, centralizada. O véu vai mais longe que o
    // da casa (0,55 no meio contra 0,35) porque a referência é uma foto em
    // preto e branco com o título por cima — com pouco véu a escada some.
    //
    // SEM foto o slot deixa de sangrar: vira um convite na METADE de cima e
    // a tese fecha logo abaixo dele. Com o título no rodapé de um retângulo
    // preto vazio a capa parece um slide que não carregou — e é assim que
    // ela aparece na prateleira do Estúdio e num carrossel recém-criado,
    // que são justamente os dois momentos em que ninguém pôs foto ainda.
    // Centralizar o texto sobre o slot sangrado não resolve: o convite
    // "+ Imagem" é centrado no próprio slot e cairia POR BAIXO da letra.
    body = img ? (
      <>
        {imgSlot({ inset: 0 }, `linear-gradient(180deg, ${veu(0.1)} 0%, ${veu(0.55)} 42%, ${veu(0.98)} 82%, ${veu(1)} 100%)`)}
        <div style={{ position: "absolute", left: ML, right: ML, bottom: S(off + 112), textAlign: "center" }}>
          {T("titulo", { ...cond, fontSize: MANCHETE.tituloCapa, color: "#FFFFFF", textAlign: "center", ...escadaDoTitulo("titulo") })}
          {T("subtitulo", { ...serif, fontSize: MANCHETE.texto, color: "rgba(255,255,255,0.92)", marginTop: S(30), lineHeight: 1.3, textAlign: "center" })}
        </div>
      </>
    ) : (
      <div style={{ position: "absolute", left: ML, right: ML, top: S(off + 210), bottom: S(off + 150), display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <div style={{ height: S(470), position: "relative", marginBottom: S(74) }}>{imgSlot({ inset: 0, borderRadius: S(tr.raio) })}</div>
        {T("titulo", { ...cond, fontSize: MANCHETE.tituloCapa, color: "#FFFFFF", textAlign: "center", ...escadaDoTitulo("titulo") })}
        {T("subtitulo", { ...serif, fontSize: MANCHETE.texto, color: "rgba(255,255,255,0.92)", marginTop: S(30), lineHeight: 1.3, textAlign: "center" })}
      </div>
    )
  } else if (f.tipo === "capa") {
    body = (
      <>
        {imgSlot({ inset: 0 }, `linear-gradient(180deg, ${veu(0.05)} 0%, ${veu(0.35)} 45%, ${veu(0.95)} 100%)`)}
        <div
          style={{
            position: "absolute",
            left: S(80),
            right: S(80),
            ...(variante === "b" ? { top: "50%", transform: "translateY(-50%)", textAlign: "center" as const } : variante === "c" ? { top: S(off + 200) } : { bottom: S(off + 110) }),
          }}
        >
          {avatarRow(true)}
          {gancho(58, heroGancho, variante === "b" ? "center" : "left")}
          {T("titulo", { ...cond, fontSize: 104, color: heroFg, textAlign: variante === "b" ? "center" : "left" })}
          {T("subtitulo", { ...serif, fontSize: 40, color: heroFg2, marginTop: S(28), lineHeight: 1.3, textAlign: variante === "b" ? "center" : "left" })}
        </div>
      </>
    )
  } else if (f.tipo === "dado") {
    body = (
      <div style={{ position: "absolute", left: S(80), right: S(80), top: S(off + 300) }}>
        {gancho(52, fg2)}
        {T("titulo", { ...cond, fontSize: 360, color: fg, letterSpacing: "-0.04em", lineHeight: 0.9 })}
        <div style={{ width: S(120), height: S(10), background: escuro ? "#fff" : doc.cores.destaque, margin: `${S(48)}px 0`, borderRadius: S(5) }} />
        {T("corpo", { ...serif, fontSize: 48, color: fg2, lineHeight: 1.3, maxWidth: S(860) })}
        {anotacao(44)}
      </div>
    )
  } else if (f.tipo === "prova") {
    body = (
      <>
        {imgSlot({ inset: 0 }, `linear-gradient(180deg, ${veu(0.75)} 0%, ${veu(0.92)} 100%)`)}
        <div style={{ position: "absolute", left: S(80), right: S(80), top: "50%", transform: "translateY(-50%)" }}>
          <div style={{ fontSize: S(200), lineHeight: 0.6, color: heroEscuro ? "rgba(255,255,255,0.35)" : corDestaque, fontFamily: tr.fonteGancho, marginBottom: S(10) }}>“</div>
          {gancho(52, heroGancho)}
          {T("titulo", { ...cond, fontSize: 92, color: heroFg })}
          {T("corpo", { ...serif, fontSize: 40, color: heroFg2, marginTop: S(30), lineHeight: 1.3 })}
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
          <span style={{ fontSize: S(24), fontWeight: 700, letterSpacing: "0.2em", color: meta, fontFamily: tr.fonteMeta, textTransform: "uppercase" }}>
            {f.tipo === "mec" ? "papel" : "item"} de {meioTotal}
          </span>
        </div>
        {gancho(46, fg2)}
        {T("titulo", { ...cond, fontSize: 88, color: fg })}
        {T("corpo", { fontSize: 40, color: fg2, marginTop: S(34), lineHeight: 1.4, fontFamily: tr.fonteCorpo, fontWeight: 500, fontStyle: tr.corpoItalico ? "italic" : "normal" })}
        {(img || f.slotsImagem > 0) && slotEmFluxo(50)}
        {anotacao(42)}
      </div>
    )
  } else if (f.tipo === "cta" && tr.logoNoTopo) {
    // Chamada da Manchete: título à ESQUERDA, uma régua fina e o pedido em
    // caixa mista. Sem pílula: na referência o CTA é texto, e um botão
    // desenhado ali devolveria a peça para a cara de card de rede social.
    body = (
      <div style={{ position: "absolute", left: ML, right: ML, top: "50%", transform: "translateY(-50%)" }}>
        {T("titulo", { ...cond, fontSize: MANCHETE.titulo, color: corTitulo })}
        <div style={{ height: Math.max(1, S(2)), background: escuro ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.85)", margin: `${S(MANCHETE.reguaRespiro)}px 0` }} />
        {T("subtitulo", { ...serif, fontSize: MANCHETE.texto + 3, color: fg2, lineHeight: MANCHETE.entrelinhaTexto })}
      </div>
    )
  } else if (f.tipo === "cta") {
    body = (
      <div style={{ position: "absolute", left: S(80), right: S(80), top: "50%", transform: "translateY(-50%)", textAlign: "center" }}>
        {T("titulo", { ...cond, fontSize: 112, color: heroFg, textAlign: "center" })}
        {T("subtitulo", { ...serif, fontSize: 42, color: heroFg2, marginTop: S(30), lineHeight: 1.3, textAlign: "center" })}
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
              fontFamily: tr.fonteMeta,
              // Pílula: borda fina e nada de sombra — é o traço da família
              // editorial, onde a peça imita papel, não interface.
              ...(tr.cta === "pilula"
                ? { border: `${Math.max(1, S(2))}px solid ${doc.cta.cor}`, letterSpacing: "0.02em" }
                : tr.cta === "bloco"
                  ? // Caixa sólida: canto quase reto, texto condensado em
                    // caixa alta e nada de sombra. Na Manchete ela é um elemento
                    // do DESENHO — o bloco de cor que fecha a peça —, não um
                    // botão imitando interface.
                    { borderRadius: S(10), padding: `${S(34)}px ${S(56)}px`, fontFamily: tr.fonteTitulo, fontWeight: tr.tituloPeso, textTransform: "uppercase" as const, letterSpacing: "0.01em", fontSize: S(46) }
                  : { boxShadow: `0 ${S(12)}px ${S(40)}px rgba(0,0,0,0.3)` }),
            }}
          >
            <IconInbox s={S(tr.cta === "bloco" ? 38 : 30)} />
            {f.textos.botao || doc.cta.texto}
          </div>
        )}
      </div>
    )
  } else {
    const comImg = f.slotsImagem > 0
    /**
     * Na Manchete a foto entra ENTRE o título e o corpo (variante "a") ou
     * ABRE o slide (variante "b") — são os dois arranjos da referência. Nas
     * famílias da casa a imagem fecha o bloco, como sempre.
     */
    // Com CAIXA de destaque a foto vai para o FIM: a caixa já é o corte
    // entre a afirmação e o argumento, e uma foto no meio criaria um
    // segundo corte no mesmo lugar. É a ordem do slide preto da
    // referência (título → caixa → corpo → foto).
    const temCaixa = tr.caixaDeDestaque && f.campos.includes("destaque") && !!(f.textos.destaque ?? "").trim()
    const fotoNoMeio = tr.logoNoTopo && variante === "a" && !temCaixa
    const bloco = (
      <>
        {avatarRow(escuro)}
        {gancho(52, fg2, variante === "c" ? "center" : "left")}
        {T("titulo", { ...cond, fontSize: tr.logoNoTopo ? MANCHETE.titulo : 96, color: tr.tituloDestacado ? corTitulo : fg, textAlign: variante === "c" ? "center" : "left", ...escadaDoTitulo("titulo") })}
        {/* Régua entre a afirmação e o argumento: no slide sem foto não há
            outro corte, e os dois blocos de texto se colam. */}
        {tr.reguaSobCorpo && (f.textos.corpo ?? "").trim() ? (
          <div style={{ width: S(140), height: S(8), background: escuro ? corDestaque : doc.cores.destaque, marginTop: S(40), borderRadius: S(4), ...(variante === "c" ? { marginLeft: "auto", marginRight: "auto" } : {}) }} />
        ) : null}
        {/* A CAIXA vem logo depois do título, antes da foto e do corpo —
            é a ordem da referência: afirmação, a frase entre aspas que ela
            nega, e só então o argumento. No fim da coluna (onde ela estava)
            ela virava rodapé e perdia a função de contraponto. */}
        {caixaDestaque()}
        {fotoNoMeio && comImg ? slotEmFluxo(44, 0) : null}
        {T("corpo", { ...serif, fontSize: tr.logoNoTopo ? MANCHETE.texto : 42, color: fg2, marginTop: S(fotoNoMeio ? 44 : 36), lineHeight: tr.logoNoTopo ? MANCHETE.entrelinhaTexto : 1.35, textAlign: variante === "c" ? "center" : "left" })}
        {anotacao(44, variante === "c" ? "left" : "right")}
      </>
    )
    const imagem = comImg && variante !== "c" && !fotoNoMeio && slotEmFluxo(variante === "b" ? 0 : 56, variante === "b" ? 56 : 0)
    body = (
      <div style={{ position: "absolute", left: ML, right: ML, top: S(off + (tr.logoNoTopo ? 230 : 180)), bottom: S(off + 100), display: "flex", flexDirection: "column", justifyContent: variante === "c" ? "center" : "flex-start" }}>
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

  const numeroClaro = heroEscuro

  // Filete de cor no topo: presente em TODO slide da família que o pede.
  // É o que costura os nove slides como uma peça só quando o fundo muda
  // de claro para escuro a cada passo.
  const filete = tr.barraTopo ? (
    <div
      style={{
        position: "absolute",
        top: S(off),
        left: 0,
        right: 0,
        height: S(8),
        background: fundo === "gradiente" ? "rgba(255,255,255,0.20)" : corDestaque,
      }}
    />
  ) : null

  // Barra de progresso no rodapé. SUBSTITUI o "N/M" solto — dizer duas
  // vezes onde a pessoa está é ruído, e a barra diz o que o número não
  // diz: que existe um caminho até o fim.
  const progresso = tr.barraProgresso ? (
    <div
      style={{
        position: "absolute",
        bottom: S(off + 52),
        left: S(80),
        right: S(80),
        display: "flex",
        alignItems: "center",
        gap: S(24),
      }}
    >
      <span style={{ flex: 1, height: S(5), borderRadius: S(3), background: escuro ? "rgba(255,255,255,0.16)" : "rgba(0,0,0,0.10)", overflow: "hidden", display: "block" }}>
        <span
          style={{
            display: "block",
            height: "100%",
            borderRadius: S(3),
            width: `${Math.round((idx / Math.max(1, total)) * 100)}%`,
            background: escuro ? "#FFFFFF" : corDestaque,
          }}
        />
      </span>
      <span style={{ fontSize: S(22), fontWeight: 600, color: numeroClaro ? "rgba(255,255,255,0.55)" : meta, fontFamily: tr.fonteMeta, fontVariantNumeric: "tabular-nums" }}>
        {idx}/{total}
      </span>
    </div>
  ) : null

  return (
    <div id={domId} data-frame={f.frameId} style={{ width: S(W), height: S(H), background: bg, position: "relative", overflow: "hidden", flexShrink: 0, fontFamily: tr.fonteMeta }}>
      {body}
      {!slideInteiro && filete}
      {/* O print de tweet não tem rodapé de marca nem contador: a peça imita
          uma captura de tela, e o enfeite da casa denuncia que não é uma. */}
      {/* O rodapé de marca é das famílias da casa. Na Manchete quem carrega
          a marca é o ícone no topo, e repetir handle e copyright embaixo
          devolveria a peça para a cara de card de rede social. */}
      {!slideInteiro && !tr.cartaoPerfil && !tr.cartaoThread && !tr.cartaoTweet && !tr.logoNoTopo && brandRow}
      {!slideInteiro && logoTopo(f.tipo === "capa")}
      {zonas && (
        <>
          <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: S(off + 150), background: `repeating-linear-gradient(135deg, ${SLIDE.zona} 0 8px, transparent 8px 16px)`, borderBottom: `2px dashed ${SLIDE.zonaLinha}`, pointerEvents: "none" }}>
            <span style={{ position: "absolute", left: 12, bottom: 6, fontSize: 11, fontWeight: 700, color: "#fff", background: SLIDE.zonaEtiqueta, borderRadius: 4, padding: "2px 7px", fontFamily: tr.fonteMeta }}>Zona da UI do Instagram · topo</span>
          </div>
          <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: S(off + 300), background: `repeating-linear-gradient(135deg, ${SLIDE.zona} 0 8px, transparent 8px 16px)`, borderTop: `2px dashed ${SLIDE.zonaLinha}`, pointerEvents: "none" }}>
            <span style={{ position: "absolute", left: 12, top: 6, fontSize: 11, fontWeight: 700, color: "#fff", background: SLIDE.zonaEtiqueta, borderRadius: 4, padding: "2px 7px", fontFamily: tr.fonteMeta }}>Legenda, ações e handle · evite texto aqui</span>
          </div>
        </>
      )}
      {tr.cartaoPerfil || tr.cartaoThread || tr.cartaoTweet || tr.logoNoTopo ? null : tr.barraProgresso ? (
        !slideInteiro && progresso
      ) : (
        <span style={{ position: "absolute", bottom: S(off + 52), right: S(80), fontSize: S(22), color: numeroClaro ? "rgba(255,255,255,0.65)" : meta, fontFamily: tr.fonteMeta, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
          {idx}/{total}
        </span>
      )}
    </div>
  )
}
