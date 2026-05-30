/**
 * Helper niche-adaptive: deriva a variável {CENARIO} (cenário visual)
 * cruzando o nicho da marca com o posicionamento de preço.
 *
 * Override sempre vence. Matching de nicho é case-insensitive por
 * substring para acomodar variações ("acessorios automotivos" → automotivo).
 *
 * Story AE-10. Puro (zero dependência de DB).
 */

interface DeriveCenarioInput {
  nicho: string | null | undefined
  posicionamento: string | null | undefined
  override?: string | null
}

// Map de chave canônica (substring) → cenário base.
// Iteração na ordem inserida; entradas mais específicas devem vir antes
// das genéricas em caso de ambiguidade.
const NICHO_CENARIO_MAP: Record<string, string> = {
  moda: "rua urbana ou ambiente social elegante",
  beleza: "bancada de spa ou ambiente minimalista bem iluminado",
  automotivo: "interior de carro premium ou garagem clean",
  pet: "ambiente domestico aconchegante com pet em foco",
  gourmet: "mesa posta ou cozinha rustica iluminada",
  decoracao: "ambiente residencial estiloso com luz natural",
  tech: "superficie escura com spotlight cinematografico",
  gadgets: "superficie escura com spotlight cinematografico",
  saude: "ambiente clinico clean ou natural ao ar livre",
  suplementos: "ambiente fitness ou cozinha funcional",
  infantil: "ambiente ludico colorido com luz suave",
  esporte: "ambiente esportivo dinamico (academia, rua, quadra)",
  fitness: "ambiente esportivo dinamico (academia, rua, quadra)",
}

const FALLBACK_CENARIO = "ambiente clean e contemporaneo"

function suffixForPosicionamento(posicionamento: string | null | undefined): string {
  const p = (posicionamento ?? "").trim().toLowerCase()
  if (p === "premium") return ", sofisticado e exclusivo"
  if (p === "popular") return ", acessivel e cotidiano"
  return ""
}

export function deriveCenario(input: DeriveCenarioInput): string {
  if (input.override && input.override.trim() !== "") {
    return input.override
  }
  const nichoNorm = (input.nicho ?? "").trim().toLowerCase()
  let base = FALLBACK_CENARIO
  if (nichoNorm) {
    for (const key of Object.keys(NICHO_CENARIO_MAP)) {
      if (nichoNorm.includes(key)) {
        base = NICHO_CENARIO_MAP[key]
        break
      }
    }
  }
  return `${base}${suffixForPosicionamento(input.posicionamento)}`
}
