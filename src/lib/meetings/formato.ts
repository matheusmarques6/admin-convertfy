/**
 * Texto de data e hora de uma reunião, no fuso da reunião.
 *
 * Puro e testado porque é o campo que o cliente lê para decidir onde estar
 * às 15h — e um fuso errado aqui não dá erro em lugar nenhum: o email sai,
 * bonito, com o horário trocado.
 *
 * `meetings.timezone` é IANA (America/Sao_Paulo). Formatar com ele resolve
 * o horário de verão PELA DATA, o que um offset fixo não faz — a mesma
 * lição de `offsetForTimezone` no sync das lojas.
 */

const FUSO_PADRAO = "America/Sao_Paulo"

/** Fuso que o runtime não reconhece derrubaria o Intl — cai no padrão. */
export function fusoValido(tz: string | null | undefined): string {
  if (!tz) return FUSO_PADRAO
  try {
    new Intl.DateTimeFormat("pt-BR", { timeZone: tz })
    return tz
  } catch {
    return FUSO_PADRAO
  }
}

/** "quinta-feira, 11 de setembro de 2026" */
export function dataPorExtenso(iso: string, tz?: string | null): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: fusoValido(tz),
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date(iso))
}

/** "15:00" */
export function horaLocal(iso: string, tz?: string | null): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: fusoValido(tz),
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso))
}

/**
 * Sigla do fuso ("BRT", "GMT-3") para o cliente de outro país saber que o
 * horário não é o do relógio dele. Sem isso, "15:00" é ambíguo em qualquer
 * reunião internacional — e a carteira tem loja na Polônia e na Dinamarca.
 */
export function siglaDoFuso(iso: string, tz?: string | null): string {
  const partes = new Intl.DateTimeFormat("pt-BR", {
    timeZone: fusoValido(tz),
    timeZoneName: "short",
  }).formatToParts(new Date(iso))
  return partes.find((p) => p.type === "timeZoneName")?.value ?? ""
}

/** "15:00 às 15:30 (GMT-3)" — a janela inteira, que é o que se agenda. */
export function janelaLocal(
  iso: string,
  duracaoMinutos: number,
  tz?: string | null,
): string {
  const inicio = new Date(iso)
  const fim = new Date(inicio.getTime() + Math.max(0, duracaoMinutos) * 60_000)
  const sigla = siglaDoFuso(iso, tz)
  const base = `${horaLocal(inicio.toISOString(), tz)} às ${horaLocal(fim.toISOString(), tz)}`
  return sigla ? `${base} (${sigla})` : base
}

/** "30 minutos", "1 hora", "1h30" — como se fala, não "90 minutos". */
export function duracaoPorExtenso(minutos: number): string {
  const m = Math.max(0, Math.round(minutos))
  if (m === 0) return "sem duração definida"
  if (m < 60) return `${m} minutos`
  const horas = Math.floor(m / 60)
  const resto = m % 60
  const textoHoras = horas === 1 ? "1 hora" : `${horas} horas`
  if (resto === 0) return textoHoras
  return `${horas}h${String(resto).padStart(2, "0")}`
}
