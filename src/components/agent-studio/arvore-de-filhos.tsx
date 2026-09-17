"use client"

/**
 * O LEQUE: as chamadas que um nó do canvas agrega, penduradas nele.
 *
 * Um nó do Estúdio mostrava uma linha — `137s · $0,019` — e essa linha era
 * a última run do agente, não o conjunto. No agente de imagem, que grava
 * uma run POR CAMPO, isso escondia 10 das 11 chamadas e 89% do custo.
 * No Curador, que faz N chamadas dentro de UMA run, escondia todas.
 *
 * ── Por que flutua por cima ────────────────────────────────────────────
 *
 * As folhas NÃO entram em `STUDIO_NODES`: `layoutSignature()` invalida o
 * layout que o operador arrastou sempre que o conjunto de chaves muda, e o
 * leque não pode zerar o arranjo de alguém toda vez que abre. E o espaço
 * embaixo do nó não existe — `image` está em (2092, 308) e `copy_merge`
 * logo abaixo, em (2092, 452). Sem reflow num layout de posições
 * absolutas, a saída é flutuar com fundo opaco.
 *
 * ── As medidas, e por que cada uma é o que é ──────────────────────────
 *
 * Quatro defeitos de medida apareceram no primeiro leque com o leque do
 * Curador LIGADO (6 chamadas, 17/09), e os comentários abaixo existem para
 * eles não voltarem: a barra lateral (`largura` esquecia a borda, e
 * `overflow-y: auto` promove o outro eixo), o rótulo cortado (altura fixa
 * sem `line-height` declarado), o cabeçalho amassado (largura ditada só
 * pela grade) e seis folhas numa tira de uma coluna.
 */

import { X } from "lucide-react"
import { NODE_H, NODE_W } from "@/lib/agents/studio-graph"
import { C, F, TNUM } from "@/components/email-generation/ui/eg-theme"
import { SHADOW_MD, usd3 } from "./studio-atoms"
import type { FolhaDoNo, FolhaStatus } from "@/lib/agents/studio-arvore"
import { resumirFolhas } from "@/lib/agents/studio-arvore"

const CARTAO_W = 188
/**
 * Altura do cartão de texto.
 *
 * Era 42, e com `padding: 6px 8px` + `gap: 3` sobravam 27px para duas
 * linhas cujo `line-height` era o `normal` da fonte (~1,35): 10,5 + 10
 * viravam ~27,7px. Um `<button>` CENTRALIZA o conteúdo que estoura e corta
 * dos DOIS lados — era o rótulo com o topo das letras comido. O conserto é
 * o `line-height` declarado (13 + 12, abaixo); os 46 são a folga para o
 * defeito não voltar por meio pixel de fonte.
 */
const CARTAO_H = 46
const CARTAO_THUMB_H = 104
const GAP = 8
/** Borda e padding do cartão do leque — entram na conta da largura. */
const BORDA = 1
const PAD = 12
/** Largura reservada para a barra quando a grade rola (`scrollbar-gutter`). */
const CALHA = 14
/**
 * Teto de ALTURA da grade, não de contagem.
 *
 * Com 8 por coluna e miniatura, 11 filhos davam 948px — medido no
 * Chromium, quase o dobro da altura útil do canvas, cobrindo o nó de baixo
 * e o seguinte. O que limita é a altura; quantos cabem nela depende de o
 * cartão ter foto ou não.
 */
const ALTURA_MAX_DA_GRADE = 440
/**
 * Teto de COLUNAS.
 *
 * Só limitar a altura empurra o problema para o outro eixo: 11 filhos com
 * miniatura viraram 4 colunas e 826px de largura, que a partir do nó de
 * imagem (x=2092) cobre o resto do canvas. Estourados os dois tetos, a
 * grade ROLA — é melhor rolar dentro do cartão do que o cartão engolir a
 * tela.
 */
const COLUNAS_MAX = 3
/**
 * Régua de FORMA: nenhuma coluna passa de 5 cartões enquanto houver coluna
 * livre.
 *
 * Sem ela as colunas só cresciam ao estourar a altura (8 por coluna sem
 * miniatura), e as 6 chamadas do Curador viravam uma tira de 188 × 292px
 * pendurada no nó, com a segunda coluna vazia ao lado.
 */
const LINHAS_ALVO = 5
/** Piso de largura: o cabeçalho leva o resumo, e é ele a resposta na tela. */
const LARGURA_MIN = 248
/** Folga sob o nó: o `FlowNode` já põe a mensagem de erro em NODE_H + 7. */
const FOLGA = 34

const COR: Record<FolhaStatus, { c: string; bg: string; b: string }> = {
  sucesso: { c: "#065F46", bg: "#ECFDF5", b: "#A7F3D0" },
  erro: { c: "#991B1B", bg: "#FEF2F2", b: "#FECACA" },
  rodando: { c: "#2137B6", bg: "#EEF0FB", b: "#C7CDEF" },
  pulado: { c: "#6B7280", bg: "#F3F4F6", b: "#E5E7EB" },
}

const seg = (s: number | null | undefined) =>
  s == null ? "—" : s < 1 ? `${Math.round(s * 1000)}ms` : `${s.toFixed(1).replace(".", ",")}s`

/** Uma linha do resumo: cortada no fim, nunca quebrada em duas. */
const LINHA_RESUMO = {
  fontSize: 11,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
  ...TNUM,
} as const

export function ArvoreDeFilhos({
  pos,
  titulo,
  folhas,
  carregando,
  erro,
  selecionada,
  onEscolher,
  onFechar,
}: {
  pos: { x: number; y: number }
  titulo: string
  folhas: FolhaDoNo[]
  carregando?: boolean
  erro?: string | null
  selecionada?: string | null
  onEscolher: (folha: FolhaDoNo) => void
  onFechar: () => void
}) {
  const temThumb = folhas.some((f) => f.thumbUrl)
  const alturaCartao = temThumb ? CARTAO_THUMB_H : CARTAO_H
  const cabemNaAltura = Math.max(1, Math.floor(ALTURA_MAX_DA_GRADE / (alturaCartao + GAP)))
  // Duas réguas: o teto duro da altura e a forma. A forma nunca pode pedir
  // mais linhas do que cabem — com miniatura, `cabemNaAltura` é 3.
  const alvo = Math.min(LINHAS_ALVO, cabemNaAltura)
  const colunas = Math.min(
    COLUNAS_MAX,
    Math.max(1, Math.ceil(folhas.length / cabemNaAltura), Math.ceil(folhas.length / alvo)),
  )
  const porColuna = Math.max(1, Math.ceil(folhas.length / colunas))
  const alturaConteudo = porColuna * alturaCartao + (porColuna - 1) * GAP
  const rola = alturaConteudo > ALTURA_MAX_DA_GRADE
  // `box-sizing: border-box` (preflight do Tailwind): a borda e o padding
  // saem de DENTRO da largura. Somá-los aqui é o que faz a grade caber —
  // sem os 2px da borda, ela estourava por 2px em toda contagem de colunas
  // e a barra horizontal aparecia.
  const largura = Math.max(
    LARGURA_MIN,
    2 * BORDA + 2 * PAD + colunas * CARTAO_W + (colunas - 1) * GAP + (rola ? CALHA : 0),
  )
  const topo = pos.y + NODE_H + FOLGA
  const r = resumirFolhas(folhas)
  const aviso = carregando
    ? "carregando…"
    : erro
      ? erro
      : folhas.length === 0
        ? "nenhuma chamada registrada"
        : null

  return (
    <>
      {/* A curva do pé do nó até o cartão: é o que faz ler como leque. */}
      <svg
        width="1"
        height="1"
        style={{ position: "absolute", left: 0, top: 0, overflow: "visible", pointerEvents: "none", zIndex: 40 }}
      >
        <path
          d={`M ${pos.x + NODE_W / 2} ${pos.y + NODE_H} C ${pos.x + NODE_W / 2} ${pos.y + NODE_H + FOLGA / 2}, ${pos.x + 24} ${topo - FOLGA / 2}, ${pos.x + 24} ${topo}`}
          fill="none"
          stroke={C.brand}
          strokeWidth={1.5}
        />
      </svg>

      <div
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "absolute",
          left: pos.x,
          top: topo,
          width: largura,
          padding: PAD,
          borderRadius: 12,
          background: "#FFFFFF",
          border: `${BORDA}px solid ${C.border}`,
          boxShadow: SHADOW_MD,
          // Acima de grupos, arestas e nós: a colisão com o vizinho de
          // baixo não se resolve movendo nada num layout absoluto.
          zIndex: 50,
          fontFamily: F.sans,
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 10 }}>
          {/* O resumo vai ABAIXO do título e em DUAS linhas, na ordem da
              pergunta: quantas e quanto primeiro, tempo depois. Numa tira
              única de cinco pedaços ele quebrava em três linhas amassadas
              dentro do cartão estreito. */}
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
            <span
              style={{
                fontSize: 11.5,
                fontWeight: 700,
                color: C.g700,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {titulo}
            </span>
            {aviso ? (
              <span style={{ ...LINHA_RESUMO, color: C.g400 }}>{aviso}</span>
            ) : (
              <>
                <span style={{ ...LINHA_RESUMO, color: C.g500 }}>
                  {r.total} {r.total === 1 ? "chamada" : "chamadas"}
                  {r.falhas > 0 && (
                    <>
                      <span style={{ color: C.g300 }}> · </span>
                      {/* A falha é SINAL: não pode ficar cinza no fim de
                          uma tira, escondida atrás do custo. */}
                      <span style={{ color: COR.erro.c, fontWeight: 600 }}>
                        {r.falhas} {r.falhas === 1 ? "falhou" : "falharam"}
                      </span>
                    </>
                  )}
                  {r.usd > 0 && (
                    <>
                      <span style={{ color: C.g300 }}> · </span>
                      {usd3(r.usd)}
                    </>
                  )}
                </span>
                {/* As DUAS durações: os slots correm em paralelo, e cada
                    número sozinho mente. */}
                {r.somaSec != null && (
                  <span style={{ ...LINHA_RESUMO, color: C.g400 }}>
                    soma {seg(r.somaSec)}
                    {r.maiorSec != null && ` · maior ${seg(r.maiorSec)}`}
                  </span>
                )}
              </>
            )}
          </div>
          <button
            onClick={onFechar}
            aria-label="Fechar o leque"
            style={{
              flexShrink: 0,
              display: "grid",
              placeItems: "center",
              width: 20,
              height: 20,
              borderRadius: 6,
              border: `1px solid ${C.border}`,
              background: "#FFFFFF",
              color: C.g400,
              cursor: "pointer",
            }}
          >
            <X size={12} />
          </button>
        </div>

        {folhas.length > 0 && (
          <div
            style={{
              display: "grid",
              // `1fr` e não `188px` fixo: com a largura governada por fora
              // (o piso do cabeçalho), a coluna preenche o que sobra em vez
              // de deixar faixa morta — e meio pixel a favor nunca vira
              // transbordo.
              gridTemplateColumns: `repeat(${colunas}, minmax(0, 1fr))`,
              gridTemplateRows: `repeat(${porColuna}, ${alturaCartao}px)`,
              gridAutoFlow: "column",
              gap: GAP,
              maxHeight: ALTURA_MAX_DA_GRADE,
              // Os dois eixos declarados, sempre. `overflow-y: auto` com o
              // outro em `visible` PROMOVE o `visible` a `auto` (CSS
              // Overflow 3 §3.2) — e o leque vive dentro do `scale()` do
              // canvas, onde largura fracionária é regra. Era daí a barra
              // lateral.
              overflowX: "hidden",
              overflowY: rola ? "auto" : "hidden",
              scrollbarGutter: rola ? "stable" : undefined,
            }}
          >
            {folhas.map((f) => {
              const st = COR[f.status]
              const sel = selecionada === f.chave
              return (
                <button
                  key={f.chave}
                  onClick={() => onEscolher(f)}
                  title={f.err ?? f.sub ?? f.rotulo}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "stretch",
                    justifyContent: "center",
                    gap: 3,
                    padding: temThumb ? 6 : "6px 8px",
                    borderRadius: 8,
                    border: `1px solid ${sel ? C.brand : st.b}`,
                    background: sel ? "#F5F6FD" : st.bg,
                    cursor: "pointer",
                    textAlign: "left",
                    overflow: "hidden",
                  }}
                >
                  {temThumb && (
                    <div
                      style={{
                        height: 52,
                        borderRadius: 5,
                        background: f.thumbUrl ? `center/cover no-repeat url(${JSON.stringify(f.thumbUrl)})` : C.g100,
                        border: `1px solid ${st.b}`,
                        flexShrink: 0,
                      }}
                    />
                  )}
                  <span
                    style={{
                      fontSize: 10.5,
                      // Declarado, nunca o `normal` da fonte: o cartão tem
                      // altura fixa e o botão corta dos dois lados.
                      lineHeight: "13px",
                      fontWeight: 600,
                      color: st.c,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {f.rotulo}
                  </span>
                  <span
                    style={{
                      fontSize: 10,
                      lineHeight: "12px",
                      color: C.g500,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      ...TNUM,
                    }}
                  >
                    {[seg(f.durSec), f.usd != null && f.usd > 0 ? usd3(f.usd) : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </>
  )
}
