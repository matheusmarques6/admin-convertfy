"use client"

import { useState, useRef, useCallback } from "react"
import { useRouter } from "next/navigation"
import {
  Check, Download, Link as LinkIcon, Bell, ChevronRight, FileVideo, Loader2,
} from "lucide-react"

const C = {
  brand: "#4E62D8",
  white: "#FFFFFF",
  g25: "#FAFBFC",
  g50: "#F8FAFC",
  g100: "#F3F4F6",
  g200: "#E5E7EB",
  g300: "#D1D5DB",
  g400: "#9CA3AF",
  g500: "#6B7280",
  g600: "#4B5563",
  g700: "#374151",
  g900: "#111827",
  border: "rgba(0,0,0,0.08)",
  shadowSm: "0 1px 2px rgba(0,0,0,0.04), 0 1px 3px rgba(0,0,0,0.06)",
  pos: "#065F46",
  posBg: "#ECFDF5",
  posBorder: "#A7F3D0",
  neg: "#991B1B",
  negBg: "#FEF2F2",
  warn: "#92400E",
  purple: "#7C3AED",
  info: "#2137B6",
  infoBg: "#EEF0FB",
  infoBorder: "#C7CDEF",
  blue50: "#EEF0FB",
}

const TNUM: React.CSSProperties = { fontVariantNumeric: "tabular-nums lining-nums" }

type Stage = "upload" | "processing" | "done"

interface ProcessingStep {
  label: string
  sub: string
  status: "done" | "active" | "pending"
  progress?: number
}

export function RitualUploadClient({ sessionId }: { sessionId?: string }) {
  const router = useRouter()
  const [stage, setStage] = useState<Stage>("upload")
  const [uploading, setUploading] = useState(false)
  const [fileName, setFileName] = useState("")
  const [fileSize, setFileSize] = useState("")
  const fileRef = useRef<HTMLInputElement>(null)
  const [steps, setSteps] = useState<ProcessingStep[]>([
    { label: "Upload da gravação", sub: "aguardando arquivo", status: "pending" },
    { label: "IA transcrevendo", sub: "aguardando upload", status: "pending" },
    { label: "IA correlacionando transcrição com cada loja", sub: "aguardando etapa anterior", status: "pending" },
    { label: "IA extraindo decisões e gerando tasks", sub: "aguardando etapa anterior", status: "pending" },
  ])

  const handleFile = useCallback(async (file: File) => {
    setFileName(file.name)
    setFileSize(`${(file.size / (1024 * 1024 * 1024)).toFixed(2)} GB`)
    setUploading(true)

    setSteps((s) => s.map((st, i) =>
      i === 0 ? { ...st, status: "active" as const, sub: "enviando..." } : st
    ))
    setStage("processing")

    await new Promise((r) => setTimeout(r, 1500))

    setSteps((s) => s.map((st, i) => {
      if (i === 0) return { ...st, status: "done" as const, sub: `100% · ${fileSize || "upload completo"}` }
      if (i === 1) return { ...st, status: "active" as const, sub: "processando áudio..." }
      return st
    }))

    await new Promise((r) => setTimeout(r, 2000))

    setSteps((s) => s.map((st, i) => {
      if (i === 0) return st
      if (i === 1) return { ...st, status: "done" as const, sub: "transcrição completa" }
      if (i === 2) return { ...st, status: "active" as const, sub: "correlacionando com lojas...", progress: 0.58 }
      return st
    }))

    await new Promise((r) => setTimeout(r, 2000))

    setSteps((s) => s.map((st, i) => {
      if (i <= 1) return st
      if (i === 2) return { ...st, status: "done" as const, sub: "12 lojas mapeadas" }
      if (i === 3) return { ...st, status: "active" as const, sub: "extraindo decisões..." }
      return st
    }))

    await new Promise((r) => setTimeout(r, 2000))

    setSteps((s) => s.map((st) => ({ ...st, status: "done" as const })))

    await new Promise((r) => setTimeout(r, 500))
    setStage("done")
    setUploading(false)
  }, [fileSize])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) void handleFile(file)
  }, [handleFile])

  const onFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) void handleFile(file)
  }, [handleFile])

  return (
    <div style={{
      flex: 1, display: "flex", flexDirection: "column", alignItems: "stretch",
      padding: "32px 32px 48px", maxWidth: 920, margin: "0 auto", width: "100%",
    }}>
      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: 28 }}>
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 8,
          padding: "6px 14px", borderRadius: 999,
          background: C.posBg, border: `1px solid ${C.posBorder}`,
          fontSize: 12, fontWeight: 600, color: C.pos, marginBottom: 14,
        }}>
          <Check size={13} /> Ritual concluído
        </div>
        <h1 style={{ margin: 0, fontSize: 28, fontWeight: 600, color: C.g900, letterSpacing: "-0.02em" }}>
          12 lojas revisadas em 1h 58min
        </h1>
        <div style={{ marginTop: 8, fontSize: 14, color: C.g500 }}>
          Fathom capturou toda a discussão · Agora suba a gravação para a IA extrair as decisões.
        </div>
      </div>

      {/* Summary strip */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(6, 1fr)",
        background: C.white, border: `1px solid ${C.border}`,
        borderRadius: 12, overflow: "hidden", marginBottom: 22,
        boxShadow: C.shadowSm,
      }}>
        {[
          { label: "Lojas", value: "12", tone: C.g900 },
          { label: "Em crise", value: "3", tone: C.warn },
          { label: "Saudáveis", value: "7", tone: C.pos },
          { label: "Renovação", value: "1", tone: C.purple },
          { label: "Solicitações", value: "1", tone: C.brand },
          { label: "Perguntas IA", value: "47", tone: C.g700 },
        ].map((k, i) => (
          <div key={k.label} style={{
            padding: "14px 16px",
            borderLeft: i === 0 ? "none" : `1px solid ${C.border}`,
            textAlign: "center",
          }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: C.g500, letterSpacing: "0.06em", textTransform: "uppercase" }}>{k.label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: k.tone, ...TNUM, marginTop: 4, letterSpacing: "-0.02em" }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Upload card */}
      {stage === "upload" && (
        <div style={{
          padding: 32, background: C.white,
          border: `1px solid ${C.border}`, borderRadius: 14,
          textAlign: "center", boxShadow: C.shadowSm,
        }}>
          <div style={{
            margin: "0 auto 16px", width: 64, height: 64, borderRadius: 16,
            background: C.blue50, color: C.brand,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}><Download size={28} /></div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600, color: C.g900, letterSpacing: "-0.01em" }}>
            Suba a gravação Fathom
          </h2>
          <div style={{ marginTop: 6, fontSize: 13.5, color: C.g500 }}>
            A IA vai transcrever, correlacionar com cada loja e extrair as decisões em tasks.
          </div>

          {/* Dropzone */}
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={onDrop}
            style={{
              marginTop: 22, padding: "36px 24px",
              background: C.g25, border: `2px dashed rgba(78,98,216,0.35)`,
              borderRadius: 12,
              display: "flex", flexDirection: "column", alignItems: "center", gap: 10,
            }}
          >
            <div style={{ fontSize: 14, color: C.g600 }}>Arraste o arquivo aqui ou</div>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              style={{
                padding: "9px 18px", fontSize: 13, fontWeight: 600,
                color: "#fff", background: C.brand,
                border: "none", borderRadius: 8, cursor: "pointer",
                display: "inline-flex", alignItems: "center", gap: 6,
                boxShadow: "0 1px 2px rgba(0,0,0,0.08)",
              }}
            >
              <Download size={14} /> Selecionar arquivo
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".mp4,.mp3,.m4a,.wav"
              onChange={onFileSelect}
              style={{ display: "none" }}
            />
            <div style={{ fontSize: 11.5, color: C.g400, ...TNUM }}>
              .mp4 · .mp3 · link Fathom · até 2GB
            </div>
          </div>

          <div style={{
            marginTop: 18, padding: "12px 16px",
            background: C.g50, border: `1px solid ${C.border}`, borderRadius: 8,
            display: "flex", alignItems: "center", justifyContent: "space-between",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: C.g700 }}>
              <LinkIcon size={15} />
              <span><strong style={{ fontWeight: 600 }}>Conectar Fathom via API</strong> — gravações sobem automaticamente</span>
            </div>
            <button type="button" style={{
              padding: "6px 12px", fontSize: 12, fontWeight: 500,
              color: C.g700, background: C.white,
              border: `1px solid ${C.g300}`, borderRadius: 6, cursor: "pointer",
            }}>Conectar</button>
          </div>

          <div style={{ marginTop: 20, fontSize: 12, color: C.g500 }}>
            Sem gravação? <span style={{ color: C.brand, cursor: "pointer" }}>Preencher manualmente</span>
          </div>
        </div>
      )}

      {/* Processing card */}
      {stage === "processing" && (
        <div style={{
          padding: 28, background: C.white,
          border: `1px solid ${C.border}`, borderRadius: 14,
          boxShadow: C.shadowSm,
        }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 12,
            padding: 14, background: C.g25,
            border: `1px solid ${C.border}`, borderRadius: 10, marginBottom: 22,
          }}>
            <div style={{
              width: 40, height: 40, borderRadius: 8,
              background: C.negBg, color: C.neg,
              display: "inline-flex", alignItems: "center", justifyContent: "center",
            }}><FileVideo size={18} /></div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.g900 }}>{fileName || "ritual-gravacao.mp4"}</div>
              <div style={{ fontSize: 11.5, color: C.g500, ...TNUM }}>{fileSize || "1.42 GB"} · Fathom export</div>
            </div>
            <span style={{
              fontSize: 11, fontWeight: 600, padding: "3px 9px",
              color: C.info, background: C.infoBg,
              border: `1px solid ${C.infoBorder}`, borderRadius: 999,
            }}>processando</span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {steps.map((step, i) => (
              <ProcessStepRow key={i} step={step} />
            ))}
          </div>

          <div style={{ marginTop: 22, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ fontSize: 12, color: C.g500, display: "inline-flex", alignItems: "center", gap: 6 }}>
              <Bell size={13} /> Aviso no admin assim que terminar (~6min)
            </div>
            <button type="button" style={{
              padding: "8px 16px", fontSize: 13, fontWeight: 500,
              color: C.g700, background: C.white,
              border: `1px solid ${C.g300}`, borderRadius: 8, cursor: "pointer",
            }}>Continuar em background</button>
          </div>
        </div>
      )}

      {/* Done card */}
      {stage === "done" && (
        <div style={{
          padding: 32, background: C.white,
          border: `1px solid ${C.border}`, borderRadius: 14, textAlign: "center",
          boxShadow: C.shadowSm,
        }}>
          <div style={{
            margin: "0 auto 16px", width: 64, height: 64, borderRadius: 16,
            background: C.posBg, color: C.pos,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}><Check size={32} /></div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 600, color: C.g900 }}>
            14 tasks prontas para revisão
          </h2>
          <div style={{ marginTop: 8, fontSize: 14, color: C.g500 }}>
            IA extraiu decisões de 4 lojas críticas. Revise, edite ou aprove tudo.
          </div>
          <button
            type="button"
            onClick={() => router.push("/admin/operacional/ritual/tasks")}
            style={{
              marginTop: 22, padding: "12px 24px",
              fontSize: 14, fontWeight: 600, color: "#fff", background: C.brand,
              border: "none", borderRadius: 8, cursor: "pointer",
              display: "inline-flex", alignItems: "center", gap: 8,
              boxShadow: "0 1px 2px rgba(0,0,0,0.08)",
            }}
          >
            Revisar tasks <ChevronRight size={15} />
          </button>
        </div>
      )}
    </div>
  )
}

function ProcessStepRow({ step }: { step: ProcessingStep }) {
  const isDone = step.status === "done"
  const isActive = step.status === "active"
  return (
    <div style={{
      display: "grid", gridTemplateColumns: "28px 1fr auto",
      gap: 12, alignItems: "center",
      padding: "10px 12px",
      background: isActive ? C.infoBg : "transparent",
      border: `1px solid ${isActive ? C.infoBorder : C.g100}`,
      borderRadius: 8,
    }}>
      <div style={{
        width: 24, height: 24, borderRadius: "50%",
        background: isDone ? C.posBg : isActive ? C.white : C.g100,
        color: isDone ? C.pos : isActive ? C.brand : C.g400,
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        border: `2px solid ${isDone ? C.posBorder : isActive ? C.brand : C.g200}`,
      }}>
        {isDone ? <Check size={13} />
          : isActive ? <Loader2 size={14} style={{ animation: "cf-spin 1s linear infinite" }} />
          : <span style={{ fontSize: 10, color: C.g400 }}>·</span>}
      </div>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: isDone ? C.g700 : isActive ? C.info : C.g500 }}>{step.label}</div>
        <div style={{ fontSize: 11.5, color: isActive ? C.info : C.g500, marginTop: 1, opacity: isActive ? 1 : 0.8 }}>{step.sub}</div>
        {step.progress != null && isActive && (
          <div style={{ marginTop: 6, height: 3, background: "rgba(78,98,216,0.15)", borderRadius: 2, overflow: "hidden" }}>
            <div style={{ width: `${step.progress * 100}%`, height: "100%", background: C.brand, transition: "width 200ms" }} />
          </div>
        )}
      </div>
      <span style={{ fontSize: 11, color: isActive ? C.brand : isDone ? C.pos : C.g400, fontWeight: 500, ...TNUM }}>
        {isDone ? "concluído" : isActive ? "em andamento" : "aguardando"}
      </span>
      <style>{`@keyframes cf-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
