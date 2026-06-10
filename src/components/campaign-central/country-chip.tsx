"use client"

// Cobre os 16 países do onboarding (lib/constants/onboarding.ts).
// UK aparece pra back-compat: a tabela commemorative_dates ainda usa
// 'UK' como código de Reino Unido, enquanto client_stores armazena 'GB'
// (normalizado pelo engine/calendar antes de chegar aqui).
const COUNTRY_META: Record<string, { name: string; dot: string }> = {
  BR: { name: "Brasil", dot: "#16A34A" },
  US: { name: "Estados Unidos", dot: "#2137B6" },
  PT: { name: "Portugal", dot: "#DC2626" },
  ES: { name: "Espanha", dot: "#F59E0B" },
  MX: { name: "México", dot: "#15803D" },
  AR: { name: "Argentina", dot: "#0EA5E9" },
  CO: { name: "Colômbia", dot: "#FACC15" },
  CL: { name: "Chile", dot: "#B91C1C" },
  DE: { name: "Alemanha", dot: "#1F2937" },
  FR: { name: "França", dot: "#1E40AF" },
  IT: { name: "Itália", dot: "#16A34A" },
  GB: { name: "Reino Unido", dot: "#7C3AED" },
  UK: { name: "Reino Unido", dot: "#7C3AED" },
  CA: { name: "Canadá", dot: "#DC2626" },
  AU: { name: "Austrália", dot: "#0F766E" },
  JP: { name: "Japão", dot: "#E11D48" },
  OTHER: { name: "Outro", dot: "#94A3B8" },
}

export function CountryChip({ code, size = "md" }: { code: string; size?: "sm" | "md" }) {
  const upper = (code || "").toUpperCase()
  const meta = COUNTRY_META[upper]
  if (!meta) return null
  const sm = size === "sm"
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border border-border bg-card font-semibold text-muted-foreground ${
        sm ? "px-1.5 py-px text-[10.5px]" : "px-2 py-0.5 text-[11px]"
      }`}
      title={meta.name}
    >
      <span className="inline-block size-1.5 rounded-full" style={{ background: meta.dot }} />
      {upper === "UK" ? "GB" : upper}
    </span>
  )
}

export function getCountryMeta(code: string) {
  return COUNTRY_META[(code || "").toUpperCase()] ?? { name: code, dot: "#94A3B8" }
}
