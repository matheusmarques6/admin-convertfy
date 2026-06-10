"use client"

const COUNTRY_META: Record<string, { name: string; dot: string }> = {
  BR: { name: "Brasil", dot: "#16A34A" },
  US: { name: "EUA", dot: "#2137B6" },
  PT: { name: "Portugal", dot: "#DC2626" },
  UK: { name: "Reino Unido", dot: "#7C3AED" },
  ES: { name: "Espanha", dot: "#F59E0B" },
}

export function CountryChip({ code, size = "md" }: { code: string; size?: "sm" | "md" }) {
  const meta = COUNTRY_META[code]
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
      {code}
    </span>
  )
}

export function getCountryMeta(code: string) {
  return COUNTRY_META[code] ?? { name: code, dot: "#94A3B8" }
}
