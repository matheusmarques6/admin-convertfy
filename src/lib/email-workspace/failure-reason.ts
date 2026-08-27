/**
 * Motivos de falha de geração, em português — módulo PURO, client-safe.
 *
 * Morava dentro de `use-emails-live.ts` ("use client"), então só a lista de
 * emails traduzia. A aba Teste do Estúdio mostrava "Erro na geração" e mais
 * nada — foi assim que o `hero_failed` da Innova (27/08) chegou ao operador
 * como um título vermelho sozinho, com um aviso de brand tolerante embaixo
 * que não tinha relação nenhuma com a causa.
 *
 * Motivo desconhecido volta CRU em vez de virar "erro genérico": o código do
 * banco é mais útil que uma frase vaga, e é ele que se procura no log.
 */

const FAILURE_REASON_LABELS: Record<string, string> = {
  superseded_by_redo: "Substituido por novo batch",
  superseded: "Substituido por geracao mais nova",
  timeout_phase2: "Timeout na fase de render (HTML/imagem)",
  copy_timeout: "Timeout na geracao da copy",
  copy_invalid_output: "Copy gerada nao validou no schema",
  rendering_failed: "Falha ao renderizar HTML/imagem",
  html_failed: "Falha ao gerar o HTML",
  // Cadeia de formatação (split do HTML agent): reason aponta o agente exato.
  hero_failed: "Falha ao montar a hero section",
  text_format_failed: "Falha ao formatar a copy no HTML",
  image_format_failed: "Falha ao posicionar as imagens no HTML",
  qa_failed: "QA reprovou (issues criticas)",
  qa_timeout: "Timeout no QA",
  max_attempts_exceeded: "Numero maximo de tentativas excedido",
  brand_incomplete: "Loja sem identidade visual completa (cores e/ou logo)",
  store_data_incomplete: "Loja sem dados pra gerar (nicho e/ou produtos)",
}

export function translateFailureReason(reason: string | null | undefined): string {
  if (!reason) return "Erro nao identificado"
  return FAILURE_REASON_LABELS[reason] ?? reason
}
