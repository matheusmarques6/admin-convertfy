/**
 * Copy Chain — LangChain chain pra geração de copy de email.
 *
 * Usa ChatAnthropic (Claude) pra gerar subject, preheader e copy
 * de cada bloco do email. Retorna JSON parseável via CopyOutputSchema.
 */

import { ChatAnthropic } from "@langchain/anthropic"
import { ChatPromptTemplate } from "@langchain/core/prompts"
import { StringOutputParser } from "@langchain/core/output_parsers"

// ── Default prompts ─────────────────────────────────────────

export const DEFAULT_COPY_SYSTEM_PROMPT = `Você é um copywriter sênior de email marketing para e-commerce brasileiro.
Escreva copy para cada bloco de um email, respeitando EXATAMENTE o tom de voz da marca.

Regras:
- Headlines: máximo 8 palavras, impactantes
- Body: 2-3 frases por bloco, diretas
- CTAs: verbos de ação, máximo 4 palavras
- Preheader: complementa o subject, máximo 90 caracteres
- Subject: máximo 50 caracteres, gera curiosidade
- Use os produtos reais da loja quando o bloco for "products"
- NUNCA use "Clique aqui" como CTA

Responda APENAS com JSON válido no formato especificado.`

export const DEFAULT_COPY_USER_TEMPLATE = `## Marca
Nome: {brand_name}
Slogan: {slogan}
Tom de voz: {tom_voz}
Persona: {persona}
Diferencial: {diferencial}
Restrições: {restricoes}
Posicionamento: {posicionamento}

## Produtos top
{top_products}

## Email: {flow_type} #{email_number}
Objetivo: {objective}
Mensagem: {messaging}

## Estrutura (gere copy para cada bloco)
{blocks_json}

Responda com JSON: {{"subject": "...", "preheader": "...", "blocks": [{{"position": 1, "content": {{...}}}}]}}`

// ── Chain factory ───────────────────────────────────────────

export interface CopyChainConfig {
  model: string
  temperature: number
  max_tokens: number
  system_prompt: string
  user_template: string
}

export function createCopyChain(config: CopyChainConfig) {
  const isOpus = config.model.includes("opus")
  const model = new ChatAnthropic({
    model: config.model,
    ...(isOpus ? {} : { temperature: config.temperature }),
    maxTokens: config.max_tokens,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  })

  const prompt = ChatPromptTemplate.fromMessages([
    ["system", config.system_prompt],
    ["human", config.user_template],
  ])

  return prompt.pipe(model).pipe(new StringOutputParser())
}
