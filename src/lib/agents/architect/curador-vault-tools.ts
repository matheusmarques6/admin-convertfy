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
const NOTA_MAX_CHARS = 12_000
const LISTA_MAX = 60

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
    const { data, error } = await admin
      .from(t)
      .select("file_path, body_md")
      .eq("is_active", true)
      .like("file_path", `${pasta}/%`)
      .order("file_path")
      .limit(LISTA_MAX)
    if (error) {
      log.warn("listar_pasta_failed", { tabela: t, pasta, error: error.message })
      continue
    }
    for (const row of (data ?? []) as Array<{ file_path: string; body_md: string }>) {
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
    const { data, error } = await admin
      .from(t)
      .select("file_path, body_md")
      .eq("is_active", true)
      .eq("file_path", caminho)
      .maybeSingle()
    if (error) {
      log.warn("ler_nota_failed", { tabela: t, caminho, error: error.message })
      continue
    }
    const body = (data as { body_md?: string } | null)?.body_md
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
