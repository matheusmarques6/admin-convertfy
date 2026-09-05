/**
 * Acesso a dados do módulo Conteúdo — a ÚNICA porta de leitura/escrita.
 *
 * Hoje: dashboard vem do mock; documentos, brand kits, templates do time e
 * agenda persistem em localStorage (semeados do mock na primeira abertura).
 * Amanhã: trocar as funções daqui por chamadas a rotas/Supabase. Nenhum
 * componente importa `mock/*` diretamente.
 */

import { BRAND_KIT_PADRAO, CT_PERFIS } from "./brand"
import { ST_TEMPLATES } from "./templates"
import type {
  AgendaItem,
  BrandKit,
  DashboardData,
  Documento,
  LeadDoPost,
  MeuTemplate,
  PerfilEditavel,
  PerfilFiltro,
  Post,
  Prova,
  Template,
} from "./types"
import * as M from "./mock/dashboard"
import * as E from "./mock/estudio"
import type { PromptPronto } from "./mock/estudio"

// ── Armazenamento local ─────────────────────────────────────────────────

const KEYS = {
  documentos: "conteudo:documentos:v1",
  brandKits: "conteudo:brandkits:v1",
  meusTemplates: "conteudo:meus-templates:v1",
  agenda: "conteudo:agenda:v1",
} as const

function storage(): Storage | null {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null
    return window.localStorage
  } catch {
    return null
  }
}

function ler<T>(key: string): T | null {
  const s = storage()
  if (!s) return null
  try {
    const raw = s.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

export class QuotaExcedidaError extends Error {
  constructor() {
    super("Sem espaço no armazenamento local do navegador. Remova imagens grandes ou carrosséis antigos.")
    this.name = "QuotaExcedidaError"
  }
}

function gravar(key: string, valor: unknown): void {
  const s = storage()
  if (!s) return
  try {
    s.setItem(key, JSON.stringify(valor))
  } catch (e) {
    const nome = (e as { name?: string })?.name ?? ""
    if (/quota/i.test(nome) || /quota/i.test(String(e))) throw new QuotaExcedidaError()
    throw e
  }
}

// Cache em memória para o fallback sem localStorage (SSR/tests) e para
// evitar JSON.parse a cada leitura.
const mem: { documentos?: Documento[]; brandKits?: Record<PerfilEditavel, BrandKit>; meusTemplates?: MeuTemplate[]; agenda?: AgendaEntrada[] } = {}

const espera = (ms = 120) => new Promise<void>((r) => setTimeout(r, ms))

// ── Dashboard ───────────────────────────────────────────────────────────

export interface PeriodoQuery {
  start: string
  end: string
}

function postsDoPerfil(perfil: PerfilFiltro): Post[] {
  if (perfil === "consolidado") return M.CT_POSTS
  if (perfil === "instagram") return M.CT_POSTS.filter((p) => p.perfil !== "youtube")
  return M.CT_POSTS.filter((p) => p.perfil === perfil)
}

/**
 * Dados do dashboard para um perfil e período. Simula latência de rede
 * para os estados de carregamento serem reais na UI.
 */
export async function getDashboard(perfil: PerfilFiltro, _periodo?: PeriodoQuery): Promise<DashboardData> {
  await espera(260)
  const posts = postsDoPerfil(perfil)
  const yt = perfil === "youtube"
  const kpis = yt ? M.CT_KPIS.yt : M.CT_KPIS.ig
  const comentarios = posts.reduce((a, p) => a + p.com, 0)
  const alcance = posts.reduce((a, p) => a + p.alc, 0)
  const leads = posts.reduce((a, p) => a + p.leads, 0)
  const clientes = M.CT_FUNIL[5].valor
  const receita = yt ? 6950 : 41700
  return {
    perfil,
    kpis,
    serieSeguidores: M.CT_SEG_SERIE,
    posts,
    funil: M.CT_FUNIL,
    pilarMix: M.CT_PILAR_MIX,
    cadencia: M.CT_CADENCIA,
    slots: M.CT_SLOTS,
    moldes: M.CT_MOLDES,
    derivados: {
      postsPublicados: posts.length,
      comentariosChave: comentarios,
      alcanceParaLead: alcance > 0 ? (leads / alcance) * 100 : 0,
      cplOrganico: 148,
      ticketMedio: clientes > 0 ? Math.round(receita / clientes) : 0,
      diasComentarioFechamento: 19,
    },
    sincronizadoEm: M.CT_SINCRONIZADO_EM,
  }
}

export async function getPosts(perfil: PerfilFiltro = "consolidado"): Promise<Post[]> {
  await espera(60)
  return postsDoPerfil(perfil)
}

export async function getLeadsDoPost(_postId: string): Promise<LeadDoPost[]> {
  await espera(40)
  return M.CT_LEADS_DO_POST
}

export function getEstruturaTurbo() {
  return M.CT_ESTRUTURA_TURBO
}

export function getProvas(): Prova[] {
  return M.CT_PROVAS
}

export function getLegendaExemplo(): string {
  return M.CT_LEGENDA
}

export function getPerfil(id: PerfilFiltro) {
  if (id === "instagram") return { id: "instagram" as const, nome: "Instagram", cor: "#4E62D8", canal: "instagram" as const }
  return CT_PERFIS[id]
}

// ── Estúdio: templates ──────────────────────────────────────────────────

export async function getTemplates(): Promise<Template[]> {
  return ST_TEMPLATES
}

export function getPromptsProntos(): PromptPronto[] {
  return E.ST_PROMPTS_IA
}

export function getSugestoesImagem(frameId: string): string[] {
  return E.ST_SUGESTOES_IMG(frameId)
}

export function imagemBanco(seed: string) {
  return E.stImg(E.ST_IMG(seed))
}

export async function getMeusTemplates(): Promise<MeuTemplate[]> {
  if (!mem.meusTemplates) {
    mem.meusTemplates = ler<MeuTemplate[]>(KEYS.meusTemplates) ?? E.meusTemplatesIniciais()
  }
  return mem.meusTemplates
}

export async function saveMeuTemplate(t: MeuTemplate): Promise<MeuTemplate[]> {
  const lista = await getMeusTemplates()
  const i = lista.findIndex((x) => x.id === t.id)
  const nova = i >= 0 ? lista.map((x) => (x.id === t.id ? t : x)) : [t, ...lista]
  mem.meusTemplates = nova
  gravar(KEYS.meusTemplates, nova)
  return nova
}

// ── Estúdio: documentos ─────────────────────────────────────────────────

export async function getDocumentos(): Promise<Documento[]> {
  if (!mem.documentos) {
    const salvos = ler<Documento[]>(KEYS.documentos)
    mem.documentos = salvos ?? E.bibliotecaInicial()
    if (!salvos) gravar(KEYS.documentos, mem.documentos)
  }
  return mem.documentos
}

export async function getDocumento(id: string): Promise<Documento | null> {
  const docs = await getDocumentos()
  return docs.find((d) => d.id === id) ?? null
}

/** Grava (upsert) e devolve a lista atualizada. Lança QuotaExcedidaError. */
export async function saveDocumento(doc: Documento): Promise<Documento[]> {
  const docs = await getDocumentos()
  const atualizado = { ...doc, atualizadoEm: new Date().toISOString() }
  const i = docs.findIndex((d) => d.id === doc.id)
  const nova = i >= 0 ? docs.map((d) => (d.id === doc.id ? atualizado : d)) : [atualizado, ...docs]
  mem.documentos = nova
  gravar(KEYS.documentos, nova)
  return nova
}

export async function deleteDocumento(id: string): Promise<Documento[]> {
  const docs = await getDocumentos()
  const nova = docs.filter((d) => d.id !== id)
  mem.documentos = nova
  gravar(KEYS.documentos, nova)
  return nova
}

/** Documento demo com textos completos (referência de prévias e fallback da IA). */
export function getDocumentoReferencia(): Documento {
  return E.DOC_REFERENCIA()
}

export function getEstruturaInspiracaoFallback() {
  return E.ESTRUTURA_INSPIRACAO_FALLBACK
}

// ── Brand kits por perfil ───────────────────────────────────────────────

export async function getBrandKits(): Promise<Record<PerfilEditavel, BrandKit>> {
  if (!mem.brandKits) {
    const salvos = ler<Record<PerfilEditavel, BrandKit>>(KEYS.brandKits)
    mem.brandKits = salvos ?? { convertfy: { ...BRAND_KIT_PADRAO.convertfy }, bruno: { ...BRAND_KIT_PADRAO.bruno } }
  }
  return mem.brandKits
}

export async function saveBrandKit(perfil: PerfilEditavel, kit: BrandKit): Promise<Record<PerfilEditavel, BrandKit>> {
  const atual = await getBrandKits()
  const novo = { ...atual, [perfil]: kit }
  mem.brandKits = novo
  gravar(KEYS.brandKits, novo)
  return novo
}

// ── Agenda (Calendário) ─────────────────────────────────────────────────

export interface AgendaEntrada extends AgendaItem {
  id: string
  nome: string
  criadoEm: string
}

export async function getAgenda(): Promise<AgendaEntrada[]> {
  if (!mem.agenda) mem.agenda = ler<AgendaEntrada[]>(KEYS.agenda) ?? []
  return mem.agenda
}

export async function addAgenda(entrada: AgendaEntrada): Promise<AgendaEntrada[]> {
  const lista = await getAgenda()
  const nova = [...lista.filter((x) => x.id !== entrada.id), entrada]
  mem.agenda = nova
  gravar(KEYS.agenda, nova)
  return nova
}

/** Limpa o cache em memória (testes). */
export function _resetCache() {
  delete mem.documentos
  delete mem.brandKits
  delete mem.meusTemplates
  delete mem.agenda
}
