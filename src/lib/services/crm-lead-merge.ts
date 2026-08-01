/**
 * Detecção de leads duplicados e plano de merge.
 *
 * Puro e testado porque merge é a operação mais destrutiva do CRM:
 * escolher o campo errado joga fora um telefone real; apagar antes de
 * re-apontar os vínculos perde histórico. A rota só aplica o que este
 * módulo decide.
 *
 * Duplicado = mesmo email (case-insensitive) OU mesmo telefone
 * (normalizado por dígitos, tolerando o nono dígito BR — a Meta ora
 * manda "5511987654321", ora "551187654321" para o MESMO número).
 * Nome NÃO é chave: "João Silva" duplicado de outro "João Silva" é
 * chute, e merge errado é pior que duplicado convivendo.
 */

export interface DupLead {
  id: string
  name: string
  email: string | null
  phone: string | null
  company: string | null
  role: string | null
  source: string | null
  status: string
  utm: Record<string, unknown> | null
  tags: string[] | null
  notes: string | null
  custom_fields: Record<string, unknown> | null
  converted_to_deal_id: string | null
  created_at: string
}

/** Chaves de telefone que identificam o mesmo número (variantes BR do 9º dígito). */
export function phoneKeys(raw: string | null | undefined): string[] {
  if (!raw) return []
  const digits = raw.replace(/\D/g, "")
  if (digits.length < 8) return []
  const keys = new Set<string>([digits])
  // 55 + DDD(2) + 9 + 8 dígitos = 13 → variante sem o 9
  if (digits.startsWith("55") && digits.length === 13 && digits[4] === "9") {
    keys.add(digits.slice(0, 4) + digits.slice(5))
  }
  // 55 + DDD(2) + 8 dígitos = 12 → variante com o 9
  if (digits.startsWith("55") && digits.length === 12) {
    keys.add(digits.slice(0, 4) + "9" + digits.slice(4))
  }
  return Array.from(keys)
}

export interface DuplicateGroup {
  /** Por que o grupo existe (mostrado na UI). */
  matched_by: "email" | "phone"
  /** Valor que casou (email ou telefone normalizado). */
  match_value: string
  leads: DupLead[]
  /** Sugestão de sobrevivente — a UI deixa trocar. */
  suggested_survivor_id: string
}

function dataRichness(l: DupLead): number {
  let score = 0
  if (l.email) score += 2
  if (l.phone) score += 2
  if (l.company) score++
  if (l.notes) score++
  if ((l.tags?.length ?? 0) > 0) score++
  if (l.utm && Object.keys(l.utm).length > 0) score++
  if (Object.keys(l.custom_fields ?? {}).length > 0) score++
  if (l.converted_to_deal_id) score += 3 // já virou negócio: âncora do histórico
  return score
}

/** Sobrevivente sugerido: mais dados; empate → o mais antigo (first touch). */
export function suggestSurvivor(leads: DupLead[]): string {
  return leads
    .slice()
    .sort(
      (a, b) =>
        dataRichness(b) - dataRichness(a) ||
        a.created_at.localeCompare(b.created_at) ||
        a.id.localeCompare(b.id),
    )[0].id
}

/**
 * Agrupa duplicados. Um lead pode aparecer em UM grupo só (o primeiro
 * que o capturou): grupos sobrepostos gerariam merges conflitantes.
 */
export function findDuplicateGroups(leads: DupLead[]): DuplicateGroup[] {
  const used = new Set<string>()
  const groups: DuplicateGroup[] = []

  const byKey = (
    keyOf: (l: DupLead) => string[],
    matchedBy: "email" | "phone",
  ) => {
    const buckets = new Map<string, DupLead[]>()
    for (const l of leads) {
      if (used.has(l.id)) continue
      for (const k of keyOf(l)) {
        const list = buckets.get(k)
        if (list) list.push(l)
        else buckets.set(k, [l])
      }
    }
    for (const [key, list] of buckets) {
      // O mesmo lead pode ter entrado pelo par com/sem 9º dígito
      const unique = Array.from(new Map(list.map((l) => [l.id, l])).values()).filter(
        (l) => !used.has(l.id),
      )
      if (unique.length < 2) continue
      for (const l of unique) used.add(l.id)
      groups.push({
        matched_by: matchedBy,
        match_value: key,
        leads: unique.sort((a, b) => a.created_at.localeCompare(b.created_at)),
        suggested_survivor_id: suggestSurvivor(unique),
      })
    }
  }

  byKey(
    (l) => (l.email?.trim() ? [l.email.trim().toLowerCase()] : []),
    "email",
  )
  byKey((l) => phoneKeys(l.phone), "phone")

  return groups.sort((a, b) => b.leads.length - a.leads.length)
}

export interface MergePlan {
  /** Campos a gravar no sobrevivente (só os que mudam). */
  updates: Record<string, unknown>
  /** Ids que serão apagados após re-apontar os vínculos. */
  delete_ids: string[]
}

/**
 * Preenche-vazio: o sobrevivente NUNCA perde dado — só ganha o que não
 * tinha, na ordem de criação dos duplicados (first touch primeiro).
 * Tags são união; notas concatenam; custom_fields não sobrescrevem.
 */
export function planLeadMerge(survivor: DupLead, dupes: DupLead[]): MergePlan {
  const ordered = dupes.slice().sort((a, b) => a.created_at.localeCompare(b.created_at))
  const updates: Record<string, unknown> = {}

  const fillEmpty = (
    field: "email" | "phone" | "company" | "role" | "source" | "converted_to_deal_id",
  ) => {
    if (survivor[field]) return
    const donor = ordered.find((d) => d[field])
    if (donor) updates[field] = donor[field]
  }
  fillEmpty("email")
  fillEmpty("phone")
  fillEmpty("company")
  fillEmpty("role")
  fillEmpty("source")
  fillEmpty("converted_to_deal_id")

  const survivorUtm = survivor.utm ?? {}
  if (Object.keys(survivorUtm).length === 0) {
    const donor = ordered.find((d) => d.utm && Object.keys(d.utm).length > 0)
    if (donor) updates.utm = donor.utm
  }

  const allTags = new Set<string>(survivor.tags ?? [])
  let tagsChanged = false
  for (const d of ordered) {
    for (const t of d.tags ?? []) {
      if (!allTags.has(t)) {
        allTags.add(t)
        tagsChanged = true
      }
    }
  }
  if (tagsChanged) updates.tags = Array.from(allTags)

  const extraNotes = ordered
    .map((d) => d.notes?.trim())
    .filter((n): n is string => !!n && n !== survivor.notes?.trim())
  if (extraNotes.length > 0) {
    updates.notes = [survivor.notes?.trim(), ...extraNotes]
      .filter(Boolean)
      .join("\n---\n")
  }

  const mergedCustom = { ...(survivor.custom_fields ?? {}) }
  let customChanged = false
  for (const d of ordered) {
    for (const [k, v] of Object.entries(d.custom_fields ?? {})) {
      if (!(k in mergedCustom) && v != null && v !== "") {
        mergedCustom[k] = v
        customChanged = true
      }
    }
  }
  if (customChanged) updates.custom_fields = mergedCustom

  // Status: se o sobrevivente é 'new'/'lost' e algum duplicado avançou,
  // herda o avanço — perder "converted" no merge esconderia uma venda.
  const rank: Record<string, number> = { lost: 0, new: 1, unqualified: 1, qualified: 2, converted: 3 }
  const best = [survivor, ...ordered].reduce((acc, l) =>
    (rank[l.status] ?? 0) > (rank[acc.status] ?? 0) ? l : acc,
  )
  if (best.status !== survivor.status) updates.status = best.status

  return { updates, delete_ids: dupes.map((d) => d.id) }
}
