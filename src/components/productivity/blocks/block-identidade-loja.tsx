"use client"

import { useRouter } from "next/navigation"
import { BlockSection, EmptyState, MiniSpinner, useFetch, C } from "./_shared"
import type { TaskStoreContext } from "@/types/task-store-context"

function Field({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div>
      <div
        style={{
          fontSize: 10,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: 0.4,
          color: C.gray500,
          marginBottom: 2,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 13,
          color: C.gray900,
          fontVariantNumeric: mono ? "tabular-nums" : undefined,
          fontFamily: mono ? "Inter, ui-monospace, monospace" : undefined,
        }}
      >
        {value}
      </div>
    </div>
  )
}

function moneyBRL(n: number | null | undefined): string {
  if (n == null || isNaN(Number(n))) return "—"
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Number(n))
}

export function BlockIdentidadeLoja({ taskId }: { taskId: string }) {
  const router = useRouter()
  const { data, loading, error } = useFetch<TaskStoreContext>(
    taskId ? `/api/tasks/${taskId}/store-context` : null,
  )

  if (loading) {
    return (
      <BlockSection title="Identidade da loja">
        <div style={{ display: "flex", alignItems: "center", gap: 8, color: C.gray500, fontSize: 13 }}>
          <MiniSpinner />
          Carregando contexto da loja...
        </div>
      </BlockSection>
    )
  }

  if (error || !data?.identity || !data.identity.store_name) {
    return (
      <BlockSection title="Identidade da loja">
        <EmptyState
          title="Sem loja vinculada"
          description="Esta task não está associada a um onboarding ou loja no momento."
        />
      </BlockSection>
    )
  }

  const id = data.identity
  const storeId = id.store_id ?? data.store_id

  return (
    <BlockSection
      title="Identidade da loja"
      action={
        storeId && (
          <button
            type="button"
            onClick={() => router.push(`/admin/stores/${storeId}`)}
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
            Ver loja completa →
          </button>
        )
      }
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: "12px 16px",
        }}
      >
        <Field label="Loja" value={id.store_name || "—"} />
        <Field label="Nicho" value={id.niche || "—"} />
        <Field label="Plano" value={id.plan || "—"} />
        <Field label="MRR" value={moneyBRL(id.mrr)} mono />
        <Field label="Plataforma" value={id.platform || "—"} />
        <Field label="Idioma" value={id.language || "pt-BR"} />
      </div>
      {id.client_name && (
        <div
          style={{
            marginTop: 12,
            paddingTop: 12,
            borderTop: `1px solid ${C.gray100}`,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <div
            style={{
              width: 24,
              height: 24,
              borderRadius: "50%",
              background: C.brandBlue50,
              color: C.brandBlue,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 10,
              fontWeight: 700,
            }}
          >
            {id.client_name
              .split(" ")
              .map((w) => w[0])
              .slice(0, 2)
              .join("")
              .toUpperCase()}
          </div>
          <div style={{ fontSize: 12, color: C.gray700 }}>
            <strong style={{ color: C.gray900 }}>{id.client_name}</strong>
            {id.client_owner?.name && (
              <span style={{ color: C.gray500, marginLeft: 8 }}>
                · CS: {id.client_owner.name}
              </span>
            )}
          </div>
        </div>
      )}
    </BlockSection>
  )
}
