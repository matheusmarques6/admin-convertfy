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
  // O bloco tem copy do n8n e nenhum contrato que diga onde escrevê-la.
  // Reprovar é escolha: antes o email saía com o texto de exemplo da
  // variante, e ninguém percebia.
  merge_sem_contrato: "Bloco com copy e sem contrato — a copy nao tem onde entrar",
  qa_failed: "QA reprovou (issues criticas)",
  // Passo 11: a decisão pediu uma posição que a biblioteca não cobre (o
  // dispositivo pedido está no slot_map e na run `assembler`). Não é falha
  // de agente — é lacuna de curadoria, e a proposta já foi ao vault.
  lacuna_biblioteca: "A biblioteca nao tem anatomia para uma posicao decidida (ver dispositivo pedido)",
  // Dispatch: nenhum bloco com variante montada.
  sem_secao_montada: "Nenhuma secao montada — regerar as references ou curar as variantes",
  // Lint de envio (B2): o id da primeira regra bloqueante vai no reason.
  lint_css_var_em_uso: "Lint: var(--x) no HTML final (Gmail/Outlook ignoram)",
  lint_img_sem_src: "Lint: imagem sem src (icone de imagem quebrada no Outlook)",
  lint_anchor_sem_href: "Lint: link sem destino util",
  lint_texto_de_example: "Lint: texto de exemplo da biblioteca visivel",
  lint_placeholder_colchete: "Lint: placeholder entre colchetes visivel",
  lint_contraste_botao_container: "Lint: label do botao ilegivel sobre o fundo (< 4.5:1)",
  lint_largura_container: "Lint: container fora de 600px",
  qa_timeout: "Timeout no QA",
  max_attempts_exceeded: "Numero maximo de tentativas excedido",
  brand_incomplete: "Loja sem identidade visual completa (cores e/ou logo)",
  store_data_incomplete: "Loja sem dados pra gerar (nicho e/ou produtos)",
}

export function translateFailureReason(reason: string | null | undefined): string {
  if (!reason) return "Erro nao identificado"
  return FAILURE_REASON_LABELS[reason] ?? reason
}
