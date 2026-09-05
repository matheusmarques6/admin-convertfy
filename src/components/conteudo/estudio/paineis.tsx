"use client"

/**
 * Acordeões da aba Ajustes do editor: Template, Assistente, Campos globais,
 * Texto, Mídia, Cores, Fundo, Gradiente, CTAs, Proporção, Histórico.
 * Cada painel recebe a mesma `EditorApi` e só despacha para o reducer.
 */

import { useRef, useState } from "react"
import { Eye, EyeOff, Image as ImageIcon, Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"
import { Icon } from "@/components/ui/icon"
import { CORES_PADRAO, GRADIENTE_PADRAO, SLIDE, fundoValido, gradienteCss } from "@/lib/conteudo/brand"
import { getProvas, getSugestoesImagem, slotDeUrl } from "@/lib/conteudo/data"
import { aplicarPerfil, aplicarPropostas, propostasDeLinhas, setTexto as setTextoDoc, slotsDeImagem, trocarTemplate } from "@/lib/conteudo/documento"
import { chamarIA, gerarImagemIA } from "@/lib/conteudo/ia/client"
import { estruturaLocal, headlinesLocal } from "@/lib/conteudo/ia/fallback"
import { resumoDocumento } from "@/lib/conteudo/ia/prompt"
import { arquivoParaDataUrl } from "@/lib/conteudo/imagens"
import { getTemplate, ST_FUNIL, ST_TEMPLATES } from "@/lib/conteudo/templates"
import type { DocFrame, EstiloTexto, OcultavelGlobal, PerfilEditavel, Proporcao } from "@/lib/conteudo/types"
import { CtAvatar, CtLabel, CtSeg, CtSkel, TNUM, inputCls, selectCls, textareaCls } from "../ui"
import type { EditorApi } from "./editor-types"

const label = (t: string) => <CtLabel>{t}</CtLabel>

function Swatch({ cor, grad }: { cor: string; grad?: string }) {
  return <span className="inline-block h-[26px] w-[26px] shrink-0 rounded-[7px] border border-[var(--ops-border)]" style={{ background: cor === "gradiente" && grad ? grad : cor }} />
}

function Ghost({ children, onClick, disabled }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className="inline-flex h-[30px] items-center gap-1.5 rounded-lg border border-[var(--ops-border)] px-[11px] text-[11.5px] font-medium text-[var(--ops-title)] hover:bg-[var(--ops-hover)] disabled:opacity-50">
      {children}
    </button>
  )
}

export function AiBtn({ children, onClick, loading, prominent, disabled }: { children: React.ReactNode; onClick?: () => void; loading?: boolean; prominent?: boolean; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading || disabled}
      className={cn(
        "flex w-full items-center justify-center gap-2 text-[12px] font-semibold disabled:cursor-wait",
        prominent ? "h-9 rounded-[9px] bg-[var(--ops-accent)] text-[var(--ops-on-accent)]" : "h-8 rounded-lg border border-[var(--ops-border)] text-[var(--ops-title)] hover:bg-[var(--ops-hover)]",
        loading && "opacity-75",
      )}
    >
      {!prominent && <Icon icon={Sparkles} customSize={14} />}
      {loading ? "Gerando" : children}
      {loading && <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />}
    </button>
  )
}

/** Input controlado só por valor válido (hex/rgba/gradiente): inválido fica local até corrigir. */
function CorInput({ valor, onValido, placeholder, mono = true, className }: { valor: string; onValido: (v: string) => void; placeholder?: string; mono?: boolean; className?: string }) {
  const [local, setLocal] = useState<string | null>(null)
  const v = local ?? valor
  const ok = fundoValido(v)
  return (
    <input
      value={v}
      placeholder={placeholder}
      onChange={(e) => {
        const nv = e.target.value
        if (fundoValido(nv)) {
          setLocal(null)
          onValido(nv.trim())
        } else setLocal(nv)
      }}
      onBlur={() => setLocal(null)}
      className={cn(inputCls, "h-7 text-[11.5px]", mono && "font-mono", !ok && "border-[var(--ops-neg)]", className)}
      aria-invalid={!ok}
    />
  )
}

// ── Template ────────────────────────────────────────────────────────────

export function PainelTemplate({ api }: { api: EditorApi }) {
  const [naoCoube, setNaoCoube] = useState<DocFrame[]>([])
  return (
    <>
      <select
        value={api.doc.templateId}
        onChange={(e) => {
          const r = trocarTemplate(api.doc, getTemplate(e.target.value))
          api.set(() => r.doc, null)
          api.setAtivo(0)
          setNaoCoube(r.naoCoube)
          api.avisar(r.naoCoube.length ? `Template trocado. ${r.naoCoube.length} texto(s) não couberam.` : "Template trocado, textos preservados")
        }}
        className={cn(selectCls, "h-[34px] text-[12.5px]")}
      >
        {ST_TEMPLATES.map((t) => (
          <option key={t.id} value={t.id}>
            {t.nome} · {ST_FUNIL[t.etapaFunil].n}
          </option>
        ))}
      </select>
      <div className="mt-2 text-[11px] leading-relaxed text-[var(--ops-mut)]">Trocar preserva os textos e mapeia por tipo de frame. O que não couber você vê aqui.</div>
      {naoCoube.length > 0 && (
        <div className="mt-2 rounded-lg border border-[var(--ops-warn-br)] bg-[var(--ops-warn-bg)] px-2.5 py-2 text-[11px] text-[var(--ops-warn)]">
          <div className="font-semibold">Não coube no novo template:</div>
          <ul className="mt-1 list-disc pl-4">
            {naoCoube.map((f) => (
              <li key={f.frameId}>
                {f.label} ({f.tipo}): &ldquo;{f.textos.titulo}&rdquo;
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  )
}

// ── Assistente ──────────────────────────────────────────────────────────

export function PainelAssistente({ api }: { api: EditorApi }) {
  const { doc } = api
  const [colar, setColar] = useState("")
  const [sub, setSub] = useState(false)
  const [pauta, setPauta] = useState(doc.nome)
  const [pilar, setPilar] = useState("Case")
  const [cta, setCta] = useState("Comment gate")
  const [prova, setProva] = useState(0)
  const [gerar, setGerar] = useState<"idle" | "loading" | "erro">("idle")
  const [erro, setErro] = useState<string | null>(null)
  const [hl, setHl] = useState<"idle" | "loading" | string[]>("idle")
  const provas = getProvas()

  const distribuir = () => {
    const props = propostasDeLinhas(doc, colar)
    if (!props.length) return
    api.set(() => aplicarPropostas(doc, props), null)
    api.avisar(`${props.length} slides preenchidos`)
    setColar("")
    api.setAtivo(doc.frames.findIndex((f) => f.frameId === props[0].frameId))
  }

  const aplicarEstrutura = (r: { nome?: string; frames: Array<{ frameId: string; textos: Record<string, string | undefined> }>; legenda: string; palavraChave: string }, local: boolean) => {
    api.set(
      (d) => ({
        ...d,
        nome: r.nome?.trim() || d.nome,
        frames: d.frames.map((f) => {
          const x = r.frames.find((y) => y.frameId === f.frameId)
          return x ? { ...f, textos: { ...f.textos, ...x.textos } } : f
        }),
        legenda: r.legenda || d.legenda,
        palavraChave: r.palavraChave ? r.palavraChave.toUpperCase() : d.palavraChave,
      }),
      local ? "Estrutura montada pelo modo local" : "Estrutura gerada pela ConvertIA",
    )
  }

  const gerarAgora = async () => {
    setGerar("loading")
    setErro(null)
    try {
      const r = await chamarIA({
        acao: "gerar_estrutura",
        nome: doc.nome,
        perfil: doc.perfil,
        pauta: pauta || doc.nome,
        pilar,
        objetivoCta: cta,
        prova: provas[prova] ? `${provas[prova].t} (${provas[prova].fonte}, ${provas[prova].data})` : undefined,
        templateNome: getTemplate(doc.templateId).nome,
        frames: doc.frames.map((f) => ({ frameId: f.frameId, tipo: f.tipo, label: f.label, campos: f.campos })),
        atuais: Object.fromEntries(doc.frames.map((f) => [f.frameId, f.textos])),
      })
      aplicarEstrutura(r, false)
      setGerar("idle")
      setSub(false)
      api.avisar("Estrutura gerada")
    } catch (e) {
      setGerar("erro")
      setErro(e instanceof Error ? e.message : "A geração falhou.")
    }
  }

  const headlines = async () => {
    setHl("loading")
    try {
      const r = await chamarIA({ acao: "headlines", resumo: resumoDocumento(doc), atual: doc.frames[0]?.textos.titulo ?? doc.nome })
      setHl(r.opcoes)
    } catch {
      setHl(headlinesLocal().opcoes)
      api.avisar("ConvertIA indisponível: sugestões do modo local")
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div>
        {label("Colar texto")}
        <textarea value={colar} onChange={(e) => setColar(e.target.value)} rows={5} placeholder={"- Texto linha 1\n- Texto linha 2\n- Texto linha 3"} className={textareaCls} />
        <div className="mt-2">
          <AiBtn prominent onClick={distribuir} disabled={!colar.trim()}>
            Distribuir nos slides
          </AiBtn>
        </div>
        <div className="mt-1.5 text-[10.5px] leading-relaxed text-[var(--ops-mut)]">Uma linha vira um slide. A ConvertIA respeita uma ideia por slide e ignora capa e CTA.</div>
      </div>
      <div className="h-px bg-[var(--ops-border)]" />
      <AiBtn onClick={() => setSub((s) => !s)}>Gerar estrutura com IA</AiBtn>
      {sub && (
        <div className="flex flex-col gap-2.5 rounded-[9px] border border-[var(--ops-border)] bg-[var(--ops-tile)] px-[11px] py-2.5">
          <div>
            {label("Pauta")}
            <input value={pauta} onChange={(e) => setPauta(e.target.value)} className={inputCls} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              {label("Pilar")}
              <select value={pilar} onChange={(e) => setPilar(e.target.value)} className={selectCls}>
                {["Case", "Educacional", "Bastidor", "Benchmark"].map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </select>
            </div>
            <div>
              {label("Objetivo do CTA")}
              <select value={cta} onChange={(e) => setCta(e.target.value)} className={selectCls}>
                {["Comment gate", "Link na bio", "Salvar", "Seguir"].map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            {label("Dado ou prova")}
            <div className="overflow-hidden rounded-lg border border-[var(--ops-border)] bg-[var(--ops-card)]">
              {provas.map((p, i) => (
                <button key={p.t} type="button" onClick={() => setProva(i)} className={cn("flex w-full gap-2 px-[9px] py-[7px] text-left", i > 0 && "border-t border-[var(--ops-border)]", prova === i && "bg-[var(--ops-hover)]")}>
                  <span className={cn("mt-[3px] h-2.5 w-2.5 shrink-0 rounded-full border-[1.5px]", prova === i ? "border-[var(--ops-accent)] bg-[var(--ops-accent)]" : "border-[var(--ops-border)]")} />
                  <span>
                    <span className="block text-[11.5px] leading-[1.4] text-[var(--ops-title)]">{p.t}</span>
                    <span className="mt-px block text-[10px] text-[var(--ops-mut)]">
                      {p.fonte} · {p.data}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </div>
          {gerar === "erro" ? (
            <div className="flex flex-col gap-1.5 rounded-lg border border-[var(--ops-neg)]/30 px-2.5 py-2 text-[11.5px] text-[var(--ops-neg)]">
              <span>{erro ?? "A geração falhou."}</span>
              <div className="flex gap-3">
                <button type="button" onClick={gerarAgora} className="font-semibold hover:underline">
                  Tentar novamente
                </button>
                <button
                  type="button"
                  onClick={() => {
                    aplicarEstrutura(estruturaLocal(doc), true)
                    setGerar("idle")
                    setSub(false)
                  }}
                  className="font-semibold text-[var(--ops-sec)] hover:underline"
                >
                  Usar modo local
                </button>
              </div>
            </div>
          ) : (
            <AiBtn prominent onClick={gerarAgora} loading={gerar === "loading"}>
              Gerar agora
            </AiBtn>
          )}
        </div>
      )}
      <AiBtn onClick={headlines} loading={hl === "loading"}>
        Melhorar headline
      </AiBtn>
      {Array.isArray(hl) && (
        <div className="flex flex-col gap-[5px]">
          {hl.map((h) => {
            const on = doc.frames[0]?.textos.titulo === h
            return (
              <div key={h} className={cn("flex items-center gap-2 rounded-lg border px-2.5 py-2 text-[11.5px] leading-[1.4] text-[var(--ops-title)]", on ? "border-[var(--ops-accent)]" : "border-[var(--ops-border)]")}>
                <span className="flex-1">{h}</span>
                <button
                  type="button"
                  onClick={() => {
                    api.set((d) => ({ ...setTextoDoc(d, d.frames[0].frameId, "titulo", h), nome: h }), "Headline aplicada")
                    api.setAtivo(0)
                  }}
                  className="text-[11px] font-semibold text-[var(--ops-accent)] hover:underline"
                >
                  Aplicar
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Campos globais ──────────────────────────────────────────────────────

export function PainelGlobais({ api }: { api: EditorApi }) {
  const { doc } = api
  const fileRef = useRef<HTMLInputElement>(null)
  const toggle = (k: OcultavelGlobal) => api.set({ ocultos: { ...doc.ocultos, [k]: !doc.ocultos[k] } })
  const olho = (k: OcultavelGlobal) => (
    <button type="button" title={doc.ocultos[k] ? "Mostrar no slide" : "Ocultar do slide"} onClick={() => toggle(k)} className={cn("mb-1.5 flex text-[var(--ops-sec)]", doc.ocultos[k] && "opacity-50")}>
      <Icon icon={doc.ocultos[k] ? EyeOff : Eye} customSize={13} />
    </button>
  )
  return (
    <div className="flex flex-col gap-2.5">
      <div>
        {label("Perfil")}
        <CtSeg<PerfilEditavel>
          val={doc.perfil}
          onChange={(p) => {
            if (p === doc.perfil) return
            api.set(() => aplicarPerfil(doc, p, api.brandKits?.[p]), null)
            api.avisar(`Brand Kit ${p === "bruno" ? "do Bruno" : "da Convertfy"} aplicado em todos os frames`)
          }}
          opts={[
            ["convertfy", "Convertfy"],
            ["bruno", "Bruno"],
          ]}
        />
      </div>
      {(
        [
          ["brandName", "brand-name"],
          ["brandName2", "brand-name-2"],
          ["copyright", "copyright"],
        ] as Array<[keyof typeof doc.brandKit & OcultavelGlobal, string]>
      ).map(([k, l]) => (
        <div key={k}>
          <div className="flex items-center justify-between">
            {label(l)}
            {olho(k)}
          </div>
          <input value={String(doc.brandKit[k] ?? "")} onChange={(e) => api.set({ brandKit: { ...doc.brandKit, [k]: e.target.value } })} className={inputCls} />
        </div>
      ))}
      <div>
        {label("avatar")}
        <div className="flex items-center gap-2">
          <CtAvatar perfil={doc.perfil} size={32} src={doc.brandKit.avatar} />
          <Ghost onClick={() => fileRef.current?.click()}>Trocar</Ghost>
          {doc.brandKit.avatar && <Ghost onClick={() => api.set({ brandKit: { ...doc.brandKit, avatar: null } }, "Avatar removido")}>Remover</Ghost>}
          <span className="ml-auto">{olho("avatar")}</span>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0]
            if (!f) return
            const url = await arquivoParaDataUrl(f, 256)
            api.set({ brandKit: { ...doc.brandKit, avatar: url } }, "Avatar trocado")
            e.target.value = ""
          }}
        />
      </div>
      <div className="border-t border-[var(--ops-border)] pt-2">
        {label("Acessórios")}
        <label className="flex cursor-pointer items-center gap-2 text-[12px] text-[var(--ops-title)]">
          <input type="checkbox" checked={doc.brandKit.verificado} onChange={(e) => api.set({ brandKit: { ...doc.brandKit, verificado: e.target.checked } })} className="m-0 accent-[var(--ops-accent)]" /> Verificado
        </label>
      </div>
      <button type="button" onClick={() => api.setModal("brandkit")} className="text-left text-[11.5px] font-medium text-[var(--ops-accent)] hover:underline">
        Gerenciar no Brand Kit
      </button>
    </div>
  )
}

// ── Texto ───────────────────────────────────────────────────────────────

export function PainelTexto({ api }: { api: EditorApi }) {
  const { doc, sel } = api
  if (!sel) {
    return (
      <div className="text-[12px] leading-relaxed text-[var(--ops-sec)]">
        Clique em um texto no slide para editar o estilo.
        <div className="mt-1.5 text-[10.5px] text-[var(--ops-mut)]">Posição vertical, tamanho, peso, alinhamento e cor. Nada sai da grade do template.</div>
      </div>
    )
  }
  const frame = doc.frames.find((x) => x.frameId === sel.frameId)
  const e: EstiloTexto = doc.estilos[sel.frameId]?.[sel.campo] ?? {}
  const setE = (p: Partial<EstiloTexto>, label?: string) =>
    api.set({ estilos: { ...doc.estilos, [sel.frameId]: { ...(doc.estilos[sel.frameId] ?? {}), [sel.campo]: { ...e, ...p } } } }, label ?? null)
  const sliders: Array<[string, "dy" | "escala" | "lh", number, number, number, number, string]> = [
    ["Posição vertical", "dy", -420, 420, 10, 0, "px"],
    ["Tamanho", "escala", 50, 170, 1, 100, "%"],
    ["Altura de linha", "lh", 0.9, 1.6, 0.05, 1.1, ""],
  ]
  return (
    <div className="flex flex-col gap-[11px]">
      <div className="flex items-center gap-2 rounded-lg border border-[var(--ops-border)] bg-[var(--ops-tile)] px-2.5 py-2">
        <span className="h-1.5 w-1.5 rounded-full bg-[var(--ops-accent)]" />
        <span className="text-[11.5px] text-[var(--ops-sec)]">
          <strong className="capitalize text-[var(--ops-title)]">{sel.campo}</strong> · {frame?.label}
        </span>
        <button type="button" onClick={() => api.setSel(null)} aria-label="Limpar seleção" className="ml-auto text-[var(--ops-mut)] hover:text-[var(--ops-title)]">
          ×
        </button>
      </div>
      {sliders.map(([l, k, mn, mx, st, def, u]) => (
        <div key={k}>
          <div className="mb-1 flex items-baseline justify-between">
            {label(l)}
            <span className="text-[11px] font-semibold text-[var(--ops-title)]" style={TNUM}>
              {e[k] != null ? (k === "lh" ? (e[k] as number).toFixed(2) : `${k === "dy" && (e[k] as number) > 0 ? "+" : ""}${e[k]}${u}`) : "padrão"}
            </span>
          </div>
          <input type="range" min={mn} max={mx} step={st} value={e[k] ?? def} onChange={(ev) => api.preview({ estilos: { ...doc.estilos, [sel.frameId]: { ...(doc.estilos[sel.frameId] ?? {}), [sel.campo]: { ...e, [k]: +ev.target.value } } } })} onPointerUp={(ev) => setE({ [k]: +(ev.target as HTMLInputElement).value })} onKeyUp={(ev) => setE({ [k]: +(ev.target as HTMLInputElement).value })} className="m-0 w-full accent-[var(--ops-accent)]" />
        </div>
      ))}
      <div className="grid grid-cols-2 gap-2">
        <div>
          {label("Peso")}
          <CtSeg size="sm" val={String(e.peso ?? "")} onChange={(v) => setE({ peso: v ? +v : undefined })} opts={[["", "Auto"], ["700", "Bold"], ["900", "Black"]]} />
        </div>
        <div>
          {label("Alinhamento")}
          <CtSeg size="sm" val={e.align ?? ""} onChange={(v) => setE({ align: (v || undefined) as EstiloTexto["align"] })} opts={[["", "Auto"], ["left", "Esq"], ["center", "Centro"]]} />
        </div>
      </div>
      <div>
        {label("Cor")}
        <div className="flex flex-wrap gap-1.5">
          {[["", "auto"], ...Object.entries(doc.cores)].map(([k, v]) => (
            <button
              key={k}
              type="button"
              title={k || "automática"}
              onClick={() => setE({ cor: k || undefined })}
              className={cn("h-8 w-8 rounded-[9px] border-2 text-[10px] font-bold text-[var(--ops-sec)]", (e.cor ?? "") === k ? "border-[var(--ops-accent)]" : "border-[var(--ops-border)]")}
              style={{ background: k ? v : "var(--ops-card)" }}
            >
              {k ? "" : "A"}
            </button>
          ))}
        </div>
      </div>
      <div className="border-t border-[var(--ops-border)] pt-1.5 text-[10.5px] leading-relaxed text-[var(--ops-mut)]">No slide: arraste a alça para subir ou descer e o canto para aumentar ou diminuir. O texto fica travado na horizontal para não quebrar o layout.</div>
      <button type="button" onClick={() => setE({ escala: undefined, peso: undefined, align: undefined, lh: undefined, cor: undefined, dy: undefined }, "Texto de volta ao padrão")} className="h-[30px] rounded-lg border border-[var(--ops-border)] text-[11.5px] font-medium text-[var(--ops-sec)] hover:bg-[var(--ops-hover)]">
        Voltar ao padrão do template
      </button>
    </div>
  )
}

// ── Mídia ───────────────────────────────────────────────────────────────

export function PainelMidia({ api }: { api: EditorApi }) {
  const { doc, ativo } = api
  const f = doc.frames[ativo]
  const fileRef = useRef<HTMLInputElement>(null)
  const alvoRef = useRef<number>(ativo)
  const [ia, setIa] = useState<"off" | "prompt" | "loading" | string[]>("off")
  const [prompt, setPrompt] = useState("Interior de loja premium, luz natural, tons de azul profundo, sem pessoas, estética editorial")
  const [erro, setErro] = useState<string | null>(null)
  const { total, cheios, semSlot } = slotsDeImagem(doc)

  const abrirUpload = (i: number) => {
    alvoRef.current = i
    fileRef.current?.click()
  }
  const aplicarUrl = (i: number, url: string, label = "Imagem adicionada") => {
    const fr = doc.frames[i]
    if (!fr || fr.slotsImagem === 0) return
    api.set((d) => ({ ...d, frames: d.frames.map((x, j) => (j === i ? { ...x, imagens: { slot1: slotDeUrl(url) } } : x)) }), `${label} · ${fr.label}`)
  }

  const gerar = async () => {
    setIa("loading")
    setErro(null)
    try {
      const r = await gerarImagemIA({ prompt, aspecto: doc.proporcaoExport === "9:16" ? "9:16" : "4:5", quantidade: 4 })
      setIa(r.urls)
    } catch (e) {
      setIa("prompt")
      setErro(e instanceof Error ? e.message : "Falha ao gerar")
    }
  }

  return (
    <div className="flex flex-col gap-2.5">
      <div
        role="button"
        tabIndex={0}
        onClick={() => f?.slotsImagem && abrirUpload(ativo)}
        onKeyDown={(e) => e.key === "Enter" && f?.slotsImagem && abrirUpload(ativo)}
        onDragOver={(e) => e.preventDefault()}
        onDrop={async (e) => {
          e.preventDefault()
          const file = e.dataTransfer.files?.[0]
          if (file && f?.slotsImagem) aplicarUrl(ativo, await arquivoParaDataUrl(file))
        }}
        className={cn("rounded-[9px] border border-dashed border-[var(--ops-border)] px-2.5 py-4 text-center", f?.slotsImagem ? "cursor-pointer hover:bg-[var(--ops-hover)]" : "opacity-60")}
      >
        <div className="flex justify-center text-[var(--ops-mut)]">
          <Icon icon={ImageIcon} customSize={18} />
        </div>
        <div className="mt-1.5 text-[12px] font-semibold text-[var(--ops-title)]">{f?.slotsImagem ? "Arraste ou clique" : "Este frame não tem slot"}</div>
        <div className="mt-0.5 text-[10.5px] text-[var(--ops-mut)]">PNG, JPG, WebP · comprimida para caber no documento</div>
      </div>
      <div className="text-[11.5px] font-semibold text-[var(--ops-title)]" style={TNUM}>
        {cheios} de {total} slots
      </div>
      {semSlot.length > 0 && <div className="text-[10.5px] leading-relaxed text-[var(--ops-mut)]">Os frames {semSlot.join(", ")} não têm slot de imagem neste template.</div>}
      <div className="grid grid-cols-3 gap-1.5">
        {doc.frames.map(
          (x, i) =>
            x.slotsImagem > 0 && (
              <button
                key={x.frameId}
                type="button"
                title={x.label}
                onClick={() => {
                  api.setAtivo(i)
                  if (!x.imagens.slot1) abrirUpload(i)
                  else api.setImgSel({ frameId: x.frameId })
                }}
                className={cn("relative aspect-square rounded-lg border bg-cover bg-center text-[16px] text-[var(--ops-mut)]", x.imagens.slot1 ? "border-solid" : "border-dashed", ativo === i ? "border-[var(--ops-accent)]" : "border-[var(--ops-border)]")}
                style={x.imagens.slot1 ? { backgroundImage: `url(${x.imagens.slot1.url})` } : undefined}
              >
                {!x.imagens.slot1 && "+"}
                <span className="absolute left-[3px] top-[3px] inline-flex h-[15px] w-[15px] items-center justify-center rounded bg-[var(--ops-title)] text-[9px] font-bold text-[var(--ops-card)]">{i + 1}</span>
              </button>
            ),
        )}
      </div>
      {f?.slotsImagem > 0 && (
        <div>
          {label(`Sugestões para ${f.label}`)}
          <div className="grid grid-cols-3 gap-1.5">
            {getSugestoesImagem(f.frameId).map((u) => (
              <button key={u} type="button" aria-label="Aplicar sugestão" onClick={() => aplicarUrl(ativo, u, "Imagem trocada")} className={cn("aspect-[4/5] rounded-lg border-2 bg-cover bg-center", f.imagens.slot1?.url === u ? "border-[var(--ops-accent)]" : "border-[var(--ops-border)]")} style={{ backgroundImage: `url(${u})` }} />
            ))}
          </div>
          <div className="mt-1.5 text-[10.5px] text-[var(--ops-mut)]">Banco da agência. Um clique troca.</div>
        </div>
      )}
      <AiBtn onClick={() => setIa((s) => (s === "off" ? "prompt" : "off"))}>Gerar imagem com IA</AiBtn>
      {ia !== "off" && (
        <div className="flex flex-col gap-2">
          <textarea rows={2} value={prompt} onChange={(e) => setPrompt(e.target.value)} className={cn(textareaCls, "resize-none text-[11.5px]")} />
          {erro && <div className="text-[11px] text-[var(--ops-neg)]">{erro}</div>}
          {ia === "prompt" && (
            <AiBtn prominent onClick={gerar} disabled={!prompt.trim() || !f?.slotsImagem}>
              Gerar 4 opções
            </AiBtn>
          )}
          {ia === "loading" && (
            <div className="grid grid-cols-2 gap-1.5">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="aspect-[4/5]">
                  <CtSkel h={0} className="h-full" r={8} />
                </div>
              ))}
            </div>
          )}
          {Array.isArray(ia) && (
            <div className="grid grid-cols-2 gap-1.5">
              {ia.map((u) => (
                <button key={u} type="button" aria-label="Usar imagem gerada" onClick={() => f?.slotsImagem && aplicarUrl(ativo, u, "Imagem gerada pela ConvertIA")} className="aspect-[4/5] rounded-lg border border-[var(--ops-border)] bg-cover bg-center" style={{ backgroundImage: `url(${u})` }} />
              ))}
            </div>
          )}
        </div>
      )}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0]
          if (file) aplicarUrl(alvoRef.current, await arquivoParaDataUrl(file))
          e.target.value = ""
        }}
      />
    </div>
  )
}

// ── Cores / Fundo / Gradiente / CTAs / Proporção / Histórico ───────────

export function PainelCores({ api }: { api: EditorApi }) {
  const { doc } = api
  return (
    <div className="flex flex-col gap-2">
      {Object.entries(doc.cores).map(([k, v]) => (
        <div key={k} className="flex items-center gap-2">
          <Swatch cor={v} />
          <div className="flex-1">
            <div className="mb-0.5 text-[10px] text-[var(--ops-mut)]">{k}</div>
            <CorInput valor={v} onValido={(nv) => api.set({ cores: { ...doc.cores, [k]: nv } })} />
          </div>
        </div>
      ))}
      <div className="flex gap-3">
        <button type="button" onClick={() => api.setModal("brandkit")} className="mt-1 text-left text-[11.5px] font-medium text-[var(--ops-accent)] hover:underline">
          Gerenciar no Brand Kit
        </button>
        <button type="button" onClick={() => api.set({ cores: { ...CORES_PADRAO } }, "Cores de volta ao padrão")} className="mt-1 text-left text-[11.5px] font-medium text-[var(--ops-sec)] hover:underline">
          Resetar
        </button>
      </div>
    </div>
  )
}

export function PainelFundo({ api }: { api: EditorApi }) {
  const { doc } = api
  const grad = gradienteCss(doc.gradiente)
  return (
    <div className="flex flex-col gap-1.5">
      {doc.frames.map((x, i) => {
        const v = doc.fundoPorFrame[x.frameId] ?? SLIDE.fundoClaro
        return (
          <div key={x.frameId} onClick={() => api.setAtivo(i)} className={cn("flex items-center gap-2 rounded-lg p-1", api.ativo === i && "bg-[var(--ops-hover)]")}>
            <Swatch cor={v} grad={grad} />
            <div className="flex-1">
              <div className="mb-0.5 text-[10px] text-[var(--ops-mut)]">{x.label}</div>
              <CorInput valor={v} placeholder="#hex, rgba() ou gradiente" onValido={(nv) => api.set({ fundoPorFrame: { ...doc.fundoPorFrame, [x.frameId]: nv } })} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function PainelGradiente({ api }: { api: EditorApi }) {
  const { doc, ativo } = api
  const g = doc.gradiente
  return (
    <div className="flex flex-col gap-2.5">
      <div className="h-9 rounded-lg border border-[var(--ops-border)]" style={{ background: gradienteCss(g) }} />
      {(
        [
          ["de", "Início"],
          ["meio", "Meio"],
          ["ate", "Fim"],
        ] as Array<["de" | "meio" | "ate", string]>
      ).map(([k, l]) => (
        <div key={k} className="flex items-center gap-2">
          <Swatch cor={g[k]} />
          <div className="flex-1">
            <div className="mb-0.5 text-[10px] text-[var(--ops-mut)]">{l}</div>
            <CorInput valor={g[k]} onValido={(v) => api.set({ gradiente: { ...g, [k]: v } })} />
          </div>
        </div>
      ))}
      <div>
        {label(`Ângulo · ${g.angulo}°`)}
        <input type="range" min={0} max={360} value={g.angulo} onChange={(e) => api.preview({ gradiente: { ...g, angulo: +e.target.value } })} onPointerUp={(e) => api.set({ gradiente: { ...g, angulo: +(e.target as HTMLInputElement).value } })} className="w-full accent-[var(--ops-accent)]" />
      </div>
      {doc.frames[ativo] && doc.fundoPorFrame[doc.frames[ativo].frameId] !== "gradiente" && (
        <div className="text-[11px] italic leading-relaxed text-[var(--ops-mut)]">Este slide não tem gradiente. Outros slides do carrossel sim, use Aplicar em todos para unificar.</div>
      )}
      <div className="flex flex-wrap gap-1.5">
        <Ghost onClick={() => api.set({ fundoPorFrame: Object.fromEntries(doc.frames.map((x) => [x.frameId, "gradiente"])) }, "Gradiente aplicado em todos os slides")}>Aplicar em todos os slides</Ghost>
        <Ghost onClick={() => api.set({ gradiente: { ...GRADIENTE_PADRAO } }, "Gradiente resetado")}>Resetar</Ghost>
      </div>
    </div>
  )
}

export function PainelCtas({ api }: { api: EditorApi }) {
  const { doc } = api
  return (
    <div className="flex flex-col gap-2.5">
      <label className="flex cursor-pointer items-center justify-between text-[12px] text-[var(--ops-title)]">
        Mostrar botão
        <input type="checkbox" checked={doc.cta.mostrar} onChange={(e) => api.set({ cta: { ...doc.cta, mostrar: e.target.checked } })} className="m-0 accent-[var(--ops-accent)]" />
      </label>
      {doc.cta.mostrar && (
        <>
          <div>
            {label("Texto do botão")}
            <input value={doc.cta.texto} onChange={(e) => api.set({ cta: { ...doc.cta, texto: e.target.value } })} className={inputCls} />
            <div className="mt-1 text-[10.5px] text-[var(--ops-mut)]">O campo &ldquo;botão&rdquo; do frame CTA, quando preenchido, tem prioridade.</div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              {label("Fundo")}
              <div className="flex items-center gap-1.5">
                <Swatch cor={doc.cta.fundo} />
                <CorInput valor={doc.cta.fundo} onValido={(v) => api.set({ cta: { ...doc.cta, fundo: v } })} />
              </div>
            </div>
            <div>
              {label("Texto")}
              <div className="flex items-center gap-1.5">
                <Swatch cor={doc.cta.cor} />
                <CorInput valor={doc.cta.cor} onValido={(v) => api.set({ cta: { ...doc.cta, cor: v } })} />
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

export function PainelProporcao({ api }: { api: EditorApi }) {
  return (
    <>
      {label("Exportação")}
      <CtSeg<Proporcao>
        val={api.doc.proporcaoExport}
        onChange={(v) => api.set({ proporcaoExport: v }, `Proporção alterada para ${v}`)}
        opts={[
          ["9:16", "9:16"],
          ["4:5", "4:5"],
        ]}
      />
      <div className="mt-2 text-[11px] leading-relaxed text-[var(--ops-mut)]">9:16 aumenta o fundo acima e abaixo sem mexer no conteúdo.</div>
    </>
  )
}

export function PainelHistorico({ api }: { api: EditorApi }) {
  return (
    <div className="flex flex-col">
      {api.doc.historico.map((h, i) => (
        <div key={h.id} className={cn("flex items-start gap-[9px] py-2", i > 0 && "border-t border-[var(--ops-border)]")}>
          <span className={cn("mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full", i === 0 ? "bg-[var(--ops-accent)]" : "bg-[var(--ops-track)]")} />
          <span className="min-w-0 flex-1">
            <span className="block text-[11.5px] leading-[1.4] text-[var(--ops-title)]">{h.label}</span>
            <span className="mt-px block text-[10px] text-[var(--ops-mut)]" style={TNUM}>
              {h.ts}
            </span>
          </span>
          {i > 0 && api.temSnapshot(h.id) && (
            <button
              type="button"
              onClick={() => {
                if (api.restaurar(h.id)) api.avisar("Versão restaurada")
              }}
              className="text-[10.5px] font-semibold text-[var(--ops-accent)] hover:underline"
            >
              Restaurar
            </button>
          )}
        </div>
      ))}
      <div className="mt-2 text-[10.5px] leading-relaxed text-[var(--ops-mut)]">Restaurar vale para mudanças desta sessão. Use ⌘Z para desfazer passo a passo.</div>
    </div>
  )
}
