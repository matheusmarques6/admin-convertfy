/**
 * Nomes canonicos dos pipelines CS (o sistema identifica por NAME + scope='cs',
 * ver src/lib/cs-pipelines.ts). Usados pra rotear pipelines especiais para
 * abas dedicadas do modulo Customer Success.
 */
export const CADENCIAS_PIPELINE_NAME = "Cadencias CS"
export const CARTEIRA_PIPELINE_NAME = "Gestao de Carteira"

/**
 * Match tolerante a acento/caixa — em produção o nome pode ter sido
 * salvo como "Gestão de Carteira" (ou editado), e o `===` cru mandava
 * a carteira pro board genérico de deals.
 */
export function isCarteiraPipeline(name: string): boolean {
  return (
    name
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim() === "gestao de carteira"
  )
}
