"use client"

import { useState, useRef, useEffect } from "react"
import { BlockSection, EmptyState, MiniSpinner, useFetch, C } from "./_shared"
import type {
  TaskStoreContext,
  TaskTopProduct,
} from "@/types/task-store-context"

function formatBytes(b: number): string {
  if (b < 1024) return `${b}B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)}KB`
  return `${(b / 1024 / 1024).toFixed(1)}MB`
}

function moneyBRL(n: number | null): string {
  if (n == null || isNaN(Number(n))) return "—"
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Number(n))
}

function Swatch({
  hex,
  onChange,
  editable,
}: {
  hex: string
  onChange?: (v: string) => void
  editable?: boolean
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: 4,
          background: hex,
          border: `1px solid ${C.gray200}`,
          position: "relative",
        }}
      >
        {editable && onChange && (
          <input
            type="color"
            value={hex}
            onChange={(e) => onChange(e.target.value.toUpperCase())}
            style={{
              position: "absolute",
              inset: 0,
              opacity: 0,
              cursor: "pointer",
            }}
          />
        )}
      </div>
      <span style={{ fontSize: 10, color: C.gray500, fontFamily: "ui-monospace, monospace" }}>
        {hex}
      </span>
    </div>
  )
}

function LogoSlot({
  slot,
  data,
  onUpload,
  uploading,
}: {
  slot: "logo_main" | "logo_mono"
  data?: { url: string; filename: string; size: number }
  onUpload: (file: File) => void
  uploading: boolean
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  return (
    <div
      style={{
        border: `1px dashed ${data ? C.gray200 : C.brandBlue100}`,
        background: data ? "#fff" : C.brandBlue50,
        borderRadius: 4,
        padding: 12,
        display: "flex",
        alignItems: "center",
        gap: 12,
      }}
    >
      <div
        style={{
          width: 56,
          height: 56,
          flexShrink: 0,
          background: slot === "logo_mono" ? C.gray900 : C.gray50,
          borderRadius: 4,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
        }}
      >
        {data?.url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={data.url}
            alt={slot}
            style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
          />
        ) : (
          <span style={{ fontSize: 10, color: C.gray500 }}>—</span>
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: C.gray700, marginBottom: 2 }}>
          {slot === "logo_main" ? "Logo principal" : "Logo monocromática"}
        </div>
        {data ? (
          <div style={{ fontSize: 11, color: C.gray500 }}>
            {data.filename} · {formatBytes(data.size)}
          </div>
        ) : (
          <div style={{ fontSize: 11, color: C.gray500 }}>Nenhum upload ainda</div>
        )}
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          style={{
            marginTop: 4,
            fontSize: 11,
            fontWeight: 600,
            color: C.brandBlue,
            background: "transparent",
            border: "none",
            cursor: uploading ? "wait" : "pointer",
            padding: 0,
            textDecoration: "underline",
          }}
        >
          {uploading ? "Enviando..." : data ? "Substituir" : "Selecionar arquivo"}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/svg+xml,image/webp"
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) onUpload(f)
          }}
        />
      </div>
    </div>
  )
}

function TopProductCard({ p }: { p: TaskTopProduct }) {
  return (
    <div
      style={{
        border: `1px solid ${C.gray200}`,
        borderRadius: 4,
        padding: 6,
        background: "#fff",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 4,
      }}
    >
      <div
        style={{
          width: "100%",
          aspectRatio: "1",
          background: C.gray50,
          borderRadius: 4,
          overflow: "hidden",
          position: "relative",
        }}
      >
        {p.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={p.image_url}
            alt={p.title}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : null}
        <span
          style={{
            position: "absolute",
            top: 2,
            left: 2,
            fontSize: 9,
            fontWeight: 700,
            background: C.gray900,
            color: "#fff",
            padding: "1px 5px",
            borderRadius: 3,
          }}
        >
          #{p.rank}
        </span>
      </div>
      <div
        style={{
          fontSize: 10,
          color: C.gray700,
          textAlign: "center",
          lineHeight: 1.2,
          minHeight: 24,
        }}
        title={p.title}
      >
        {p.title}
      </div>
      <div
        style={{
          fontSize: 10,
          fontWeight: 600,
          color: C.brandBlue,
          fontFamily: "ui-monospace, monospace",
        }}
      >
        {moneyBRL(p.price)}
      </div>
    </div>
  )
}

export function BlockAssetsVisuais({ taskId }: { taskId: string }) {
  const { data, loading, mutate } = useFetch<TaskStoreContext>(
    taskId ? `/api/tasks/${taskId}/store-context` : null,
  )

  const onbId = data?.onboarding_id ?? null
  const storeId = data?.store_id ?? data?.identity?.store_id ?? null

  const [editing, setEditing] = useState(false)
  const [draftPalette, setDraftPalette] = useState<string[]>([])
  const [draftFont, setDraftFont] = useState<{ family: string; fallback?: string }>({
    family: "",
  })
  const [uploadingSlot, setUploadingSlot] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (data?.assets_visuais) {
      const a = data.assets_visuais
      setDraftPalette(
        a.palette.length > 0
          ? a.palette
          : ["#1A1A1A", "#FFFFFF", "#6B7280", "#D1D5DB", "#E5E7EB"],
      )
      setDraftFont(
        a.font ?? { family: "Inter", fallback: "Helvetica, sans-serif" },
      )
    }
  }, [data])

  async function saveAssets() {
    if (!storeId) return
    setSaving(true)
    setError(null)
    try {
      // Converte string[] → cores ([{hex, name}]) e {family, fallback} → fontes ({titulo, corpo})
      const coresPayload = draftPalette.map((hex, i) => ({
        hex,
        name: `Cor ${i + 1}`,
      }))
      const fontesPayload = {
        titulo: draftFont.family || undefined,
        corpo: draftFont.fallback || undefined,
      }

      const r = await fetch(`/api/admin/stores/${storeId}/context`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          cores: coresPayload,
          fontes: fontesPayload,
        }),
      })
      if (!r.ok) {
        const t = await r.text()
        setError(`Erro ao salvar: ${t.slice(0, 100)}`)
        return
      }
      setEditing(false)
      mutate()
    } finally {
      setSaving(false)
    }
  }

  async function uploadLogo(slot: "logo_main" | "logo_mono", file: File) {
    if (!onbId) return
    setUploadingSlot(slot)
    setError(null)
    try {
      const form = new FormData()
      form.append("file", file)
      form.append("slot", slot)
      const r = await fetch(`/api/onboardings/${onbId}/visual-assets/upload`, {
        method: "POST",
        credentials: "include",
        body: form,
      })
      if (!r.ok) {
        const t = await r.text()
        setError(`Erro no upload: ${t.slice(0, 100)}`)
        return
      }
      const j = await r.json()
      const u = j.data ?? j
      const slotKey = slot === "logo_main" ? "main" : "mono"
      const currentLogos = data?.assets_visuais.logos ?? {}
      const newLogos = {
        ...currentLogos,
        [slotKey]: {
          url: u.url,
          filename: u.filename,
          size: u.size,
          path: u.path,
        },
      }
      // Logos ainda ficam em onboardings.visual_assets.logos (escopo separado)
      await fetch(`/api/onboardings/${onbId}/visual-assets`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ visual_assets: { logos: newLogos } }),
      })
      mutate()
    } finally {
      setUploadingSlot(null)
    }
  }

  if (loading) {
    return (
      <BlockSection title="Assets visuais">
        <div style={{ display: "flex", alignItems: "center", gap: 8, color: C.gray500, fontSize: 13 }}>
          <MiniSpinner />
          Carregando assets...
        </div>
      </BlockSection>
    )
  }

  if (!storeId) {
    return (
      <BlockSection title="Assets visuais">
        <EmptyState
          title="Sem loja vinculada"
          description="Assets visuais ficam atrelados a uma loja. Vincule esta task a um onboarding."
        />
      </BlockSection>
    )
  }

  const assets = data?.assets_visuais ?? {
    palette: [],
    font: null,
    logos: {},
  }
  const palette = editing
    ? draftPalette
    : assets.palette.length > 0
      ? assets.palette
      : ["#1A1A1A", "#FFFFFF", "#6B7280", "#D1D5DB", "#E5E7EB"]
  const font = editing
    ? draftFont
    : assets.font ?? { family: "Inter", fallback: "Helvetica, sans-serif" }
  const products = data?.top_products ?? []

  return (
    <BlockSection
      title="Assets visuais"
      action={
        editing ? (
          <div style={{ display: "flex", gap: 6 }}>
            <button
              type="button"
              onClick={() => setEditing(false)}
              disabled={saving}
              style={{
                fontSize: 11,
                color: C.gray500,
                background: "transparent",
                border: "none",
                cursor: saving ? "wait" : "pointer",
                padding: "4px 8px",
              }}
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={saveAssets}
              disabled={saving}
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: "#fff",
                background: C.brandBlue,
                border: "none",
                cursor: saving ? "wait" : "pointer",
                padding: "4px 10px",
                borderRadius: 4,
              }}
            >
              {saving ? "Salvando..." : "Salvar"}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: C.brandBlue,
              background: "transparent",
              border: "none",
              cursor: "pointer",
              padding: "4px 8px",
              borderRadius: 4,
            }}
          >
            Editar
          </button>
        )
      }
    >
      {error && (
        <div
          style={{
            marginBottom: 10,
            padding: 8,
            background: "#FEF2F2",
            color: C.redText,
            fontSize: 11,
            borderRadius: 4,
          }}
        >
          {error}
        </div>
      )}

      {/* Paleta */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: C.gray500, marginBottom: 8 }}>
          Paleta
        </div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {palette.map((hex, i) => (
            <Swatch
              key={i}
              hex={hex}
              editable={editing}
              onChange={
                editing
                  ? (v) =>
                      setDraftPalette((arr) =>
                        arr.map((x, idx) => (idx === i ? v : x)),
                      )
                  : undefined
              }
            />
          ))}
        </div>
      </div>

      {/* Logos */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: C.gray500, marginBottom: 8 }}>
          Logos
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <LogoSlot
            slot="logo_main"
            data={assets.logos?.main}
            uploading={uploadingSlot === "logo_main"}
            onUpload={(f) => uploadLogo("logo_main", f)}
          />
          <LogoSlot
            slot="logo_mono"
            data={assets.logos?.mono}
            uploading={uploadingSlot === "logo_mono"}
            onUpload={(f) => uploadLogo("logo_mono", f)}
          />
        </div>
      </div>

      {/* Fonte */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: C.gray500, marginBottom: 8 }}>
          Tipografia
        </div>
        {editing ? (
          <div style={{ display: "flex", gap: 8 }}>
            <input
              value={draftFont.family}
              onChange={(e) => setDraftFont((f) => ({ ...f, family: e.target.value }))}
              placeholder="Título (ex: Inter, Roboto)"
              style={{
                flex: 1,
                padding: "6px 8px",
                fontSize: 12,
                border: `1px solid ${C.gray200}`,
                borderRadius: 4,
                outline: "none",
              }}
            />
            <input
              value={draftFont.fallback ?? ""}
              onChange={(e) => setDraftFont((f) => ({ ...f, fallback: e.target.value }))}
              placeholder="Corpo (Helvetica, sans-serif)"
              style={{
                flex: 1,
                padding: "6px 8px",
                fontSize: 12,
                border: `1px solid ${C.gray200}`,
                borderRadius: 4,
                outline: "none",
              }}
            />
          </div>
        ) : (
          <div
            style={{
              padding: 10,
              background: C.gray50,
              borderRadius: 4,
              fontFamily: `${font.family}, ${font.fallback ?? "sans-serif"}`,
            }}
          >
            <div style={{ fontSize: 11, color: C.gray500, marginBottom: 2 }}>
              {font.family} · {font.fallback ?? "sans-serif"}
            </div>
            <div style={{ fontSize: 18, fontWeight: 600, color: C.gray900 }}>AaBbCc 123</div>
            <div style={{ fontSize: 12, color: C.gray700 }}>Preview rápido da tipografia</div>
          </div>
        )}
      </div>

      {/* Top 5 produtos — read-only (vem do n8n via store_top_products) */}
      <div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 8,
          }}
        >
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              textTransform: "uppercase",
              color: C.gray500,
            }}
          >
            Top 5 produtos
          </div>
          <span style={{ fontSize: 10, color: C.gray500, fontStyle: "italic" }}>
            Capturado automaticamente
          </span>
        </div>
        {products.length === 0 ? (
          <EmptyState
            title="Nenhum produto capturado"
            description="Os produtos top da loja são capturados periodicamente pela integração. Edição manual disponível na aba Contexto/Operação."
          />
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 6 }}>
            {products.map((p) => (
              <TopProductCard key={p.rank} p={p} />
            ))}
          </div>
        )}
      </div>
    </BlockSection>
  )
}
