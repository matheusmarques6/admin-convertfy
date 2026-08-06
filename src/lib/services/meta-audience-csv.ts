/**
 * Exportação da carteira de clientes.
 *
 * Dois destinos, dois arquivos diferentes — e a diferença importa:
 *
 * 1. `META` — lista de público personalizado do Meta Ads. A Meta casa a
 *    coluna pelo NOME do cabeçalho (`email`, `phone`, `fn`…), separador
 *    vírgula e **sem BOM**: o marcador de UTF-8 gruda no primeiro
 *    cabeçalho ("﻿email" ≠ "email") e a coluna de e-mail deixa de
 *    ser reconhecida — justo a de maior taxa de correspondência.
 *    Os valores saem normalizados como a documentação pede, porque o
 *    hash é feito em cima do texto: "  Maria@Email.com " e
 *    "maria@email.com" gerariam hashes diferentes e a pessoa não seria
 *    encontrada.
 *
 * 2. `COMPLETO` — planilha para abrir no Excel/Sheets, com todos os
 *    campos em português, separador ";" e BOM (o padrão da casa em
 *    `crm-csv.ts`). Serve para conferência e para outras ferramentas.
 *
 * Módulo puro: sem React, sem I/O.
 */

import { CSV_BOM } from "./crm-csv"

export interface ExportClient {
  id: string
  name: string | null
  email: string | null
  phone: string | null
  company: string | null
  cpf_cnpj?: string | null
  status?: string | null
  created_at?: string | null
  address?: {
    street?: string | null
    number?: string | null
    complement?: string | null
    neighborhood?: string | null
    postal_code?: string | null
    city?: string | null
    state?: string | null
  } | null
}

// ── Normalização exigida pela Meta ───────────────────────────────

/** Minúsculas e sem espaços nas pontas. Vazio vira "". */
export function normEmail(raw: string | null | undefined): string {
  const s = (raw ?? "").trim().toLowerCase()
  // Um endereço sem "@" não é e-mail: mandar lixo só piora a taxa de
  // correspondência que a Meta reporta.
  return s.includes("@") ? s : ""
}

/**
 * Telefone só com dígitos e SEMPRE com código do país — a Meta exige.
 * Números brasileiros são guardados sem o 55 na maioria das vezes
 * (`41996465011`), então completamos: 10 ou 11 dígitos = Brasil.
 * Já com 55 na frente (12–13 dígitos) fica como está.
 */
export function normPhone(raw: string | null | undefined): string {
  let d = (raw ?? "").replace(/\D/g, "")
  if (!d) return ""
  // Zeros de discagem internacional/DDD ("055…", "0 41…").
  d = d.replace(/^0+/, "")
  if (d.length === 10 || d.length === 11) return `55${d}`
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) return d
  // Fora dos formatos conhecidos: só devolve se tiver tamanho plausível
  // para um telefone internacional — senão vira ruído na lista.
  return d.length >= 8 && d.length <= 15 ? d : ""
}

/** Nome/sobrenome: minúsculas, sem pontuação, espaços colapsados. */
export function normName(raw: string | null | undefined): string {
  return (raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[.,;:'"()\d]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

/** Marcadores de razão social — nome de empresa, não de pessoa. */
const COMPANY_MARKERS = new Set([
  "ltda", "me", "epp", "eireli", "sa", "s/a", "mei", "cia", "comercio",
  "servicos", "industria", "holding", "participacoes", "negocios",
])

/**
 * Divide o nome completo em primeiro e último.
 *
 * Conectivos ("de", "da", "dos"…) não são sobrenome sozinhos: em
 * "Lucas de Souza" o sobrenome é "souza".
 *
 * Razão social devolve vazio de propósito: "JMJC NEGOCIOS DIGITAIS
 * LTDA" viraria fn="jmjc" ln="ltda", e a Meta compara esses campos
 * contra nomes de PESSOAS. Mandar razão social ali não ajuda a
 * encontrar ninguém e ainda enfraquece a confiança do casamento — o
 * e-mail e o telefone da empresa continuam valendo normalmente.
 */
export function splitName(full: string | null | undefined): { fn: string; ln: string } {
  const parts = normName(full).split(" ").filter(Boolean)
  if (parts.length === 0) return { fn: "", ln: "" }
  if (parts.some((p) => COMPANY_MARKERS.has(p))) return { fn: "", ln: "" }
  if (parts.length === 1) return { fn: parts[0], ln: "" }
  const connectives = new Set(["de", "da", "do", "das", "dos", "e", "del", "di", "van", "von"])
  let last = parts[parts.length - 1]
  if (connectives.has(last) && parts.length > 2) last = parts[parts.length - 2]
  return { fn: parts[0], ln: last }
}

/** CEP: só dígitos (a Meta ignora o hífen). */
export function normZip(raw: string | null | undefined): string {
  const d = (raw ?? "").replace(/\D/g, "")
  return d.length === 8 ? d : d
}

/** Remove acento (NFD separa a marca; a faixa apaga). */
function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "")
}

/**
 * Cidade e estado: a Meta especifica "somente a-z, minúsculas, sem
 * pontuação, caracteres especiais ou espaços" para estes campos. Manter
 * "São Paulo" faria a comparação falhar contra o "saopaulo" que ela
 * espera — e o campo é usado justamente para desempatar homônimos.
 * Nomes de pessoa (fn/ln) NÃO passam por aqui: ali a Meta aceita UTF-8.
 */
export function normCity(raw: string | null | undefined): string {
  return stripAccents((raw ?? "").trim().toLowerCase()).replace(/[^a-z]/g, "")
}

const UF = new Set([
  "ac", "al", "am", "ap", "ba", "ce", "df", "es", "go", "ma", "mg", "ms", "mt",
  "pa", "pb", "pe", "pi", "pr", "rj", "rn", "ro", "rr", "rs", "sc", "se", "sp", "to",
])

/** Estado: sigla de duas letras minúscula quando reconhecível. */
export function normState(raw: string | null | undefined): string {
  const s = stripAccents((raw ?? "").trim().toLowerCase())
  if (UF.has(s)) return s
  return s.replace(/[^a-z]/g, "")
}

// ── Montagem dos arquivos ────────────────────────────────────────

/** Cabeçalhos que a Meta reconhece automaticamente, nesta ordem. */
export const META_HEADERS = [
  "email",
  "phone",
  "fn",
  "ln",
  "ct",
  "st",
  "zip",
  "country",
  "extern_id",
] as const

/** Escapa para CSV separado por vírgula (padrão da Meta). */
function cell(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n") || value.includes("\r")) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

export interface MetaCsvResult {
  csv: string
  /** Linhas escritas (clientes sem e-mail e sem telefone ficam de fora). */
  rows: number
  /** Clientes descartados por não terem nenhum identificador útil. */
  skipped: number
  withEmail: number
  withPhone: number
}

/**
 * CSV de público personalizado. Só entram clientes com e-mail OU
 * telefone: sem um dos dois a Meta não tem como encontrar a pessoa, e a
 * linha só derrubaria a taxa de correspondência exibida no painel.
 */
export function buildMetaAudienceCsv(clients: ExportClient[]): MetaCsvResult {
  const lines: string[] = [META_HEADERS.join(",")]
  let rows = 0
  let skipped = 0
  let withEmail = 0
  let withPhone = 0

  for (const c of clients) {
    const email = normEmail(c.email)
    const phone = normPhone(c.phone)
    if (!email && !phone) {
      skipped++
      continue
    }
    if (email) withEmail++
    if (phone) withPhone++

    const { fn, ln } = splitName(c.name)
    const addr = c.address ?? {}
    lines.push(
      [
        email,
        phone,
        fn,
        ln,
        normCity(addr.city),
        normState(addr.state),
        normZip(addr.postal_code),
        // País fixo: a carteira é brasileira e o campo em branco reduz
        // a correspondência de CEP/cidade.
        "br",
        c.id,
      ]
        .map(cell)
        .join(","),
    )
    rows++
  }

  // Sem BOM: ver o cabeçalho do arquivo.
  return { csv: lines.join("\r\n"), rows, skipped, withEmail, withPhone }
}

/** Cabeçalhos da planilha completa (mesma ordem do export de cobrança). */
export const FULL_HEADERS = [
  "Identificador externo",
  "Nome",
  "Email",
  "Celular",
  "Empresa",
  "CPF ou CNPJ",
  "Rua",
  "Número",
  "Complemento",
  "Bairro",
  "Cidade",
  "CEP",
  "Estado",
  "Status",
  "Cadastrado em",
] as const

const SEP = ";"

function fullCell(value: unknown): string {
  if (value == null) return ""
  let s = String(value)
  // Neutraliza injeção de fórmula (mesma regra do crm-csv).
  if (/^[=+\-@]/.test(s)) s = `'${s}`
  if (s.includes(SEP) || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

const STATUS_LABEL: Record<string, string> = {
  active: "Ativo",
  prospect: "Prospect",
  churned: "Cancelado",
  paused: "Pausado",
  inactive: "Inativo",
}

/** Planilha completa em português, para Excel/Sheets. */
export function buildFullClientsCsv(clients: ExportClient[]): string {
  const lines = [FULL_HEADERS.join(SEP)]
  for (const c of clients) {
    const a = c.address ?? {}
    lines.push(
      [
        c.id,
        c.name ?? "",
        c.email ?? "",
        c.phone ?? "",
        c.company ?? "",
        c.cpf_cnpj ?? "",
        a.street ?? "",
        a.number ?? "",
        a.complement ?? "",
        a.neighborhood ?? "",
        a.city ?? "",
        a.postal_code ?? "",
        a.state ?? "",
        c.status ? (STATUS_LABEL[c.status] ?? c.status) : "",
        c.created_at ? new Date(c.created_at).toLocaleDateString("pt-BR") : "",
      ]
        .map(fullCell)
        .join(SEP),
    )
  }
  return CSV_BOM + lines.join("\r\n")
}
