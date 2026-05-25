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
Monte um email COMPLETO em HTML/CSS inline, responsivo (600px max-width).
OBRIGATÓRIO: retorne o documento completo começando com <!DOCTYPE html> e terminando com </html>.

Regras:
- Use APENAS tabelas para layout (email-safe)
- Todos os estilos INLINE (sem classes CSS, sem <style>)
- Imagens como <img src="URL"> (nunca base64)
- Fonte: use a fonte da marca se disponível, fallback pra Arial
- Cores: use as cores da marca nos CTAs, headlines e acentos
- Mobile: use max-width:100% nas imagens e tabelas
- CTA buttons: padding 15px 32px, border-radius 4px, cor primária da marca
- Footer: fundo escuro (#1F1F1F), texto branco
- Retorne APENAS o HTML completo (<!DOCTYPE html> até </html>), sem markdown, sem explicação.`

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

## HTML de referência (use como base estrutural)
{reference_html}

## Conteúdo editorial completo (se fornecido, use como fonte primária de copy)
{copy_output}

## Blocos estruturais (se conteúdo editorial estiver vazio, use estes)
{blocks_with_content}

## Produtos (dados reais para blocos de produtos)
{top_products}

Se "Conteúdo editorial completo" estiver preenchido, use-o como fonte primária de todo o texto, headlines, CTAs e estrutura do email — transforme o conteúdo semântico (h1, h2, p, a) em HTML email-safe com tabelas e CSS inline. Se estiver vazio, use os Blocos estruturais. APENAS HTML completo (<!DOCTYPE html> até </html>), sem texto antes ou depois.`

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
