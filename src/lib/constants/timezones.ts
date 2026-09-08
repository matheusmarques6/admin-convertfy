/**
 * Fusos oferecidos no cadastro da loja (`client_stores.timezone`).
 *
 * Diferente de `STORE_CURRENCIES`, esta lista **não é fechada**: ela é o
 * atalho da tela, não a regra. Qualquer IANA que o runtime reconheça é
 * aceito pelo PATCH, porque quem preenche o campo na prática é a
 * plataforma (`/v5/brands/current`) e ela pode devolver um fuso que não
 * está aqui — recusá-lo faria a tela discordar do que já está no banco.
 *
 * O fuso importa porque é ele que corta a janela do relatório. Sem ele o
 * sistema assume America/Sao_Paulo, e toda loja europeia sai com a
 * fronteira do dia deslocada em 4-5 horas contra o painel da plataforma.
 */

export interface StoreTimezoneOption {
  value: string
  label: string
  regiao: string
}

export const STORE_TIMEZONES: readonly StoreTimezoneOption[] = [
  { value: "America/Sao_Paulo", label: "São Paulo", regiao: "América" },
  { value: "America/Argentina/Buenos_Aires", label: "Buenos Aires", regiao: "América" },
  { value: "America/Santiago", label: "Santiago", regiao: "América" },
  { value: "America/Bogota", label: "Bogotá", regiao: "América" },
  { value: "America/Lima", label: "Lima", regiao: "América" },
  { value: "America/Montevideo", label: "Montevidéu", regiao: "América" },
  { value: "America/Asuncion", label: "Assunção", regiao: "América" },
  { value: "America/Mexico_City", label: "Cidade do México", regiao: "América" },
  { value: "America/New_York", label: "Nova York", regiao: "América" },
  { value: "America/Chicago", label: "Chicago", regiao: "América" },
  { value: "America/Denver", label: "Denver", regiao: "América" },
  { value: "America/Los_Angeles", label: "Los Angeles", regiao: "América" },
  { value: "America/Toronto", label: "Toronto", regiao: "América" },

  { value: "Europe/Lisbon", label: "Lisboa", regiao: "Europa" },
  { value: "Europe/London", label: "Londres", regiao: "Europa" },
  { value: "Europe/Dublin", label: "Dublin", regiao: "Europa" },
  { value: "Europe/Madrid", label: "Madri", regiao: "Europa" },
  { value: "Europe/Paris", label: "Paris", regiao: "Europa" },
  { value: "Europe/Brussels", label: "Bruxelas", regiao: "Europa" },
  { value: "Europe/Amsterdam", label: "Amsterdã", regiao: "Europa" },
  { value: "Europe/Berlin", label: "Berlim", regiao: "Europa" },
  { value: "Europe/Zurich", label: "Zurique", regiao: "Europa" },
  { value: "Europe/Vienna", label: "Viena", regiao: "Europa" },
  { value: "Europe/Rome", label: "Roma", regiao: "Europa" },
  { value: "Europe/Copenhagen", label: "Copenhague", regiao: "Europa" },
  { value: "Europe/Stockholm", label: "Estocolmo", regiao: "Europa" },
  { value: "Europe/Oslo", label: "Oslo", regiao: "Europa" },
  { value: "Europe/Helsinki", label: "Helsinque", regiao: "Europa" },
  { value: "Europe/Warsaw", label: "Varsóvia", regiao: "Europa" },
  { value: "Europe/Prague", label: "Praga", regiao: "Europa" },
  { value: "Europe/Budapest", label: "Budapeste", regiao: "Europa" },
  { value: "Europe/Bucharest", label: "Bucareste", regiao: "Europa" },
  { value: "Europe/Sofia", label: "Sófia", regiao: "Europa" },
  { value: "Europe/Athens", label: "Atenas", regiao: "Europa" },
  { value: "Europe/Istanbul", label: "Istambul", regiao: "Europa" },
  { value: "Atlantic/Reykjavik", label: "Reiquiavique", regiao: "Europa" },

  { value: "Australia/Sydney", label: "Sydney", regiao: "Ásia-Pacífico" },
  { value: "Pacific/Auckland", label: "Auckland", regiao: "Ásia-Pacífico" },
  { value: "Asia/Tokyo", label: "Tóquio", regiao: "Ásia-Pacífico" },
  { value: "Asia/Shanghai", label: "Xangai", regiao: "Ásia-Pacífico" },
  { value: "Asia/Hong_Kong", label: "Hong Kong", regiao: "Ásia-Pacífico" },
  { value: "Asia/Singapore", label: "Singapura", regiao: "Ásia-Pacífico" },
  { value: "Asia/Seoul", label: "Seul", regiao: "Ásia-Pacífico" },
  { value: "Asia/Bangkok", label: "Bangkok", regiao: "Ásia-Pacífico" },
  { value: "Asia/Kolkata", label: "Calcutá", regiao: "Ásia-Pacífico" },
  { value: "Asia/Dubai", label: "Dubai", regiao: "Oriente Médio e África" },
  { value: "Asia/Riyadh", label: "Riade", regiao: "Oriente Médio e África" },
  { value: "Asia/Jerusalem", label: "Jerusalém", regiao: "Oriente Médio e África" },
  { value: "Africa/Johannesburg", label: "Joanesburgo", regiao: "Oriente Médio e África" },

  { value: "UTC", label: "UTC", regiao: "Outros" },
] as const

/** Nome amigável do fuso, ou o próprio IANA quando ele não está na lista. */
export function timezoneLabel(tz: string | null | undefined): string {
  if (!tz) return "—"
  return STORE_TIMEZONES.find((t) => t.value === tz)?.label ?? tz
}
