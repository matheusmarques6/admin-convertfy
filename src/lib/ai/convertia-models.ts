/**
 * Modelos da ConvertIA — todos roteados pelo OpenRouter (ids
 * "vendor/model"). Client-safe: o menu do composer importa daqui.
 *
 * A lista segue os modelos que a casa já usa no pipeline de emails
 * (mesmos slugs da tabela de preços em ai-usage.service). Mudar o
 * default muda só a conversa NOVA — cada conversa grava o próprio
 * modelo no context.
 */

export interface ConvertiaModel {
  id: string
  name: string
  description: string
  tag: string | null
  /**
   * Aceita o parâmetro `reasoning` do OpenRouter (raciocínio estendido,
   * usado no modo Análise profunda). Todos os atuais aceitam via
   * normalização do OpenRouter; modelo futuro sem suporte marca false.
   */
  reasoning: boolean
}

export const CONVERTIA_MODELS: ConvertiaModel[] = [
  {
    id: "anthropic/claude-opus-4.8",
    name: "Claude Opus 4.8",
    description: "Máxima qualidade — análises complexas",
    tag: "padrão",
    reasoning: true,
  },
  {
    id: "anthropic/claude-sonnet-4.6",
    name: "Claude Sonnet 4.6",
    description: "Rápido e capaz — uso diário",
    tag: null,
    reasoning: true,
  },
  {
    id: "openai/gpt-5.3-chat",
    name: "GPT-5.3",
    description: "OpenAI — alternativa geral",
    tag: null,
    reasoning: true,
  },
  {
    id: "google/gemini-2.5-pro",
    name: "Gemini 2.5 Pro",
    description: "Google — contexto longo",
    tag: null,
    reasoning: true,
  },
  {
    id: "moonshotai/kimi-k3",
    name: "Kimi K3",
    description: "Custo baixo — tarefas leves",
    tag: null,
    reasoning: true,
  },
]

export const CONVERTIA_DEFAULT_MODEL = CONVERTIA_MODELS[0].id

export function resolveConvertiaModel(id: string | null | undefined): ConvertiaModel {
  return CONVERTIA_MODELS.find((m) => m.id === id) ?? CONVERTIA_MODELS[0]
}
