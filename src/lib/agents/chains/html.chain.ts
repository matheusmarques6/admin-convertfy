/**
 * HTML Chain — LangChain chain pra montagem de HTML de email.
 *
 * Recebe blocos com copy preenchida e gera HTML email-safe completo
 * usando tabelas, CSS inline e responsividade.
 */

import { ChatAnthropic } from "@langchain/anthropic"
import { ChatPromptTemplate } from "@langchain/core/prompts"
import { StringOutputParser } from "@langchain/core/output_parsers"

// ── Default prompts ─────────────────────────────────────────

export const DEFAULT_HTML_SYSTEM_PROMPT = `Você é um especialista em email HTML para e-commerce.
Monte um email completo em HTML/CSS inline, responsivo (600px max-width).

Regras:
- Use APENAS tabelas para layout (email-safe)
- Todos os estilos INLINE (sem classes CSS, sem <style>)
- Imagens como <img src="URL"> (nunca base64)
- Fonte: use a fonte da marca se disponível, fallback pra Arial
- Cores: use as cores da marca nos CTAs, headlines e acentos
- Mobile: use max-width:100% nas imagens e tabelas
- CTA buttons: padding 15px 32px, border-radius 4px, cor primária da marca
- Footer: fundo escuro (#1F1F1F), texto branco
- Retorne APENAS o HTML completo (doctype até </html>), sem markdown, sem explicação.`

export const DEFAULT_HTML_USER_TEMPLATE = `## Marca
Nome: {brand_name}
Logo URL: {logo_url}
Cor primária: {primary_color}
Cor secundária: {secondary_color}
Fonte heading: {font_heading}
Fonte body: {font_body}

## Email: {email_name}
Subject: {subject}
Preheader: {preheader}

## HTML de referência (use como base estrutural, adapte o conteúdo)
{reference_html}

## Blocos (renderize nesta ordem)
{blocks_with_content}

## Produtos (use estes dados reais quando bloco for products)
{top_products}

Gere o HTML completo do email baseado na estrutura de referência acima, substituindo o conteúdo pelos blocos fornecidos. APENAS HTML, sem texto antes ou depois.`

// ── Chain factory ───────────────────────────────────────────

export interface HtmlChainConfig {
  model: string
  temperature: number
  max_tokens: number
  system_prompt: string
  user_template: string
}

export function createHtmlChain(config: HtmlChainConfig) {
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
