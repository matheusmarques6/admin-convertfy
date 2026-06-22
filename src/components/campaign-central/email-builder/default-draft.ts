/**
 * Utilitário de IDs de bloco do email. Usado pelos services de geração de
 * copy (copy-master, campaign-copy) e pelo callback n8n para garantir um id
 * estável em cada bloco vindo da IA.
 *
 * NOTA: o construtor de email inline (BlockCanvas/EditBlock) e o
 * buildDefaultDraft foram removidos quando o modal de detalhe migrou para 4
 * abas — a geração/edição de copy vive agora no CopyPanel e no workspace.
 */

let counter = 0

export function newBlockId(): string {
  counter += 1
  return `b${counter}_${Math.random().toString(36).slice(2, 6)}`
}
