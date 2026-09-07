/**
 * curador-vault-tools — as duas ferramentas de consulta ao Obsidian que o
 * Curador do vault pode chamar sob demanda (02/09).
 *
 * O prompt já leva tudo que o protocolo precisa; o índice de pastas
 * (`<indice_do_vault>`) existe para o modelo conferir UMA nota quando
 * quiser — e cada consulta fica registrada na telemetria
 * (`consultas_ao_vault`). Resolvidas por código contra as 4 tabelas
 * sincronizadas pelo vault-sync, todas com `file_path` relativo à base do
 * vault: `email_vault_docs` (componentes/**), `email_intents`
 * (intencoes/**), `email_structure_refs` (estruturas/**), `email_learnings`
 * (aprendizados/**). Nunca lança: erro vira texto para o modelo.
 */

import { createAdminClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"
import type { ToolSpec } from "./llm-invoke"

const log = logger.child("CuradorVaultTools")

export const VAULT_TOOLS: ToolSpec[] = [
  {
    type: "function",
    function: {
      name: "listar_pasta",
      description:
        "Lista as notas de uma pasta do vault (Obsidian): caminho de cada nota e a primeira linha do corpo. Use o caminho da pasta como aparece em <indice_do_vault>.",
      parameters: {
        type: "object",
        properties: {
          pasta: { type: "string", description: "Caminho da pasta, ex.: componentes/secoes ou estruturas/welcome" },
        },
        required: ["pasta"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "ler_nota",
      description:
        "Devolve o corpo (markdown) de uma nota do vault pelo caminho completo, ex.: componentes/lacunas/offer-sem-isolamento.md.",
      parameters: {
        type: "object",
        properties: {
          caminho: { type: "string", description: "Caminho completo da nota, com .md" },
        },
        required: ["caminho"],
      },
    },
  },
]

const TABELAS = ["email_vault_docs", "email_intents", "email_structure_refs", "email_learnings"] as const
/** A única tabela com nota de variante — as outras não têm `variant_id`. */
const TABELA_COMPONENTES = "email_vault_docs"
const NOTA_MAX_CHARS = 12_000
const LISTA_MAX = 60

interface LinhaDeNota {
  file_path: string
  body_md: string
  kind?: string | null
  variant_id?: string | null
}

/**
 * Quais destes ids estão DESATIVADOS na biblioteca.
 *
 * Incidente 07/09 (Hero Boxers, welcome 1): as duas ferramentas filtravam
 * `is_active` da NOTA (`email_vault_docs`) e nunca da VARIANTE
 * (`email_component_variants`). O Curador leu
 * `componentes/variantes/offer/offer-4-manifesto-antes-do-cupom.md`,
 * escolheu a variante — que está `is_active=false` e por isso fora do
 * catálogo servido — e a escolha morreu em `invalid_ids`. A posição de
 * offer ficou vazia e a peça saiu com 2 de 6 blocos. Bloco que a
 * biblioteca não serve não pode ser escolhível em lugar nenhum.
 *
 * Erro de consulta NÃO esconde nada: sem a checagem, calar o vault inteiro
 * tiraria do Curador a anatomia das 36 variantes boas para proteger contra
 * 4. Serve demais e loga — o parser ainda recusa o id no fim da linha.
 */
async function idsDesativados(
  admin: ReturnType<typeof createAdminClient>,
  ids: Array<string | null | undefined>,
): Promise<Set<string>> {
  const unicos = Array.from(new Set(ids.filter((v): v is string => Boolean(v))))
  if (unicos.length === 0) return new Set()
  const { data, error } = await admin
    .from("email_component_variants")
    .select("id")
    .in("id", unicos)
    .eq("is_active", false)
  if (error) {
    log.warn("variantes_desativadas_check_failed", { error: error.message, ids: unicos.length })
    return new Set()
  }
  return new Set((data ?? []).map((r) => (r as { id: string }).id))
}

/** Nota de variante desativada não é servida. */
function ehVarianteDesativada(row: LinhaDeNota, desativados: Set<string>): boolean {
  return row.kind === "variante" && Boolean(row.variant_id) && desativados.has(row.variant_id as string)
}

function normalizarCaminho(v: unknown): string {
  return String(v ?? "")
    .trim()
    .replace(/^\/+/, "")
    .replace(/\/+$/, "")
}

function primeiraLinha(body: string): string {
  const linha = body
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l && !l.startsWith("---") && !l.startsWith("#"))
  return (linha ?? "").slice(0, 140)
}

export async function listarPasta(pastaCrua: unknown): Promise<string> {
  const pasta = normalizarCaminho(pastaCrua)
  if (!pasta) return "erro: informe a pasta (ex.: componentes/secoes)"
  const admin = createAdminClient()
  const linhas: string[] = []
  for (const t of TABELAS) {
    const componentes = t === TABELA_COMPONENTES
    const { data, error } = await admin
      .from(t)
      .select(componentes ? "file_path, body_md, kind, variant_id" : "file_path, body_md")
      .eq("is_active", true)
      .like("file_path", `${pasta}/%`)
      .order("file_path")
      .limit(LISTA_MAX)
    if (error) {
      log.warn("listar_pasta_failed", { tabela: t, pasta, error: error.message })
      continue
    }
    let rows = (data ?? []) as unknown as LinhaDeNota[]
    if (componentes) {
      const desativados = await idsDesativados(admin, rows.map((r) => r.variant_id))
      const antes = rows.length
      rows = rows.filter((r) => !ehVarianteDesativada(r, desativados))
      if (rows.length !== antes) {
        log.info("listar_pasta_variantes_ocultas", { pasta, ocultas: antes - rows.length })
      }
    }
    for (const row of rows) {
      linhas.push(`- ${row.file_path} — ${primeiraLinha(row.body_md ?? "")}`)
    }
  }
  if (linhas.length === 0) return `(nenhuma nota sincronizada em ${pasta}/)`
  return linhas.slice(0, LISTA_MAX).join("\n")
}

export async function lerNota(caminhoCru: unknown): Promise<string> {
  let caminho = normalizarCaminho(caminhoCru)
  if (!caminho) return "erro: informe o caminho da nota"
  if (!caminho.endsWith(".md")) caminho = `${caminho}.md`
  const admin = createAdminClient()
  for (const t of TABELAS) {
    const componentes = t === TABELA_COMPONENTES
    const { data, error } = await admin
      .from(t)
      .select(componentes ? "file_path, body_md, kind, variant_id" : "file_path, body_md")
      .eq("is_active", true)
      .eq("file_path", caminho)
      .maybeSingle()
    if (error) {
      log.warn("ler_nota_failed", { tabela: t, caminho, error: error.message })
      continue
    }
    const row = data as unknown as LinhaDeNota | null
    if (componentes && row) {
      const desativados = await idsDesativados(admin, [row.variant_id])
      if (ehVarianteDesativada(row, desativados)) {
        // Dizer o MOTIVO, não "não encontrada": assim o modelo sabe que o
        // bloco existe e está fora, em vez de insistir no caminho.
        return `(fora da biblioteca: ${caminho} — esta variante está desativada e NÃO pode ser escolhida; procure outra na mesma seção)`
      }
    }
    const body = row?.body_md
    if (typeof body === "string") {
      const t2 = body.trim()
      return t2.length <= NOTA_MAX_CHARS ? t2 : `${t2.slice(0, NOTA_MAX_CHARS)}\n(… nota truncada)`
    }
  }
  return `(nota não encontrada: ${caminho} — confira o caminho em listar_pasta)`
}

export type ExecutorDeFerramenta = (nome: string, args: Record<string, unknown>) => Promise<string>

/** Despacho por nome. Nome desconhecido vira texto — o modelo lê e segue. */
export const executarFerramentaDoVault: ExecutorDeFerramenta = async (nome, args) => {
  if (nome === "listar_pasta") return listarPasta(args.pasta)
  if (nome === "ler_nota") return lerNota(args.caminho)
  return `erro: ferramenta desconhecida "${nome}"`
}
