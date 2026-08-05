/**
 * Guard de escopo das rotas de conversa do inbox.
 *
 * As rotas `/api/crm/inbox/threads/[id]/*` usam `createAdminClient()`,
 * que ignora RLS de propósito (precisa ler canal, mensagens e perfis em
 * uma query só). Sem uma checagem explícita de organização, qualquer
 * usuário autenticado que descobrisse um UUID de conversa leria — e
 * responderia — a conversa de OUTRA organização. A rota de lista sempre
 * filtrou por `org_id`; as de item, não.
 *
 * Todas elas já carregam `org_id` da thread para outros fins, então a
 * checagem é uma comparação, sem query extra. Devolve 404 (e não 403)
 * de propósito: quem não é da org não deve nem saber que a conversa
 * existe.
 */

import { AppError } from "@/lib/api/errors"

export function assertThreadInOrg(
  threadOrgId: string | null | undefined,
  orgId: string | null | undefined,
): void {
  if (!threadOrgId || !orgId || threadOrgId !== orgId) {
    throw new AppError("Conversa não encontrada", 404, "not-found")
  }
}

/**
 * Sanitiza o termo de busca antes de entrar num filtro `or()` do
 * PostgREST. Vírgula, parênteses, aspas e ponto são SINTAXE ali:
 * buscar por "Silva, João" quebrava a expressão inteira (e um termo
 * malicioso conseguia reescrever o filtro). Trocamos por espaço em vez
 * de escapar — busca é aproximada por natureza, e o resultado continua
 * o esperado pelo usuário.
 */
export function sanitizeSearchTerm(raw: string): string {
  return raw.replace(/[,()"'\\%*.]/g, " ").replace(/\s+/g, " ").trim()
}
