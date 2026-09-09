/**
 * Slots vazios do calendário: onde a cadência pede post e não há nada.
 *
 * É a peça mais fácil de errar por excesso de esperteza. Um slot é uma
 * PROMESSA de publicação, e o calendário mostra promessa e fato lado a
 * lado — se a promessa for inventada, o operador passa a ignorar as duas.
 *
 * Por isso:
 *
 * - **Cadência definida pelo humano vence sempre** (`config.conteudo.cadencia`
 *   do canal: quais dias da semana e a que hora). Só quando ela não existe é
 *   que a meta semanal vira uma SUGESTÃO espalhada pela semana — e a saída
 *   diz qual dos dois casos é (`origem`), para a tela poder rotular.
 * - **Passado não gera slot.** Slot é convite para agendar; oferecer "criar"
 *   numa terça que já passou é ruído que empurra o que importa para baixo.
 * - **Dia que já tem post ou agendamento DAQUELE perfil não gera slot.** O
 *   slot existe para mostrar buraco, não para pedir um segundo post.
 *
 * Puro e testado.
 */

export type DiaSemana = 0 | 1 | 2 | 3 | 4 | 5 | 6

export interface CadenciaDoPerfil {
  perfil: string
  /** Dias da semana (0 = domingo). Vazio = derivar da meta. */
  dias: DiaSemana[]
  /** HH:MM sugerido. */
  hora: string
  /** Publicações por semana. */
  metaSemanal: number
  /** `definida` = alguém configurou; `sugerida` = derivada da meta. */
  origem: "definida" | "sugerida"
}

export interface SlotVazio {
  /** YYYY-MM-DD */
  dia: string
  perfil: string
  hora: string
  origem: "definida" | "sugerida"
}

/**
 * Espalha `meta` publicações pela semana começando na SEGUNDA, o mais
 * distante possível entre si: 1 → seg; 2 → seg, qua; 3 → seg, qua, sex.
 * Sem isso, três publicações "por semana" viravam segunda, terça e quarta,
 * e a conta fecha enquanto a presença some de quinta em diante.
 */
export function diasSugeridos(meta: number): DiaSemana[] {
  const n = Math.max(0, Math.min(7, Math.floor(meta)))
  if (n === 0) return []
  if (n >= 7) return [1, 2, 3, 4, 5, 6, 0]
  // Índices 0..6 = seg..dom, espaçados; depois convertidos para 0=domingo.
  const segAdom: DiaSemana[] = [1, 2, 3, 4, 5, 6, 0]
  const passo = 7 / n
  // `floor`, não `round`: com 2 por semana, arredondar joga o segundo para
  // sexta e deixa a semana inteira sem nada depois; segunda e quinta é o
  // par que mantém presença nas duas metades.
  const escolhidos = Array.from({ length: n }, (_, i) => segAdom[Math.floor(i * passo) % 7])
  return Array.from(new Set(escolhidos))
}

/**
 * A cadência efetiva de um perfil: o que foi configurado, ou a sugestão
 * derivada da meta. `hora` cai no padrão da casa quando não declarada.
 */
export function cadenciaEfetiva(entrada: {
  perfil: string
  metaSemanal: number
  dias?: number[] | null
  hora?: string | null
}): CadenciaDoPerfil {
  const declarados = (entrada.dias ?? []).filter((d): d is DiaSemana => Number.isInteger(d) && d >= 0 && d <= 6)
  const unicos = Array.from(new Set(declarados))
  const hora = /^\d{2}:\d{2}$/.test(entrada.hora ?? "") ? (entrada.hora as string) : "11:30"
  if (unicos.length > 0) {
    return { perfil: entrada.perfil, dias: unicos, hora, metaSemanal: entrada.metaSemanal, origem: "definida" }
  }
  return {
    perfil: entrada.perfil,
    dias: diasSugeridos(entrada.metaSemanal),
    hora,
    metaSemanal: entrada.metaSemanal,
    origem: "sugerida",
  }
}

/** Dia da semana de um YYYY-MM-DD, sem passar por fuso. */
export function diaDaSemanaISO(dia: string): DiaSemana {
  const [a, m, d] = dia.split("-").map(Number)
  return new Date(a, (m ?? 1) - 1, d ?? 1).getDay() as DiaSemana
}

export interface OcupacaoDoDia {
  /** YYYY-MM-DD → perfis que já têm post ou agendamento nesse dia. */
  [dia: string]: string[]
}

/**
 * Os slots vazios da janela. `hoje` entra: o dia de hoje ainda gera slot
 * (dá para publicar hoje), os anteriores não.
 */
export function slotsVazios(args: {
  dias: string[]
  cadencias: CadenciaDoPerfil[]
  ocupacao: OcupacaoDoDia
  hoje: string
}): SlotVazio[] {
  const saida: SlotVazio[] = []
  for (const dia of args.dias) {
    if (dia < args.hoje) continue
    const dow = diaDaSemanaISO(dia)
    const ocupados = args.ocupacao[dia] ?? []
    for (const c of args.cadencias) {
      if (!c.dias.includes(dow)) continue
      if (ocupados.includes(c.perfil)) continue
      saida.push({ dia, perfil: c.perfil, hora: c.hora, origem: c.origem })
    }
  }
  return saida
}

/** Quantos slots vazios nos próximos `n` dias a partir de `hoje` (o KPI). */
export function slotsNaJanela(slots: SlotVazio[], hoje: string, n = 7): number {
  const inicio = new Date(`${hoje}T12:00:00`)
  const fim = new Date(inicio.getTime() + n * 24 * 3600 * 1000)
  const fimIso = fim.toISOString().slice(0, 10)
  return slots.filter((s) => s.dia >= hoje && s.dia < fimIso).length
}
