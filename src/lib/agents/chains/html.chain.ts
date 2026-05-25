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
- Fonte: use a fonte da marca se disponível, fallback pra Arial
- Cores: use as cores da marca nos CTAs, headlines e acentos
- Mobile: use max-width:100% nas imagens e tabelas
- CTA buttons: padding 15px 32px, border-radius 4px, cor primária da marca
- Footer: fundo escuro (#1F1F1F), texto branco
- Retorne APENAS o HTML completo (<!DOCTYPE html> até </html>), sem markdown, sem explicação.

REGRA CRÍTICA sobre imagens:
- Substitua TODOS os placeholders de imagem (IMG_LOGO, IMG_HERO, IMG_PRODUCT, etc.) pelas URLs reais fornecidas.
- Logo da marca: use a URL fornecida em "Logo URL".
- Imagens de produtos: use as URLs reais de "Produtos" (top_products), na ordem: produto 1 → IMG_PRODUCT_1, produto 2 → IMG_PRODUCT_2, etc.
- Hero banner: se não houver URL real, use um placeholder visível (https://placehold.co/600x400/CORHEX/ffffff?text=MARCA).
- Ícones decorativos: use emojis ou caracteres Unicode no lugar de placeholders (ex: 🚚 para shipping, 💬 para suporte, ✨ para destaque).
- Estrelas de avaliação: use ★ e ☆ em texto, não imagens.
- NUNCA deixe src com nomes de arquivo locais (IMG_*.png, IMG_*.jpg).`

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

## Mapa de imagens (substitua cada placeholder pela fonte indicada)
{image_instructions}

Instruções:
1. Use o HTML de referência como BASE ESTRUTURAL (layout, espaçamentos, seções).
2. Substitua a copy pelo conteúdo editorial (se fornecido) ou pelos blocos estruturais.
3. SUBSTITUA todos os placeholders de imagem conforme o mapa acima. Se o mapa estiver vazio, use estas regras:
   - IMG_LOGO* → use {logo_url}
   - IMG_PRODUCT_N → use image_url do produto N dos Produtos acima
   - IMG_HERO* → use placeholder: https://placehold.co/600x400/{primary_color_hex}/ffffff?text={brand_name}
   - IMG_ICON*, IMG_STAR* → use emojis Unicode (🚚 📦 ⭐ etc.)
   - NUNCA deixe src com nomes de arquivo locais (IMG_*.png, IMG_*.jpg).
4. Adapte as cores da referência para as cores da marca ({primary_color}, {secondary_color}).
5. APENAS HTML completo (<!DOCTYPE html> até </html>), sem texto antes ou depois.`

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
