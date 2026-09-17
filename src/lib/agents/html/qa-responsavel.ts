/**
 * Quem corrige cada issue do QA, e o filtro de claims que a DECISÃO cobre
 * (Passo 15, 14/09). Módulo PURO.
 *
 * Medido no batch 6249aef2: o QA reprovou "Shopify PCI" e "testemunhos do
 * site" como `claim_nao_coberto` — os dois estavam em `insumos_permitidos`,
 * verificados pelo Seletor, e o QA nunca recebeu a decisão. E nenhuma das
 * issues dizia de quem era: uma issue sem dono não vira correção.
 *
 * A tabela é EXAUSTIVA por tipo (o `Record<QaIssueType, …>` obriga uma
 * entrada por valor da união — tipo novo sem dono reprova no typecheck, e
 * o teste confere o mesmo em runtime). Aplicada UMA vez, sobre a lista
 * final do runner, para checks antigos e do LLM passarem pela mesma régua.
 */

import type { NoResponsavelQa, QaIssue, QaIssueType } from "@/types/email-generation"

import type { NoResponsavel } from "../shared/conformidade"
import { normalizeForMatch } from "./anchor-match"

export const RESPONSAVEL_POR_TIPO: Readonly<Record<QaIssueType, NoResponsavelQa>> = {
  // LLM — julgamento de conteúdo
  spam_score_alto: "copy",
  links_quebrados: "formatacao",
  blocos_vazios: "copy",
  tom_inconsistente: "copy",
  claim_nao_coberto: "copy",
  html_invalido: "formatacao",
  qa_indisponivel: "sistema",
  alt_text_faltando: "formatacao",
  compliance: "copy",
  contraste_baixo: "formatacao",
  hero_copy_perdida: "formatacao",
  hero_copy_inventada: "formatacao",
  image_nicho_mismatch: "imagem",
  image_paleta_off: "imagem",
  image_overlay_reserva_ausente: "imagem",
  image_cena_inadequada: "imagem",
  copy_excede_max_len: "copy",
  campo_obrigatorio_vazio: "copy",
  // Checks de conteúdo por código
  oferta_sem_incentivo: "copy",
  placeholder_colchetes: "biblioteca",
  texto_de_exemplo: "biblioteca",
  paragrafo_repetido: "copy",
  codigo_inventado: "copy",
  label_generico: "biblioteca",
  // Régua retórica e mecânica do cupom: quem escreve é quem conserta.
  padrao_editorial: "copy",
  assunto_comeca_pelo_codigo: "copy",
  preheader_repete_o_assunto: "copy",
  mecanica_do_incentivo_ausente: "copy",
  link_sem_endereco: "biblioteca",
  // Validador textual do contrato
  contrato_oferta_sem_incentivo: "copy",
  contrato_percentual_diverge: "copy",
  contrato_codigo_diverge: "copy",
  contrato_urgencia_artificial: "copy",
  // Passo 15/16
  posicao_sem_variante: "biblioteca",
  traducao_faltante: "loja",
  cupom_inexistente_na_plataforma: "loja",
  // 17/09: o example do schema divergiu do HTML da variante — cadastro.
  campo_sem_lugar: "biblioteca",
}

/** Preenche `no_responsavel` sem sobrescrever o que o produtor já disse. */
export function atribuirResponsavel(issue: QaIssue): QaIssue {
  if (issue.no_responsavel) return issue
  const dono = RESPONSAVEL_POR_TIPO[issue.type] ?? "sistema"
  return { ...issue, no_responsavel: dono }
}

export function atribuirResponsaveis(issues: ReadonlyArray<QaIssue>): QaIssue[] {
  return issues.map(atribuirResponsavel)
}

/**
 * Tradução para o painel de Conformidade (B6), que nomeia FRONTEIRAS entre
 * agentes. Só o que tem correspondente; o resto é `null` (a conformidade
 * mede decisão × entrega, não formatação nem loja).
 */
export function mapearParaConformidade(no: NoResponsavelQa): NoResponsavel | null {
  switch (no) {
    case "curador":
      return "assembler_chooser"
    case "biblioteca":
      return "assembler"
    case "copy":
      return "copy"
    default:
      return null
  }
}

export interface CoberturaDeClaims {
  /** `DecisaoDoEmail.insumos_permitidos` — fatos que o Seletor verificou. */
  insumosPermitidos?: ReadonlyArray<string> | null
  /** Nomes dos produtos da tabela viva. */
  topProducts?: ReadonlyArray<{ name?: string | null }> | null
}

const PALAVRA_MIN = 4
const STOPWORDS = new Set([
  "the", "and", "for", "with", "from", "that", "this", "your", "you", "our", "are", "not",
  "para", "com", "que", "uma", "dos", "das", "por", "sem", "nao", "não", "loja", "site", "store",
])

/** Palavras "de conteúdo" de um texto normalizado (sem acento/caixa). */
function palavras(texto: string): string[] {
  return normalizeForMatch(texto)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9%]+/)
    .filter((w) => w.length >= PALAVRA_MIN && !STOPWORDS.has(w))
}

/**
 * A issue fala de algo que a decisão COBRE?
 *
 * Régua: a issue (mensagem + evidência) e o insumo compartilham ao menos
 * duas palavras de conteúdo, ou o nome inteiro de um produto aparece na
 * issue. Duas palavras porque UMA ("shopify") casaria com qualquer insumo
 * que mencione a plataforma; o nome do produto inteiro porque "boxer"
 * sozinho é categoria, não produto.
 */
export function claimCoberto(issue: Pick<QaIssue, "message" | "evidence">, cobertura: CoberturaDeClaims): string | null {
  const alvo = `${issue.message ?? ""} ${issue.evidence ?? ""}`
  const alvoNorm = ` ${palavras(alvo).join(" ")} `
  const alvoSet = new Set(palavras(alvo))
  for (const p of cobertura.topProducts ?? []) {
    const nome = (p?.name ?? "").trim()
    if (!nome) continue
    const nomeNorm = palavras(nome).join(" ")
    if (nomeNorm && alvoNorm.includes(` ${nomeNorm} `)) return nome
  }
  for (const insumo of cobertura.insumosPermitidos ?? []) {
    const ws = palavras(insumo)
    if (ws.length === 0) continue
    const comuns = ws.filter((w) => alvoSet.has(w))
    const minimo = Math.min(2, ws.length)
    if (comuns.length >= minimo) return insumo
  }
  return null
}

export interface ClaimFiltrada {
  message: string
  coberto_por: string
}

/**
 * Tira da lista as `claim_nao_coberto` que a decisão cobre. Só esse tipo:
 * um `compliance` sobre garantia de saúde não vira legítimo por estar nos
 * insumos. As filtradas voltam nomeadas para a telemetria — descarte em
 * silêncio é o mesmo que não ter filtrado.
 */
export function filtrarClaimsCobertos(
  issues: ReadonlyArray<QaIssue>,
  cobertura: CoberturaDeClaims,
): { issues: QaIssue[]; filtradas: ClaimFiltrada[] } {
  const semCobertura = !(cobertura.insumosPermitidos?.length || cobertura.topProducts?.length)
  if (semCobertura) return { issues: [...issues], filtradas: [] }
  const filtradas: ClaimFiltrada[] = []
  const mantidas: QaIssue[] = []
  for (const i of issues) {
    if (i.type !== "claim_nao_coberto") {
      mantidas.push(i)
      continue
    }
    const por = claimCoberto(i, cobertura)
    if (por) filtradas.push({ message: i.message, coberto_por: por })
    else mantidas.push(i)
  }
  return { issues: mantidas, filtradas }
}
