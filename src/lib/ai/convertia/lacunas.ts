/**
 * Lacuna da base — a pergunta que a ConvertIA não conseguiu responder pela
 * base de conhecimento (ou pelas transcrições).
 *
 * O problema que isto resolve: quando `conhecimento_buscar` devolve zero, o
 * modelo responde de memória e o furo some. Com um advisor ligado é pior —
 * a resposta sem lastro sai com a autoridade dele.
 *
 * Duas metades, e a segunda é a que importa:
 *   1. `registrarLacuna` guarda a pergunta (vira pauta do vault);
 *   2. `TEXTO_SEM_RESULTADO` instrui o modelo a DIZER que não achou, em vez
 *      de preencher o vazio.
 *
 * Registrar é fail-open: nunca derruba a tool que estava respondendo.
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import { logger } from "@/lib/logger"

const log = logger.child("ConvertiaLacunas")

export type FonteLacuna = "conhecimento" | "transcricoes"

/**
 * PURA. Chave de dedupe: minúsculas, sem acento, sem pontuação de borda,
 * espaços colapsados. Sem isso "Como aumentar a lista?" e "como aumentar a
 * lista" viram duas lacunas, e a frequência — que é o que ordena a pauta —
 * deixa de significar qualquer coisa.
 */
export function normalizarConsulta(q: string): string {
  return q
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300)
}

/**
 * Instrução devolvida ao modelo quando a base não tem nada. É texto de
 * COMPORTAMENTO, não só de resultado: "0 resultados" sozinho ele interpreta
 * como "posso responder do que eu sei".
 */
export function textoSemResultado(fonte: FonteLacuna, query: string): string {
  const onde =
    fonte === "conhecimento" ? "a base de conhecimento da Convertfy" : "as transcrições marcadas na base"
  return (
    `Nenhum resultado em ${onde} para "${query}".\n\n` +
    `IMPORTANTE: isto NÃO autoriza responder de memória. ${
      fonte === "conhecimento"
        ? "Antes de desistir, tente conhecimento_listar para ver a árvore e conhecimento_buscar com outras palavras (o corpus mistura português e inglês: 'form'/'opt-in', 'sunset', 'browse abandon'). "
        : ""
    }` +
    `Se ainda assim não houver nota, DIGA ao usuário que a base não cobre esse assunto e responda, se responder, deixando claro que é conhecimento geral e não o método da casa. A lacuna foi registrada.`
  )
}

/** Aviso quando só o léxico rodou — a busca semântica está fora do ar. */
export const TEXTO_SEM_SEMANTICA =
  "(Só a busca por palavras rodou: a busca por significado está indisponível. Se o resultado parecer pobre, tente sinônimos ou conhecimento_listar.)"

const MISSING = new Set(["42P01", "PGRST202", "PGRST205", "42883"])

/**
 * Registra a lacuna. Fail-open por construção: a tool que chama já está
 * respondendo ao usuário, e uma falha de telemetria não pode virar erro de
 * ferramenta.
 */
export async function registrarLacuna(
  admin: SupabaseClient,
  params: { orgId: string; fonte: FonteLacuna; query: string; conversaId?: string | null },
): Promise<void> {
  const normalizada = normalizarConsulta(params.query)
  // Menos de 2 caracteres não é pergunta; registrar viraria lixo na pauta.
  if (normalizada.length < 2 || !params.orgId) return
  try {
    const { error } = await admin.rpc("convertia_registrar_lacuna", {
      p_org_id: params.orgId,
      p_fonte: params.fonte,
      p_consulta_normalizada: normalizada,
      p_consulta_original: params.query.slice(0, 300),
      p_conversa_id: params.conversaId ?? null,
    })
    if (error && !MISSING.has(error.code ?? "")) {
      log.warn("lacuna não registrada", { error: error.message, fonte: params.fonte })
    }
  } catch (err) {
    log.warn("lacuna não registrada", { error: err instanceof Error ? err.message : String(err) })
  }
}
