/**
 * curador-vault — o cérebro do vault de componentes no prompt do Curador
 * (assembler_chooser), épico 31/08/2026.
 *
 * O vault (`All-for-Eficiencia/Admin Convertfy/Emails/componentes/**`,
 * sincronizado pelo vault-sync em `email_vault_docs`) carrega o protocolo
 * de seleção em 9 passos, uma nota de julgamento por variante (com os
 * eixos momento/objecao/registro/paleta/papel-na-peca + exige/peso/
 * convivencia amarrados por `variant_id` ao banco), notas de seção com a
 * chave de desempate, o glossário de requisitos e as regras de
 * convivência. Este módulo:
 *
 *   - carrega as notas ativas (fail-open TOTAL: tabela ausente, sync nunca
 *     rodado ou erro → conhecimento vazio e o Curador segue exatamente
 *     como antes, com os metadados do banco);
 *   - funde os eixos das notas de variante no catálogo do system
 *     (`buildCatalogVaultExtras` → `buildCatalog(…, extras)`), casando por
 *     `variant_id` e, na falta dele, por `nome_no_banco`;
 *   - monta os blocos de prompt: `{{protocolo}}`/`{{convivencias}}`/
 *     `{{requisitos}}` no SYSTEM (conteúdo idêntico entre lojas —
 *     cacheável) e `{{momento}}`/`{{secoes_notas}}`/`{{estruturas_ref}}`
 *     no USER.
 *
 * Builders são PUROS (testáveis); só os `load*` tocam o banco.
 */

import { createAdminClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"
import type { CatalogVaultExtra } from "./catalog-builder"

const log = logger.child("CuradorVault")

// ── Tipos ───────────────────────────────────────────────────────────────

export interface VaultDocRow {
  kind: string
  grupo: string | null
  slug: string
  variant_id: string | null
  frontmatter: Record<string, unknown>
  body_md: string
}

export interface CuradorVaultKnowledge {
  protocolo: VaultDocRow | null
  /** grupo (hero/body/…) → nota de seção. */
  secoes: Map<string, VaultDocRow>
  variantes: VaultDocRow[]
  convivencias: VaultDocRow[]
  requisitos: VaultDocRow[]
  /** `${eixo}/${slug}` → nota (ex.: "momento/welcome-1"). */
  eixos: Map<string, VaultDocRow>
  total: number
}

/**
 * Alavanca do rollout (email_generation_settings.curador_vault_mode):
 *   off    → Curador vivo intocado (kimi + prompt atual; vars do vault
 *            renderizam ausência declarada).
 *   shadow → call vivo intocado + call PARALELO sonnet-4.6 com o protocolo
 *            (run gravada com parsed_output.shadow=true; fase 1 do plano).
 *   on     → flip: o call vivo recebe protocolo + eixos no catálogo.
 */
export type CuradorVaultMode = "off" | "shadow" | "on"

/** Modo do rollout por org da loja. Fail-open TOTAL → 'off'. */
export async function loadCuradorVaultMode(storeId: string): Promise<CuradorVaultMode> {
  try {
    const admin = createAdminClient()
    const { data: store } = await admin
      .from("client_stores")
      .select("org_id")
      .eq("id", storeId)
      .maybeSingle()
    const orgId = (store as { org_id?: string | null } | null)?.org_id
    if (!orgId) return "off"
    const { data, error } = await admin
      .from("email_generation_settings")
      .select("curador_vault_mode")
      .eq("org_id", orgId)
      .maybeSingle()
    if (error) return "off" // coluna/linha ausente (migration 20261093 não aplicada)
    const mode = (data as { curador_vault_mode?: string | null } | null)?.curador_vault_mode
    return mode === "shadow" || mode === "on" ? mode : "off"
  } catch {
    return "off"
  }
}

export function emptyCuradorVaultKnowledge(): CuradorVaultKnowledge {
  return {
    protocolo: null,
    secoes: new Map(),
    variantes: [],
    convivencias: [],
    requisitos: [],
    eixos: new Map(),
    total: 0,
  }
}

/** Indexa as linhas ativas de email_vault_docs (puro). */
export function indexVaultDocs(rows: VaultDocRow[]): CuradorVaultKnowledge {
  const k = emptyCuradorVaultKnowledge()
  for (const r of rows) {
    switch (r.kind) {
      case "protocolo":
        k.protocolo = r
        break
      case "secao":
        if (r.grupo) k.secoes.set(r.grupo, r)
        break
      case "variante":
        k.variantes.push(r)
        break
      case "convivencia":
        k.convivencias.push(r)
        break
      case "requisito":
        k.requisitos.push(r)
        break
      case "eixo":
        if (r.grupo) k.eixos.set(`${r.grupo}/${r.slug}`, r)
        break
      default:
        break
    }
    k.total++
  }
  // Ordem estável (cache do system é endereçado por conteúdo).
  k.variantes.sort((a, b) => a.slug.localeCompare(b.slug))
  k.convivencias.sort((a, b) => a.slug.localeCompare(b.slug))
  k.requisitos.sort((a, b) => a.slug.localeCompare(b.slug))
  return k
}

/**
 * Carrega o conhecimento ativo do vault de componentes. Fail-open: erro
 * (inclusive 42P01 — migration 20261093 não aplicada) devolve vazio.
 */
export async function loadCuradorVaultKnowledge(): Promise<CuradorVaultKnowledge> {
  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from("email_vault_docs")
      .select("kind, grupo, slug, variant_id, frontmatter, body_md")
      .eq("is_active", true)
      .in("kind", ["protocolo", "secao", "variante", "convivencia", "requisito", "eixo"])
    if (error) {
      log.warn("load_failed", { error: error.message })
      return emptyCuradorVaultKnowledge()
    }
    return indexVaultDocs((data ?? []) as VaultDocRow[])
  } catch (err) {
    log.warn("load_threw", { error: err instanceof Error ? err.message : String(err) })
    return emptyCuradorVaultKnowledge()
  }
}

// ── Helpers puros ───────────────────────────────────────────────────────

function clamp(text: string, max: number): string {
  const t = text.trim()
  if (t.length <= max) return t
  return `${t.slice(0, max)}\n(… truncado)`
}

const strArr = (v: unknown): string[] =>
  Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : []

/**
 * `peso: { altura_px: 949, classe: medio, fonte: medido }` chega do parser
 * como STRING crua (o frontmatter simples não parseia objeto inline) —
 * extrai classe e altura por regex.
 */
export function parsePesoRaw(v: unknown): string | null {
  if (typeof v !== "string") return null
  const classe = v.match(/classe:\s*([a-z-]+)/i)?.[1]
  const altura = v.match(/altura_px:\s*(\d+)/i)?.[1]
  if (!classe && !altura) return null
  return [classe, altura ? `${altura}px` : null].filter(Boolean).join(" · ")
}

/**
 * Corta as seções `## …` da nota de variante que interessam ao Curador.
 * Design system e direção fotográfica ficam FORA de propósito — servem aos
 * agentes downstream, não à escolha.
 */
export function extractVariantSections(body: string): {
  descricaoCurta: string
  quandoUsar: string
  quandoNaoUsar: string
} {
  const sections = new Map<string, string>()
  const parts = body.split(/^##\s+/m)
  for (const part of parts.slice(1)) {
    const nl = part.indexOf("\n")
    if (nl < 0) continue
    const title = part.slice(0, nl).trim().toLowerCase()
    sections.set(title, part.slice(nl + 1).trim())
  }
  const get = (...titles: string[]): string => {
    for (const t of titles) {
      const v = sections.get(t)
      if (v) return v
    }
    return ""
  }
  return {
    descricaoCurta: get("descrição curta", "descricao curta"),
    quandoUsar: get("quando usar"),
    quandoNaoUsar: get("quando não usar", "quando nao usar"),
  }
}

// ── Fusão com o catálogo ────────────────────────────────────────────────

/**
 * `variant_id → extras do vault` para o buildCatalog. Casa por
 * `variant_id`; na falta dele, por `nome_no_banco` (case-insensitive)
 * contra o nome da variante no banco.
 */
export function buildCatalogVaultExtras(
  k: CuradorVaultKnowledge,
  variants: Array<{ id: string; name: string }>,
): Map<string, CatalogVaultExtra> {
  const byName = new Map(variants.map((v) => [v.name.trim().toLowerCase(), v.id]))
  const out = new Map<string, CatalogVaultExtra>()
  for (const doc of k.variantes) {
    const fm = doc.frontmatter
    const nomeNoBanco = typeof fm.nome_no_banco === "string" ? fm.nome_no_banco.trim().toLowerCase() : ""
    const id = doc.variant_id ?? (nomeNoBanco ? byName.get(nomeNoBanco) : undefined)
    if (!id) continue
    const prosa = extractVariantSections(doc.body_md)
    out.set(id, {
      slug: doc.slug,
      descricao_curta: clamp(prosa.descricaoCurta, 600) || undefined,
      quando_usar: clamp(prosa.quandoUsar, 1200) || undefined,
      quando_nao_usar: clamp(prosa.quandoNaoUsar, 1200) || undefined,
      momento: strArr(fm.momento),
      momento_vetado: strArr(fm.momento_vetado),
      objecao: strArr(fm.objecao),
      registro: strArr(fm.registro),
      registro_vetado: strArr(fm.registro_vetado),
      paleta: strArr(fm.paleta),
      papel_na_peca: strArr(fm.papel_na_peca),
      exige: strArr(fm.exige),
      peso: parsePesoRaw(fm.peso),
      convivencia: strArr(fm.convivencia),
      itens: typeof fm.itens === "string" ? fm.itens : null,
    })
  }
  return out
}

// ── Blocos de SYSTEM (idênticos entre lojas — cacheáveis) ───────────────

export function buildProtocoloBlock(k: CuradorVaultKnowledge): string {
  if (!k.protocolo) {
    return "(vault de componentes não sincronizado — siga as regras de seleção abaixo e os metadados do catálogo)"
  }
  return clamp(k.protocolo.body_md, 24_000)
}

export function buildConvivenciaBlock(k: CuradorVaultKnowledge): string {
  if (k.convivencias.length === 0) return "(nenhuma regra de convivência registrada)"
  return k.convivencias
    .map((d) => `— ${d.slug}:\n${clamp(d.body_md, 900)}`)
    .join("\n\n")
}

/** Primeiro parágrafo de prosa da nota (pulando headings e vazio). */
function firstParagraph(body: string): string {
  for (const block of body.split(/\n{2,}/)) {
    const t = block.trim()
    if (!t || t.startsWith("#")) continue
    return t.replace(/\s+/g, " ")
  }
  return ""
}

export function buildRequisitosGlossario(k: CuradorVaultKnowledge): string {
  if (k.requisitos.length === 0) return "(glossário de requisitos não sincronizado)"
  return k.requisitos
    .map((d) => `- ${d.slug}: ${clamp(firstParagraph(d.body_md), 240)}`)
    .join("\n")
}

// ── Blocos de USER (por email) ──────────────────────────────────────────

/**
 * flow_type + número → valor do eixo `momento` do vault. Faixas do welcome
 * vêm das notas de eixo (welcome-1 = #1; welcome-meio = #2-4; welcome-tardio
 * = #5+). Flow não mapeado → null (o eixo momento vira neutro no prompt).
 */
export function momentoDoEmail(flowType: string, emailNumber: number): string | null {
  if (flowType === "welcome") {
    if (emailNumber <= 1) return "welcome-1"
    if (emailNumber <= 4) return "welcome-meio"
    return "welcome-tardio"
  }
  const map: Record<string, string> = {
    abandoned_cart: "carrinho-abandonado",
    browse_abandonment: "browse-abandonment",
    site_abandoned: "browse-abandonment",
    upsell: "cross-sell",
    win_back: "reengajamento",
    shipping_stages: "pos-compra",
  }
  return map[flowType] ?? null
}

export function buildMomentoBlock(
  k: CuradorVaultKnowledge,
  flowType: string,
  emailNumber: number,
): string {
  const momento = momentoDoEmail(flowType, emailNumber)
  if (!momento) {
    return `(momento não mapeado para o flow "${flowType}" — trate o eixo momento como neutro; aplique momento_vetado apenas quando o veto citar literalmente este flow)`
  }
  const nota = k.eixos.get(`momento/${momento}`)
  if (!nota) return momento
  return `${momento}\n\n${clamp(nota.body_md, 1_800)}`
}

export function buildSecaoNotasBlock(
  k: CuradorVaultKnowledge,
  sections: string[],
): string {
  const distintas = Array.from(new Set(sections))
  const blocos: string[] = []
  for (const s of distintas) {
    const nota = k.secoes.get(s)
    if (!nota) continue
    blocos.push(`## Seção ${s}\n${clamp(nota.body_md, 5_000)}`)
  }
  if (blocos.length === 0) {
    return "(sem notas de seção no vault para as seções deste email)"
  }
  return blocos.join("\n\n")
}

// ── Estruturas de referência (passo 2 do protocolo) ─────────────────────

export interface EstruturaRefResumo {
  slug: string
  loja: string | null
  escopo: string | null
  emails: number[]
  secoes: string[]
}

/** Render compacto: uma linha por referência do flow (puro). */
export function buildEstruturasRefResumo(refs: EstruturaRefResumo[]): string {
  if (refs.length === 0) return "(nenhuma estrutura de referência catalogada para este flow)"
  return refs
    .slice(0, 15)
    .map((r) => {
      const origem = r.loja ?? r.escopo ?? "?"
      const emails = r.emails.length > 0 ? ` [emails ${r.emails.join(",")}]` : ""
      return `- ${r.slug} (${origem})${emails}: ${r.secoes.join(" → ")}`
    })
    .join("\n")
}

// ── Aprendizados (fase 1 — user do shadow/flip) ─────────────────────────

export interface AprendizadoResumo {
  slug: string
  body: string
}

export function buildAprendizadosBlock(aprendizados: AprendizadoResumo[]): string {
  if (aprendizados.length === 0) return "(nenhum aprendizado catalogado para este flow)"
  return aprendizados
    .slice(0, 25)
    .map((a) => `— ${a.slug}:\n${clamp(a.body, 1_200)}`)
    .join("\n\n")
}

/** email_learnings do flow + globais com `aplica_a` (fail-open → []). */
export async function loadAprendizadosResumo(flowType: string): Promise<AprendizadoResumo[]> {
  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from("email_learnings")
      .select("slug, body_md, flow_type, aplica_a")
      .eq("is_active", true)
      .or(`flow_type.eq.${flowType},flow_type.is.null`)
      .order("slug")
    if (error) {
      log.warn("aprendizados_load_failed", { flowType, error: error.message })
      return []
    }
    return (data ?? [])
      .filter((r) => {
        if (r.flow_type === flowType) return true
        const aplica = Array.isArray(r.aplica_a) ? (r.aplica_a as string[]) : []
        return aplica.length === 0 || aplica.includes(flowType)
      })
      .map((r) => ({ slug: r.slug as string, body: (r.body_md as string) ?? "" }))
  } catch (err) {
    log.warn("aprendizados_load_threw", { flowType, error: err instanceof Error ? err.message : String(err) })
    return []
  }
}

// ── Contagem de uso por variante (desempate por menor uso) ──────────────

/**
 * Contagem agregada de escolhas por variant_id sobre as últimas linhas de
 * email_generation_choices (fail-open → mapa vazio). Aproximação suficiente
 * para rotação de criativo — o objetivo é "menos usada primeiro", não BI.
 */
export async function loadVariantUsageCounts(limitRows = 500): Promise<Map<string, number>> {
  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from("email_generation_choices")
      .select("choices")
      .order("created_at", { ascending: false })
      .limit(limitRows)
    if (error) {
      log.warn("usage_load_failed", { error: error.message })
      return new Map()
    }
    const counts = new Map<string, number>()
    for (const row of data ?? []) {
      const choices = Array.isArray(row.choices) ? row.choices : []
      for (const c of choices as Array<{ variant_id?: string }>) {
        if (c?.variant_id) counts.set(c.variant_id, (counts.get(c.variant_id) ?? 0) + 1)
      }
    }
    return counts
  } catch (err) {
    log.warn("usage_load_threw", { error: err instanceof Error ? err.message : String(err) })
    return new Map()
  }
}

/** Bloco `<uso_por_variante>` da memória — slug do vault quando existir. */
export function renderUsageCounts(
  counts: Map<string, number>,
  extras?: Map<string, { slug: string }>,
): string {
  if (counts.size === 0) return "<uso_por_variante>\n(sem histórico de uso ainda)\n</uso_por_variante>"
  const linhas = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 60)
    .map(([id, n]) => `- ${extras?.get(id)?.slug ?? id}: ${n}×`)
  return `<uso_por_variante>\nPeças já montadas por variante (desempate: a MENOS usada vence em empate total):\n${linhas.join("\n")}\n</uso_por_variante>`
}

/** Carrega as referências ativas do flow (fail-open → lista vazia). */
export async function loadEstruturaRefsResumo(flowType: string): Promise<EstruturaRefResumo[]> {
  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from("email_structure_refs")
      .select("slug, loja, escopo, emails, secoes_normalizadas")
      .eq("flow_type", flowType)
      .eq("is_active", true)
      .order("slug")
    if (error) {
      log.warn("refs_load_failed", { flowType, error: error.message })
      return []
    }
    return (data ?? []).map((r) => ({
      slug: r.slug as string,
      loja: (r.loja as string | null) ?? null,
      escopo: (r.escopo as string | null) ?? null,
      emails: Array.isArray(r.emails) ? (r.emails as number[]) : [],
      secoes: Array.isArray(r.secoes_normalizadas) ? (r.secoes_normalizadas as string[]) : [],
    }))
  } catch (err) {
    log.warn("refs_load_threw", { flowType, error: err instanceof Error ? err.message : String(err) })
    return []
  }
}
