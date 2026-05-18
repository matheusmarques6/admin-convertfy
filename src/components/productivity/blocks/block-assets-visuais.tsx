"use client"

import { useState, useRef, useEffect } from "react"
import { BlockSection, EmptyState, MiniSpinner, useFetch, C } from "./_shared"

type VisualAssets = {
  palette?: string[]
  logos?: {
    main?: { url: string; filename: string; size: number; path?: string }
    mono?: { url: string; filename: string; size: number; path?: string }
  }
  font?: { family: string; fallback?: string }
  top_products?: Array<{ name: string; image_url?: string; url?: string }>
} | null

function formatBytes(b: number): string {
  if (b < 1024) return `${b}B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)}KB`
  return `${(b / 1024 / 1024).toFixed(1)}MB`
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

export function BlockAssetsVisuais({ taskId }: { taskId: string }) {
  // 1. busca contexto pra pegar onboarding_id
  const { data: ctx } = useFetch<{ onboarding_id: string | null }>(
    `/api/tasks/${taskId}/store-context`,
  )
  const onbId = ctx?.onboarding_id ?? null

  // 2. busca assets
  const { data, loading, mutate } = useFetch<{ visual_assets: VisualAssets }>(
    onbId ? `/api/onboardings/${onbId}/visual-assets` : null,
  )

  const [editing, setEditing] = useState(false)
  const [draftPalette, setDraftPalette] = useState<string[]>([])
  const [draftFont, setDraftFont] = useState<{ family: string; fallback?: string }>({
    family: "",
  })
  const [draftProducts, setDraftProducts] = useState<
    Array<{ name: string; image_url?: string; url?: string }>
  >([])
  const [uploadingSlot, setUploadingSlot] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (data?.visual_assets) {
      const a = data.visual_assets
      setDraftPalette(a.palette ?? ["#1A1A1A", "#FFFFFF", "#6B7280", "#D1D5DB", "#E5E7EB"])
      setDraftFont(a.font ?? { family: "Inter", fallback: "Helvetica, sans-serif" })
      setDraftProducts(a.top_products ?? [])
    } else {
      setDraftPalette(["#1A1A1A", "#FFFFFF", "#6B7280", "#D1D5DB", "#E5E7EB"])
      setDraftFont({ family: "Inter", fallback: "Helvetica, sans-serif" })
      setDraftProducts([])
    }
  }, [data])

  async function savePalette() {
    if (!onbId) return
    await fetch(`/api/onboardings/${onbId}/visual-assets`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ visual_assets: { palette: draftPalette, font: draftFont, top_products: draftProducts } }),
    })
    setEditing(false)
    mutate()
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
      const current = data?.visual_assets ?? {}
      const newLogos = {
        ...(current.logos ?? {}),
        [slotKey]: {
          url: u.url,
          filename: u.filename,
          size: u.size,
          path: u.path,
        },
      }
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

  if (!onbId) {
    return (
      <BlockSection title="Assets visuais">
        <EmptyState
          title="Sem onboarding vinculado"
          description="Assets visuais ficam atrelados a um onboarding ativo."
        />
      </BlockSection>
    )
  }

  const assets = data?.visual_assets ?? null
  const palette = assets?.palette ?? draftPalette
  const font = assets?.font ?? draftFont
  const products = assets?.top_products ?? []

  return (
    <BlockSection
      title="Assets visuais"
      action={
        editing ? (
          <div style={{ display: "flex", gap: 6 }}>
            <button
              type="button"
              onClick={() => setEditing(false)}
              style={{
                fontSize: 11,
                color: C.gray500,
                background: "transparent",
                border: "none",
                cursor: "pointer",
                padding: "4px 8px",
              }}
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={savePalette}
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: "#fff",
                background: C.brandBlue,
                border: "none",
                cursor: "pointer",
                padding: "4px 10px",
                borderRadius: 4,
              }}
            >
              Salvar
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
          {(editing ? draftPalette : palette).map((hex, i) => (
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
            data={assets?.logos?.main}
            uploading={uploadingSlot === "logo_main"}
            onUpload={(f) => uploadLogo("logo_main", f)}
          />
          <LogoSlot
            slot="logo_mono"
            data={assets?.logos?.mono}
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
              placeholder="Nome (ex: Inter, Roboto)"
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
              placeholder="Fallback (Helvetica, sans-serif)"
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

      {/* Top 5 produtos */}
      <div>
        <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: C.gray500, marginBottom: 8 }}>
          Top 5 produtos
        </div>
        {products.length === 0 && !editing ? (
          <EmptyState
            title="Nenhum produto cadastrado"
            description="Adicione os produtos campeões pra ancorar o copy gerado pela IA."
          />
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 6 }}>
            {(editing ? draftProducts : products).map((p, i) => (
              <div
                key={i}
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
                  }}
                >
                  {p.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={p.image_url}
                      alt={p.name}
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                  ) : null}
                </div>
                {editing ? (
                  <input
                    value={p.name}
                    onChange={(e) =>
                      setDraftProducts((arr) =>
                        arr.map((x, idx) => (idx === i ? { ...x, name: e.target.value } : x)),
                      )
                    }
                    placeholder="Nome"
                    style={{
                      width: "100%",
                      padding: 4,
                      fontSize: 10,
                      border: `1px solid ${C.gray200}`,
                      borderRadius: 4,
                      outline: "none",
                    }}
                  />
                ) : (
                  <div style={{ fontSize: 10, color: C.gray700, textAlign: "center", lineHeight: 1.2 }}>
                    {p.name}
                  </div>
                )}
              </div>
            ))}
            {editing && draftProducts.length < 5 && (
              <button
                type="button"
                onClick={() =>
                  setDraftProducts((arr) => [...arr, { name: "", image_url: "" }])
                }
                style={{
                  border: `1px dashed ${C.brandBlue}40`,
                  background: C.brandBlue50,
                  color: C.brandBlue,
                  borderRadius: 4,
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: "pointer",
                  padding: 6,
                  aspectRatio: "1",
                }}
              >
                + Produto
              </button>
            )}
          </div>
        )}
      </div>
    </BlockSection>
  )
}
