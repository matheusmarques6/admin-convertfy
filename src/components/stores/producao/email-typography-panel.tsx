"use client"

/**
 * Painel de Tipografia — a aba que aparece no modo Editar do e-mail.
 *
 * Dois gestos, os dois pedidos pelo owner (04/09):
 *
 *   1. **A peça inteira** — lista as famílias que ESTÃO no documento, com
 *      quantas vezes cada uma aparece, e deixa remapear. Dois seletores
 *      ("título" e "corpo") descreveriam mal a peça: depois que o tipógrafo
 *      age ela tem três famílias, e o que o painel mostra tem de ser o
 *      documento, não uma suposição sobre ele.
 *   2. **Um lugar só** — clicar num texto do preview seleciona a DECLARAÇÃO
 *      daquele elemento, e aqui se muda família, tamanho, peso, caixa e
 *      espaçamento. O contorno no preview mostra o alcance: uma declaração
 *      num `<td>` governa por herança tudo que está dentro dele.
 *
 * O rascunho é local, como o de estrutura: nada é gravado até "Aplicar". O
 * preview roda as MESMAS funções puras que a rota vai rodar, na mesma ordem
 * (`remapFamilies` → `applyTypographyOps`), então o que se vê é o que se
 * grava — não uma aproximação com `style` inline.
 */

import { useMemo, useState } from "react"
import { Type, RotateCcw } from "lucide-react"

import { FONT_WHITELIST } from "@/lib/agents/refiner/font-whitelist"
import { familiasDoDocumento } from "@/lib/agents/typography/swap-fonts"
import { familiaPrincipal } from "@/lib/agents/typography/font-name"
import type { TypographyOccurrence } from "@/lib/agents/typography/inventory"
import type { TypographyOpHumana, OpDescartada } from "@/lib/agents/typography/rules"

/** Pesos que a UI oferece — a escala inteira do CSS. */
const PESOS = [200, 300, 400, 500, 600, 700, 800, 900]

export interface TipografiaDraft {
  /** família ATUAL no documento → família nova. */
  familias: Record<string, string>
  /** índice da declaração → o que mudar nela. */
  ops: Record<number, TypographyOpHumana>
}

export const DRAFT_VAZIO: TipografiaDraft = { familias: {}, ops: {} }

export function draftTemMudanca(d: TipografiaDraft): boolean {
  return Object.keys(d.familias).length > 0 || Object.keys(d.ops).length > 0
}

const rotulo: React.CSSProperties = {
  fontSize: 10.5,
  fontWeight: 600,
  color: "var(--crm-gray-500)",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
}

const campo: React.CSSProperties = {
  width: "100%",
  padding: "6px 8px",
  fontSize: 12,
  color: "var(--crm-gray-900)",
  background: "var(--crm-gray-0)",
  border: "1px solid var(--crm-border)",
  borderRadius: 4,
}

export function EmailTypographyPanel({
  inventario,
  draft,
  onDraft,
  selecionado,
  onSelecionar,
  fonteDaPeca,
  temMarcado,
  avisos,
  salvando,
  onAplicar,
  onDescartar,
}: {
  /** Inventário do documento BASE — é ele que dá endereço às ops. */
  inventario: TypographyOccurrence[]
  draft: TipografiaDraft
  onDraft: (d: TipografiaDraft) => void
  selecionado: number | null
  onSelecionar: (indice: number | null) => void
  /** Fonte de título vigente da peça, só para o cabeçalho. */
  fonteDaPeca: string | null
  /** false = documento sem marcadores: o painel não mostra rótulo de bloco. */
  temMarcado: boolean
  /** Avisos da última aplicação (vêm da rota). */
  avisos: OpDescartada[]
  salvando: boolean
  onAplicar: () => void
  onDescartar: () => void
}) {
  const [sugestoesAbertas, setSugestoesAbertas] = useState(false)
  const familias = useMemo(() => familiasDoDocumento(inventario), [inventario])
  const oc = selecionado != null ? inventario.find((o) => o.index === selecionado) : null
  const op = selecionado != null ? draft.ops[selecionado] : undefined

  const mexerNaOp = (patch: Partial<TypographyOpHumana>) => {
    if (selecionado == null) return
    const atual = draft.ops[selecionado] ?? { item: selecionado, motivo: "ajuste manual" }
    const nova = { ...atual, ...patch }
    // Campo esvaziado sai da op — deixar `undefined` gravado faria a rota
    // receber uma op que não pede nada.
    for (const k of Object.keys(patch) as Array<keyof TypographyOpHumana>) {
      if (nova[k] === undefined || nova[k] === "") delete nova[k]
    }
    const ops = { ...draft.ops }
    const semEfeito =
      nova.familia === undefined &&
      nova.peso === undefined &&
      nova.tamanho_px === undefined &&
      nova.caixa === undefined &&
      nova.tracking === undefined
    if (semEfeito) delete ops[selecionado]
    else ops[selecionado] = nova
    onDraft({ ...draft, ops })
  }

  const trocarFamilia = (de: string, para: string) => {
    const familias = { ...draft.familias }
    if (!para.trim() || familiaPrincipal(para) === familiaPrincipal(de)) delete familias[de]
    else familias[de] = para.trim()
    onDraft({ ...draft, familias })
  }

  const mudanca = draftTemMudanca(draft)

  return (
    <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 16 }}>
      {/* ── A peça ───────────────────────────────────────────────── */}
      <section>
        <div style={{ ...rotulo, marginBottom: 6 }}>Fontes da peça</div>
        <div style={{ fontSize: 11.5, color: "var(--crm-gray-500)", marginBottom: 8, lineHeight: 1.5 }}>
          O que está no documento hoje. Trocar aqui vale para este e-mail — a
          identidade visual da loja não muda.
        </div>
        {familias.map((f) => (
          <div key={f.familia} style={{ marginBottom: 8 }}>
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                justifyContent: "space-between",
                marginBottom: 3,
              }}
            >
              <span style={{ fontSize: 12, fontWeight: 600, color: "var(--crm-gray-900)" }}>
                {f.familia}
              </span>
              <span style={{ fontSize: 10.5, color: "var(--crm-gray-400)" }}>
                {f.ocorrencias}×{f.maiorTamanho ? ` · até ${f.maiorTamanho}px` : ""}
              </span>
            </div>
            <input
              value={draft.familias[f.familia] ?? ""}
              onChange={(e) => trocarFamilia(f.familia, e.target.value)}
              onFocus={() => setSugestoesAbertas(true)}
              placeholder={`Trocar ${f.familia} por…`}
              list="cfy-fontes-sugeridas"
              style={campo}
            />
          </div>
        ))}
        {sugestoesAbertas && (
          <datalist id="cfy-fontes-sugeridas">
            {FONT_WHITELIST.map((f) => (
              <option key={f.family} value={f.family} />
            ))}
          </datalist>
        )}
      </section>

      {/* ── O item selecionado ───────────────────────────────────── */}
      <section>
        <div style={{ ...rotulo, marginBottom: 6 }}>Um lugar só</div>
        {!oc ? (
          <div
            style={{
              fontSize: 11.5,
              color: "var(--crm-gray-500)",
              lineHeight: 1.5,
              padding: "10px 12px",
              background: "var(--crm-gray-50)",
              border: "1px dashed var(--crm-border)",
              borderRadius: 6,
            }}
          >
            <Type size={14} style={{ marginBottom: 4, opacity: 0.6 }} />
            <div>
              Clique num texto do preview para escolher onde mexer. O contorno
              mostra até onde a mudança alcança — o estilo de uma célula vale
              para tudo que está dentro dela.
            </div>
          </div>
        ) : (
          <>
            <div
              style={{
                fontSize: 11,
                color: "var(--crm-gray-500)",
                marginBottom: 8,
                lineHeight: 1.5,
              }}
            >
              {temMarcado && oc.section ? (
                <strong style={{ color: "var(--crm-gray-900)" }}>
                  bloco {(oc.blockIndex ?? 0) + 1} · {oc.section}
                </strong>
              ) : (
                <strong style={{ color: "var(--crm-gray-900)" }}>item {oc.index + 1}</strong>
              )}
              {oc.text ? ` — “${oc.text}”` : ""}
              <div style={{ marginTop: 2, color: "var(--crm-gray-400)" }}>
                {familiaPrincipal(oc.family)} · {oc.sizePx ?? "?"}px · peso{" "}
                {oc.weight ?? "herdado"}
                {oc.isCta ? " · botão" : ""}
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div style={{ gridColumn: "1 / -1" }}>
                <div style={{ ...rotulo, marginBottom: 3 }}>Fonte</div>
                <input
                  value={op?.familia ?? ""}
                  onChange={(e) => mexerNaOp({ familia: e.target.value })}
                  placeholder={familiaPrincipal(oc.family)}
                  list="cfy-fontes-sugeridas"
                  style={campo}
                />
              </div>
              <div>
                <div style={{ ...rotulo, marginBottom: 3 }}>Tamanho</div>
                <input
                  type="number"
                  min={8}
                  max={96}
                  value={op?.tamanho_px ?? ""}
                  onChange={(e) =>
                    mexerNaOp({
                      tamanho_px: e.target.value ? Number(e.target.value) : undefined,
                    })
                  }
                  placeholder={String(oc.sizePx ?? "")}
                  style={campo}
                />
              </div>
              <div>
                <div style={{ ...rotulo, marginBottom: 3 }}>Peso</div>
                <select
                  value={op?.peso ?? ""}
                  onChange={(e) =>
                    mexerNaOp({ peso: e.target.value ? Number(e.target.value) : undefined })
                  }
                  style={campo}
                >
                  <option value="">{oc.weight ?? "herdado"}</option>
                  {PESOS.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <div style={{ ...rotulo, marginBottom: 3 }}>Caixa</div>
                <select
                  value={op?.caixa ?? ""}
                  onChange={(e) =>
                    mexerNaOp({
                      caixa: (e.target.value || undefined) as "alta" | "normal" | undefined,
                    })
                  }
                  style={campo}
                >
                  <option value="">{oc.uppercase ? "ALTA" : "normal"}</option>
                  <option value="alta">CAIXA ALTA</option>
                  <option value="normal">caixa normal</option>
                </select>
              </div>
              <div>
                <div style={{ ...rotulo, marginBottom: 3 }}>Espaçamento</div>
                <input
                  value={op?.tracking ?? ""}
                  onChange={(e) => mexerNaOp({ tracking: e.target.value })}
                  placeholder={oc.tracking ?? "0.06em"}
                  style={campo}
                />
              </div>
            </div>

            {op && (
              <button
                onClick={() => {
                  const ops = { ...draft.ops }
                  delete ops[oc.index]
                  onDraft({ ...draft, ops })
                }}
                style={{
                  marginTop: 8,
                  fontSize: 11,
                  color: "var(--crm-gray-500)",
                  background: "transparent",
                  border: 0,
                  cursor: "pointer",
                  padding: 0,
                }}
              >
                <RotateCcw size={11} style={{ display: "inline", marginRight: 4 }} />
                Desfazer neste item
              </button>
            )}
          </>
        )}
      </section>

      {/* ── Avisos da última aplicação ───────────────────────────── */}
      {avisos.length > 0 && (
        <section>
          <div style={{ ...rotulo, marginBottom: 6 }}>A régua da casa diz</div>
          {avisos.map((a, i) => (
            <div
              key={`${a.item}-${a.campo}-${i}`}
              style={{
                fontSize: 11.5,
                lineHeight: 1.5,
                color: "var(--crm-warn, #92400E)",
                background: "var(--crm-warn-bg, #FFFBEB)",
                border: "1px solid var(--crm-warn-border, #FDE68A)",
                borderRadius: 6,
                padding: "6px 8px",
                marginBottom: 4,
                cursor: "pointer",
              }}
              onClick={() => onSelecionar(a.item)}
            >
              <strong>item {a.item + 1}</strong> — {a.motivo}
            </div>
          ))}
          <div style={{ fontSize: 11, color: "var(--crm-gray-400)", marginTop: 2 }}>
            Aviso, não bloqueio: a mudança foi aplicada.
          </div>
        </section>
      )}

      {/* ── Ações ────────────────────────────────────────────────── */}
      <section style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button
          onClick={onAplicar}
          disabled={!mudanca || salvando}
          style={{
            flex: 1,
            height: 32,
            borderRadius: 4,
            border: 0,
            background: mudanca ? "var(--crm-brand)" : "var(--crm-gray-100)",
            color: mudanca ? "#fff" : "var(--crm-gray-400)",
            fontSize: 12.5,
            fontWeight: 600,
            cursor: mudanca && !salvando ? "pointer" : "default",
          }}
        >
          {salvando ? "Aplicando…" : "Aplicar"}
        </button>
        {mudanca && (
          <button
            onClick={onDescartar}
            disabled={salvando}
            style={{
              height: 32,
              padding: "0 12px",
              borderRadius: 4,
              border: "1px solid var(--crm-border)",
              background: "var(--crm-gray-0)",
              color: "var(--crm-gray-500)",
              fontSize: 12.5,
              cursor: "pointer",
            }}
          >
            Descartar
          </button>
        )}
      </section>

      {fonteDaPeca && (
        <div style={{ fontSize: 11, color: "var(--crm-gray-400)", lineHeight: 1.5 }}>
          Um re-render regenera o e-mail: a fonte da peça volta, mas os
          ajustes feitos item a item se perdem — eles apontam para posições
          deste documento.
        </div>
      )}
    </div>
  )
}
